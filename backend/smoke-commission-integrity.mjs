import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function request(path, { token, method = 'GET', body } = {}) {
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
  return { status: response.status, data, text };
}

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const result = await request(path, { token, method, body });
  if (expected !== undefined) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert(allowed.includes(result.status), `${method} ${path}: expected ${allowed.join('/')}, got ${result.status}: ${result.text}`);
  } else {
    assert(result.status >= 200 && result.status < 300, `${method} ${path}: HTTP ${result.status}: ${result.text}`);
  }
  return result.data;
}

async function register(phone, name) {
  const data = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'Commission2026!', sector: 'retail' },
    expected: 200,
  });
  assert(data?.token, `Registration missing token for ${phone}`);
  return data;
}

async function createStaff(token, username, name) {
  const data = await call('/staff', {
    token,
    method: 'POST',
    body: {
      name,
      username,
      password: 'Commission2026!',
      role: 'Nhân viên',
      permissions: ['pos'],
    },
    expected: 200,
  });
  assert(data?.id, `Staff ${username} not created`);
  return Number(data.id);
}

async function createProduct(token, sku, name) {
  const data = await call('/products', {
    token,
    method: 'POST',
    body: { name, sku, price: 100000, cost_price: 50000, stock: 20, category: 'Commission smoke' },
    expected: 200,
  });
  assert(data?.id, `Product ${sku} not created`);
  return Number(data.id);
}

async function createSale(token, productId) {
  const checkout = await call('/pos/checkout', {
    token,
    method: 'POST',
    body: {
      cart: [{ id: productId, quantity: 1, price: 1 }],
      payment_method: 'cash',
      paid_cash: 100000,
      vat_rate: 0,
    },
    expected: 200,
  });
  assert(checkout?.order_code, 'Checkout missing order_code');
  const orders = await call('/pos/orders', { token, expected: 200 });
  const order = orders.find((row) => row.order_code === checkout.order_code);
  assert(order?.id, `Cannot resolve order ${checkout.order_code}`);
  return order;
}

const tenantA = await register('0966557811', 'Commission Tenant A');
const tenantB = await register('0966557812', 'Commission Tenant B');
const staffA = await createStaff(tenantA.token, 'commission_staff_a', 'Nhân viên hoa hồng A');
const staffB = await createStaff(tenantB.token, 'commission_staff_b', 'Nhân viên hoa hồng B');
const productA = await createProduct(tenantA.token, 'COMM-A', 'Sản phẩm commission A');
const productB = await createProduct(tenantB.token, 'COMM-B', 'Sản phẩm commission B');
const orderA = await createSale(tenantA.token, productA);
const orderB = await createSale(tenantB.token, productB);

// Tenant isolation must hold for both staff and order references.
await call('/staff/commissions', {
  token: tenantA.token,
  method: 'POST',
  body: { staff_id: staffA, amount: 10000, order_id: orderB.id },
  expected: 404,
});
await call('/staff/commissions', {
  token: tenantA.token,
  method: 'POST',
  body: { staff_id: staffB, amount: 10000, order_id: orderA.id },
  expected: 404,
});

// Even when requests arrive together, staff+order is one business fact. Exactly one
// insert succeeds and the retry/double-submit is rejected without a duplicate row.
const duplicateResults = await Promise.all([
  request('/staff/commissions', {
    token: tenantA.token,
    method: 'POST',
    body: { staff_id: staffA, amount: 25000, order_id: orderA.id },
  }),
  request('/staff/commissions', {
    token: tenantA.token,
    method: 'POST',
    body: { staff_id: staffA, amount: 25000, order_id: orderA.id },
  }),
]);
const duplicateStatuses = duplicateResults.map((result) => result.status).sort((a, b) => a - b);
assert(duplicateStatuses[0] === 200 && duplicateStatuses[1] === 409,
  `Concurrent order commission must resolve 200/409: ${JSON.stringify(duplicateResults)}`);

const native = new Database(DB_PATH);
native.pragma('busy_timeout = 5000');
try {
  const exactCount = native.prepare(
    'SELECT COUNT(*) AS count FROM commissions WHERE staff_id = ? AND order_id = ?'
  ).get(staffA, orderA.id);
  assert(Number(exactCount?.count) === 1, `Duplicate commission persisted: ${JSON.stringify(exactCount)}`);
} finally {
  native.close();
}

// A cancelled sale remains in history, but cannot receive a new commission after cancel.
const cancelledOrder = await createSale(tenantA.token, productA);
await call(`/pos/${cancelledOrder.id}/cancel`, {
  token: tenantA.token,
  method: 'POST',
  body: { cancel_reason: 'Commission integrity smoke' },
  expected: 200,
});
await call('/staff/commissions', {
  token: tenantA.token,
  method: 'POST',
  body: { staff_id: staffA, amount: 15000, order_id: cancelledOrder.id },
  expected: 409,
});

// Manual adjustments without an order are intentionally repeatable; dedupe applies only
// when order_id gives the write a stable business identity.
await call('/staff/commissions', {
  token: tenantA.token,
  method: 'POST',
  body: { staff_id: staffA, amount: 5000, order_id: null },
  expected: 200,
});
await call('/staff/commissions', {
  token: tenantA.token,
  method: 'POST',
  body: { staff_id: staffA, amount: 5000, order_id: null },
  expected: 200,
});

const summary = await call('/staff/commissions', { token: tenantA.token, expected: 200 });
const row = summary.find((item) => Number(item.staff_id) === staffA);
assert(Number(row?.so_lan) === 3, `Commission count must be 1 order-linked + 2 manual: ${JSON.stringify(row)}`);
assert(Number(row?.tong_hoa_hong) === 35000, `Commission total mismatch: ${JSON.stringify(row)}`);

await call('/staff/commissions', {
  token: tenantA.token,
  method: 'POST',
  body: { staff_id: staffA, amount: -1, order_id: null },
  expected: 400,
});

console.log('COMMISSION INTEGRITY SMOKE PASSED: tenant/order validation + cancelled-order guard + retry-safe order commission + repeatable manual adjustments');
