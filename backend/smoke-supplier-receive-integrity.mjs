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
    body: { phone, name, password: 'SupplierReceive2026!', sector: 'retail' },
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

const a = await register('0966889931', 'Supplier Receive Tenant A');
const b = await register('0966889932', 'Supplier Receive Tenant B');

const branchesA = (await call('/branches', { token: a.token, expected: 200 })).data;
const branchA = branchesA.find((row) => Number(row.is_default) === 1) || branchesA[0];
assert(branchA?.id, 'Supplier receive smoke requires a default branch');

const productCreated = await call('/products', {
  token: a.token,
  method: 'POST',
  body: {
    name: 'Supplier Receive Atomic Product',
    sku: `SUP-RECV-${Date.now()}`,
    price: 120000,
    cost_price: 50000,
    stock: 10,
    category: 'Smoke',
  },
  expected: 200,
});
const productId = Number(productCreated.data?.id);
assert(productId > 0, 'Supplier receive product missing id');

const supplierCreated = await call('/suppliers', {
  token: a.token,
  method: 'POST',
  body: { name: 'NCC Supplier Receive Smoke', phone: '02866889931', tax_code: `SMOKE-SR-${Date.now()}` },
  expected: 200,
});
const supplierId = Number(supplierCreated.data?.id);
assert(supplierId > 0, 'Supplier receive supplier missing id');

const requestCreated = await call('/supplier-orders/requests', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: supplierId,
    branch_id: branchA.id,
    items: [
      { product_id: productId, quantity: 2, cost_price: 70000 },
      { product_id: productId, quantity: 3, cost_price: 80000 },
    ],
    note: 'Supplier receive duplicate-line regression',
  },
  expected: 200,
});
const requestId = Number(requestCreated.data?.id);
assert(requestId > 0, 'Supplier purchase request missing id');
assert(Number(requestCreated.data?.total_amount) === 380000, `Request total expected 380000, got ${requestCreated.data?.total_amount}`);

let product = await productById(a.token, productId);
assert(Number(product.stock) === 10 && Number(product.cost_price) === 50000, `Unexpected initial product state: ${JSON.stringify(product)}`);

// Tenant B must never be able to claim tenant A's request.
await call(`/supplier-orders/requests/${requestId}/nhan-hang`, {
  token: b.token,
  method: 'POST',
  body: { paid_amount: 80000, payment_method: 'bank', payment_reference: 'FOREIGN-ATTEMPT' },
  expected: 404,
});
product = await productById(a.token, productId);
assert(Number(product.stock) === 10, 'Cross-tenant receive mutated stock');

// Invalid and over-limit money must fail before any write and keep the request receivable.
await call(`/supplier-orders/requests/${requestId}/nhan-hang`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 'Infinity', payment_method: 'bank' },
  expected: 400,
});
await call(`/supplier-orders/requests/${requestId}/nhan-hang`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 380001, payment_method: 'bank' },
  expected: 400,
});
let request = (await call(`/supplier-orders/requests/${requestId}`, { token: a.token, expected: 200 })).data;
assert(request.status === 'ordered' && !request.po_id, `Rejected receive changed request state: ${JSON.stringify(request)}`);
product = await productById(a.token, productId);
assert(Number(product.stock) === 10 && Number(product.cost_price) === 50000, 'Rejected payment input mutated product');

// Two users/double-clicks racing on the same request: exactly one transaction may win.
const receivePayload = {
  paid_amount: 80000,
  payment_method: 'bank',
  payment_reference: 'SUPPLIER-RECEIVE-BANK-1',
};
const concurrent = await Promise.all([
  call(`/supplier-orders/requests/${requestId}/nhan-hang`, {
    token: a.token,
    method: 'POST',
    body: receivePayload,
    expected: [200, 409],
  }),
  call(`/supplier-orders/requests/${requestId}/nhan-hang`, {
    token: a.token,
    method: 'POST',
    body: receivePayload,
    expected: [200, 409],
  }),
]);
assert(concurrent.filter((result) => result.status === 200).length === 1,
  `Concurrent supplier receive must have one success: ${concurrent.map((result) => result.status).join(',')}`);
assert(concurrent.filter((result) => result.status === 409).length === 1,
  `Concurrent supplier receive must have one conflict: ${concurrent.map((result) => result.status).join(',')}`);
const winner = concurrent.find((result) => result.status === 200);
assert(Number(winner.data?.total_amount) === 380000, `Receive total mismatch: ${JSON.stringify(winner.data)}`);
assert(Number(winner.data?.paid_amount) === 80000 && Number(winner.data?.con_no) === 300000,
  `Receive paid/debt mismatch: ${JSON.stringify(winner.data)}`);
assert(winner.data?.payment_method === 'bank' && winner.data?.payment_evidence_status === 'RECORDED',
  `Receive payment evidence response mismatch: ${JSON.stringify(winner.data)}`);

request = (await call(`/supplier-orders/requests/${requestId}`, { token: a.token, expected: 200 })).data;
assert(request.status === 'received' && Number(request.po_id) === Number(winner.data.id),
  `Request must point to exactly one received PO: ${JSON.stringify(request)}`);

product = await productById(a.token, productId);
assert(Number(product.stock) === 15, `Supplier receive stock expected 15, got ${product.stock}`);
assert(Number(product.cost_price) === 58667, `Supplier receive weighted cost expected 58667, got ${product.cost_price}`);

const purchaseDetail = await call(`/purchases/${winner.data.id}`, { token: a.token, expected: 200 });
assert(purchaseDetail.data?.items?.length === 2, 'Supplier receive must preserve original duplicate item rows');
assert(purchaseDetail.data?.payment_evidence?.length === 1, 'Supplier receive payment evidence missing');
const evidence = purchaseDetail.data.payment_evidence[0];
assert(evidence.payment_method === 'bank', `Supplier receive evidence method must be bank: ${JSON.stringify(evidence)}`);
assert(Number(evidence.amount) === 80000, `Supplier receive evidence amount expected 80000, got ${evidence.amount}`);
assert(evidence.transaction_reference === 'SUPPLIER-RECEIVE-BANK-1', `Supplier receive evidence reference mismatch: ${JSON.stringify(evidence)}`);

const cashFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
const purchaseFlow = cashFlows.find((flow) => flow.reference_id === winner.data.purchase_code && flow.category === 'purchase');
assert(purchaseFlow, 'Supplier receive purchase cash-flow missing');
assert(purchaseFlow.transaction_type === 'out' && purchaseFlow.payment_method === 'bank' && Number(purchaseFlow.amount) === 80000,
  `Supplier receive cash-flow must preserve bank method: ${JSON.stringify(purchaseFlow)}`);

const supplier = (await call('/suppliers', { token: a.token, expected: 200 })).data.find((row) => Number(row.id) === supplierId);
assert(Number(supplier?.total_purchased) === 380000, `Supplier purchased total must change once, got ${supplier?.total_purchased}`);
assert(Number(supplier?.total_debt) === 300000, `Supplier debt must change once, got ${supplier?.total_debt}`);

const debts = (await call('/finance/debts', { token: a.token, expected: 200 })).data;
const payable = debts.filter((row) => row.type === 'payable' && row.partner_name === supplier.name);
assert(payable.length === 1, `Supplier receive must create exactly one payable debt: ${JSON.stringify(payable)}`);
assert(Number(payable[0].amount) === 300000 && Number(payable[0].paid_amount || 0) === 0,
  `Supplier payable debt mismatch: ${JSON.stringify(payable[0])}`);

const summary = await call('/branches/ton-kho/tong-hop', { token: a.token, expected: 200 });
const branchProduct = summary.data?.products?.find((row) => Number(row.id) === productId);
assert(branchProduct, 'Supplier receive product missing from branch summary');
assert(Number(branchProduct.ton?.[branchA.id]) === 15 && Number(branchProduct.stock) === 15,
  `Supplier receive branch/product stock diverged: ${JSON.stringify(branchProduct)}`);

// A later retry must remain a conflict and must not duplicate any accounting side effects.
await call(`/supplier-orders/requests/${requestId}/nhan-hang`, {
  token: a.token,
  method: 'POST',
  body: receivePayload,
  expected: 409,
});
product = await productById(a.token, productId);
assert(Number(product.stock) === 15 && Number(product.cost_price) === 58667, 'Retry after received mutated product again');
const supplierAfterRetry = (await call('/suppliers', { token: a.token, expected: 200 })).data.find((row) => Number(row.id) === supplierId);
assert(Number(supplierAfterRetry?.total_purchased) === 380000 && Number(supplierAfterRetry?.total_debt) === 300000,
  'Retry after received duplicated supplier accounting');

// Variant regression: supplier receipt must credit exact variant stock so POS can sell it.
const variantCreated = await call('/products/with-variants', {
  token: a.token,
  method: 'POST',
  body: {
    name: 'Supplier Receive Variant Product',
    category: 'Smoke',
    warranty_months: 0,
    variants: [
      { sku: `SUP-RCV-VAR-${Date.now()}`, price: 220000, cost_price: 120000, stock: 0, attributes: { 'Cấu hình': 'Mặc định' } },
    ],
  },
  expected: 200,
});
const variantProductId = Number(variantCreated.data?.product_id);
let variantProduct = await productById(a.token, variantProductId);
const onlyVariant = variantProduct.variants?.[0];
assert(onlyVariant?.id, 'Supplier receive variant regression missing only variant');

const variantRequest = await call('/supplier-orders/requests', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: supplierId,
    branch_id: branchA.id,
    items: [{ product_id: variantProductId, quantity: 2, cost_price: 130000 }],
    note: 'Single variant auto resolution',
  },
  expected: 200,
});
await call(`/supplier-orders/requests/${variantRequest.data.id}/nhan-hang`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 0 },
  expected: 200,
});
variantProduct = await productById(a.token, variantProductId);
assert(Number(variantProduct.stock) === 2, 'Supplier receipt must increase parent stock for variant product');
assert(Number(variantProduct.variants?.[0]?.stock) === 2, 'Supplier receipt must increase single variant stock');

await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{ id: variantProductId, variant_id: onlyVariant.id, quantity: 1, price: 220000, warranty_months: 0 }],
    customer_name: 'Khách lẻ',
    customer_phone: '',
    payment_method: 'cash',
    branch_id: branchA.id,
  },
  expected: 200,
});
variantProduct = await productById(a.token, variantProductId);
assert(Number(variantProduct.stock) === 1 && Number(variantProduct.variants?.[0]?.stock) === 1,
  `Supplier receipt -> POS sale stock mismatch: ${JSON.stringify(variantProduct)}`);

console.log('SUPPLIER RECEIVE INTEGRITY SMOKE PASSED: tenant isolation + finite payment + atomic idempotent receive + duplicate weighted cost + exact bank payment evidence + variant receipt -> POS sale');
