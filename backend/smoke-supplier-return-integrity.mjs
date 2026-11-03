const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (expected !== undefined) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  } else {
    assert(response.ok, `${method} ${path}: HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, data };
}

async function register(phone, name) {
  const result = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'SupplierReturn2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

async function productById(token, id) {
  const rows = (await call('/products', { token, expected: 200 })).data;
  const product = rows.find((row) => Number(row.id) === Number(id));
  assert(product, `Product ${id} missing`);
  return product;
}

const a = await register('0966889941', 'Supplier Return Tenant A');
const b = await register('0966889942', 'Supplier Return Tenant B');

const branches = (await call('/branches', { token: a.token, expected: 200 })).data;
const branch = branches.find((row) => Number(row.is_default) === 1) || branches[0];
assert(branch?.id, 'Supplier return smoke requires default branch');

const productCreated = await call('/products', {
  token: a.token,
  method: 'POST',
  body: {
    name: 'Supplier Return Server Value Product',
    sku: `SUP-RET-${Date.now()}`,
    price: 120000,
    cost_price: 50000,
    stock: 10,
    category: 'Smoke',
  },
  expected: 200,
});
const productId = Number(productCreated.data?.id);
assert(productId > 0, 'Supplier return product missing id');

const supplierCreated = await call('/suppliers', {
  token: a.token,
  method: 'POST',
  body: { name: 'NCC Supplier Return Smoke', phone: '02866889941', tax_code: `SMOKE-SRET-${Date.now()}` },
  expected: 200,
});
const supplierId = Number(supplierCreated.data?.id);
assert(supplierId > 0, 'Supplier return supplier missing id');

// Create recorded supplier debt and server-side weighted cost through the hardened receive flow.
const request = await call('/supplier-orders/requests', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: supplierId,
    branch_id: branch.id,
    items: [{ product_id: productId, quantity: 4, cost_price: 75000 }],
    note: 'Seed payable for supplier return smoke',
  },
  expected: 200,
});
const requestId = Number(request.data?.id);
assert(requestId > 0, 'Supplier return seed request missing');

const received = await call(`/supplier-orders/requests/${requestId}/nhan-hang`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 0 },
  expected: 200,
});
assert(Number(received.data?.total_amount) === 300000 && Number(received.data?.con_no) === 300000,
  `Seed receive mismatch: ${JSON.stringify(received.data)}`);

let product = await productById(a.token, productId);
assert(Number(product.stock) === 14, `Seed receive stock expected 14, got ${product.stock}`);
assert(Number(product.cost_price) === 57143, `Seed weighted cost expected 57143, got ${product.cost_price}`);

// Cross-tenant branch/product/supplier must fail before any mutation.
await call('/supplier-orders/returns', {
  token: b.token,
  method: 'POST',
  body: {
    supplier_id: supplierId,
    branch_id: branch.id,
    items: [{ product_id: productId, quantity: 1, cost_price: 9999999 }],
  },
  expected: 404,
});
product = await productById(a.token, productId);
assert(Number(product.stock) === 14, 'Cross-tenant supplier return mutated stock');

// Non-finite quantity must fail with no writes.
await call('/supplier-orders/returns', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: supplierId,
    branch_id: branch.id,
    items: [{ product_id: productId, quantity: 'Infinity', cost_price: 9999999 }],
  },
  expected: 400,
});
product = await productById(a.token, productId);
assert(Number(product.stock) === 14, 'Rejected non-finite supplier return mutated stock');

// Client price is intentionally absurd and duplicated. Server must aggregate quantity and use cost_price=57143.
const firstReturn = await call('/supplier-orders/returns', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: supplierId,
    branch_id: branch.id,
    reason: 'Server value + duplicate aggregation regression',
    items: [
      { product_id: productId, quantity: 1, cost_price: 9999999 },
      { product_id: productId, quantity: 2, cost_price: 1 },
    ],
  },
  expected: 200,
});
assert(Number(firstReturn.data?.total_amount) === 171429,
  `Supplier return must ignore client price and use server cost: ${JSON.stringify(firstReturn.data)}`);
assert(Number(firstReturn.data?.debt_reduction) === 171429 && Number(firstReturn.data?.refund_amount) === 0,
  `First supplier return debt/refund mismatch: ${JSON.stringify(firstReturn.data)}`);

product = await productById(a.token, productId);
assert(Number(product.stock) === 11, `First supplier return stock expected 11, got ${product.stock}`);

let supplier = (await call('/suppliers', { token: a.token, expected: 200 })).data.find((row) => Number(row.id) === supplierId);
assert(Number(supplier?.total_purchased) === 128571, `Supplier purchased total expected 128571, got ${supplier?.total_purchased}`);
assert(Number(supplier?.total_debt) === 128571, `Supplier debt expected 128571, got ${supplier?.total_debt}`);

let debts = (await call('/finance/debts', { token: a.token, expected: 200 })).data;
let payable = debts.find((row) => row.type === 'payable' && row.partner_name === supplier.name);
assert(payable, 'Seed payable debt missing after supplier return');
assert(Number(payable.amount) === 128571 && Number(payable.paid_amount || 0) === 0 && payable.status === 'unpaid',
  `Supplier return must reduce payable principal without fabricating payment: ${JSON.stringify(payable)}`);

// Two concurrent returns each request 7 while only 11 remain. Exactly one can commit; the winner
// clears the remaining 128571 payable and receives the 271430 excess as an actual bank refund.
const concurrentBody = {
  supplier_id: supplierId,
  branch_id: branch.id,
  reason: 'Concurrent overdraw + bank refund regression',
  refund_method: 'bank',
  refund_reference: 'SUPPLIER-RETURN-BANK-1',
  items: [{ product_id: productId, quantity: 7, cost_price: 9999999 }],
};
const concurrent = await Promise.all([
  call('/supplier-orders/returns', { token: a.token, method: 'POST', body: concurrentBody, expected: [200, 409] }),
  call('/supplier-orders/returns', { token: a.token, method: 'POST', body: concurrentBody, expected: [200, 409] }),
]);
assert(concurrent.filter((result) => result.status === 200).length === 1,
  `Concurrent supplier return must have one success: ${concurrent.map((result) => result.status).join(',')}`);
assert(concurrent.filter((result) => result.status === 409).length === 1,
  `Concurrent supplier return must have one stock conflict: ${concurrent.map((result) => result.status).join(',')}`);
const winner = concurrent.find((result) => result.status === 200);
assert(Number(winner.data?.total_amount) === 400001,
  `Concurrent winner total must use server cost 57143 x 7: ${JSON.stringify(winner.data)}`);
assert(Number(winner.data?.debt_reduction) === 128571 && Number(winner.data?.refund_amount) === 271430,
  `Concurrent winner debt/refund mismatch: ${JSON.stringify(winner.data)}`);
assert(winner.data?.refund_method === 'bank' && winner.data?.refund_evidence_status === 'RECORDED',
  `Supplier refund method/evidence mismatch: ${JSON.stringify(winner.data)}`);

product = await productById(a.token, productId);
assert(Number(product.stock) === 4, `Concurrent supplier return must leave stock 4, got ${product.stock}`);

supplier = (await call('/suppliers', { token: a.token, expected: 200 })).data.find((row) => Number(row.id) === supplierId);
assert(Number(supplier?.total_debt) === 0, `Supplier debt must be fully cleared, got ${supplier?.total_debt}`);
assert(Number(supplier?.total_purchased) === 0, `Supplier purchased total must clamp at zero, got ${supplier?.total_purchased}`);

debts = (await call('/finance/debts', { token: a.token, expected: 200 })).data;
payable = debts.find((row) => row.id === payable.id);
assert(Number(payable.amount) === 0 && Number(payable.paid_amount || 0) === 0 && payable.status === 'paid',
  `Supplier payable principal after credit must be zero without fake paid cash: ${JSON.stringify(payable)}`);

const cashFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
const refundFlow = cashFlows.find((flow) => flow.reference_id === winner.data.code && flow.category === 'refund');
assert(refundFlow, 'Supplier bank refund cash-flow missing');
assert(refundFlow.transaction_type === 'in' && refundFlow.payment_method === 'bank' && Number(refundFlow.amount) === 271430,
  `Supplier refund cash-flow must preserve bank method: ${JSON.stringify(refundFlow)}`);

const evidenceRows = (await call('/audit-compliance/payment-evidence', { token: a.token, expected: 200 })).data;
const evidence = evidenceRows.find((row) => Number(row.cash_flow_id) === Number(refundFlow.id));
assert(evidence, 'Supplier return payment evidence missing');
assert(evidence.payment_method === 'bank' && Number(evidence.amount) === 271430
  && evidence.transaction_reference === 'SUPPLIER-RETURN-BANK-1' && evidence.status === 'RECORDED',
  `Supplier return payment evidence mismatch: ${JSON.stringify(evidence)}`);

const returnHeaders = (await call('/supplier-orders/returns', { token: a.token, expected: 200 })).data;
assert(returnHeaders.length === 2, `Exactly two supplier returns must commit, got ${returnHeaders.length}`);
const returnTotal = returnHeaders.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
assert(returnTotal === 571430, `Committed supplier return total expected 571430, got ${returnTotal}`);

const findings = (await call('/audit-compliance/findings', { token: a.token, expected: 200 })).data;
assert(findings.some((row) => row.code === 'SUPPLIER_RETURN_EXCEEDS_RECORDED_PURCHASES' && row.subject_id === String(winner.data.id)),
  'Return above recorded supplier purchases must create a review finding instead of negative total_purchased');
assert(!findings.some((row) => row.code === 'SUPPLIER_REFUND_METHOD_MISSING' && row.subject_id === String(winner.data.id)),
  'Bank-refund supplier return must not create missing-method finding');

console.log('SUPPLIER RETURN INTEGRITY SMOKE PASSED: tenant isolation + finite/duplicate-safe stock + server-valued cost + atomic concurrent overdraw protection + principal debt credit + exact bank refund evidence');
