const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { resolvePosBranch } = require('../utils/branchAccess');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

// Kho tách theo cửa hàng (req.tenantId từ token)
router.use(requireAuth);
router.use(requirePermission('inventory'));

/* ============ NHẬP / XUẤT KHO ============ */

// Nhật ký nhập xuất kho
router.get('/logs', (req, res) => {
  let scopeId = null;
  try { if (req.user.actorType === 'staff') scopeId = resolvePosBranch(req, null); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message }); }
  db.all(`SELECT l.id, l.product_id, l.type, l.quantity, l.note, l.createdAt, l.branch_id, p.name as product_name
          FROM inventory_logs l
          LEFT JOIN products p ON l.product_id = p.id AND p.user_id = l.user_id
          WHERE l.user_id = ? ${scopeId === null ? '' : 'AND l.branch_id = ?'}
          ORDER BY l.id DESC LIMIT 100`, scopeId === null ? [req.tenantId] : [req.tenantId, scopeId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Nhập kho (quantity > 0) hoặc xuất kho (quantity < 0)
router.post('/import', (req, res) => {
  const { product_id, quantity, note } = req.body;
  const qty = Number(quantity);
  if (!product_id || !qty) return res.status(400).json({ error: 'Cần chọn sản phẩm và số lượng khác 0' });

  // Kiểm tra sản phẩm thuộc đúng cửa hàng trước khi đụng vào tồn kho
  db.get('SELECT id, name, stock FROM products WHERE id = ? AND user_id = ?', [product_id, req.tenantId], (err, product) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!product) return res.status(404).json({ error: 'Sản phẩm không thuộc cửa hàng của bạn' });
    if (qty < 0 && (product.stock || 0) + qty < 0) {
      return res.status(400).json({ error: `Không đủ tồn kho. Hiện còn ${product.stock || 0}` });
    }

    db.run('UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?', [qty, product_id, req.tenantId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.run(`INSERT INTO inventory_logs (user_id, product_id, type, quantity, note) VALUES (?, ?, ?, ?, ?)`,
        [req.tenantId, product_id, qty > 0 ? 'IN' : 'OUT', Math.abs(qty), note || null], function (err3) {
          if (err3) return res.status(500).json({ error: err3.message });
          writeAudit(req, {
            action: qty > 0 ? 'inventory.in' : 'inventory.out',
            target: product.name,
            detail: { quantity: Math.abs(qty), stock_truoc: product.stock, stock_sau: (product.stock || 0) + qty, note }
          });
          res.json({ success: true, id: this.lastID, new_stock: (product.stock || 0) + qty });
        });
    });
  });
});

/* ============ KIỂM KHO / CHUYỂN KHO ============ */

// Get checks
router.get('/check', requireOwner, (req, res) => {
  db.all('SELECT * FROM inventory_checks WHERE user_id = ? ORDER BY id DESC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get transfers
router.get('/transfer', requireOwner, (req, res) => {
  db.all('SELECT * FROM inventory_transfers WHERE user_id = ? ORDER BY id DESC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create inventory check
router.post('/check', requireOwner, (req, res) => {
  const { code, total_difference } = req.body;
  db.run(`INSERT INTO inventory_checks (user_id, code, total_difference, status) VALUES (?, ?, ?, 'COMPLETED')`,
    [req.tenantId, code, total_difference], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    writeAudit(req, { action: 'inventory.check', target: code, detail: { total_difference } });
    res.json({ success: true, id: this.lastID });
  });
});

// Create inventory transfer
router.post('/transfer', requireOwner, (req, res) => {
  const { code, from_branch, to_branch } = req.body;
  db.run(`INSERT INTO inventory_transfers (user_id, code, from_branch, to_branch, status) VALUES (?, ?, ?, ?, 'PENDING')`,
    [req.tenantId, code, from_branch, to_branch], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID });
  });
});

module.exports = router;
