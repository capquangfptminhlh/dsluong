import Database from 'better-sqlite3';
import path from 'node:path';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function call(apiPath, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${apiPath}`, {
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
    assert(allowed.includes(response.status), `${method} ${apiPath}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  } else {
    assert(response.ok, `${method} ${apiPath}: HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, data };
}

async function register(phone, name) {
  const result = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'SupplierOrderCreate2026!', sector: 'retail' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

async function createProduct(token, { name, sku, stock = 10, cost = 50000 }) {
  const result = await call('/products', {
    token,
    method: 'POST',
    body: { name, sku, price: 120000, cost_price: cost, stock, category: 'Smoke' },
    expected: 200,
  });
  const id = Number(result.data?.id);
  assert(id > 0, `Product ${name} missing id`);
  return id;
}

async function productById(token, id) {
  const rows = (await call('/products', { token, expected: 200 })).data;
  const product = rows.find((row) => Number(row.id) === Number(id));
  assert(product, `Product ${id} missing`);
  return product;
}

const a = await register('0966889981', 'Supplier Order Create Tenant A');
const b = await register('0966889982', 'Supplier Order Create Tenant B');

const branchesA = (await call('/branches', { token: a.token, expected: 200 })).data;
const branchesB = (await call('/branches', { token: b.token, expected: 200 })).data;
const branchA = branchesA.find((row) => Number(row.is_default) === 1) || branchesA[0];
const branchB = branchesB.find((row) => Number(row.is_default) === 1) || branchesB[0];
assert(branchA?.id && branchB?.id, 'Supplier order creation smoke requires default branches');

const productA = await createProduct(a.token, {
  name: 'Supplier Order Finite Product',
  sku: `SUP-ORDER-FIN-${Date.now()}`,
});
const productFail = await createProduct(a.token, {
  name: 'Supplier Order Atomic Fail Item',
  sku: `SUP-ORDER-FAIL-${Date.now()}`,
});
const productB = await createProduct(b.token, {
  name: 'Supplier Order Foreign Product',
  sku: `SUP-ORDER-FOREIGN-${Date.now()}`,
});

const supplierAResult = await call('/suppliers', {
  token: a.token,
  method: 'POST',
  body: { name: 'NCC Supplier Order Create A', phone: '02866889981', tax_code: `SOC-A-${Date.now()}` },
  expected: 200,
});
const supplierBResult = await call('/suppliers', {
  token: b.token,
  method: 'POST',
  body: { name: 'NCC Supplier Order Create B', phone: '02866889982', tax_code: `SOC-B-${Date.now()}` },
  expected: 200,
});
const supplierA = Number(supplierAResult.data?.id);
const supplierB = Number(supplierBResult.data?.id);
assert(supplierA > 0 && supplierB > 0, 'Supplier order creation smoke missing suppliers');

const initialRequests = (await call('/supplier-orders/requests', { token: a.token, expected: 200 })).data.length;
const initialCashFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data.length;
const initialDebts = (await call('/finance/debts', { token: a.token, expected: 200 })).data.length;

for (const [label, body, expectedStatus] of [
  ['Infinity quantity', { supplier_id: supplierA, branch_id: branchA.id, items: [{ product_id: productA, quantity: 'Infinity', cost_price: 70000 }] }, 400],
  ['Infinity cost', { supplier_id: supplierA, branch_id: branchA.id, items: [{ product_id: productA, quantity: 1, cost_price: 'Infinity' }] }, 400],
  ['NaN-like cost', { supplier_id: supplierA, branch_id: branchA.id, items: [{ product_id: productA, quantity: 1, cost_price: 'abc' }] }, 400],
  ['fractional product id', { supplier_id: supplierA, branch_id: branchA.id, items: [{ product_id: 1.5, quantity: 1, cost_price: 1 }] }, 400],
  ['foreign product', { supplier_id: supplierA, branch_id: branchA.id, items: [{ product_id: productB, quantity: 1, cost_price: 70000 }] }, 403],
  ['foreign supplier', { supplier_id: supplierB, branch_id: branchA.id, items: [{ product_id: productA, quantity: 1, cost_price: 70000 }] }, 404],
  ['foreign branch', { supplier_id: supplierA, branch_id: branchB.id, items: [{ product_id: productA, quantity: 1, cost_price: 70000 }] }, 404],
]) {
  const result = await call('/supplier-orders/requests', {
    token: a.token,
    method: 'POST',
    body,
    expected: expectedStatus,
  });
  assert(result.status === expectedStatus, `${label} must be rejected with ${expectedStatus}`);
}

let requestsA = (await call('/supplier-orders/requests', { token: a.token, expected: 200 })).data;
assert(requestsA.length === initialRequests, 'Rejected supplier-order requests must not create headers');

// Force the second line insert to fail. Header + first line must roll back together.
const sqlitePath = path.resolve(process.cwd(), 'autotax.db');
{
  const raw = new Database(sqlitePath);
  raw.exec(`DROP TRIGGER IF EXISTS smoke_fail_supplier_order_item;
    CREATE TRIGGER smoke_fail_supplier_order_item
    BEFORE INSERT ON purchase_request_items
    WHEN NEW.product_name = 'Supplier Order Atomic Fail Item'
    BEGIN
      SELECT RAISE(ABORT, 'forced supplier-order item failure');
    END;`);
  raw.close();
}
try {
  await call('/supplier-orders/requests', {
    token: a.token,
    method: 'POST',
    body: {
      supplier_id: supplierA,
      branch_id: branchA.id,
      items: [
        { product_id: productA, quantity: 1, cost_price: 70000 },
        { product_id: productFail, quantity: 1, cost_price: 90000 },
      ],
      note: 'ATOMIC-ROLLBACK-SUPPLIER-ORDER',
    },
    expected: 500,
  });
} finally {
  const raw = new Database(sqlitePath);
  raw.exec('DROP TRIGGER IF EXISTS smoke_fail_supplier_order_item;');
  raw.close();
}
requestsA = (await call('/supplier-orders/requests', { token: a.token, expected: 200 })).data;
assert(!requestsA.some((row) => row.note === 'ATOMIC-ROLLBACK-SUPPLIER-ORDER'),
  'Failed supplier-order item insert must roll back request header');
assert(requestsA.length === initialRequests, 'Forced supplier-order failure must not change request count');

const beforeProduct = await productById(a.token, productA);
assert(Number(beforeProduct.stock) === 10 && Number(beforeProduct.cost_price) === 50000,
  `Unexpected product state before valid order: ${JSON.stringify(beforeProduct)}`);

const valid = await call('/supplier-orders/requests', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: supplierA,
    branch_id: branchA.id,
    items: [
      { product_id: productA, quantity: 2, cost_price: 70000 },
      { product_id: productA, quantity: 3, cost_price: 80000 },
    ],
    expected_date: ' 2026-09-15 ',
    note: '  Supplier order atomic valid  ',
  },
  expected: 200,
});
const requestId = Number(valid.data?.id);
assert(requestId > 0, `Valid supplier request missing id: ${JSON.stringify(valid.data)}`);
assert(Number(valid.data?.total_amount) === 380000, `Valid supplier request total expected 380000, got ${valid.data?.total_amount}`);
assert(String(valid.data?.code || '').startsWith('DH-NCC'), `Supplier request code prefix mismatch: ${valid.data?.code}`);

const detail = (await call(`/supplier-orders/requests/${requestId}`, { token: a.token, expected: 200 })).data;
assert(detail.status === 'ordered' && Number(detail.branch_id) === Number(branchA.id)
  && Number(detail.supplier_id) === supplierA && detail.supplier_name === 'NCC Supplier Order Create A',
  `Stored supplier request header mismatch: ${JSON.stringify(detail)}`);
assert(detail.expected_date === '2026-09-15' && detail.note === 'Supplier order atomic valid',
  `Supplier request normalized date/note mismatch: ${JSON.stringify(detail)}`);
assert(Array.isArray(detail.items) && detail.items.length === 2,
  `Supplier request must preserve duplicate original lines: ${JSON.stringify(detail.items)}`);
assert(detail.items.every((item) => Number(item.product_id) === productA && item.product_name === 'Supplier Order Finite Product'),
  `Supplier request item identity must come from server product: ${JSON.stringify(detail.items)}`);
assert(Number(detail.items[0].quantity) === 2 && Number(detail.items[0].cost_price) === 70000
  && Number(detail.items[1].quantity) === 3 && Number(detail.items[1].cost_price) === 80000,
  `Supplier request line values mismatch: ${JSON.stringify(detail.items)}`);

// Creating an order must not move stock, supplier debt, cash or payable ledger.
const afterProduct = await productById(a.token, productA);
assert(Number(afterProduct.stock) === 10 && Number(afterProduct.cost_price) === 50000,
  `Supplier order creation must not mutate product stock/cost: ${JSON.stringify(afterProduct)}`);
const supplierAfter = (await call('/suppliers', { token: a.token, expected: 200 })).data.find((row) => Number(row.id) === supplierA);
assert(Number(supplierAfter?.total_purchased || 0) === 0 && Number(supplierAfter?.total_debt || 0) === 0,
  `Supplier order creation must not mutate supplier totals: ${JSON.stringify(supplierAfter)}`);
const finalCashFlows = (await call('/finance/cash-flows', { token: a.token, expected: 200 })).data.length;
const finalDebts = (await call('/finance/debts', { token: a.token, expected: 200 })).data.length;
assert(finalCashFlows === initialCashFlows, `Supplier order creation must not create cash-flow: ${initialCashFlows} -> ${finalCashFlows}`);
assert(finalDebts === initialDebts, `Supplier order creation must not create debt before receipt: ${initialDebts} -> ${finalDebts}`);

await call(`/supplier-orders/requests/${requestId}`, { token: b.token, expected: 404 });

// Compatibility: omitted supplier/branch still uses the tenant default branch and remains accounting-neutral.
const defaultBranchOrder = await call('/supplier-orders/requests', {
  token: a.token,
  method: 'POST',
  body: {
    items: [{ product_id: productA, quantity: 1, cost_price: 60000 }],
    note: 'Default branch compatibility',
  },
  expected: 200,
});
const defaultDetail = (await call(`/supplier-orders/requests/${defaultBranchOrder.data.id}`, { token: a.token, expected: 200 })).data;
assert(Number(defaultDetail.branch_id) === Number(branchA.id) && defaultDetail.supplier_id === null,
  `Default branch/supplier compatibility mismatch: ${JSON.stringify(defaultDetail)}`);
assert(Number((await productById(a.token, productA)).stock) === 10,
  'Default-branch order creation must not mutate stock');

console.log('SUPPLIER ORDER CREATE INTEGRITY SMOKE PASSED: finite ids/quantity/cost + tenant ownership + atomic header/items rollback + server product identity + exact total + no premature stock/debt/cash + default branch compatibility');
