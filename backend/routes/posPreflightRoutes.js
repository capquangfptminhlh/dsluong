'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');
const { requireAuth, requireAnyPermission } = require('../middleware/auth');

const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
const fnbUnitName = (sessionId) => `__FNB_${Number(sessionId)}`;
const isInternalFnbUnit = (value) => String(value || '').startsWith('__FNB_');

router.post('/checkout', requireAuth, requireAnyPermission('pos'), async (req, res, next) => {
  const cart = Array.isArray(req.body?.cart) ? req.body.cart : [];
  const rawSessionId = req.body?.fnb_session_id;
  const hasSessionId = rawSessionId !== undefined && rawSessionId !== null && String(rawSessionId).trim() !== '';

  try {
    if (!hasSessionId) {
      if (cart.some((item) => isInternalFnbUnit(item?.unit_name))) {
        return res.status(403).json({ error: 'Đơn vị giá nội bộ F&B chỉ được dùng qua phiên F&B hợp lệ.' });
      }
      return next();
    }

    const sessionId = Number(rawSessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Phiên F&B không hợp lệ.' });
    }
    if (!cart.length) return res.status(400).json({ error: 'Giỏ F&B trống.' });
    if (req.body?.promotion_id || Number(req.body?.discount || 0) !== 0) {
      return res.status(409).json({ error: 'Thanh toán F&B snapshot không nhận thêm giảm giá/khuyến mãi.' });
    }
    if (cart.some((item) => item?.combo_id || item?.unit_name || Number(item?.discount || 0) !== 0)) {
      return res.status(409).json({ error: 'Giỏ F&B chứa dữ liệu giá/đơn vị không hợp lệ.' });
    }

    const session = await get(
      `SELECT s.id, r.branch_id FROM fnb_sessions s
       JOIN rooms r ON r.id = s.room_id AND r.user_id = s.user_id
       WHERE s.id = ? AND s.user_id = ? AND s.status = 'open'`,
      [sessionId, req.tenantId],
    );
    if (!session) return res.status(404).json({ error: 'Không tìm thấy phiên F&B đang mở của cửa hàng.' });
    const targetBranchId = resolvePosBranch(req, session.branch_id);
    if (req.body?.branch_id !== undefined && req.body?.branch_id !== null
        && Number(req.body.branch_id) !== targetBranchId) {
      return res.status(403).json({ error: 'Chi nhánh thanh toán không khớp bàn F&B.' });
    }
    // Cashier uses the room's authoritative location even with no client branch_id.
    req.body.branch_id = targetBranchId;

    const expectedRows = await all(
      `SELECT product_id, quantity FROM fnb_session_items WHERE session_id = ? ORDER BY product_id ASC`,
      [sessionId],
    );
    if (!expectedRows.length) return res.status(409).json({ error: 'Phiên F&B chưa có món để thanh toán.' });

    const expected = new Map();
    for (const row of expectedRows) {
      const productId = Number(row.product_id);
      const quantity = Number(row.quantity);
      if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0 || expected.has(productId)) {
        return res.status(409).json({ error: 'Dữ liệu món trong phiên F&B không hợp lệ; cần lưu lại order.' });
      }
      expected.set(productId, quantity);
    }

    const actual = new Map();
    for (const item of cart) {
      const productId = Number(item?.id);
      const quantity = Number(item?.quantity);
      if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(quantity) || quantity <= 0 || actual.has(productId)) {
        return res.status(400).json({ error: 'Giỏ F&B có món trùng hoặc số lượng không hợp lệ.' });
      }
      actual.set(productId, quantity);
    }
    if (actual.size !== expected.size) return res.status(409).json({ error: 'Giỏ thanh toán không khớp phiên F&B đã lưu.' });
    for (const [productId, quantity] of expected) {
      if (!actual.has(productId) || Math.abs(Number(actual.get(productId)) - quantity) > 1e-9) {
        return res.status(409).json({ error: 'Số món/số lượng thanh toán không khớp phiên F&B đã lưu.' });
      }
    }

    const unitName = fnbUnitName(sessionId);
    const snapshots = await all(
      `SELECT product_id, price, ratio FROM product_units
       WHERE user_id = ? AND name = ? ORDER BY product_id ASC`,
      [req.tenantId, unitName],
    );
    if (snapshots.length !== expected.size) return res.status(409).json({ error: 'Snapshot giá F&B chưa đầy đủ; hãy lưu lại order.' });
    for (const row of snapshots) {
      const price = Number(row.price);
      const ratio = Number(row.ratio);
      if (!expected.has(Number(row.product_id)) || !Number.isFinite(price) || price < 0 || Math.abs(ratio - 1) > 1e-9) {
        return res.status(409).json({ error: 'Snapshot giá F&B không hợp lệ; hãy lưu lại order.' });
      }
    }

    req.body.cart = cart.map((item) => ({ ...item, unit_name: unitName }));
    return next();
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Không thể xác minh phiên F&B.' });
  }
});

router.post('/:id/cancel', requireAuth, requireAnyPermission('orders', 'pos'), (req, res, next) => {
  db.get(
    `SELECT COUNT(*) AS count
     FROM returns
     WHERE user_id = ? AND order_id = ?`,
    [req.tenantId, req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (Number(row?.count) > 0) {
        return res.status(409).json({
          error: 'Đơn đã có phiếu trả hàng. Không thể hủy toàn bộ vì sẽ hoàn tồn hai lần; hãy tiếp tục xử lý bằng luồng trả hàng.',
        });
      }
      return next();
    },
  );
});

module.exports = router;
