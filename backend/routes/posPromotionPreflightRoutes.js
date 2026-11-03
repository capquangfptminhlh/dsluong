'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const { formatBusinessDate } = require('../utils/businessDate');

const router = express.Router();
const canSell = requireAnyPermission('pos');

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
});

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw httpError(400, `${label} không hợp lệ`);
  return number;
}

function finiteNonNegative(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw httpError(409, `${label} của khuyến mãi không hợp lệ`);
  return number;
}

function canApplyManualDiscount(user) {
  if (!user) return false;
  if (user.actorType === 'owner' || user.role === 'superadmin') return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return permissions.includes('promotions');
}

function hasPromotionId(body) {
  return body?.promotion_id !== undefined
    && body?.promotion_id !== null
    && String(body.promotion_id).trim() !== '';
}

function assertManualDiscountPermission(req) {
  if (canApplyManualDiscount(req.user)) return;

  const cart = Array.isArray(req.body?.cart) ? req.body.cart : [];
  const hasLineDiscount = cart.some((item) => Number(item?.discount || 0) > 0);
  if (hasLineDiscount) {
    throw httpError(403, 'Nhân viên không có quyền giảm giá thủ công theo dòng hàng.');
  }

  const orderDiscount = Number(req.body?.discount || 0);
  if (!hasPromotionId(req.body) && orderDiscount > 0) {
    throw httpError(403, 'Nhân viên không có quyền giảm giá thủ công cho đơn hàng.');
  }
}

async function authoritativeSubtotal(userId, cart) {
  if (!Array.isArray(cart) || cart.length === 0) throw httpError(400, 'Giỏ hàng trống.');

  let subtotal = 0;
  for (const input of cart) {
    const quantity = finitePositive(input?.quantity, 'Số lượng');
    const lineDiscount = finiteNonNegative(input?.discount, 'Giảm giá dòng');
    let unitPrice;

    if (input?.combo_id) {
      const comboId = Number(input.combo_id);
      if (!Number.isInteger(comboId) || comboId <= 0) throw httpError(400, 'Combo không hợp lệ');
      const combo = await get('SELECT id, price FROM combos WHERE id = ? AND user_id = ?', [comboId, userId]);
      if (!combo) throw httpError(403, 'Giỏ hàng chứa combo không thuộc cửa hàng của bạn.');
      unitPrice = finiteNonNegative(combo.price, 'Giá combo');
    } else {
      const productId = Number(input?.id);
      if (!Number.isInteger(productId) || productId <= 0) throw httpError(400, 'Sản phẩm không hợp lệ');
      const product = await get('SELECT id, price FROM products WHERE id = ? AND user_id = ?', [productId, userId]);
      if (!product) throw httpError(403, 'Giỏ hàng chứa sản phẩm không thuộc cửa hàng của bạn.');
      unitPrice = finiteNonNegative(product.price, 'Giá sản phẩm');

      if (input?.unit_name) {
        const unit = await get(
          `SELECT price FROM product_units
           WHERE user_id = ? AND product_id = ? AND name = ?`,
          [userId, productId, String(input.unit_name)],
        );
        if (!unit) throw httpError(400, `Đơn vị "${input.unit_name}" không hợp lệ cho sản phẩm.`);
        unitPrice = finiteNonNegative(unit.price, 'Giá đơn vị');
      }
    }

    const gross = unitPrice * quantity;
    if (!Number.isFinite(gross)) throw httpError(400, 'Giá trị dòng hàng vượt giới hạn hợp lệ');
    if (lineDiscount > gross) throw httpError(400, 'Giảm giá dòng lớn hơn giá trị dòng');
    subtotal += gross - lineDiscount;
    if (!Number.isFinite(subtotal)) throw httpError(400, 'Tổng tiền hàng vượt giới hạn hợp lệ');
  }

  return subtotal;
}

router.post('/checkout', requireAuth, canSell, async (req, res, next) => {
  try {
    assertManualDiscountPermission(req);

    if (!hasPromotionId(req.body)) {
      return next();
    }

    const promotionId = Number(req.body.promotion_id);
    if (!Number.isInteger(promotionId) || promotionId <= 0) throw httpError(400, 'Khuyến mãi không hợp lệ');

    const subtotal = await authoritativeSubtotal(req.tenantId, req.body.cart);
    const promo = await get(
      `SELECT id, name, min_order_value, discount_percent, discount_amount, status, start_date, end_date
       FROM promotions WHERE id = ? AND user_id = ?`,
      [promotionId, req.tenantId],
    );
    if (!promo) throw httpError(403, 'Khuyến mãi không thuộc cửa hàng hiện tại.');

    const minOrder = finiteNonNegative(promo.min_order_value, 'Giá trị đơn tối thiểu');
    const percent = finiteNonNegative(promo.discount_percent, 'Phần trăm giảm');
    const amount = finiteNonNegative(promo.discount_amount, 'Số tiền giảm');
    if (percent > 100) throw httpError(409, 'Phần trăm giảm của khuyến mãi phải từ 0 đến 100');
    if (promo.status && String(promo.status).toUpperCase() !== 'ACTIVE') throw httpError(409, 'Khuyến mãi hiện không hoạt động.');

    const today = formatBusinessDate();
    const startDate = String(promo.start_date || '').trim();
    const endDate = String(promo.end_date || '').trim();
    if (startDate && startDate > today) throw httpError(409, 'Khuyến mãi chưa đến ngày áp dụng.');
    if (endDate && endDate < today) throw httpError(409, 'Khuyến mãi đã hết hạn.');
    if (subtotal < minOrder) throw httpError(409, `Đơn hàng chưa đạt mức tối thiểu của khuyến mãi (${minOrder}).`);

    const percentDiscount = Math.round(subtotal * percent / 100);
    const authoritativeDiscount = Math.min(Math.max(percentDiscount, amount), subtotal);
    if (!Number.isFinite(authoritativeDiscount)) throw httpError(409, 'Số giảm của khuyến mãi không hợp lệ');

    // Selected-promotion discount is always recomputed from tenant-owned promotion data.
    // Manual line/order discounts are allowed only for owner/superadmin or staff granted
    // the existing `promotions` permission in HRM.
    req.body.discount = authoritativeDiscount;
    return next();
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Khuyến mãi không hợp lệ' });
  }
});

module.exports = router;
