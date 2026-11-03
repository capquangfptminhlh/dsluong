const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3311/api';
const assert = (ok, message) => { if (!ok) throw new Error(message); };

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (expected !== undefined) {
    assert(response.status === expected, `${method} ${path}: expected ${expected}, got ${response.status} ${text}`);
  } else {
    assert(response.ok, `${method} ${path}: ${response.status} ${text}`);
  }
  return data;
}

const register = (phone, name) => call('/auth/register', {
  method: 'POST',
  body: { phone, name, password: 'AuditOut2026!', sector: 'retail' },
  expected: 200,
});

const a = await register('0977711111', 'Output Audit A');
const b = await register('0977722222', 'Output Audit B');
await call('/auth/profile', {
  token: a.token,
  method: 'PUT',
  body: { name: 'Output Audit A', taxCode: 'OUT-A-001' },
  expected: 200,
});

const product = await call('/products', {
  token: a.token,
  method: 'POST',
  body: { name: 'Output Audit Item', sku: 'OUT-A-ITEM', price: 10000, cost_price: 5000, stock: 5, category: 'Audit' },
  expected: 200,
});
const checkout = await call('/pos/checkout', {
  token: a.token,
  method: 'POST',
  body: { cart: [{ id: product.id, quantity: 1 }], payment_method: 'cash', paid_cash: 10000, paid_bank: 0, vat_rate: 0 },
  expected: 200,
});
assert(checkout.order_code, 'checkout missing order code');
const orders = await call('/pos/orders', { token: a.token });
const order = orders.find((item) => item.order_code === checkout.order_code);
assert(order?.id, 'persisted checkout order missing');

const scan1 = await call('/audit-compliance/sales-reconciliation/run', { token: a.token, method: 'POST', body: {}, expected: 200 });
assert(scan1.created === 1, `missing scan create ${JSON.stringify(scan1)}`);
const scan2 = await call('/audit-compliance/sales-reconciliation/run', { token: a.token, method: 'POST', body: {}, expected: 200 });
assert(scan2.created === 0, 'scan not idempotent');

const good = await call('/audit-compliance/output-invoices', {
  token: a.token,
  method: 'POST',
  body: {
    pos_order_id: order.id,
    invoice: {
      seller_tax_code: 'OUT-A-001', buyer_tax_code: 'BUY-001', invoice_number: 'OUT-0001', invoice_symbol: 'C26OUT',
      invoice_date: '2026-08-13', subtotal: 10000, vat_amount: 0, total_amount: 10000, currency: 'VND',
    },
  },
  expected: 201,
});
assert(good.checks.arithmetic_ok && good.checks.seller_tax_code_ok && good.checks.pos_amount_ok && good.checks.pos_payment_ok, `clean checks ${JSON.stringify(good)}`);
assert(good.checks.legal_rule_status === 'RULE_NOT_EVALUATED', 'legal rule invented');
assert(good.findings.length === 0, 'clean invoice finding');

const detail = await call(`/audit-compliance/output-invoices/${good.id}`, { token: a.token });
assert(detail.relations.some((relation) => relation.relation_type === 'POS_ORDER' && relation.match_status === 'MATCHED'), 'matched relation missing');
await call(`/audit-compliance/output-invoices/${good.id}`, { token: b.token, expected: 404 });
const listB = await call('/audit-compliance/output-invoices', { token: b.token });
assert(!listB.some((invoice) => invoice.id === good.id), 'tenant leak');

const duplicate = await call('/audit-compliance/output-invoices', {
  token: a.token,
  method: 'POST',
  body: {
    pos_order_id: order.id,
    invoice: { seller_tax_code: 'OUT-A-001', invoice_number: 'OUT-0001', invoice_symbol: 'C26OUT', invoice_date: '2026-08-13', subtotal: 10000, vat_amount: 0, total_amount: 10000 },
  },
  expected: 409,
});
assert(duplicate.code === 'DUPLICATE_OUTPUT_INVOICE', 'duplicate not blocked');

const bad = await call('/audit-compliance/output-invoices', {
  token: a.token,
  method: 'POST',
  body: {
    pos_order_id: order.id,
    invoice: { seller_tax_code: 'WRONG-TAX', invoice_number: 'OUT-0002', invoice_symbol: 'C26OUT', invoice_date: '2026-08-13', subtotal: 9000, vat_amount: 0, total_amount: 11000 },
  },
  expected: 201,
});
const codes = new Set((bad.findings || []).map((finding) => finding.code));
assert(codes.has('OUT_INV_ARITHMETIC_MISMATCH') && codes.has('OUT_INV_SELLER_TAX_CODE_MISMATCH') && codes.has('OUT_INV_POS_AMOUNT_MISMATCH'), `findings ${JSON.stringify([...codes])}`);

const ledger = await call('/audit-compliance/sales-reconciliation', { token: a.token });
assert(ledger.some((item) => Number(item.id) === Number(order.id) && item.invoice_id), 'ledger link missing');
console.log('[SMOKE] OUTPUT AUDIT PASS');