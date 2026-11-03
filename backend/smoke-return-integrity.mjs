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
    body: { phone, name, password: 'ReturnSmoke2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

async function productById(token, id) {
  const rows = (await call('/products', { token, expected: 200 })).data;
  const product = rows.find((row) => Number(row.id) === Number(id));
  assert(product, `Product ${id} missing`);
  return product;
}

const a = await register('0966889921', 'Return Integrity Tenant A');
const b = await register('0966889922', 'Return Integrity Tenant B');

const productCreated = await call('/products', {
  token: a.token,
  method: 'POST',
  body: {
    name: 'Return Net Value Product',
    sku: `RETURN-${Date.now()}`,
    price: 100000,
    cost_price: 50000,
    stock: 10,
    category: 'Smoke',
  },
  expected: 200,
});
const productId = Number(productCreated.data?.id);
assert(productId > 0, 'Return smoke product missing id');

const checkout = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{
      id: productId,
      name: 'Return Net Value Product',
      quantity: 2,
      price: 100000,
      discount: 20000,
    }],
    customer_name: 'Khách Return Smoke',
    customer_phone: '0909123456',
    discount: 10000,
    vat_rate: 10,
    paid_cash: 100000,
    paid_bank: 0,
    cho_no: true,
  },
  expected: 200,
});
assert(Number(checkout.data?.subtotal) === 180000, `Checkout subtotal expected 180000, got ${checkout.data?.subtotal}`);
assert(Number(checkout.data?.vat_amount) === 17000, `Checkout VAT expected 17000, got ${checkout.data?.vat_amount}`);
assert(Number(checkout.data?.total_amount) === 187000, `Checkout total expected 187000, got ${checkout.data?.total_amount}`);
assert(Number(checkout.data?.debt_amount) === 87000, `Checkout debt expected 87000, got ${checkout.data?.debt_amount}`);

const ordersA = (await call('/pos', { token: a.token, expected: 200 })).data;
const order = ordersA.find((row) => row.order_code === checkout.data.order_code);
assert(order?.id, 'Return smoke order not found after checkout');

let product = await productById(a.token, productId);
assert(Number(product.stock) === 8, `Checkout must reduce stock to 8, got ${product.stock}`);

const initialEligibility = await call(`/returns/eligibility/${order.id}`, { token: a.token, expected: 200 });
assert(initialEligibility.data?.items?.length === 1, 'Eligibility must contain one aggregated product');
const eligible = initialEligibility.data.items[0];
assert(Number(eligible.sold_quantity) === 2 && Number(eligible.remaining_quantity) === 2, `Initial eligibility quantity mismatch: ${JSON.stringify(eligible)}`);
assert(Math.abs(Number(eligible.refund_unit_estimate) - 93500) < 0.001, `Refund unit must include line discount + order discount + VAT allocation, got ${eligible.refund_unit_estimate}`);
assert(Number(initialEligibility.data.remaining_refundable) === 187000, `Initial remaining refundable expected 187000, got ${initialEligibility.data.remaining_refundable}`);

const foreignOrders = (await call('/pos', { token: b.token, expected: 200 })).data;
assert(Array.isArray(foreignOrders), 'Tenant B order list unavailable');
await call(`/returns/eligibility/${order.id}`, { token: b.token, expected: 404 });

await call('/returns', {
  token: a.token,
  method: 'POST',
  body: { order_id: order.id, items: [{ product_id: productId, quantity: 'Infinity' }] },
  expected: 400,
});
product = await productById(a.token, productId);
assert(Number(product.stock) === 8, 'Rejected non-finite return must not mutate stock');

const firstReturn = await call('/returns', {
  token: a.token,
  method: 'POST',
  body: {
    order_id: order.id,
    reason: 'Smoke partial return',
    items: [{ product_id: productId, quantity: 1 }],
  },
  expected: 200,
});
assert(Number(firstReturn.data?.total_refund) === 93500, `First return expected 93500 net refund, got ${firstReturn.data?.total_refund}`);
assert(Number(firstReturn.data?.debt_reduction) === 87000, `First return must reduce debt by 87000 before cash refund, got ${firstReturn.data?.debt_reduction}`);
assert(Number(firstReturn.data?.cash_refund) === 6500, `First return cash refund expected 6500, got ${firstReturn.data?.cash_refund}`);

let eligibility = await call(`/returns/eligibility/${order.id}`, { token: a.token, expected: 200 });
assert(Number(eligibility.data.items[0].returned_quantity) === 1, 'Eligibility must show one unit already returned');
assert(Number(eligibility.data.items[0].remaining_quantity) === 1, 'Eligibility must show one unit still returnable');
assert(Number(eligibility.data.already_refunded) === 93500, 'Eligibility refunded value mismatch after first return');
assert(Number(eligibility.data.remaining_refundable) === 93500, 'Eligibility remaining value mismatch after first return');

const concurrent = await Promise.all([
  call('/returns', {
    token: a.token,
    method: 'POST',
    body: { order_id: order.id, reason: 'Concurrent return A', items: [{ product_id: productId, quantity: 1 }] },
    expected: [200, 409],
  }),
  call('/returns', {
    token: a.token,
    method: 'POST',
    body: { order_id: order.id, reason: 'Concurrent return B', items: [{ product_id: productId, quantity: 1 }] },
    expected: [200, 409],
  }),
]);
assert(concurrent.filter((result) => result.status === 200).length === 1, `Concurrent final return must have one success: ${concurrent.map((result) => result.status).join(',')}`);
assert(concurrent.filter((result) => result.status === 409).length === 1, `Concurrent over-return must have one 409 conflict: ${concurrent.map((result) => result.status).join(',')}`);
const winner = concurrent.find((result) => result.status === 200);
assert(Number(winner.data?.total_refund) === 93500, `Final return expected 93500, got ${winner.data?.total_refund}`);
assert(Number(winner.data?.debt_reduction) === 0, `Debt must already be cleared before final return, got ${winner.data?.debt_reduction}`);
assert(Number(winner.data?.cash_refund) === 93500, `Final cash refund expected 93500, got ${winner.data?.cash_refund}`);

eligibility = await call(`/returns/eligibility/${order.id}`, { token: a.token, expected: 200 });
assert(Number(eligibility.data.items[0].returned_quantity) === 2, 'Final eligibility must show both units returned');
assert(Number(eligibility.data.items[0].remaining_quantity) === 0, 'Final eligibility must show zero remaining quantity');
assert(Number(eligibility.data.already_refunded) === 187000, `Total refund must exactly equal order total 187000, got ${eligibility.data.already_refunded}`);
assert(Number(eligibility.data.remaining_refundable) === 0, `Remaining refundable must be zero, got ${eligibility.data.remaining_refundable}`);

product = await productById(a.token, productId);
assert(Number(product.stock) === 10, `Two accepted unit returns must restore stock exactly to 10, got ${product.stock}`);

const returnHistory = (await call('/returns', { token: a.token, expected: 200 })).data.filter((row) => Number(row.order_id) === Number(order.id));
assert(returnHistory.length === 2, `Exactly two return documents must exist, got ${returnHistory.length}`);
const historyTotal = returnHistory.reduce((sum, row) => sum + Number(row.total_refund || 0), 0);
assert(historyTotal === 187000, `Return documents must never exceed original order total, got ${historyTotal}`);

const c = await register('0966889923', 'Return Multi Item Tenant C');
const productC1 = await call('/products', {
  token: c.token,
  method: 'POST',
  body: { name: 'Return Multi A', sku: `RET-MULTI-A-${Date.now()}`, price: 40000, cost_price: 20000, stock: 5, category: 'Smoke' },
  expected: 200,
});
const productC2 = await call('/products', {
  token: c.token,
  method: 'POST',
  body: { name: 'Return Multi B', sku: `RET-MULTI-B-${Date.now()}`, price: 60000, cost_price: 30000, stock: 5, category: 'Smoke' },
  expected: 200,
});
const c1 = Number(productC1.data?.id);
const c2 = Number(productC2.data?.id);
assert(c1 > 0 && c2 > 0, 'Multi-item return products missing');

const checkoutC = await call('/pos/checkout', {
  token: c.token,
  method: 'POST',
  body: {
    cart: [
      { id: c1, name: 'Return Multi A', quantity: 1, price: 40000, discount: 0 },
      { id: c2, name: 'Return Multi B', quantity: 1, price: 60000, discount: 0 },
    ],
    discount: 0,
    vat_rate: 0,
    paid_cash: 100000,
    paid_bank: 0,
  },
  expected: 200,
});
assert(Number(checkoutC.data?.total_amount) === 100000, `Multi-item checkout expected 100000, got ${checkoutC.data?.total_amount}`);
const orderC = (await call('/pos', { token: c.token, expected: 200 })).data.find((row) => row.order_code === checkoutC.data.order_code);
assert(orderC?.id, 'Multi-item return order missing');

const returnC = await call('/returns', {
  token: c.token,
  method: 'POST',
  body: {
    order_id: orderC.id,
    reason: 'Multi-item total dedupe regression',
    items: [
      { product_id: c1, quantity: 1 },
      { product_id: c2, quantity: 1 },
    ],
  },
  expected: 200,
});
assert(Number(returnC.data?.total_refund) === 100000, `Multi-item return expected 100000, got ${returnC.data?.total_refund}`);
const eligibilityC = await call(`/returns/eligibility/${orderC.id}`, { token: c.token, expected: 200 });
assert(Number(eligibilityC.data?.already_refunded) === 100000, `One multi-item return must count refund once, got ${eligibilityC.data?.already_refunded}`);
assert(Number(eligibilityC.data?.remaining_refundable) === 0, `Multi-item return remaining refundable must be zero, got ${eligibilityC.data?.remaining_refundable}`);
assert(eligibilityC.data.items.every((item) => Number(item.remaining_quantity) === 0), `All multi-item quantities must be exhausted: ${JSON.stringify(eligibilityC.data.items)}`);
assert(Number((await productById(c.token, c1)).stock) === 5, 'Multi-item return must restore product A stock exactly');
assert(Number((await productById(c.token, c2)).stock) === 5, 'Multi-item return must restore product B stock exactly');

const d = await register('0966889924', 'Return Debt Collection Tenant D');
const productD = await call('/products', {
  token: d.token,
  method: 'POST',
  body: { name: 'Return Debt Paid Later', sku: `RET-DEBT-${Date.now()}`, price: 100000, cost_price: 50000, stock: 2, category: 'Smoke' },
  expected: 200,
});
const dProductId = Number(productD.data?.id);
assert(dProductId > 0, 'Debt-paid-later return product missing');
const checkoutD = await call('/pos/checkout', {
  token: d.token,
  method: 'POST',
  body: {
    cart: [{ id: dProductId, name: 'Return Debt Paid Later', quantity: 1, price: 100000, discount: 0 }],
    customer_name: 'Khách trả nợ sau',
    customer_phone: '0909555444',
    discount: 0,
    vat_rate: 0,
    paid_cash: 0,
    paid_bank: 0,
    cho_no: true,
  },
  expected: 200,
});
assert(Number(checkoutD.data?.total_amount) === 100000 && Number(checkoutD.data?.debt_amount) === 100000, `Debt checkout mismatch: ${JSON.stringify(checkoutD.data)}`);
const orderD = (await call('/pos', { token: d.token, expected: 200 })).data.find((row) => row.order_code === checkoutD.data.order_code);
assert(orderD?.id, 'Debt-paid-later order missing');
const debtD = (await call('/finance/debts', { token: d.token, expected: 200 })).data.find((row) => row.order_code === checkoutD.data.order_code);
assert(debtD?.id && Number(debtD.amount) === 100000, `Receivable debt missing for later-payment regression: ${JSON.stringify(debtD)}`);
await call(`/finance/debts/${debtD.id}/pay`, {
  token: d.token,
  method: 'POST',
  body: { paid_amount: 40000, payment_method: 'cash', payment_reference: 'RETURN-DEBT-CASH-40000' },
  expected: 200,
});
const cashAfterDebtPayment = (await call('/finance/cash-flows', { token: d.token, expected: 200 })).data;
assert(cashAfterDebtPayment.some((flow) => flow.reference_id === `DEBT-${debtD.id}` && flow.transaction_type === 'in' && flow.payment_method === 'cash' && Number(flow.amount) === 40000), 'Debt collection cash-flow missing before return');

const returnD = await call('/returns', {
  token: d.token,
  method: 'POST',
  body: { order_id: orderD.id, reason: 'Return after partial debt collection', items: [{ product_id: dProductId, quantity: 1 }] },
  expected: 200,
});
assert(Number(returnD.data?.total_refund) === 100000, `Debt-paid-later total refund expected 100000, got ${returnD.data?.total_refund}`);
assert(Number(returnD.data?.debt_reduction) === 60000, `Outstanding receivable must reduce by 60000, got ${returnD.data?.debt_reduction}`);
assert(Number(returnD.data?.cash_refund) === 40000, `Collected debt must refund 40000 cash, got ${returnD.data?.cash_refund}`);
const debtsAfterReturnD = (await call('/finance/debts', { token: d.token, expected: 200 })).data;
const debtAfterReturnD = debtsAfterReturnD.find((row) => Number(row.id) === Number(debtD.id));
assert(Number(debtAfterReturnD?.amount) === 40000 && Number(debtAfterReturnD?.paid_amount) === 40000 && debtAfterReturnD?.status === 'paid', `Debt state after full product return is wrong: ${JSON.stringify(debtAfterReturnD)}`);
const cashAfterReturnD = (await call('/finance/cash-flows', { token: d.token, expected: 200 })).data;
assert(cashAfterReturnD.some((flow) => flow.reference_id === returnD.data.code && flow.transaction_type === 'out' && flow.category === 'refund' && flow.payment_method === 'cash' && Number(flow.amount) === 40000), `Later debt collection was not refunded through cash-flow: ${JSON.stringify(cashAfterReturnD)}`);
assert(Number((await productById(d.token, dProductId)).stock) === 2, 'Debt-paid-later return must restore stock exactly');

const e = await register('0966889925', 'Return Pending Bank Tenant E');
const productE = await call('/products', {
  token: e.token,
  method: 'POST',
  body: { name: 'Return Pending Bank', sku: `RET-BANK-${Date.now()}`, price: 50000, cost_price: 25000, stock: 1, category: 'Smoke' },
  expected: 200,
});
const eProductId = Number(productE.data?.id);
assert(eProductId > 0, 'Pending-bank return product missing');
const checkoutE = await call('/pos/checkout', {
  token: e.token,
  method: 'POST',
  body: {
    cart: [{ id: eProductId, name: 'Return Pending Bank', quantity: 1, price: 50000, discount: 0 }],
    discount: 0,
    vat_rate: 0,
    paid_cash: 0,
    paid_bank: 50000,
  },
  expected: 200,
});
assert(checkoutE.data?.payment_status === 'pending_payment', `Bank checkout must be pending before webhook: ${JSON.stringify(checkoutE.data)}`);
const orderE = (await call('/pos', { token: e.token, expected: 200 })).data.find((row) => row.order_code === checkoutE.data.order_code);
assert(orderE?.id && orderE.status === 'pending_payment', `Pending-bank order state mismatch: ${JSON.stringify(orderE)}`);
const beforePendingReturn = await productById(e.token, eProductId);
assert(Number(beforePendingReturn.stock) === 0, `Pending bank checkout must reserve/deduct stock to 0, got ${beforePendingReturn.stock}`);
await call('/returns', {
  token: e.token,
  method: 'POST',
  body: { order_id: orderE.id, reason: 'Must reject before bank confirmation', items: [{ product_id: eProductId, quantity: 1 }] },
  expected: 409,
});
assert(Number((await productById(e.token, eProductId)).stock) === 0, 'Rejected pending-bank return must not restore stock; cancellation handles that flow');
const pendingReturns = (await call('/returns', { token: e.token, expected: 200 })).data.filter((row) => Number(row.order_id) === Number(orderE.id));
assert(pendingReturns.length === 0, `Pending-bank order must not create return document before payment confirmation: ${JSON.stringify(pendingReturns)}`);
const pendingCashFlows = (await call('/finance/cash-flows', { token: e.token, expected: 200 })).data;
assert(!pendingCashFlows.some((flow) => flow.reference_id === orderE.order_code && flow.transaction_type === 'in' && flow.payment_method === 'bank'), 'Pending bank checkout must not have a confirmed bank cash-flow before webhook');
assert(!pendingCashFlows.some((flow) => flow.category === 'refund'), 'Pending-bank return rejection must not create refund cash-flow');

console.log('RETURN INTEGRITY SMOKE PASSED: tenant isolation + finite quantity + net discount/VAT refund + debt-first/later-payment refund + pending-bank block + concurrent over-return lock + multi-item dedupe + exact stock/value cap');
