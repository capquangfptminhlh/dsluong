'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePermission('purchase'));

const PAYMENT_METHODS = new Set(['cash', 'bank', 'card', 'other']);
const httpError = (status, message) => Object.assign(new Error(message), { status });

function normalizePaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  return PAYMENT_METHODS.has(method) ? method : 'unknown';
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Integrity boundary for POST /api/supplier-orders/returns.
 *
 * Invariants:
 * - tenant/branch/product/supplier are resolved again inside one IMMEDIATE transaction;
 * - duplicate product rows are aggregated before stock validation;
 * - return value is always products.cost_price from the server, never client cost_price;
 * - branch stock, product total stock, supplier totals, payable principal and refund evidence
 *   commit exactly once or roll back together;
 * - supplier money actually received back is recorded with the submitted method, never
 *   fabricated as cash. Legacy clients without a method become `unknown` + audit finding.
 */
router.post('/returns', (req, res) => {
  const userId = req.tenantId;
  const rawItems = req.body?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: 'Chọn ít nhất một mặt hàng để trả' });
  }

  const branchId = Number(req.body?.branch_id);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return res.status(400).json({ error: 'Kho trả hàng không hợp lệ' });
  }

  let supplierId = null;
  if (req.body?.supplier_id !== null && req.body?.supplier_id !== undefined && String(req.body.supplier_id).trim() !== '') {
    supplierId = Number(req.body.supplier_id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return res.status(400).json({ error: 'Nhà cung cấp không hợp lệ' });
    }
  }

  const requested = new Map();
  for (const item of rawItems) {
    const productId = Number(item?.product_id);
    const quantity = finitePositive(item?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Có sản phẩm trả không hợp lệ' });
    }
    if (quantity === null) {
      return res.status(400).json({ error: 'Số lượng trả phải là số hữu hạn lớn hơn 0' });
    }
    const nextQuantity = (requested.get(productId) || 0) + quantity;
    if (!Number.isFinite(nextQuantity)) {
      return res.status(400).json({ error: 'Tổng số lượng trả vượt giới hạn hợp lệ' });
    }
    requested.set(productId, nextQuantity);
  }

  const reason = String(req.body?.reason || '').trim() || null;
  const refundReference = String(req.body?.refund_reference || '').trim() || null;
  const requestedRefundAt = String(req.body?.refund_at || '').trim() || null;

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') {
      throw new Error('SQLite transaction engine unavailable');
    }

    const returnTransaction = native.transaction(() => {
      const branch = native.prepare(
        'SELECT id, name FROM branches WHERE id = ? AND user_id = ?'
      ).get(branchId, userId);
      if (!branch) throw httpError(404, 'Không tìm thấy chi nhánh thuộc cửa hàng của bạn');

      let supplier = null;
      if (supplierId) {
        supplier = native.prepare(
          'SELECT * FROM suppliers WHERE id = ? AND user_id = ?'
        ).get(supplierId, userId);
        if (!supplier) throw httpError(404, 'Không tìm thấy nhà cung cấp');
      }

      const getProduct = native.prepare(
        'SELECT id, name, stock, cost_price FROM products WHERE id = ? AND user_id = ?'
      );
      const getBranchStock = native.prepare(
        'SELECT COALESCE(stock, 0) AS stock FROM branch_stock WHERE branch_id = ? AND product_id = ?'
      );

      const lines = [];
      let total = 0;
      for (const [productId, quantity] of requested.entries()) {
        const product = getProduct.get(productId, userId);
        if (!product) throw httpError(403, 'Có sản phẩm không thuộc cửa hàng của bạn');

        const costPrice = Number(product.cost_price);
        if (!Number.isFinite(costPrice) || costPrice < 0) {
          throw httpError(409, `Giá vốn hệ thống của "${product.name}" không hợp lệ`);
        }

        const stockRow = getBranchStock.get(branch.id, productId);
        const available = Number(stockRow?.stock || 0);
        if (!Number.isFinite(available) || available < quantity) {
          throw httpError(409, `"${product.name}" chỉ còn ${Number.isFinite(available) ? available : 0} trong kho, không đủ trả ${quantity}`);
        }

        const lineTotal = quantity * costPrice;
        if (!Number.isFinite(lineTotal)) {
          throw httpError(409, `Giá trị trả của "${product.name}" vượt giới hạn hợp lệ`);
        }
        total += lineTotal;
        if (!Number.isFinite(total)) throw httpError(409, 'Tổng giá trị trả hàng vượt giới hạn hợp lệ');

        lines.push({
          product_id: productId,
          product_name: product.name,
          quantity,
          cost_price: costPrice,
          line_total: lineTotal,
        });
      }

      const debtBefore = supplier ? Math.max(0, Number(supplier.total_debt) || 0) : 0;
      const purchasedBefore = supplier ? Math.max(0, Number(supplier.total_purchased) || 0) : 0;
      const debtReduction = supplier ? Math.min(debtBefore, total) : 0;
      const refundAmount = supplier ? Math.max(0, total - debtReduction) : 0;
      const refundMethod = refundAmount > 0 ? normalizePaymentMethod(req.body?.refund_method) : null;
      const refundAt = refundAmount > 0 ? (requestedRefundAt || new Date().toISOString()) : null;
      const code = `TH-NCC${Date.now().toString().slice(-7)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

      const returnRow = native.prepare(
        `INSERT INTO supplier_returns (user_id, code, supplier_id, supplier_name, branch_id, total_amount, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId,
        code,
        supplier ? supplier.id : null,
        supplier ? supplier.name : null,
        branch.id,
        total,
        reason,
      );
      const returnId = Number(returnRow.lastInsertRowid);

      const insertItem = native.prepare(
        `INSERT INTO supplier_return_items (return_id, product_id, product_name, quantity, cost_price)
         VALUES (?, ?, ?, ?, ?)`
      );
      const reduceBranchStock = native.prepare(
        `UPDATE branch_stock
         SET stock = stock - ?
         WHERE branch_id = ? AND product_id = ? AND stock >= ?`
      );
      const syncTotalStock = native.prepare(
        `UPDATE products
         SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stock WHERE product_id = ?)
         WHERE id = ? AND user_id = ?`
      );
      const insertLog = native.prepare(
        `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
         VALUES (?, ?, 'OUT', ?, ?, ?)`
      );

      for (const line of lines) {
        insertItem.run(returnId, line.product_id, line.product_name, line.quantity, line.cost_price);
        const stockUpdate = reduceBranchStock.run(line.quantity, branch.id, line.product_id, line.quantity);
        if (Number(stockUpdate.changes) !== 1) {
          throw httpError(409, `Tồn kho "${line.product_name}" đã thay đổi, vui lòng kiểm tra lại`);
        }
        syncTotalStock.run(line.product_id, line.product_id, userId);
        insertLog.run(userId, line.product_id, line.quantity, `Trả NCC ${code}`, branch.id);
      }

      let debtLedgerUnmatched = 0;
      let refundEvidenceStatus = null;
      let cashFlowId = null;

      if (supplier) {
        const nextDebt = Math.max(0, debtBefore - debtReduction);
        const nextPurchased = Math.max(0, purchasedBefore - total);
        native.prepare(
          `UPDATE suppliers SET total_debt = ?, total_purchased = ? WHERE id = ? AND user_id = ?`
        ).run(nextDebt, nextPurchased, supplier.id, userId);

        // A supplier return reduces the payable principal; it is not a cash payment.
        // Preserve paid_amount as actual money already paid and shrink amount only by the
        // still-outstanding principal credited by the supplier.
        let remainingReduction = debtReduction;
        if (remainingReduction > 0) {
          const payableRows = native.prepare(
            `SELECT * FROM debts
             WHERE user_id = ? AND type = 'payable' AND partner_name = ? AND amount > paid_amount
             ORDER BY id ASC`
          ).all(userId, supplier.name);
          const updateDebt = native.prepare(
            `UPDATE debts SET amount = ?, status = ? WHERE id = ? AND user_id = ?`
          );

          for (const debt of payableRows) {
            if (remainingReduction <= 0) break;
            const amount = Math.max(0, Number(debt.amount) || 0);
            const paid = Math.max(0, Number(debt.paid_amount) || 0);
            const outstanding = Math.max(0, amount - paid);
            const reduction = Math.min(outstanding, remainingReduction);
            if (reduction <= 0) continue;
            const nextAmount = Math.max(paid, amount - reduction);
            const status = nextAmount <= paid ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
            updateDebt.run(nextAmount, status, debt.id, userId);
            remainingReduction -= reduction;
          }
          debtLedgerUnmatched = Math.max(0, remainingReduction);
        }

        if (refundAmount > 0) {
          const cashFlow = native.prepare(
            `INSERT INTO cash_flows
              (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
             VALUES (?, 'in', 'refund', ?, ?, ?, ?)`
          ).run(
            userId,
            refundAmount,
            refundMethod,
            code,
            `NCC hoàn tiền trả hàng ${code}`,
          );
          cashFlowId = Number(cashFlow.lastInsertRowid);
          refundEvidenceStatus = refundMethod === 'unknown' ? 'NEEDS_METHOD' : 'RECORDED';

          native.prepare(
            `INSERT INTO payment_evidence
              (user_id, cash_flow_id, amount, payment_method, transaction_reference, paid_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            userId,
            cashFlowId,
            refundAmount,
            refundMethod,
            refundReference,
            refundAt,
            refundEvidenceStatus,
          );

          if (refundMethod === 'unknown') {
            const finding = native.prepare(
              `INSERT INTO compliance_findings
                (user_id, code, severity, subject_type, subject_id, status, message, detail_json)
               VALUES (?, 'SUPPLIER_REFUND_METHOD_MISSING', 'REVIEW', 'supplier_return', ?, 'OPEN', ?, ?)`
            ).run(
              userId,
              String(returnId),
              `Phiếu trả NCC ${code} có tiền NCC hoàn nhưng chưa xác định phương thức nhận tiền.`,
              JSON.stringify({ supplier_return_code: code, supplier_id: supplier.id, refund_amount: refundAmount }),
            );
            native.prepare(
              `INSERT OR IGNORE INTO audit_cases (user_id, finding_id, status, note)
               VALUES (?, ?, 'OPEN', 'Tự tạo từ SUPPLIER_REFUND_METHOD_MISSING')`
            ).run(userId, Number(finding.lastInsertRowid));
          }
        }

        if (debtLedgerUnmatched > 0) {
          const finding = native.prepare(
            `INSERT INTO compliance_findings
              (user_id, code, severity, subject_type, subject_id, status, message, detail_json)
             VALUES (?, 'SUPPLIER_DEBT_LEDGER_MISMATCH', 'REVIEW', 'supplier_return', ?, 'OPEN', ?, ?)`
          ).run(
            userId,
            String(returnId),
            `Công nợ tổng của NCC ${supplier.name} không khớp chi tiết khoản phải trả khi xử lý ${code}.`,
            JSON.stringify({ supplier_id: supplier.id, debt_reduction: debtReduction, unmatched_amount: debtLedgerUnmatched }),
          );
          native.prepare(
            `INSERT OR IGNORE INTO audit_cases (user_id, finding_id, status, note)
             VALUES (?, ?, 'OPEN', 'Tự tạo từ SUPPLIER_DEBT_LEDGER_MISMATCH')`
          ).run(userId, Number(finding.lastInsertRowid));
        }

        if (total > purchasedBefore) {
          const finding = native.prepare(
            `INSERT INTO compliance_findings
              (user_id, code, severity, subject_type, subject_id, status, message, detail_json)
             VALUES (?, 'SUPPLIER_RETURN_EXCEEDS_RECORDED_PURCHASES', 'REVIEW', 'supplier_return', ?, 'OPEN', ?, ?)`
          ).run(
            userId,
            String(returnId),
            `Giá trị trả NCC ${code} lớn hơn tổng mua đã ghi nhận cho ${supplier.name}; total_purchased được chặn không âm.`,
            JSON.stringify({ supplier_id: supplier.id, return_amount: total, recorded_purchased_before: purchasedBefore }),
          );
          native.prepare(
            `INSERT OR IGNORE INTO audit_cases (user_id, finding_id, status, note)
             VALUES (?, ?, 'OPEN', 'Tự tạo từ SUPPLIER_RETURN_EXCEEDS_RECORDED_PURCHASES')`
          ).run(userId, Number(finding.lastInsertRowid));
        }
      }

      return {
        returnId,
        code,
        total,
        itemCount: lines.length,
        debtReduction,
        refundAmount,
        refundMethod,
        refundEvidenceStatus,
        cashFlowId,
        debtLedgerUnmatched,
        branchId: branch.id,
        supplierId: supplier ? supplier.id : null,
      };
    });

    const result = returnTransaction.immediate();
    writeAudit(req, {
      action: 'supplier.return',
      target: result.code,
      detail: {
        tong: result.total,
        so_mat_hang: result.itemCount,
        branch_id: result.branchId,
        supplier_id: result.supplierId,
        debt_reduction: result.debtReduction,
        refund_amount: result.refundAmount,
        refund_method: result.refundMethod,
      },
    });

    return res.json({
      success: true,
      id: result.returnId,
      code: result.code,
      total_amount: result.total,
      debt_reduction: result.debtReduction,
      refund_amount: result.refundAmount,
      refund_method: result.refundMethod,
      refund_evidence_status: result.refundEvidenceStatus,
      debt_ledger_unmatched: result.debtLedgerUnmatched,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
