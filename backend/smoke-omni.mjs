const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3102/api';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'audit-ui-webhook-test';
const TENANT_A_PHONE = '0955333311';
const TENANT_B_PHONE = '0955444422';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function call(path, { token, method = 'GET', body, expected, webhook = false } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(webhook ? { 'x-webhook-secret': WEBHOOK_SECRET } : {}),
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
  const { data } = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'OmniAudit2026!', sector: 'retail' },
    expected: 200,
  });
  assert(data?.token, `Register ${phone} missing token`);
  return data;
}

const a = await register(TENANT_A_PHONE, 'Omni Tenant A');
const b = await register(TENANT_B_PHONE, 'Omni Tenant B');

const productA = (await call('/products', {
  token: a.token,
  method: 'POST',
  body: { name: 'Cáp USB trùng tên', sku: 'OMNI-A', price: 100000, stock: 5, category: 'Audit' },
  expected: 200,
})).data;
const productB = (await call('/products', {
  token: b.token,
  method: 'POST',
  body: { name: 'Cáp USB trùng tên', sku: 'OMNI-B', price: 100000, stock: 9, category: 'Audit' },
  expected: 200,
})).data;

await call('/omni/channels', {
  token: a.token,
  method: 'POST',
  body: { platform: 'Shopee', app_key: 'audit-key', app_secret: 'audit-secret', shop_id: 'shop-a' },
  expected: 200,
});

await call('/omni/channels', {
  token: a.token,
  method: 'POST',
  body: { platform: 'Shopee', app_key: 'again', app_secret: 'again', shop_id: 'again' },
  expected: 409,
});

const channelsBefore = (await call('/omni/channels', { token: a.token })).data;
assert(channelsBefore.length === 1, `Expected one configured channel, got ${JSON.stringify(channelsBefore)}`);
assert(channelsBefore[0].status === 'configured', `Channel must be configured, not fake-connected: ${JSON.stringify(channelsBefore[0])}`);
assert(Number(channelsBefore[0].order_count) === 0, 'New channel must start with zero real orders');

const orderBody = {
  platform: 'Shopee',
  order_id: 'EXT-A-001',
  total_amount: 200000,
  user_id: TENANT_A_PHONE,
  items: [{ sku: 'OMNI-A', quantity: 2 }],
};

const firstSync = await call('/omni/webhook/order', {
  method: 'POST', body: orderBody, expected: 200, webhook: true,
});
assert(firstSync.data?.success === true && !firstSync.data?.duplicate, `First webhook sync failed: ${JSON.stringify(firstSync.data)}`);

const stockA1 = (await call('/products', { token: a.token })).data.find((p) => p.id === productA.id);
const stockB1 = (await call('/products', { token: b.token })).data.find((p) => p.id === productB.id);
assert(Number(stockA1.stock) === 3, `Tenant A stock should be 3 after webhook, got ${stockA1.stock}`);
assert(Number(stockB1.stock) === 9, `Same-name tenant B product must not be touched, got ${stockB1.stock}`);

const duplicate = await call('/omni/webhook/order', {
  method: 'POST', body: orderBody, expected: 200, webhook: true,
});
assert(duplicate.data?.duplicate === true, 'Duplicate external order must be idempotent');
const stockA2 = (await call('/products', { token: a.token })).data.find((p) => p.id === productA.id);
assert(Number(stockA2.stock) === 3, `Duplicate webhook reduced stock again: ${stockA2.stock}`);

await call('/omni/webhook/order', {
  method: 'POST',
  webhook: true,
  expected: 400,
  body: {
    platform: 'Shopee', order_id: 'EXT-A-FOREIGN', total_amount: 1, user_id: TENANT_A_PHONE,
    items: [{ product_id: productB.id, quantity: 1 }],
  },
});

await call('/omni/webhook/order', {
  method: 'POST',
  webhook: true,
  expected: 409,
  body: {
    platform: 'Shopee', order_id: 'EXT-A-NOSTOCK', total_amount: 999999, user_id: TENANT_A_PHONE,
    items: [{ sku: 'OMNI-A', quantity: 99 }],
  },
});
const stockA3 = (await call('/products', { token: a.token })).data.find((p) => p.id === productA.id);
assert(Number(stockA3.stock) === 3, 'Insufficient-stock webhook must not change stock');

const channelsAfter = (await call('/omni/channels', { token: a.token })).data;
assert(Number(channelsAfter[0].order_count) === 1, `Real order count must be 1, got ${channelsAfter[0].order_count}`);

await import('./smoke-secret-settings.mjs');

console.log('[SMOKE] OMNICHANNEL SAFE LIFECYCLE + SECRET SETTINGS PASS');
