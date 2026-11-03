'use strict';

const express = require('express');
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

const router = express.Router();
const canWriteInventory = [requireAuth, requirePermission('inventory')];

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function finiteNonZero(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    throw httpError(400, 'Số lượng nhập/xuất phải là số hữu hạn khác 0');
  }
  return number;
}

router.post('/import', ...canWriteInventory, (req, res) => {
  const productId = Number(req.body?.product_id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Sản phẩm không hợp lệ' });
  }

  let quantity;
  try {
    quantity = finiteNonZero(req.body?.quantity);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const note = String(req.body?.note || '').trim().slice(0, 1000) || null;
  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  try {
    const executeMovement = native.transaction(() => {
      const product = native.prepare(
        'SELECT id, name, COALESCE(stock, 0) AS stock FROM products WHERE id = ? AND user_id = ?',
      ).get(productId, req.tenantId);
      if (!product) throw httpError(404, 'Sản phẩm không thuộc cửa hàng của bạn');

      const selectedBranchId = resolvePosBranch(req, req.body?.branch_id);
      const branch = native.prepare(
        'SELECT id, name FROM branches WHERE id = ? AND user_id = ?',
      ).get(selectedBranchId, req.tenantId);
      if (!branch) throw httpError(409, 'Cửa hàng chưa có chi nhánh/kho hoạt động để ghi nhận tồn');

      const anyAllocation = native.prepare(
        'SELECT COUNT(*) AS count FROM branch_stock WHERE product_id = ?',
      ).get(productId);
      const defaultSeed = Number(anyAllocation?.count || 0) === 0 ? Number(product.stock || 0) : 0;

      native.prepare(
        `INSERT INTO branch_stock (branch_id, product_id, stock)
         VALUES (?, ?, ?)
         ON CONFLICT(branch_id, product_id) DO NOTHING`,
      ).run(branch.id, productId, defaultSeed);

      const beforeBranch = Number(native.prepare(
        'SELECT COALESCE(stock, 0) AS stock FROM branch_stock WHERE branch_id = ? AND product_id = ?',
      ).get(branch.id, productId)?.stock || 0);
      const afterBranch = beforeBranch + quantity;
      if (!Number.isFinite(afterBranch)) throw httpError(400, 'Tồn kho sau điều chỉnh không hợp lệ');
      if (afterBranch < 0) {
        throw httpError(409, `Không đủ tồn kho tại ${branch.name}. Hiện còn ${beforeBranch}`);
      }

      native.prepare(
        'UPDATE branch_stock SET stock = ? WHERE branch_id = ? AND product_id = ?',
      ).run(afterBranch, branch.id, productId);

      native.prepare(
        `UPDATE products
         SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stock WHERE product_id = ?)
         WHERE id = ? AND user_id = ?`,
      ).run(productId, productId, req.tenantId);

      const log = native.prepare(
        `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(req.tenantId, productId, quantity > 0 ? 'IN' : 'OUT', Math.abs(quantity), note, branch.id);

      const afterTotal = Number(native.prepare(
        'SELECT COALESCE(stock, 0) AS stock FROM products WHERE id = ? AND user_id = ?',
      ).get(productId, req.tenantId)?.stock || 0);

      return {
        id: Number(log.lastInsertRowid),
        product,
        branch,
        beforeBranch,
        afterBranch,
        beforeTotal: Number(product.stock || 0),
        afterTotal,
      };
    });

    const result = executeMovement.immediate();
    writeAudit(req, {
      action: quantity > 0 ? 'inventory.in' : 'inventory.out',
      target: result.product.name,
      detail: {
        quantity: Math.abs(quantity),
        branch_id: result.branch.id,
        branch_name: result.branch.name,
        branch_stock_truoc: result.beforeBranch,
        branch_stock_sau: result.afterBranch,
        stock_truoc: result.beforeTotal,
        stock_sau: result.afterTotal,
        note,
      },
    });

    return res.json({
      success: true,
      id: result.id,
      new_stock: result.afterTotal,
      branch_id: result.branch.id,
      branch_stock: result.afterBranch,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi xử lý kho' });
  }
});

module.exports = router;
