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

const register = async (phone, name) => {
  const data = await call('/auth/register', { method: 'POST', body: { phone, name, password: 'SpaAudit2026!', sector: 'spa' }, expected: 200 });
  assert(data.token, 'missing token');
  return data;
};

const a = await register('0933333311', 'Spa A');
const b = await register('0933333322', 'Spa B');
const room = await call('/rooms', { token: a.token, method: 'POST', body: { name: 'Giường A1', type: 'Giường', capacity: 1 }, expected: 201 });
const service = await call('/products', { token: a.token, method: 'POST', body: { name: 'Massage 60 phút', sku: 'SPA-MASSAGE-60', price: 350000, cost_price: 0, stock: 0, category: 'Dịch vụ Spa' }, expected: 200 });
const otherService = await call('/products', { token: b.token, method: 'POST', body: { name: 'Dịch vụ tenant B', sku: 'SPA-B', price: 1, cost_price: 0, stock: 0, category: 'Dịch vụ Spa' }, expected: 200 });

await call(`/rooms/${room.id}/spa-session`, { token: a.token, method: 'PUT', body: { items: [{ service_id: service.id }] }, expected: 200 });
let active = await call('/rooms/spa-sessions/active', { token: a.token });
assert(active.length === 1 && active[0].room_id === room.id, 'spa session not persisted');
assert(active[0].items.length === 1 && Number(active[0].total_amount) === 350000, 'spa session authoritative total mismatch');

const activeB = await call('/rooms/spa-sessions/active', { token: b.token });
assert(activeB.length === 0, 'spa session leaked across tenants');
await call(`/rooms/${room.id}/spa-session`, { token: a.token, method: 'PUT', body: { items: [{ service_id: otherService.id }] }, expected: 403 });
await call(`/rooms/${room.id}`, { token: a.token, method: 'DELETE', expected: 409 });

const external = new Database(DB_PATH);
external.pragma('busy_timeout = 5000');
external.prepare('UPDATE products SET price = ? WHERE id = ? AND user_id = ?').run(500000, service.id, a.user.phone);

await call(`/rooms/${room.id}/spa-session`, { token: a.token, method: 'PUT', body: { items: [{ service_id: service.id }] }, expected: 200 });
active = await call('/rooms/spa-sessions/active', { token: a.token });
assert(Number(active[0].total_amount) === 350000, `open spa session floated with catalog price after edit: ${JSON.stringify(active[0])}`);
assert(Number(active[0].items[0].price) === 350000, `spa item snapshot was rewritten after edit: ${JSON.stringify(active[0].items[0])}`);

const checkout = await call(`/rooms/${room.id}/spa-checkout`, { token: a.token, method: 'POST', body: { payment_method: 'cash' }, expected: 200 });
assert(checkout.order_code && Number(checkout.total_amount) === 350000, `spa checkout ignored preserved snapshot: ${JSON.stringify(checkout)}`);
active = await call('/rooms/spa-sessions/active', { token: a.token });
assert(active.length === 0, 'spa session still open after checkout');
const orders = await call('/pos/orders', { token: a.token });
assert(orders.some((order) => order.order_code === checkout.order_code && Number(order.total_amount) === 350000), 'spa POS order not persisted with snapshot total');

await call(`/rooms/${room.id}/spa-session`, { token: a.token, method: 'PUT', body: { items: [{ service_id: service.id }] }, expected: 200 });
active = await call('/rooms/spa-sessions/active', { token: a.token });
assert(active.length === 1 && Number(active[0].total_amount) === 500000, `new spa session did not snapshot current catalog price: ${JSON.stringify(active[0])}`);
await call(`/rooms/${room.id}/spa-session`, { token: a.token, method: 'PUT', body: { items: [] }, expected: 200 });
active = await call('/rooms/spa-sessions/active', { token: a.token });
assert(active.length === 0, 'spa session cancel did not close new session');

external.close();
const products = await call('/products', { token: a.token });
const persistedService = products.find((p) => p.id === service.id);
assert(Number(persistedService.stock) === 0, 'spa service checkout must not mutate stock');

console.log('[SMOKE] SPA PASS: open-session snapshot survives edits; checkout preserves agreed price; new session snapshots latest catalog price');
