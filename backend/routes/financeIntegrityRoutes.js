'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolvePosBranch, requireCompanyFinanceAccess } = require('../utils/branchAccess');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);

const PAYMENT_METHODS = new Set(['cash', 'bank', 'card', 'other']);
const httpError = (status, message) => Object.assign(new Error(message), { status });

function normalizePaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  return PAYMENT_METHODS.has(method) ? method : 'unknown';
}

/**
 * Integrity boundary for POST /api/finance/debts.
 * Manual debt creation stores only a normalized principal and partner identity.
 * It must not create cash-flow or payment evidence until an actual payment occurs.
 */
router.post('/debts', requirePermission('debt'), requireCompanyFinanceAccess, (req, res) => {
  const userId = req.tenantId;
  const type = String(req.body?.type || '').trim().toLowerCase();
  if (!['receivable', 'payable'].includes(type)) {
    return res.status(400).json({ error: 'Loại công nợ không hợp lệ' });
  }

  const partnerName = String(req.body?.partner_name || '').trim();
  if (!partnerName) {
    return res.status(400).json({ error: 'Tên đối tác không được để trống' });
  }

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Số tiền công nợ phải là số hữu hạn lớn hơn 0' });
  }

  const dueDate = String(req.body?.due_date || '').trim() || null;
  const notes = String(req.body?.notes || '').trim() || null;

  try {
    const native = db._native;
    if (!native || typeof native.prepare !== 'function') {
      throw new Error('SQLite transaction engine unavailable');
    }

    const inserted = native.prepare(
      `INSERT INTO debts (user_id, type, partner_name, amount, due_date, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, type, partnerName, amount, dueDate, notes);
    const debtId = Number(inserted.lastInsertRowid);

    writeAudit(req, {
      action: 'debt.create',
      target: String(debtId),
      detail: { type, partner_name: partnerName, amount, due_date: dueDate },
    });

    return res.json({
      success: true,
      id: debtId,
      type,
      partner_name: partnerName,
      amount,
      due_date: dueDate,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Integrity boundary for POST /api/finance/debts/:id/pay.
 *
 * A debt payment is one accounting event. Debt balance, cash-flow and payment evidence
 * therefore live in one SQLite IMMEDIATE transaction. The handler also serializes
 * concurrent payments and never invents a cash payment method for legacy clients.
 */
router.post('/debts/:id/pay', requirePermission('debt'), requireCompanyFinanceAccess, (req, res) => {
  const userId = req.tenantId;
  const debtId = Number(req.params.id);
  if (!Number.isInteger(debtId) || debtId <= 0) {
    return res.status(400).json({ error: 'Công nợ không hợp lệ' });
  }

  const paidInput = Number(req.body?.paid_amount);
  if (!Number.isFinite(paidInput) || paidInput <= 0) {
    return res.status(400).json({ error: 'Số tiền thanh toán phải là số hữu hạn lớn hơn 0' });
  }

  const paymentReference = String(req.body?.payment_reference || '').trim() || null;
  const requestedPaidAt = String(req.body?.paid_at || '').trim() || null;

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') {
      throw new Error('SQLite transaction engine unavailable');
    }

    const payTransaction = native.transaction(() => {
      const debt = native.prepare(
        'SELECT * FROM debts WHERE id = ? AND user_id = ?'
      ).get(debtId, userId);
      if (!debt) throw httpError(404, 'Không tìm thấy công nợ');
      if (!['receivable', 'payable'].includes(debt.type)) {
        throw httpError(409, 'Loại công nợ hiện tại không hợp lệ');
      }

      const amount = Number(debt.amount);
      const paidBefore = Number(debt.paid_amount || 0);
      if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(paidBefore) || paidBefore < 0 || paidBefore > amount) {
        throw httpError(409, 'Số liệu công nợ hiện tại không hợp lệ; cần đối soát trước khi thanh toán');
      }

      const remainingBefore = amount - paidBefore;
      if (remainingBefore <= 0 || debt.status === 'paid') {
        throw httpError(409, 'Công nợ này đã được thanh toán đủ');
      }
      if (paidInput > remainingBefore) {
        throw httpError(409, `Số tiền thanh toán vượt số còn lại ${remainingBefore}`);
      }

      const paidAfter = paidBefore + paidInput;
      if (!Number.isFinite(paidAfter) || paidAfter > amount) {
        throw httpError(409, 'Số tiền thanh toán mới vượt giới hạn công nợ');
      }
      const remainingAfter = Math.max(0, amount - paidAfter);
      const newStatus = remainingAfter <= 0 ? 'paid' : 'partial';
      const paymentMethod = normalizePaymentMethod(req.body?.payment_method);
      const paidAt = requestedPaidAt || new Date().toISOString();
      const transactionType = debt.type === 'receivable' ? 'in' : 'out';
      // Keep the established DEBT-<id> accounting key because the return/refund
      // reconciliation flow uses it to find later debt collections. The external
      // bank/card transaction id belongs in payment_evidence.transaction_reference.
      const referenceId = `DEBT-${debt.id}`;

      const updated = native.prepare(
        `UPDATE debts
         SET paid_amount = ?, status = ?
         WHERE id = ? AND user_id = ? AND paid_amount = ?`
      ).run(paidAfter, newStatus, debt.id, userId, paidBefore);
      if (Number(updated.changes) !== 1) {
        throw httpError(409, 'Công nợ đã thay đổi bởi yêu cầu khác, vui lòng tải lại');
      }

      const cashFlow = native.prepare(
        `INSERT INTO cash_flows
          (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
         VALUES (?, ?, 'debt_collection', ?, ?, ?, ?)`
      ).run(
        userId,
        transactionType,
        paidInput,
        paymentMethod,
        referenceId,
        `${debt.type === 'receivable' ? 'Thu' : 'Chi'} thanh toán công nợ: ${debt.partner_name}`,
      );
      const cashFlowId = Number(cashFlow.lastInsertRowid);
      const evidenceStatus = paymentMethod === 'unknown' ? 'NEEDS_METHOD' : 'RECORDED';

      native.prepare(
        `INSERT INTO payment_evidence
          (user_id, cash_flow_id, amount, payment_method, transaction_reference, paid_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId,
        cashFlowId,
        paidInput,
        paymentMethod,
        paymentReference,
        paidAt,
        evidenceStatus,
      );

      if (paymentMethod === 'unknown') {
        const finding = native.prepare(
          `INSERT INTO compliance_findings
            (user_id, code, severity, subject_type, subject_id, status, message, detail_json)
           VALUES (?, 'DEBT_PAYMENT_METHOD_MISSING', 'REVIEW', 'debt', ?, 'OPEN', ?, ?)`
        ).run(
          userId,
          String(debt.id),
          `Thanh toán công nợ #${debt.id} cho ${debt.partner_name} chưa xác định phương thức thanh toán.`,
          JSON.stringify({ debt_id: debt.id, amount: paidInput, cash_flow_id: cashFlowId, reference_id: referenceId }),
        );
        native.prepare(
          `INSERT OR IGNORE INTO audit_cases (user_id, finding_id, status, note)
           VALUES (?, ?, 'OPEN', 'Tự tạo từ DEBT_PAYMENT_METHOD_MISSING')`
        ).run(userId, Number(finding.lastInsertRowid));
      }

      return {
        debtId: debt.id,
        debtType: debt.type,
        partnerName: debt.partner_name,
        paidAmount: paidInput,
        totalPaid: paidAfter,
        remainingAmount: remainingAfter,
        newStatus,
        paymentMethod,
        evidenceStatus,
        cashFlowId,
        referenceId,
      };
    });

    const result = payTransaction.immediate();
    writeAudit(req, {
      action: 'debt.pay',
      target: String(result.debtId),
      detail: {
        paid_amount: result.paidAmount,
        total_paid: result.totalPaid,
        remaining_amount: result.remainingAmount,
        new_status: result.newStatus,
        payment_method: result.paymentMethod,
        reference_id: result.referenceId,
      },
    });

    return res.json({
      success: true,
      new_status: result.newStatus,
      paid_amount: result.paidAmount,
      total_paid: result.totalPaid,
      remaining_amount: result.remainingAmount,
      payment_method: result.paymentMethod,
      payment_evidence_status: result.evidenceStatus,
      reference_id: result.referenceId,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Integrity boundary for POST /api/finance/cash-flows.
 *
 * A manual receipt/payment and its payment evidence are one accounting event. Both
 * are committed together. Missing legacy payment method is recorded as unknown and
 * surfaced for review instead of silently fabricating a cash transaction.
 */
router.post('/cash-flows', requirePermission('finance'), (req, res) => {
  const userId = req.tenantId;
  let branchId = null;
  try {
    if (req.user.actorType === 'staff') {
      branchId = resolvePosBranch(req, req.body?.branch_id);
    } else if (req.body?.branch_id !== null && req.body?.branch_id !== undefined && req.body?.branch_id !== '') {
      branchId = resolvePosBranch(req, req.body.branch_id);
    } else {
      // Single-location shops must preserve their cash drawer accounting when
      // legacy clients omit branch_id. Multi-location owners may intentionally
      // leave it NULL to record shared/HQ costs.
      const activeBranches = db._native.prepare(
        "SELECT id FROM branches WHERE user_id = ? AND COALESCE(status, 'active') = 'active'",
      ).all(userId);
      if (activeBranches.length === 1) branchId = Number(activeBranches[0].id);
    }
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
  const transactionType = String(req.body?.transaction_type || '').trim().toLowerCase();
  if (!['in', 'out'].includes(transactionType)) {
    return res.status(400).json({ error: 'Loại thu/chi không hợp lệ' });
  }

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Số tiền phải là số hữu hạn lớn hơn 0' });
  }

  const category = String(req.body?.category || 'other').trim() || 'other';
  const notes = String(req.body?.notes || '').trim() || null;
  const paymentMethod = normalizePaymentMethod(req.body?.payment_method);
  const paymentReference = String(req.body?.payment_reference || '').trim() || null;
  const paidAt = String(req.body?.paid_at || '').trim() || new Date().toISOString();

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') {
      throw new Error('SQLite transaction engine unavailable');
    }

    const createTransaction = native.transaction(() => {
      // The salary payslip flow already posts to cashbook. Re-entering the same
      // external voucher here would double-count cash. Legacy salary entries
      // with different/unknown references still require manual reconciliation.
      if (transactionType === 'out' && paymentReference &&
          ['bank','cash'].includes(paymentMethod)) {
        const existingWage = native.prepare(`
          SELECT id FROM hrm_payroll_payments
          WHERE user_id=? AND payment_method=? AND payment_reference=? LIMIT 1
        `).get(userId,paymentMethod,paymentReference);
        if (existingWage) throw httpError(409,
          'Mã giao dịch này đã ghi nhận trả lương. Không được tạo thêm phiếu chi với cùng chứng từ');
        if(category==='salary'){
          const duplicateManual=native.prepare(`
            SELECT cf.id FROM cash_flows cf JOIN payment_evidence e
              ON e.cash_flow_id=cf.id AND e.user_id=cf.user_id
            WHERE cf.user_id=? AND cf.transaction_type='out'
              AND e.payment_method=? AND e.transaction_reference=? LIMIT 1
          `).get(userId,paymentMethod,paymentReference);
          if(duplicateManual) throw httpError(409,
            'Mã chứng từ đã tồn tại trong Sổ quỹ. Không được ghi chi lương hai lần');
        }
      }
      const referenceId = `${transactionType === 'in' ? 'PT' : 'PC'}${Date.now().toString().slice(-8)}`;
      const cashFlow = native.prepare(
        `INSERT INTO cash_flows
          (user_id, transaction_type, category, amount, payment_method, reference_id, notes, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(userId, transactionType, category, amount, paymentMethod, referenceId, notes, branchId);
      const cashFlowId = Number(cashFlow.lastInsertRowid);
      const evidenceStatus = paymentMethod === 'unknown' ? 'NEEDS_METHOD' : 'RECORDED';

      native.prepare(
        `INSERT INTO payment_evidence
          (user_id, cash_flow_id, amount, payment_method, transaction_reference, paid_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId,
        cashFlowId,
        amount,
        paymentMethod,
        paymentReference,
        paidAt,
        evidenceStatus,
      );

      if (paymentMethod === 'unknown') {
        const finding = native.prepare(
          `INSERT INTO compliance_findings
            (user_id, code, severity, subject_type, subject_id, status, message, detail_json)
           VALUES (?, 'CASH_FLOW_PAYMENT_METHOD_MISSING', 'REVIEW', 'cash_flow', ?, 'OPEN', ?, ?)`
        ).run(
          userId,
          String(cashFlowId),
          `Phiếu ${referenceId} có thu/chi tiền nhưng chưa xác định phương thức thanh toán.`,
          JSON.stringify({ cash_flow_id: cashFlowId, reference_id: referenceId, amount, transaction_type: transactionType }),
        );
        native.prepare(
          `INSERT OR IGNORE INTO audit_cases (user_id, finding_id, status, note)
           VALUES (?, ?, 'OPEN', 'Tự tạo từ CASH_FLOW_PAYMENT_METHOD_MISSING')`
        ).run(userId, Number(finding.lastInsertRowid));
      }

      return { cashFlowId, referenceId, paymentMethod, evidenceStatus, branchId };
    });

    const result = createTransaction.immediate();
    writeAudit(req, {
      action: transactionType === 'in' ? 'cash.in' : 'cash.out',
      target: result.referenceId,
      detail: {
        amount,
        category,
        notes,
        payment_method: result.paymentMethod,
        payment_reference: paymentReference,
        branch_id: result.branchId,
      },
    });

    return res.json({
      success: true,
      id: result.cashFlowId,
      reference_id: result.referenceId,
      payment_method: result.paymentMethod,
      payment_evidence_status: result.evidenceStatus,
      branch_id: result.branchId,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
