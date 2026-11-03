const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3103/api';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  const allowed = expected === undefined ? null : (Array.isArray(expected) ? expected : [expected]);
  if (allowed) assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  else assert(response.ok, `${method} ${path}: HTTP ${response.status}: ${text}`);
  return { status: response.status, data };
}

const stamp = String(Date.now()).slice(-8);
const customerPhone = `07${stamp}`.slice(0, 10);
const auth = await call('/auth/register', {
  method: 'POST',
  body: { phone: `09${stamp}`.slice(0, 10), name: `POS Multiline ${stamp}`, password: 'Multiline2026!', sector: 'retail' },
  expected: 200,
});
const token = auth.data?.token;
assert(token, 'Missing owner token');

const created = await call('/products/with-variants', {
  token,
  method: 'POST',
  body: {
    name: `Multiline Product ${stamp}`,
    category: 'E2E',
    warranty_months: 12,
    warranty_options: [{ months: 12, price: 1200000 }, { months: 24, price: 1350000 }],
    variants: [
      { sku: `ML-A-${stamp}`, price: 1000000, cost_price: 700000, stock: 6, attributes: { 'Phiên bản': 'A' } },
      { sku: `ML-B-${stamp}`, price: 1100000, cost_price: 750000, stock: 4, attributes: { 'Phiên bản': 'B' } },
    ],
  },
  expected: 200,
});
const productId = Number(created.data?.product_id);
assert(productId > 0, 'Missing product id');

await call('/customers', {
  token,
  method: 'POST',
  body: { name: `Khách Multiline ${stamp}`, phone: customerPhone },
  expected: 201,
});

const before = (await call('/products', { token, expected: 200 })).data.find((p) => Number(p.id) === productId);
assert(before, 'Product missing before checkout');
const a = before.variants.find((v) => v.sku === `ML-A-${stamp}`);
const b = before.variants.find((v) => v.sku === `ML-B-${stamp}`);
assert(a?.id && b?.id, 'Variant ids missing');

const checkout = await call('/pos/checkout', {
  token,
  method: 'POST',
  body: {
    cart: [
      { id: productId, variant_id: b.id, quantity: 3, warranty_months: 24, price: 1 },
      { id: productId, variant_id: a.id, quantity: 1, warranty_months: 12, price: 999999999 },
    ],
    customer_name: `Khách Multiline ${stamp}`,
    customer_phone: customerPhone,
    payment_method: 'cash',
  },
  expected: 200,
});
assert(checkout.data?.order_code, 'Checkout missing order_code');
assert(Number(checkout.data?.total_amount) === 5250000,
  `Server authoritative package total must be 5,250,000, got ${checkout.data?.total_amount}`);

const after = (await call('/products', { token, expected: 200 })).data.find((p) => Number(p.id) === productId);
const afterA = after.variants.find((v) => v.sku === `ML-A-${stamp}`);
const afterB = after.variants.find((v) => v.sku === `ML-B-${stamp}`);
assert(Number(after.stock) === 6, `Parent stock must be 10->6, got ${after.stock}`);
assert(Number(afterA.stock) === 5, `Variant A stock must be 6->5, got ${afterA.stock}`);
assert(Number(afterB.stock) === 1, `Variant B stock must be 4->1, got ${afterB.stock}`);

const warranties = (await call('/pd/warranties', { token, expected: 200 })).data
  .filter((row) => row.order_code === checkout.data.order_code);
assert(warranties.length >= 2, `Expected warranties for both sold lines, got ${JSON.stringify(warranties)}`);
assert(warranties.some((row) => Number(row.months) === 12), 'Missing 12-month warranty');
assert(warranties.some((row) => Number(row.months) === 24), 'Missing 24-month warranty');

console.log('POS MULTILINE PASSED: same product, two variants, two warranty packages, server-authoritative price, exact stock and warranties');
