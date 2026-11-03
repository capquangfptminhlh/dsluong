'use strict';

const express = require('express');
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');
const { requireAuth, requireAnyPermission, writeAudit } = require('../middleware/auth');

const router = express.Router();
const canCloseShift = [requireAuth, requireAnyPermission('pos', 'finance')];

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function parseNonNegativeMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError(400, 'Tiền cuối ca không hợp lệ');
  }
  return amount;
}

router.post('/close', ...canCloseShift, (req, res) => {
  let closingCash;
  try {
    closingCash = parseNonNegativeMoney(req.body?.closing_cash);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const note = String(req.body?.note || '').trim().slice(0, 2000) || null;
  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  let branchId;
  let shiftClause;
  try {
    branchId = resolvePosBranch(req, req.body?.branch_id);
    const count = native.prepare(
      "SELECT COUNT(*) AS count FROM branches WHERE user_id = ? AND COALESCE(status, 'active') = 'active'",
    ).get(req.tenantId);
    shiftClause = Number(count?.count) === 1
      ? '(branch_id = ? OR branch_id IS NULL)'
      : 'branch_id = ?';
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }

  try {
    const closeTransaction = native.transaction(() => {
      const shift = native.prepare(
        `SELECT * FROM cashier_shifts
         WHERE user_id = ? AND status = 'open' AND ${shiftClause}
         ORDER BY opened_at DESC, id DESC LIMIT 1`,
      ).get(req.tenantId, branchId);
      if (!shift) throw httpError(404, 'Không có ca nào đang mở');

      const openingCash = Number(shift.opening_cash || 0);
      if (!Number.isFinite(openingCash) || openingCash < 0) {
        throw httpError(409, 'Tiền đầu ca hiện tại không hợp lệ; cần đối soát trước khi chốt ca');
      }

      const hasWatermark = shift.opening_cash_flow_id !== null
        && shift.opening_cash_flow_id !== undefined
        && Number.isInteger(Number(shift.opening_cash_flow_id))
        && Number(shift.opening_cash_flow_id) >= 0;
      const since = hasWatermark ? 'id > ?' : 'created_at >= ?';
      const sinceValue = hasWatermark ? Number(shift.opening_cash_flow_id) : shift.opened_at;

      const cashIn = Number(native.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM cash_flows
         WHERE user_id = ? AND ${shiftClause}
           AND transaction_type = 'in'
           AND payment_method = 'cash'
           AND ${since}`,
      ).get(req.tenantId, branchId, sinceValue)?.total || 0);

      const cashOut = Number(native.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM cash_flows
         WHERE user_id = ? AND ${shiftClause}
           AND transaction_type = 'out'
           AND payment_method = 'cash'
           AND ${since}`,
      ).get(req.tenantId, branchId, sinceValue)?.total || 0);

      if (!Number.isFinite(cashIn) || cashIn < 0 || !Number.isFinite(cashOut) || cashOut < 0) {
        throw httpError(409, 'Dòng tiền mặt của ca không hợp lệ; cần đối soát trước khi chốt ca');
      }

      const expectedCash = openingCash + cashIn - cashOut;
      const difference = closingCash - expectedCash;
      if (!Number.isFinite(expectedCash) || !Number.isFinite(difference)) {
        throw httpError(409, 'Số liệu chốt ca vượt giới hạn hợp lệ');
      }

      const updated = native.prepare(
        `UPDATE cashier_shifts
         SET closing_cash = ?, expected_cash = ?, difference = ?, cash_sales = ?, cash_out = ?,
             note = ?, status = 'closed', closed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ? AND ${shiftClause} AND status = 'open'`,
      ).run(
        closingCash,
        expectedCash,
        difference,
        cashIn,
        cashOut,
        note,
        shift.id,
        req.tenantId,
        branchId,
      );
      if (Number(updated.changes) !== 1) {
        throw httpError(409, 'Ca đã được chốt bởi một yêu cầu khác');
      }

      const closed = native.prepare(
        `SELECT id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, difference,
                cash_sales, cash_out, status
         FROM cashier_shifts WHERE id = ? AND user_id = ?`,
      ).get(shift.id, req.tenantId);

      return {
        shiftId: Number(shift.id),
        branchId,
        openingCash,
        closingCash,
        expectedCash,
        difference,
        cashIn,
        cashOut,
        closedAt: closed?.closed_at || null,
      };
    });

    // IMMEDIATE obtains the SQLite writer boundary before reading the shift/cash-flow
    // snapshot. Any concurrent committed cash movement is therefore either fully before
    // this snapshot (and included) or fully after the shift is closed, never in-between.
    const result = closeTransaction.immediate();

    writeAudit(req, {
      action: 'shift.close',
      target: String(result.shiftId),
      detail: {
        opening: result.openingCash,
        expected: result.expectedCash,
        closing: result.closingCash,
        difference: result.difference,
        cash_in: result.cashIn,
        cash_out: result.cashOut,
        branch_id: result.branchId,
        closed_at: result.closedAt,
      },
    });

    return res.json({
      success: true,
      expected_cash: result.expectedCash,
      closing_cash: result.closingCash,
      difference: result.difference,
      cash_sales: result.cashIn,
      cash_out: result.cashOut,
      branch_id: result.branchId,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi chốt ca' });
  }
});

module.exports = router;
