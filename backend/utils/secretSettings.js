'use strict';

const crypto = require('crypto');
const { JWT_SECRET } = require('../middleware/auth');

const PREFIX = 'enc:v1:';
const INSECURE_DEFAULT = 'CHANGE_ME_autotax_secret_2026';

function isSensitiveSettingKey(key) {
  const value = String(key || '').toLowerCase();
  return /(?:^|_)(?:secret|token|password|private_key|api_key)$/.test(value);
}

function getEncryptionKey() {
  const material = process.env.APP_ENCRYPTION_KEY || JWT_SECRET;
  if (!material || material === INSECURE_DEFAULT) {
    throw new Error('Chưa cấu hình APP_ENCRYPTION_KEY hoặc JWT_SECRET an toàn để lưu secret');
  }
  return crypto.createHash('sha256').update(`autotax:shop-settings:v1:${material}`).digest();
}

function encryptSettingValue(value) {
  const plain = String(value ?? '');
  if (!plain) return '';
  if (plain.startsWith(PREFIX)) return plain;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSettingValue(value) {
  const stored = String(value ?? '');
  if (!stored.startsWith(PREFIX)) return stored;

  const parts = stored.slice(PREFIX.length).split('.');
  if (parts.length !== 3) throw new Error('Secret setting payload không hợp lệ');
  const [ivPart, tagPart, dataPart] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
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

async function protectExistingSensitiveSettings(db) {
  const rows = await all(db, 'SELECT user_id, key, value FROM shop_settings WHERE value IS NOT NULL AND value <> ?',[ '']);
  let migrated = 0;
  for (const row of rows) {
    if (!isSensitiveSettingKey(row.key)) continue;
    const stored = String(row.value || '');
    if (!stored || stored.startsWith(PREFIX)) continue;
    await run(db, 'UPDATE shop_settings SET value = ? WHERE user_id = ? AND key = ?', [encryptSettingValue(stored), row.user_id, row.key]);
    migrated += 1;
  }
  return migrated;
}

module.exports = {
  PREFIX,
  isSensitiveSettingKey,
  encryptSettingValue,
  decryptSettingValue,
  protectExistingSensitiveSettings,
};
