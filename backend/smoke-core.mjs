import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { formatBusinessDate, addCalendarDays, addCalendarMonths, calendarDayDifference } = require('./utils/businessDate');

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(formatBusinessDate(new Date('2026-08-12T17:30:00.000Z')) === '2026-08-13', 'Vietnam business-date rollover regression');
assert(addCalendarDays('2026-08-13', 30) === '2026-09-12', 'Calendar-day addition regression');
assert(addCalendarMonths('2026-08-13', 12) === '2027-08-13', 'Calendar-month addition regression');
assert(calendarDayDifference('2026-08-14', '2026-08-13') === 1, 'Calendar-day difference regression');

async function call(path, { token, method = 'GET', body, expected, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
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
  const { data } = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'AuditCore2026!', sector: 'retail' },
    expected: 200,
  });
  assert(data?.token, `Register ${phone} missing token`);
  return data;
}

const a = await register('0911111111', 'Tenant A');
const b = await register('0922222222', 'Tenant B');
const tenantAId = String(a.user?.phone || '');
assert(tenantAId, 'Tenant A register response missing tenant phone');

const productA = await call('/products', {
  token: a.token,
  method: 'POST',
  body: { name: 'San pham A', sku: 'AUDIT-A', price: 100000, cost_price: 60000, stock: 10, category: 'Test' },
  expected: 200,
});
const productB = await call('/products', {
  token: b.token,
  method: 'POST',
  body: { name: 'San pham B', sku: 'AUDIT-B', price: 200000, cost_price: 120000, stock: 7, category: 'Test' },
  expected: 200,
});

const listA1 = (await call('/products', { token: a.token })).data;
const listB1 = (await call('/products', { token: b.token })).data;
assert(listA1.length === 1 && listA1[0].sku === 'AUDIT-A', 'Tenant A product isolation failed');
assert(listB1.length === 1 && listB1[0].sku === 'AUDIT-B', 'Tenant B product isolation failed');
assert(!listA1.some((p) => p.id === productB.data.id), 'Tenant A can see tenant B product');

await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{ id: productB.data.id, name: 'San pham B', quantity: 1, price: 1 }],
    payment_method: 'cash',
    paid_cash: 1,
    vat_rate: 0,
  },
  expected: 403,
});

const checkoutA = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{ id: productA.data.id, name: 'Tampered name', quantity: 2, price: 1 }],
    customer_name: 'Khach audit',
    customer_phone: '0909000001',
    payment_method: 'cash',
    paid_cash: 200000,
    vat_rate: 0,
  },
  expected: 200,
});
assert(checkoutA.data?.order_code, 'POS checkout missing order code');
assert(Number(checkoutA.data.total_amount) === 200000, `Server-authoritative price failed: ${JSON.stringify(checkoutA.data)}`);
assert(checkoutA.data.payment_status === 'paid', 'Cash checkout should commit as paid');

const listA2 = (await call('/products', { token: a.token })).data;
const afterSale = listA2.find((p) => p.id === productA.data.id);
assert(Number(afterSale?.stock) === 8, `Atomic inventory mismatch after selling 2 from stock 10: got ${afterSale?.stock}`);

const statusA = await call(`/pos/order/${checkoutA.data.order_code}`, { token: a.token });
const statusB = await call(`/pos/order/${checkoutA.data.order_code}`, { token: b.token });
assert(statusA.data.status === 'paid', 'Tenant A cannot read own order status');
assert(statusB.data.status === 'not_found', 'Order status leaks across tenants');

const ordersA = (await call('/pos/orders', { token: a.token })).data;
const ordersB = (await call('/pos/orders', { token: b.token })).data;
assert(ordersA.some((o) => o.order_code === checkoutA.data.order_code), 'Tenant A order not persisted');
assert(!ordersB.some((o) => o.order_code === checkoutA.data.order_code), 'Tenant B can see tenant A order');
const originalOrder = ordersA.find((o) => o.order_code === checkoutA.data.order_code);

const customersA = (await call('/customers', { token: a.token })).data;
const customersB = (await call('/customers', { token: b.token })).data;
assert(customersA.some((c) => c.phone === '0909000001'), 'POS customer was not persisted');
assert(!customersB.some((c) => c.phone === '0909000001'), 'Customer leaked across tenants');

const reportA = (await call('/reports/dashboard', { token: a.token })).data;
const reportB = (await call('/reports/dashboard', { token: b.token })).data;
assert(Number(reportA?.overview?.totalOrders) === 1, `Tenant A report order count mismatch: ${JSON.stringify(reportA)}`);
assert(Number(reportB?.overview?.totalOrders) === 0, `Tenant B report leaked tenant A order: ${JSON.stringify(reportB)}`);

const supplier = await call('/suppliers', {
  token: a.token,
  method: 'POST',
  body: { name: 'NCC Audit A', phone: '0281111111', address: 'HCM', tax_code: 'AUDIT-NCC-A' },
  expected: 200,
});
await call('/purchases', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: supplier.data.id,
    items: [{ product_id: productA.data.id, quantity: 5, cost_price: 50000 }],
    paid_amount: 100000,
    note: 'Core smoke purchase',
  },
  expected: 200,
});
const afterPurchase = (await call('/products', { token: a.token })).data.find((p) => p.id === productA.data.id);
assert(Number(afterPurchase?.stock) === 13, `Purchase inventory mismatch: expected 13, got ${afterPurchase?.stock}`);
const suppliersA = (await call('/suppliers', { token: a.token })).data;
const suppliersB = (await call('/suppliers', { token: b.token })).data;
const savedSupplier = suppliersA.find((s) => s.id === supplier.data.id);
assert(Number(savedSupplier?.total_purchased) === 250000, `Supplier purchased total mismatch: ${savedSupplier?.total_purchased}`);
assert(Number(savedSupplier?.total_debt) === 150000, `Supplier debt mismatch: ${savedSupplier?.total_debt}`);
assert(!suppliersB.some((s) => s.id === supplier.data.id), 'Supplier leaked across tenants');

let debtsA = (await call('/finance/debts', { token: a.token })).data;
assert(debtsA.some((d) => d.type === 'payable' && Number(d.amount) === 150000), 'Purchase payable debt missing');
const receivable = await call('/finance/debts', {
  token: a.token,
  method: 'POST',
  body: { type: 'receivable', partner_name: 'Khach no audit', amount: 400000, due_date: '2026-12-31', notes: 'Core smoke debt' },
  expected: 200,
});
await call(`/finance/debts/${receivable.data.id}/pay`, {
  token: a.token,
  method: 'POST',
  body: { paid_amount: 150000 },
  expected: 200,
});
debtsA = (await call('/finance/debts', { token: a.token })).data;
const paidDebt = debtsA.find((d) => d.id === receivable.data.id);
assert(Number(paidDebt?.paid_amount) === 150000 && paidDebt?.status === 'partial', `Debt partial payment mismatch: ${JSON.stringify(paidDebt)}`);
await call('/finance/cash-flows', {
  token: a.token,
  method: 'POST',
  body: { transaction_type: 'in', category: 'capital', amount: 300000, payment_method: 'bank', notes: 'Core smoke capital' },
  expected: 200,
});
const cashA = (await call('/finance/cash-flows', { token: a.token })).data;
const cashB = (await call('/finance/cash-flows', { token: b.token })).data;
assert(cashA.some((f) => f.category === 'purchase' && Number(f.amount) === 100000), 'Purchase cash outflow missing');
assert(cashA.some((f) => f.category === 'debt_collection' && Number(f.amount) === 150000), 'Debt collection cash flow missing');
assert(cashA.some((f) => f.category === 'capital' && Number(f.amount) === 300000), 'Manual cash flow missing');
assert(cashB.length === 0, 'Finance cash flow leaked across tenants');

const returned = await call('/returns', {
  token: a.token,
  method: 'POST',
  body: {
    order_id: originalOrder.id,
    order_code: checkoutA.data.order_code,
    items: [{ product_id: productA.data.id, product_name: 'tampered', quantity: 1, price: 1 }],
    reason: 'Core smoke partial return',
  },
  expected: 200,
});
assert(Number(returned.data.total_refund) === 100000, `Return trusted client price instead of original sale price: ${JSON.stringify(returned.data)}`);
const afterReturn = (await call('/products', { token: a.token })).data.find((p) => p.id === productA.data.id);
assert(Number(afterReturn?.stock) === 14, `Return inventory mismatch: expected 14, got ${afterReturn?.stock}`);
await call('/returns', {
  token: a.token,
  method: 'POST',
  body: {
    order_id: originalOrder.id,
    order_code: checkoutA.data.order_code,
    items: [{ product_id: productA.data.id, quantity: 2, price: 1 }],
  },
  expected: 409,
});
await call(`/pos/${originalOrder.id}/cancel`, {
  token: a.token,
  method: 'POST',
  body: { cancel_reason: 'Must be blocked after return' },
  expected: 409,
});

const secondSale = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: { cart: [{ id: productA.data.id, quantity: 1, price: 1 }], payment_method: 'cash', paid_cash: 100000, vat_rate: 0 },
  expected: 200,
});
let currentStock = Number((await call('/products', { token: a.token })).data.find((p) => p.id === productA.data.id)?.stock);
assert(currentStock === 13, `Second sale stock mismatch before cancel: ${currentStock}`);
const secondOrder = (await call('/pos/orders', { token: a.token })).data.find((o) => o.order_code === secondSale.data.order_code);
await call(`/pos/${secondOrder.id}/cancel`, { token: a.token, method: 'POST', body: { cancel_reason: 'Core smoke cancel' }, expected: 200 });
currentStock = Number((await call('/products', { token: a.token })).data.find((p) => p.id === productA.data.id)?.stock);
assert(currentStock === 14, `Cancel did not restore stock atomically: ${currentStock}`);

const bankSale = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: { cart: [{ id: productA.data.id, quantity: 1, price: 1 }], payment_method: 'bank', paid_bank: 100000, vat_rate: 0 },
  expected: 200,
});
assert(bankSale.data.payment_status === 'pending_payment', 'Bank checkout must wait for webhook confirmation');
const beforeWebhook = await call(`/pos/order/${bankSale.data.order_code}`, { token: a.token });
assert(beforeWebhook.data.status === 'pending_payment', 'Bank order was marked paid before webhook');
await call('/pos/vietqr-webhook', {
  method: 'POST',
  headers: { 'x-webhook-secret': 'audit-ui-webhook-test' },
  body: { user_id: tenantAId, data: [{ description: `Thanh toan ${bankSale.data.order_code}` }] },
  expected: 200,
});
const afterWebhook = await call(`/pos/order/${bankSale.data.order_code}`, { token: a.token });
assert(afterWebhook.data.status === 'paid', 'Signed bank webhook did not mark order paid');
const cashAfterWebhook = (await call('/finance/cash-flows', { token: a.token })).data;
assert(cashAfterWebhook.some((f) => f.reference_id === bankSale.data.order_code && f.payment_method === 'bank' && Number(f.amount) === 100000), 'Bank sale cash flow missing after webhook');

const taxStats = (await call('/transactions/stats', { token: a.token })).data;
assert(taxStats.totalTax === null, 'Tax stats must fail closed instead of returning hard-coded tax');
assert(taxStats.calculationStatus === 'REQUIRES_RULE_CONTEXT', 'Tax stats missing rule-context hard gate');
await call('/transactions/export-01cnkd-custom', {
  token: a.token,
  method: 'POST',
  body: { r1: 200000, r2: 0, r3: 0, r4: 0 },
  expected: 409,
});

await import('./smoke-omni.mjs');

console.log('CORE SMOKE PASSED: auth + 2 tenants + server pricing + atomic POS + inventory + supplier/purchase + finance/debt + returns + cancel guard + VietQR + reports + tax fail-closed + omnichannel safety');
