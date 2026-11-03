import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3106/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';
const PASSWORD = 'BackupAccess2026!';
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
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (expected !== undefined) {
    assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  } else {
    assert(response.ok, `${method} ${path}: HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, data, text };
}

const ownerPhone = '0955008701';
const owner = await call('/auth/register', {
  method: 'POST',
  body: { phone: ownerPhone, name: 'Backup Tenant Owner', password: PASSWORD, sector: 'retail' },
  expected: 200,
});
assert(owner.data?.token, 'Tenant owner registration missing token');

for (const [method, path] of [
  ['GET', '/backup'],
  ['POST', '/backup/create'],
  ['GET', '/backup/restore/status'],
  ['DELETE', '/backup/restore/pending'],
]) {
  await call(path, { token: owner.data.token, method, expected: 403 });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('busy_timeout = 5000');
const adminPhone = '0955008799';
const hash = await bcrypt.hash(PASSWORD, 10);
sqlite.prepare('DELETE FROM users WHERE phone = ?').run(adminPhone);
sqlite.prepare(
  `INSERT INTO users (name, phone, password_hash, role, status, sector)
   VALUES ('Backup Superadmin', ?, ?, 'superadmin', 'active', 'retail')`,
).run(adminPhone, hash);
sqlite.close();

const admin = await call('/auth/login', {
  method: 'POST',
  body: { phone: adminPhone, password: PASSWORD },
  expected: 200,
});
assert(admin.data?.token && admin.data?.user?.role === 'superadmin', 'Superadmin login failed');

const created = await call('/backup/create', { token: admin.data.token, method: 'POST', expected: 200 });
assert(created.data?.success && created.data?.name?.endsWith('.db'), `Superadmin backup create failed: ${created.text}`);
const list = await call('/backup', { token: admin.data.token, expected: 200 });
assert(Array.isArray(list.data) && list.data.some((row) => row.name === created.data.name), 'Created backup missing from superadmin list');

const ownerDownload = await call(`/backup/download/${encodeURIComponent(created.data.name)}`, {
  token: owner.data.token,
  expected: 403,
});
assert(ownerDownload.status === 403, 'Tenant owner downloaded a full-system backup');

await call(`/backup/${encodeURIComponent(created.data.name)}`, {
  token: owner.data.token,
  method: 'DELETE',
  expected: 403,
});
await call(`/backup/${encodeURIComponent(created.data.name)}`, {
  token: admin.data.token,
  method: 'DELETE',
  expected: 200,
});

console.log('BACKUP ACCESS INTEGRITY SMOKE PASSED: full-system backup/restore surface is superadmin-only');
