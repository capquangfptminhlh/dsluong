'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner, writeAudit } = require('../middleware/auth');

const router = express.Router();

router.post('/commissions', requireAuth, requireOwner, (req, res) => {
  const staffId = Number(req.body?.staff_id);
  const amount = Number(req.body?.amount);
  const hasOrderId = req.body?.order_id !== undefined
    && req.body?.order_id !== null
    && String(req.body.order_id).trim() !== '';
  const orderId = hasOrderId ? Number(req.body.order_id) : null;

  if (!Number.isInteger(staffId) || staffId <= 0) {
    return res.status(400).json({ error: 'Nhân viên không hợp lệ' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Số tiền hoa hồng phải lớn hơn 0' });
  }
  if (hasOrderId && (!Number.isInteger(orderId) || orderId <= 0)) {
    return res.status(400).json({ error: 'Mã đơn không hợp lệ' });
  }

  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  try {
    const insertCommission = native.transaction(() => {
      const staff = native.prepare(
        'SELECT id, name FROM staff WHERE id = ? AND user_id = ?'
      ).get(staffId, req.tenantId);
      if (!staff) {
        const error = new Error('Không tìm thấy nhân viên');
        error.status = 404;
        throw error;
      }

      if (hasOrderId) {
        const order = native.prepare(
          'SELECT id, order_code, status FROM pos_orders WHERE id = ? AND user_id = ?'
        ).get(orderId, req.tenantId);
        if (!order) {
          const error = new Error('Không tìm thấy đơn hàng của cửa hàng');
          error.status = 404;
          throw error;
        }
        if (String(order.status || '').toLowerCase() === 'cancelled') {
          const error = new Error('Đơn đã hủy; không thể ghi hoa hồng mới');
          error.status = 409;
          throw error;
        }

        const existing = native.prepare(
          'SELECT id FROM commissions WHERE staff_id = ? AND order_id = ? LIMIT 1'
        ).get(staffId, orderId);
        if (existing) {
          const error = new Error('Hoa hồng cho nhân viên và đơn hàng này đã được ghi nhận');
          error.status = 409;
          throw error;
        }
      }

      const inserted = native.prepare(
        'INSERT INTO commissions (staff_id, order_id, amount) VALUES (?, ?, ?)'
      ).run(staffId, hasOrderId ? orderId : null, amount);

      return {
        id: Number(inserted.lastInsertRowid),
        staffName: staff.name,
      };
    });

    // IMMEDIATE serializes duplicate staff+order submissions before the existence check.
    // Manual commissions without an order remain intentionally repeatable adjustments.
    const result = insertCommission.immediate();

    writeAudit(req, {
      action: 'staff.commission',
      target: String(staffId),
      detail: {
        commission_id: result.id,
        staff_name: result.staffName,
        amount,
        order_id: hasOrderId ? orderId : null,
      },
    });

    return res.json({ success: true, id: result.id });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi ghi hoa hồng' });
  }
});

module.exports = router;
