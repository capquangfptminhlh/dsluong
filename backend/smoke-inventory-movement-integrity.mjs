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
    body: { phone, name, password: 'InventoryMove2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name}: registration missing token`);
  return result.data;
}

async function createProduct(token, name, sku, stock) {
  const result = await call('/products', {
    token,
    method: 'POST',
    body: { name, sku, price: 100000, cost_price: 50000, stock, category: 'Smoke' },
    expected: 200,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `${name}: product id missing`);
  return id;
}

async function branchSummary(token, productId) {
  const result = await call('/branches/ton-kho/tong-hop', { token, expected: 200 });
  const product = result.data?.products?.find((row) => Number(row.id) === Number(productId));
  assert(product, `Product ${productId} missing from branch summary`);
  return { branches: result.data.branches || [], product };
}

function stockAt(product, branchId) {
  return Number(product.ton?.[branchId] || 0);
}

const tenantA = await register('0977112201', 'Inventory Movement Tenant A');
const tenantB = await register('0977112202', 'Inventory Movement Tenant B');
const productA = await createProduct(tenantA.token, 'Inventory Movement Product A', `INV-MOVE-A-${Date.now()}`, 5);
const productB = await createProduct(tenantB.token, 'Inventory Movement Product B', `INV-MOVE-B-${Date.now()}`, 6);

let summary = await branchSummary(tenantA.token, productA);
const defaultBranch = summary.branches[0];
assert(defaultBranch?.id, 'Tenant A default branch missing');

const secondBranchCreated = await call('/branches', {
  token: tenantA.token,
  method: 'POST',
  body: { name: `Kho phụ smoke ${Date.now()}`, address: 'Smoke' },
  expected: 200,
});
const secondBranchId = Number(secondBranchCreated.data?.id);
assert(secondBranchId > 0, 'Second branch id missing');

await call('/branches/chuyen-kho', {
  token: tenantA.token,
  method: 'POST',
  body: {
    from_branch_id: defaultBranch.id,
    to_branch_id: secondBranchId,
    items: [{ product_id: productA, quantity: 2 }],
    note: 'Seed multi-branch inventory movement smoke',
  },
  expected: 200,
});

summary = await branchSummary(tenantA.token, productA);
assert(stockAt(summary.product, defaultBranch.id) === 3, `Default branch expected 3 after transfer: ${JSON.stringify(summary.product)}`);
assert(stockAt(summary.product, secondBranchId) === 2, `Second branch expected 2 after transfer: ${JSON.stringify(summary.product)}`);
assert(Number(summary.product.stock) === 5, `Product total expected 5 after transfer, got ${summary.product.stock}`);

const imported = await call('/inventory/import', {
  token: tenantA.token,
  method: 'POST',
  body: { product_id: productA, quantity: 4, note: 'INV-MOVE-SMOKE-IN' },
  expected: 200,
});
assert(Number(imported.data?.branch_id) === Number(defaultBranch.id), `Manual import must target default branch: ${JSON.stringify(imported.data)}`);
assert(Number(imported.data?.branch_stock) === 7, `Default branch response expected 7, got ${JSON.stringify(imported.data)}`);
assert(Number(imported.data?.new_stock) === 9, `Product total response expected 9, got ${JSON.stringify(imported.data)}`);

summary = await branchSummary(tenantA.token, productA);
assert(stockAt(summary.product, defaultBranch.id) === 7, `Default branch expected 7 after import: ${JSON.stringify(summary.product)}`);
assert(stockAt(summary.product, secondBranchId) === 2, `Second branch must stay 2 after import: ${JSON.stringify(summary.product)}`);
assert(Number(summary.product.stock) === 9, `Product total expected 9 after import, got ${summary.product.stock}`);

await call('/inventory/import', {
  token: tenantA.token,
  method: 'POST',
  body: { product_id: productA, quantity: 'Infinity', note: 'INV-MOVE-NON-FINITE' },
  expected: 400,
});
summary = await branchSummary(tenantA.token, productA);
assert(Number(summary.product.stock) === 9 && stockAt(summary.product, defaultBranch.id) === 7, 'Rejected non-finite movement mutated stock');

await call('/inventory/import', {
  token: tenantA.token,
  method: 'POST',
  body: { product_id: productB, quantity: 1, note: 'INV-MOVE-CROSS-TENANT' },
  expected: 404,
});
const tenantBSummary = await branchSummary(tenantB.token, productB);
assert(Number(tenantBSummary.product.stock) === 6, 'Cross-tenant manual movement mutated foreign product');

const sqlite = new Database('autotax.db');
sqlite.pragma('busy_timeout = 5000');
try {
  sqlite.exec('DROP TRIGGER IF EXISTS smoke_inventory_log_abort');
  sqlite.exec(`
    CREATE TRIGGER smoke_inventory_log_abort
    BEFORE INSERT ON inventory_logs
    WHEN NEW.note = 'INV-MOVE-FORCE-LOG-FAIL'
    BEGIN
      SELECT RAISE(ABORT, 'smoke forced inventory log failure');
    END;
  `);

  await call('/inventory/import', {
    token: tenantA.token,
    method: 'POST',
    body: { product_id: productA, quantity: 1, note: 'INV-MOVE-FORCE-LOG-FAIL' },
    expected: 500,
  });
} finally {
  sqlite.exec('DROP TRIGGER IF EXISTS smoke_inventory_log_abort');
  sqlite.close();
}
summary = await branchSummary(tenantA.token, productA);
assert(Number(summary.product.stock) === 9 && stockAt(summary.product, defaultBranch.id) === 7, 'Inventory log failure did not roll back stock mutation');

const concurrent = await Promise.all([
  call('/inventory/import', {
    token: tenantA.token,
    method: 'POST',
    body: { product_id: productA, quantity: -5, note: 'INV-MOVE-CONCURRENT-OUT' },
    expected: [200, 409],
  }),
  call('/inventory/import', {
    token: tenantA.token,
    method: 'POST',
    body: { product_id: productA, quantity: -5, note: 'INV-MOVE-CONCURRENT-OUT' },
    expected: [200, 409],
  }),
]);
const statuses = concurrent.map((result) => result.status).sort((a, b) => a - b);
assert(statuses[0] === 200 && statuses[1] === 409, `Exactly one concurrent export must commit: ${statuses.join(',')}`);

summary = await branchSummary(tenantA.token, productA);
assert(stockAt(summary.product, defaultBranch.id) === 2, `Concurrent export default branch expected 2: ${JSON.stringify(summary.product)}`);
assert(stockAt(summary.product, secondBranchId) === 2, `Concurrent export must not touch second branch: ${JSON.stringify(summary.product)}`);
assert(Number(summary.product.stock) === 4, `Concurrent export product total expected 4, got ${summary.product.stock}`);

const logs = (await call('/inventory/logs', { token: tenantA.token, expected: 200 })).data || [];
const successfulImportLogs = logs.filter((row) => row.note === 'INV-MOVE-SMOKE-IN');
const concurrentOutLogs = logs.filter((row) => row.note === 'INV-MOVE-CONCURRENT-OUT');
const failedLogRows = logs.filter((row) => row.note === 'INV-MOVE-FORCE-LOG-FAIL');
assert(successfulImportLogs.length === 1, `Expected one import evidence row, got ${successfulImportLogs.length}`);
assert(concurrentOutLogs.length === 1, `Expected one committed concurrent OUT evidence row, got ${concurrentOutLogs.length}`);
assert(failedLogRows.length === 0, 'Failed movement must not leave inventory log evidence');

console.log('INVENTORY MOVEMENT INTEGRITY SMOKE PASSED: finite + tenant-safe + multi-branch sync + rollback + concurrent non-negative stock');
