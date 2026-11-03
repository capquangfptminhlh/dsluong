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
const auth = await call('/auth/register', {
  method: 'POST',
  body: { phone: `05${stamp}`, name: `Variant Lifecycle ${stamp}`, password: 'VariantLifecycle2026!', sector: 'retail' },
  expected: 200,
});
const token = auth.data?.token;
assert(token, 'Registration did not return token');

const created = await call('/products/with-variants', {
  token,
  method: 'POST',
  body: {
    name: `Variant Lifecycle Product ${stamp}`,
    category: 'E2E',
    warranty_months: 12,
    warranty_options: [{ months: 12, price: 1200000 }, { months: 24, price: 1350000 }],
    variants: [
      { sku: `VL-A-${stamp}`, price: 1000000, cost_price: 700000, stock: 5, attributes: { 'Phiên bản': 'A' } },
      { sku: `VL-B-${stamp}`, price: 1100000, cost_price: 750000, stock: 4, attributes: { 'Phiên bản': 'B' } },
    ],
  },
  expected: 200,
});
const productId = Number(created.data?.product_id);
assert(productId > 0, 'Missing product id');

async function loadProduct() {
  const rows = (await call('/products', { token, expected: 200 })).data;
  const product = rows.find((row) => Number(row.id) === productId);
  assert(product, 'Variant lifecycle product missing');
  return product;
}
function variant(product, sku) {
  const row = (product.variants || []).find((item) => item.sku === sku);
  assert(row, `Missing variant ${sku}`);
  return row;
}

let product = await loadProduct();
const a = variant(product, `VL-A-${stamp}`);
const b = variant(product, `VL-B-${stamp}`);
assert(Number(product.stock) === 9 && Number(a.stock) === 5 && Number(b.stock) === 4,
  `Initial stock mismatch parent=${product.stock} A=${a.stock} B=${b.stock}`);

const sale1 = await call('/pos/checkout', {
  token,
  method: 'POST',
  body: {
    cart: [
      { id: productId, variant_id: a.id, quantity: 1, warranty_months: 12, price: 1 },
      { id: productId, variant_id: b.id, quantity: 2, warranty_months: 24, price: 1 },
    ],
    customer_name: 'Khách Variant E2E', customer_phone: `04${stamp}`,
    payment_method: 'cash', paid_cash: 3900000, vat_rate: 0,
  },
  expected: 200,
});
assert(sale1.data?.order_code, 'First sale missing order code');
product = await loadProduct();
assert(Number(product.stock) === 6, `Sale must reduce parent stock 9->6, got ${product.stock}`);
assert(Number(variant(product, `VL-A-${stamp}`).stock) === 4, 'Sale must reduce A 5->4');
assert(Number(variant(product, `VL-B-${stamp}`).stock) === 2, 'Sale must reduce B 4->2');

const orders = (await call('/pos', { token, expected: 200 })).data;
const order1 = orders.find((row) => row.order_code === sale1.data.order_code);
assert(order1?.id, 'First order not found');

const eligibility = (await call(`/returns/eligibility/${order1.id}`, { token, expected: 200 })).data;
assert(Array.isArray(eligibility.items) && eligibility.items.length === 2,
  `Return eligibility must preserve two sold variant lines: ${JSON.stringify(eligibility.items)}`);
const lineA = eligibility.items.find((item) => Number(item.variant_id) === Number(a.id));
const lineB = eligibility.items.find((item) => Number(item.variant_id) === Number(b.id));
assert(lineA?.order_item_id && lineB?.order_item_id, 'Eligibility missing exact order_item_id/variant_id');
assert(Number(lineA.sold_quantity) === 1 && Number(lineB.sold_quantity) === 2, 'Eligibility variant quantities wrong');

await call('/returns', {
  token,
  method: 'POST',
  body: { order_id: order1.id, reason: 'Ambiguous legacy payload', items: [{ product_id: productId, quantity: 1 }] },
  expected: 409,
});

const returned = await call('/returns', {
  token,
  method: 'POST',
  body: {
    order_id: order1.id,
    reason: 'Return exactly one B',
    items: [{ order_item_id: lineB.order_item_id, product_id: productId, variant_id: b.id, quantity: 1 }],
  },
  expected: 200,
});
assert(returned.data?.code, 'Exact variant return missing code');
product = await loadProduct();
assert(Number(product.stock) === 7, `Return B must restore parent 6->7, got ${product.stock}`);
assert(Number(variant(product, `VL-A-${stamp}`).stock) === 4, 'Return B must not change A stock');
assert(Number(variant(product, `VL-B-${stamp}`).stock) === 3, 'Return B must restore B 2->3');

await call(`/pos/${order1.id}/cancel`, {
  token,
  method: 'POST',
  body: { reason: 'Must be blocked after return' },
  expected: 409,
});
product = await loadProduct();
assert(Number(product.stock) === 7
  && Number(variant(product, `VL-A-${stamp}`).stock) === 4
  && Number(variant(product, `VL-B-${stamp}`).stock) === 3,
  'Blocked cancellation mutated stock');

const sale2 = await call('/pos/checkout', {
  token,
  method: 'POST',
  body: {
    cart: [{ id: productId, variant_id: a.id, quantity: 1, warranty_months: 12, price: 1 }],
    customer_name: 'Khách Variant Cancel E2E', customer_phone: `03${stamp}`,
    payment_method: 'cash', paid_cash: 1200000, vat_rate: 0,
  },
  expected: 200,
});
const order2 = (await call('/pos', { token, expected: 200 })).data.find((row) => row.order_code === sale2.data.order_code);
assert(order2?.id, 'Second order missing');
product = await loadProduct();
assert(Number(product.stock) === 6 && Number(variant(product, `VL-A-${stamp}`).stock) === 3,
  'Second sale did not reduce A/parent stock');
await call(`/pos/${order2.id}/cancel`, { token, method: 'POST', body: { reason: 'Variant cancel restore E2E' }, expected: 200 });
product = await loadProduct();
assert(Number(product.stock) === 7
  && Number(variant(product, `VL-A-${stamp}`).stock) === 4
  && Number(variant(product, `VL-B-${stamp}`).stock) === 3,
  `Cancel did not restore exact variant stock: parent=${product.stock} A=${variant(product, `VL-A-${stamp}`).stock} B=${variant(product, `VL-B-${stamp}`).stock}`);

const warranties = (await call('/pd/warranties', { token, expected: 200 })).data;
assert(!warranties.some((row) => row.order_code === sale2.data.order_code), 'Cancellation must delete warranties of cancelled order');

console.log('VARIANT LIFECYCLE SMOKE PASSED: exact line sale -> stock -> exact variant return -> returned-order cancel guard -> clean cancel restore');
