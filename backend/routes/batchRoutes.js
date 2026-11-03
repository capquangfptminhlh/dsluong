const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAnyPermission, requirePermission, writeAudit } = require('../middleware/auth');
const { formatBusinessDate, addCalendarDays, calendarDayDifference } = require('../utils/businessDate');

// Lô & hạn sử dụng
router.use(requireAuth);
const doc = requireAnyPermission('inventory', 'products', 'pos');
const ghi = requirePermission('inventory');

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

/**
 * Danh sách lô, kèm số ngày còn lại tới hạn dùng.
 * ?sap_het=30  -> chỉ lấy lô hết hạn trong 30 ngày (hoặc đã quá hạn)
 */
router.get('/', doc, async (req, res) => {
  try {
    const rows = await all(
      `SELECT b.*, p.name AS product_name, p.sku
       FROM product_batches b JOIN products p ON p.id = b.product_id
       WHERE b.user_id = ? AND b.quantity > 0
       ORDER BY (b.expiry_date IS NULL), b.expiry_date ASC`,
      [req.tenantId]
    );
    const homNay = formatBusinessDate();
    const kq = rows.map((b) => {
      let con = null;
      if (b.expiry_date) {
        con = calendarDayDifference(b.expiry_date, homNay);
      }
      return { ...b, ngay_con_lai: con, het_han: con !== null && con < 0 };
    });
    const nguong = Number(req.query.sap_het);
    res.json(nguong ? kq.filter((b) => b.ngay_con_lai !== null && b.ngay_con_lai <= nguong) : kq);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Thêm lô hàng — cộng luôn vào tồn kho sản phẩm */
router.post('/', ghi, async (req, res) => {
  const { product_id, batch_code, expiry_date, quantity, cost_price, note } = req.body;
  if (!(Number(quantity) > 0)) return res.status(400).json({ error: 'Số lượng phải lớn hơn 0' });
  if (Number(cost_price) < 0) return res.status(400).json({ error: 'Giá vốn không được âm' });
  try {
    const sp = await get('SELECT id FROM products WHERE id = ? AND user_id = ?', [product_id, req.tenantId]);
    if (!sp) return res.status(404).json({ error: 'Sản phẩm không thuộc cửa hàng của bạn' });

    const r = await run(
      `INSERT INTO product_batches (user_id, product_id, batch_code, expiry_date, quantity, cost_price, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, product_id, batch_code || null, expiry_date || null, Number(quantity), Number(cost_price) || 0, note || null]
    );
    // Bật theo dõi lô cho sản phẩm này và cộng tồn kho
    await run('UPDATE products SET track_batch = 1, stock = stock + ? WHERE id = ? AND user_id = ?',
      [Number(quantity), product_id, req.tenantId]);
    await run(`INSERT INTO inventory_logs (user_id, product_id, type, quantity, note) VALUES (?, ?, 'IN', ?, ?)`,
      [req.tenantId, product_id, Number(quantity), `Nhập lô ${batch_code || ''}`.trim()]);

    writeAudit(req, { action: 'batch.create', target: batch_code || String(r.lastID), detail: { quantity, expiry_date } });
    res.json({ success: true, id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Hủy lô (hàng hỏng / hết hạn) — trừ khỏi tồn kho */
router.post('/:id/huy', ghi, async (req, res) => {
  try {
    const b = await get('SELECT * FROM product_batches WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!b) return res.status(404).json({ error: 'Không tìm thấy lô' });
    if (b.quantity <= 0) return res.status(400).json({ error: 'Lô này đã hết hàng' });

    await run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ? AND user_id = ?',
      [b.quantity, b.product_id, req.tenantId]);
    await run(`INSERT INTO inventory_logs (user_id, product_id, type, quantity, note) VALUES (?, ?, 'OUT', ?, ?)`,
      [req.tenantId, b.product_id, b.quantity, `Hủy lô ${b.batch_code || ''} - ${req.body.reason || 'hết hạn'}`]);
    await run('UPDATE product_batches SET quantity = 0, note = ? WHERE id = ?',
      [`Đã hủy: ${req.body.reason || 'hết hạn'}`, b.id]);

    writeAudit(req, { action: 'batch.destroy', target: b.batch_code || String(b.id), detail: { quantity: b.quantity, reason: req.body.reason } });
    res.json({ success: true, da_huy: b.quantity });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Tóm tắt cảnh báo cho màn hình tổng quan */
router.get('/canh-bao', doc, async (req, res) => {
  try {
    const homNay = formatBusinessDate();
    const sau30 = addCalendarDays(homNay, 30);
    const hetHan = await get(
      `SELECT COUNT(*) c, COALESCE(SUM(quantity),0) sl FROM product_batches
       WHERE user_id = ? AND quantity > 0 AND expiry_date IS NOT NULL AND expiry_date < ?`,
      [req.tenantId, homNay]
    );
    const sapHet = await get(
      `SELECT COUNT(*) c, COALESCE(SUM(quantity),0) sl FROM product_batches
       WHERE user_id = ? AND quantity > 0 AND expiry_date >= ? AND expiry_date <= ?`,
      [req.tenantId, homNay, sau30]
    );
    res.json({ het_han: hetHan, sap_het_han: sapHet });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
