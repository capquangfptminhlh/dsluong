const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireOwner, requireAnyPermission, requirePermission, writeAudit } = require('../middleware/auth');

// Chi nhánh / kho
router.use(requireAuth);
const doc = requireAnyPermission('inventory', 'products', 'pos', 'reports');
const ghi = requirePermission('inventory');

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

/**
 * Cộng/trừ tồn kho tại một chi nhánh, đồng thời cập nhật tổng tồn của sản phẩm.
 * `delta` dương = nhập, âm = xuất.
 * products.stock luôn = tổng tồn của mọi chi nhánh.
 */
async function doiTonChiNhanh(branchId, productId, delta, tenantId = null) {
  if (!branchId || !productId) return;
  const exec = async () => {
    await run('INSERT OR IGNORE INTO branch_stock (branch_id, product_id, stock) VALUES (?, ?, 0)', [branchId, productId]);
    await run(
      `UPDATE branch_stock SET stock = stock + ? WHERE branch_id = ? AND product_id = ?`,
      [delta, branchId, productId]
    );
    await run(
      `UPDATE products SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stock WHERE product_id = ?) WHERE id = ?`,
      [productId, productId]
    );
  };
  if (tenantId && typeof db.runInTenantContext === 'function') {
    return db.runInTenantContext(tenantId, exec);
  }
  return exec();
}
module.exports.doiTonChiNhanh = doiTonChiNhanh;

/** Chi nhánh mặc định của cửa hàng (dùng khi không chỉ định) */
async function chiNhanhMacDinh(userId) {
  let cn = await get('SELECT id FROM branches WHERE user_id = ? AND is_default = 1', [userId]);
  if (!cn) cn = await get('SELECT id FROM branches WHERE user_id = ? ORDER BY id ASC LIMIT 1', [userId]);
  if (!cn && userId) {
    try {
      const r = await run('INSERT INTO branches (user_id, name, is_default) VALUES (?, ?, 1)', [userId, 'Nhà Thuốc Nhân Đức - Cơ Sở Chính']);
      return r.lastID;
    } catch (e) {
      cn = await get('SELECT id FROM branches WHERE user_id = ? ORDER BY id ASC LIMIT 1', [userId]);
    }
  }
  return cn ? cn.id : null;
}
module.exports.chiNhanhMacDinh = chiNhanhMacDinh;

/* ==================== CHI NHÁNH ==================== */

router.get('/', doc, async (req, res) => {
  try {
    const rows = await all(
      `SELECT b.*,
        (SELECT COUNT(*) FROM branch_stock bs WHERE bs.branch_id = b.id AND bs.stock > 0) AS so_mat_hang,
        (SELECT COALESCE(SUM(bs.stock), 0) FROM branch_stock bs WHERE bs.branch_id = b.id) AS tong_ton,
        (SELECT ROUND(COALESCE(SUM(bs.stock * p.cost_price), 0)) FROM branch_stock bs
           JOIN products p ON p.id = bs.product_id AND p.user_id = b.user_id WHERE bs.branch_id = b.id) AS gia_tri_ton
       FROM branches b WHERE b.user_id = ? ORDER BY b.is_default DESC, b.name ASC`,
      [req.tenantId]
    );
    res.json(rows.map(r => ({ ...r, gia_tri_ton: Math.round(Number(r.gia_tri_ton) || 0) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireOwner, async (req, res) => {
  const { name, address, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cần nhập tên chi nhánh' });
  try {
    const soCn = await get('SELECT COUNT(*) c FROM branches WHERE user_id = ?', [req.tenantId]);
    const count = soCn ? soCn.c : 0;
    const r = await run(
      'INSERT INTO branches (user_id, name, address, phone, is_default) VALUES (?, ?, ?, ?, ?)',
      [req.tenantId, name.trim(), address || null, phone || null, count === 0 ? 1 : 0]
    );
    writeAudit(req, { action: 'branch.create', target: name.trim() });
    res.json({ success: true, id: r.lastID });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Chi nhánh trùng tên' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireOwner, async (req, res) => {
  const { name, address, phone, status } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cần nhập tên chi nhánh' });
  try {
    const r = await run(
      'UPDATE branches SET name = ?, address = ?, phone = ?, status = ? WHERE id = ? AND user_id = ?',
      [name.trim(), address || null, phone || null, status || 'active', req.params.id, req.tenantId]
    );
    if (r.changes === 0) return res.status(404).json({ error: 'Không tìm thấy chi nhánh' });
    res.json({ success: true });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Chi nhánh trùng tên' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireOwner, async (req, res) => {
  try {
    const cn = await get('SELECT * FROM branches WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!cn) return res.status(404).json({ error: 'Không tìm thấy chi nhánh' });
    if (cn.is_default) return res.status(400).json({ error: 'Không xóa được chi nhánh mặc định' });

    const conHang = await get('SELECT COALESCE(SUM(stock),0) s FROM branch_stock WHERE branch_id = ?', [cn.id]);
    if (conHang.s > 0) {
      return res.status(409).json({ error: `Chi nhánh còn ${conHang.s} sản phẩm trong kho. Hãy chuyển hết hàng đi trước khi xóa.` });
    }
    await run('DELETE FROM branch_stock WHERE branch_id = ?', [cn.id]);
    await run('DELETE FROM branches WHERE id = ?', [cn.id]);
    writeAudit(req, { action: 'branch.delete', target: cn.name });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Đặt chi nhánh làm mặc định */
router.post('/:id/mac-dinh', requireOwner, async (req, res) => {
  try {
    const cn = await get('SELECT id FROM branches WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!cn) return res.status(404).json({ error: 'Không tìm thấy chi nhánh' });
    await run('UPDATE branches SET is_default = 0 WHERE user_id = ?', [req.tenantId]);
    await run('UPDATE branches SET is_default = 1 WHERE id = ?', [cn.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==================== TỒN KHO THEO CHI NHÁNH ==================== */

/** Tồn kho của một chi nhánh */
router.get('/:id/ton-kho', doc, async (req, res) => {
  try {
    const cn = await get('SELECT id FROM branches WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!cn) return res.status(404).json({ error: 'Không tìm thấy chi nhánh' });
    const rows = await all(
      `SELECT p.*, COALESCE(bs.stock, 0) AS stock
       FROM products p LEFT JOIN branch_stock bs ON bs.product_id = p.id AND bs.branch_id = ?
       WHERE p.user_id = ? ORDER BY p.name ASC LIMIT 1000`,
      [cn.id, req.tenantId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Bảng tồn kho tất cả chi nhánh (mỗi sản phẩm một dòng, mỗi chi nhánh một cột) */
router.get('/ton-kho/tong-hop', doc, async (req, res) => {
  try {
    const branches = await all('SELECT id, name FROM branches WHERE user_id = ? ORDER BY is_default DESC, name ASC', [req.tenantId]);
    const products = await all('SELECT id, name, sku, stock FROM products WHERE user_id = ? ORDER BY name ASC LIMIT 500', [req.tenantId]);
    const bs = await all(
      `SELECT bs.branch_id, bs.product_id, bs.stock FROM branch_stock bs
       JOIN products p ON p.id = bs.product_id WHERE p.user_id = ?`, [req.tenantId]
    );
    const map = {};
    bs.forEach((x) => { map[`${x.product_id}_${x.branch_id}`] = x.stock; });
    res.json({
      branches,
      products: products.map((p) => ({
        ...p,
        ton: branches.reduce((o, b) => { o[b.id] = map[`${p.id}_${b.id}`] || 0; return o; }, {}),
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==================== CHUYỂN KHO GIỮA CHI NHÁNH ==================== */

/**
 * Chuyển hàng thật giữa 2 chi nhánh: trừ kho nơi gửi, cộng kho nơi nhận.
 * Body: { from_branch_id, to_branch_id, items: [{ product_id, quantity }], note }
 */
router.post('/chuyen-kho', ghi, async (req, res) => {
  const { from_branch_id, to_branch_id, items, note } = req.body;
  if (!from_branch_id || !to_branch_id) return res.status(400).json({ error: 'Chọn chi nhánh gửi và chi nhánh nhận' });
  if (String(from_branch_id) === String(to_branch_id)) return res.status(400).json({ error: 'Chi nhánh gửi và nhận phải khác nhau' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Chọn ít nhất một mặt hàng' });

  try {
    const cnGui = await get('SELECT * FROM branches WHERE id = ? AND user_id = ?', [from_branch_id, req.tenantId]);
    const cnNhan = await get('SELECT * FROM branches WHERE id = ? AND user_id = ?', [to_branch_id, req.tenantId]);
    if (!cnGui || !cnNhan) return res.status(404).json({ error: 'Chi nhánh không thuộc cửa hàng của bạn' });

    // Kiểm tra đủ hàng trước khi chuyển
    for (const it of items) {
      const sl = Number(it.quantity);
      if (!(sl > 0)) return res.status(400).json({ error: 'Số lượng chuyển phải lớn hơn 0' });
      const sp = await get('SELECT name, stock FROM products WHERE id = ? AND user_id = ?', [it.product_id, req.tenantId]);
      if (!sp) return res.status(403).json({ error: 'Có sản phẩm không thuộc cửa hàng của bạn' });
      let ton = await get('SELECT stock FROM branch_stock WHERE branch_id = ? AND product_id = ?',
        [from_branch_id, it.product_id]);
      if (!ton) {
        await doiTonChiNhanh(from_branch_id, it.product_id, 0);
        ton = await get('SELECT stock FROM branch_stock WHERE branch_id = ? AND product_id = ?', [from_branch_id, it.product_id]);
      }
      const dangCo = ton ? ton.stock : (sp.stock || 0);
      if (dangCo < sl) {
        return res.status(400).json({ error: `"${sp.name}" ở ${cnGui.name} chỉ còn ${dangCo}, không đủ để chuyển ${sl}` });
      }
    }

    const code = `CK${Date.now().toString().slice(-8)}`;

    // Lưu phiếu chuyển kho (có id chi nhánh để tra cứu chính xác)
    const phieu = await run(
      `INSERT INTO inventory_transfers (user_id, code, from_branch, to_branch, from_branch_id, to_branch_id, total_items, note, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DONE', CURRENT_TIMESTAMP)`,
      [req.tenantId, code, cnGui.name, cnNhan.name, from_branch_id, to_branch_id, items.length, note || null]
    );

    for (const it of items) {
      const sl = Number(it.quantity);
      const sp = await get('SELECT name FROM products WHERE id = ? AND user_id = ?', [it.product_id, req.tenantId]);
      await doiTonChiNhanh(from_branch_id, it.product_id, -sl);
      await doiTonChiNhanh(to_branch_id, it.product_id, sl);
      await run(
        `INSERT INTO transfer_items (transfer_id, product_id, product_name, quantity) VALUES (?, ?, ?, ?)`,
        [phieu.lastID, it.product_id, sp ? sp.name : '', sl]
      );
      await run(
        `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id) VALUES (?, ?, 'OUT', ?, ?, ?)`,
        [req.tenantId, it.product_id, sl, `Chuyển kho ${code} → ${cnNhan.name}`, from_branch_id]
      );
      await run(
        `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id) VALUES (?, ?, 'IN', ?, ?, ?)`,
        [req.tenantId, it.product_id, sl, `Nhận từ ${cnGui.name} (${code})`, to_branch_id]
      );
    }

    writeAudit(req, { action: 'branch.transfer', target: code, detail: { tu: cnGui.name, den: cnNhan.name, so_mat_hang: items.length } });
    res.json({ success: true, id: phieu.lastID, code, tu: cnGui.name, den: cnNhan.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Lịch sử chuyển kho (có thật, kèm số mặt hàng) */
router.get('/chuyen-kho/lich-su', doc, async (req, res) => {
  try {
    res.json(await all(
      `SELECT * FROM inventory_transfers WHERE user_id = ? ORDER BY id DESC LIMIT 200`,
      [req.tenantId]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Chi tiết một phiếu chuyển kho */
router.get('/chuyen-kho/:id', doc, async (req, res) => {
  try {
    const p = await get('SELECT * FROM inventory_transfers WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!p) return res.status(404).json({ error: 'Không tìm thấy phiếu chuyển kho' });
    p.items = await all('SELECT * FROM transfer_items WHERE transfer_id = ?', [p.id]);
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports.router = router;
