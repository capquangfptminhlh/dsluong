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
    body: { phone, name, password: 'ComboIntegrity2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name}: registration missing token`);
  return result.data;
}

async function createProduct(token, sku, stock = 12) {
  const created = await call('/products', {
    token,
    method: 'POST',
    body: { name: `Combo Product ${sku}`, sku, price: 60000, cost_price: 30000, stock, category: 'Smoke' },
    expected: 200,
  });
  assert(created.data?.id, 'Combo smoke product missing id');
  return Number(created.data.id);
}

async function createCombo(token, body, expected = 200) {
  return call('/pd/combos', { token, method: 'POST', body, expected });
}

async function productStock(token, id) {
  const rows = (await call('/products', { token, expected: 200 })).data;
  const row = rows.find((item) => Number(item.id) === Number(id));
  assert(row, `Product ${id} missing`);
  return Number(row.stock || 0);
}

const aPhone = '0966118861';
const bPhone = '0966118862';
const a = await register(aPhone, 'Combo Integrity Tenant A');
const b = await register(bPhone, 'Combo Integrity Tenant B');
const productA = await createProduct(a.token, `COMBO-A-${Date.now()}`, 12);
const productB = await createProduct(b.token, `COMBO-B-${Date.now()}`, 12);

for (const body of [
  { name: 'Bad price infinity', price: 'Infinity', items: [{ product_id: productA, quantity: 1 }] },
  { name: 'Bad price negative', price: -1, items: [{ product_id: productA, quantity: 1 }] },
  { name: 'Bad qty infinity', price: 100000, items: [{ product_id: productA, quantity: 'Infinity' }] },
  { name: 'Bad qty nan', price: 100000, items: [{ product_id: productA, quantity: 'NaN' }] },
  { name: 'Bad qty zero', price: 100000, items: [{ product_id: productA, quantity: 0 }] },
]) {
  await createCombo(a.token, body, 400);
}
await createCombo(a.token, {
  name: 'Cross tenant combo', price: 100000, items: [{ product_id: productB, quantity: 1 }],
}, 403);

const external = new Database(DB_PATH);
external.pragma('busy_timeout = 5000');
external.pragma('journal_mode = WAL');

// Force a component insert failure after the combo header has been inserted. The entire
// create must roll back so no header-only combo can survive.
external.exec(`
  CREATE TRIGGER combo_integrity_force_item_failure
  BEFORE INSERT ON combo_items
  WHEN NEW.product_id = ${productA} AND NEW.quantity = 7
  BEGIN
    SELECT RAISE(ABORT, 'FORCED_COMBO_ITEM_FAILURE');
  END;
`);
await createCombo(a.token, {
  name: 'Combo rollback header', price: 120000, items: [{ product_id: productA, quantity: 7 }],
}, 500);
external.exec('DROP TRIGGER combo_integrity_force_item_failure');
assert(!external.prepare('SELECT id FROM combos WHERE user_id = ? AND name = ?').get(aPhone, 'Combo rollback header'), 'Failed combo create left header row');

// Duplicate product lines must normalize to one component with summed quantity. This also
// keeps the legacy ban_duoc calculation correct.
const normalized = await createCombo(a.token, {
  name: 'Combo normalized duplicate',
  sku: `COMBO-NORM-${Date.now()}`,
  price: 150000,
  items: [
    { product_id: productA, quantity: 1 },
    { product_id: productA, quantity: 2 },
  ],
});
const comboId = Number(normalized.data?.id);
assert(comboId > 0, 'Normalized combo missing id');
const comboRows = (await call('/pd/combos', { token: a.token, expected: 200 })).data;
const combo = comboRows.find((row) => Number(row.id) === comboId);
assert(combo, 'Normalized combo missing from list');
assert(combo.items?.length === 1, `Duplicate product lines were not aggregated: ${JSON.stringify(combo.items)}`);
assert(Number(combo.items[0].quantity) === 3, `Aggregated combo quantity expected 3: ${JSON.stringify(combo.items)}`);
assert(Number(combo.ban_duoc) === 4, `Combo ban_duoc expected floor(12/3)=4, got ${combo.ban_duoc}`);

const beforeSaleStock = await productStock(a.token, productA);
const sale = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{ combo_id: comboId, quantity: 1 }],
    paid_cash: 150000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 200,
});
const orderId = Number(String(sale.data?.receipt_url || '').split('/').pop());
assert(orderId > 0, `Combo sale missing order id: ${JSON.stringify(sale.data)}`);
assert(await productStock(a.token, productA) === beforeSaleStock - 3, 'Combo sale did not subtract aggregated component quantity');

// Once a combo has order history its composition must remain for historical cancel/stock restore.
await call(`/pd/combos/${comboId}`, { token: a.token, method: 'DELETE', expected: 409 });
assert(external.prepare('SELECT id FROM combos WHERE id = ? AND user_id = ?').get(comboId, aPhone), 'Used combo disappeared after blocked delete');
assert(Number(external.prepare('SELECT COUNT(*) AS c FROM combo_items WHERE combo_id = ?').get(comboId).c) === 1, 'Used combo items disappeared after blocked delete');

await call(`/pos/${orderId}/cancel`, {
  token: a.token,
  method: 'POST',
  body: { cancel_reason: 'Combo history restore smoke' },
  expected: 200,
});
assert(await productStock(a.token, productA) === beforeSaleStock, 'Cancel did not restore combo component stock');

// Persistence guard independently protects checkout from a stale combo object. Delete an
// unused combo, then attempt a direct pos_order_items insert referencing that removed id.
const triggerCombo = await createCombo(a.token, {
  name: 'Combo persistence guard', price: 60000, items: [{ product_id: productA, quantity: 1 }],
});
const triggerComboId = Number(triggerCombo.data.id);
await call(`/pd/combos/${triggerComboId}`, { token: a.token, method: 'DELETE', expected: 200 });
let triggerBlocked = false;
external.exec('BEGIN');
try {
  const order = external.prepare(`
    INSERT INTO pos_orders (user_id, order_code, subtotal, discount, total_amount, status)
    VALUES (?, ?, 60000, 0, 60000, 'paid')
  `).run(aPhone, `COMBO-GUARD-${Date.now()}`);
  external.prepare(`
    INSERT INTO pos_order_items (order_id, product_id, product_name, quantity, price, discount, combo_id)
    VALUES (?, NULL, 'Deleted combo', 1, 60000, 0, ?)
  `).run(Number(order.lastInsertRowid), triggerComboId);
} catch (error) {
  triggerBlocked = String(error?.message || '').includes('COMBO_REFERENCE_INVALID');
} finally {
  external.exec('ROLLBACK');
}
assert(triggerBlocked, 'SQLite combo reference trigger did not block deleted combo persistence');

// Checkout-vs-delete race: if checkout commits first, delete sees order history and returns
// 409. If delete commits first (or between pre-read and item insert), checkout fails closed.
const raceCombo = await createCombo(a.token, {
  name: 'Combo checkout delete race', price: 60000, items: [{ product_id: productA, quantity: 1 }],
});
const raceComboId = Number(raceCombo.data.id);
const [raceCheckout, raceDelete] = await Promise.all([
  call('/pos/checkout', {
    token: a.token,
    method: 'POST',
    body: { cart: [{ combo_id: raceComboId, quantity: 1 }], paid_cash: 60000, paid_bank: 0 },
    expected: [200, 403, 409, 500],
  }),
  call(`/pd/combos/${raceComboId}`, { token: a.token, method: 'DELETE', expected: [200, 409] }),
]);
assert([raceCheckout, raceDelete].filter((result) => result.status === 200).length === 1,
  `Combo checkout/delete race expected exactly one winner, got checkout=${raceCheckout.status}, delete=${raceDelete.status}`);
if (raceCheckout.status === 200) {
  assert(raceDelete.status === 409, `Checkout won but delete did not preserve history: ${raceDelete.status}`);
  assert(external.prepare('SELECT id FROM combos WHERE id = ? AND user_id = ?').get(raceComboId, aPhone), 'Checkout won but combo was deleted');
} else {
  assert(raceDelete.status === 200, `Checkout lost but delete did not win: ${raceDelete.status}`);
  assert(!external.prepare('SELECT id FROM combos WHERE id = ? AND user_id = ?').get(raceComboId, aPhone), 'Delete won but combo still exists');
}

external.close();
console.log('COMBO INTEGRITY SMOKE PASSED: finite + tenant + duplicate normalization + forced rollback + used-history delete guard + cancel restore + persistence trigger + checkout/delete serialization');
