'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * Integrity boundary for DELETE /api/suppliers/:id.
 *
 * Hard deletion is allowed only for an entirely unused supplier. Any purchase request,
 * purchase order or supplier return is accounting/audit history and must remain linked
 * to an existing supplier identity. Checks and delete share one IMMEDIATE transaction,
 * so concurrent supplier-order creation cannot race the precheck.
 */
router.delete('/:id', requirePermission('suppliers'), (req, res) => {
  const userId = req.tenantId;
  const supplierId = Number(req.params.id);
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return res.status(400).json({ error: 'Nhà cung cấp không hợp lệ' });
  }

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') {
      throw new Error('SQLite transaction engine unavailable');
    }

    const deleteSupplier = native.transaction(() => {
      const supplier = native.prepare(
        'SELECT id, name FROM suppliers WHERE id = ? AND user_id = ?'
      ).get(supplierId, userId);
      if (!supplier) throw httpError(404, 'Không tìm thấy NCC');

      const requestCount = Number(native.prepare(
        'SELECT COUNT(*) AS c FROM purchase_requests WHERE supplier_id = ? AND user_id = ?'
      ).get(supplier.id, userId)?.c || 0);
      const purchaseCount = Number(native.prepare(
        'SELECT COUNT(*) AS c FROM purchase_orders WHERE supplier_id = ? AND user_id = ?'
      ).get(supplier.id, userId)?.c || 0);
      const returnCount = Number(native.prepare(
        'SELECT COUNT(*) AS c FROM supplier_returns WHERE supplier_id = ? AND user_id = ?'
      ).get(supplier.id, userId)?.c || 0);

      if (requestCount > 0 || purchaseCount > 0 || returnCount > 0) {
        throw httpError(
          409,
          `NCC đã có lịch sử giao dịch (đơn đặt: ${requestCount}, phiếu nhập: ${purchaseCount}, phiếu trả: ${returnCount}), không thể xóa cứng.`
        );
      }

      const deleted = native.prepare(
        'DELETE FROM suppliers WHERE id = ? AND user_id = ?'
      ).run(supplier.id, userId);
      if (Number(deleted.changes) !== 1) {
        throw httpError(409, 'Nhà cung cấp đã thay đổi bởi yêu cầu khác');
      }

      return { supplierId: supplier.id, name: supplier.name };
    });

    const result = deleteSupplier.immediate();
    writeAudit(req, {
      action: 'supplier.delete',
      target: String(result.supplierId),
      detail: { name: result.name, hard_delete: true, unused_only: true },
    });
    return res.json({ success: true, id: result.supplierId });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
