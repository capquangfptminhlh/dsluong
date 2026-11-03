const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

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
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (expected !== undefined) {
    assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  } else {
    assert(response.ok, `${method} ${path}: HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, data };
}

const owner = await call('/auth/register', {
  method: 'POST',
  body: { phone: '0966227744', name: 'Promo Permission Tenant', password: 'PromoSmoke2026!', sector: 'retail' },
  expected: 200,
});
const ownerToken = owner.data?.token;
assert(ownerToken, 'Promotion permission smoke: owner registration missing token');

async function createStaff(username, permissions) {
  const created = await call('/staff', {
    token: ownerToken,
    method: 'POST',
    body: {
      name: `Smoke ${username}`,
      username,
      password: 'PromoSmoke2026!',
      role: 'Nhân viên',
      permissions,
    },
    expected: 200,
  });
  assert(created.data?.id, `Promotion permission smoke: staff ${username} not created`);
  const login = await call('/auth/staff-login', {
    method: 'POST',
    body: { username, password: 'PromoSmoke2026!' },
    expected: 200,
  });
  assert(login.data?.token, `Promotion permission smoke: staff ${username} login missing token`);
  return login.data.token;
}

const posToken = await createStaff('smoke_pos_promo_read', ['pos']);
const promoToken = await createStaff('smoke_promo_manager', ['promotions']);

const ownerPromo = await call('/promo', {
  token: ownerToken,
  method: 'POST',
  body: { name: 'Owner promo for permission smoke', min_order_value: 100000, discount_percent: 10 },
  expected: 200,
});
assert(ownerPromo.data?.id, 'Promotion permission smoke: owner promo not created');

const posList = await call('/promo', { token: posToken, expected: 200 });
assert(Array.isArray(posList.data) && posList.data.some((p) => p.id === ownerPromo.data.id), 'POS-only staff cannot read promotions');
const posApplicable = await call('/promo/applicable?total=200000', { token: posToken, expected: 200 });
assert(Array.isArray(posApplicable.data) && posApplicable.data.some((p) => p.id === ownerPromo.data.id), 'POS-only staff cannot read applicable promotions');

await call('/promo', {
  token: posToken,
  method: 'POST',
  body: { name: 'Must be forbidden', discount_percent: 99 },
  expected: 403,
});
await call(`/promo/${ownerPromo.data.id}`, {
  token: posToken,
  method: 'DELETE',
  expected: 403,
});

const promoCreated = await call('/promo', {
  token: promoToken,
  method: 'POST',
  body: { name: 'Promo manager smoke', min_order_value: 0, discount_amount: 5000 },
  expected: 200,
});
assert(promoCreated.data?.id, 'Promotions staff could not create promotion');
await call(`/promo/${promoCreated.data.id}`, {
  token: promoToken,
  method: 'DELETE',
  expected: 200,
});

await import('./smoke-staff-write-boundaries.mjs');

console.log('PROMOTION + STAFF WRITE BOUNDARY SMOKE PASSED');
