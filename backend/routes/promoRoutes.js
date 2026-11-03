const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission, requireAnyPermission, writeAudit } = require('../middleware/auth');
const { formatBusinessDate } = require('../utils/businessDate');

// Khuyến mãi tách theo cửa hàng
router.use(requireAuth);

// Thu ngân cần đọc khuyến mãi để áp dụng khi bán hàng, nhưng không được sửa cấu hình.
router.get('/', requireAnyPermission('promotions', 'pos'), (req, res) => {
  db.all('SELECT * FROM promotions WHERE user_id = ? ORDER BY id DESC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/**
 * Khuyến mãi áp dụng được cho một đơn có giá trị `total`.
 * Trả kèm `discount_value` (số tiền giảm thực tế) và đánh dấu `best` là ưu đãi lợi nhất.
 * GET /api/promo/applicable?total=500000
 */
router.get('/applicable', requireAnyPermission('promotions', 'pos'), (req, res) => {
  const tong = Number(req.query.total) || 0;
  const homNay = formatBusinessDate();
  db.all(
    `SELECT * FROM promotions
     WHERE user_id = ? AND (status IS NULL OR status = 'ACTIVE')
       AND (min_order_value IS NULL OR min_order_value <= ?)
       AND (start_date IS NULL OR start_date = '' OR start_date <= ?)
       AND (end_date   IS NULL OR end_date   = '' OR end_date   >= ?)`,
    [req.tenantId, tong, homNay, homNay],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const ds = rows.map((p) => {
        // Giảm theo % hoặc số tiền cố định; không bao giờ giảm quá giá trị đơn
        const theoPhanTram = Math.round(tong * (Number(p.discount_percent) || 0) / 100);
        const theoTien = Number(p.discount_amount) || 0;
        const giam = Math.min(Math.max(theoPhanTram, theoTien), tong);
        return { ...p, discount_value: giam };
      }).filter((p) => p.discount_value > 0)
        .sort((a, b) => b.discount_value - a.discount_value);

      res.json(ds.map((p, i) => ({ ...p, best: i === 0 })));
    }
  );
});

router.post('/', requirePermission('promotions'), (req, res) => {
  const { name, min_order_value, discount_percent, discount_amount } = req.body;
  if (!name) return res.status(400).json({ error: 'Cần tên chương trình khuyến mãi' });
  db.run(`INSERT INTO promotions (user_id, name, min_order_value, discount_percent, discount_amount) VALUES (?, ?, ?, ?, ?)`,
    [req.tenantId, name, min_order_value || 0, discount_percent || 0, discount_amount || 0], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    });
});

router.delete('/:id', requirePermission('promotions'), (req, res) => {
  db.run('DELETE FROM promotions WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy khuyến mãi' });
    writeAudit(req, { action: 'promo.delete', target: req.params.id });
    res.json({ success: true });
  });
});

module.exports = router;