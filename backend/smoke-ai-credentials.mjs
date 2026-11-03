import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const db = require('./db');
const {
  PREFIX,
  revealAiCredential,
  protectExistingAiCredentials,
} = require('./utils/aiCredentials');

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const HAS_KEY_MATERIAL = Boolean(process.env.APP_ENCRYPTION_KEY || process.env.JWT_SECRET);

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

function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); }));
}

const phoneA = '0966223344';
const phoneB = '0966334455';
const password = 'AiCredential2026!';
const originalKey = 'AIza-AuditCredential-SECRET-1234';
const replacementKey = 'nvapi-AuditReplacement-SECRET-9876';

const ownerA = await call('/auth/register', {
  method: 'POST',
  body: { phone: phoneA, name: 'AI Credential A', password, sector: 'retail' },
});
const ownerB = await call('/auth/register', {
  method: 'POST',
  body: { phone: phoneB, name: 'AI Credential B', password, sector: 'retail' },
});
assert(ownerA?.token && ownerB?.token, 'AI credential smoke registration missing token');

const created = await call('/settings/gemini-keys', {
  token: ownerA.token,
  method: 'POST',
  body: { key_value: originalKey, provider: 'gemini', model_name: 'gemini-2.5-flash' },
});
assert(created?.id, 'AI credential create missing id');

const listA = await call('/settings/gemini-keys', { token: ownerA.token });
assert(Array.isArray(listA) && listA.length === 1, `Owner A expected one AI key: ${JSON.stringify(listA)}`);
const publicKey = listA[0];
assert(!JSON.stringify(publicKey).includes(originalKey), 'AI key plaintext leaked through settings API');
assert(typeof publicKey.key_hint === 'string' && publicKey.key_hint.includes('••••'), 'AI key hint missing masking');
assert(publicKey.key_value === publicKey.key_hint, 'Compatibility key_value must contain masked hint only');

const listB = await call('/settings/gemini-keys', { token: ownerB.token });
assert(Array.isArray(listB) && listB.length === 0, 'AI credential tenant isolation failed');

const storedBefore = await get('SELECT key_value, provider, model_name FROM gemini_keys WHERE id = ? AND user_id = ?', [created.id, phoneA]);
assert(storedBefore?.key_value?.startsWith(PREFIX), 'AI credential is not encrypted at rest');
assert(!storedBefore.key_value.includes(originalKey), 'AI ciphertext contains plaintext key');
if (HAS_KEY_MATERIAL) assert(revealAiCredential(storedBefore.key_value) === originalKey, 'Encrypted AI key cannot be decrypted server-side');

const modelOnly = await call(`/settings/gemini-keys/${created.id}`, {
  token: ownerA.token,
  method: 'PUT',
  body: { provider: 'gemini', model_name: 'gemini-2.5-pro', key_value: publicKey.key_value },
});
assert(modelOnly?.credentialChanged === false, 'Masked UI hint incorrectly replaced the real AI credential');
const storedAfterModel = await get('SELECT key_value, model_name FROM gemini_keys WHERE id = ? AND user_id = ?', [created.id, phoneA]);
assert(storedAfterModel.key_value === storedBefore.key_value, 'Model-only edit changed encrypted AI credential');
assert(storedAfterModel.model_name === 'gemini-2.5-pro', 'Model-only edit did not persist model');

await call('/settings/gemini-keys', {
  token: ownerA.token,
  method: 'POST',
  expected: 409,
  body: { key_value: originalKey, provider: 'gemini', model_name: 'gemini-2.5-flash' },
});

const replaced = await call(`/settings/gemini-keys/${created.id}`, {
  token: ownerA.token,
  method: 'PUT',
  body: { provider: 'nvidia', model_name: 'meta/llama-3.1-70b-instruct', key_value: replacementKey },
});
assert(replaced?.credentialChanged === true, 'Explicit AI credential replacement was ignored');
const storedAfterReplace = await get('SELECT key_value, provider FROM gemini_keys WHERE id = ? AND user_id = ?', [created.id, phoneA]);
assert(storedAfterReplace.key_value.startsWith(PREFIX), 'Replacement AI key is not encrypted');
assert(storedAfterReplace.key_value !== storedBefore.key_value, 'Replacement AI key did not change ciphertext');
assert(storedAfterReplace.provider === 'nvidia', 'Provider update did not persist');
if (HAS_KEY_MATERIAL) assert(revealAiCredential(storedAfterReplace.key_value) === replacementKey, 'Replacement AI key cannot be decrypted');

const listAfter = await call('/settings/gemini-keys', { token: ownerA.token });
assert(!JSON.stringify(listAfter).includes(replacementKey), 'Replacement AI key plaintext leaked through API');

if (HAS_KEY_MATERIAL) {
  await run(
    'INSERT INTO gemini_keys (user_id, key_value, provider, model_name) VALUES (?, ?, ?, ?)',
    [phoneA, 'legacy-ai-plaintext-secret', 'gemini', 'gemini-2.5-flash'],
  );
  const migrated = await protectExistingAiCredentials(db);
  assert(migrated >= 1, 'Legacy plaintext AI credential migration did not run');
  const legacy = await get('SELECT key_value FROM gemini_keys WHERE user_id = ? AND key_value LIKE ?', [phoneA, `${PREFIX}%`]);
  assert(legacy?.key_value?.startsWith(PREFIX), 'Legacy AI credential was not encrypted');
}

console.log(`[SMOKE] AI CREDENTIAL SECURITY PASS${HAS_KEY_MATERIAL ? ' + KEY-AWARE MIGRATION' : ' + BLACK-BOX API/DB'}`);
