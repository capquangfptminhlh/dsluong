import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

await import('./smoke-pos-manual-discount-permission.mjs');

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
    body: { phone, name, password: 'PromoIntegrity2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name}: registration missing token`);
  return result.data;
}

async function createProduct(token, sku, stock = 20) {
  const created = await call('/products', {
    token,
    method: 'POST',
    body: { name: `Promo Product ${sku}`, sku, price: 100000, cost_price: 50000, stock, category: 'Smoke' },
    expected: 200,
  });
  assert(created.data?.id, 'Promotion smoke product missing id');
  return Number(created.data.id);
}

async function createPromo(token, body) {
  const created = await call('/promo', { token, method: 'POST', body, expected: 200 });
  assert(created.data?.id, `Promotion create missing id: ${JSON.stringify(created.data)}`);
  return Number(created.data.id);
}

const a = await register('0966118831', 'Promotion Integrity Tenant A');
const b = await register('0966118832', 'Promotion Integrity Tenant B');
const productA = await createProduct(a.token, `PROMO-A-${Date.now()}`);
const productB = await createProduct(b.token, `PROMO-B-${Date.now()}`);

for (const body of [
  { name: 'Bad min', min_order_value: 'Infinity', discount_percent: 10 },
  { name: 'Bad percent infinite', min_order_value: 0, discount_percent: 'Infinity' },
  { name: 'Bad percent negative', min_order_value: 0, discount_percent: -1 },
  { name: 'Bad percent high', min_order_value: 0, discount_percent: 101 },
  { name: 'Bad amount', min_order_value: 0, discount_amount: -5000 },
]) {
  await call('/promo', { token: a.token, method: 'POST', body, expected: 400 });
}

const percentPromo = await createPromo(a.token, {
  name: 'Server authoritative 10 percent',
  min_order_value: 100000,
  discount_percent: 10,
  discount_amount: 0,
});

const applicable = await call('/promo/applicable?total=200000', { token: a.token, expected: 200 });
const applicablePromo = applicable.data?.find((row) => Number(row.id) === percentPromo);
assert(Number(applicablePromo?.discount_value) === 20000, `Applicable promotion expected 20000, got ${JSON.stringify(applicablePromo)}`);

const paid = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{ id: productA, quantity: 2 }],
    promotion_id: percentPromo,
    discount: 1,
    paid_cash: 180000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 200,
});
assert(Number(paid.data?.subtotal) === 200000, `Promotion checkout subtotal mismatch: ${JSON.stringify(paid.data)}`);
assert(Number(paid.data?.discount) === 20000, `Promotion checkout trusted forged discount: ${JSON.stringify(paid.data)}`);
assert(Number(paid.data?.total_amount) === 180000, `Promotion checkout total mismatch: ${JSON.stringify(paid.data)}`);

await call(`/promo/${percentPromo}`, { token: a.token, method: 'DELETE', expected: 409 });
const listAfterBlockedDelete = await call('/promo', { token: a.token, expected: 200 });
assert(listAfterBlockedDelete.data?.some((row) => Number(row.id) === percentPromo), 'Used promotion disappeared after blocked delete');

await call('/pos/checkout', {
  token: b.token,
  method: 'POST',
  body: {
    cart: [{ id: productB, quantity: 1 }],
    promotion_id: percentPromo,
    discount: 10000,
    paid_cash: 90000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 403,
});

const minPromo = await createPromo(a.token, {
  name: 'Minimum order guard',
  min_order_value: 200000,
  discount_amount: 5000,
});
await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{ id: productA, quantity: 1 }],
    promotion_id: minPromo,
    discount: 5000,
    paid_cash: 95000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 409,
});
await call(`/promo/${minPromo}`, { token: a.token, method: 'DELETE', expected: 200 });

const expiredPromo = await createPromo(a.token, {
  name: 'Expired promotion guard',
  min_order_value: 0,
  discount_amount: 5000,
});
const external = new Database(DB_PATH);
external.pragma('busy_timeout = 5000');
external.prepare('UPDATE promotions SET end_date = ? WHERE id = ? AND user_id = ?').run('2000-01-01', expiredPromo, '0966118831');
await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{ id: productA, quantity: 1 }],
    promotion_id: expiredPromo,
    discount: 5000,
    paid_cash: 95000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 409,
});
external.prepare('UPDATE promotions SET end_date = NULL WHERE id = ? AND user_id = ?').run(expiredPromo, '0966118831');
await call(`/promo/${expiredPromo}`, { token: a.token, method: 'DELETE', expected: 200 });

const triggerPromo = await createPromo(a.token, {
  name: 'Persistence trigger guard',
  min_order_value: 0,
  discount_percent: 10,
});
let triggerBlocked = false;
try {
  external.prepare(`
    INSERT INTO pos_orders (user_id, order_code, subtotal, discount, promotion_id, total_amount, status)
    VALUES (?, ?, ?, ?, ?, ?, 'paid')
  `).run('0966118831', `BADPROMO-${Date.now()}`, 100000, 1, triggerPromo, 99999);
} catch (error) {
  triggerBlocked = String(error?.message || '').includes('PROMOTION_POLICY_MISMATCH');
}
assert(triggerBlocked, 'SQLite promotion policy trigger did not reject mismatched persisted discount');
await call(`/promo/${triggerPromo}`, { token: a.token, method: 'DELETE', expected: 200 });

const racePromo = await createPromo(a.token, {
  name: 'Checkout delete race',
  min_order_value: 0,
  discount_amount: 5000,
});
const [raceCheckout, raceDelete] = await Promise.all([
  call('/pos/checkout', {
    token: a.token,
    method: 'POST',
    body: {
      cart: [{ id: productA, quantity: 1 }],
      promotion_id: racePromo,
      discount: 0,
      paid_cash: 95000,
      paid_bank: 0,
      payment_method: 'cash',
    },
    expected: [200, 403, 409],
  }),
  call(`/promo/${racePromo}`, {
    token: a.token,
    method: 'DELETE',
    expected: [200, 409],
  }),
]);
const successCount = [raceCheckout, raceDelete].filter((result) => result.status === 200).length;
assert(successCount === 1, `Checkout/delete race expected exactly one winner, got checkout=${raceCheckout.status}, delete=${raceDelete.status}`);

if (raceCheckout.status === 200) {
  const remaining = external.prepare('SELECT id FROM promotions WHERE id = ? AND user_id = ?').get(racePromo, '0966118831');
  assert(remaining, 'Checkout won race but promotion history row was deleted');
} else {
  const removed = external.prepare('SELECT id FROM promotions WHERE id = ? AND user_id = ?').get(racePromo, '0966118831');
  assert(!removed, 'Delete won race but promotion still exists');
}

external.close();
console.log('PROMOTION INTEGRITY SMOKE PASSED: finite create + server-authoritative selected discount + policy/date/min/tenant guards + history-safe delete + persistence trigger + checkout/delete serialization + manual discount authority');
