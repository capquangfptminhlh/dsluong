import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3106/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';
const PASSWORD = 'SystemBoundary2026!';
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
  return { status: response.status, data, text };
}

async function register(phone, name) {
  const result = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: PASSWORD, sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

const tenantA = await register('0955008801', 'Presence Tenant A');
const tenantB = await register('0955008802', 'Presence Tenant B');

await call('/system/ping', {
  token: tenantA.token,
  method: 'POST',
  body: { phone: '0955008802', name: 'SPOOFED OTHER TENANT' },
  expected: 200,
});

const onlineA = await call('/system/online-users', { token: tenantA.token, expected: 200 });
assert(Array.isArray(onlineA.data) && onlineA.data.length === 1, `Tenant A presence mismatch: ${onlineA.text}`);
assert(onlineA.data[0].phone === '0955008801', `Presence trusted spoofed phone: ${onlineA.text}`);
assert(onlineA.data[0].name !== 'SPOOFED OTHER TENANT', `Presence trusted spoofed name: ${onlineA.text}`);

const onlineBBefore = await call('/system/online-users', { token: tenantB.token, expected: 200 });
assert(Array.isArray(onlineBBefore.data) && onlineBBefore.data.length === 0, `Tenant B saw Tenant A presence: ${onlineBBefore.text}`);

await call('/system/ping', { token: tenantB.token, method: 'POST', body: {}, expected: 200 });
const onlineBAfter = await call('/system/online-users', { token: tenantB.token, expected: 200 });
assert(onlineBAfter.data.length === 1 && onlineBAfter.data[0].phone === '0955008802', `Tenant B presence not isolated: ${onlineBAfter.text}`);
const onlineAAfter = await call('/system/online-users', { token: tenantA.token, expected: 200 });
assert(onlineAAfter.data.length === 1 && onlineAAfter.data[0].phone === '0955008801', `Tenant A saw cross-tenant presence: ${onlineAAfter.text}`);

for (const [method, path] of [
  ['GET', '/system/tunnel'],
  ['POST', '/system/tunnel/start'],
  ['POST', '/system/tunnel/stop'],
]) {
  await call(path, { token: tenantA.token, method, expected: 403 });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('busy_timeout = 5000');
const adminPhone = '0955008899';
const hash = await bcrypt.hash(PASSWORD, 10);
sqlite.prepare('DELETE FROM users WHERE phone = ?').run(adminPhone);
sqlite.prepare(
  `INSERT INTO users (name, phone, password_hash, role, status, sector)
   VALUES ('System Superadmin', ?, ?, 'superadmin', 'active', 'retail')`,
).run(adminPhone, hash);
sqlite.close();

const admin = await call('/auth/login', {
  method: 'POST',
  body: { phone: adminPhone, password: PASSWORD },
  expected: 200,
});
assert(admin.data?.token && admin.data?.user?.role === 'superadmin', 'System superadmin login failed');
await call('/system/tunnel', { token: admin.data.token, expected: 200 });

console.log('SYSTEM BOUNDARY INTEGRITY SMOKE PASSED: authenticated presence is tenant-scoped and tunnel control is superadmin-only');
