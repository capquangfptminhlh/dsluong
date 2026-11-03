const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { revealAiCredential } = require('../utils/aiCredentials');
const { formatBusinessDate } = require('../utils/businessDate');

router.use(requireAuth);

const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(err) {
  if (err) return reject(err);
  resolve({ lastID: this.lastID, changes: this.changes });
}));

function aiNotConfigured() {
  const error = new Error('Chưa cấu hình AI API Key đang hoạt động cho cửa hàng.');
  error.code = 'AI_PROVIDER_NOT_CONFIGURED';
  return error;
}

function sendAiError(res, error) {
  if (error?.code === 'AI_PROVIDER_NOT_CONFIGURED') {
    return res.status(503).json({ code: error.code, error: error.message });
  }
  return res.status(500).json({ error: error?.message || 'AI provider error' });
}

async function getNextActiveKey(tenantId) {
  const keys = await all(
    "SELECT * FROM gemini_keys WHERE user_id = ? AND is_active = 1 AND status = 'ok' ORDER BY usage_count ASC",
    [tenantId],
  );
  return keys[0] || null;
}

async function markKeyFailed(id, tenantId) {
  await run("UPDATE gemini_keys SET status = 'failed', is_active = 0 WHERE id = ? AND user_id = ?", [id, tenantId]);
}

async function incrementUsage(id, tenantId) {
  await run('UPDATE gemini_keys SET usage_count = usage_count + 1 WHERE id = ? AND user_id = ?', [id, tenantId]);
}

async function callAiWithRetry(prompt, tenantId, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const keyRecord = await getNextActiveKey(tenantId);
    if (!keyRecord) throw aiNotConfigured();

    try {
      const credential = revealAiCredential(keyRecord.key_value);
      if (!credential) throw new Error('AI API Key rỗng');
      const isNvidia = keyRecord.provider === 'nvidia';
      const isOpenRouter = keyRecord.provider === 'openrouter';
      let url = '';
      const headers = { 'Content-Type': 'application/json' };
      let body = {};

      if (isOpenRouter) {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers.Authorization = `Bearer ${credential}`;
        headers['HTTP-Referer'] = 'https://autotaxpos.com';
        headers['X-Title'] = 'AutoTax POS';
        body = {
          model: keyRecord.model_name || 'openrouter/auto-free',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        };
      } else if (isNvidia) {
        url = 'https://integrate.api.nvidia.com/v1/chat/completions';
        headers.Authorization = `Bearer ${credential}`;
        body = {
          model: keyRecord.model_name || 'meta/llama-3.1-70b-instruct',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        };
      } else {
        const model = keyRecord.model_name || 'gemini-2.5-flash';
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(credential)}`;
        body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        };
      }

      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI provider HTTP ${response.status}: ${errText.slice(0, 500)}`);
      }

      const data = await response.json();
      const text = isNvidia || isOpenRouter
        ? data.choices?.[0]?.message?.content
        : data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('AI provider không trả nội dung.');

      await incrementUsage(keyRecord.id, tenantId);
      return text;
    } catch (error) {
      console.error(`AI provider error with key ${keyRecord.id} (${keyRecord.provider}):`, error.message);
      await markKeyFailed(keyRecord.id, tenantId).catch((markError) => console.error('Không thể đánh dấu AI key lỗi:', markError.message));
    }
  }

  throw new Error('Các AI API Key đang cấu hình đều không phản hồi hợp lệ.');
}

async function getBusinessContext(tenantId) {
  const businessDate = formatBusinessDate();
  const [todaySales, lowStock, customerCount] = await Promise.all([
    get(
      `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(id) AS count
       FROM pos_orders
       WHERE user_id = ? AND status = 'paid' AND date(createdAt, '+7 hours') = ?`,
      [tenantId, businessDate],
    ),
    all('SELECT name, stock FROM products WHERE user_id = ? AND stock < 10 ORDER BY stock ASC, id ASC LIMIT 5', [tenantId]),
    get('SELECT COUNT(id) AS count FROM customers WHERE user_id = ?', [tenantId]),
  ]);

  return {
    todayRevenue: Number(todaySales?.total) || 0,
    todayOrders: Number(todaySales?.count) || 0,
    totalCustomers: Number(customerCount?.count) || 0,
    lowStock: lowStock.map((item) => ({ name: item.name, stock: Number(item.stock) || 0 })),
  };
}

function businessContextText(context) {
  return [
    `Doanh thu POS đã xác nhận thanh toán hôm nay: ${context.todayRevenue} VNĐ.`,
    `Số đơn POS đã xác nhận thanh toán hôm nay: ${context.todayOrders}.`,
    `Tổng số khách hàng: ${context.totalCustomers}.`,
    `Sản phẩm tồn dưới 10: ${context.lowStock.length ? context.lowStock.map((item) => `${item.name} (${item.stock})`).join(', ') : 'Không có'}.`,
  ].join('\n');
}

// AI không được tự tính nghĩa vụ thuế từ vài con số doanh thu và tỷ lệ hard-code.
router.post('/analyze-tax', (req, res) => {
  res.status(409).json({
    code: 'TAX_RULE_CONTEXT_REQUIRED',
    error: 'Chưa đủ ngữ cảnh pháp lý để AI phân tích nghĩa vụ thuế.',
    required: [
      'tax_period',
      'effective_rule_version',
      'taxpayer_method',
      'annual_revenue_context',
      'transaction_classification_review',
      'review_approval',
    ],
  });
});

// Endpoint for Voice POS parsing. AI chỉ trích xuất ý định, không quyết định giá/tồn kho.
router.post('/parse-voice-order', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing text' });

  const prompt = `
Bạn là trợ lý nhập liệu cho POS. Hãy trích xuất danh sách mặt hàng và số lượng từ câu nói dưới đây.
Câu nói: ${JSON.stringify(String(text))}

Chỉ trả về một mảng JSON hợp lệ, không Markdown, định dạng:
[{"name":"tên sản phẩm","quantity":1}]
Không tự thêm sản phẩm, giá, thuế, giảm giá hoặc thông tin không xuất hiện trong câu nói.
`;

  try {
    const rawAiResponse = await callAiWithRetry(prompt, req.tenantId);
    const jsonStr = rawAiResponse.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(502).json({ error: 'AI không trả về JSON hợp lệ.' });
    }
    if (!Array.isArray(parsed)) return res.status(502).json({ error: 'AI không trả về danh sách hợp lệ.' });
    res.json({ items: parsed });
  } catch (error) {
    sendAiError(res, error);
  }
});

// Chatbot nội bộ: chỉ được dùng dữ liệu thực được truy vấn từ tenant hiện tại.
router.post('/assistant', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    const context = await getBusinessContext(req.tenantId);
    const prompt = `
Bạn là AutoTax AI, trợ lý vận hành cửa hàng.
CHỈ sử dụng dữ liệu được cung cấp dưới đây. Không bịa số liệu, xu hướng, tỷ lệ, tình trạng khách hàng hoặc nghĩa vụ thuế.
Nếu dữ liệu chưa đủ để trả lời, nói rõ dữ liệu chưa đủ. Không đưa kết luận pháp lý/thuế.

DỮ LIỆU THỰC:
${businessContextText(context)}

CÂU HỎI: ${JSON.stringify(String(query))}
Trả lời ngắn gọn bằng tiếng Việt.
`;
    const reply = await callAiWithRetry(prompt, req.tenantId);
    res.json({ reply, source: 'tenant_data' });
  } catch (error) {
    sendAiError(res, error);
  }
});

// Business insight dựa trên dữ liệu tenant thật; fallback deterministic cũng không bịa.
router.get('/insights', async (req, res) => {
  try {
    const context = await getBusinessContext(req.tenantId);
    const deterministic = {
      insight: `Hôm nay hệ thống ghi nhận ${context.todayOrders} đơn đã thanh toán, doanh thu ${new Intl.NumberFormat('vi-VN').format(context.todayRevenue)} VNĐ.`,
      recommendation: context.lowStock.length
        ? `Kiểm tra tồn kho ${context.lowStock.map((item) => item.name).join(', ')} trước khi tiếp tục bán.`
        : 'Chưa phát hiện sản phẩm tồn dưới 10 trong dữ liệu hiện tại.',
      source: 'tenant_data',
    };

    try {
      const prompt = `
Phân tích ngắn dữ liệu vận hành dưới đây. Không bịa xu hướng, tỷ lệ, dự báo hoặc số liệu ngoài dữ liệu được cung cấp.
${businessContextText(context)}
Trả đúng JSON: {"insight":"...","recommendation":"..."}
`;
      const raw = await callAiWithRetry(prompt, req.tenantId);
      const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (typeof parsed?.insight === 'string' && typeof parsed?.recommendation === 'string') {
        return res.json({ insight: parsed.insight, recommendation: parsed.recommendation, source: 'ai_on_tenant_data' });
      }
    } catch (error) {
      if (error?.code !== 'AI_PROVIDER_NOT_CONFIGURED') console.warn('[AI INSIGHTS] Fallback deterministic:', error.message);
    }

    return res.json(deterministic);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// AI chat dùng cùng dữ liệu thực; không còn được phép giả định số liệu.
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });

  try {
    const context = await getBusinessContext(req.tenantId);
    const prompt = `
Bạn là trợ lý Business Intelligence của AutoTax.
Chỉ dùng dữ liệu thực bên dưới; tuyệt đối không tự giả định hoặc bịa số liệu.
Nếu câu hỏi vượt dữ liệu, nói rõ chưa đủ dữ liệu. Không kết luận nghĩa vụ thuế/pháp lý.

${businessContextText(context)}

CÂU HỎI: ${JSON.stringify(String(message))}
`;
    const answer = await callAiWithRetry(prompt, req.tenantId);
    res.json({ answer, source: 'tenant_data' });
  } catch (error) {
    sendAiError(res, error);
  }
});

module.exports = router;
