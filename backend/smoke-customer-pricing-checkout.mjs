const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

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
  else assert(response.ok, `${method} ${path}: HTTP ${response.status}: ${text}`);
  return { status: response.status, data };
}

async function register(phone, name) {
  const result = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'CustomerPrice2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name}: registration missing token`);
  return result.data;
}

const suffix = String(Date.now()).slice(-7);
const shopPhone = `097${suffix}`;
const customerPhone = `090${suffix}`;
const tenant = await register(shopPhone, 'Customer Pricing Checkout');

const productCreated = await call('/products', {
  token: tenant.token,
  method: 'POST',
  body: {
    name: 'VIP Checkout Product',
    sku: `VIP-${suffix}`,
    price: 100000,
    cost_price: 40000,
    stock: 20,
    category: 'Smoke',
  },
  expected: 200,
});
const productId = Number(productCreated.data?.id);
assert(productId > 0, 'Customer pricing smoke product missing id');

const levelCreated = await call('/pricing/levels', {
  token: tenant.token,
  method: 'POST',
  body: { name: 'VIP Checkout' },
  expected: 200,
});
const levelId = Number(levelCreated.data?.id);
assert(levelId > 0, 'Customer pricing smoke level missing id');

await call('/pricing/matrix', {
  token: tenant.token,
  method: 'POST',
  body: { product_id: productId, level_id: levelId, price: 73000 },
  expected: 200,
});

const customerCreated = await call('/customers', {
  token: tenant.token,
  method: 'POST',
  body: { name: 'VIP Customer', phone: customerPhone },
  expected: 201,
});
const customerId = Number(customerCreated.data?.id);
assert(customerId > 0, 'Customer pricing smoke customer missing id');

await call(`/customers/${customerId}`, {
  token: tenant.token,
  method: 'PUT',
  body: { price_level_id: levelId },
  expected: 200,
});

const preview = await call(`/pricing/for-customer?phone=${encodeURIComponent(customerPhone)}`, {
  token: tenant.token,
  expected: 200,
});
assert(Number(preview.data?.prices?.[productId]) === 73000, `Customer price preview mismatch: ${JSON.stringify(preview.data)}`);

const checkout = await call('/pos/checkout', {
  token: tenant.token,
  method: 'POST',
  body: {
    cart: [{ id: productId, name: 'TAMPERED NAME', price: 1, quantity: 1 }],
    customer_name: 'VIP Customer',
    customer_phone: customerPhone,
    payment_method: 'cash',
  },
  expected: 200,
});
assert(Number(checkout.data?.subtotal) === 73000, `Server did not apply customer price level: ${JSON.stringify(checkout.data)}`);
assert(Number(checkout.data?.total_amount) === 73000, `Customer total mismatch: ${JSON.stringify(checkout.data)}`);

const guestCheckout = await call('/pos/checkout', {
  token: tenant.token,
  method: 'POST',
  body: {
    cart: [{ id: productId, price: 1, quantity: 1 }],
    payment_method: 'cash',
  },
  expected: 200,
});
assert(Number(guestCheckout.data?.subtotal) === 100000, `Guest checkout should fall back to base/default product price: ${JSON.stringify(guestCheckout.data)}`);

console.log('CUSTOMER PRICING CHECKOUT SMOKE PASSED: assigned price level applies server-side and client price tampering is ignored');
