const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAnyPermission, requirePermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);
// POS/Quick Search cần đọc khách hàng; thay đổi hồ sơ khách là quyền quản lý khách hàng.
const doc = requireAnyPermission('customers', 'pos');
const ghi = requirePermission('customers');
const taoNhanh = requireAnyPermission('customers', 'pos');

function resolveTier(tiers, points) {
  let current = null;
  for (const tier of tiers) {
    if (Number(points) >= Number(tier.min_points || 0)) current = tier;
    else break;
  }
  return current;
}

router.get('/', doc, (req, res) => {
  const userId = req.tenantId;
  db.all('SELECT * FROM customer_tiers WHERE user_id = ? ORDER BY min_points ASC', [userId], (tierErr, tiers) => {
    if (tierErr) return res.status(500).json({ error: tierErr.message });
    db.all(`
      SELECT c.*,
        CAST(COALESCE(c.total_spend, 0) / 10000 AS INTEGER)
          + COALESCE((SELECT SUM(l.points) FROM loyalty_logs l WHERE l.customer_id = c.id), 0) AS points
      FROM customers c
      WHERE c.user_id = ?
      ORDER BY c.createdAt DESC
    `, [userId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map((customer) => {
        const tier = resolveTier(tiers || [], Number(customer.points) || 0);
        return {
          ...customer,
          points: Number(customer.points) || 0,
          tier_id: tier?.id || null,
          tier_name: tier?.name || 'Chưa xếp hạng',
          tier_color: tier?.color || '#94a3b8',
          tier_discount_percent: Number(tier?.discount_percent) || 0,
        };
      }));
    });
  });
});

router.get('/:id/orders', doc, (req, res) => {
  db.get('SELECT id, phone FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], (err, customer) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!customer) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    db.all(`
      SELECT id, order_code, total_amount, paid_cash, paid_bank, debt_amount, payment_method, status, createdAt
      FROM pos_orders
      WHERE user_id = ? AND customer_phone = ?
      ORDER BY id DESC LIMIT 50
    `, [req.tenantId, customer.phone], (orderErr, rows) => {
      if (orderErr) return res.status(500).json({ error: orderErr.message });
      res.json(rows || []);
    });
  });
});

router.post('/', taoNhanh, (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const tags = String(req.body.tags || '').trim();
  const address = String(req.body.address || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần tên khách hàng' });
  if (!phone) return res.status(400).json({ error: 'Cần số điện thoại khách hàng' });

  db.run(`INSERT INTO customers (user_id, name, phone, address, tags) VALUES (?, ?, ?, ?, ?)`,
    [req.tenantId, name, phone, address, tags], function onInsert(err) {
      if (err) {
        if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Số điện thoại đã tồn tại' });
        return res.status(500).json({ error: err.message });
      }
      writeAudit(req, { action: 'customer.create', target: String(this.lastID), detail: { name, phone, address } });
      res.status(201).json({ id: this.lastID, success: true });
    });
});

router.put('/:id', ghi, (req, res) => {
  const { name, phone, address, tags, price_level_id } = req.body;
  const fields = [];
  const vals = [];
  if (name !== undefined) { fields.push('name = ?'); vals.push(String(name).trim()); }
  if (phone !== undefined) { fields.push('phone = ?'); vals.push(String(phone).trim()); }
  if (address !== undefined) { fields.push('address = ?'); vals.push(String(address).trim()); }
  if (tags !== undefined) { fields.push('tags = ?'); vals.push(tags); }
  if (price_level_id !== undefined) { fields.push('price_level_id = ?'); vals.push(price_level_id || null); }
  if (!fields.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });

  vals.push(req.params.id, req.tenantId);
  db.run(`UPDATE customers SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals, function onUpdate(err) {
    if (err) {
      if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Số điện thoại đã tồn tại' });
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    writeAudit(req, { action: 'customer.update', target: req.params.id });
    res.json({ success: true });
  });
});

router.delete('/:id', ghi, (req, res) => {
  db.run('DELETE FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], function onDelete(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    writeAudit(req, { action: 'customer.delete', target: req.params.id });
    res.json({ success: true });
  });
});

router.get('/rfm', doc, (req, res) => {
  const userId = req.tenantId;
  const query = `
    SELECT c.id, c.name, c.phone, c.total_spend as monetary,
      COUNT(o.id) as frequency, MAX(o.createdAt) as last_order_date
    FROM customers c
    LEFT JOIN pos_orders o ON c.phone = o.customer_phone AND o.user_id = c.user_id
    WHERE c.user_id = ?
    GROUP BY c.id
  `;
  db.all(query, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const now = new Date();
    const segments = (rows || []).map((row) => {
      let recencyDays = 999;
      if (row.last_order_date) recencyDays = Math.floor((now - new Date(row.last_order_date)) / 86400000);
      let segment = 'New';
      if (row.frequency >= 5 && row.monetary >= 1000000 && recencyDays <= 30) segment = 'VIP';
      else if (row.frequency >= 3 && row.monetary >= 500000 && recencyDays > 60) segment = 'At Risk';
      else if (row.frequency > 1 && recencyDays > 90) segment = 'Sleeping';
      else if (row.frequency === 1 && recencyDays > 30) segment = 'One-time';
      return { ...row, recency: recencyDays, segment };
    });
    const names = ['VIP', 'At Risk', 'Sleeping', 'One-time', 'New'];
    const stats = Object.fromEntries(names.map((name) => [name, segments.filter((item) => item.segment === name).length]));
    res.json({ stats, customers: segments });
  });
});

module.exports = router;