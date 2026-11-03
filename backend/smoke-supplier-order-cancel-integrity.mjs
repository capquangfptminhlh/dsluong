const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function call(apiPath, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${apiPath}`, {
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
    assert(allowed.includes(response.status), `${method} ${apiPath}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  } else {
    assert(response.ok, `${method} ${apiPath}: HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, data };
}

async function register(phone, name) {
  const result = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'SupplierCancel2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

async function createProduct(token, name, suffix) {
  const result = await call('/products', {
    token,
    method: 'POST',
    body: { name, sku: `SUP-CANCEL-${suffix}-${Date.now()}`, price: 120000, cost_price: 40000, stock: 5, category: 'Smoke' },
    expected: 200,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `Product ${name} missing id`);
  return id;
}

async function productById(token, id) {
  const rows = (await call('/products', { token, expected: 200 })).data;
  const product = rows.find((row) => Number(row.id) === Number(id));
  assert(product, `Product ${id} missing`);
  return product;
}

async function createOrder(token, { supplierId, branchId, productId, quantity = 2, costPrice = 60000, note }) {
  const result = await call('/supplier-orders/requests', {
    token,
    method: 'POST',
    body: {
      supplier_id: supplierId,
      branch_id: branchId,
      items: [{ product_id: productId, quantity, cost_price: costPrice }],
      note,
    },
    expected: 200,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `Supplier order ${note} missing id`);
  return { id, code: result.data.code, total: Number(result.data.total_amount) };
}

async function orderDetail(token, id) {
  return (await call(`/supplier-orders/requests/${id}`, { token, expected: 200 })).data;
}

async function supplierById(token, id) {
  const rows = (await call('/suppliers', { token, expected: 200 })).data;
  const supplier = rows.find((row) => Number(row.id) === Number(id));
  assert(supplier, `Supplier ${id} missing`);
  return supplier;
}

async function cashFlows(token) {
  return (await call('/finance/cash-flows', { token, expected: 200 })).data;
}

const a = await register('0966889991', 'Supplier Cancel Tenant A');
const b = await register('0966889992', 'Supplier Cancel Tenant B');
const branchesA = (await call('/branches', { token: a.token, expected: 200 })).data;
const branchA = branchesA.find((row) => Number(row.is_default) === 1) || branchesA[0];
assert(branchA?.id, 'Supplier cancel smoke requires a default branch');

const productId = await createProduct(a.token, 'Supplier Cancel Race Product', 'A');
const supplierResult = await call('/suppliers', {
  token: a.token,
  method: 'POST',
  body: { name: 'NCC Supplier Cancel A', phone: '02866889991', tax_code: `SC-A-${Date.now()}` },
  expected: 200,
});
const supplierId = Number(supplierResult.data?.id);
assert(supplierId > 0, 'Supplier cancel smoke missing supplier');

await call('/supplier-orders/requests/abc/huy', { token: a.token, method: 'POST', expected: 400 });

// Tenant isolation: another tenant cannot cancel the request.
const tenantOrder = await createOrder(a.token, {
  supplierId,
  branchId: branchA.id,
  productId,
  note: 'CANCEL-TENANT-ISOLATION',
});
await call(`/supplier-orders/requests/${tenantOrder.id}/huy`, { token: b.token, method: 'POST', expected: 404 });
assert((await orderDetail(a.token, tenantOrder.id)).status === 'ordered', 'Cross-tenant cancel mutated request');

// Double cancel: exactly one transition wins; the second sees terminal cancelled state.
const doubleCancelOrder = await createOrder(a.token, {
  supplierId,
  branchId: branchA.id,
  productId,
  note: 'DOUBLE-CANCEL',
});
const doubleCancel = await Promise.all([
  call(`/supplier-orders/requests/${doubleCancelOrder.id}/huy`, { token: a.token, method: 'POST', expected: [200, 409] }),
  call(`/supplier-orders/requests/${doubleCancelOrder.id}/huy`, { token: a.token, method: 'POST', expected: [200, 409] }),
]);
assert(doubleCancel.filter((result) => result.status === 200).length === 1,
  `Double cancel must have exactly one success: ${doubleCancel.map((result) => result.status).join(',')}`);
assert(doubleCancel.filter((result) => result.status === 409).length === 1,
  `Double cancel must have exactly one conflict: ${doubleCancel.map((result) => result.status).join(',')}`);
let detail = await orderDetail(a.token, doubleCancelOrder.id);
assert(detail.status === 'cancelled' && !detail.po_id, `Double-cancel final state mismatch: ${JSON.stringify(detail)}`);

// Cancelled order can never be received and must remain accounting-neutral.
const stockBeforeCancelledReceive = Number((await productById(a.token, productId)).stock);
const supplierBeforeCancelledReceive = await supplierById(a.token, supplierId);
const cashBeforeCancelledReceive = (await cashFlows(a.token)).length;
await call(`/supplier-orders/requests/${doubleCancelOrder.id}/nhan-hang`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 50000, payment_method: 'cash' },
  expected: 409,
});
detail = await orderDetail(a.token, doubleCancelOrder.id);
assert(detail.status === 'cancelled' && !detail.po_id, 'Receive after cancel must not change terminal state');
assert(Number((await productById(a.token, productId)).stock) === stockBeforeCancelledReceive,
  'Receive after cancel must not mutate stock');
const supplierAfterCancelledReceive = await supplierById(a.token, supplierId);
assert(Number(supplierAfterCancelledReceive.total_debt || 0) === Number(supplierBeforeCancelledReceive.total_debt || 0)
  && Number(supplierAfterCancelledReceive.total_purchased || 0) === Number(supplierBeforeCancelledReceive.total_purchased || 0),
  'Receive after cancel must not mutate supplier totals');
assert((await cashFlows(a.token)).length === cashBeforeCancelledReceive,
  'Receive after cancel must not create cash-flow');

// Received order can never be cancelled. Its receipt/accounting state must stay intact.
const receivedOrder = await createOrder(a.token, {
  supplierId,
  branchId: branchA.id,
  productId,
  quantity: 1,
  costPrice: 65000,
  note: 'RECEIVE-THEN-CANCEL',
});
const stockBeforeReceive = Number((await productById(a.token, productId)).stock);
const receiveResult = await call(`/supplier-orders/requests/${receivedOrder.id}/nhan-hang`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 15000, payment_method: 'bank', payment_reference: 'RECEIVE-THEN-CANCEL-BANK' },
  expected: 200,
});
assert(Number(receiveResult.data?.id) > 0, 'Receive-then-cancel smoke missing purchase order id');
await call(`/supplier-orders/requests/${receivedOrder.id}/huy`, { token: a.token, method: 'POST', expected: 409 });
detail = await orderDetail(a.token, receivedOrder.id);
assert(detail.status === 'received' && Number(detail.po_id) === Number(receiveResult.data.id),
  `Cancel after receive must preserve received state: ${JSON.stringify(detail)}`);
assert(Number((await productById(a.token, productId)).stock) === stockBeforeReceive + 1,
  'Cancel after receive must not reverse stock');

// Strong race invariant: receive and cancel the same ordered request concurrently.
// SQLite IMMEDIATE serialization must yield one 200 winner and one 409 loser. Then the
// business state must be internally consistent with the winner: either fully cancelled
// with no accounting mutation, or fully received with exactly one receipt mutation.
const raceOrder = await createOrder(a.token, {
  supplierId,
  branchId: branchA.id,
  productId,
  quantity: 2,
  costPrice: 70000,
  note: 'CANCEL-VS-RECEIVE-RACE',
});
const stockBeforeRace = Number((await productById(a.token, productId)).stock);
const supplierBeforeRace = await supplierById(a.token, supplierId);
const cashBeforeRace = (await cashFlows(a.token)).length;
const race = await Promise.all([
  call(`/supplier-orders/requests/${raceOrder.id}/huy`, {
    token: a.token,
    method: 'POST',
    expected: [200, 409],
  }),
  call(`/supplier-orders/requests/${raceOrder.id}/nhan-hang`, {
    token: a.token,
    method: 'POST',
    body: { paid_amount: 20000, payment_method: 'bank', payment_reference: 'CANCEL-VS-RECEIVE-RACE-BANK' },
    expected: [200, 409],
  }),
]);
assert(race.filter((result) => result.status === 200).length === 1,
  `Cancel-vs-receive race must have one success: ${race.map((result) => result.status).join(',')}`);
assert(race.filter((result) => result.status === 409).length === 1,
  `Cancel-vs-receive race must have one conflict: ${race.map((result) => result.status).join(',')}`);

const cancelRaceResult = race[0];
const receiveRaceResult = race[1];
detail = await orderDetail(a.token, raceOrder.id);
const productAfterRace = await productById(a.token, productId);
const supplierAfterRace = await supplierById(a.token, supplierId);
const cashAfterRace = await cashFlows(a.token);

if (cancelRaceResult.status === 200) {
  assert(receiveRaceResult.status === 409, 'Cancel winner requires receive conflict');
  assert(detail.status === 'cancelled' && !detail.po_id,
    `Cancel winner must leave cancelled/no po state: ${JSON.stringify(detail)}`);
  assert(Number(productAfterRace.stock) === stockBeforeRace,
    `Cancel winner must not mutate stock: ${stockBeforeRace} -> ${productAfterRace.stock}`);
  assert(Number(supplierAfterRace.total_purchased || 0) === Number(supplierBeforeRace.total_purchased || 0)
    && Number(supplierAfterRace.total_debt || 0) === Number(supplierBeforeRace.total_debt || 0),
    'Cancel winner must not mutate supplier accounting');
  assert(cashAfterRace.length === cashBeforeRace, 'Cancel winner must not create cash-flow');
} else {
  assert(receiveRaceResult.status === 200, 'Receive winner requires cancel conflict');
  assert(detail.status === 'received' && Number(detail.po_id) === Number(receiveRaceResult.data?.id),
    `Receive winner must leave received + one po state: ${JSON.stringify(detail)}`);
  assert(Number(productAfterRace.stock) === stockBeforeRace + 2,
    `Receive winner must add stock exactly once: ${stockBeforeRace} -> ${productAfterRace.stock}`);
  assert(Number(supplierAfterRace.total_purchased || 0) === Number(supplierBeforeRace.total_purchased || 0) + 140000,
    `Receive winner supplier purchased mismatch: ${JSON.stringify(supplierAfterRace)}`);
  assert(Number(supplierAfterRace.total_debt || 0) === Number(supplierBeforeRace.total_debt || 0) + 120000,
    `Receive winner supplier debt mismatch: ${JSON.stringify(supplierAfterRace)}`);
  const newFlows = cashAfterRace.slice(0, Math.max(0, cashAfterRace.length - cashBeforeRace));
  assert(cashAfterRace.length === cashBeforeRace + 1
    && cashAfterRace.some((flow) => flow.reference_id === receiveRaceResult.data.purchase_code
      && flow.transaction_type === 'out' && flow.payment_method === 'bank' && Number(flow.amount) === 20000),
    `Receive winner must create exactly one bank purchase cash-flow: ${JSON.stringify(newFlows)}`);
}

console.log('SUPPLIER ORDER CANCEL INTEGRITY SMOKE PASSED: invalid/tenant guards + one-shot cancel + receive-after-cancel block + cancel-after-receive block + serialized cancel-vs-receive terminal-state/accounting invariant');
