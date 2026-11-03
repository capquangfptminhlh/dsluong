import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const db = require('./db');
const { PREFIX, decryptSettingValue, protectExistingSensitiveSettings } = require('./utils/secretSettings');

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3104/api';
const HAS_KEY_MATERIAL = Boolean(process.env.APP_ENCRYPTION_KEY || process.env.JWT_SECRET);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

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

function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); }));
}

const phone = '0966112233';
const username = 'secret_staff_6611';
const password = 'SecretAudit2026!';
const owner = await call('/auth/register', {
  method: 'POST',
  body: { phone, name: 'Secret Owner', password, sector: 'retail' },
});
assert(owner?.token, 'Owner registration missing token');

await call('/staff', {
  token: owner.token,
  method: 'POST',
  body: { name: 'Secret Staff', username, password, role: 'Thu ngân', permissions: ['pos'] },
});
const staff = await call('/auth/staff-login', { method: 'POST', body: { username, password } });
assert(staff?.token, 'Staff login missing token');

await call('/settings', {
  token: owner.token,
  method: 'POST',
  body: { key: 'shop_name', value: 'Cửa hàng Secret Smoke' },
});
const publicSetting = await call('/settings/shop_name', { token: staff.token });
assert(publicSetting.value === 'Cửa hàng Secret Smoke', 'Non-sensitive setting compatibility regressed');

const secretValue = 'tok_super_secret_123';
await call('/settings', {
  token: owner.token,
  method: 'POST',
  body: { key: 'audit_api_token', value: secretValue },
});

await call('/settings/audit_api_token', { token: staff.token, expected: 403 });
const ownerSecretView = await call('/settings/audit_api_token', { token: owner.token });
assert(ownerSecretView.value === '', 'Sensitive setting API must never return plaintext/ciphertext value');
assert(ownerSecretView.configured === true && ownerSecretView.protected === true, 'Sensitive setting should only expose configured/protected metadata');

const raw = await get('SELECT value FROM shop_settings WHERE user_id = ? AND key = ?', [phone, 'audit_api_token']);
assert(raw?.value?.startsWith(PREFIX), `Sensitive setting not encrypted at rest: ${raw?.value}`);
assert(!raw.value.includes(secretValue), 'Ciphertext unexpectedly contains plaintext secret');
if (HAS_KEY_MATERIAL) {
  assert(decryptSettingValue(raw.value) === secretValue, 'Server-side secret decryption failed');
}

await call('/omni/channels', {
  token: owner.token,
  method: 'POST',
  body: { platform: 'Shopee', app_key: 'shop-client-id', app_secret: 'shop-client-secret-456', shop_id: 'shop-secret-smoke' },
});
const omniRaw = await get('SELECT value FROM shop_settings WHERE user_id = ? AND key = ?', [phone, 'shopee_app_secret']);
assert(omniRaw?.value?.startsWith(PREFIX), 'Omnichannel App Secret is not encrypted at rest');
if (HAS_KEY_MATERIAL) {
  assert(decryptSettingValue(omniRaw.value) === 'shop-client-secret-456', 'Omnichannel App Secret cannot be decrypted server-side');

  await run(`INSERT INTO shop_settings (user_id, key, value) VALUES (?, ?, ?)
             ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`, [phone, 'legacy_private_key', 'legacy-plaintext-key']);
  await protectExistingSensitiveSettings(db);
  const legacyRaw = await get('SELECT value FROM shop_settings WHERE user_id = ? AND key = ?', [phone, 'legacy_private_key']);
  assert(legacyRaw?.value?.startsWith(PREFIX), 'Legacy plaintext sensitive setting was not migrated');
  assert(decryptSettingValue(legacyRaw.value) === 'legacy-plaintext-key', 'Migrated legacy secret cannot be decrypted');
}

await import('./smoke-promo-permissions.mjs');

console.log(`[SMOKE] SECRET SETTINGS + PROMOTION PERMISSIONS PASS${HAS_KEY_MATERIAL ? ' + KEY-AWARE CRYPTO' : ' + BLACK-BOX SECURITY'}`);
