const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3101/api';
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
  if (expected !== undefined) assert(response.status === expected, `${method} ${path}: expected ${expected}, got ${response.status} ${text}`);
  else assert(response.ok, `${method} ${path}: ${response.status} ${text}`);
  return data;
}

const stamp = String(Date.now()).slice(-7);
const register = (suffix) => call('/auth/register', {
  method: 'POST',
  body: { phone: `09${stamp}${suffix}`.slice(0, 10), name: `CRM ${suffix}`, password: 'Crm2026!', sector: 'retail' },
  expected: 200,
});

const a = await register('1');
const b = await register('2');

const created = await call('/customers', {
  token: a.token,
  method: 'POST',
  body: { name: 'Khách CRM thật', phone: `08${stamp}9`.slice(0, 10), tags: 'VIP test' },
  expected: 201,
});
assert(created.id, 'customer id missing');

await call('/customers', {
  token: a.token,
  method: 'POST',
  body: { name: 'Trùng số', phone: `08${stamp}9`.slice(0, 10) },
  expected: 409,
});

let listA = await call('/customers', { token: a.token });
const customer = listA.find((item) => item.id === created.id);
assert(customer, 'created customer missing from tenant A');
assert(typeof customer.points === 'number', 'customer points missing');
assert(customer.tier_name, 'customer tier missing');

const listB = await call('/customers', { token: b.token });
assert(!listB.some((item) => item.id === created.id), 'customer leaked across tenants');

await call('/loyalty/add-points', {
  token: a.token,
  method: 'POST',
  body: { customer_id: created.id, points: 2500, reason: 'CRM smoke' },
  expected: 201,
});
listA = await call('/customers', { token: a.token });
const upgraded = listA.find((item) => item.id === created.id);
assert(upgraded.points >= 2500, 'loyalty points not reflected in CRM');
assert(upgraded.tier_name === 'Vàng' || upgraded.tier_name === 'Kim cương', `unexpected tier ${upgraded.tier_name}`);

const orders = await call(`/customers/${created.id}/orders`, { token: a.token });
assert(Array.isArray(orders) && orders.length === 0, 'new customer order history should be empty');
await call(`/customers/${created.id}/orders`, { token: b.token, expected: 404 });

// Staff commissions are also CRM-adjacent money history. Keep their retry/order-reference
// regression attached to a permanent Full Gate step without adding another workflow block.
await import('./smoke-commission-integrity.mjs');

console.log('[SMOKE] CRM + COMMISSION INTEGRITY PASS');
