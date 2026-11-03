'use strict';

const { PREFIX, encryptSettingValue, decryptSettingValue } = require('./secretSettings');

function protectAiCredential(value) {
  return encryptSettingValue(value);
}

function revealAiCredential(value) {
  return decryptSettingValue(value);
}

function credentialHint(value) {
  const plain = String(value || '');
  if (!plain) return '';
  if (plain.length <= 8) return '••••••••';
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

async function protectExistingAiCredentials(db) {
  const rows = await all(db, "SELECT id, key_value FROM gemini_keys WHERE key_value IS NOT NULL AND key_value <> ''");
  let migrated = 0;
  for (const row of rows) {
    const stored = String(row.key_value || '');
    if (!stored || stored.startsWith(PREFIX)) continue;
    await run(db, 'UPDATE gemini_keys SET key_value = ? WHERE id = ?', [protectAiCredential(stored), row.id]);
    migrated += 1;
  }
  return migrated;
}

function safeCredentialMetadata(row) {
  const plain = revealAiCredential(row.key_value);
  const hint = credentialHint(plain);
  return {
    id: row.id,
    provider: row.provider,
    model_name: row.model_name,
    usage_count: row.usage_count,
    is_active: row.is_active,
    status: row.status,
    configured: Boolean(plain),
    key_hint: hint,
    // Compatibility field for the current UI. This is a masked hint only, never the credential.
    key_value: hint,
  };
}

module.exports = {
  PREFIX,
  protectAiCredential,
  revealAiCredential,
  credentialHint,
  protectExistingAiCredentials,
  safeCredentialMetadata,
};
