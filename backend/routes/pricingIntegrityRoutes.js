'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
const canWriteProducts = requirePermission('products');

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, `${label} không hợp lệ`);
  return id;
}

function nonNegativeFinite(value, label) {
  const number = Number(value);
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

router.post('/matrix', canWriteProducts, (req, res) => {
  let productId;
  let levelId;
  let price;
  try {
    productId = positiveId(req.body?.product_id, 'Sản phẩm');
    levelId = positiveId(req.body?.level_id, 'Mức giá');
    price = nonNegativeFinite(req.body?.price, 'Giá bán');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  try {
    const native = nativeDb();
    const writePrice = native.transaction(() => {
      const product = native.prepare('SELECT id FROM products WHERE id = ? AND user_id = ?').get(productId, req.tenantId);
      if (!product) throw httpError(404, 'Sản phẩm không thuộc cửa hàng của bạn');
      const level = native.prepare('SELECT id FROM price_levels WHERE id = ? AND user_id = ?').get(levelId, req.tenantId);
      if (!level) throw httpError(404, 'Không tìm thấy mức giá của cửa hàng hiện tại');

      native.prepare(`
        INSERT INTO product_prices (product_id, level_id, price)
        VALUES (?, ?, ?)
        ON CONFLICT(product_id, level_id) DO UPDATE SET price = excluded.price
      `).run(productId, levelId, price);
      return { productId, levelId, price };
    });

    const result = writePrice.immediate();
    writeAudit(req, {
      action: 'pricing.matrix.update',
      target: `${result.productId}:${result.levelId}`,
      detail: { price: result.price },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi cập nhật bảng giá' });
  }
});

router.post('/units', canWriteProducts, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên đơn vị' });

  let productId;
  let ratio;
  let price;
  try {
    productId = positiveId(req.body?.product_id, 'Sản phẩm');
    ratio = positiveFinite(req.body?.ratio, 'Tỷ lệ quy đổi');
    price = nonNegativeFinite(req.body?.price, 'Giá bán');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  try {
    const native = nativeDb();
    const createUnit = native.transaction(() => {
      const product = native.prepare('SELECT id FROM products WHERE id = ? AND user_id = ?').get(productId, req.tenantId);
      if (!product) throw httpError(404, 'Sản phẩm không thuộc cửa hàng của bạn');

      const inserted = native.prepare(`
        INSERT INTO product_units (user_id, product_id, name, ratio, price)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.tenantId, productId, name, ratio, price);
      return { id: Number(inserted.lastInsertRowid), productId, name, ratio, price };
    });

    const result = createUnit.immediate();
    writeAudit(req, {
      action: 'pricing.unit.create',
      target: String(result.id),
      detail: { product_id: result.productId, name: result.name, ratio: result.ratio, price: result.price },
    });
    return res.json({ success: true, id: result.id });
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error.message || ''))) {
      return res.status(409).json({ error: 'Đơn vị này đã có cho sản phẩm' });
    }
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi tạo đơn vị quy đổi' });
  }
});

router.delete('/levels/:id', canWriteProducts, (req, res) => {
  let levelId;
  try {
    levelId = positiveId(req.params.id, 'Mức giá');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  try {
    const native = nativeDb();
    const removeLevel = native.transaction(() => {
      const level = native.prepare(
        'SELECT id, name, is_default FROM price_levels WHERE id = ? AND user_id = ?'
      ).get(levelId, req.tenantId);
      if (!level) throw httpError(404, 'Không tìm thấy mức giá');
      if (Number(level.is_default) === 1) throw httpError(400, 'Không xóa được mức giá mặc định');

      native.prepare('DELETE FROM product_prices WHERE level_id = ?').run(levelId);
      native.prepare(
        'UPDATE customers SET price_level_id = NULL WHERE price_level_id = ? AND user_id = ?'
      ).run(levelId, req.tenantId);
      const deleted = native.prepare(
        'DELETE FROM price_levels WHERE id = ? AND user_id = ?'
      ).run(levelId, req.tenantId);
      if (Number(deleted.changes) !== 1) throw httpError(409, 'Mức giá đã thay đổi bởi yêu cầu khác');
      return { id: levelId, name: level.name };
    });

    const result = removeLevel.immediate();
    writeAudit(req, {
      action: 'pricing.level.delete',
      target: String(result.id),
      detail: { name: result.name, atomic_cleanup: true },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi xóa mức giá' });
  }
});

module.exports = router;
