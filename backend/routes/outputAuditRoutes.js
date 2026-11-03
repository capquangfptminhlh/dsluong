'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const { validateArithmetic, comparePurchaseAmount } = require('../services/invoiceValidationEngine');

const canAuditSales = requireAnyPermission('purchase', 'tax', 'reports', 'orders', 'pos');
router.use(requireAuth);
router.use(canAuditSales);

const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null))));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

function normalizeTaxCode(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

async function createFindingIfMissing(userId, { code, severity = 'REVIEW', subjectType, subjectId, message, detail = null }) {
  const existing = await get(
    `SELECT id FROM compliance_findings
     WHERE user_id = ? AND code = ? AND subject_type = ? AND subject_id = ? AND status = 'OPEN'
     ORDER BY id DESC LIMIT 1`,
    [userId, code, subjectType, String(subjectId)],
  );
  if (existing) return existing.id;
  const finding = await run(
    `INSERT INTO compliance_findings
      (user_id, code, severity, subject_type, subject_id, status, message, detail_json)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    [userId, code, severity, subjectType, String(subjectId), message, detail ? JSON.stringify(detail) : null],
  );
  await run(
    `INSERT OR IGNORE INTO audit_cases (user_id, finding_id, status, note)
     VALUES (?, ?, 'OPEN', ?)`,
    [userId, finding.lastID, `Tự tạo từ ${code}`],
  );
  return finding.lastID;
}

function validateOutputInvoice(invoice) {
  for (const field of ['seller_tax_code', 'invoice_number', 'invoice_date']) {
    if (!String(invoice[field] || '').trim()) return `Thiếu trường hóa đơn bắt buộc: ${field}`;
  }
  for (const field of ['subtotal', 'vat_amount', 'total_amount']) {
    const value = Number(invoice[field]);
    if (!Number.isFinite(value) || value < 0) return `${field} không hợp lệ`;
  }
  return null;
}

router.get('/output-invoices', async (req, res) => {
  try {
    const rows = await all(
      `SELECT i.*, r.relation_id AS pos_order_id, r.match_status, r.detail_json
       FROM invoices i
       LEFT JOIN invoice_relations r
         ON r.user_id = i.user_id AND r.invoice_id = i.id AND r.relation_type = 'POS_ORDER'
       WHERE i.user_id = ? AND i.direction = 'OUTPUT'
       ORDER BY i.invoice_date DESC, i.id DESC LIMIT 500`,
      [req.tenantId],
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/output-invoices/:id', async (req, res) => {
  try {
    const invoice = await get(
      `SELECT * FROM invoices WHERE id = ? AND user_id = ? AND direction = 'OUTPUT'`,
      [req.params.id, req.tenantId],
    );
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn đầu ra.' });
    invoice.lines = await all(
      'SELECT * FROM invoice_lines WHERE invoice_id = ? AND user_id = ? ORDER BY line_no ASC, id ASC',
      [invoice.id, req.tenantId],
    );
    invoice.relations = await all(
      'SELECT * FROM invoice_relations WHERE invoice_id = ? AND user_id = ? ORDER BY id ASC',
      [invoice.id, req.tenantId],
    );
    invoice.findings = await all(
      `SELECT * FROM compliance_findings
       WHERE user_id = ? AND subject_type = 'invoice' AND subject_id = ?
       ORDER BY created_at DESC, id DESC`,
      [req.tenantId, String(invoice.id)],
    );
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/output-invoices', async (req, res) => {
  const invoice = req.body?.invoice && typeof req.body.invoice === 'object' ? req.body.invoice : (req.body || {});
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : (Array.isArray(invoice.lines) ? invoice.lines : []);
  const inputError = validateOutputInvoice(invoice);
  if (inputError) return res.status(400).json({ error: inputError });

  const sellerTaxCode = String(invoice.seller_tax_code).trim();
  const buyerTaxCode = String(invoice.buyer_tax_code || '').trim() || null;
  const invoiceNumber = String(invoice.invoice_number).trim();
  const invoiceSymbol = String(invoice.invoice_symbol || '').trim() || null;
  const invoiceDate = String(invoice.invoice_date).trim();
  const subtotal = Number(invoice.subtotal);
  const vatAmount = Number(invoice.vat_amount);
  const totalAmount = Number(invoice.total_amount);
  const currency = String(invoice.currency || 'VND').trim() || 'VND';
  const posOrderId = req.body?.pos_order_id || invoice.pos_order_id || null;

  try {
    const duplicate = await get(
      `SELECT id FROM invoices
       WHERE user_id = ? AND direction = 'OUTPUT' AND seller_tax_code = ?
         AND COALESCE(invoice_symbol, '') = ? AND invoice_number = ?
       ORDER BY id ASC LIMIT 1`,
      [req.tenantId, sellerTaxCode, invoiceSymbol || '', invoiceNumber],
    );
    if (duplicate) return res.status(409).json({ code: 'DUPLICATE_OUTPUT_INVOICE', existing_invoice_id: duplicate.id });

    const profile = await get('SELECT taxCode FROM users WHERE phone = ?', [req.tenantId]);
    const sellerTaxCodeOk = !profile?.taxCode || normalizeTaxCode(sellerTaxCode) === normalizeTaxCode(profile.taxCode);
    const arithmetic = validateArithmetic({ subtotal, vat_amount: vatAmount, total_amount: totalAmount });

    let order = null;
    let orderAmount = null;
    let orderPaymentOk = null;
    if (posOrderId) {
      order = await get('SELECT * FROM pos_orders WHERE id = ? AND user_id = ?', [posOrderId, req.tenantId]);
      if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn POS thuộc cửa hàng hiện tại.' });
      orderAmount = comparePurchaseAmount(totalAmount, order.total_amount);
      orderPaymentOk = String(order.status || '').toLowerCase() === 'paid' || Number(order.debt_amount || 0) <= 0 && Number(order.paid_cash || 0) + Number(order.paid_bank || 0) >= Number(order.total_amount || 0);
    }

    await run('BEGIN IMMEDIATE');
    try {
      const inserted = await run(
        `INSERT INTO invoices
          (user_id, direction, seller_tax_code, buyer_tax_code, invoice_number, invoice_symbol, invoice_date,
           subtotal, vat_amount, total_amount, currency, source_type, invoice_status)
         VALUES (?, 'OUTPUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'ORIGINAL')`,
        [req.tenantId, sellerTaxCode, buyerTaxCode, invoiceNumber, invoiceSymbol, invoiceDate, subtotal, vatAmount, totalAmount, currency],
      );
      const invoiceId = inserted.lastID;

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] || {};
        await run(
          `INSERT INTO invoice_lines
            (user_id, invoice_id, line_no, description, quantity, unit_price, subtotal, vat_rate, vat_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.tenantId,
            invoiceId,
            Number(line.line_no) || index + 1,
            String(line.description || '').trim() || null,
            Number(line.quantity) || 0,
            Number(line.unit_price) || 0,
            Number(line.subtotal) || 0,
            line.vat_rate === null || line.vat_rate === undefined || line.vat_rate === '' ? null : Number(line.vat_rate),
            Number(line.vat_amount) || 0,
          ],
        );
      }

      if (order) {
        const matched = arithmetic.ok && sellerTaxCodeOk && orderAmount.ok && orderPaymentOk;
        await run(
          `INSERT INTO invoice_relations
            (user_id, invoice_id, relation_type, relation_id, match_status, detail_json)
           VALUES (?, ?, 'POS_ORDER', ?, ?, ?)`,
          [
            req.tenantId,
            invoiceId,
            String(order.id),
            matched ? 'MATCHED' : 'MISMATCH',
            JSON.stringify({ order_code: order.order_code, amount: orderAmount, payment_ok: orderPaymentOk, order_status: order.status }),
          ],
        );
      }

      if (!arithmetic.ok) {
        await createFindingIfMissing(req.tenantId, {
          code: 'OUT_INV_ARITHMETIC_MISMATCH', severity: 'HIGH', subjectType: 'invoice', subjectId: invoiceId,
          message: 'Hóa đơn đầu ra có tổng trước thuế + VAT không khớp tổng thanh toán.', detail: arithmetic,
        });
      }
      if (!sellerTaxCodeOk) {
        await createFindingIfMissing(req.tenantId, {
          code: 'OUT_INV_SELLER_TAX_CODE_MISMATCH', severity: 'HIGH', subjectType: 'invoice', subjectId: invoiceId,
          message: 'MST người bán trên hóa đơn đầu ra không khớp hồ sơ doanh nghiệp trong AutoTax.',
          detail: { invoice_seller_tax_code: sellerTaxCode, profile_tax_code: profile?.taxCode || null },
        });
      }
      if (order && !orderAmount.ok) {
        await createFindingIfMissing(req.tenantId, {
          code: 'OUT_INV_POS_AMOUNT_MISMATCH', severity: 'REVIEW', subjectType: 'invoice', subjectId: invoiceId,
          message: `Giá trị hóa đơn đầu ra không khớp đơn bán ${order.order_code}.`, detail: orderAmount,
        });
      }
      if (order && !orderPaymentOk) {
        await createFindingIfMissing(req.tenantId, {
          code: 'OUT_INV_POS_PAYMENT_UNSETTLED', severity: 'REVIEW', subjectType: 'invoice', subjectId: invoiceId,
          message: `Hóa đơn đầu ra đang liên kết với đơn ${order.order_code} chưa ở trạng thái thanh toán hoàn tất.`,
          detail: { order_id: order.id, order_code: order.order_code, status: order.status, debt_amount: order.debt_amount },
        });
      }

      await run('COMMIT');
      const findings = await all(
        `SELECT * FROM compliance_findings WHERE user_id = ? AND subject_type = 'invoice' AND subject_id = ? ORDER BY id ASC`,
        [req.tenantId, String(invoiceId)],
      );
      return res.status(201).json({
        id: invoiceId,
        pos_order_id: order ? order.id : null,
        checks: {
          arithmetic_ok: arithmetic.ok,
          seller_tax_code_ok: sellerTaxCodeOk,
          pos_amount_ok: orderAmount ? orderAmount.ok : null,
          pos_payment_ok: orderPaymentOk,
          legal_rule_status: 'RULE_NOT_EVALUATED',
        },
        findings,
        message: findings.length ? 'Đã nhập hóa đơn đầu ra và tạo cảnh báo cần rà soát.' : 'Đã nhập hóa đơn đầu ra; chưa phát hiện sai lệch dữ liệu trong phạm vi kiểm tra đã cấu hình.',
      });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sales-reconciliation', async (req, res) => {
  try {
    const rows = await all(
      `SELECT o.id, o.order_code, o.total_amount, o.paid_cash, o.paid_bank, o.debt_amount, o.status, o.createdAt,
              i.id AS invoice_id, i.invoice_number, i.invoice_symbol, i.invoice_date, i.total_amount AS invoice_total,
              r.match_status, r.detail_json
       FROM pos_orders o
       LEFT JOIN invoice_relations r
         ON r.user_id = o.user_id AND r.relation_type = 'POS_ORDER' AND r.relation_id = CAST(o.id AS TEXT)
       LEFT JOIN invoices i
         ON i.id = r.invoice_id AND i.user_id = o.user_id AND i.direction = 'OUTPUT'
       WHERE o.user_id = ?
       ORDER BY o.id DESC LIMIT 500`,
      [req.tenantId],
    );
    res.json(rows.map((row) => ({
      ...row,
      reconciliation_status: !row.invoice_id ? 'NO_OUTPUT_INVOICE_LINKED' : (row.match_status || 'UNREVIEWED'),
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sales-reconciliation/run', async (req, res) => {
  try {
    const missing = await all(
      `SELECT o.id, o.order_code, o.total_amount, o.status, o.paid_cash, o.paid_bank, o.debt_amount
       FROM pos_orders o
       LEFT JOIN invoice_relations r
         ON r.user_id = o.user_id AND r.relation_type = 'POS_ORDER' AND r.relation_id = CAST(o.id AS TEXT)
       LEFT JOIN invoices i
         ON i.id = r.invoice_id AND i.user_id = o.user_id AND i.direction = 'OUTPUT'
       WHERE o.user_id = ? AND i.id IS NULL
         AND (LOWER(COALESCE(o.status, '')) = 'paid'
              OR (COALESCE(o.debt_amount, 0) <= 0 AND COALESCE(o.paid_cash, 0) + COALESCE(o.paid_bank, 0) >= COALESCE(o.total_amount, 0)))
       ORDER BY o.id DESC LIMIT 500`,
      [req.tenantId],
    );
    let created = 0;
    for (const order of missing) {
      const before = await get(
        `SELECT id FROM compliance_findings
         WHERE user_id = ? AND code = 'POS_OUTPUT_INVOICE_NOT_LINKED' AND subject_type = 'pos_order'
           AND subject_id = ? AND status = 'OPEN' LIMIT 1`,
        [req.tenantId, String(order.id)],
      );
      if (!before) {
        await createFindingIfMissing(req.tenantId, {
          code: 'POS_OUTPUT_INVOICE_NOT_LINKED', severity: 'REVIEW', subjectType: 'pos_order', subjectId: order.id,
          message: `Đơn bán ${order.order_code} đã thanh toán nhưng chưa có hóa đơn đầu ra được liên kết trong AutoTax.`,
          detail: { order_code: order.order_code, total_amount: order.total_amount, status: order.status },
        });
        created += 1;
      }
    }
    res.json({ scanned: missing.length, created, legal_rule_status: 'RULE_NOT_EVALUATED' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
