import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3101/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';
const assert = (ok, message) => { if (!ok) throw new Error(message); };

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (expected !== undefined) assert(response.status === expected, `${method} ${path}: expected ${expected}, got ${response.status}: ${text}`);
  else assert(response.ok, `${method} ${path}: ${response.status}: ${text}`);
  return data;
}

const stamp = String(Date.now()).slice(-7);
const register = (suffix) => call('/auth/register', {
  method: 'POST',
  body: { phone: `09${stamp}${suffix}`.slice(0, 10), name: `FNB ${suffix}`, password: 'FnbAudit2026!', sector: 'fnb' },
  expected: 200,
});

const a = await register('1');
const b = await register('2');
const tableA = await call('/rooms', { token: a.token, method: 'POST', body: { name: 'Bàn A1', type: 'Bàn', capacity: 4 }, expected: 201 });
const tableA2 = await call('/rooms', { token: a.token, method: 'POST', body: { name: 'Bàn A2', type: 'Bàn', capacity: 4 }, expected: 201 });
const productA = await call('/products', { token: a.token, method: 'POST', body: { name: 'Cà phê test', sku: `CF-${stamp}`, price: 30000, cost_price: 10000, stock: 10, category: 'Đồ uống' }, expected: 200 });
const productB = await call('/products', { token: b.token, method: 'POST', body: { name: 'Món tenant B', sku: `B-${stamp}`, price: 1, cost_price: 0, stock: 10, category: 'Đồ uống' }, expected: 200 });

await call(`/fnb/rooms/${tableA.id}/session`, { token: a.token, method: 'PUT', body: { items: [{ product_id: productA.id, quantity: 2, note: 'Ít đá' }] }, expected: 200 });
let active = await call('/fnb/sessions/active', { token: a.token });
assert(active.length === 1 && active[0].room_id === tableA.id, 'F&B session not persisted');
assert(active[0].items.length === 1 && Number(active[0].total_amount) === 60000, 'F&B authoritative total mismatch');
assert(active[0].items[0].note === 'Ít đá', 'F&B note not persisted');
assert(String(active[0].unit_name || '').startsWith('__FNB_'), 'F&B snapshot unit missing');

const activeB = await call('/fnb/sessions/active', { token: b.token });
assert(activeB.length === 0, 'F&B session leaked across tenants');
await call(`/fnb/rooms/${tableA.id}/session`, { token: a.token, method: 'PUT', body: { items: [{ product_id: productB.id, quantity: 1 }] }, expected: 403 });
await call(`/rooms/${tableA.id}`, { token: a.token, method: 'DELETE', expected: 409 });

await call(`/fnb/rooms/${tableA.id}/kitchen`, { token: a.token, method: 'POST', expected: 200 });
active = await call('/fnb/sessions/active', { token: a.token });
assert(Number(active[0].sent_to_kitchen) === 1, 'kitchen state not persisted');

await call(`/fnb/rooms/${tableA.id}/transfer`, { token: a.token, method: 'POST', body: { target_room_id: tableA2.id }, expected: 200 });
active = await call('/fnb/sessions/active', { token: a.token });
assert(active.length === 1 && active[0].room_id === tableA2.id, 'table transfer not persisted');

const session = active[0];
const external = new Database(DB_PATH);
external.pragma('busy_timeout = 5000');
external.prepare('UPDATE products SET price = ? WHERE id = ? AND user_id = ?').run(50000, productA.id, a.user.phone);

active = await call('/fnb/sessions/active', { token: a.token });
assert(Number(active[0].total_amount) === 60000, `Open F&B session floated with menu price: ${JSON.stringify(active[0])}`);

await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: { cart: [{ id: productA.id, quantity: 2, unit_name: session.unit_name }], customer_name: 'Bypass F&B', payment_method: 'cash' },
  expected: 403,
});

await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: { fnb_session_id: session.id, cart: [{ id: productA.id, quantity: 1 }], customer_name: 'Mismatch F&B', payment_method: 'cash' },
  expected: 409,
});

const checkout = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: { fnb_session_id: session.id, cart: [{ id: productA.id, quantity: 2 }], customer_name: 'Khách lẻ F&B', payment_method: 'cash' },
  expected: 200,
});
assert(checkout.order_code && Number(checkout.total_amount) === 60000, `POS checkout ignored F&B snapshot: ${JSON.stringify(checkout)}`);
await call(`/fnb/sessions/${session.id}/complete`, { token: a.token, method: 'POST', body: { order_code: checkout.order_code }, expected: 200 });
active = await call('/fnb/sessions/active', { token: a.token });
assert(active.length === 0, 'F&B session still open after complete');
assert(Number(external.prepare('SELECT COUNT(*) AS count FROM product_units WHERE user_id = ? AND name = ?').get(a.user.phone, session.unit_name)?.count || 0) === 0, 'F&B internal snapshot unit was not cleaned after complete');
external.close();

const products = await call('/products', { token: a.token });
const persisted = products.find((p) => p.id === productA.id);
assert(Number(persisted.stock) === 8, `F&B checkout stock mismatch: ${persisted?.stock}`);

console.log('[SMOKE] FNB PASS: persistent session + tenant isolation + price snapshot + bypass guard + exact-cart checkout + stock lifecycle');
