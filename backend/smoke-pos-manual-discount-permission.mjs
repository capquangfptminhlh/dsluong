const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const PASSWORD = 'DiscountGuard2026!';
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
  const allowed = expected === undefined ? null : (Array.isArray(expected) ? expected : [expected]);
  if (allowed) assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  else assert(response.ok, `${method} ${path}: ${response.status}: ${text}`);
  return { status: response.status, data };
}

const seed = String(Date.now()).slice(-7);
const ownerPhone = `09${seed}71`.slice(0, 10);
const registered = await call('/auth/register', {
  method: 'POST',
  body: { phone: ownerPhone, name: 'Discount Guard Owner', password: PASSWORD, sector: 'retail' },
  expected: 200,
});
const ownerToken = registered.data?.token;
assert(ownerToken, 'Owner registration missing token');

const product = await call('/products', {
  token: ownerToken,
  method: 'POST',
  body: { name: 'Discount Guard Product', sku: `DISC-${seed}`, price: 100000, cost_price: 50000, stock: 20, category: 'Smoke' },
  expected: 200,
});
const productId = Number(product.data?.id);
assert(productId > 0, 'Product create missing id');

const promo = await call('/promo', {
  token: ownerToken,
  method: 'POST',
  body: { name: 'Cashier Promo', min_order_value: 0, discount_amount: 10000 },
  expected: 200,
});
const promotionId = Number(promo.data?.id);
assert(promotionId > 0, 'Promo create missing id');

const username = `disc_${seed}`;
const staff = await call('/staff', {
  token: ownerToken,
  method: 'POST',
  body: { name: 'Cashier No Manual Discount', username, password: PASSWORD, role: 'Thu ngân', permissions: ['pos'] },
  expected: 200,
});
const staffId = Number(staff.data?.id);
assert(staffId > 0, 'Staff create missing id');

const login = await call('/auth/staff-login', {
  method: 'POST',
  body: { username, password: PASSWORD },
  expected: 200,
});
let staffToken = login.data?.token;
assert(staffToken, 'Staff login missing token');

await call('/pos/checkout', {
  token: staffToken,
  method: 'POST',
  body: {
    cart: [{ id: productId, quantity: 1 }],
    discount: 90000,
    paid_cash: 10000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 403,
});

await call('/pos/checkout', {
  token: staffToken,
  method: 'POST',
  body: {
    cart: [{ id: productId, quantity: 1, discount: 90000 }],
    discount: 0,
    paid_cash: 10000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 403,
});

const promoCheckout = await call('/pos/checkout', {
  token: staffToken,
  method: 'POST',
  body: {
    cart: [{ id: productId, quantity: 1 }],
    promotion_id: promotionId,
    discount: 1,
    paid_cash: 90000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 200,
});
assert(Number(promoCheckout.data?.discount) === 10000, `Cashier promo was not server-authoritative: ${JSON.stringify(promoCheckout.data)}`);

await call(`/staff/${staffId}`, {
  token: ownerToken,
  method: 'PUT',
  body: { permissions: ['pos', 'promotions'] },
  expected: 200,
});
const relogin = await call('/auth/staff-login', {
  method: 'POST',
  body: { username, password: PASSWORD },
  expected: 200,
});
staffToken = relogin.data?.token;
assert(staffToken, 'Staff re-login missing token after permission update');

const manualCheckout = await call('/pos/checkout', {
  token: staffToken,
  method: 'POST',
  body: {
    cart: [{ id: productId, quantity: 1, discount: 5000 }],
    discount: 5000,
    paid_cash: 90000,
    paid_bank: 0,
    payment_method: 'cash',
  },
  expected: 200,
});
assert(Number(manualCheckout.data?.subtotal) === 95000, `Authorized line discount mismatch: ${JSON.stringify(manualCheckout.data)}`);
assert(Number(manualCheckout.data?.discount) === 5000, `Authorized order discount mismatch: ${JSON.stringify(manualCheckout.data)}`);
assert(Number(manualCheckout.data?.total_amount) === 90000, `Authorized manual discount total mismatch: ${JSON.stringify(manualCheckout.data)}`);

console.log('POS MANUAL DISCOUNT PERMISSION SMOKE PASSED: cashier tampering blocked + configured promo allowed + promotions permission grants manual discount');
