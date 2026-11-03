import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const phone = '09' + String(Date.now()).slice(-8);
const owner = await call('/auth/register', {
  method: 'POST',
  body: { phone, name: 'Shift Snapshot Tenant', password: 'ShiftSnapshot2026!', sector: 'retail' },
  expected: 200,
});
const token = owner.data?.token;
assert(token, 'Shift snapshot registration missing token');

await call('/shifts/open', {
  token,
  method: 'POST',
  body: { opening_cash: 100000 },
  expected: 200,
});

const current = await call('/shifts/current', { token, expected: 200 });
assert(current.data?.id, 'Shift snapshot smoke did not open a shift');
assert(Number(current.data?.expected_now) === 100000, `Unexpected opening snapshot: ${JSON.stringify(current.data)}`);

// The new high-watermark must include this writer even when it commits
// within the same SQLite second as the shift opening.

const external = new Database(DB_PATH);
external.pragma('busy_timeout = 5000');
external.pragma('journal_mode = WAL');
const tenant = external.prepare('SELECT id, phone FROM users WHERE phone = ?').get(phone);
assert(tenant?.id && tenant?.phone === phone, 'Cannot resolve shift snapshot tenant in SQLite');

let externalTxnOpen = false;
try {
  // Hold a real writer transaction containing a cash receipt. A correct shift-close
  // handler must obtain BEGIN IMMEDIATE before reading totals, so it waits for this
  // writer to commit and then includes the receipt. The old read-read-update flow
  // reads 100000 first and only blocks when it later tries to UPDATE the shift.
  external.exec('BEGIN IMMEDIATE');
  externalTxnOpen = true;
  external.prepare(
    `INSERT INTO cash_flows
      (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
     VALUES (?, 'in', 'other', 5000, 'cash', ?, 'Pending writer before shift close')`,
  ).run(phone, `SHIFT-LOCK-${Date.now()}`);

  const closePromise = call('/shifts/close', {
    token,
    method: 'POST',
    body: { closing_cash: 105000, note: 'Atomic cash snapshot smoke' },
    expected: 200,
  });

  // Give the server time to enter the close handler while this writer is held.
  await sleep(300);
  external.exec('COMMIT');
  externalTxnOpen = false;

  const closed = await closePromise;
  assert(Number(closed.data?.cash_sales) === 5000, `Shift close missed committed cash-in: ${JSON.stringify(closed.data)}`);
  assert(Number(closed.data?.cash_out) === 0, `Unexpected cash-out in snapshot: ${JSON.stringify(closed.data)}`);
  assert(Number(closed.data?.expected_cash) === 105000, `Atomic expected cash must be 105000, got ${closed.data?.expected_cash}`);
  assert(Number(closed.data?.difference) === 0, `Atomic shift difference must be 0, got ${closed.data?.difference}`);

  const noCurrent = await call('/shifts/current', { token, expected: 200 });
  assert(noCurrent.data === null, 'Atomic close left the shift open');

  const history = await call('/shifts', { token, expected: 200 });
  const row = history.data?.find((item) => Number(item.id) === Number(current.data.id));
  assert(row?.status === 'closed', 'Atomic close not persisted in shift history');
  assert(Number(row.cash_sales) === 5000, `Persisted shift cash-in mismatch: ${JSON.stringify(row)}`);
  assert(Number(row.expected_cash) === 105000, `Persisted expected cash mismatch: ${JSON.stringify(row)}`);
  assert(Number(row.difference) === 0, `Persisted shift difference mismatch: ${JSON.stringify(row)}`);

  await call('/shifts/close', {
    token,
    method: 'POST',
    body: { closing_cash: 105000 },
    expected: 404,
  });
} finally {
  if (externalTxnOpen) {
    try { external.exec('ROLLBACK'); } catch (_) {}
  }
  external.close();
}

console.log('SHIFT CLOSE INTEGRITY SMOKE PASSED: BEGIN IMMEDIATE snapshot includes writer committed before close + persisted reconciliation');
