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
    body: { phone, name, password: 'ManualCashFlow2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

const a = await register('0966889961', 'Manual CashFlow Tenant A');
const b = await register('0966889962', 'Manual CashFlow Tenant B');

// Non-finite and invalid direction inputs must be rejected before any accounting mutation.
await call('/finance/cash-flows', {
  token: a.token,
  method: 'POST',
  body: { transaction_type: 'in', category: 'manual_income', amount: 'Infinity', payment_method: 'bank' },
  expected: 400,
});
await call('/finance/cash-flows', {
  token: a.token,
  method: 'POST',
  body: { transaction_type: 'sideways', category: 'manual_income', amount: 1000, payment_method: 'cash' },
  expected: 400,
});
let flowsA = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
assert(!flowsA.some((row) => row.category === 'manual_income'), 'Rejected manual cash-flow input must not persist');

// Valid incoming bank flow must preserve direction/method and create linked evidence.
const bankIn = await call('/finance/cash-flows', {
  token: a.token,
  method: 'POST',
  body: {
    transaction_type: 'in',
    category: 'manual_income',
    amount: 123456,
    payment_method: 'bank',
    payment_reference: 'BANK-MANUAL-IN-1',
    notes: 'Manual bank receipt smoke',
  },
  expected: 200,
});
assert(bankIn.data?.reference_id?.startsWith('PT'), `Incoming manual flow must use PT reference: ${JSON.stringify(bankIn.data)}`);
assert(bankIn.data?.payment_method === 'bank' && bankIn.data?.payment_evidence_status === 'RECORDED',
  `Incoming bank response mismatch: ${JSON.stringify(bankIn.data)}`);

flowsA = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
const bankInFlow = flowsA.find((row) => Number(row.id) === Number(bankIn.data.id));
assert(bankInFlow && bankInFlow.transaction_type === 'in' && bankInFlow.payment_method === 'bank'
  && Number(bankInFlow.amount) === 123456 && bankInFlow.reference_id === bankIn.data.reference_id,
  `Incoming bank cash-flow mismatch: ${JSON.stringify(bankInFlow)}`);

let evidenceRows = (await call('/audit-compliance/payment-evidence', { token: a.token, expected: 200 })).data;
let evidence = evidenceRows.find((row) => Number(row.cash_flow_id) === Number(bankInFlow.id));
assert(evidence && evidence.payment_method === 'bank' && evidence.transaction_reference === 'BANK-MANUAL-IN-1'
  && Number(evidence.amount) === 123456 && evidence.status === 'RECORDED',
  `Incoming bank evidence mismatch: ${JSON.stringify(evidence)}`);

// Valid outgoing card flow must stay OUT/card and create evidence as well.
const cardOut = await call('/finance/cash-flows', {
  token: a.token,
  method: 'POST',
  body: {
    transaction_type: 'out',
    category: 'manual_expense',
    amount: 54321,
    payment_method: 'card',
    payment_reference: 'CARD-MANUAL-OUT-1',
    notes: 'Manual card payment smoke',
  },
  expected: 200,
});
assert(cardOut.data?.reference_id?.startsWith('PC'), `Outgoing manual flow must use PC reference: ${JSON.stringify(cardOut.data)}`);
flowsA = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
const cardOutFlow = flowsA.find((row) => Number(row.id) === Number(cardOut.data.id));
assert(cardOutFlow && cardOutFlow.transaction_type === 'out' && cardOutFlow.payment_method === 'card'
  && Number(cardOutFlow.amount) === 54321,
  `Outgoing card cash-flow mismatch: ${JSON.stringify(cardOutFlow)}`);
evidenceRows = (await call('/audit-compliance/payment-evidence', { token: a.token, expected: 200 })).data;
evidence = evidenceRows.find((row) => Number(row.cash_flow_id) === Number(cardOutFlow.id));
assert(evidence && evidence.payment_method === 'card' && evidence.transaction_reference === 'CARD-MANUAL-OUT-1'
  && evidence.status === 'RECORDED',
  `Outgoing card evidence mismatch: ${JSON.stringify(evidence)}`);

// Tenant B must not see Tenant A financial rows.
const flowsB = (await call('/finance/cash-flows', { token: b.token, expected: 200 })).data;
assert(!flowsB.some((row) => Number(row.id) === Number(bankInFlow.id) || Number(row.id) === Number(cardOutFlow.id)),
  'Manual cash-flow tenant isolation failed');

// Legacy client with no method remains usable but fail-safe: unknown + finding, never cash.
const legacy = await call('/finance/cash-flows', {
  token: a.token,
  method: 'POST',
  body: {
    transaction_type: 'in',
    category: 'legacy_manual',
    amount: 22222,
    notes: 'Legacy manual flow without method',
  },
  expected: 200,
});
assert(legacy.data?.payment_method === 'unknown' && legacy.data?.payment_evidence_status === 'NEEDS_METHOD',
  `Legacy manual flow must fail-safe to unknown: ${JSON.stringify(legacy.data)}`);
flowsA = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
const legacyFlow = flowsA.find((row) => Number(row.id) === Number(legacy.data.id));
assert(legacyFlow?.payment_method === 'unknown', 'Legacy manual cash-flow must not be fabricated as cash');
const findings = (await call('/audit-compliance/findings', { token: a.token, expected: 200 })).data;
assert(findings.some((row) => row.code === 'CASH_FLOW_PAYMENT_METHOD_MISSING'
  && row.subject_type === 'cash_flow' && row.subject_id === String(legacy.data.id)),
  'Missing manual cash-flow method must create compliance finding');

// Force payment_evidence insert failure. The cash-flow insert must roll back too.
const sqlitePath = path.resolve(process.cwd(), 'autotax.db');
{
  const raw = new Database(sqlitePath);
  raw.exec(`DROP TRIGGER IF EXISTS smoke_fail_manual_cashflow_evidence;
    CREATE TRIGGER smoke_fail_manual_cashflow_evidence
    BEFORE INSERT ON payment_evidence
    WHEN NEW.transaction_reference = 'ROLLBACK-MANUAL-FLOW'
    BEGIN
      SELECT RAISE(ABORT, 'forced manual cash-flow evidence failure');
    END;`);
  raw.close();
}
try {
  await call('/finance/cash-flows', {
    token: a.token,
    method: 'POST',
    body: {
      transaction_type: 'out',
      category: 'rollback_manual',
      amount: 33333,
      payment_method: 'bank',
      payment_reference: 'ROLLBACK-MANUAL-FLOW',
      notes: 'Rollback Manual CashFlow Smoke',
    },
    expected: 500,
  });
} finally {
  const raw = new Database(sqlitePath);
  raw.exec('DROP TRIGGER IF EXISTS smoke_fail_manual_cashflow_evidence;');
  raw.close();
}
flowsA = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data;
assert(!flowsA.some((row) => row.category === 'rollback_manual' || String(row.notes || '').includes('Rollback Manual CashFlow Smoke')),
  'Failed evidence insert must roll back manual cash-flow');
evidenceRows = (await call('/audit-compliance/payment-evidence', { token: a.token, expected: 200 })).data;
assert(!evidenceRows.some((row) => row.transaction_reference === 'ROLLBACK-MANUAL-FLOW'),
  'Failed manual cash-flow must not leave payment evidence');

console.log('MANUAL CASH-FLOW INTEGRITY SMOKE PASSED: finite/type guards + bank/card evidence + tenant isolation + legacy unknown finding + atomic rollback');
