import Database from 'better-sqlite3';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { formatBusinessDate } = require('./utils/businessDate');

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

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
  assert(response.status === expected, `${method} ${path}: expected ${expected}, got ${response.status}: ${text}`);
  return data;
}

const phone = '0977999901';
const password = 'AiSmoke2026!';
const registration = await call('/auth/register', {
  method: 'POST',
  body: { phone, name: 'AI Midnight Smoke Tenant', password, sector: 'retail' },
});
assert(registration?.token, 'AI smoke tenant registration missing token');
const token = registration.token;

const product = await call('/products', {
  token,
  method: 'POST',
  body: {
    name: 'AI Midnight Revenue Product',
    sku: `AI-MIDNIGHT-${Date.now()}`,
    price: 123456,
    cost_price: 60000,
    stock: 10,
    category: 'Smoke',
  },
});
assert(Number(product?.id) > 0, `AI smoke product missing id: ${JSON.stringify(product)}`);

const taxGate = await call('/ai/analyze-tax', {
  token,
  method: 'POST',
  body: { r1: 100000000, r2: 0, r3: 0, r4: 0 },
  expected: 409,
});
assert(taxGate?.code === 'TAX_RULE_CONTEXT_REQUIRED', 'AI tax route did not fail closed on missing rule context');

const assistant = await call('/ai/assistant', {
  token,
  method: 'POST',
  body: { query: 'Doanh thu hôm nay bao nhiêu?' },
  expected: 503,
});
assert(assistant?.code === 'AI_PROVIDER_NOT_CONFIGURED', 'AI assistant fabricated a response without a configured key');

async function seedPaidOrder() {
  const checkout = await call('/pos/checkout', {
    token,
    method: 'POST',
    body: {
      cart: [{ id: product.id, quantity: 1, price: 1 }],
      payment_method: 'cash',
      paid_cash: 123456,
      vat_rate: 0,
    },
  });
  assert(checkout?.payment_status === 'paid', `AI smoke checkout must be paid: ${JSON.stringify(checkout)}`);
  assert(Number(checkout?.total_amount) === 123456, `AI smoke checkout must use server price: ${JSON.stringify(checkout)}`);
}

const sqlite = new Database('autotax.db', { readonly: true });
let insights = null;
let expectedRevenue = null;
let verifiedBusinessDate = null;
try {
  // A quality run can cross 00:00 Asia/Ho_Chi_Minh between fixture creation and
  // /ai/insights. Retry on a detected rollover so the fixture and endpoint are
  // always compared against the same business date instead of an all-time report.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = formatBusinessDate();
    await seedPaidOrder();
    const candidate = await call('/ai/insights', { token });
    const after = formatBusinessDate();
    if (before !== after) continue;

    const todaySales = sqlite.prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(id) AS count
       FROM pos_orders
       WHERE user_id = ? AND status = 'paid' AND date(createdAt, '+7 hours') = ?`,
    ).get(phone, after);

    const revenue = Number(todaySales?.total) || 0;
    const count = Number(todaySales?.count) || 0;
    if (revenue <= 0 || count <= 0) continue;

    insights = candidate;
    expectedRevenue = revenue;
    verifiedBusinessDate = after;
    break;
  }
} finally {
  sqlite.close();
}

assert(insights, 'AI insights smoke could not obtain a stable Vietnam business-date window');
assert(insights?.source === 'tenant_data', `AI insights fallback source must be tenant_data, got ${insights?.source}`);
const expectedRevenueText = new Intl.NumberFormat('vi-VN').format(expectedRevenue);
assert(
  String(insights.insight || '').includes(expectedRevenueText),
  `AI insights does not reflect paid revenue ${expectedRevenueText} for ${verifiedBusinessDate}: ${insights.insight}`,
);
const combined = `${insights.insight || ''} ${insights.recommendation || ''}`.toLowerCase();
assert(!combined.includes('15%') && !combined.includes('nguy cơ rời bỏ'), 'AI insights still contains fabricated churn assumptions');

await import('./smoke-ai-credentials.mjs');

console.log(`AI SMOKE PASSED: tax hard-gate + no-key fail-closed + midnight-safe tenant-data insights (${verifiedBusinessDate}) + encrypted credential store`);
