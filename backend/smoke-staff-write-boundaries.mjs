const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

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

const owner = await call('/auth/register', {
  method: 'POST',
  body: { phone: '0966338855', name: 'Boundary Owner', password: 'Boundary2026!', sector: 'retail' },
  expected: 200,
});
assert(owner.data?.token, 'Boundary smoke owner registration missing token');
const ownerToken = owner.data.token;

async function staffToken(username, permissions) {
  const created = await call('/staff', {
    token: ownerToken,
    method: 'POST',
    body: { name: username, username, password: 'Boundary2026!', role: 'Nhân viên', permissions },
    expected: 200,
  });
  assert(created.data?.id, `Boundary smoke could not create ${username}`);
  const login = await call('/auth/staff-login', {
    method: 'POST',
    body: { username, password: 'Boundary2026!' },
    expected: 200,
  });
  assert(login.data?.token, `Boundary smoke staff login missing token for ${username}`);
  return login.data.token;
}

const posToken = await staffToken('boundary_pos_only', ['pos']);
const customerToken = await staffToken('boundary_customer_manager', ['customers']);

// Staff may read the shop profile for operational UI, but may never change legal/shop identity.
const profileBefore = await call('/auth/profile', { token: posToken, expected: 200 });
assert(profileBefore.data?.name === 'Boundary Owner', 'POS-only staff cannot read operational shop profile');
await call('/auth/profile', {
  token: posToken,
  method: 'PUT',
  body: { name: 'Tampered by POS', taxCode: 'POS-TAMPER' },
  expected: 403,
});
const profileAfterBlockedWrite = await call('/auth/profile', { token: ownerToken, expected: 200 });
assert(profileAfterBlockedWrite.data?.name === 'Boundary Owner', 'Forbidden staff profile write changed owner data');

await call('/auth/profile', {
  token: ownerToken,
  method: 'PUT',
  body: { name: 'Boundary Owner Updated', taxCode: 'BOUNDARY-OWNER-001' },
  expected: 200,
});
const profileAfterOwnerWrite = await call('/auth/profile', { token: ownerToken, expected: 200 });
assert(profileAfterOwnerWrite.data?.name === 'Boundary Owner Updated', 'Owner profile write was blocked');

const ownerCustomer = await call('/customers', {
  token: ownerToken,
  method: 'POST',
  body: { name: 'Customer visible to POS', phone: '0906338855', tags: 'smoke' },
  expected: 201,
});
assert(ownerCustomer.data?.id, 'Boundary smoke owner customer create failed');

const posCustomers = await call('/customers', { token: posToken, expected: 200 });
assert(Array.isArray(posCustomers.data) && posCustomers.data.some((c) => c.id === ownerCustomer.data.id), 'POS-only staff cannot read customer list');

// POS is intentionally allowed to create a minimal customer at checkout, but not manage profiles.
const posQuickCustomer = await call('/customers', {
  token: posToken,
  method: 'POST',
  body: { name: 'POS quick customer', phone: '0906338856' },
  expected: 201,
});
assert(posQuickCustomer.data?.id, 'POS-only staff could not create the quick customer required by checkout');
await call(`/customers/${posQuickCustomer.data.id}`, {
  token: posToken,
  method: 'PUT',
  body: { name: 'Forbidden POS edit' },
  expected: 403,
});
await call(`/customers/${posQuickCustomer.data.id}`, {
  token: posToken,
  method: 'DELETE',
  expected: 403,
});
await call(`/customers/${ownerCustomer.data.id}`, {
  token: posToken,
  method: 'PUT',
  body: { name: 'Forbidden POS edit existing customer' },
  expected: 403,
});
await call(`/customers/${ownerCustomer.data.id}`, {
  token: posToken,
  method: 'DELETE',
  expected: 403,
});

const managed = await call('/customers', {
  token: customerToken,
  method: 'POST',
  body: { name: 'Customer manager smoke', phone: '0906338857' },
  expected: 201,
});
assert(managed.data?.id, 'Customers-permission staff could not create customer');
await call(`/customers/${managed.data.id}`, {
  token: customerToken,
  method: 'PUT',
  body: { name: 'Customer manager updated' },
  expected: 200,
});
await call(`/customers/${managed.data.id}`, {
  token: customerToken,
  method: 'DELETE',
  expected: 200,
});

// POS needs tier reads for checkout, but must not be able to manually add/subtract loyalty points.
const posTiers = await call('/loyalty/tiers', { token: posToken, expected: 200 });
assert(Array.isArray(posTiers.data), 'POS-only staff cannot read loyalty tiers required by checkout');
await call('/loyalty/add-points', {
  token: posToken,
  method: 'POST',
  body: { customer_id: ownerCustomer.data.id, points: 50, reason: 'Forbidden POS manual adjustment' },
  expected: 403,
});
const customerAdjustment = await call('/loyalty/add-points', {
  token: customerToken,
  method: 'POST',
  body: { customer_id: ownerCustomer.data.id, points: 25, reason: 'Customer manager adjustment' },
  expected: 201,
});
assert(customerAdjustment.data?.id, 'Customers-permission staff could not adjust loyalty points');

await import('./smoke-hrm.mjs');

console.log('STAFF WRITE BOUNDARY + POS QUICK CUSTOMER + LOYALTY WRITE + HRM SMOKE PASSED');
