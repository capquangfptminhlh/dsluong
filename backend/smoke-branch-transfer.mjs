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

function stockAt(summary, productId, branchId) {
  const product = summary.data?.products?.find((row) => row.id === productId);
  assert(product, `Product ${productId} missing from branch summary`);
  return Number(product.ton?.[branchId] || 0);
}

const ownerA = await call('/auth/register', {
  method: 'POST',
  body: { phone: '0966889901', name: 'Branch Transfer Tenant A', password: 'BranchSmoke2026!', sector: 'retail' },
  expected: 200,
});
const tokenA = ownerA.data?.token;
assert(tokenA, 'Branch smoke tenant A registration missing token');

const initialBranches = await call('/branches', { token: tokenA, expected: 200 });
const source = initialBranches.data?.find((row) => Number(row.is_default) === 1) || initialBranches.data?.[0];
assert(source?.id, 'Default source branch missing');

const targetCreated = await call('/branches', {
  token: tokenA,
  method: 'POST',
  body: { name: 'Kho đích smoke', address: 'Smoke test' },
  expected: 200,
});
const targetId = Number(targetCreated.data?.id);
assert(targetId > 0, 'Target branch was not created');

const productCreated = await call('/products', {
  token: tokenA,
  method: 'POST',
  body: { name: 'Branch Atomic Product', sku: `BRANCH-${Date.now()}`, price: 100000, cost_price: 50000, stock: 10, category: 'Smoke' },
  expected: 200,
});
const productId = Number(productCreated.data?.id);
assert(productId > 0, 'Branch smoke product was not created');

let summary = await call('/branches/ton-kho/tong-hop', { token: tokenA, expected: 200 });
assert(stockAt(summary, productId, source.id) === 10, 'Initial stock must seed into the default branch');
assert(stockAt(summary, productId, targetId) === 0, 'Target branch must start at zero');

await call('/branches/chuyen-kho', {
  token: tokenA,
  method: 'POST',
  body: { from_branch_id: source.id, to_branch_id: targetId, items: [{ product_id: productId, quantity: 'Infinity' }] },
  expected: 400,
});

await call('/branches/chuyen-kho', {
  token: tokenA,
  method: 'POST',
  body: {
    from_branch_id: source.id,
    to_branch_id: targetId,
    items: [
      { product_id: productId, quantity: 6 },
      { product_id: productId, quantity: 6 },
    ],
  },
  expected: 409,
});
summary = await call('/branches/ton-kho/tong-hop', { token: tokenA, expected: 200 });
assert(stockAt(summary, productId, source.id) === 10, 'Rejected duplicate-line transfer must not decrement source stock');
assert(stockAt(summary, productId, targetId) === 0, 'Rejected duplicate-line transfer must not increment target stock');

await call('/branches/chuyen-kho', {
  token: tokenA,
  method: 'POST',
  body: { from_branch_id: source.id, to_branch_id: targetId, items: [{ product_id: productId, quantity: 4 }] },
  expected: 200,
});
summary = await call('/branches/ton-kho/tong-hop', { token: tokenA, expected: 200 });
assert(stockAt(summary, productId, source.id) === 6, 'Valid transfer must decrement source to 6');
assert(stockAt(summary, productId, targetId) === 4, 'Valid transfer must increment target to 4');

const concurrent = await Promise.all([
  call('/branches/chuyen-kho', {
    token: tokenA,
    method: 'POST',
    body: { from_branch_id: source.id, to_branch_id: targetId, items: [{ product_id: productId, quantity: 4 }] },
    expected: [200, 409],
  }),
  call('/branches/chuyen-kho', {
    token: tokenA,
    method: 'POST',
    body: { from_branch_id: source.id, to_branch_id: targetId, items: [{ product_id: productId, quantity: 4 }] },
    expected: [200, 409],
  }),
]);
assert(concurrent.filter((item) => item.status === 200).length === 1, `Concurrent transfers must have exactly one success, got ${concurrent.map((item) => item.status).join(',')}`);
assert(concurrent.filter((item) => item.status === 409).length === 1, `Concurrent overdraw must fail with 409, got ${concurrent.map((item) => item.status).join(',')}`);

summary = await call('/branches/ton-kho/tong-hop', { token: tokenA, expected: 200 });
assert(stockAt(summary, productId, source.id) === 2, 'Concurrent transfer protection must leave source at 2, never negative');
assert(stockAt(summary, productId, targetId) === 8, 'Concurrent transfer protection must leave target at 8');
const totalProduct = summary.data?.products?.find((row) => row.id === productId);
assert(Number(totalProduct?.stock) === 10, `Product total stock must remain 10, got ${totalProduct?.stock}`);

const ownerB = await call('/auth/register', {
  method: 'POST',
  body: { phone: '0966889902', name: 'Branch Transfer Tenant B', password: 'BranchSmoke2026!', sector: 'retail' },
  expected: 200,
});
const branchesB = await call('/branches', { token: ownerB.data?.token, expected: 200 });
const foreignBranch = branchesB.data?.[0];
assert(foreignBranch?.id, 'Tenant B branch missing');
await call('/branches/chuyen-kho', {
  token: tokenA,
  method: 'POST',
  body: { from_branch_id: source.id, to_branch_id: foreignBranch.id, items: [{ product_id: productId, quantity: 1 }] },
  expected: 404,
});
summary = await call('/branches/ton-kho/tong-hop', { token: tokenA, expected: 200 });
assert(stockAt(summary, productId, source.id) === 2 && stockAt(summary, productId, targetId) === 8, 'Cross-tenant transfer attempt must not mutate tenant A stock');

console.log('BRANCH TRANSFER SMOKE PASSED: finite quantities + duplicate aggregation + atomic stock movement + concurrent overdraw protection + tenant isolation');
