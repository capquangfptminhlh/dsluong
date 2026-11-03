import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const SUPERADMIN_PHONE = '0979164124';
const PASSWORD = 'AccountLifecycle2026!';

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
    body: { phone, name, password: PASSWORD, sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token && Number(result.data?.user?.id) > 0, `${name}: registration missing token/id`);
  return result.data;
}

const sqlite = new Database('autotax.db');
sqlite.pragma('busy_timeout = 5000');

// Provision platform authority directly in the isolated DB. Public registration must never
// create a superadmin; this test only exercises lifecycle behavior of an existing admin.
const adminHash = await bcrypt.hash(PASSWORD, 10);
const existingAdmin = sqlite.prepare('SELECT id FROM users WHERE phone = ?').get(SUPERADMIN_PHONE);
if (existingAdmin) sqlite.prepare('DELETE FROM users WHERE phone = ?').run(SUPERADMIN_PHONE);
const adminInsert = sqlite.prepare(
  `INSERT INTO users (name, phone, password_hash, role, status, sector)
   VALUES ('Lifecycle Superadmin', ?, ?, 'superadmin', 'active', 'retail')`,
).run(SUPERADMIN_PHONE, adminHash);
const adminId = Number(adminInsert.lastInsertRowid);
assert(adminId > 0, 'Failed to create lifecycle superadmin');

const adminLogin = await call('/auth/login', {
  method: 'POST',
  body: { phone: SUPERADMIN_PHONE, password: PASSWORD },
  expected: 200,
});
const adminToken = adminLogin.data?.token;
assert(adminToken && adminLogin.data?.user?.role === 'superadmin', 'Superadmin login/token mismatch');

const tenantPhone = '0977888801';
const tenant = await register(tenantPhone, 'Lifecycle Tenant');
const ownerToken = tenant.token;
const ownerId = Number(tenant.user.id);

const product = await call('/products', {
  token: ownerToken,
  method: 'POST',
  body: {
    name: 'Lifecycle Protected Product',
    sku: `ACCOUNT-LIFE-${Date.now()}`,
    price: 120000,
    cost_price: 60000,
    stock: 0,
    category: 'Smoke',
  },
  expected: 200,
});
assert(Number(product.data?.id) > 0, 'Failed to seed tenant business data');

const staffUsername = `lifecycle_${Date.now()}`;
const staffCreate = await call('/staff', {
  token: ownerToken,
  method: 'POST',
  body: {
    name: 'Lifecycle Staff',
    username: staffUsername,
    password: PASSWORD,
    role: 'Thu ngân',
    permissions: ['products', 'pos'],
  },
  expected: 200,
});
const staffId = Number(staffCreate.data?.id);
assert(staffId > 0, 'Failed to create lifecycle staff');

const initialStaffLogin = await call('/auth/staff-login', {
  method: 'POST',
  body: { username: staffUsername, password: PASSWORD },
  expected: 200,
});
const staffToken = initialStaffLogin.data?.token;
assert(staffToken, 'Initial staff login missing token');
await call('/products', { token: staffToken, expected: 200 });

const selfLock = await call(`/auth/users/${adminId}/lock`, {
  token: adminToken,
  method: 'POST',
  body: { locked: true },
  expected: 409,
});
assert(/tự khóa|superadmin/i.test(String(selfLock.data?.error || '')), `Self-lock guard message missing: ${JSON.stringify(selfLock.data)}`);
await call('/auth/users', { token: adminToken, expected: 200 });

const locked = await call(`/auth/users/${ownerId}/lock`, {
  token: adminToken,
  method: 'POST',
  body: { locked: true },
  expected: 200,
});
assert(locked.data?.status === 'locked', `Tenant lock response mismatch: ${JSON.stringify(locked.data)}`);

await call('/auth/profile', { token: ownerToken, expected: 403 });
await call('/products', { token: staffToken, expected: 403 });
await call('/auth/login', {
  method: 'POST',
  body: { phone: tenantPhone, password: PASSWORD },
  expected: 403,
});
await call('/auth/staff-login', {
  method: 'POST',
  body: { username: staffUsername, password: PASSWORD },
  expected: 403,
});

const lockedRow = sqlite.prepare('SELECT status FROM users WHERE id = ? AND phone = ?').get(ownerId, tenantPhone);
assert(lockedRow?.status === 'locked', 'Tenant status did not persist as locked');
assert(Number(sqlite.prepare('SELECT COUNT(*) AS count FROM products WHERE user_id = ?').get(tenantPhone)?.count || 0) === 1, 'Lock operation mutated tenant business data');
assert(Number(sqlite.prepare('SELECT COUNT(*) AS count FROM staff WHERE user_id = ?').get(tenantPhone)?.count || 0) === 1, 'Lock operation mutated staff data');

const hardDelete = await call(`/auth/users/${ownerId}`, {
  token: adminToken,
  method: 'DELETE',
  expected: 409,
});
assert(/xóa cứng|Khóa tài khoản|sao lưu/i.test(String(hardDelete.data?.error || '')), `Hard-delete guard message missing: ${JSON.stringify(hardDelete.data)}`);
assert(sqlite.prepare('SELECT id FROM users WHERE id = ? AND phone = ?').get(ownerId, tenantPhone), 'Blocked hard-delete removed user row');
assert(Number(sqlite.prepare('SELECT COUNT(*) AS count FROM products WHERE user_id = ?').get(tenantPhone)?.count || 0) === 1, 'Blocked hard-delete removed tenant data');

const unlocked = await call(`/auth/users/${ownerId}/lock`, {
  token: adminToken,
  method: 'POST',
  body: { locked: false },
  expected: 200,
});
assert(unlocked.data?.status === 'active', `Tenant unlock response mismatch: ${JSON.stringify(unlocked.data)}`);

await call('/auth/profile', { token: ownerToken, expected: 200 });
await call('/products', { token: staffToken, expected: 200 });
const ownerRelogin = await call('/auth/login', {
  method: 'POST',
  body: { phone: tenantPhone, password: PASSWORD },
  expected: 200,
});
assert(ownerRelogin.data?.token, 'Owner login did not recover after unlock');
const staffRelogin = await call('/auth/staff-login', {
  method: 'POST',
  body: { username: staffUsername, password: PASSWORD },
  expected: 200,
});
assert(staffRelogin.data?.token, 'Staff login did not recover after tenant unlock');

await call(`/staff/${staffId}/lock`, {
  token: ownerRelogin.data.token,
  method: 'POST',
  body: { locked: true },
  expected: 200,
});
await call('/products', { token: staffRelogin.data.token, expected: 403 });
await call('/auth/staff-login', {
  method: 'POST',
  body: { username: staffUsername, password: PASSWORD },
  expected: 403,
});
await call(`/staff/${staffId}/lock`, {
  token: ownerRelogin.data.token,
  method: 'POST',
  body: { locked: false },
  expected: 200,
});
const staffAfterUnlock = await call('/auth/staff-login', {
  method: 'POST',
  body: { username: staffUsername, password: PASSWORD },
  expected: 200,
});
assert(staffAfterUnlock.data?.token, 'Staff login did not recover after staff unlock');

// Cleanup only this test's out-of-band platform admin. Later smokes provision their own
// admin directly as needed; none may rely on public registration for platform authority.
sqlite.prepare('DELETE FROM users WHERE id = ? AND phone = ?').run(adminId, SUPERADMIN_PHONE);
sqlite.close();

console.log('ACCOUNT LIFECYCLE INTEGRITY SMOKE PASSED: live owner/staff revocation + parent lock + safe unlock + online hard-delete blocked');
