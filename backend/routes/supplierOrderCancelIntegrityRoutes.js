'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePermission('purchase'));

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * Integrity boundary for POST /api/supplier-orders/requests/:id/huy.
 *
 * Cancellation competes with receiving for the same ordered request. Both transitions
 * therefore serialize on SQLite IMMEDIATE transactions and claim the current state
 * inside the transaction. Only ordered -> cancelled is valid here.
 */
router.post('/requests/:id/huy', (req, res) => {
  const userId = req.tenantId;
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Đơn đặt hàng không hợp lệ' });
  }

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') {
      throw new Error('SQLite transaction engine unavailable');
    }

    const cancelRequest = native.transaction(() => {
      const request = native.prepare(
        'SELECT id, code, status, po_id FROM purchase_requests WHERE id = ? AND user_id = ?'
      ).get(requestId, userId);
      if (!request) throw httpError(404, 'Không tìm thấy đơn đặt hàng');

      if (request.status !== 'ordered') {
        if (request.status === 'received') throw httpError(409, 'Đơn đã nhận hàng, không hủy được');
        if (request.status === 'receiving') throw httpError(409, 'Đơn đang được nhận hàng, không thể hủy');
        if (request.status === 'cancelled') throw httpError(409, 'Đơn này đã hủy rồi');
        throw httpError(409, `Đơn đang ở trạng thái "${request.status}", không thể hủy`);
      }

      const claimed = native.prepare(
        `UPDATE purchase_requests
         SET status = 'cancelled'
         WHERE id = ? AND user_id = ? AND status = 'ordered'`
      ).run(request.id, userId);
      if (Number(claimed.changes) !== 1) {
        throw httpError(409, 'Đơn đã được xử lý bởi yêu cầu khác');
      }

      return { requestId: request.id, code: request.code };
    });

    const result = cancelRequest.immediate();
    writeAudit(req, {
      action: 'porder.cancel',
      target: result.code,
      detail: { request_id: result.requestId },
    });

    return res.json({ success: true, id: result.requestId, code: result.code, status: 'cancelled' });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
