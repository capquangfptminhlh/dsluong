const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireOwner, writeAudit } = require('../middleware/auth');
const { isSensitiveSettingKey, encryptSettingValue } = require('../utils/secretSettings');
const {
  protectAiCredential,
  revealAiCredential,
  credentialHint,
  safeCredentialMetadata,
} = require('../utils/aiCredentials');

// Settings tách theo cửa hàng (shop_settings) — không còn dùng system_settings chung

/* ============ API KEY GEMINI (AI) ============
   LƯU Ý: các route này phải khai báo TRƯỚC route '/:key',
   nếu không '/gemini-keys' sẽ bị '/:key' nuốt mất.
   Key tách theo cửa hàng: cửa hàng A không thấy/không xài được key của B. */

function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null)));
}

async function duplicateAiKeyForTenant(tenantId, plainKey, exceptId = null) {
  const rows = await all('SELECT id, key_value FROM gemini_keys WHERE user_id = ?', [tenantId]);
  return rows.some((row) => {
    if (exceptId !== null && String(row.id) === String(exceptId)) return false;
    return revealAiCredential(row.key_value) === plainKey;
  });
}

router.get('/gemini-keys', requireAuth, requireOwner, async (req, res) => {
  try {
    const rows = await all(
      'SELECT id, key_value, provider, model_name, usage_count, is_active, status FROM gemini_keys WHERE user_id = ? ORDER BY id DESC',
      [req.tenantId],
    );
    res.json(rows.map(safeCredentialMetadata));
  } catch (error) {
    res.status(503).json({ error: 'Không thể đọc kho API Key đã mã hóa trên máy chủ.' });
  }
});

router.post('/gemini-keys', requireAuth, requireOwner, async (req, res) => {
  const { key_value, provider, model_name } = req.body;
  const plainKey = String(key_value || '').trim();
  if (!plainKey) return res.status(400).json({ error: 'Thiếu API Key' });
  const prov = provider || 'gemini';
  const model = model_name || 'gemini-2.5-flash';

  let storedKey;
  try {
    if (await duplicateAiKeyForTenant(req.tenantId, plainKey)) return res.status(409).json({ error: 'Key này đã tồn tại' });
    storedKey = protectAiCredential(plainKey);
  } catch (error) {
    return res.status(503).json({ error: 'Kho API Key không thể giải mã an toàn trên máy chủ.' });
  }

  db.run('INSERT INTO gemini_keys (user_id, key_value, provider, model_name) VALUES (?, ?, ?, ?)',
    [req.tenantId, storedKey, prov, model], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      writeAudit(req, { action: 'ai_key.create', target: String(this.lastID), detail: { provider: prov, model_name: model } });
      res.json({ success: true, id: this.lastID });
    });
});

router.put('/gemini-keys/:id/toggle', requireAuth, requireOwner, (req, res) => {
  const isActive = req.body.is_active ? 1 : 0;
  // Bật lại key thì xóa luôn trạng thái 'failed' để nó được dùng lại
  db.run('UPDATE gemini_keys SET is_active = ?, status = ? WHERE id = ? AND user_id = ?',
    [isActive, isActive ? 'ok' : 'off', req.params.id, req.tenantId], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy key' });
      res.json({ success: true });
    });
});

router.put('/gemini-keys/:id', requireAuth, requireOwner, async (req, res) => {
  const { provider, model_name, key_value } = req.body;
  const replacement = String(key_value || '').trim();

  let current;
  try {
    current = await get('SELECT id, key_value FROM gemini_keys WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!current) return res.status(404).json({ error: 'Không tìm thấy key' });

  let currentHint;
  try {
    currentHint = credentialHint(revealAiCredential(current.key_value));
  } catch (error) {
    return res.status(503).json({ error: 'Kho API Key không thể giải mã an toàn trên máy chủ.' });
  }

  if (replacement.includes('••••') && replacement !== currentHint) {
    return res.status(400).json({ error: 'Nếu muốn đổi API Key, hãy nhập đầy đủ key mới.' });
  }
  const shouldReplaceCredential = Boolean(replacement) && replacement !== currentHint;

  let sql = 'UPDATE gemini_keys SET provider = ?, model_name = ?';
  const params = [provider, model_name];
  if (shouldReplaceCredential) {
    try {
      if (await duplicateAiKeyForTenant(req.tenantId, replacement, req.params.id)) return res.status(409).json({ error: 'Key này đã tồn tại' });
      sql += ', key_value = ?';
      params.push(protectAiCredential(replacement));
    } catch (error) {
      return res.status(503).json({ error: 'Kho API Key không thể giải mã an toàn trên máy chủ.' });
    }
  }
  sql += ' WHERE id = ? AND user_id = ?';
  params.push(req.params.id, req.tenantId);

  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy key' });
    writeAudit(req, {
      action: 'ai_key.update',
      target: String(req.params.id),
      detail: { provider, model_name, credentialChanged: shouldReplaceCredential },
    });
    res.json({ success: true, credentialChanged: shouldReplaceCredential });
  });
});

router.delete('/gemini-keys/:id', requireAuth, requireOwner, (req, res) => {
  db.run('DELETE FROM gemini_keys WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy key' });
    res.json({ success: true });
  });
});

router.post('/gemini-keys/:id/test', requireAuth, requireOwner, (req, res) => {
  db.get('SELECT * FROM gemini_keys WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], async (err, keyRecord) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!keyRecord) return res.status(404).json({ error: 'Không tìm thấy key' });

    const prompt = "Xin chào, hãy phản hồi chữ 'OK' ngắn gọn.";
    try {
      const credential = revealAiCredential(keyRecord.key_value);
      if (!credential) throw new Error('API Key rỗng');
      const isNvidia = keyRecord.provider === 'nvidia';
      const isOpenRouter = keyRecord.provider === 'openrouter';
      let url = '';
      let headers = { 'Content-Type': 'application/json' };
      let body = {};

      if (isOpenRouter) {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${credential}`;
        headers['HTTP-Referer'] = 'http://localhost:5173';
        headers['X-Title'] = 'AutoTax POS';
        body = {
          model: keyRecord.model_name || 'openrouter/auto-free',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        };
      } else if (isNvidia) {
        url = 'https://integrate.api.nvidia.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${credential}`;
        body = {
          model: keyRecord.model_name || 'meta/llama-3.1-70b-instruct',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        };
      } else {
        const model = keyRecord.model_name || 'gemini-2.5-flash';
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(credential)}`;
        body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 }
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error ${response.status}: ${errText.slice(0, 500)}`);
      }

      const data = await response.json();
      let text = '';
      if (isNvidia || isOpenRouter) {
        text = data.choices?.[0]?.message?.content;
      } else {
        text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      }

      if (!text) throw new Error('Không nhận được nội dung từ AI');

      db.run("UPDATE gemini_keys SET usage_count = usage_count + 1, status = 'ok', is_active = 1 WHERE id = ? AND user_id = ?", [keyRecord.id, req.tenantId], () => {});
      res.json({ success: true, reply: text.trim() });

    } catch (apiErr) {
      console.error('Test API Key Error:', apiErr.message);
      db.run("UPDATE gemini_keys SET status = 'failed', is_active = 0 WHERE id = ? AND user_id = ?", [keyRecord.id, req.tenantId], () => {});
      res.status(500).json({ error: apiErr.message });
    }
  });
});

/* ============ CÀI ĐẶT CHUNG CỦA CỬA HÀNG ============ */

// Cấu hình thường vẫn đọc được sau đăng nhập để POS/UI hoạt động.
// Setting nhạy cảm chỉ owner được hỏi và KHÔNG BAO GIỜ trả plaintext/ciphertext về client.
router.get('/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  const readSetting = () => db.get(
    'SELECT value FROM shop_settings WHERE user_id = ? AND key = ?',
    [req.tenantId, key],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (isSensitiveSettingKey(key)) {
        return res.json({ value: '', configured: !!(row && row.value), protected: true });
      }
      return res.json({ value: row ? row.value : '' });
    }
  );

  if (isSensitiveSettingKey(key)) return requireOwner(req, res, readSetting);
  return readSetting();
});

// Save setting — chỉ chủ cửa hàng. Secret được mã hóa AES-GCM trước khi ghi DB.
router.post('/', requireAuth, requireOwner, (req, res) => {
  const { key, value } = req.body;
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'Thiếu key cấu hình' });

  let storedValue = value;
  try {
    if (isSensitiveSettingKey(key)) storedValue = encryptSettingValue(value);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  db.run(`INSERT INTO shop_settings (user_id, key, value) VALUES (?, ?, ?)
          ON CONFLICT(user_id, key) DO UPDATE SET value = ?`,
    [req.tenantId, key, storedValue, storedValue], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      if (isSensitiveSettingKey(key)) writeAudit(req, { action: 'settings.secret_update', target: key });
      res.json({ success: true, protected: isSensitiveSettingKey(key) });
    });
});

module.exports = router;
