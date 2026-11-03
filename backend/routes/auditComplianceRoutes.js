'use strict';

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { findApprovedRule } = require('../services/legalRuleRegistry');
const {
  validateArithmetic,
  buyerTaxCodeMismatch,
  comparePurchaseAmount,
  comparePurchaseInventory,
} = require('../services/invoiceValidationEngine');
const { parseSupportedInvoiceXml } = require('../services/invoiceXmlAdapter');
const { verifyXmlSignature } = require('../services/xmlSignatureVerifier');

router.use(requireAuth);
router.use(requirePermission('purchase'));

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) return reject(err);
    resolve(this);
  });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});

const CASE_STATES = new Set(['OPEN', 'NEED_DOCUMENT', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']);
const SIGNATURE_ACCEPTED = new Set(['CRYPTO_VALID_UNTRUSTED_CERT', 'CRYPTO_VALID_TRUSTED_CHAIN_NO_TIME_OR_REVOCATION', 'CRYPTO_VALID_TRUSTED_CHAIN_AUTHORITY_APPROVED_NO_TIME_OR_REVOCATION']);

function xmlImportError(code, message, detail = null) {
  const error = new Error(message);
  error.code = code;
  error.detail = detail;
  return error;
}

async function createFindingCase(userId, {
  code,
  severity = 'REVIEW',
  subjectType,
  subjectId,
  message,
  detail = null,
  ruleCode = null,
}) {
  const finding = await run(
    `INSERT INTO compliance_findings
      (user_id, code, severity, subject_type, subject_id, status, message, detail_json, rule_code)
     VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)`,
    [
      userId,
      code,
      severity,
      subjectType,
      String(subjectId),
      message,
      detail ? JSON.stringify(detail) : null,
      ruleCode,
    ],
  );
  await run(
    `INSERT OR IGNORE INTO audit_cases (user_id, finding_id, status, note)
     VALUES (?, ?, 'OPEN', ?)`,
    [userId, finding.lastID, `Tự tạo từ ${code}`],
  );
  return finding.lastID;
}

function mergeAuthenticatedSchema(observedSchema, authenticatedSchema, signature) {
  return {
    family: authenticatedSchema?.family || observedSchema?.family || 'UNKNOWN',
    version: authenticatedSchema?.version || observedSchema?.version || null,
    wrapped_message: Boolean(observedSchema?.wrapped_message),
    wrapper_type: observedSchema?.wrapper_type || null,
    message_code: observedSchema?.message_code || null,
    tax_authority_code: authenticatedSchema?.tax_authority_code || observedSchema?.tax_authority_code || null,
    signature_present: true,
    signature_verification_status: signature.status,
    signature_reference_root: signature.reference_root || null,
    certificate_trust_status: signature.certificate_trust_status || 'NOT_CHECKED',
    certificate_chain_verified: Boolean(signature.certificate_chain_verified),
    certificate_fingerprint_sha256: signature.certificate_fingerprint_sha256 || null,
    certificate_subject: signature.certificate_subject || null,
    certificate_issuer: signature.certificate_issuer || null,
    certificate_serial_number: signature.certificate_serial_number || null,
    certificate_valid_from: signature.certificate_valid_from || null,
    certificate_valid_to: signature.certificate_valid_to || null,
    certificate_current_time_status: signature.certificate_current_time_status || null,
    certificate_revocation_status: signature.certificate_revocation_status || 'NOT_CHECKED',
    certificate_trust_anchor_bundle_sha256: signature.certificate_trust_anchor_bundle_sha256 || null,
    certificate_authority_bundle_sha256: signature.certificate_authority_bundle_sha256 || null,
    certificate_authority_evidence_source: signature.certificate_authority_evidence_source || null,
    certificate_authority_registry_status: signature.certificate_authority_registry_status || 'NOT_CONFIGURED',
    certificate_authority_registry_sha256: signature.certificate_authority_registry_sha256 || null,
    certificate_authority_name: signature.certificate_authority_name || null,
    certificate_authority_status: signature.certificate_authority_status || null,
    certificate_authority_serial_number: signature.certificate_authority_serial_number || null,
    certificate_authority_fingerprint_sha256: signature.certificate_authority_fingerprint_sha256 || null,
    certificate_authority_source_url: signature.certificate_authority_source_url || null,
  };
}

function normalizeInvoicePayload(body) {
  if (body.xml) {
    const rawXml = String(body.xml);

    // Structural parse runs first because it also enforces XML size/DOCTYPE/ENTITY guards.
    const observed = parseSupportedInvoiceXml(rawXml);
    const signature = verifyXmlSignature(rawXml);

    if (signature.signature_count > 0 && !SIGNATURE_ACCEPTED.has(signature.status)) {
      if (signature.status === 'INVALID') {
        throw xmlImportError(
          'XML_SIGNATURE_INVALID',
          'Chữ ký XML không khớp dữ liệu. AutoTax từ chối nhập hóa đơn này.',
          { signature_status: signature.status },
        );
      }
      if (signature.status === 'CRYPTO_VALID_AUTHORITY_POLICY_UNVERIFIED') {
        throw xmlImportError(
          'XML_CERTIFICATE_AUTHORITY_UNVERIFIED',
          'Chữ ký XML khớp dữ liệu nhưng chính sách CA được cấu hình chưa xác minh được CA phát hành ở trạng thái được duyệt. Hóa đơn chưa được nhập.',
          {
            signature_status: signature.status,
            authority_registry_status: signature.certificate_authority_registry_status || 'UNKNOWN',
            authority_name: signature.certificate_authority_name || null,
            authority_status: signature.certificate_authority_status || null,
            authority_registry_sha256: signature.certificate_authority_registry_sha256 || null,
          },
        );
      }
      throw xmlImportError(
        'XML_SIGNATURE_UNVERIFIED',
        'XML có chữ ký nhưng AutoTax chưa xác minh được signed reference một cách an toàn. Hóa đơn chưa được nhập.',
        { signature_status: signature.status },
      );
    }

    let parsed = observed;
    let schema = {
      ...(observed.schema || {}),
      signature_present: false,
      signature_verification_status: 'NOT_PRESENT',
      signature_reference_root: null,
      certificate_trust_status: 'NOT_CHECKED',
      certificate_chain_verified: false,
      certificate_fingerprint_sha256: null,
      certificate_subject: null,
      certificate_issuer: null,
      certificate_serial_number: null,
      certificate_valid_from: null,
      certificate_valid_to: null,
      certificate_current_time_status: null,
      certificate_revocation_status: 'NOT_CHECKED',
      certificate_trust_anchor_bundle_sha256: null,
      certificate_authority_bundle_sha256: null,
      certificate_authority_evidence_source: null,
      certificate_authority_registry_status: 'NOT_CONFIGURED',
      certificate_authority_registry_sha256: null,
      certificate_authority_name: null,
      certificate_authority_status: null,
      certificate_authority_serial_number: null,
      certificate_authority_fingerprint_sha256: null,
      certificate_authority_source_url: null,
    };

    if (SIGNATURE_ACCEPTED.has(signature.status)) {
      if (!signature.authenticated_invoice_xml) {
        throw xmlImportError(
          'XML_SIGNATURE_UNVERIFIED',
          'Chữ ký XML không trả về signed reference hóa đơn được hỗ trợ.',
          { signature_status: signature.status },
        );
      }
      // Critical anti-wrapping rule: financial fields are parsed only from bytes returned by
      // xml-crypto getSignedReferences(), never from the original unsigned document view.
      parsed = parseSupportedInvoiceXml(signature.authenticated_invoice_xml);
      schema = mergeAuthenticatedSchema(observed.schema, parsed.schema, signature);
    }

    return {
      invoice: parsed.invoice,
      lines: parsed.lines,
      sourceType: observed.source_type,
      schema,
      rawXml,
      sourceHash: crypto.createHash('sha256').update(rawXml).digest('hex'),
    };
  }
  const invoice = body.invoice && typeof body.invoice === 'object' ? body.invoice : body;
  const lines = Array.isArray(body.lines) ? body.lines : (Array.isArray(invoice.lines) ? invoice.lines : []);
  return { invoice, lines, sourceType: 'MANUAL', schema: null, rawXml: null, sourceHash: null };
}

function validateInvoiceInput(invoice) {
  const required = [
    ['seller_tax_code', invoice.seller_tax_code],
    ['invoice_number', invoice.invoice_number],
    ['invoice_date', invoice.invoice_date],
  ];
  const missing = required.filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
  if (missing.length) return `Thiếu trường hóa đơn bắt buộc: ${missing.join(', ')}`;

  for (const field of ['subtotal', 'vat_amount', 'total_amount']) {
    const value = Number(invoice[field]);
    if (!Number.isFinite(value) || value < 0) return `${field} không hợp lệ`;
  }
  return null;
}

router.get('/input-invoices', (req, res) => {
  db.all(
    `SELECT * FROM invoices WHERE user_id = ? AND direction = 'INPUT'
     ORDER BY invoice_date DESC, id DESC LIMIT 500`,
    [req.tenantId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

router.get('/input-invoices/:id', async (req, res) => {
  try {
    const invoice = await get(
      `SELECT * FROM invoices WHERE id = ? AND user_id = ? AND direction = 'INPUT'`,
      [req.params.id, req.tenantId],
    );
    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn đầu vào.' });
    invoice.lines = await all('SELECT * FROM invoice_lines WHERE invoice_id = ? AND user_id = ? ORDER BY line_no ASC, id ASC', [invoice.id, req.tenantId]);
    invoice.relations = await all('SELECT * FROM invoice_relations WHERE invoice_id = ? AND user_id = ? ORDER BY id ASC', [invoice.id, req.tenantId]);
    invoice.xml_provenance = await get(
      `SELECT schema_family, schema_version, wrapper_type, message_code, tax_authority_code,
              signature_present, signature_verification_status, certificate_trust_status,
              certificate_chain_verified, certificate_fingerprint_sha256, certificate_subject,
              certificate_issuer, certificate_serial_number, certificate_valid_from, certificate_valid_to,
              certificate_current_time_status, certificate_revocation_status,
              certificate_trust_anchor_bundle_sha256, certificate_authority_bundle_sha256,
              certificate_authority_evidence_source, certificate_authority_registry_status,
              certificate_authority_registry_sha256, certificate_authority_name, certificate_authority_status,
              certificate_authority_serial_number, certificate_authority_fingerprint_sha256,
              certificate_authority_source_url, created_at
       FROM invoice_xml_provenance WHERE invoice_id = ? AND user_id = ?`,
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

router.post('/input-invoices', async (req, res) => {
  let normalized;
  try {
    normalized = normalizeInvoicePayload(req.body || {});
  } catch (error) {
    return res.status(400).json({
      code: error.code || 'XML_PARSE_ERROR',
      error: error.message,
      ...(error.detail ? { detail: error.detail } : {}),
    });
  }

  const { invoice, lines, sourceType, schema, rawXml, sourceHash } = normalized;
  const inputError = validateInvoiceInput(invoice);
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
  const purchaseOrderId = req.body.purchase_order_id || invoice.purchase_order_id || null;

  try {
    const duplicate = await get(
      `SELECT id FROM invoices
       WHERE user_id = ? AND direction = 'INPUT' AND seller_tax_code = ?
         AND COALESCE(invoice_symbol, '') = ? AND invoice_number = ?
       ORDER BY id ASC LIMIT 1`,
      [req.tenantId, sellerTaxCode, invoiceSymbol || '', invoiceNumber],
    );
    if (duplicate) {
      await createFindingCase(req.tenantId, {
        code: 'INV_DUPLICATE',
        severity: 'HIGH',
        subjectType: 'invoice',
        subjectId: duplicate.id,
        message: `Phát hiện lần nhập trùng hóa đơn ${invoiceSymbol || ''} ${invoiceNumber}.`,
        detail: { seller_tax_code: sellerTaxCode, invoice_symbol: invoiceSymbol, invoice_number: invoiceNumber },
      });
      return res.status(409).json({ code: 'DUPLICATE_INVOICE', existing_invoice_id: duplicate.id });
    }

    const profile = await get('SELECT taxCode FROM users WHERE phone = ?', [req.tenantId]);
    let purchaseOrder = null;
    let purchaseItems = [];
    let inventoryLogs = [];
    if (purchaseOrderId) {
      purchaseOrder = await get('SELECT * FROM purchase_orders WHERE id = ? AND user_id = ?', [purchaseOrderId, req.tenantId]);
      if (!purchaseOrder) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập thuộc cửa hàng hiện tại.' });
      purchaseItems = await all('SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY id ASC', [purchaseOrder.id]);
      inventoryLogs = await all(
        `SELECT product_id, type, quantity, note FROM inventory_logs
         WHERE user_id = ? AND type = 'IN' AND note = ?`,
        [req.tenantId, `Nhập hàng ${purchaseOrder.code}`],
      );
    }

    const arithmetic = validateArithmetic({ subtotal, vat_amount: vatAmount, total_amount: totalAmount });
    const buyerMismatch = buyerTaxCodeMismatch(buyerTaxCode, profile?.taxCode);
    const purchaseAmount = purchaseOrder ? comparePurchaseAmount(totalAmount, purchaseOrder.total_amount) : null;
    const inventoryMatch = purchaseOrder ? comparePurchaseInventory(purchaseItems, inventoryLogs) : null;

    await run('BEGIN IMMEDIATE');
    try {
      const inserted = await run(
        `INSERT INTO invoices
          (user_id, direction, seller_tax_code, buyer_tax_code, invoice_number, invoice_symbol, invoice_date,
           subtotal, vat_amount, total_amount, currency, source_type, source_hash, invoice_status, raw_xml)
         VALUES (?, 'INPUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ORIGINAL', ?)`,
        [
          req.tenantId,
          sellerTaxCode,
          buyerTaxCode,
          invoiceNumber,
          invoiceSymbol,
          invoiceDate,
          subtotal,
          vatAmount,
          totalAmount,
          currency,
          sourceType,
          sourceHash,
          rawXml,
        ],
      );
      const invoiceId = inserted.lastID;

      if (schema) {
        await run(
          `INSERT INTO invoice_xml_provenance
            (user_id, invoice_id, schema_family, schema_version, wrapper_type, message_code,
             tax_authority_code, signature_present, signature_verification_status, certificate_trust_status,
             certificate_chain_verified, certificate_fingerprint_sha256, certificate_subject, certificate_issuer,
             certificate_serial_number, certificate_valid_from, certificate_valid_to, certificate_current_time_status,
             certificate_revocation_status, certificate_trust_anchor_bundle_sha256, certificate_authority_bundle_sha256,
             certificate_authority_evidence_source, certificate_authority_registry_status, certificate_authority_registry_sha256, certificate_authority_name, certificate_authority_status,
             certificate_authority_serial_number, certificate_authority_fingerprint_sha256, certificate_authority_source_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.tenantId,
            invoiceId,
            schema.family,
            schema.version || null,
            schema.wrapper_type || null,
            schema.message_code || null,
            schema.tax_authority_code || null,
            schema.signature_present ? 1 : 0,
            schema.signature_verification_status || 'NOT_PRESENT',
            schema.certificate_trust_status || 'NOT_CHECKED',
            schema.certificate_chain_verified ? 1 : 0,
            schema.certificate_fingerprint_sha256 || null,
            schema.certificate_subject || null,
            schema.certificate_issuer || null,
            schema.certificate_serial_number || null,
            schema.certificate_valid_from || null,
            schema.certificate_valid_to || null,
            schema.certificate_current_time_status || null,
            schema.certificate_revocation_status || 'NOT_CHECKED',
            schema.certificate_trust_anchor_bundle_sha256 || null,
            schema.certificate_authority_bundle_sha256 || null,
            schema.certificate_authority_evidence_source || null,
            schema.certificate_authority_registry_status || 'NOT_CONFIGURED',
            schema.certificate_authority_registry_sha256 || null,
            schema.certificate_authority_name || null,
            schema.certificate_authority_status || null,
            schema.certificate_authority_serial_number || null,
            schema.certificate_authority_fingerprint_sha256 || null,
            schema.certificate_authority_source_url || null,
          ],
        );
      }

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

      if (purchaseOrder) {
        await run(
          `INSERT INTO invoice_relations
            (user_id, invoice_id, relation_type, relation_id, match_status, detail_json)
           VALUES (?, ?, 'PURCHASE_ORDER', ?, ?, ?)`,
          [
            req.tenantId,
            invoiceId,
            String(purchaseOrder.id),
            purchaseAmount.ok && inventoryMatch.ok ? 'MATCHED' : 'MISMATCH',
            JSON.stringify({ purchase_amount: purchaseAmount, inventory: inventoryMatch }),
          ],
        );
      }

      if (!arithmetic.ok) {
        await createFindingCase(req.tenantId, {
          code: 'INV_ARITHMETIC_MISMATCH',
          severity: 'HIGH',
          subjectType: 'invoice',
          subjectId: invoiceId,
          message: 'Tổng trước thuế + VAT không khớp tổng thanh toán trên hóa đơn.',
          detail: arithmetic,
        });
      }
      if (buyerMismatch) {
        await createFindingCase(req.tenantId, {
          code: 'INV_BUYER_TAX_CODE_MISMATCH',
          severity: 'HIGH',
          subjectType: 'invoice',
          subjectId: invoiceId,
          message: 'MST người mua trên hóa đơn không khớp hồ sơ doanh nghiệp trong AutoTax.',
          detail: { invoice_buyer_tax_code: buyerTaxCode, profile_tax_code: profile?.taxCode || null },
        });
      }
      if (purchaseOrder && !purchaseAmount.ok) {
        await createFindingCase(req.tenantId, {
          code: 'INV_PURCHASE_AMOUNT_MISMATCH',
          severity: 'REVIEW',
          subjectType: 'invoice',
          subjectId: invoiceId,
          message: `Giá trị hóa đơn không khớp phiếu nhập ${purchaseOrder.code}.`,
          detail: purchaseAmount,
        });
      }
      if (purchaseOrder && !inventoryMatch.ok) {
        await createFindingCase(req.tenantId, {
          code: 'PO_INVENTORY_RECEIPT_MISMATCH',
          severity: 'REVIEW',
          subjectType: 'invoice',
          subjectId: invoiceId,
          message: `Số lượng nhập kho không khớp các dòng của phiếu nhập ${purchaseOrder.code}.`,
          detail: inventoryMatch,
        });
      }

      await run('COMMIT');
      const findings = await all(
        `SELECT * FROM compliance_findings WHERE user_id = ? AND subject_type = 'invoice' AND subject_id = ? ORDER BY id ASC`,
        [req.tenantId, String(invoiceId)],
      );
      return res.status(201).json({
        id: invoiceId,
        source_type: sourceType,
        xml_schema: schema,
        purchase_order_id: purchaseOrder ? purchaseOrder.id : null,
        checks: {
          arithmetic_ok: arithmetic.ok,
          buyer_tax_code_ok: !buyerMismatch,
          purchase_amount_ok: purchaseAmount ? purchaseAmount.ok : null,
          inventory_receipt_ok: inventoryMatch ? inventoryMatch.ok : null,
          legal_rule_status: 'RULE_NOT_EVALUATED',
        },
        findings,
        message: findings.length
          ? 'Đã nhập hóa đơn và tạo cảnh báo cần xử lý.'
          : 'Chưa phát hiện vấn đề trong phạm vi các kiểm tra dữ liệu đã cấu hình.',
      });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/payment-evidence', (req, res) => {
  const params = [req.tenantId];
  let where = 'WHERE user_id = ?';
  if (req.query.purchase_order_id) {
    where += ' AND purchase_order_id = ?';
    params.push(req.query.purchase_order_id);
  }
  db.all(
    `SELECT * FROM payment_evidence ${where} ORDER BY created_at DESC, id DESC LIMIT 500`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

router.get('/findings', (req, res) => {
  const params = [req.tenantId];
  let where = 'WHERE user_id = ?';
  if (req.query.status) {
    where += ' AND status = ?';
    params.push(req.query.status);
  }
  db.all(
    `SELECT * FROM compliance_findings ${where} ORDER BY created_at DESC, id DESC LIMIT 500`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

router.get('/cases', (req, res) => {
  db.all(
    `SELECT c.*, f.code AS finding_code, f.severity, f.message, f.subject_type, f.subject_id
     FROM audit_cases c
     JOIN compliance_findings f ON f.id = c.finding_id AND f.user_id = c.user_id
     WHERE c.user_id = ?
     ORDER BY c.updated_at DESC, c.id DESC
     LIMIT 500`,
    [req.tenantId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

router.patch('/cases/:id/status', async (req, res) => {
  const status = String(req.body.status || '').trim().toUpperCase();
  if (!CASE_STATES.has(status)) return res.status(400).json({ error: 'Trạng thái audit case không hợp lệ.' });
  try {
    const auditCase = await get('SELECT * FROM audit_cases WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!auditCase) return res.status(404).json({ error: 'Không tìm thấy audit case.' });
    await run(
      `UPDATE audit_cases SET status = ?, note = COALESCE(?, note), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [status, req.body.note || null, auditCase.id, req.tenantId],
    );
    const findingStatus = status === 'RESOLVED' || status === 'CLOSED' ? status : 'OPEN';
    await run(
      `UPDATE compliance_findings
       SET status = ?, resolved_at = CASE WHEN ? IN ('RESOLVED','CLOSED') THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = ? AND user_id = ?`,
      [findingStatus, status, auditCase.finding_id, req.tenantId],
    );
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rules/:ruleCode', async (req, res) => {
  try {
    const rule = await findApprovedRule(db, {
      tenantId: req.tenantId,
      ruleCode: req.params.ruleCode,
      effectiveAt: req.query.effective_at,
    });
    if (!rule) {
      return res.status(404).json({
        code: 'RULE_NOT_FOUND',
        rule_code: req.params.ruleCode,
        message: 'Chưa có rule đã được duyệt cho kỳ/ngày hiệu lực này.',
      });
    }
    res.json(rule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
