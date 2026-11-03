const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAnyPermission, requirePermission } = require('../middleware/auth');

// Bảng giá & đơn vị quy đổi
router.use(requireAuth);
const doc = requireAnyPermission('products', 'pos', 'categories');
const ghi = requirePermission('products');

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const isReservedFnbUnit = (name) => String(name || '').startsWith('__FNB_');

/* ================= MỨC GIÁ (Giá lẻ / Giá sỉ / Giá VIP) ================= */

router.get('/levels', doc, async (req, res) => {
  try {
    res.json(await all('SELECT * FROM price_levels WHERE user_id = ? ORDER BY is_default DESC, id ASC', [req.tenantId]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/levels', ghi, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cần nhập tên mức giá' });
  try {
    const r = await run('INSERT INTO price_levels (user_id, name) VALUES (?, ?)', [req.tenantId, name.trim()]);
    res.json({ success: true, id: r.lastID });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Mức giá này đã tồn tại' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/levels/:id', ghi, async (req, res) => {
  try {
    const lv = await get('SELECT * FROM price_levels WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!lv) return res.status(404).json({ error: 'Không tìm thấy mức giá' });
    if (lv.is_default) return res.status(400).json({ error: 'Không xóa được mức giá mặc định' });
    await run('DELETE FROM product_prices WHERE level_id = ?', [req.params.id]);
    await run('UPDATE customers SET price_level_id = NULL WHERE price_level_id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    await run('DELETE FROM price_levels WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Bảng giá đầy đủ: mỗi sản phẩm kèm giá theo từng mức.
 * Mức nào chưa đặt riêng thì dùng giá bán gốc của sản phẩm.
 */
router.get('/matrix', doc, async (req, res) => {
  try {
    const levels = await all('SELECT * FROM price_levels WHERE user_id = ? ORDER BY is_default DESC, id ASC', [req.tenantId]);
    const products = await all('SELECT id, name, sku, price FROM products WHERE user_id = ? ORDER BY name ASC LIMIT 500', [req.tenantId]);
    const gia = await all(
      `SELECT pp.product_id, pp.level_id, pp.price FROM product_prices pp
       JOIN products p ON p.id = pp.product_id WHERE p.user_id = ?`, [req.tenantId]
    );
    const map = {};
    gia.forEach((g) => { map[`${g.product_id}_${g.level_id}`] = g.price; });

    res.json({
      levels,
      products: products.map((p) => ({
        ...p,
        prices: levels.reduce((o, lv) => {
          o[lv.id] = map[`${p.id}_${lv.id}`] ?? p.price;
          return o;
        }, {}),
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Đặt giá cho 1 sản phẩm ở 1 mức giá */
router.post('/matrix', ghi, async (req, res) => {
  const { product_id, level_id, price } = req.body;
  if (Number(price) < 0) return res.status(400).json({ error: 'Giá không được âm' });
  try {
    const sp = await get('SELECT id FROM products WHERE id = ? AND user_id = ?', [product_id, req.tenantId]);
    if (!sp) return res.status(404).json({ error: 'Sản phẩm không thuộc cửa hàng của bạn' });
    const lv = await get('SELECT id FROM price_levels WHERE id = ? AND user_id = ?', [level_id, req.tenantId]);
    if (!lv) return res.status(404).json({ error: 'Không tìm thấy mức giá' });

    await run(
      `INSERT INTO product_prices (product_id, level_id, price) VALUES (?, ?, ?)
       ON CONFLICT(product_id, level_id) DO UPDATE SET price = excluded.price`,
      [product_id, level_id, Number(price) || 0]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Bảng giá áp cho một khách cụ thể — POS gọi để lấy đúng giá bán */
router.get('/for-customer', doc, async (req, res) => {
  try {
    let levelId = null;
    if (req.query.phone) {
      const kh = await get('SELECT price_level_id FROM customers WHERE user_id = ? AND phone = ?', [req.tenantId, req.query.phone]);
      if (kh) levelId = kh.price_level_id;
    }
    if (!levelId) {
      const md = await get('SELECT id FROM price_levels WHERE user_id = ? AND is_default = 1', [req.tenantId]);
      levelId = md ? md.id : null;
    }
    if (!levelId) return res.json({ level_id: null, prices: {} });

    const rows = await all(
      `SELECT pp.product_id, pp.price FROM product_prices pp
       JOIN products p ON p.id = pp.product_id
       WHERE p.user_id = ? AND pp.level_id = ?`, [req.tenantId, levelId]
    );
    const prices = {};
    rows.forEach((r) => { prices[r.product_id] = r.price; });
    const lv = await get('SELECT name FROM price_levels WHERE id = ?', [levelId]);
    res.json({ level_id: levelId, level_name: lv ? lv.name : '', prices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ================= ĐƠN VỊ QUY ĐỔI ================= */

/** Danh sách đơn vị của một sản phẩm */
router.get('/units/:productId', doc, async (req, res) => {
  try {
    const sp = await get('SELECT id, base_unit FROM products WHERE id = ? AND user_id = ?', [req.params.productId, req.tenantId]);
    if (!sp) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    const units = await all(
      `SELECT * FROM product_units
       WHERE product_id = ? AND name NOT GLOB '__FNB_*'
       ORDER BY ratio ASC`,
      [req.params.productId],
    );
    res.json({ base_unit: sp.base_unit || 'Cái', units });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Tất cả đơn vị quy đổi của cửa hàng (POS tải một lần) */
router.get('/units', doc, async (req, res) => {
  try {
    res.json(await all(
      `SELECT u.* FROM product_units u JOIN products p ON p.id = u.product_id
       WHERE p.user_id = ? AND u.name NOT GLOB '__FNB_*'
       ORDER BY u.product_id, u.ratio ASC`, [req.tenantId]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Thêm đơn vị quy đổi: 1 Thùng = 24 Lon -> ratio 24 */
router.post('/units', ghi, async (req, res) => {
  const { product_id, name, ratio, price } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cần nhập tên đơn vị' });
  if (isReservedFnbUnit(name.trim())) return res.status(400).json({ error: 'Tên đơn vị này được hệ thống F&B dành riêng' });
  if (!(Number(ratio) > 0)) return res.status(400).json({ error: 'Tỷ lệ quy đổi phải lớn hơn 0' });
  if (Number(price) < 0) return res.status(400).json({ error: 'Giá bán không được âm' });
  try {
    const sp = await get('SELECT id FROM products WHERE id = ? AND user_id = ?', [product_id, req.tenantId]);
    if (!sp) return res.status(404).json({ error: 'Sản phẩm không thuộc cửa hàng của bạn' });
    const r = await run(
      'INSERT INTO product_units (user_id, product_id, name, ratio, price) VALUES (?, ?, ?, ?, ?)',
      [req.tenantId, product_id, name.trim(), Number(ratio), Number(price) || 0]
    );
    res.json({ success: true, id: r.lastID });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Đơn vị này đã có cho sản phẩm' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/units/:id', ghi, async (req, res) => {
  try {
    const r = await run(
      `DELETE FROM product_units
       WHERE id = ? AND name NOT GLOB '__FNB_*'
         AND product_id IN (SELECT id FROM products WHERE user_id = ?)`,
      [req.params.id, req.tenantId]
    );
    if (r.changes === 0) return res.status(404).json({ error: 'Không tìm thấy đơn vị' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Đổi tên đơn vị gốc của sản phẩm (Lon, Chai, Cái...) */
router.put('/base-unit/:productId', ghi, async (req, res) => {
  const { base_unit } = req.body;
  try {
    const r = await run('UPDATE products SET base_unit = ? WHERE id = ? AND user_id = ?',
      [base_unit || 'Cái', req.params.productId, req.tenantId]);
    if (r.changes === 0) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;