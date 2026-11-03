import Database from 'better-sqlite3';
import path from 'node:path';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function call(apiPath, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${apiPath}`, {
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
    assert(allowed.includes(response.status), `${method} ${apiPath}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  } else {
    assert(response.ok, `${method} ${apiPath}: HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, data };
}

async function register(phone, name) {
  const result = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'DebtPayment2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

async function createDebt(token, { type, partner, amount }) {
  const result = await call('/finance/debts', {
    token,
    method: 'POST',
    body: { type, partner_name: partner, amount, notes: `Smoke ${partner}` },
    expected: 200,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `Debt ${partner} missing id`);
  return id;
}

async function getDebt(token, id) {
  const rows = (await call('/finance/debts', { token, expected: 200 })).data;
  const debt = rows.find((row) => Number(row.id) === Number(id));
  assert(debt, `Debt ${id} missing`);
  return debt;
}

const a = await register('0966889951', 'Debt Payment Tenant A');
const b = await register('0966889952', 'Debt Payment Tenant B');

const concurrentId = await createDebt(a.token, { type: 'receivable', partner: 'Concurrent Receivable Smoke', amount: 1000 });

// Tenant isolation: another tenant cannot mutate the debt.
await call(`/finance/debts/${concurrentId}/pay`, {
  token: b.token,
  method: 'POST',
  body: { paid_amount: 100, payment_method: 'bank' },
  expected: 404,
});
let concurrentDebt = await getDebt(a.token, concurrentId);
assert(Number(concurrentDebt.paid_amount || 0) === 0, 'Cross-tenant debt payment mutated debt');

// Non-finite and overpay inputs must be rejected with no accounting writes.
await call(`/finance/debts/${concurrentId}/pay`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 'Infinity', payment_method: 'bank' },
  expected: 400,
});
await call(`/finance/debts/${concurrentId}/pay`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 1001, payment_method: 'bank' },
  expected: 409,
});
concurrentDebt = await getDebt(a.token, concurrentId);
assert(Number(concurrentDebt.paid_amount || 0) === 0, 'Rejected debt payment mutated paid_amount');

// Two requests both see an original business intent of paying 600/1000. IMMEDIATE transaction
// must serialize them: one commits, the second sees only 400 remaining and is rejected.
const concurrent = await Promise.all([
  call(`/finance/debts/${concurrentId}/pay`, {
    token: a.token,
    method: 'POST',
    body: { paid_amount: 600, payment_method: 'bank', payment_reference: 'CONCURRENT-BANK-A' },
    expected: [200, 409],
  }),
  call(`/finance/debts/${concurrentId}/pay`, {
    token: a.token,
    method: 'POST',
    body: { paid_amount: 600, payment_method: 'bank', payment_reference: 'CONCURRENT-BANK-B' },
    expected: [200, 409],
  }),
]);
assert(concurrent.filter((result) => result.status === 200).length === 1,
  `Concurrent debt pay must have one success: ${concurrent.map((result) => result.status).join(',')}`);
assert(concurrent.filter((result) => result.status === 409).length === 1,
  `Concurrent debt pay must reject overpay after serialization: ${concurrent.map((result) => result.status).join(',')}`);
const concurrentWinner = concurrent.find((result) => result.status === 200);
assert(concurrentWinner.data?.new_status === 'partial' && Number(concurrentWinner.data?.remaining_amount) === 400,
  `Concurrent winner response mismatch: ${JSON.stringify(concurrentWinner.data)}`);

concurrentDebt = await getDebt(a.token, concurrentId);
assert(Number(concurrentDebt.paid_amount) === 600 && concurrentDebt.status === 'partial',
  `Concurrent debt state must be paid=600 partial: ${JSON.stringify(concurrentDebt)}`);

let cashFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
let concurrentFlows = cashFlows.filter((row) => row.category === 'debt_collection' && String(row.notes || '').includes('Concurrent Receivable Smoke'));
assert(concurrentFlows.length === 1, `Concurrent debt pay must create one cash-flow, got ${concurrentFlows.length}`);
assert(concurrentFlows[0].transaction_type === 'in' && concurrentFlows[0].payment_method === 'bank' && Number(concurrentFlows[0].amount) === 600,
  `Receivable debt payment must be bank cash-in: ${JSON.stringify(concurrentFlows[0])}`);

let evidenceRows = (await call('/audit-compliance/payment-evidence', { token: a.token, expected: 200 })).data;
let evidence = evidenceRows.find((row) => Number(row.cash_flow_id) === Number(concurrentFlows[0].id));
assert(evidence && evidence.payment_method === 'bank' && Number(evidence.amount) === 600
  && ['CONCURRENT-BANK-A', 'CONCURRENT-BANK-B'].includes(evidence.transaction_reference)
  && evidence.status === 'RECORDED',
  `Concurrent bank payment evidence mismatch: ${JSON.stringify(evidence)}`);

// Exact remaining payment is allowed and closes the debt.
const closeResult = await call(`/finance/debts/${concurrentId}/pay`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 400, payment_method: 'cash', payment_reference: 'CLOSE-RECEIVABLE-1' },
  expected: 200,
});
assert(closeResult.data?.new_status === 'paid' && Number(closeResult.data?.remaining_amount) === 0,
  `Exact close payment mismatch: ${JSON.stringify(closeResult.data)}`);
concurrentDebt = await getDebt(a.token, concurrentId);
assert(Number(concurrentDebt.paid_amount) === 1000 && concurrentDebt.status === 'paid', 'Debt must close exactly at total amount');

// Payable debt must create an OUT cash-flow and preserve the submitted method/reference.
const payableId = await createDebt(a.token, { type: 'payable', partner: 'Payable Bank Smoke', amount: 900 });
const payableResult = await call(`/finance/debts/${payableId}/pay`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 250, payment_method: 'bank', payment_reference: 'PAYABLE-BANK-250' },
  expected: 200,
});
assert(payableResult.data?.payment_method === 'bank' && Number(payableResult.data?.remaining_amount) === 650,
  `Payable response mismatch: ${JSON.stringify(payableResult.data)}`);
cashFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
const payableFlow = cashFlows.find((row) => row.reference_id === payableResult.data.reference_id);
assert(payableFlow && payableFlow.transaction_type === 'out' && payableFlow.payment_method === 'bank' && Number(payableFlow.amount) === 250,
  `Payable debt payment must be bank cash-out: ${JSON.stringify(payableFlow)}`);
evidenceRows = (await call('/audit-compliance/payment-evidence', { token: a.token, expected: 200 })).data;
evidence = evidenceRows.find((row) => Number(row.cash_flow_id) === Number(payableFlow.id));
assert(evidence && evidence.transaction_reference === 'PAYABLE-BANK-250' && evidence.payment_method === 'bank' && evidence.status === 'RECORDED',
  `Payable payment evidence mismatch: ${JSON.stringify(evidence)}`);

// Legacy client without payment_method is fail-safe: record unknown, never fabricate cash,
// and create a review finding.
const legacyId = await createDebt(a.token, { type: 'receivable', partner: 'Legacy Method Smoke', amount: 300 });
const legacyPay = await call(`/finance/debts/${legacyId}/pay`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 100 },
  expected: 200,
});
assert(legacyPay.data?.payment_method === 'unknown' && legacyPay.data?.payment_evidence_status === 'NEEDS_METHOD',
  `Legacy missing method must fail-safe to unknown: ${JSON.stringify(legacyPay.data)}`);
cashFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
const legacyFlow = cashFlows.find((row) => row.reference_id === legacyPay.data.reference_id);
assert(legacyFlow?.payment_method === 'unknown', 'Legacy debt payment must not be fabricated as cash');
const findings = (await call('/audit-compliance/findings', { token: a.token, expected: 200 })).data;
assert(findings.some((row) => row.code === 'DEBT_PAYMENT_METHOD_MISSING' && row.subject_id === String(legacyId)),
  'Legacy debt payment without method must create compliance finding');

// Force the second accounting mutation to fail. The IMMEDIATE transaction must roll back the
// earlier debt paid_amount update as well; this proves the old split-callback failure is closed.
const rollbackId = await createDebt(a.token, { type: 'payable', partner: 'Rollback Debt Smoke', amount: 700 });
const sqlitePath = path.resolve(process.cwd(), 'autotax.db');
{
  const raw = new Database(sqlitePath);
  raw.exec(`DROP TRIGGER IF EXISTS smoke_fail_debt_cashflow;
    CREATE TRIGGER smoke_fail_debt_cashflow
    BEFORE INSERT ON cash_flows
    WHEN NEW.category = 'debt_collection' AND NEW.notes LIKE '%Rollback Debt Smoke%'
    BEGIN
      SELECT RAISE(ABORT, 'forced debt cash-flow failure');
    END;`);
  raw.close();
}
try {
  await call(`/finance/debts/${rollbackId}/pay`, {
    token: a.token,
    method: 'POST',
    body: { paid_amount: 200, payment_method: 'bank', payment_reference: 'ROLLBACK-MUST-NOT-PERSIST' },
    expected: 500,
  });
} finally {
  const raw = new Database(sqlitePath);
  raw.exec('DROP TRIGGER IF EXISTS smoke_fail_debt_cashflow;');
  raw.close();
}
const rollbackDebt = await getDebt(a.token, rollbackId);
assert(Number(rollbackDebt.paid_amount || 0) === 0 && rollbackDebt.status === 'unpaid',
  `Failed cash-flow must roll back debt mutation: ${JSON.stringify(rollbackDebt)}`);
cashFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
assert(!cashFlows.some((row) => String(row.notes || '').includes('Rollback Debt Smoke')),
  'Forced failed debt payment must not leave cash-flow');
evidenceRows = (await call('/audit-compliance/payment-evidence', { token: a.token, expected: 200 })).data;
assert(!evidenceRows.some((row) => row.transaction_reference === 'ROLLBACK-MUST-NOT-PERSIST'),
  'Forced failed debt payment must not leave payment evidence');

console.log('DEBT PAYMENT INTEGRITY SMOKE PASSED: tenant isolation + finite/overpay guards + serialized concurrent pay + receivable/payable cash direction + real method/evidence + legacy unknown finding + transaction rollback');
