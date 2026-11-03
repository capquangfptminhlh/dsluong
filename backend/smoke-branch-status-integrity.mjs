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

async function register(phone, name) {
  const result = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'BranchStatus2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name}: missing token`);
  return result.data;
}

async function createBranch(token, name) {
  const result = await call('/branches', {
    token,
    method: 'POST',
    body: { name, address: 'Smoke', phone: '0900000000' },
    expected: 200,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `${name}: missing branch id`);
  return { id, name };
}

async function listBranches(token) {
  const result = await call('/branches', { token, expected: 200 });
  assert(Array.isArray(result.data), 'Branch list must be an array');
  return result.data;
}

function getBranch(rows, id) {
  const branch = rows.find((row) => Number(row.id) === Number(id));
  assert(branch, `Branch ${id} missing from list`);
  return branch;
}

function assertOneActiveDefault(rows) {
  const defaults = rows.filter((row) => Number(row.is_default) === 1);
  assert(defaults.length === 1, `Expected exactly one default branch, got ${defaults.length}: ${JSON.stringify(rows)}`);
  assert(String(defaults[0].status || 'active').toLowerCase() === 'active', `Default branch must stay active: ${JSON.stringify(defaults[0])}`);
  return Number(defaults[0].id);
}

const tenantA = await register('0977556601', 'Branch Status Tenant A');
const tenantB = await register('0977556602', 'Branch Status Tenant B');
const initialA = await listBranches(tenantA.token);
const defaultAId = assertOneActiveDefault(initialA);
const defaultBId = assertOneActiveDefault(await listBranches(tenantB.token));
const defaultA = getBranch(initialA, defaultAId);

await call(`/branches/${defaultBId}`, {
  token: tenantA.token,
  method: 'PUT',
  body: { name: 'Cross tenant edit', address: 'No', phone: '', status: 'inactive' },
  expected: 404,
});
assertOneActiveDefault(await listBranches(tenantA.token));
assertOneActiveDefault(await listBranches(tenantB.token));

await call(`/branches/${defaultAId}`, {
  token: tenantA.token,
  method: 'PUT',
  body: { name: defaultA.name, address: defaultA.address || '', phone: defaultA.phone || '', status: 'paused' },
  expected: 400,
});
assertOneActiveDefault(await listBranches(tenantA.token));

const deactivateDefault = await call(`/branches/${defaultAId}`, {
  token: tenantA.token,
  method: 'PUT',
  body: { name: defaultA.name, address: defaultA.address || '', phone: defaultA.phone || '', status: 'inactive' },
  expected: 409,
});
assert(/mặc định|default/i.test(String(deactivateDefault.data?.error || '')), `Default deactivate should explain guard: ${JSON.stringify(deactivateDefault.data)}`);
let rows = await listBranches(tenantA.token);
assertOneActiveDefault(rows);
assert(String(getBranch(rows, defaultAId).status || 'active').toLowerCase() === 'active', 'Rejected default deactivation changed status');

const editable = await createBranch(tenantA.token, `Editable branch ${Date.now()}`);
await call(`/branches/${editable.id}`, {
  token: tenantA.token,
  method: 'PUT',
  body: { name: editable.name, address: 'Inactive smoke', phone: '0911111111', status: 'inactive' },
  expected: 200,
});
rows = await listBranches(tenantA.token);
assert(String(getBranch(rows, editable.id).status).toLowerCase() === 'inactive', 'Non-default branch should allow inactive status');
assertOneActiveDefault(rows);

const renamedEditable = `${editable.name} reactivated`;
await call(`/branches/${editable.id}`, {
  token: tenantA.token,
  method: 'PUT',
  body: { name: renamedEditable, address: 'Active again', phone: '0922222222', status: 'active' },
  expected: 200,
});
rows = await listBranches(tenantA.token);
const editableAfter = getBranch(rows, editable.id);
assert(editableAfter.name === renamedEditable, `Rename did not persist: ${JSON.stringify(editableAfter)}`);
assert(String(editableAfter.status).toLowerCase() === 'active', 'Reactivation did not persist');
assertOneActiveDefault(rows);

const rollback = await createBranch(tenantA.token, `Rollback status ${Date.now()}`);
const sqlite = new Database('autotax.db');
sqlite.pragma('busy_timeout = 5000');
try {
  sqlite.exec('DROP TRIGGER IF EXISTS smoke_branch_status_abort');
  sqlite.exec(`
    CREATE TRIGGER smoke_branch_status_abort
    BEFORE UPDATE ON branches
    WHEN OLD.id = ${rollback.id} AND NEW.status = 'inactive'
    BEGIN
      SELECT RAISE(ABORT, 'smoke forced branch status failure');
    END;
  `);

  await call(`/branches/${rollback.id}`, {
    token: tenantA.token,
    method: 'PUT',
    body: { name: `${rollback.name} changed`, address: 'Should rollback', phone: '0933333333', status: 'inactive' },
    expected: 500,
  });

  const dbRow = sqlite.prepare('SELECT name, status, address, phone FROM branches WHERE id = ?').get(rollback.id);
  assert(dbRow?.name === rollback.name, `Failed update changed branch name: ${JSON.stringify(dbRow)}`);
  assert(String(dbRow?.status || 'active').toLowerCase() === 'active', `Failed update changed status: ${JSON.stringify(dbRow)}`);
} finally {
  sqlite.exec('DROP TRIGGER IF EXISTS smoke_branch_status_abort');
  sqlite.close();
}

const race = await createBranch(tenantA.token, `Race status ${Date.now()}`);
const concurrent = await Promise.all([
  call(`/branches/${race.id}/mac-dinh`, {
    token: tenantA.token,
    method: 'POST',
    expected: [200, 409],
  }),
  call(`/branches/${race.id}`, {
    token: tenantA.token,
    method: 'PUT',
    body: { name: race.name, address: 'Race', phone: '', status: 'inactive' },
    expected: [200, 409],
  }),
]);
const successCount = concurrent.filter((result) => result.status === 200).length;
const conflictCount = concurrent.filter((result) => result.status === 409).length;
assert(successCount === 1 && conflictCount === 1, `Default-vs-inactive race must have exactly one winner: ${concurrent.map((r) => r.status).join(',')}`);

rows = await listBranches(tenantA.token);
const finalDefaultId = assertOneActiveDefault(rows);
const raceAfter = getBranch(rows, race.id);
if (finalDefaultId === race.id) {
  assert(String(raceAfter.status).toLowerCase() === 'active', 'Set-default winner must leave race branch active');
} else {
  assert(String(raceAfter.status).toLowerCase() === 'inactive', 'Deactivate winner must leave race branch inactive and non-default');
}

console.log('BRANCH STATUS INTEGRITY SMOKE PASSED: tenant/status guard + default protection + rollback + default-vs-inactive serialization');
