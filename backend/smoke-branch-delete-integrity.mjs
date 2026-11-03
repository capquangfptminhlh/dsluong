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
    body: { phone, name, password: 'BranchDelete2026!', sector: 'retail' },
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
  return id;
}

async function createProduct(token, name, sku, stock = 0) {
  const result = await call('/products', {
    token,
    method: 'POST',
    body: { name, sku, price: 100000, cost_price: 50000, stock, category: 'Smoke' },
    expected: 200,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `${name}: missing product id`);
  return id;
}

async function branches(token) {
  return (await call('/branches', { token, expected: 200 })).data || [];
}

const tenantA = await register('0977334401', 'Branch Delete Tenant A');
const tenantB = await register('0977334402', 'Branch Delete Tenant B');
const defaultA = (await branches(tenantA.token)).find((branch) => Number(branch.is_default) === 1);
const defaultB = (await branches(tenantB.token)).find((branch) => Number(branch.is_default) === 1);
assert(defaultA?.id && defaultB?.id, 'Default branches missing');

await call(`/branches/${defaultA.id}`, { token: tenantA.token, method: 'DELETE', expected: 400 });
await call(`/branches/${defaultB.id}`, { token: tenantA.token, method: 'DELETE', expected: 404 });

const unusedId = await createBranch(tenantA.token, `Unused branch ${Date.now()}`);
await call(`/branches/${unusedId}`, { token: tenantA.token, method: 'DELETE', expected: 200 });
assert(!(await branches(tenantA.token)).some((branch) => Number(branch.id) === unusedId), 'Unused branch should be deleted');

const productId = await createProduct(tenantA.token, 'Branch Delete Product', `BR-DEL-${Date.now()}`, 0);
const rollbackId = await createBranch(tenantA.token, `Rollback branch ${Date.now()}`);
const sqlite = new Database('autotax.db');
sqlite.pragma('busy_timeout = 5000');
try {
  sqlite.prepare('INSERT INTO branch_stock (branch_id, product_id, stock) VALUES (?, ?, 0)').run(rollbackId, productId);
  sqlite.exec('DROP TRIGGER IF EXISTS smoke_branch_delete_abort');
  sqlite.exec(`
    CREATE TRIGGER smoke_branch_delete_abort
    BEFORE DELETE ON branches
    WHEN OLD.id = ${rollbackId}
    BEGIN
      SELECT RAISE(ABORT, 'smoke forced branch delete failure');
    END;
  `);

  await call(`/branches/${rollbackId}`, { token: tenantA.token, method: 'DELETE', expected: 500 });
  const branchStillThere = sqlite.prepare('SELECT id FROM branches WHERE id = ?').get(rollbackId);
  const stockRowStillThere = sqlite.prepare('SELECT id FROM branch_stock WHERE branch_id = ? AND product_id = ?').get(rollbackId, productId);
  assert(branchStillThere, 'Forced branch delete failure must roll back branch row');
  assert(stockRowStillThere, 'Forced branch delete failure must roll back branch_stock cleanup');
} finally {
  sqlite.exec('DROP TRIGGER IF EXISTS smoke_branch_delete_abort');
  sqlite.close();
}
await call(`/branches/${rollbackId}`, { token: tenantA.token, method: 'DELETE', expected: 200 });

const historyId = await createBranch(tenantA.token, `History branch ${Date.now()}`);
await call('/purchases', {
  token: tenantA.token,
  method: 'POST',
  body: {
    branch_id: historyId,
    items: [{ product_id: productId, quantity: 1, cost_price: 50000 }],
    paid_amount: 0,
    note: 'BRANCH-DELETE-HISTORY',
  },
  expected: 200,
});
await call('/branches/chuyen-kho', {
  token: tenantA.token,
  method: 'POST',
  body: {
    from_branch_id: historyId,
    to_branch_id: defaultA.id,
    items: [{ product_id: productId, quantity: 1 }],
    note: 'Zero out branch while preserving history',
  },
  expected: 200,
});
const historyDelete = await call(`/branches/${historyId}`, { token: tenantA.token, method: 'DELETE', expected: 409 });
assert(/lịch sử|nghiệp vụ|chuyển kho/i.test(String(historyDelete.data?.error || '')), `History delete should explain retention: ${JSON.stringify(historyDelete.data)}`);
assert((await branches(tenantA.token)).some((branch) => Number(branch.id) === historyId), 'History branch must remain');

const raceProductId = await createProduct(tenantA.token, 'Branch Delete Race Product', `BR-RACE-${Date.now()}`, 0);
const raceId = await createBranch(tenantA.token, `Race branch ${Date.now()}`);
const [deleteRace, purchaseRace] = await Promise.all([
  call(`/branches/${raceId}`, { token: tenantA.token, method: 'DELETE', expected: [200, 409] }),
  call('/purchases', {
    token: tenantA.token,
    method: 'POST',
    body: {
      branch_id: raceId,
      items: [{ product_id: raceProductId, quantity: 1, cost_price: 50000 }],
      paid_amount: 0,
      note: 'BRANCH-DELETE-RACE',
    },
    expected: [200, 404],
  }),
]);
assert((deleteRace.status === 200) !== (purchaseRace.status === 200), `Exactly one side of delete-vs-first-purchase race must win: delete=${deleteRace.status}, purchase=${purchaseRace.status}`);

const verifyDb = new Database('autotax.db', { readonly: true });
try {
  const branch = verifyDb.prepare('SELECT id FROM branches WHERE id = ? AND user_id = ?').get(raceId, tenantA.user.phone);
  const purchaseCount = Number(verifyDb.prepare('SELECT COUNT(*) AS count FROM purchase_orders WHERE user_id = ? AND branch_id = ?').get(tenantA.user.phone, raceId)?.count || 0);
  if (deleteRace.status === 200) {
    assert(!branch, 'Delete winner must remove branch');
    assert(purchaseCount === 0, 'Delete winner must not leave a purchase orphaned to deleted branch');
  } else {
    assert(branch, 'Purchase winner must keep branch');
    assert(purchaseCount === 1, `Purchase winner must leave exactly one branch-linked purchase, got ${purchaseCount}`);
  }
} finally {
  verifyDb.close();
}

console.log('BRANCH DELETE INTEGRITY SMOKE PASSED: default/tenant guard + unused delete + rollback + history retention + first-purchase serialization');
