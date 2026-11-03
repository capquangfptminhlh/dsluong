const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAnyPermission, requirePermission, writeAudit } = require('../middleware/auth');
const { formatBusinessDate, addCalendarMonths, calendarDayDifference } = require('../utils/businessDate');

// Combo, Serial/IMEI, Bảo hành
router.use(requireAuth);
const doc = requireAnyPermission('products', 'pos');
const ghi = requirePermission('products');

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

/* ==================== COMBO (bán theo bộ) ==================== */

/**
 * Danh sách combo kèm thành phần và số bộ còn bán được.
 * Số bộ tối đa = min(tồn kho từng món / số lượng cần).
 */
router.get('/combos', doc, async (req, res) => {
  try {
    const combos = await all('SELECT * FROM combos WHERE user_id = ? ORDER BY name ASC', [req.tenantId]);
    if (combos.length === 0) return res.json([]);
    const ids = combos.map((c) => c.id);
    const ph = ids.map(() => '?').join(',');
    const items = await all(
      `SELECT ci.*, p.name AS product_name, p.stock, p.cost_price
       FROM combo_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.combo_id IN (${ph})`, ids
    );
    res.json(combos.map((c) => {
      const tp = items.filter((i) => i.combo_id === c.id);
      const banDuoc = tp.length === 0 ? 0 : Math.min(...tp.map((i) => Math.floor((i.stock || 0) / (i.quantity || 1))));
      const von = tp.reduce((s, i) => s + (i.cost_price || 0) * i.quantity, 0);
      return { ...c, items: tp, ban_duoc: banDuoc, gia_von: von, loi_nhuan: c.price - von };
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/combos', ghi, async (req, res) => {
  const { name, sku, price, items } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cần nhập tên combo' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Combo cần ít nhất một sản phẩm' });
  if (Number(price) < 0) return res.status(400).json({ error: 'Giá combo không được âm' });
  for (const it of items) {
    if (!(Number(it.quantity) > 0)) return res.status(400).json({ error: 'Số lượng mỗi món phải lớn hơn 0' });
  }
  try {
    // Mọi sản phẩm phải thuộc cửa hàng này
    const ids = items.map((i) => i.product_id);
    const ph = ids.map(() => '?').join(',');
    const sp = await all(`SELECT id FROM products WHERE id IN (${ph}) AND user_id = ?`, [...ids, req.tenantId]);
    if (sp.length !== new Set(ids).size) return res.status(403).json({ error: 'Có sản phẩm không thuộc cửa hàng của bạn' });

    const r = await run('INSERT INTO combos (user_id, name, sku, price) VALUES (?, ?, ?, ?)',
      [req.tenantId, name.trim(), sku || null, Number(price) || 0]);
    for (const it of items) {
      await run('INSERT INTO combo_items (combo_id, product_id, quantity) VALUES (?, ?, ?)',
        [r.lastID, it.product_id, Number(it.quantity)]);
    }
    res.json({ success: true, id: r.lastID });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Combo trùng tên' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/combos/:id', ghi, async (req, res) => {
  try {
    const c = await get('SELECT * FROM combos WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!c) return res.status(404).json({ error: 'Không tìm thấy combo' });
    await run('DELETE FROM combo_items WHERE combo_id = ?', [c.id]);
    await run('DELETE FROM combos WHERE id = ?', [c.id]);
    writeAudit(req, { action: 'combo.delete', target: c.name });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==================== SERIAL / IMEI ==================== */

router.get('/serials', doc, async (req, res) => {
  try {
    const dk = ['s.user_id = ?'];
    const val = [req.tenantId];
    if (req.query.status) { dk.push('s.status = ?'); val.push(req.query.status); }
    if (req.query.product_id) { dk.push('s.product_id = ?'); val.push(req.query.product_id); }
    res.json(await all(
      `SELECT s.*, p.name AS product_name, p.sku FROM product_serials s
       JOIN products p ON p.id = s.product_id
       WHERE ${dk.join(' AND ')} ORDER BY s.status ASC, s.id DESC LIMIT 500`, val
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Nhập nhiều serial cùng lúc (mỗi dòng một mã) */
router.post('/serials', ghi, async (req, res) => {
  const { product_id, serials } = req.body;
  const ds = String(serials || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  if (ds.length === 0) return res.status(400).json({ error: 'Chưa nhập serial nào' });
  try {
    const sp = await get('SELECT id FROM products WHERE id = ? AND user_id = ?', [product_id, req.tenantId]);
    if (!sp) return res.status(404).json({ error: 'Sản phẩm không thuộc cửa hàng của bạn' });

    let them = 0; const trung = [];
    for (const sr of ds) {
      try {
        await run('INSERT INTO product_serials (user_id, product_id, serial) VALUES (?, ?, ?)', [req.tenantId, product_id, sr]);
        them++;
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) trung.push(sr); else throw e;
      }
    }
    // Bật theo dõi serial, tồn kho khớp số serial còn trong kho
    await run('UPDATE products SET track_serial = 1 WHERE id = ? AND user_id = ?', [product_id, req.tenantId]);
    res.json({ success: true, da_them: them, trung });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/serials/:id', ghi, async (req, res) => {
  try {
    const s = await get('SELECT * FROM product_serials WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy serial' });
    if (s.status === 'sold') return res.status(400).json({ error: 'Serial đã bán, không xóa được' });
    await run('DELETE FROM product_serials WHERE id = ?', [s.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Tra cứu 1 serial: đang ở kho hay đã bán, bảo hành còn hạn không */
router.get('/serials/tra-cuu/:serial', doc, async (req, res) => {
  try {
    const s = await get(
      `SELECT s.*, p.name AS product_name FROM product_serials s
       JOIN products p ON p.id = s.product_id
       WHERE s.user_id = ? AND s.serial = ?`, [req.tenantId, req.params.serial]
    );
    if (!s) return res.status(404).json({ error: 'Không tìm thấy serial này' });
    const bh = await get('SELECT * FROM warranties WHERE user_id = ? AND serial = ? ORDER BY id DESC LIMIT 1',
      [req.tenantId, req.params.serial]);
    let conHan = null;
    if (bh && bh.end_date) conHan = calendarDayDifference(bh.end_date, formatBusinessDate());
    res.json({ ...s, bao_hanh: bh || null, ngay_bao_hanh_con_lai: conHan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==================== BẢO HÀNH ==================== */

router.get('/warranties', doc, async (req, res) => {
  try {
    const rows = await all(
      'SELECT * FROM warranties WHERE user_id = ? ORDER BY id DESC LIMIT 500', [req.tenantId]
    );
    const today = formatBusinessDate();
    res.json(rows.map((w) => {
      const con = w.end_date ? calendarDayDifference(w.end_date, today) : null;
      return { ...w, ngay_con_lai: con, con_han: con !== null && con >= 0 };
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Tạo phiếu bảo hành (tự tính ngày hết hạn theo số tháng) */
router.post('/warranties', doc, async (req, res) => {
  const { order_code, product_id, product_name, serial, customer_name, customer_phone, months, start_date, note } = req.body;
  const thang = Number(months) || 0;
  if (thang <= 0) return res.status(400).json({ error: 'Số tháng bảo hành phải lớn hơn 0' });
  try {
    const batDau = start_date || formatBusinessDate();
    const ketThuc = addCalendarMonths(batDau, thang);

    let ten = product_name;
    if (product_id && !ten) {
      const sp = await get('SELECT name FROM products WHERE id = ? AND user_id = ?', [product_id, req.tenantId]);
      ten = sp ? sp.name : null;
    }
    const r = await run(
      `INSERT INTO warranties (user_id, order_code, product_id, product_name, serial, customer_name, customer_phone, months, start_date, end_date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, order_code || null, product_id || null, ten || null, serial || null,
       customer_name || null, customer_phone || null, thang, batDau, ketThuc, note || null]
    );
    res.json({ success: true, id: r.lastID, start_date: batDau, end_date: ketThuc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/warranties/:id', ghi, async (req, res) => {
  try {
    const r = await run('DELETE FROM warranties WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (r.changes === 0) return res.status(404).json({ error: 'Không tìm thấy phiếu bảo hành' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
