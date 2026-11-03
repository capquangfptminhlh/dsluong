const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3101/api';
const assert = (ok, message) => { if (!ok) throw new Error(message); };

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
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
  body: { phone: `09${stamp}${suffix}`.slice(0, 10), name: `Loyalty ${suffix}`, password: 'Loyalty2026!', sector: 'retail' },
  expected: 200
});

const a = await register('1');
const b = await register('2');
assert(a.token && b.token, 'registration missing token');

const seededA = await call('/loyalty/tiers', { token: a.token });
assert(Array.isArray(seededA) && seededA.length === 4, `new tenant seeded tiers mismatch ${JSON.stringify(seededA)}`);
assert(seededA.every((item) => item.id && item.name && Number(item.min_points) >= 0), 'seeded tiers must be persisted records');

await call('/loyalty/tiers', {
  token: a.token,
  method: 'POST',
  body: { name: 'Audit Vàng', min_points: 1000, discount_percent: 5, color: '#f59e0b' },
  expected: 201
});

await call('/loyalty/tiers', {
  token: a.token,
  method: 'POST',
  body: { name: 'Sai', min_points: -1, discount_percent: 101, color: '#000000' },
  expected: 400
});

let tiersA = await call('/loyalty/tiers', { token: a.token });
const tier = tiersA.find((item) => item.name === 'Audit Vàng');
assert(tier?.id, 'created tier missing');

const tiersB = await call('/loyalty/tiers', { token: b.token });
assert(!tiersB.some((item) => item.id === tier.id), 'loyalty tier leaked across tenants');
assert(!tiersB.some((item) => item.name === 'Audit Vàng'), 'tenant B received tenant A custom tier');

await call(`/loyalty/tiers/${tier.id}`, {
  token: a.token,
  method: 'PUT',
  body: { name: 'Audit Vàng Plus', min_points: 1200, discount_percent: 7.5, color: '#eab308' },
  expected: 200
});

tiersA = await call('/loyalty/tiers', { token: a.token });
assert(tiersA.some((item) => item.id === tier.id && item.name === 'Audit Vàng Plus' && Number(item.discount_percent) === 7.5), 'tier update not persisted');

await call(`/loyalty/tiers/${tier.id}`, { token: b.token, method: 'DELETE', expected: 404 });
await call(`/loyalty/tiers/${tier.id}`, { token: a.token, method: 'DELETE', expected: 200 });

tiersA = await call('/loyalty/tiers', { token: a.token });
assert(!tiersA.some((item) => item.id === tier.id), 'tier delete not persisted');

console.log('[SMOKE] LOYALTY PASS');
