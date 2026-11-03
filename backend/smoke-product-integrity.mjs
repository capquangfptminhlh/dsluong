const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const PASSWORD = 'AuditCore2026!';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(path, { token, method = 'GET', body, expected = 200 } = {}) {
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
  try { data = text ? JSON.parse(text) : null; } catch {}
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  return data;
}

async function register(phone, name) {
  const data = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: PASSWORD, sector: 'retail' },
  });
  assert(data?.token, `Registration ${phone} missing token`);
  return data;
}

const a = await register('0933333333', 'Product Integrity A');
const b = await register('0944444444', 'Product Integrity B');

const a1 = await call('/products', {
  token: a.token,
  method: 'POST',
  body: { name: 'Integrity A1', price: 100000, cost_price: 50000, stock: 4, category: 'Test' },
});
const a2 = await call('/products', {
  token: a.token,
  method: 'POST',
  body: { name: 'Integrity A2', price: 200000, cost_price: 100000, stock: 6, category: 'Test' },
});
const b1 = await call('/products', {
  token: b.token,
  method: 'POST',
  body: { name: 'Integrity B1', price: 900000, cost_price: 600000, stock: 2, category: 'Test' },
});
assert(a1.sku?.startsWith('SP-') && a2.sku?.startsWith('SP-'), 'Generated product SKU prefix mismatch');
assert(a1.sku !== a2.sku, 'Generated product SKUs collided');

const beforeFailedVariants = await call('/products', { token: a.token });
await call('/products/with-variants', {
  token: a.token,
  method: 'POST',
  expected: 409,
  body: {
    name: 'Must Roll Back',
    category: 'Test',
    variants: [
      { sku: 'DUP-SKU', price: 10000, cost_price: 5000, stock: 1, attributes: { Size: 'S' } },
      { sku: 'DUP-SKU', price: 12000, cost_price: 6000, stock: 1, attributes: { Size: 'M' } },
    ],
  },
});
const afterFailedVariants = await call('/products', { token: a.token });
assert(afterFailedVariants.length === beforeFailedVariants.length, 'Failed variant write left a parent product behind');
assert(!afterFailedVariants.some((item) => item.name === 'Must Roll Back'), 'Rolled-back variant parent is still visible');

const validVariants = await call('/products/with-variants', {
  token: a.token,
  method: 'POST',
  body: {
    name: 'Atomic Variants',
    category: 'Test',
    variants: [
      { sku: 'ATOMIC-S', price: 30000, cost_price: 10000, stock: 2, attributes: { Size: 'S' } },
      { sku: 'ATOMIC-M', price: 30000, cost_price: 10000, stock: 3, attributes: { Size: 'M' } },
    ],
  },
});
assert(validVariants?.variants_created === 2, `Valid variant count mismatch: ${JSON.stringify(validVariants)}`);

const listAfterVariants = await call('/products', { token: a.token });
const parent = listAfterVariants.find((item) => item.id === validVariants.product_id);
assert(parent && parent.variants?.length === 2, 'Committed variant product is incomplete');
assert(Number(parent.stock) === 5, `Variant parent total stock mismatch: ${parent?.stock}`);

const bulk = await call('/products/bulk-update-price', {
  token: a.token,
  method: 'POST',
  body: { ids: [a1.id, a2.id, b1.id], type: 'percent_add', value: 10 },
});
assert(bulk.count === 2, `Bulk pricing must only update tenant A products; got count ${bulk.count}`);

const afterBulkA = await call('/products', { token: a.token });
const afterBulkB = await call('/products', { token: b.token });
assert(Number(afterBulkA.find((item) => item.id === a1.id)?.price) === 110000, 'Bulk price response returned before A1 update committed');
assert(Number(afterBulkA.find((item) => item.id === a2.id)?.price) === 220000, 'Bulk price response returned before A2 update committed');
assert(Number(afterBulkB.find((item) => item.id === b1.id)?.price) === 900000, 'Bulk pricing crossed tenant boundary');

await call('/products/bulk-update-price', {
  token: a.token,
  method: 'POST',
  expected: 400,
  body: { ids: [a1.id], type: 'unknown_operation', value: 10 },
});

console.log('PRODUCT INTEGRITY SMOKE PASSED: generated SKUs + atomic variants + committed bulk pricing + tenant isolation');
