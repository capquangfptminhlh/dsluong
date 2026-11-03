const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

const owner = await call('/auth/register', {
  method: 'POST',
  body: { phone: '0966112844', name: 'Warranty Checkout Smoke', password: 'WarrantySmoke2026!', sector: 'retail' },
  expected: 200,
});
const token = owner.data?.token;
assert(token, 'Warranty smoke registration missing token');

const created = await call('/products', {
  token,
  method: 'POST',
  body: {
    name: 'Laptop Warranty Package Smoke',
    sku: `BH-SMOKE-${Date.now()}`,
    price: 10000000,
    cost_price: 8000000,
    stock: 5,
    category: 'Laptop',
    warranty_months: 12,
    warranty_options: [
      { months: 0, price: 10000000 },
      { months: 12, price: 11000000 },
      { months: 24, price: 12000000 },
    ],
  },
  expected: 200,
});
assert(created.data?.id, 'Warranty product not created');
const productId = Number(created.data.id);

const products = await call('/products', { token, expected: 200 });
const product = products.data.find((row) => Number(row.id) === productId);
assert(product, 'Created warranty product missing from product read');
assert(Array.isArray(product.warranty_options) && product.warranty_options.length === 3, `Warranty packages not returned: ${JSON.stringify(product?.warranty_options)}`);
assert(Number(product.warranty_months) === 12, 'Default warranty months not persisted');

await call('/pos/checkout', {
  token,
  method: 'POST',
  body: {
    cart: [{ id: productId, quantity: 1, price: 1, warranty_months: 24 }],
    customer_name: 'Khách bảo hành',
    customer_phone: '',
    payment_method: 'cash', paid_cash: 12000000, paid_bank: 0, vat_rate: 0,
  },
  expected: 400,
});

await call('/pos/checkout', {
  token,
  method: 'POST',
  body: {
    cart: [{ id: productId, quantity: 1, price: 999, warranty_months: 18 }],
    customer_name: 'Khách bảo hành',
    customer_phone: '0909123456',
    payment_method: 'cash', paid_cash: 12000000, paid_bank: 0, vat_rate: 0,
  },
  expected: 400,
});

const checkout = await call('/pos/checkout', {
  token,
  method: 'POST',
  body: {
    cart: [{ id: productId, quantity: 1, price: 1, warranty_months: 24 }],
    customer_name: 'Khách bảo hành',
    customer_phone: '0909123456',
    payment_method: 'cash', paid_cash: 12000000, paid_bank: 0, vat_rate: 0,
  },
  expected: 200,
});
assert(Number(checkout.data?.total_amount) === 12000000, `Warranty package price must be server authoritative, got ${checkout.data?.total_amount}`);
assert(checkout.data?.order_code, 'Warranty checkout missing order code');

const warranties = await call('/pd/warranties', { token, expected: 200 });
const warranty = warranties.data.find((row) => row.order_code === checkout.data.order_code && Number(row.product_id) === productId);
assert(warranty, `Checkout did not auto-create warranty: ${JSON.stringify(warranties.data)}`);
assert(Number(warranty.months) === 24, `Warranty months expected 24, got ${warranty.months}`);
assert(warranty.customer_phone === '0909123456', `Warranty customer phone not reused from order: ${warranty.customer_phone}`);
assert(Number(warranty.quantity) === 1, `Warranty quantity expected 1, got ${warranty.quantity}`);

const orderId = Number(String(checkout.data.receipt_url || '').split('/').pop());
assert(Number.isInteger(orderId) && orderId > 0, `Could not resolve order id from ${checkout.data.receipt_url}`);
await call(`/pos/${orderId}/cancel`, { token, method: 'POST', body: { cancel_reason: 'Warranty smoke cleanup' }, expected: 200 });
const afterCancel = await call('/pd/warranties', { token, expected: 200 });
assert(!afterCancel.data.some((row) => row.order_code === checkout.data.order_code), 'Cancelled order left an active warranty record');

console.log('WARRANTY CHECKOUT SMOKE PASSED: product packages + server-authoritative price + one-time customer entry + auto warranty + cancel cleanup');
