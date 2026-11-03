'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

const router = express.Router();
const canManagePromotions = [requireAuth, requirePermission('promotions')];

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function nonNegativeFinite(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw httpError(400, `${label} không hợp lệ`);
  return number;
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, `${label} không hợp lệ`);
  return id;
}

router.post('/', ...canManagePromotions, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần tên chương trình khuyến mãi' });

  let minOrderValue;
  let discountPercent;
  let discountAmount;
  try {
    minOrderValue = nonNegativeFinite(req.body?.min_order_value, 'Giá trị đơn tối thiểu');
    discountPercent = nonNegativeFinite(req.body?.discount_percent, 'Phần trăm giảm');
    discountAmount = nonNegativeFinite(req.body?.discount_amount, 'Số tiền giảm');
    if (discountPercent > 100) throw httpError(400, 'Phần trăm giảm phải từ 0 đến 100');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const native = db._native;
  if (!native || typeof native.prepare !== 'function') {
    return res.status(500).json({ error: 'SQLite engine unavailable' });
  }

  try {
    const result = native.prepare(`
      INSERT INTO promotions (user_id, name, min_order_value, discount_percent, discount_amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.tenantId, name, minOrderValue, discountPercent, discountAmount);

    const id = Number(result.lastInsertRowid);
    writeAudit(req, {
      action: 'promo.create',
      target: String(id),
      detail: { name, min_order_value: minOrderValue, discount_percent: discountPercent, discount_amount: discountAmount },
    });
    return res.json({ success: true, id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', ...canManagePromotions, (req, res) => {
  let promotionId;
  try {
    promotionId = positiveId(req.params.id, 'Khuyến mãi');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  try {
    const removePromotion = native.transaction(() => {
      const promo = native.prepare(
        `SELECT id, name, COALESCE(usage_count, 0) AS usage_count
         FROM promotions WHERE id = ? AND user_id = ?`
      ).get(promotionId, req.tenantId);
      if (!promo) throw httpError(404, 'Không tìm thấy khuyến mãi');

      const history = native.prepare(
        `SELECT COUNT(*) AS count
         FROM pos_orders WHERE user_id = ? AND promotion_id = ?`
      ).get(req.tenantId, promotionId);
      const orderCount = Number(history?.count || 0);
      const usageCount = Number(promo.usage_count || 0);
      if (orderCount > 0 || usageCount > 0) {
        throw httpError(409, 'Khuyến mãi đã phát sinh đơn hàng; không thể xóa lịch sử. Hãy ngừng sử dụng chương trình này.');
      }

      const deleted = native.prepare(
        'DELETE FROM promotions WHERE id = ? AND user_id = ?'
      ).run(promotionId, req.tenantId);
      if (Number(deleted.changes) !== 1) throw httpError(409, 'Khuyến mãi đã thay đổi bởi yêu cầu khác');
      return { id: promotionId, name: promo.name };
    });

    const removed = removePromotion.immediate();
    writeAudit(req, { action: 'promo.delete', target: String(removed.id), detail: { name: removed.name, unused_only: true } });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi xóa khuyến mãi' });
  }
});

module.exports = router;
