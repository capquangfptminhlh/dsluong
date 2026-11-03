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
    body: { phone, name, password: 'DebtCreate2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

const a = await register('0966889971', 'Debt Create Tenant A');
const b = await register('0966889972', 'Debt Create Tenant B');

const initialFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data.length;
const initialEvidence = (await call('/audit-compliance/payment-evidence', { token: a.token, expected: 200 })).data.length;

for (const [label, body] of [
  ['Infinity principal', { type: 'receivable', partner_name: 'Bad Infinity', amount: 'Infinity' }],
  ['NaN-like principal', { type: 'receivable', partner_name: 'Bad Text', amount: 'abc' }],
  ['zero principal', { type: 'receivable', partner_name: 'Bad Zero', amount: 0 }],
  ['blank partner', { type: 'receivable', partner_name: '   ', amount: 1000 }],
  ['invalid type', { type: 'sideways', partner_name: 'Bad Type', amount: 1000 }],
]) {
  const rejected = await call('/finance/debts', {
    token: a.token,
    method: 'POST',
    body,
    expected: 400,
  });
  assert(rejected.status === 400, `${label} must be rejected`);
}

let debtsA = (await call('/finance/debts', { token: a.token, expected: 200 })).data;
assert(!debtsA.some((row) => ['Bad Infinity', 'Bad Text', 'Bad Zero', 'Bad Type'].includes(row.partner_name)),
  'Rejected manual debts must not persist');

const receivable = await call('/finance/debts', {
  token: a.token,
  method: 'POST',
  body: {
    type: 'receivable',
    partner_name: '  Khách công nợ chuẩn hóa  ',
    amount: '12345',
    due_date: ' 2026-09-01 ',
    notes: '  Ghi chú phải thu  ',
  },
  expected: 200,
});
assert(Number(receivable.data?.id) > 0, `Receivable debt missing id: ${JSON.stringify(receivable.data)}`);
assert(receivable.data?.type === 'receivable' && receivable.data?.partner_name === 'Khách công nợ chuẩn hóa'
  && Number(receivable.data?.amount) === 12345 && receivable.data?.due_date === '2026-09-01',
  `Receivable normalized response mismatch: ${JSON.stringify(receivable.data)}`);

const payable = await call('/finance/debts', {
  token: a.token,
  method: 'POST',
  body: {
    type: 'payable',
    partner_name: 'NCC công nợ chuẩn hóa',
    amount: 67890,
    notes: 'Ghi chú phải trả',
  },
  expected: 200,
});
assert(Number(payable.data?.id) > 0, `Payable debt missing id: ${JSON.stringify(payable.data)}`);

debtsA = (await call('/finance/debts', { token: a.token, expected: 200 })).data;
const receivableRow = debtsA.find((row) => Number(row.id) === Number(receivable.data.id));
const payableRow = debtsA.find((row) => Number(row.id) === Number(payable.data.id));
assert(receivableRow && receivableRow.type === 'receivable' && receivableRow.partner_name === 'Khách công nợ chuẩn hóa'
  && Number(receivableRow.amount) === 12345 && Number(receivableRow.paid_amount || 0) === 0
  && receivableRow.status === 'unpaid' && receivableRow.due_date === '2026-09-01'
  && receivableRow.notes === 'Ghi chú phải thu',
  `Stored receivable mismatch: ${JSON.stringify(receivableRow)}`);
assert(payableRow && payableRow.type === 'payable' && payableRow.partner_name === 'NCC công nợ chuẩn hóa'
  && Number(payableRow.amount) === 67890 && Number(payableRow.paid_amount || 0) === 0
  && payableRow.status === 'unpaid' && payableRow.notes === 'Ghi chú phải trả',
  `Stored payable mismatch: ${JSON.stringify(payableRow)}`);

const debtsB = (await call('/finance/debts', { token: b.token, expected: 200 })).data;
assert(!debtsB.some((row) => Number(row.id) === Number(receivable.data.id) || Number(row.id) === Number(payable.data.id)),
  'Manual debt tenant isolation failed');

const finalFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data.length;
const finalEvidence = (await call('/audit-compliance/payment-evidence', { token: a.token, expected: 200 })).data.length;
assert(finalFlows === initialFlows, `Creating debt must not create cash-flow: ${initialFlows} -> ${finalFlows}`);
assert(finalEvidence === initialEvidence, `Creating debt must not create payment evidence: ${initialEvidence} -> ${finalEvidence}`);

console.log('DEBT CREATE INTEGRITY SMOKE PASSED: finite principal + trimmed partner + type validation + receivable/payable persistence + tenant isolation + no premature cash/evidence');
