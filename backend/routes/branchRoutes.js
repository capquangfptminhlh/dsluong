const express = require('express');
const router = express.Router();
const db = require('../db');
const { posBranchContext, resolvePosBranch } = require('../utils/branchAccess');
const { requireAuth, requireOwner, requireAnyPermission, requirePermission, writeAudit } = require('../middleware/auth');

// Chi nhánh / kho
router.use(requireAuth);
const doc = requireAnyPermission('inventory', 'products', 'pos', 'reports');
const ghi = requirePermission('inventory');

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * Cộng/trừ tồn kho tại một chi nhánh, đồng thời cập nhật tổng tồn của sản phẩm.
 * `delta` dương = nhập, âm = xuất.
 * products.stock luôn = tổng tồn của mọi chi nhánh.
 */
async function doiTonChiNhanh(branchId, productId, delta) {
  await run(
    `INSERT INTO branch_stock (branch_id, product_id, stock) VALUES (?, ?, ?)
     ON CONFLICT(branch_id, product_id) DO UPDATE SET stock = stock + ?`,
    [branchId, productId, delta, delta]
  );
  await run(
    `UPDATE products SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stock WHERE product_id = ?) WHERE id = ?`,
    [productId, productId]
  );
}
module.exports.doiTonChiNhanh = doiTonChiNhanh;

/** Chi nhánh mặc định của cửa hàng (dùng khi không chỉ định) */
async function chiNhanhMacDinh(userId) {
  let cn = await get('SELECT id FROM branches WHERE user_id = ? AND is_default = 1', [userId]);
  if (!cn) cn = await get('SELECT id FROM branches WHERE user_id = ? ORDER BY id ASC LIMIT 1', [userId]);
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
        (SELECT COALESCE(SUM(bs.stock * p.cost_price), 0) FROM branch_stock bs
           JOIN products p ON p.id = bs.product_id WHERE bs.branch_id = b.id) AS gia_tri_ton
       FROM branches b WHERE b.user_id = ? ORDER BY b.is_default DESC, b.name ASC`,
      [req.tenantId]
    );
    const scopeId = req.user.actorType === 'staff' ? resolvePosBranch(req, null) : null;
    res.json(scopeId === null ? rows : rows.filter((row) => Number(row.id) === scopeId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POS exposes only authorized active branches; the stock endpoint has the
// same server-side scope guard as checkout (never trust client branch_id).
router.get('/pos-context', requirePermission('pos'), (req, res) => {
  try {
    res.json(posBranchContext(req));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/shift-context', requireAnyPermission('pos', 'finance'), (req, res) => {
  try { res.json(posBranchContext(req)); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.get('/finance-context', requirePermission('finance'), (req, res) => {
  try { res.json(posBranchContext(req)); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

router.get('/report-context', requirePermission('reports'), (req, res) => {
  try {
    res.json(posBranchContext(req));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/sales-summary', requireOwner, async (req, res) => {
  try {
    const rows = await all(
      `SELECT b.id, b.name,
          COUNT(CASE WHEN o.status != 'cancelled' THEN 1 END) AS orders,
          COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total_amount ELSE 0 END), 0) AS revenue
       FROM branches b LEFT JOIN pos_orders o ON o.branch_id = b.id AND o.user_id = b.user_id
       WHERE b.user_id = ? GROUP BY b.id, b.name ORDER BY b.name`,
      [req.tenantId],
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pos-stock', requirePermission('pos'), async (req, res) => {
  try {
    const branchId = resolvePosBranch(req, req.query.branch_id);
    const rows = await all(
      `SELECT bs.product_id, bs.stock FROM branch_stock bs
       JOIN products p ON p.id = bs.product_id AND p.user_id = ?
       WHERE bs.branch_id = ?`,
      [req.tenantId, branchId],
    );
    res.json({ branch_id: branchId, stock: Object.fromEntries(rows.map((row) => [row.product_id, row.stock])) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/', requireOwner, async (req, res) => {
  const { name, address, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Cần nhập tên chi nhánh' });
  try {
    const soCn = await get('SELECT COUNT(*) c FROM branches WHERE user_id = ?', [req.tenantId]);
    const r = await run(
      'INSERT INTO branches (user_id, name, address, phone, is_default) VALUES (?, ?, ?, ?, ?)',
      [req.tenantId, name.trim(), address || null, phone || null, soCn.c === 0 ? 1 : 0]
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
    if (req.user.actorType === 'staff' && resolvePosBranch(req, null) !== Number(cn.id)) {
      return res.status(403).json({ error: 'Không được xem kho của chi nhánh khác.' });
    }
    const rows = await all(
      `SELECT p.id, p.name, p.sku, p.price, p.cost_price, COALESCE(bs.stock, 0) AS stock
       FROM products p LEFT JOIN branch_stock bs ON bs.product_id = p.id AND bs.branch_id = ?
       WHERE p.user_id = ? ORDER BY p.name ASC LIMIT 1000`,
      [cn.id, req.tenantId]
    );
    res.json(rows);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

/** Bảng tồn kho tất cả chi nhánh (mỗi sản phẩm một dòng, mỗi chi nhánh một cột) */
router.get('/ton-kho/tong-hop', doc, async (req, res) => {
  try {
    const scopeId = req.user.actorType === 'staff' ? resolvePosBranch(req, null) : null;
    const everyBranch = await all('SELECT id, name FROM branches WHERE user_id = ? ORDER BY is_default DESC, name ASC', [req.tenantId]);
    const branches = scopeId === null ? everyBranch : everyBranch.filter((b) => Number(b.id) === scopeId);
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
        stock: scopeId === null ? p.stock : (map[`${p.id}_${scopeId}`] || 0),
        ton: branches.reduce((o, b) => { o[b.id] = map[`${p.id}_${b.id}`] || 0; return o; }, {}),
      })),
    });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

/* ==================== CHUYỂN KHO GIỮA CHI NHÁNH ==================== */

/**
 * Chuyển hàng thật giữa 2 chi nhánh: trừ kho nơi gửi, cộng kho nơi nhận.
 * Body: { from_branch_id, to_branch_id, items: [{ product_id, quantity }], note }
 */
router.post('/chuyen-kho', ghi, (req, res) => {
  const { from_branch_id, to_branch_id, items, note } = req.body;
  const fromId = Number(from_branch_id);
  const toId = Number(to_branch_id);
  if (!Number.isInteger(fromId) || fromId <= 0 || !Number.isInteger(toId) || toId <= 0) {
    return res.status(400).json({ error: 'Chọn chi nhánh gửi và chi nhánh nhận' });
  }
  if (fromId === toId) return res.status(400).json({ error: 'Chi nhánh gửi và nhận phải khác nhau' });
  try {
    if (req.user.actorType === 'staff' && resolvePosBranch(req, null) !== fromId) {
      return res.status(403).json({ error: 'Chỉ được xuất hàng từ chi nhánh được phân công.' });
    }
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Chọn ít nhất một mặt hàng' });

  const quantityByProduct = new Map();
  for (const it of items) {
    const productId = Number(it?.product_id);
    const quantity = Number(it?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Sản phẩm chuyển kho không hợp lệ' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Số lượng chuyển phải là số hữu hạn lớn hơn 0' });
    const totalQuantity = (quantityByProduct.get(productId) || 0) + quantity;
    if (!Number.isFinite(totalQuantity)) return res.status(400).json({ error: 'Tổng số lượng chuyển không hợp lệ' });
    quantityByProduct.set(productId, totalQuantity);
  }
  const normalizedItems = Array.from(quantityByProduct, ([product_id, quantity]) => ({ product_id, quantity }));

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');

    const executeTransfer = native.transaction(() => {
      const cnGui = native.prepare('SELECT * FROM branches WHERE id = ? AND user_id = ?').get(fromId, req.tenantId);
      const cnNhan = native.prepare('SELECT * FROM branches WHERE id = ? AND user_id = ?').get(toId, req.tenantId);
      if (!cnGui || !cnNhan) throw httpError(404, 'Chi nhánh không thuộc cửa hàng của bạn');

      const productStmt = native.prepare('SELECT id, name FROM products WHERE id = ? AND user_id = ?');
      const stockStmt = native.prepare('SELECT COALESCE(stock,0) s FROM branch_stock WHERE branch_id = ? AND product_id = ?');
      const preparedItems = normalizedItems.map((it) => {
        const sp = productStmt.get(it.product_id, req.tenantId);
        if (!sp) throw httpError(403, 'Có sản phẩm không thuộc cửa hàng của bạn');
        const dangCo = Number(stockStmt.get(fromId, it.product_id)?.s) || 0;
        if (dangCo < it.quantity) {
          throw httpError(409, `"${sp.name}" ở ${cnGui.name} chỉ còn ${dangCo}, không đủ để chuyển ${it.quantity}`);
        }
        return { ...it, name: sp.name };
      });

      const code = `CK${Date.now().toString().slice(-8)}`;
      const changeStock = native.prepare(`
        INSERT INTO branch_stock (branch_id, product_id, stock) VALUES (?, ?, ?)
        ON CONFLICT(branch_id, product_id) DO UPDATE SET stock = stock + excluded.stock
      `);
      const syncTotal = native.prepare(`
        UPDATE products
        SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stock WHERE product_id = ?)
        WHERE id = ? AND user_id = ?
      `);
      const insertLog = native.prepare(`
        INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const it of preparedItems) {
        changeStock.run(fromId, it.product_id, -it.quantity);
        changeStock.run(toId, it.product_id, it.quantity);
        syncTotal.run(it.product_id, it.product_id, req.tenantId);
        insertLog.run(req.tenantId, it.product_id, 'OUT', it.quantity, `Chuyển kho ${code} → ${cnNhan.name}`, fromId);
        insertLog.run(req.tenantId, it.product_id, 'IN', it.quantity, `Nhận từ ${cnGui.name} (${code})`, toId);
      }

      const hasHistoryTable = native.prepare("SELECT 1 ok FROM sqlite_master WHERE type = 'table' AND name = 'inventory_transfers'").get();
      if (hasHistoryTable) {
        native.prepare(`
          INSERT INTO inventory_transfers (user_id, code, from_branch, to_branch, status)
          VALUES (?, ?, ?, ?, 'DONE')
        `).run(req.tenantId, code, cnGui.name, cnNhan.name);
      }

      return { code, cnGui, cnNhan, preparedItems };
    });

    const result = executeTransfer.immediate();
    writeAudit(req, {
      action: 'branch.transfer',
      target: result.code,
      detail: { tu: result.cnGui.name, den: result.cnNhan.name, so_mat_hang: result.preparedItems.length, note: note || null },
    });
    return res.json({ success: true, code: result.code, tu: result.cnGui.name, den: result.cnNhan.name });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports.router = router;