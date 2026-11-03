const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

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

// The same suite may run from other regression workflows in the same test DB.
const phonePrefix = '09' + String(Date.now()).slice(-6);
const owner = await call('/auth/register', {
  method: 'POST',
  body: { phone: phonePrefix + '33', name: 'Shift Integrity Tenant', password: 'ShiftSmoke2026!', sector: 'retail' },
  expected: 200,
});
const token = owner.data?.token;
assert(token, 'Shift smoke owner registration missing token');

await call('/shifts/open', { token, method: 'POST', body: { opening_cash: 'NaN-money' }, expected: 400 });
await call('/shifts/open', { token, method: 'POST', body: { opening_cash: -1 }, expected: 400 });

const opens = await Promise.all([
  call('/shifts/open', { token, method: 'POST', body: { opening_cash: 100000 }, expected: [200, 409] }),
  call('/shifts/open', { token, method: 'POST', body: { opening_cash: 100000 }, expected: [200, 409] }),
]);
const openStatuses = opens.map((item) => item.status).sort((a, b) => a - b);
assert(openStatuses[0] === 200 && openStatuses[1] === 409, `Concurrent shift open must be one 200 + one 409, got ${openStatuses.join(',')}`);

const currentInitially = await call('/shifts/current', { token, expected: 200 });
assert(currentInitially.data?.id, 'Opened shift not returned by /current');
assert(Number(currentInitially.data.expected_now) === 100000, `Initial expected cash must be 100000, got ${currentInitially.data?.expected_now}`);

// The shift captures a cash-flow ledger ID at open; sales in the same second
// must still be included and previous receipts must not be re-counted.
const product = await call('/products', {
  token,
  method: 'POST',
  body: { name: 'Shift Mixed Payment Product', sku: `SHIFT-${Date.now()}`, price: 100000, cost_price: 50000, stock: 5, category: 'Smoke' },
  expected: 200,
});
assert(product.data?.id, 'Shift smoke product not created');

const checkout = await call('/pos/checkout', {
  token,
  method: 'POST',
  body: {
    cart: [{ id: product.data.id, name: 'Shift Mixed Payment Product', quantity: 1, price: 100000, discount: 0 }],
    payment_method: 'mixed',
    paid_cash: 30000,
    paid_bank: 70000,
    vat_rate: 0,
  },
  expected: 200,
});
assert(checkout.data?.payment_method === undefined || checkout.data?.paid_cash === 30000, 'Mixed checkout did not preserve paid_cash');

await call('/finance/cash-flows', {
  token,
  method: 'POST',
  body: { transaction_type: 'in', category: 'other', amount: 10000, payment_method: 'cash', notes: 'Shift smoke cash receipt' },
  expected: 200,
});
await call('/finance/cash-flows', {
  token,
  method: 'POST',
  body: { transaction_type: 'out', category: 'other', amount: 5000, payment_method: 'cash', notes: 'Shift smoke cash expense' },
  expected: 200,
});

const currentWithFlows = await call('/shifts/current', { token, expected: 200 });
assert(Number(currentWithFlows.data?.cash_sales) === 40000, `Shift cash-in must include mixed POS + manual cash receipt = 40000, got ${currentWithFlows.data?.cash_sales}`);
assert(Number(currentWithFlows.data?.cash_out) === 5000, `Shift cash-out must be 5000, got ${currentWithFlows.data?.cash_out}`);
assert(Number(currentWithFlows.data?.expected_now) === 135000, `Shift expected cash must be 135000, got ${currentWithFlows.data?.expected_now}`);

await call('/shifts/close', { token, method: 'POST', body: { closing_cash: 'bad-money' }, expected: 400 });
const stillOpen = await call('/shifts/current', { token, expected: 200 });
assert(stillOpen.data?.id === currentInitially.data.id, 'Invalid close must leave shift open');

const closes = await Promise.all([
  call('/shifts/close', { token, method: 'POST', body: { closing_cash: 135000, note: 'Concurrent close A' }, expected: [200, 404, 409] }),
  call('/shifts/close', { token, method: 'POST', body: { closing_cash: 135000, note: 'Concurrent close B' }, expected: [200, 404, 409] }),
]);
assert(closes.filter((item) => item.status === 200).length === 1, `Concurrent shift close must have exactly one success, got ${closes.map((item) => item.status).join(',')}`);
assert(closes.filter((item) => item.status !== 200).every((item) => [404, 409].includes(item.status)), 'Second concurrent close must fail closed');
const successfulClose = closes.find((item) => item.status === 200);
assert(Number(successfulClose.data?.difference) === 0, `Expected zero shift difference, got ${successfulClose.data?.difference}`);

const noCurrent = await call('/shifts/current', { token, expected: 200 });
assert(noCurrent.data === null, 'Closed shift must no longer be current');
const history = await call('/shifts', { token, expected: 200 });
const closed = history.data?.find((row) => row.id === currentInitially.data.id);
assert(closed?.status === 'closed', 'Shift history did not persist closed status');
assert(Number(closed.cash_sales) === 40000 && Number(closed.cash_out) === 5000 && Number(closed.expected_cash) === 135000, 'Closed shift totals are not cash-flow authoritative');

const ownerB = await call('/auth/register', {
  method: 'POST',
  body: { phone: phonePrefix + '44', name: 'Shift Tenant B', password: 'ShiftSmoke2026!', sector: 'retail' },
  expected: 200,
});
assert(ownerB.data?.token, 'Shift tenant B registration missing token');
await call('/shifts/open', { token: ownerB.data.token, method: 'POST', body: { opening_cash: 20000 }, expected: 200 });
const currentB = await call('/shifts/current', { token: ownerB.data.token, expected: 200 });
assert(Number(currentB.data?.expected_now) === 20000, 'Tenant B shift expected cash incorrect');
const tenantAStillClosed = await call('/shifts/current', { token, expected: 200 });
assert(tenantAStillClosed.data === null, 'Tenant B open leaked into tenant A');
await call('/shifts/close', { token: ownerB.data.token, method: 'POST', body: { closing_cash: 20000 }, expected: 200 });

console.log('SHIFT SMOKE PASSED: finite money + atomic open/close + mixed-payment cash-flow reconciliation + tenant isolation');
