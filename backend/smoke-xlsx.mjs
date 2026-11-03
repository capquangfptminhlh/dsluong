import * as XLSX from 'xlsx';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const PASSWORD = 'AuditCore2026!';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonCall(path, { method = 'GET', token, body, expected = 200 } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  assert(response.status === expected, `${method} ${path}: expected ${expected}, got ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function binaryXlsx(path, token, expectedSheet) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(response.status === 200, `GET ${path}: expected 200, got ${response.status}`);
  const type = response.headers.get('content-type') || '';
  assert(type.includes('spreadsheetml.sheet'), `GET ${path}: unexpected content-type ${type}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert(bytes.length > 500, `GET ${path}: XLSX payload too small (${bytes.length} bytes)`);
  const workbook = XLSX.read(bytes, { type: 'array' });
  assert(workbook.SheetNames.includes(expectedSheet), `GET ${path}: missing sheet ${expectedSheet}; got ${workbook.SheetNames.join(', ')}`);
  const sheet = workbook.Sheets[expectedSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  assert(rows.length >= 1, `GET ${path}: workbook has no rows`);
  return rows;
}

const tenant = await jsonCall('/auth/login', {
  method: 'POST',
  body: { phone: '0911111111', password: PASSWORD },
});
assert(tenant?.token, 'Tenant A login missing token');
const revenueRows = await binaryXlsx('/transactions/export', tenant.token, 'Phan loai doanh thu');
assert(revenueRows[0]?.[0] === 'Ngày', 'Revenue XLSX header mismatch');

// Superadmin is a platform authority and must never be minted by public registration.
// Provision the test admin directly in the isolated DB, then verify the normal login/export path.
const superadminPhone = '0979164124';
const sqlite = new Database('autotax.db');
sqlite.pragma('busy_timeout = 5000');
const adminHash = await bcrypt.hash(PASSWORD, 10);
sqlite.prepare('DELETE FROM users WHERE phone = ?').run(superadminPhone);
sqlite.prepare(
  `INSERT INTO users (name, phone, password_hash, role, status, sector)
   VALUES ('Superadmin Audit', ?, ?, 'superadmin', 'active', 'retail')`,
).run(superadminPhone, adminHash);
sqlite.close();

const superadmin = await jsonCall('/auth/login', {
  method: 'POST',
  body: { phone: superadminPhone, password: PASSWORD },
});
assert(superadmin?.token && superadmin?.user?.role === 'superadmin', 'Out-of-band superadmin login/token mismatch');
const userRows = await binaryXlsx('/auth/users/export', superadmin.token, 'Leads');
assert(userRows[0]?.[0] === 'ID' && userRows[0]?.[2] === 'SĐT', 'Users XLSX header mismatch');

console.log('XLSX SMOKE PASSED: revenue review + out-of-band superadmin users export produce readable workbooks');
