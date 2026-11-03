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
    body: { phone, name, password: 'PurchaseSmoke2026!', sector: 'retail' },
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

const a = await register('0966889911', 'Purchase Integrity Tenant A');
const b = await register('0966889912', 'Purchase Integrity Tenant B');

const branchesA = (await call('/branches', { token: a.token, expected: 200 })).data;
const branchesB = (await call('/branches', { token: b.token, expected: 200 })).data;
const branchA = branchesA.find((row) => Number(row.is_default) === 1) || branchesA[0];
const branchB = branchesB.find((row) => Number(row.is_default) === 1) || branchesB[0];
assert(branchA?.id && branchB?.id, 'Purchase smoke requires default branches for both tenants');

const productCreated = await call('/products', {
  token: a.token,
  method: 'POST',
  body: { name: 'Purchase Atomic Product', sku: `PURCHASE-${Date.now()}`, price: 120000, cost_price: 50000, stock: 10, category: 'Smoke' },
  expected: 200,
});
const productId = Number(productCreated.data?.id);
assert(productId > 0, 'Purchase smoke product missing id');

const supplierCreated = await call('/suppliers', {
  token: a.token,
  method: 'POST',
  body: { name: 'NCC Purchase Smoke', phone: '02866889911', tax_code: `SMOKE-PUR-${Date.now()}` },
  expected: 200,
});
const supplierId = Number(supplierCreated.data?.id);
assert(supplierId > 0, 'Purchase smoke supplier missing id');

let product = await productById(a.token, productId);
assert(Number(product.stock) === 10 && Number(product.cost_price) === 50000, `Unexpected initial product state: ${JSON.stringify(product)}`);

await call('/purchases', {
  token: a.token,
  method: 'POST',
  body: {
    branch_id: branchB.id,
    supplier_id: supplierId,
    items: [{ product_id: productId, quantity: 1, cost_price: 60000 }],
  },
  expected: 404,
});
product = await productById(a.token, productId);
assert(Number(product.stock) === 10 && Number(product.cost_price) === 50000, 'Cross-tenant branch attempt mutated product stock/cost');

await call('/purchases', {
  token: a.token,
  method: 'POST',
  body: {
    branch_id: branchA.id,
    items: [{ product_id: productId, quantity: 'Infinity', cost_price: 60000 }],
  },
  expected: 400,
});
await call('/purchases', {
  token: a.token,
  method: 'POST',
  body: {
    branch_id: branchA.id,
    items: [{ product_id: productId, quantity: 1, cost_price: 'Infinity' }],
  },
  expected: 400,
});
product = await productById(a.token, productId);
assert(Number(product.stock) === 10 && Number(product.cost_price) === 50000, 'Rejected non-finite purchase mutated product');

const duplicatePurchase = await call('/purchases', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: supplierId,
    branch_id: branchA.id,
    items: [
      { product_id: productId, quantity: 2, cost_price: 70000 },
      { product_id: productId, quantity: 3, cost_price: 80000 },
    ],
    paid_amount: 80000,
    payment_method: 'bank',
    payment_reference: 'PURCHASE-SMOKE-BANK-1',
    note: 'Duplicate-line weighted-cost regression',
  },
  expected: 200,
});
assert(Number(duplicatePurchase.data?.total_amount) === 380000, `Duplicate-line purchase total mismatch: ${JSON.stringify(duplicatePurchase.data)}`);
assert(Number(duplicatePurchase.data?.con_no) === 300000, 'Duplicate-line supplier debt mismatch');
assert(duplicatePurchase.data?.payment_method === 'bank' && duplicatePurchase.data?.payment_evidence_status === 'RECORDED', 'Purchase payment evidence response mismatch');

product = await productById(a.token, productId);
assert(Number(product.stock) === 15, `Duplicate-line purchase stock expected 15, got ${product.stock}`);
assert(Number(product.cost_price) === 58667, `Weighted average cost expected 58667, got ${product.cost_price}`);

const detail = await call(`/purchases/${duplicatePurchase.data.id}`, { token: a.token, expected: 200 });
assert(detail.data?.items?.length === 2, 'Purchase must preserve original duplicate line detail');
assert(detail.data?.payment_evidence?.length === 1, 'Purchase payment evidence missing');
assert(detail.data.payment_evidence[0].payment_method === 'bank', `Payment evidence method mismatch: ${JSON.stringify(detail.data.payment_evidence)}`);
assert(Number(detail.data.payment_evidence[0].amount) === 80000, 'Payment evidence amount mismatch');

const supplier = (await call('/suppliers', { token: a.token, expected: 200 })).data.find((row) => Number(row.id) === supplierId);
assert(Number(supplier?.total_purchased) === 380000, `Supplier purchased total expected 380000, got ${supplier?.total_purchased}`);
assert(Number(supplier?.total_debt) === 300000, `Supplier debt expected 300000, got ${supplier?.total_debt}`);

const concurrent = await Promise.all([
  call('/purchases', {
    token: a.token,
    method: 'POST',
    body: { branch_id: branchA.id, items: [{ product_id: productId, quantity: 1, cost_price: 90000 }] },
    expected: 200,
  }),
  call('/purchases', {
    token: a.token,
    method: 'POST',
    body: { branch_id: branchA.id, items: [{ product_id: productId, quantity: 1, cost_price: 110000 }] },
    expected: 200,
  }),
]);
assert(concurrent.every((result) => result.status === 200), `Concurrent purchases did not both commit: ${concurrent.map((result) => result.status).join(',')}`);
product = await productById(a.token, productId);
assert(Number(product.stock) === 17, `Concurrent purchases stock expected 17, got ${product.stock}`);
assert(Number(product.cost_price) === 63529, `Concurrent purchases weighted cost expected 63529, got ${product.cost_price}`);

const summary = await call('/branches/ton-kho/tong-hop', { token: a.token, expected: 200 });
const branchProduct = summary.data?.products?.find((row) => Number(row.id) === productId);
assert(branchProduct, 'Purchase product missing from branch stock summary');
assert(Number(branchProduct.ton?.[branchA.id]) === 17, `Default branch stock expected 17, got ${branchProduct.ton?.[branchA.id]}`);
assert(Number(branchProduct.stock) === 17, `Product/branch total stock diverged: ${JSON.stringify(branchProduct)}`);

// Variant regression: purchasing stock for a variant must make that exact variant sellable in POS.
const variantCreated = await call('/products/with-variants', {
  token: a.token,
  method: 'POST',
  body: {
    name: 'Purchase Variant Stock Product',
    category: 'Smoke',
    warranty_months: 0,
    variants: [
      { sku: `PUR-VAR-A-${Date.now()}`, price: 200000, cost_price: 100000, stock: 0, attributes: { 'Màu': 'Đen' } },
      { sku: `PUR-VAR-B-${Date.now()}`, price: 210000, cost_price: 110000, stock: 0, attributes: { 'Màu': 'Trắng' } },
    ],
  },
  expected: 200,
});
const variantProductId = Number(variantCreated.data?.product_id);
let variantProduct = await productById(a.token, variantProductId);
const variantA = variantProduct.variants.find((row) => row.attributes?.['Màu'] === 'Đen');
const variantB = variantProduct.variants.find((row) => row.attributes?.['Màu'] === 'Trắng');
assert(variantA?.id && variantB?.id, 'Variant purchase regression missing variants');

await call('/purchases', {
  token: a.token,
  method: 'POST',
  body: {
    branch_id: branchA.id,
    items: [{ product_id: variantProductId, variant_id: variantB.id, quantity: 3, cost_price: 120000 }],
  },
  expected: 200,
});
variantProduct = await productById(a.token, variantProductId);
assert(Number(variantProduct.stock) === 3, `Variant purchase parent stock expected 3: ${JSON.stringify(variantProduct)}`);
assert(Number(variantProduct.variants.find((row) => Number(row.id) === Number(variantA.id))?.stock) === 0,
  'Purchase of variant B must not change variant A');
assert(Number(variantProduct.variants.find((row) => Number(row.id) === Number(variantB.id))?.stock) === 3,
  'Purchase of variant B must increase exact variant stock');

await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: {
    cart: [{ id: variantProductId, variant_id: variantB.id, quantity: 1, price: 210000, warranty_months: 0 }],
    customer_name: 'Khách lẻ',
    customer_phone: '',
    payment_method: 'cash',
    branch_id: branchA.id,
  },
  expected: 200,
});
variantProduct = await productById(a.token, variantProductId);
assert(Number(variantProduct.stock) === 2, 'POS sale after variant purchase must reduce parent stock');
assert(Number(variantProduct.variants.find((row) => Number(row.id) === Number(variantB.id))?.stock) === 2,
  'POS sale after variant purchase must reduce exact variant stock');

console.log('PURCHASE INTEGRITY SMOKE PASSED: tenant-safe branch + finite input + duplicate weighted cost + atomic concurrent purchases + payment evidence + variant receipt -> POS sale');
