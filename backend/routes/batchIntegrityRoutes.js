'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireAnyPermission, requirePermission, writeAudit } = require('../middleware/auth');
const { formatBusinessDate, calendarDayDifference } = require('../utils/businessDate');

const router = express.Router();
const canReadBatch = [requireAuth, requireAnyPermission('inventory', 'products', 'pos')];
const canWriteBatch = [requireAuth, requirePermission('inventory')];

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, `${label} không hợp lệ`);
  return id;
}

function positiveFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw httpError(400, `${label} phải là số hữu hạn lớn hơn 0`);
  return number;
}

function nonNegativeFinite(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw httpError(400, `${label} phải là số hữu hạn không âm`);
  return number;
}

function cleanExpiryDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw httpError(400, 'Hạn sử dụng phải theo định dạng YYYY-MM-DD');
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw httpError(400, 'Hạn sử dụng không hợp lệ');
  return text;
}

function nativeDb() {
  const native = db._native;
  if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');
  return native;
}

function resolveBranch(native, userId, requestedBranchId) {
  if (requestedBranchId !== undefined && requestedBranchId !== null && String(requestedBranchId).trim() !== '') {
    const branchId = positiveId(requestedBranchId, 'Chi nhánh');
    const branch = native.prepare(
      `SELECT id, name FROM branches
       WHERE id = ? AND user_id = ? AND COALESCE(status, 'active') = 'active'`,
    ).get(branchId, userId);
    if (!branch) throw httpError(404, 'Chi nhánh không thuộc cửa hàng hoặc đã ngừng hoạt động');
    return branch;
  }

  const branch = native.prepare(
    `SELECT id, name FROM branches
     WHERE user_id = ? AND COALESCE(status, 'active') = 'active'
     ORDER BY is_default DESC, id ASC LIMIT 1`,
  ).get(userId);
  if (!branch) throw httpError(409, 'Cửa hàng chưa có chi nhánh/kho hoạt động');
  return branch;
}

function ensureBranchStock(native, branchId, product, userId) {
  const anyAllocation = Number(native.prepare(
    'SELECT COUNT(*) AS count FROM branch_stock WHERE product_id = ?',
  ).get(product.id)?.count || 0);
  const seed = anyAllocation === 0 ? Number(product.stock || 0) : 0;
  if (!Number.isFinite(seed) || seed < 0) throw httpError(409, 'Tổng tồn sản phẩm hiện tại không hợp lệ');

  native.prepare(
    `INSERT INTO branch_stock (branch_id, product_id, stock)
     VALUES (?, ?, ?)
     ON CONFLICT(branch_id, product_id) DO NOTHING`,
  ).run(branchId, product.id, seed);

  const row = native.prepare(
    `SELECT COALESCE(bs.stock, 0) AS stock
     FROM branch_stock bs
     JOIN branches b ON b.id = bs.branch_id AND b.user_id = ?
     WHERE bs.branch_id = ? AND bs.product_id = ?`,
  ).get(userId, branchId, product.id);
  if (!row) throw httpError(409, 'Không thể khởi tạo tồn kho chi nhánh cho sản phẩm');
  const stock = Number(row.stock || 0);
  if (!Number.isFinite(stock) || stock < 0) throw httpError(409, 'Tồn kho chi nhánh hiện tại không hợp lệ');
  return stock;
}

router.get('/', ...canReadBatch, (req, res) => {
  const native = db._native;
  if (!native || typeof native.prepare !== 'function') return res.status(500).json({ error: 'SQLite engine unavailable' });
  try {
    const rows = native.prepare(`
      SELECT pb.*, p.name AS product_name, p.sku, br.name AS branch_name,
             CASE WHEN pb.branch_id IS NULL THEN 1 ELSE 0 END AS branch_unresolved
      FROM product_batches pb
      JOIN products p ON p.id = pb.product_id AND p.user_id = pb.user_id
      LEFT JOIN branches br ON br.id = pb.branch_id AND br.user_id = pb.user_id
      WHERE pb.user_id = ?
        AND pb.quantity > 0
        AND COALESCE(pb.status, 'active') = 'active'
      ORDER BY (pb.expiry_date IS NULL), pb.expiry_date ASC, pb.id ASC
    `).all(req.tenantId);

    const today = formatBusinessDate();
    const result = rows.map((batch) => {
      const remainingDays = batch.expiry_date ? calendarDayDifference(batch.expiry_date, today) : null;
      return {
        ...batch,
        ngay_con_lai: remainingDays,
        het_han: remainingDays !== null && remainingDays < 0,
      };
    });
    const threshold = Number(req.query.sap_het);
    return res.json(Number.isFinite(threshold) && threshold !== 0
      ? result.filter((batch) => batch.ngay_con_lai !== null && batch.ngay_con_lai <= threshold)
      : result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/', ...canWriteBatch, (req, res) => {
  let productId;
  let quantity;
  let costPrice;
  let expiryDate;
  try {
    productId = positiveId(req.body?.product_id, 'Sản phẩm');
    quantity = positiveFinite(req.body?.quantity, 'Số lượng');
    costPrice = nonNegativeFinite(req.body?.cost_price, 'Giá vốn');
    expiryDate = cleanExpiryDate(req.body?.expiry_date);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const batchCode = String(req.body?.batch_code || '').trim().slice(0, 120) || null;
  const note = String(req.body?.note || '').trim().slice(0, 1000) || null;

  try {
    const native = nativeDb();
    const createBatch = native.transaction(() => {
      const product = native.prepare(
        'SELECT id, name, COALESCE(stock, 0) AS stock FROM products WHERE id = ? AND user_id = ?',
      ).get(productId, req.tenantId);
      if (!product) throw httpError(404, 'Sản phẩm không thuộc cửa hàng của bạn');
      const branch = resolveBranch(native, req.tenantId, req.body?.branch_id);
      const beforeBranch = ensureBranchStock(native, branch.id, product, req.tenantId);
      const afterBranch = beforeBranch + quantity;
      if (!Number.isFinite(afterBranch)) throw httpError(400, 'Tồn sau khi nhập lô không hợp lệ');

      const inserted = native.prepare(`
        INSERT INTO product_batches
          (user_id, product_id, batch_code, expiry_date, quantity, cost_price, note, branch_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(req.tenantId, productId, batchCode, expiryDate, quantity, costPrice, note, branch.id);

      native.prepare(
        'UPDATE branch_stock SET stock = ? WHERE branch_id = ? AND product_id = ?',
      ).run(afterBranch, branch.id, productId);
      native.prepare(`
        UPDATE products
        SET track_batch = 1,
            stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stock WHERE product_id = ?)
        WHERE id = ? AND user_id = ?
      `).run(productId, productId, req.tenantId);

      const log = native.prepare(`
        INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
        VALUES (?, ?, 'IN', ?, ?, ?)
      `).run(req.tenantId, productId, quantity, `Nhập lô ${batchCode || inserted.lastInsertRowid}`.slice(0, 1000), branch.id);

      const total = Number(native.prepare(
        'SELECT COALESCE(stock, 0) AS stock FROM products WHERE id = ? AND user_id = ?',
      ).get(productId, req.tenantId)?.stock || 0);
      if (!Number.isFinite(total)) throw httpError(409, 'Tổng tồn sau khi nhập lô không hợp lệ');

      return {
        id: Number(inserted.lastInsertRowid),
        logId: Number(log.lastInsertRowid),
        product,
        branch,
        beforeBranch,
        afterBranch,
        total,
      };
    });

    const result = createBatch.immediate();
    writeAudit(req, {
      action: 'batch.create',
      target: batchCode || String(result.id),
      detail: {
        product_id: productId,
        quantity,
        cost_price: costPrice,
        expiry_date: expiryDate,
        branch_id: result.branch.id,
        branch_name: result.branch.name,
        branch_stock_truoc: result.beforeBranch,
        branch_stock_sau: result.afterBranch,
        stock_sau: result.total,
      },
    });
    return res.json({ success: true, id: result.id, branch_id: result.branch.id, new_stock: result.total });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi nhập lô' });
  }
});

router.post('/:id/assign-branch', ...canWriteBatch, (req, res) => {
  let batchId;
  let branchId;
  try {
    batchId = positiveId(req.params.id, 'Lô hàng');
    branchId = positiveId(req.body?.branch_id, 'Chi nhánh');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  try {
    const native = nativeDb();
    const assignBatch = native.transaction(() => {
      const batch = native.prepare(`
        SELECT id, product_id, quantity, branch_id, batch_code
        FROM product_batches
        WHERE id = ? AND user_id = ? AND COALESCE(status, 'active') = 'active'
      `).get(batchId, req.tenantId);
      if (!batch) throw httpError(404, 'Không tìm thấy lô đang hoạt động');
      if (batch.branch_id !== null && batch.branch_id !== undefined) {
        if (Number(batch.branch_id) === branchId) return { batch, branch: resolveBranch(native, req.tenantId, branchId), unchanged: true };
        throw httpError(409, 'Lô đã được gán chi nhánh; không đổi vị trí bằng thao tác tương thích legacy');
      }

      const branch = resolveBranch(native, req.tenantId, branchId);
      const branchStock = Number(native.prepare(
        'SELECT COALESCE(stock, 0) AS stock FROM branch_stock WHERE branch_id = ? AND product_id = ?',
      ).get(branch.id, batch.product_id)?.stock || 0);
      const alreadyAssigned = Number(native.prepare(`
        SELECT COALESCE(SUM(quantity), 0) AS quantity
        FROM product_batches
        WHERE user_id = ? AND product_id = ? AND branch_id = ?
          AND COALESCE(status, 'active') = 'active' AND quantity > 0
      `).get(req.tenantId, batch.product_id, branch.id)?.quantity || 0);
      const needed = alreadyAssigned + Number(batch.quantity || 0);
      if (!Number.isFinite(branchStock) || !Number.isFinite(needed) || branchStock < needed) {
        throw httpError(409, `Tồn tại ${branch.name} không đủ để xác nhận vị trí lô. Tồn chi nhánh ${branchStock}, cần bao phủ ${needed}.`);
      }

      const updated = native.prepare(
        'UPDATE product_batches SET branch_id = ? WHERE id = ? AND user_id = ? AND branch_id IS NULL',
      ).run(branch.id, batch.id, req.tenantId);
      if (Number(updated.changes) !== 1) throw httpError(409, 'Lô vừa được gán bởi yêu cầu khác');
      return { batch, branch, unchanged: false };
    });

    const result = assignBatch.immediate();
    writeAudit(req, {
      action: 'batch.assign_branch',
      target: result.batch.batch_code || String(result.batch.id),
      detail: { branch_id: result.branch.id, branch_name: result.branch.name, legacy_resolution: true, unchanged: result.unchanged },
    });
    return res.json({ success: true, branch_id: result.branch.id, branch_name: result.branch.name });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi gán chi nhánh cho lô' });
  }
});

router.post('/:id/huy', ...canWriteBatch, (req, res) => {
  let batchId;
  try {
    batchId = positiveId(req.params.id, 'Lô hàng');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  const reason = String(req.body?.reason || 'hết hạn').trim().slice(0, 500) || 'hết hạn';

  try {
    const native = nativeDb();
    const destroyBatch = native.transaction(() => {
      const batch = native.prepare(`
        SELECT pb.*, p.name AS product_name
        FROM product_batches pb
        JOIN products p ON p.id = pb.product_id AND p.user_id = pb.user_id
        WHERE pb.id = ? AND pb.user_id = ?
      `).get(batchId, req.tenantId);
      if (!batch) throw httpError(404, 'Không tìm thấy lô');
      if (String(batch.status || 'active') !== 'active' || Number(batch.quantity || 0) <= 0) {
        throw httpError(409, 'Lô này đã hết hoặc đã bị hủy');
      }

      const quantity = Number(batch.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw httpError(409, 'Số lượng còn lại của lô không hợp lệ');

      let branchId = batch.branch_id === null || batch.branch_id === undefined ? null : Number(batch.branch_id);
      let branch;
      if (!branchId) {
        const candidates = native.prepare(`
          SELECT b.id, b.name, COALESCE(bs.stock, 0) AS stock
          FROM branch_stock bs
          JOIN branches b ON b.id = bs.branch_id AND b.user_id = ?
          WHERE bs.product_id = ? AND COALESCE(bs.stock, 0) > 0
          ORDER BY b.is_default DESC, b.id ASC
        `).all(req.tenantId, batch.product_id);
        if (candidates.length !== 1 || Number(candidates[0].stock) < quantity) {
          throw httpError(409, 'Lô cũ chưa xác định chi nhánh. Hãy gán đúng chi nhánh của lô trước khi hủy.');
        }
        branch = candidates[0];
        branchId = Number(branch.id);
        native.prepare('UPDATE product_batches SET branch_id = ? WHERE id = ? AND user_id = ? AND branch_id IS NULL')
          .run(branchId, batch.id, req.tenantId);
      } else {
        branch = native.prepare('SELECT id, name FROM branches WHERE id = ? AND user_id = ?').get(branchId, req.tenantId);
        if (!branch) throw httpError(409, 'Chi nhánh của lô không còn hợp lệ');
      }

      const beforeBranch = Number(native.prepare(
        'SELECT COALESCE(stock, 0) AS stock FROM branch_stock WHERE branch_id = ? AND product_id = ?',
      ).get(branchId, batch.product_id)?.stock || 0);
      if (!Number.isFinite(beforeBranch) || beforeBranch < quantity) {
        throw httpError(409, `Tồn chi nhánh ${branch.name} chỉ còn ${beforeBranch}, thấp hơn số lượng lô ${quantity}. Cần đối soát trước khi hủy.`);
      }
      const afterBranch = beforeBranch - quantity;

      native.prepare('UPDATE branch_stock SET stock = ? WHERE branch_id = ? AND product_id = ?')
        .run(afterBranch, branchId, batch.product_id);
      native.prepare(`
        UPDATE products
        SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stock WHERE product_id = ?)
        WHERE id = ? AND user_id = ?
      `).run(batch.product_id, batch.product_id, req.tenantId);
      native.prepare(`
        INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
        VALUES (?, ?, 'OUT', ?, ?, ?)
      `).run(req.tenantId, batch.product_id, quantity, `Hủy lô ${batch.batch_code || batch.id} - ${reason}`.slice(0, 1000), branchId);

      const updated = native.prepare(`
        UPDATE product_batches
        SET quantity = 0, status = 'destroyed', destroyed_at = CURRENT_TIMESTAMP, destroy_reason = ?
        WHERE id = ? AND user_id = ? AND COALESCE(status, 'active') = 'active' AND quantity > 0
      `).run(reason, batch.id, req.tenantId);
      if (Number(updated.changes) !== 1) throw httpError(409, 'Lô vừa được xử lý bởi yêu cầu khác');

      const total = Number(native.prepare(
        'SELECT COALESCE(stock, 0) AS stock FROM products WHERE id = ? AND user_id = ?',
      ).get(batch.product_id, req.tenantId)?.stock || 0);
      return { batch, branch, quantity, beforeBranch, afterBranch, total };
    });

    const result = destroyBatch.immediate();
    writeAudit(req, {
      action: 'batch.destroy',
      target: result.batch.batch_code || String(result.batch.id),
      detail: {
        quantity: result.quantity,
        reason,
        branch_id: result.branch.id,
        branch_name: result.branch.name,
        branch_stock_truoc: result.beforeBranch,
        branch_stock_sau: result.afterBranch,
        stock_sau: result.total,
      },
    });
    return res.json({ success: true, da_huy: result.quantity, branch_id: result.branch.id, new_stock: result.total });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi hủy lô' });
  }
});

module.exports = router;
