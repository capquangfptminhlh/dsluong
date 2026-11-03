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
    body: { phone, name, password: 'SupplierDelete2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

async function createSupplier(token, name, suffix) {
  const result = await call('/suppliers', {
    token,
    method: 'POST',
    body: { name, phone: `02877${String(Date.now()).slice(-5)}`, tax_code: `SUP-DEL-${suffix}-${Date.now()}` },
    expected: 200,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `Supplier ${name} missing id`);
  return id;
}

async function createProduct(token, name, suffix, stock = 8) {
  const result = await call('/products', {
    token,
    method: 'POST',
    body: { name, sku: `SUP-DEL-${suffix}-${Date.now()}`, price: 120000, cost_price: 50000, stock, category: 'Smoke' },
    expected: 200,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `Product ${name} missing id`);
  return id;
}

async function supplierExists(token, id) {
  const rows = (await call('/suppliers', { token, expected: 200 })).data;
  return rows.some((row) => Number(row.id) === Number(id));
}

async function createOrder(token, { supplierId, branchId, productId, note, quantity = 1, costPrice = 60000 }) {
  return call('/supplier-orders/requests', {
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
}

const a = await register('0966890001', 'Supplier Delete Tenant A');
const b = await register('0966890002', 'Supplier Delete Tenant B');
const branches = (await call('/branches', { token: a.token, expected: 200 })).data;
const branch = branches.find((row) => Number(row.is_default) === 1) || branches[0];
assert(branch?.id, 'Supplier delete smoke requires default branch');
const productId = await createProduct(a.token, 'Supplier Delete Product', 'BASE');

await call('/suppliers/abc', { token: a.token, method: 'DELETE', expected: 400 });

// Unused supplier can be hard deleted. Another tenant cannot delete it first.
const unusedId = await createSupplier(a.token, 'NCC Unused Delete', 'UNUSED');
await call(`/suppliers/${unusedId}`, { token: b.token, method: 'DELETE', expected: 404 });
assert(await supplierExists(a.token, unusedId), 'Cross-tenant supplier delete mutated supplier');
await call(`/suppliers/${unusedId}`, { token: a.token, method: 'DELETE', expected: 200 });
assert(!(await supplierExists(a.token, unusedId)), 'Unused supplier should be deleted');
await call(`/suppliers/${unusedId}`, { token: a.token, method: 'DELETE', expected: 404 });

// Any purchase-request history blocks hard deletion, even after cancellation.
const cancelledHistoryId = await createSupplier(a.token, 'NCC Cancelled History', 'CANCELLED');
const cancelledOrder = await createOrder(a.token, {
  supplierId: cancelledHistoryId,
  branchId: branch.id,
  productId,
  note: 'SUPPLIER-DELETE-CANCELLED-HISTORY',
});
const cancelledRequestId = Number(cancelledOrder.data?.id);
assert(cancelledRequestId > 0, 'Cancelled-history request missing id');
await call(`/supplier-orders/requests/${cancelledRequestId}/huy`, { token: a.token, method: 'POST', expected: 200 });
await call(`/suppliers/${cancelledHistoryId}`, { token: a.token, method: 'DELETE', expected: 409 });
assert(await supplierExists(a.token, cancelledHistoryId), 'Supplier with cancelled request history must remain');

// Purchase receipt history blocks deletion.
const receivedHistoryId = await createSupplier(a.token, 'NCC Received History', 'RECEIVED');
const receivedOrder = await createOrder(a.token, {
  supplierId: receivedHistoryId,
  branchId: branch.id,
  productId,
  note: 'SUPPLIER-DELETE-RECEIVED-HISTORY',
  quantity: 1,
  costPrice: 65000,
});
const receivedRequestId = Number(receivedOrder.data?.id);
await call(`/supplier-orders/requests/${receivedRequestId}/nhan-hang`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 15000, payment_method: 'bank', payment_reference: 'SUP-DEL-RECEIVED-BANK' },
  expected: 200,
});
await call(`/suppliers/${receivedHistoryId}`, { token: a.token, method: 'DELETE', expected: 409 });
assert(await supplierExists(a.token, receivedHistoryId), 'Supplier with receipt history must remain');

// Supplier-return history also blocks deletion, even without purchase-order history.
const returnHistoryId = await createSupplier(a.token, 'NCC Return History', 'RETURN');
await call('/supplier-orders/returns', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: returnHistoryId,
    branch_id: branch.id,
    items: [{ product_id: productId, quantity: 1 }],
    reason: 'Supplier delete return history smoke',
    refund_method: 'cash',
    refund_reference: 'SUP-DEL-RETURN-CASH',
  },
  expected: 200,
});
await call(`/suppliers/${returnHistoryId}`, { token: a.token, method: 'DELETE', expected: 409 });
assert(await supplierExists(a.token, returnHistoryId), 'Supplier with return history must remain');

// Strong race invariant: creating the first supplier order and deleting the same unused
// supplier concurrently must serialize. Either order creation wins and delete conflicts,
// or delete wins and order creation sees no supplier. There must never be an order pointing
// at a supplier that no longer exists.
const raceSupplierId = await createSupplier(a.token, 'NCC Create Delete Race', 'RACE');
const requestsBeforeRace = (await call('/supplier-orders/requests', { token: a.token, expected: 200 })).data;
const raceNote = `SUPPLIER-CREATE-DELETE-RACE-${Date.now()}`;
const race = await Promise.all([
  call('/supplier-orders/requests', {
    token: a.token,
    method: 'POST',
    body: {
      supplier_id: raceSupplierId,
      branch_id: branch.id,
      items: [{ product_id: productId, quantity: 1, cost_price: 70000 }],
      note: raceNote,
    },
    expected: [200, 404],
  }),
  call(`/suppliers/${raceSupplierId}`, {
    token: a.token,
    method: 'DELETE',
    expected: [200, 409],
  }),
]);
const createRace = race[0];
const deleteRace = race[1];
assert((createRace.status === 200 && deleteRace.status === 409)
  || (createRace.status === 404 && deleteRace.status === 200),
  `Create/delete race must have one coherent winner: create=${createRace.status}, delete=${deleteRace.status}`);

const supplierStillExists = await supplierExists(a.token, raceSupplierId);
const requestsAfterRace = (await call('/supplier-orders/requests', { token: a.token, expected: 200 })).data;
const raceRequests = requestsAfterRace.filter((row) => row.note === raceNote || Number(row.id) === Number(createRace.data?.id));

if (createRace.status === 200) {
  assert(supplierStillExists, 'Order-create winner requires supplier to remain');
  assert(raceRequests.length === 1 && Number(raceRequests[0].supplier_id) === raceSupplierId,
    `Order-create winner must leave exactly one valid supplier request: ${JSON.stringify(raceRequests)}`);
} else {
  assert(!supplierStillExists, 'Delete winner requires supplier to be gone');
  assert(raceRequests.length === 0,
    `Delete winner must leave no supplier request: ${JSON.stringify(raceRequests)}`);
  assert(requestsAfterRace.length === requestsBeforeRace.length,
    'Delete winner must not change purchase-request count');
}

console.log('SUPPLIER DELETE INTEGRITY SMOKE PASSED: invalid/tenant guards + unused-only delete + cancelled/received/return history protection + serialized first-order-vs-delete race with no orphan request');
