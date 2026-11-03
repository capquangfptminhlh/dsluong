const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendXlsx } = require('../utils/xlsxExport');
const { requireAuth, requirePermission } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePermission('tax'));

const ACTIVITY = {
  GOODS: 'Phân phối, cung cấp hàng hóa',
  SERVICE: 'Dịch vụ, xây dựng không bao thầu NVL',
  PRODUCTION: 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa',
  OTHER: 'Hoạt động kinh doanh khác',
};

function normalizeCategory(value = '') {
  const text = String(value).trim();
  if (text.includes('Phân phối')) return ACTIVITY.GOODS;
  if (text.includes('Dịch vụ, xây dựng')) return ACTIVITY.SERVICE;
  if (text.includes('Sản xuất')) return ACTIVITY.PRODUCTION;
  if (text.includes('Hoạt động kinh doanh khác')) return ACTIVITY.OTHER;
  return text || ACTIVITY.OTHER;
}

// Gợi ý PHÂN LOẠI nghiệp vụ, không phải kết luận thuế. Người dùng vẫn phải xác nhận.
function suggestActivity(description = '') {
  const text = String(description).toLowerCase();
  if (/dịch vụ|tư vấn|sửa chữa|spa|khám/.test(text)) return ACTIVITY.SERVICE;
  if (/sản xuất|gia công|vận tải|ăn uống/.test(text)) return ACTIVITY.PRODUCTION;
  if (/khác/.test(text)) return ACTIVITY.OTHER;
  return ACTIVITY.GOODS;
}

function taxContextRequired(res) {
  return res.status(409).json({
    code: 'TAX_RULE_CONTEXT_REQUIRED',
    error: 'Chưa đủ ngữ cảnh pháp lý để tạo tờ khai hoặc tính nghĩa vụ thuế.',
    required: [
      'tax_period',
      'effective_rule_version',
      'taxpayer_method',
      'annual_revenue_context',
      'threshold_allocation_if_multiple_activities',
      'review_approval',
    ],
  });
}

router.post('/', (req, res) => {
  const { date, voucherNumber, description, amount } = req.body;
  const category = normalizeCategory(req.body.category || suggestActivity(description));
  if (!date || !description || !Number.isFinite(Number(amount)) || Number(amount) === 0) {
    return res.status(400).json({ error: 'Cần ngày, diễn giải và số tiền hợp lệ.' });
  }
  db.run(
    `INSERT INTO transactions (date, voucherNumber, description, amount, category, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [date, voucherNumber || '', description, Number(amount), category, req.tenantId],
    function onInsert(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, date, voucherNumber: voucherNumber || '', description, amount: Number(amount), category });
    },
  );
});

router.post('/bulk', (req, res) => {
  const items = req.body.transactions;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Invalid data format' });
  if (items.some((item) => !item.date || !item.description || !Number.isFinite(Number(item.amount)) || Number(item.amount) === 0)) {
    return res.status(400).json({ error: 'Có giao dịch thiếu ngày, diễn giải hoặc số tiền hợp lệ.' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare(`
      INSERT INTO transactions (date, voucherNumber, description, amount, category, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    let failed = false;
    items.forEach((item) => {
      stmt.run(
        item.date,
        item.voucherNumber || '',
        item.description,
        Number(item.amount),
        normalizeCategory(item.category || suggestActivity(item.description)),
        req.tenantId,
        (err) => { if (err) failed = true; },
      );
    });
    stmt.finalize((finalizeErr) => {
      if (failed || finalizeErr) {
        return db.run('ROLLBACK', () => res.status(500).json({ error: 'Failed to bulk insert' }));
      }
      db.run('COMMIT', (commitErr) => {
        if (commitErr) return res.status(500).json({ error: 'Failed to bulk insert' });
        res.json({ message: 'Success', count: items.length });
      });
    });
  });
});

router.get('/', (req, res) => {
  db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map((row) => ({ ...row, category: normalizeCategory(row.category) })));
  });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], function onDelete(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: 'Không tìm thấy giao dịch.' });
    res.json({ message: 'Deleted successfully' });
  });
});

// Dashboard thuế chỉ tổng hợp dữ liệu. Không biến phân loại doanh thu thành số thuế phải nộp.
router.get('/stats', (req, res) => {
  db.all('SELECT amount, category FROM transactions WHERE user_id = ?', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const byActivity = {};
    let totalRevenue = 0;
    (rows || []).forEach((row) => {
      const amount = Number(row.amount) || 0;
      const category = normalizeCategory(row.category);
      totalRevenue += amount;
      byActivity[category] = (byActivity[category] || 0) + amount;
    });
    res.json({
      totalRevenue,
      byActivity,
      totalTax: null,
      calculationStatus: 'REQUIRES_RULE_CONTEXT',
      message: 'AutoTax chưa tính nghĩa vụ thuế khi thiếu kỳ tính thuế, phương pháp áp dụng và phiên bản quy tắc pháp lý.',
    });
  });
});

// Xuất sổ phân loại doanh thu để kiểm tra nội bộ. Không phải tờ khai thuế.
router.get('/export', (req, res) => {
  db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date ASC, id ASC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    try {
      sendXlsx(res, {
        filename: 'AutoTax-PhanLoaiDoanhThu.xlsx',
        sheetName: 'Phan loai doanh thu',
        headers: ['Ngày', 'Số chứng từ', 'Diễn giải', 'Doanh thu', 'Nhóm hoạt động', 'Trạng thái'],
        rows: (rows || []).map((row) => [
          row.date,
          row.voucherNumber || '',
          row.description,
          Number(row.amount) || 0,
          normalizeCategory(row.category),
          'Cần xác nhận quy tắc thuế',
        ]),
        widths: [14, 16, 44, 18, 42, 28],
      });
    } catch (error) {
      console.error('[REVENUE EXPORT]', error);
      res.status(500).json({ error: 'Không thể tạo bảng kiểm tra doanh thu.' });
    }
  });
});

// Các endpoint cũ từng tạo tờ khai từ tỷ lệ hard-code được fail-closed để tránh xuất hồ sơ sai.
router.get('/export-01cnkd', (req, res) => taxContextRequired(res));
router.post('/export-01cnkd-custom', (req, res) => taxContextRequired(res));
router.post('/export-01cnkd-pdf-custom', (req, res) => taxContextRequired(res));

module.exports = router;
