import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';

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
    body: { phone, name, password: 'PricingIntegrity2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name}: registration missing token`);
  return result.data;
}

async function createProduct(token, sku) {
  const created = await call('/products', {
    token,
    method: 'POST',
    body: { name: `Pricing Product ${sku}`, sku, price: 100000, cost_price: 50000, stock: 30, category: 'Smoke' },
    expected: 200,
  });
  assert(created.data?.id, 'Pricing smoke product missing id');
  return Number(created.data.id);
}

async function createLevel(token, name) {
  const created = await call('/pricing/levels', {
    token,
    method: 'POST',
    body: { name },
    expected: 200,
  });
  assert(created.data?.id, `Pricing level create missing id: ${JSON.stringify(created.data)}`);
  return Number(created.data.id);
}

async function matrixRow(token, productId) {
  const matrix = await call('/pricing/matrix', { token, expected: 200 });
  return matrix.data?.products?.find((row) => Number(row.id) === Number(productId));
}

const a = await register('0966118841', 'Pricing Integrity Tenant A');
const b = await register('0966118842', 'Pricing Integrity Tenant B');
const productA = await createProduct(a.token, `PRICE-A-${Date.now()}`);
const productB = await createProduct(b.token, `PRICE-B-${Date.now()}`);
const levelA = await createLevel(a.token, 'Giá VIP Integrity');
const levelB = await createLevel(b.token, 'Giá B Integrity');

// Non-finite prices/ratios must never enter pricing tables.
for (const price of ['Infinity', 'NaN', -1]) {
  await call('/pricing/matrix', {
    token: a.token,
    method: 'POST',
    body: { product_id: productA, level_id: levelA, price },
    expected: 400,
  });
}
for (const body of [
  { product_id: productA, name: 'Thùng Inf Ratio', ratio: 'Infinity', price: 120000 },
  { product_id: productA, name: 'Thùng Nan Ratio', ratio: 'NaN', price: 120000 },
  { product_id: productA, name: 'Thùng Zero Ratio', ratio: 0, price: 120000 },
  { product_id: productA, name: 'Thùng Inf Price', ratio: 12, price: 'Infinity' },
  { product_id: productA, name: 'Thùng Negative Price', ratio: 12, price: -1 },
]) {
  await call('/pricing/units', { token: a.token, method: 'POST', body, expected: 400 });
}

// Cross-tenant product/level references must fail before any write.
await call('/pricing/matrix', {
  token: a.token,
  method: 'POST',
  body: { product_id: productB, level_id: levelA, price: 90000 },
  expected: 404,
});
await call('/pricing/matrix', {
  token: a.token,
  method: 'POST',
  body: { product_id: productA, level_id: levelB, price: 90000 },
  expected: 404,
});
await call('/pricing/units', {
  token: a.token,
  method: 'POST',
  body: { product_id: productB, name: 'Cross Tenant Box', ratio: 10, price: 90000 },
  expected: 404,
});

await call('/pricing/matrix', {
  token: a.token,
  method: 'POST',
  body: { product_id: productA, level_id: levelA, price: 88000 },
  expected: 200,
});
const unitCreated = await call('/pricing/units', {
  token: a.token,
  method: 'POST',
  body: { product_id: productA, name: 'Thùng 12', ratio: 12, price: 1080000 },
  expected: 200,
});
assert(unitCreated.data?.id, 'Valid pricing unit missing id');
const units = await call(`/pricing/units/${productA}`, { token: a.token, expected: 200 });
const unit = units.data?.units?.find((row) => Number(row.id) === Number(unitCreated.data.id));
assert(Number(unit?.ratio) === 12 && Number(unit?.price) === 1080000, `Valid unit mismatch: ${JSON.stringify(unit)}`);

let row = await matrixRow(a.token, productA);
assert(Number(row?.prices?.[levelA]) === 88000, `Matrix price expected 88000: ${JSON.stringify(row)}`);

const customerCreated = await call('/customers', {
  token: a.token,
  method: 'POST',
  body: { name: 'Pricing Level Customer', phone: '0909884411' },
  expected: 201,
});
const customerId = Number(customerCreated.data?.id);
assert(customerId > 0, 'Pricing smoke customer missing id');
await call(`/customers/${customerId}`, {
  token: a.token,
  method: 'PUT',
  body: { price_level_id: levelA },
  expected: 200,
});

const external = new Database(DB_PATH);
external.pragma('busy_timeout = 5000');
external.pragma('journal_mode = WAL');

// Force the FINAL statement in level deletion to fail. The preceding product-price
// delete and customer NULL update must roll back with it.
external.exec(`
  CREATE TRIGGER pricing_integrity_force_delete_failure
  BEFORE DELETE ON price_levels
  WHEN OLD.id = ${levelA}
  BEGIN
    SELECT RAISE(ABORT, 'FORCED_PRICING_DELETE_FAILURE');
  END;
`);
await call(`/pricing/levels/${levelA}`, { token: a.token, method: 'DELETE', expected: 500 });
external.exec('DROP TRIGGER pricing_integrity_force_delete_failure');

const levelAfterRollback = external.prepare('SELECT id FROM price_levels WHERE id = ? AND user_id = ?').get(levelA, '0966118841');
const priceAfterRollback = external.prepare('SELECT price FROM product_prices WHERE product_id = ? AND level_id = ?').get(productA, levelA);
const customerAfterRollback = external.prepare('SELECT price_level_id FROM customers WHERE id = ? AND user_id = ?').get(customerId, '0966118841');
assert(levelAfterRollback?.id, 'Forced delete failure removed the price level');
assert(Number(priceAfterRollback?.price) === 88000, `Forced delete failure partially removed product price: ${JSON.stringify(priceAfterRollback)}`);
assert(Number(customerAfterRollback?.price_level_id) === levelA, `Forced delete failure partially cleared customer level: ${JSON.stringify(customerAfterRollback)}`);

// Successful delete must clean dependent live references in the same commit.
await call(`/pricing/levels/${levelA}`, { token: a.token, method: 'DELETE', expected: 200 });
assert(!external.prepare('SELECT id FROM price_levels WHERE id = ?').get(levelA), 'Deleted price level still exists');
assert(!external.prepare('SELECT 1 FROM product_prices WHERE level_id = ?').get(levelA), 'Deleted price level left product_prices orphan');
const customerAfterDelete = external.prepare('SELECT price_level_id FROM customers WHERE id = ?').get(customerId);
assert(customerAfterDelete?.price_level_id === null, `Deleted price level left customer reference: ${JSON.stringify(customerAfterDelete)}`);

// Matrix write vs delete: both use IMMEDIATE. They may both succeed in sequence, but a
// successful delete must leave no orphan product_prices row.
const raceLevel = await createLevel(a.token, 'Race Matrix Level');
const [raceMatrix, raceDelete] = await Promise.all([
  call('/pricing/matrix', {
    token: a.token,
    method: 'POST',
    body: { product_id: productA, level_id: raceLevel, price: 77000 },
    expected: [200, 404],
  }),
  call(`/pricing/levels/${raceLevel}`, { token: a.token, method: 'DELETE', expected: 200 }),
]);
assert(raceDelete.status === 200, `Race level delete failed: ${raceDelete.status}`);
assert(!external.prepare('SELECT id FROM price_levels WHERE id = ?').get(raceLevel), 'Race delete left level row');
assert(!external.prepare('SELECT 1 FROM product_prices WHERE level_id = ?').get(raceLevel), `Race matrix/delete left orphan price; matrix=${raceMatrix.status}`);

// Customer assignment vs delete: customer update already uses IMMEDIATE and tenant-checks
// the level. After deletion the customer must never point to a missing level.
const customerRaceLevel = await createLevel(a.token, 'Race Customer Level');
const [assignRace, deleteRace] = await Promise.all([
  call(`/customers/${customerId}`, {
    token: a.token,
    method: 'PUT',
    body: { price_level_id: customerRaceLevel },
    expected: [200, 404],
  }),
  call(`/pricing/levels/${customerRaceLevel}`, { token: a.token, method: 'DELETE', expected: 200 }),
]);
assert(deleteRace.status === 200, `Customer race level delete failed: ${deleteRace.status}`);
const finalCustomer = external.prepare('SELECT price_level_id FROM customers WHERE id = ?').get(customerId);
assert(finalCustomer?.price_level_id === null, `Customer/delete race left orphan level reference; assign=${assignRace.status}: ${JSON.stringify(finalCustomer)}`);

external.close();
console.log('PRICING INTEGRITY SMOKE PASSED: finite matrix/unit writes + tenant refs + forced rollback + atomic level cleanup + matrix/customer delete races');
