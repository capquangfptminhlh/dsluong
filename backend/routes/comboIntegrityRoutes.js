'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

const router = express.Router();
const canWriteCombo = [requireAuth, requirePermission('products')];

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, `${label} không hợp lệ`);
  return id;
}

function nonNegativeFinite(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw httpError(400, `${label} phải là số hữu hạn không âm`);
  return number;
}

function positiveFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw httpError(400, `${label} phải là số hữu hạn lớn hơn 0`);
  return number;
}

function nativeDb() {
  const native = db._native;
  if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');
  return native;
}

router.post('/combos', ...canWriteCombo, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên combo' });
  const inputItems = req.body?.items;
  if (!Array.isArray(inputItems) || inputItems.length === 0) return res.status(400).json({ error: 'Combo cần ít nhất một sản phẩm' });
  if (inputItems.length > 500) return res.status(400).json({ error: 'Combo tối đa 500 dòng thành phần' });

  let price;
  let normalizedItems;
  try {
    price = nonNegativeFinite(req.body?.price, 'Giá combo');
    const quantityByProduct = new Map();
    for (const item of inputItems) {
      const productId = positiveId(item?.product_id, 'Sản phẩm thành phần');
      const quantity = positiveFinite(item?.quantity, 'Số lượng thành phần');
      const total = (quantityByProduct.get(productId) || 0) + quantity;
      if (!Number.isFinite(total)) throw httpError(400, 'Tổng số lượng thành phần vượt giới hạn hợp lệ');
      quantityByProduct.set(productId, total);
    }
    normalizedItems = Array.from(quantityByProduct, ([product_id, quantity]) => ({ product_id, quantity }));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const sku = String(req.body?.sku || '').trim().slice(0, 120) || null;
  try {
    const native = nativeDb();
    const createCombo = native.transaction(() => {
      const productStmt = native.prepare('SELECT id, name FROM products WHERE id = ? AND user_id = ?');
      const checkedItems = normalizedItems.map((item) => {
        const product = productStmt.get(item.product_id, req.tenantId);
        if (!product) throw httpError(403, 'Có sản phẩm không thuộc cửa hàng của bạn');
        return { ...item, name: product.name };
      });

      const inserted = native.prepare(
        'INSERT INTO combos (user_id, name, sku, price) VALUES (?, ?, ?, ?)'
      ).run(req.tenantId, name, sku, price);
      const comboId = Number(inserted.lastInsertRowid);
      const itemStmt = native.prepare(
        'INSERT INTO combo_items (combo_id, product_id, quantity) VALUES (?, ?, ?)'
      );
      for (const item of checkedItems) itemStmt.run(comboId, item.product_id, item.quantity);
      return { id: comboId, items: checkedItems };
    });

    const result = createCombo.immediate();
    writeAudit(req, {
      action: 'combo.create',
      target: String(result.id),
      detail: { name, sku, price, items: result.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })) },
    });
    return res.json({ success: true, id: result.id });
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error.message || ''))) return res.status(409).json({ error: 'Combo trùng tên' });
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi tạo combo' });
  }
});

router.delete('/combos/:id', ...canWriteCombo, (req, res) => {
  let comboId;
  try {
    comboId = positiveId(req.params.id, 'Combo');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  try {
    const native = nativeDb();
    const deleteCombo = native.transaction(() => {
      const combo = native.prepare('SELECT id, name FROM combos WHERE id = ? AND user_id = ?').get(comboId, req.tenantId);
      if (!combo) throw httpError(404, 'Không tìm thấy combo');

      const history = native.prepare(`
        SELECT COUNT(*) AS count
        FROM pos_order_items poi
        JOIN pos_orders po ON po.id = poi.order_id
        WHERE po.user_id = ? AND poi.combo_id = ?
      `).get(req.tenantId, comboId);
      if (Number(history?.count || 0) > 0) {
        throw httpError(409, 'Combo đã phát sinh đơn hàng; không thể xóa lịch sử. Hãy ngừng sử dụng combo thay vì xóa.');
      }

      native.prepare('DELETE FROM combo_items WHERE combo_id = ?').run(comboId);
      const deleted = native.prepare('DELETE FROM combos WHERE id = ? AND user_id = ?').run(comboId, req.tenantId);
      if (Number(deleted.changes) !== 1) throw httpError(409, 'Combo vừa thay đổi bởi yêu cầu khác');
      return combo;
    });

    const result = deleteCombo.immediate();
    writeAudit(req, { action: 'combo.delete', target: result.name, detail: { combo_id: result.id, unused_only: true } });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi xóa combo' });
  }
});

module.exports = router;
