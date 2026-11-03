const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAnyPermission, requirePermission, writeAudit } = require('../middleware/auth');

// Nhà cung cấp tách theo cửa hàng
router.use(requireAuth);
// Đọc: cả người có quyền nhập hàng cũng cần chọn NCC
const doc = requireAnyPermission('suppliers', 'purchase');
const ghi = requirePermission('suppliers');

// Danh sách NCC
router.get('/', doc, (req, res) => {
  db.all('SELECT * FROM suppliers WHERE user_id = ? ORDER BY name ASC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Thêm NCC
router.post('/', ghi, (req, res) => {
  const { name, phone, address, tax_code, note } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cần nhập tên nhà cung cấp' });
  db.run(
    `INSERT INTO suppliers (user_id, name, phone, address, tax_code, note) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.tenantId, name.trim(), phone || null, address || null, tax_code || null, note || null],
    function (err) {
      if (err) {
        if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Số điện thoại NCC đã tồn tại' });
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Sửa NCC
router.put('/:id', ghi, (req, res) => {
  const { name, phone, address, tax_code, note, status } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cần nhập tên nhà cung cấp' });
  db.run(
    `UPDATE suppliers SET name = ?, phone = ?, address = ?, tax_code = ?, note = ?, status = ?
     WHERE id = ? AND user_id = ?`,
    [name.trim(), phone || null, address || null, tax_code || null, note || null, status || 'active', req.params.id, req.tenantId],
    function (err) {
      if (err) {
        if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Số điện thoại NCC đã tồn tại' });
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy NCC' });
      res.json({ success: true });
    }
  );
});

// Xóa NCC — chặn nếu còn phiếu nhập
router.delete('/:id', ghi, (req, res) => {
  db.get('SELECT COUNT(*) AS c FROM purchase_orders WHERE supplier_id = ? AND user_id = ?',
    [req.params.id, req.tenantId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row.c > 0) return res.status(409).json({ error: `Còn ${row.c} phiếu nhập từ NCC này, không thể xóa.` });
      db.run('DELETE FROM suppliers WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], function (e) {
        if (e) return res.status(500).json({ error: e.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy NCC' });
        writeAudit(req, { action: 'supplier.delete', target: req.params.id });
        res.json({ success: true });
      });
    });
});

module.exports = router;
