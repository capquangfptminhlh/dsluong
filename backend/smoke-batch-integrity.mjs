import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';

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
    body: { phone, name, password: 'BatchIntegrity2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name}: registration missing token`);
  return result.data;
}

async function createProduct(token, sku, name = 'Batch Integrity Product') {
  const created = await call('/products', {
    token,
    method: 'POST',
    body: { name, sku, price: 100000, cost_price: 50000, stock: 0, category: 'Smoke' },
    expected: 200,
  });
  assert(created.data?.id, 'Batch smoke product missing id');
  return Number(created.data.id);
}

async function createBatch(token, body, expected = 200) {
  return call('/batches', { token, method: 'POST', body, expected });
}

async function branchSummary(token) {
  return (await call('/branches/ton-kho/tong-hop', { token, expected: 200 })).data;
}

function stockAt(summary, productId, branchId) {
  const row = summary.products?.find((item) => Number(item.id) === Number(productId));
  return Number(row?.ton?.[branchId] || 0);
}

function productTotal(summary, productId) {
  const row = summary.products?.find((item) => Number(item.id) === Number(productId));
  return Number(row?.stock || 0);
}

const aPhone = '0966118851';
const bPhone = '0966118852';
const a = await register(aPhone, 'Batch Integrity Tenant A');
const b = await register(bPhone, 'Batch Integrity Tenant B');

const branchesA = (await call('/branches', { token: a.token, expected: 200 })).data;
const defaultA = branchesA.find((row) => Number(row.is_default) === 1) || branchesA[0];
assert(defaultA?.id, 'Batch smoke missing default branch A');
const secondAResult = await call('/branches', {
  token: a.token,
  method: 'POST',
  body: { name: 'Kho Batch B', address: 'Smoke branch B' },
  expected: 200,
});
const secondA = Number(secondAResult.data?.id);
assert(secondA > 0, 'Batch smoke missing second branch A');

const branchesB = (await call('/branches', { token: b.token, expected: 200 })).data;
const defaultB = branchesB.find((row) => Number(row.is_default) === 1) || branchesB[0];
assert(defaultB?.id, 'Batch smoke missing default branch B');

const productA = await createProduct(a.token, `BATCH-A-${Date.now()}`);
const productB = await createProduct(b.token, `BATCH-B-${Date.now()}`, 'Cross Tenant Batch Product');

// Non-finite and malformed values must fail before any stock/batch write.
for (const body of [
  { product_id: productA, branch_id: defaultA.id, quantity: 'Infinity', cost_price: 50000, batch_code: 'BAD-QTY-INF' },
  { product_id: productA, branch_id: defaultA.id, quantity: 'NaN', cost_price: 50000, batch_code: 'BAD-QTY-NAN' },
  { product_id: productA, branch_id: defaultA.id, quantity: -1, cost_price: 50000, batch_code: 'BAD-QTY-NEG' },
  { product_id: productA, branch_id: defaultA.id, quantity: 1, cost_price: 'Infinity', batch_code: 'BAD-COST-INF' },
  { product_id: productA, branch_id: defaultA.id, quantity: 1, cost_price: -1, batch_code: 'BAD-COST-NEG' },
  { product_id: productA, branch_id: defaultA.id, quantity: 1, cost_price: 50000, expiry_date: '2026-99-99', batch_code: 'BAD-DATE' },
]) {
  await createBatch(a.token, body, 400);
}
await createBatch(a.token, {
  product_id: productA,
  branch_id: defaultB.id,
  quantity: 1,
  cost_price: 50000,
  batch_code: 'CROSS-BRANCH',
}, 404);
await createBatch(a.token, {
  product_id: productB,
  branch_id: defaultA.id,
  quantity: 1,
  cost_price: 50000,
  batch_code: 'CROSS-PRODUCT',
}, 404);

const external = new Database(DB_PATH);
external.pragma('busy_timeout = 5000');
external.pragma('journal_mode = WAL');

// Force the final inventory-log insert to fail and prove batch + branch stock + product
// total all roll back with it.
const beforeRollback = await branchSummary(a.token);
external.exec(`
  CREATE TRIGGER batch_integrity_force_log_failure
  BEFORE INSERT ON inventory_logs
  WHEN NEW.user_id = '${aPhone}' AND NEW.note LIKE 'Nhập lô ROLLBACK-BATCH%'
  BEGIN
    SELECT RAISE(ABORT, 'FORCED_BATCH_LOG_FAILURE');
  END;
`);
await createBatch(a.token, {
  product_id: productA,
  branch_id: defaultA.id,
  quantity: 2,
  cost_price: 50000,
  batch_code: 'ROLLBACK-BATCH',
}, 500);
external.exec('DROP TRIGGER batch_integrity_force_log_failure');
const afterRollback = await branchSummary(a.token);
assert(stockAt(afterRollback, productA, defaultA.id) === stockAt(beforeRollback, productA, defaultA.id), 'Failed batch create changed branch stock');
assert(productTotal(afterRollback, productA) === productTotal(beforeRollback, productA), 'Failed batch create changed product total stock');
assert(!external.prepare('SELECT id FROM product_batches WHERE user_id = ? AND batch_code = ?').get(aPhone, 'ROLLBACK-BATCH'), 'Failed batch create left batch row');

// Multi-branch FEFO: two batches in default branch and one in second branch.
const early = await createBatch(a.token, {
  product_id: productA,
  branch_id: defaultA.id,
  quantity: 3,
  cost_price: 50000,
  expiry_date: '2026-08-20',
  batch_code: 'FEFO-EARLY',
});
const late = await createBatch(a.token, {
  product_id: productA,
  branch_id: defaultA.id,
  quantity: 3,
  cost_price: 50000,
  expiry_date: '2026-09-20',
  batch_code: 'FEFO-LATE',
});
const otherBranchBatch = await createBatch(a.token, {
  product_id: productA,
  branch_id: secondA,
  quantity: 4,
  cost_price: 50000,
  expiry_date: '2026-08-18',
  batch_code: 'FEFO-OTHER-BRANCH',
});
const earlyId = Number(early.data.id);
const lateId = Number(late.data.id);
const otherId = Number(otherBranchBatch.data.id);

let summary = await branchSummary(a.token);
assert(stockAt(summary, productA, defaultA.id) === 6, `Default branch expected 6 before sale, got ${stockAt(summary, productA, defaultA.id)}`);
assert(stockAt(summary, productA, secondA) === 4, `Second branch expected 4 before sale, got ${stockAt(summary, productA, secondA)}`);
assert(productTotal(summary, productA) === 10, `Product total expected 10 before sale, got ${productTotal(summary, productA)}`);

const sale = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    branch_id: defaultA.id,
    cart: [{ id: productA, quantity: 4 }],
    paid_cash: 400000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 200,
});
const orderId = Number(String(sale.data?.receipt_url || '').split('/').pop());
assert(orderId > 0, `Batch FEFO sale missing order id: ${JSON.stringify(sale.data)}`);

const earlyAfterSale = external.prepare('SELECT quantity, branch_id, status FROM product_batches WHERE id = ?').get(earlyId);
const lateAfterSale = external.prepare('SELECT quantity, branch_id, status FROM product_batches WHERE id = ?').get(lateId);
const otherAfterSale = external.prepare('SELECT quantity FROM product_batches WHERE id = ?').get(otherId);
assert(Number(earlyAfterSale.quantity) === 0, `FEFO early batch expected 0 after sale: ${JSON.stringify(earlyAfterSale)}`);
assert(Number(lateAfterSale.quantity) === 2, `FEFO late batch expected 2 after sale: ${JSON.stringify(lateAfterSale)}`);
assert(Number(otherAfterSale.quantity) === 4, `Other branch batch was consumed by wrong branch: ${JSON.stringify(otherAfterSale)}`);

const allocations = external.prepare(`
  SELECT batch_id, branch_id, quantity, restored_at
  FROM pos_batch_allocations WHERE user_id = ? AND order_id = ? ORDER BY id
`).all(aPhone, orderId);
assert(allocations.length === 2, `Expected two FEFO allocations, got ${JSON.stringify(allocations)}`);
assert(Number(allocations[0].batch_id) === earlyId && Number(allocations[0].quantity) === 3, `Early FEFO allocation mismatch: ${JSON.stringify(allocations)}`);
assert(Number(allocations[1].batch_id) === lateId && Number(allocations[1].quantity) === 1, `Late FEFO allocation mismatch: ${JSON.stringify(allocations)}`);
assert(allocations.every((row) => Number(row.branch_id) === Number(defaultA.id) && row.restored_at === null), `Allocation branch/restored state mismatch: ${JSON.stringify(allocations)}`);

summary = await branchSummary(a.token);
assert(stockAt(summary, productA, defaultA.id) === 2, `Default branch stock expected 2 after sale, got ${stockAt(summary, productA, defaultA.id)}`);
assert(stockAt(summary, productA, secondA) === 4, 'Sale mutated second branch stock');
assert(productTotal(summary, productA) === 6, `Product total expected 6 after sale, got ${productTotal(summary, productA)}`);

// Cancel must restore the exact two batches from the allocation ledger, not merely total stock.
await call(`/pos/${orderId}/cancel`, {
  token: a.token,
  method: 'POST',
  body: { cancel_reason: 'Batch allocation restore smoke' },
  expected: 200,
});
const earlyAfterCancel = external.prepare('SELECT quantity, status FROM product_batches WHERE id = ?').get(earlyId);
const lateAfterCancel = external.prepare('SELECT quantity, status FROM product_batches WHERE id = ?').get(lateId);
assert(Number(earlyAfterCancel.quantity) === 3 && earlyAfterCancel.status === 'active', `Early batch not restored exactly: ${JSON.stringify(earlyAfterCancel)}`);
assert(Number(lateAfterCancel.quantity) === 3 && lateAfterCancel.status === 'active', `Late batch not restored exactly: ${JSON.stringify(lateAfterCancel)}`);
const restoredAllocations = external.prepare('SELECT restored_at FROM pos_batch_allocations WHERE user_id = ? AND order_id = ?').all(aPhone, orderId);
assert(restoredAllocations.length === 2 && restoredAllocations.every((row) => row.restored_at), `Allocations not marked restored: ${JSON.stringify(restoredAllocations)}`);
summary = await branchSummary(a.token);
assert(stockAt(summary, productA, defaultA.id) === 6 && stockAt(summary, productA, secondA) === 4 && productTotal(summary, productA) === 10, 'Cancel did not restore branch/product stock exactly');

// Double destroy must serialize: only one request removes the batch quantity.
const destroyBatch = await createBatch(a.token, {
  product_id: productA,
  branch_id: secondA,
  quantity: 2,
  cost_price: 50000,
  batch_code: 'DOUBLE-DESTROY',
});
const destroyId = Number(destroyBatch.data.id);
const beforeDoubleDestroy = await branchSummary(a.token);
const destroyRace = await Promise.all([
  call(`/batches/${destroyId}/huy`, { token: a.token, method: 'POST', body: { reason: 'Race A' }, expected: [200, 409] }),
  call(`/batches/${destroyId}/huy`, { token: a.token, method: 'POST', body: { reason: 'Race B' }, expected: [200, 409] }),
]);
assert(destroyRace.filter((result) => result.status === 200).length === 1, `Double destroy expected one winner: ${destroyRace.map((result) => result.status).join(',')}`);
assert(destroyRace.filter((result) => result.status === 409).length === 1, `Double destroy expected one conflict: ${destroyRace.map((result) => result.status).join(',')}`);
const afterDoubleDestroy = await branchSummary(a.token);
assert(stockAt(afterDoubleDestroy, productA, secondA) === stockAt(beforeDoubleDestroy, productA, secondA) - 2, 'Double destroy subtracted stock more than once');
const destroyedRow = external.prepare('SELECT quantity, status, destroyed_at FROM product_batches WHERE id = ?').get(destroyId);
assert(Number(destroyedRow.quantity) === 0 && destroyedRow.status === 'destroyed' && destroyedRow.destroyed_at, `Destroyed batch state mismatch: ${JSON.stringify(destroyedRow)}`);

// Multi-branch legacy batch stays unresolved and blocks FEFO until physically assigned.
const legacyProduct = await createProduct(a.token, `BATCH-LEGACY-${Date.now()}`, 'Legacy Unresolved Batch Product');
external.prepare(`
  INSERT INTO branch_stock (branch_id, product_id, stock) VALUES (?, ?, 3)
  ON CONFLICT(branch_id, product_id) DO UPDATE SET stock = 3
`).run(defaultA.id, legacyProduct);
external.prepare('UPDATE products SET stock = 3, track_batch = 1 WHERE id = ? AND user_id = ?').run(legacyProduct, aPhone);
const legacyInsert = external.prepare(`
  INSERT INTO product_batches (user_id, product_id, batch_code, expiry_date, quantity, cost_price, branch_id, status)
  VALUES (?, ?, 'LEGACY-UNRESOLVED', '2026-10-01', 3, 50000, NULL, 'active')
`).run(aPhone, legacyProduct);
const legacyBatchId = Number(legacyInsert.lastInsertRowid);
await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: { branch_id: defaultA.id, cart: [{ id: legacyProduct, quantity: 1 }], paid_cash: 100000, paid_bank: 0 },
  expected: 409,
});
await call(`/batches/${legacyBatchId}/assign-branch`, {
  token: a.token,
  method: 'POST',
  body: { branch_id: defaultA.id },
  expected: 200,
});
const legacySale = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: { branch_id: defaultA.id, cart: [{ id: legacyProduct, quantity: 1 }], paid_cash: 100000, paid_bank: 0 },
  expected: 200,
});
const legacyOrderId = Number(String(legacySale.data.receipt_url).split('/').pop());
assert(legacyOrderId > 0, 'Legacy-assigned sale missing order id');

// Simulate a pre-ledger legacy order by removing its allocation. Cancellation must fail
// closed and roll back, rather than guessing which batch to restore.
external.prepare('DELETE FROM pos_batch_allocations WHERE user_id = ? AND order_id = ?').run(aPhone, legacyOrderId);
await call(`/pos/${legacyOrderId}/cancel`, {
  token: a.token,
  method: 'POST',
  body: { cancel_reason: 'Should require manual review' },
  expected: 409,
});
const legacyOrderState = external.prepare('SELECT status FROM pos_orders WHERE id = ? AND user_id = ?').get(legacyOrderId, aPhone);
assert(legacyOrderState?.status !== 'cancelled', 'Legacy order without allocation was cancelled unsafely');

// If a sold batch is later destroyed, cancellation must not resurrect that batch.
const destroyAfterSaleProduct = await createProduct(a.token, `BATCH-NORES-${Date.now()}`, 'Destroyed Allocation Product');
const destroyAfterSaleBatch = await createBatch(a.token, {
  product_id: destroyAfterSaleProduct,
  branch_id: defaultA.id,
  quantity: 2,
  cost_price: 50000,
  batch_code: 'DESTROY-AFTER-SALE',
});
const destroyAfterSaleBatchId = Number(destroyAfterSaleBatch.data.id);
const destroyAfterSaleOrder = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: { branch_id: defaultA.id, cart: [{ id: destroyAfterSaleProduct, quantity: 1 }], paid_cash: 100000, paid_bank: 0 },
  expected: 200,
});
const destroyAfterSaleOrderId = Number(String(destroyAfterSaleOrder.data.receipt_url).split('/').pop());
await call(`/batches/${destroyAfterSaleBatchId}/huy`, {
  token: a.token,
  method: 'POST',
  body: { reason: 'Destroyed after one unit sold' },
  expected: 200,
});
await call(`/pos/${destroyAfterSaleOrderId}/cancel`, {
  token: a.token,
  method: 'POST',
  body: { cancel_reason: 'Must not resurrect destroyed batch' },
  expected: 409,
});
const noResurrection = external.prepare('SELECT quantity, status FROM product_batches WHERE id = ?').get(destroyAfterSaleBatchId);
assert(Number(noResurrection.quantity) === 0 && noResurrection.status === 'destroyed', `Cancel resurrected destroyed batch: ${JSON.stringify(noResurrection)}`);

external.close();
console.log('BATCH INTEGRITY SMOKE PASSED: finite + tenant + forced rollback + multi-branch FEFO allocation + exact cancel restore + double destroy + legacy fail-closed + no resurrection');
