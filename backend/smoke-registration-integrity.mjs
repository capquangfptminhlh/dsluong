import Database from 'better-sqlite3';

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

function tenantCounts(sqlite, phone) {
  const user = sqlite.prepare('SELECT id, phone, role, status, sector FROM users WHERE phone = ?').all(phone);
  const levels = sqlite.prepare('SELECT name, is_default FROM price_levels WHERE user_id = ? ORDER BY id').all(phone);
  const branches = sqlite.prepare('SELECT name, is_default, status FROM branches WHERE user_id = ? ORDER BY id').all(phone);
  const tiers = sqlite.prepare('SELECT name, min_points, discount_percent FROM customer_tiers WHERE user_id = ? ORDER BY min_points').all(phone);
  return { user, levels, branches, tiers };
}

function assertCompleteTenant(snapshot, phone) {
  assert(snapshot.user.length === 1, `${phone}: expected one user, got ${snapshot.user.length}`);
  assert(snapshot.levels.length === 3, `${phone}: expected 3 price levels, got ${snapshot.levels.length}`);
  assert(snapshot.levels.filter((row) => Number(row.is_default) === 1).length === 1, `${phone}: expected one default price level`);
  assert(snapshot.levels.some((row) => row.name === 'Giá lẻ' && Number(row.is_default) === 1), `${phone}: default retail price level missing`);
  assert(snapshot.branches.length === 1, `${phone}: expected one initial branch, got ${snapshot.branches.length}`);
  assert(snapshot.branches[0].name === 'Chi nhánh chính', `${phone}: initial branch name mismatch`);
  assert(Number(snapshot.branches[0].is_default) === 1, `${phone}: initial branch must be default`);
  assert(String(snapshot.branches[0].status || 'active').toLowerCase() === 'active', `${phone}: initial branch must be active`);
  assert(snapshot.tiers.length === 4, `${phone}: expected 4 customer tiers, got ${snapshot.tiers.length}`);
  assert(snapshot.tiers.map((row) => row.name).join('|') === 'Đồng|Bạc|Vàng|Kim cương', `${phone}: customer tier seed mismatch: ${JSON.stringify(snapshot.tiers)}`);
}

const rollbackPhone = '0977667701';
const retryName = 'Registration Rollback Tenant';
const db = new Database('autotax.db');
db.pragma('busy_timeout = 5000');
try {
  db.exec('DROP TRIGGER IF EXISTS smoke_registration_branch_abort');
  db.exec(`
    CREATE TRIGGER smoke_registration_branch_abort
    BEFORE INSERT ON branches
    WHEN NEW.user_id = '${rollbackPhone}' AND NEW.name = 'Chi nhánh chính'
    BEGIN
      SELECT RAISE(ABORT, 'smoke forced registration branch failure');
    END;
  `);

  await call('/auth/register', {
    method: 'POST',
    body: { name: retryName, phone: rollbackPhone, password: 'Registration2026!', sector: 'retail' },
    expected: 500,
  });

  const failed = tenantCounts(db, rollbackPhone);
  assert(failed.user.length === 0, `Failed registration left user row: ${JSON.stringify(failed.user)}`);
  assert(failed.levels.length === 0, `Failed registration left price levels: ${JSON.stringify(failed.levels)}`);
  assert(failed.branches.length === 0, `Failed registration left branch: ${JSON.stringify(failed.branches)}`);
  assert(failed.tiers.length === 0, `Failed registration left tiers: ${JSON.stringify(failed.tiers)}`);

  db.exec('DROP TRIGGER IF EXISTS smoke_registration_branch_abort');
} finally {
  try { db.exec('DROP TRIGGER IF EXISTS smoke_registration_branch_abort'); } catch (_) {}
}

const retried = await call('/auth/register', {
  method: 'POST',
  body: { name: retryName, phone: rollbackPhone, password: 'Registration2026!', sector: 'retail' },
  expected: 200,
});
assert(retried.data?.token, 'Retry registration missing token');
assert(Number(retried.data?.user?.id) > 0, 'Retry registration missing user id');

let snapshot = tenantCounts(db, rollbackPhone);
assertCompleteTenant(snapshot, rollbackPhone);

const immediateBranches = await call('/branches', { token: retried.data.token, expected: 200 });
assert(Array.isArray(immediateBranches.data) && immediateBranches.data.length === 1, `Register response returned before branch seed was visible: ${JSON.stringify(immediateBranches.data)}`);
assert(immediateBranches.data[0].name === 'Chi nhánh chính' && Number(immediateBranches.data[0].is_default) === 1, 'Immediate branch read missing active default branch');
const immediateLevels = await call('/pricing/levels', { token: retried.data.token, expected: 200 });
assert(Array.isArray(immediateLevels.data) && immediateLevels.data.length === 3, `Register response returned before price-level seed was visible: ${JSON.stringify(immediateLevels.data)}`);
const immediateProfile = await call('/auth/profile', { token: retried.data.token, expected: 200 });
assert(immediateProfile.data?.phone === rollbackPhone, `Returned token does not resolve registered tenant profile: ${JSON.stringify(immediateProfile.data)}`);

const racePhone = '0977667702';
const raceBody = { name: 'Concurrent Registration Tenant', phone: racePhone, password: 'Registration2026!', sector: 'retail' };
const race = await Promise.all([
  call('/auth/register', { method: 'POST', body: raceBody, expected: [200, 409] }),
  call('/auth/register', { method: 'POST', body: raceBody, expected: [200, 409] }),
]);
const raceStatuses = race.map((result) => result.status).sort((a, b) => a - b);
assert(raceStatuses[0] === 200 && raceStatuses[1] === 409, `Concurrent same-phone registration must have exactly one winner: ${raceStatuses.join(',')}`);
const winner = race.find((result) => result.status === 200);
assert(winner?.data?.token, 'Concurrent registration winner missing token');

snapshot = tenantCounts(db, racePhone);
assertCompleteTenant(snapshot, racePhone);
const raceBranches = await call('/branches', { token: winner.data.token, expected: 200 });
assert(Array.isArray(raceBranches.data) && raceBranches.data.length === 1, 'Concurrent winner tenant was not fully initialized before response');

const duplicateAfterCommit = await call('/auth/register', {
  method: 'POST',
  body: raceBody,
  expected: 409,
});
assert(/đã được đăng ký/i.test(String(duplicateAfterCommit.data?.error || '')), `Duplicate registration should preserve existing contract: ${JSON.stringify(duplicateAfterCommit.data)}`);
assertCompleteTenant(tenantCounts(db, racePhone), racePhone);

db.close();
console.log('REGISTRATION INTEGRITY SMOKE PASSED: seed rollback + immediate readiness + same-phone serialization + complete tenant');
