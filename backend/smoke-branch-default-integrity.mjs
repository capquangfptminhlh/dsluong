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
    body: { phone, name, password: 'BranchDefault2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name}: missing token`);
  return result.data;
}

async function createBranch(token, name) {
  const result = await call('/branches', {
    token,
    method: 'POST',
    body: { name, address: 'Smoke' },
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

function assertOneDefault(rows, expectedId = null) {
  const defaults = rows.filter((row) => Number(row.is_default) === 1);
  assert(defaults.length === 1, `Expected exactly one default branch, got ${defaults.length}: ${JSON.stringify(rows)}`);
  if (expectedId !== null) {
    assert(Number(defaults[0].id) === Number(expectedId), `Expected branch ${expectedId} default, got ${defaults[0].id}`);
  }
  return Number(defaults[0].id);
}

const tenantA = await register('0977445501', 'Branch Default Tenant A');
const tenantB = await register('0977445502', 'Branch Default Tenant B');
const initialA = await listBranches(tenantA.token);
const originalDefaultId = assertOneDefault(initialA);
const defaultBId = assertOneDefault(await listBranches(tenantB.token));
const branchA = await createBranch(tenantA.token, `Default candidate A ${Date.now()}`);
const branchB = await createBranch(tenantA.token, `Default candidate B ${Date.now()}`);

await call(`/branches/${defaultBId}/mac-dinh`, {
  token: tenantA.token,
  method: 'POST',
  expected: 404,
});
assertOneDefault(await listBranches(tenantA.token), originalDefaultId);

await call(`/branches/${branchA.id}`, {
  token: tenantA.token,
  method: 'PUT',
  body: { name: branchA.name, address: 'Smoke', status: 'inactive' },
  expected: 200,
});
await call(`/branches/${branchA.id}/mac-dinh`, {
  token: tenantA.token,
  method: 'POST',
  expected: 409,
});
assertOneDefault(await listBranches(tenantA.token), originalDefaultId);

await call(`/branches/${branchA.id}`, {
  token: tenantA.token,
  method: 'PUT',
  body: { name: branchA.name, address: 'Smoke', status: 'active' },
  expected: 200,
});

const sqlite = new Database('autotax.db');
sqlite.pragma('busy_timeout = 5000');
try {
  sqlite.exec('DROP TRIGGER IF EXISTS smoke_branch_default_abort');
  sqlite.exec(`
    CREATE TRIGGER smoke_branch_default_abort
    BEFORE UPDATE OF is_default ON branches
    WHEN NEW.user_id = '0977445501' AND NEW.id = ${branchA.id} AND NEW.is_default = 1
    BEGIN
      SELECT RAISE(ABORT, 'smoke forced default switch failure');
    END;
  `);

  await call(`/branches/${branchA.id}/mac-dinh`, {
    token: tenantA.token,
    method: 'POST',
    expected: 500,
  });

  const rows = sqlite.prepare('SELECT id, is_default FROM branches WHERE user_id = ? ORDER BY id').all('0977445501');
  const defaults = rows.filter((row) => Number(row.is_default) === 1);
  assert(defaults.length === 1, `Failed switch must preserve one default, got ${JSON.stringify(rows)}`);
  assert(Number(defaults[0].id) === originalDefaultId, `Failed switch changed original default: ${JSON.stringify(rows)}`);
} finally {
  sqlite.exec('DROP TRIGGER IF EXISTS smoke_branch_default_abort');
  sqlite.close();
}

const concurrent = await Promise.all([
  call(`/branches/${branchA.id}/mac-dinh`, { token: tenantA.token, method: 'POST', expected: 200 }),
  call(`/branches/${branchB.id}/mac-dinh`, { token: tenantA.token, method: 'POST', expected: 200 }),
]);
assert(concurrent.every((result) => result.data?.success === true), `Concurrent switches must both serialize successfully: ${JSON.stringify(concurrent)}`);
const finalDefaultId = assertOneDefault(await listBranches(tenantA.token));
assert([branchA.id, branchB.id].includes(finalDefaultId), `Final default must be one of concurrent targets, got ${finalDefaultId}`);

console.log('BRANCH DEFAULT INTEGRITY SMOKE PASSED: tenant + active guard + rollback + concurrent exactly-one default');
