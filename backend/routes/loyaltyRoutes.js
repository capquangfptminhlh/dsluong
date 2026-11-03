const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireOwner, requireAnyPermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);
// Thu ngân cần đọc hạng thẻ để áp ưu đãi khi thanh toán.
router.use(requireAnyPermission('loyalty', 'pos', 'customers'));

const normalizeTier = (body = {}) => {
  const name = String(body.name || '').trim();
  const minPoints = Number(body.min_points);
  const discountPercent = Number(body.discount_percent);
  const color = String(body.color || '#94a3b8').trim() || '#94a3b8';
  return { name, minPoints, discountPercent, color };
};

const validateTier = ({ name, minPoints, discountPercent }) => {
  if (!name) return 'Cần tên hạng thẻ';
  if (!Number.isFinite(minPoints) || minPoints < 0 || !Number.isInteger(minPoints)) return 'Điểm tối thiểu phải là số nguyên không âm';
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) return 'Chiết khấu phải nằm trong khoảng 0–100%';
  return null;
};

// Hạng thẻ của cửa hàng hiện tại
router.get('/tiers', (req, res) => {
  db.all('SELECT * FROM customer_tiers WHERE user_id = ? ORDER BY min_points ASC, id ASC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Thêm hạng thẻ — chỉ chủ cửa hàng
router.post('/tiers', requireOwner, (req, res) => {
  const tier = normalizeTier(req.body);
  const validationError = validateTier(tier);
  if (validationError) return res.status(400).json({ error: validationError });

  db.run('INSERT INTO customer_tiers (user_id, name, min_points, discount_percent, color) VALUES (?, ?, ?, ?, ?)',
    [req.tenantId, tier.name, tier.minPoints, tier.discountPercent, tier.color], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      writeAudit(req, { action: 'loyalty.tier.create', target: String(this.lastID), details: { name: tier.name } });
      res.status(201).json({ success: true, id: this.lastID });
    });
});

// Sửa hạng thẻ — chỉ chủ cửa hàng
router.put('/tiers/:id', requireOwner, (req, res) => {
  const tier = normalizeTier(req.body);
  const validationError = validateTier(tier);
  if (validationError) return res.status(400).json({ error: validationError });

  db.run(`UPDATE customer_tiers SET name = ?, min_points = ?, discount_percent = ?, color = ?
          WHERE id = ? AND user_id = ?`,
    [tier.name, tier.minPoints, tier.discountPercent, tier.color, req.params.id, req.tenantId], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy hạng thẻ' });
      writeAudit(req, { action: 'loyalty.tier.update', target: String(req.params.id), details: { name: tier.name } });
      res.json({ success: true });
    });
});

// Xóa hạng thẻ — chỉ chủ cửa hàng
router.delete('/tiers/:id', requireOwner, (req, res) => {
  db.run('DELETE FROM customer_tiers WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy hạng thẻ' });
    writeAudit(req, { action: 'loyalty.tier.delete', target: String(req.params.id) });
    res.json({ success: true });
  });
});

// Điều chỉnh điểm thủ công — quản lý Loyalty/Khách hàng mới được ghi.
// POS chỉ cần quyền đọc hạng thẻ; điểm từ giao dịch bán hàng được xử lý bởi backend nghiệp vụ.
router.post('/add-points', requireAnyPermission('loyalty', 'customers'), (req, res) => {
  const customerId = Number(req.body.customer_id);
  const points = Number(req.body.points);
  const reason = String(req.body.reason || '').trim();

  if (!Number.isInteger(customerId) || customerId <= 0) return res.status(400).json({ error: 'customer_id không hợp lệ' });
  if (!Number.isInteger(points) || points === 0) return res.status(400).json({ error: 'Điểm điều chỉnh phải là số nguyên khác 0' });
  if (!reason) return res.status(400).json({ error: 'Cần lý do điều chỉnh điểm' });

  db.run(`
    INSERT INTO loyalty_logs (customer_id, points, reason)
    SELECT id, ?, ? FROM customers WHERE id = ? AND user_id = ?
  `, [points, reason, customerId, req.tenantId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    writeAudit(req, { action: 'loyalty.points.adjust', target: String(customerId), details: { points, reason } });
    res.status(201).json({ success: true, id: this.lastID });
  });
});

module.exports = router;
