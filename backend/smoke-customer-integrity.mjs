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
    body: { phone, name, password: 'CustomerIntegrity2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

async function createCustomer(token, name, phone) {
  const result = await call('/customers', {
    token,
    method: 'POST',
    body: { name, phone, tags: 'integrity-smoke' },
    expected: 201,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `Customer ${name} missing id`);
  return id;
}

async function getCustomer(token, id) {
  const rows = (await call('/customers', { token, expected: 200 })).data;
  return rows.find((row) => Number(row.id) === Number(id)) || null;
}

const a = await register('0966910001', 'Customer Integrity Tenant A');
const b = await register('0966910002', 'Customer Integrity Tenant B');

await call('/customers/abc', { token: a.token, method: 'PUT', body: { name: 'x' }, expected: 400 });
await call('/customers/abc', { token: a.token, method: 'DELETE', expected: 400 });

// Tenant isolation and unused-customer lifecycle.
const unusedId = await createCustomer(a.token, 'Unused Customer', '0977000101');
await call(`/customers/${unusedId}`, { token: b.token, method: 'PUT', body: { name: 'Cross tenant' }, expected: 404 });
await call(`/customers/${unusedId}`, { token: b.token, method: 'DELETE', expected: 404 });
await call(`/customers/${unusedId}`, {
  token: a.token,
  method: 'PUT',
  body: { name: 'Unused Customer Updated', phone: '0977000102', tags: 'safe-edit' },
  expected: 200,
});
const unusedUpdated = await getCustomer(a.token, unusedId);
assert(unusedUpdated?.phone === '0977000102' && unusedUpdated?.name === 'Unused Customer Updated',
  `Unused customer update did not persist: ${JSON.stringify(unusedUpdated)}`);
await call(`/customers/${unusedId}`, { token: a.token, method: 'DELETE', expected: 200 });
assert(!(await getCustomer(a.token, unusedId)), 'Unused customer should be hard deleted');

// Cross-tenant price-level references must not be accepted.
const foreignLevel = await call('/pricing/levels', {
  token: b.token,
  method: 'POST',
  body: { name: `Foreign Level ${Date.now()}` },
  expected: 200,
});
const priceCustomerId = await createCustomer(a.token, 'Price Level Customer', '0977000201');
await call(`/customers/${priceCustomerId}`, {
  token: a.token,
  method: 'PUT',
  body: { price_level_id: foreignLevel.data.id },
  expected: 404,
});
const priceCustomer = await getCustomer(a.token, priceCustomerId);
assert(priceCustomer?.price_level_id == null, 'Foreign tenant price level leaked into customer');

// POS history makes phone an immutable legacy identity key and blocks hard deletion.
const posCustomerId = await createCustomer(a.token, 'POS History Customer', '0977000301');
const product = await call('/products', {
  token: a.token,
  method: 'POST',
  body: { name: 'Customer Integrity Product', sku: `CUST-INT-${Date.now()}`, price: 90000, cost_price: 40000, stock: 5, category: 'Smoke' },
  expected: 200,
});
await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{ id: product.data.id, quantity: 1, price: 1 }],
    customer_name: 'POS History Customer',
    customer_phone: '0977000301',
    payment_method: 'cash',
    paid_cash: 90000,
    vat_rate: 0,
  },
  expected: 200,
});
const ordersBefore = (await call(`/customers/${posCustomerId}/orders`, { token: a.token, expected: 200 })).data;
assert(ordersBefore.length === 1, `Expected one linked POS order before blocked phone change: ${JSON.stringify(ordersBefore)}`);
await call(`/customers/${posCustomerId}`, {
  token: a.token,
  method: 'PUT',
  body: { phone: '0977000399' },
  expected: 409,
});
const posCustomer = await getCustomer(a.token, posCustomerId);
assert(posCustomer?.phone === '0977000301', 'Historical customer phone must remain unchanged after conflict');
const ordersAfter = (await call(`/customers/${posCustomerId}/orders`, { token: a.token, expected: 200 })).data;
assert(ordersAfter.length === 1 && ordersAfter[0].id === ordersBefore[0].id,
  'Blocked phone change must preserve customer-to-order history lookup');
await call(`/customers/${posCustomerId}`, { token: a.token, method: 'DELETE', expected: 409 });
assert(await getCustomer(a.token, posCustomerId), 'Customer with POS history must remain');

// Loyalty history alone is business evidence and must block hard deletion/phone identity changes.
const loyaltyId = await createCustomer(a.token, 'Loyalty History Customer', '0977000401');
await call('/loyalty/add-points', {
  token: a.token,
  method: 'POST',
  body: { customer_id: loyaltyId, points: 25, reason: 'Customer integrity smoke' },
  expected: 201,
});
await call(`/customers/${loyaltyId}`, {
  token: a.token,
  method: 'PUT',
  body: { phone: '0977000499' },
  expected: 409,
});
await call(`/customers/${loyaltyId}`, { token: a.token, method: 'DELETE', expected: 409 });
const loyaltyCustomer = await getCustomer(a.token, loyaltyId);
assert(Number(loyaltyCustomer?.id) === loyaltyId, 'Customer with loyalty history must remain');

// Concurrent first loyalty event vs hard delete must have one coherent winner.
const raceId = await createCustomer(a.token, 'Customer Loyalty Delete Race', '0977000501');
const race = await Promise.all([
  call('/loyalty/add-points', {
    token: a.token,
    method: 'POST',
    body: { customer_id: raceId, points: 5, reason: 'Concurrent identity race' },
    expected: [201, 404],
  }),
  call(`/customers/${raceId}`, {
    token: a.token,
    method: 'DELETE',
    expected: [200, 409],
  }),
]);
const pointsRace = race[0];
const deleteRace = race[1];
assert((pointsRace.status === 201 && deleteRace.status === 409)
  || (pointsRace.status === 404 && deleteRace.status === 200),
  `Loyalty/delete race must have one coherent winner: points=${pointsRace.status}, delete=${deleteRace.status}`);
if (pointsRace.status === 201) {
  assert(await getCustomer(a.token, raceId), 'Loyalty winner requires customer identity to remain');
} else {
  assert(!(await getCustomer(a.token, raceId)), 'Delete winner requires unused customer identity to be gone');
}

console.log('CUSTOMER INTEGRITY SMOKE PASSED: tenant guard + unused edit/delete + price-level tenant validation + POS/loyalty history-safe identity + coherent first-loyalty-vs-delete race');