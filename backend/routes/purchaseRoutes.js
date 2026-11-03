const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

// Nhập hàng — cần quyền module 'purchase'
router.use(requireAuth);
router.use(requirePermission('purchase'));

const get = (sql, p) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const all = (sql, p) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const httpError = (status, message) => Object.assign(new Error(message), { status });
const variantLabel = (row) => {
  if (!row) return null;
  try {
    const attrs = JSON.parse(row.attributes_json || '{}');
    const label = Object.values(attrs).map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
    return label || row.sku || `Phân loại #${row.id}`;
  } catch (_) {
    return row.sku || `Phân loại #${row.id}`;
  }
};

const PAYMENT_METHODS = new Set(['cash', 'bank', 'card', 'other']);
function normalizePaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  return PAYMENT_METHODS.has(method) ? method : 'unknown';
}

function optionalPositiveInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : NaN;
}

// Danh sách phiếu nhập
router.get('/', async (req, res) => {
  try {
    const scopeId = req.user.actorType === 'staff' ? resolvePosBranch(req, null) : null;
    const rows = await all(
      `SELECT * FROM purchase_orders WHERE user_id = ? ${scopeId === null ? '' : 'AND branch_id = ?'} ORDER BY createdAt DESC LIMIT 200`,
      scopeId === null ? [req.tenantId] : [req.tenantId, scopeId],
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Chi tiết 1 phiếu nhập
router.get('/:id', async (req, res) => {
  try {
    const scopeId = req.user.actorType === 'staff' ? resolvePosBranch(req, null) : null;
    const po = await get(
      `SELECT * FROM purchase_orders WHERE id = ? AND user_id = ? ${scopeId === null ? '' : 'AND branch_id = ?'}`,
      scopeId === null ? [req.params.id, req.tenantId] : [req.params.id, req.tenantId, scopeId],
    );
    if (!po) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập' });
    po.items = await all('SELECT * FROM purchase_order_items WHERE po_id = ?', [po.id]);
    po.payment_evidence = await all(
      'SELECT * FROM payment_evidence WHERE purchase_order_id = ? AND user_id = ? ORDER BY created_at ASC, id ASC',
      [po.id, req.tenantId],
    );
    po.input_invoices = await all(
      `SELECT i.id, i.seller_tax_code, i.buyer_tax_code, i.invoice_number, i.invoice_symbol,
              i.invoice_date, i.subtotal, i.vat_amount, i.total_amount, i.currency,
              i.source_type, i.invoice_status, i.created_at,
              r.match_status, r.detail_json,
              p.schema_family, p.schema_version, p.wrapper_type, p.message_code,
              p.tax_authority_code, p.signature_present, p.signature_verification_status,
              p.certificate_trust_status, p.certificate_chain_verified, p.certificate_fingerprint_sha256,
              p.certificate_subject, p.certificate_issuer, p.certificate_serial_number,
              p.certificate_valid_from, p.certificate_valid_to, p.certificate_current_time_status,
              p.certificate_revocation_status, p.certificate_trust_anchor_bundle_sha256,
              p.certificate_authority_bundle_sha256, p.certificate_authority_evidence_source,
              p.certificate_authority_registry_status, p.certificate_authority_registry_sha256,
              p.certificate_authority_name, p.certificate_authority_status, p.certificate_authority_serial_number,
              p.certificate_authority_fingerprint_sha256, p.certificate_authority_source_url
       FROM invoice_relations r
       JOIN invoices i ON i.id = r.invoice_id AND i.user_id = r.user_id
       LEFT JOIN invoice_xml_provenance p ON p.invoice_id = i.id AND p.user_id = i.user_id
       WHERE r.user_id = ? AND r.relation_type = 'PURCHASE_ORDER' AND r.relation_id = ?
       ORDER BY i.invoice_date DESC, i.id DESC`,
      [req.tenantId, String(po.id)],
    );
    res.json(po);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Tạo phiếu nhập kho.
 * Body: {
 *   supplier_id?, items: [{ product_id, quantity, cost_price }], paid_amount?, note?, branch_id?,
 *   payment_method?: 'cash'|'bank'|'card'|'other', payment_reference?, paid_at?
 * }
 *
 * Tác động: mỗi mặt hàng -> tăng tồn kho + cập nhật GIÁ VỐN BÌNH QUÂN GIA QUYỀN,
 * ghi nhật ký kho, cộng công nợ NCC nếu trả thiếu.
 *
 * Backward compatibility: client cũ có paid_amount > 0 nhưng không gửi payment_method
 * vẫn được ghi nhận, nhưng phương thức = 'unknown' và tạo finding để không bịa thành tiền mặt.
 */
router.post('/', (req, res) => {
  const userId = req.tenantId;
  const {
    supplier_id, items, paid_amount = 0, note, branch_id = null,
    payment_method, payment_reference, paid_at,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Phiếu nhập cần ít nhất một mặt hàng' });
  }

  const supplierId = optionalPositiveInteger(supplier_id);
  if (Number.isNaN(supplierId)) return res.status(400).json({ error: 'Nhà cung cấp không hợp lệ' });
  const requestedBranchId = optionalPositiveInteger(branch_id);
  if (Number.isNaN(requestedBranchId)) return res.status(400).json({ error: 'Chi nhánh nhận hàng không hợp lệ' });
  let authorizedBranchId;
  try { authorizedBranchId = resolvePosBranch(req, requestedBranchId); }
  catch (error) {
    // Preserve the existing 404 contract for an owner referencing a branch
    // outside their tenant. Staff forging another branch still gets 403.
    const status = req.user.actorType !== 'staff' && requestedBranchId && error.status === 403
      ? 404 : (error.status || 500);
    return res.status(status).json({ error: status === 404 ? 'Không tìm thấy chi nhánh nhận hàng thuộc cửa hàng của bạn' : error.message });
  }

  const normalizedItems = [];
  const aggregateByProduct = new Map();
  let tongTien = 0;

  for (const item of items) {
    const productId = Number(item?.product_id);
    const quantity = Number(item?.quantity);
    const costPrice = Number(item?.cost_price);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Mỗi dòng phải chọn sản phẩm hợp lệ' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Số lượng nhập phải là số hữu hạn lớn hơn 0' });
    }
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      return res.status(400).json({ error: 'Giá nhập phải là số hữu hạn và không được âm' });
    }
    const lineTotal = quantity * costPrice;
    if (!Number.isFinite(lineTotal)) return res.status(400).json({ error: 'Giá trị dòng nhập hàng vượt giới hạn hợp lệ' });

    tongTien += lineTotal;
    if (!Number.isFinite(tongTien)) return res.status(400).json({ error: 'Tổng tiền phiếu nhập vượt giới hạn hợp lệ' });

    const rawVariantId = item?.variant_id;
    const variantId = rawVariantId === null || rawVariantId === undefined || rawVariantId === ''
      ? null
      : Number(rawVariantId);
    if (variantId !== null && (!Number.isInteger(variantId) || variantId <= 0)) {
      return res.status(400).json({ error: 'Phân loại sản phẩm không hợp lệ' });
    }

    normalizedItems.push({ product_id: productId, quantity, cost_price: costPrice, variant_id: variantId });
    const aggregate = aggregateByProduct.get(productId) || { quantity: 0, purchase_cost: 0 };
    aggregate.quantity += quantity;
    aggregate.purchase_cost += lineTotal;
    if (!Number.isFinite(aggregate.quantity) || !Number.isFinite(aggregate.purchase_cost)) {
      return res.status(400).json({ error: 'Tổng số lượng hoặc giá trị nhập của sản phẩm không hợp lệ' });
    }
    aggregateByProduct.set(productId, aggregate);
  }

  const paidInput = Number(paid_amount);
  if (!Number.isFinite(paidInput) || paidInput < 0) {
    return res.status(400).json({ error: 'Số tiền đã trả không hợp lệ' });
  }

  const daTra = Math.min(paidInput, tongTien);
  const conNo = tongTien - daTra;
  const code = `PN${Date.now().toString().slice(-8)}`;
  const trangThai = conNo <= 0 ? 'paid' : (daTra > 0 ? 'partial' : 'unpaid');
  const paymentMethod = daTra > 0 ? normalizePaymentMethod(payment_method) : null;
  const paidAt = daTra > 0 ? (String(paid_at || '').trim() || new Date().toISOString()) : null;
  const paymentReference = String(payment_reference || '').trim() || null;

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');

    const createPurchase = native.transaction(() => {
      let supplier = null;
      if (supplierId) {
        supplier = native.prepare('SELECT * FROM suppliers WHERE id = ? AND user_id = ?').get(supplierId, userId);
        if (!supplier) throw httpError(404, 'Không tìm thấy nhà cung cấp');
      }

      const branch = native.prepare(
        "SELECT id, name FROM branches WHERE id = ? AND user_id = ? AND COALESCE(status, 'active') = 'active'",
      ).get(authorizedBranchId, userId);
      if (!branch) throw httpError(403, 'Chi nhánh nhận hàng không còn hoạt động.');
      const branchId = branch.id;

      const productStmt = native.prepare('SELECT id, name, stock, cost_price FROM products WHERE id = ? AND user_id = ?');
      const products = new Map();
      for (const productId of aggregateByProduct.keys()) {
        const product = productStmt.get(productId, userId);
        if (!product) throw httpError(403, 'Có sản phẩm không thuộc cửa hàng của bạn');
        products.set(productId, product);
      }

      const variantsStmt = native.prepare(
        'SELECT id, sku, cost_price, stock, attributes_json FROM product_variants WHERE product_id = ? ORDER BY id ASC'
      );
      const aggregateByVariant = new Map();
      const resolvedItems = normalizedItems.map((item) => {
        const product = products.get(item.product_id);
        const variants = variantsStmt.all(item.product_id);
        let selectedVariant = null;
        if (item.variant_id !== null) {
          selectedVariant = variants.find((row) => Number(row.id) === Number(item.variant_id)) || null;
          if (!selectedVariant) throw httpError(400, `Phân loại đã chọn không thuộc sản phẩm "${product.name}"`);
        } else if (variants.length === 1) {
          selectedVariant = variants[0];
        } else if (variants.length > 1) {
          throw httpError(400, `Sản phẩm "${product.name}" có nhiều phân loại. Hãy chọn đúng phân loại cần nhập.`);
        }
        const resolved = {
          ...item,
          variant_id: selectedVariant ? Number(selectedVariant.id) : null,
          variant_label: variantLabel(selectedVariant),
        };
        if (resolved.variant_id) {
          const key = `${resolved.product_id}:${resolved.variant_id}`;
          const aggregate = aggregateByVariant.get(key) || {
            product_id: resolved.product_id, variant_id: resolved.variant_id, quantity: 0, purchase_cost: 0,
          };
          aggregate.quantity += resolved.quantity;
          aggregate.purchase_cost += resolved.quantity * resolved.cost_price;
          aggregateByVariant.set(key, aggregate);
        }
        return resolved;
      });

      const po = native.prepare(
        `INSERT INTO purchase_orders (user_id, code, supplier_id, supplier_name, total_amount, paid_amount, status, note, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(userId, code, supplierId || null, supplier ? supplier.name : null, tongTien, daTra, trangThai, note || null, branchId);
      const poId = Number(po.lastInsertRowid);

      const insertItem = native.prepare(
        'INSERT INTO purchase_order_items (po_id, product_id, product_name, quantity, cost_price, variant_id, variant_label) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const item of resolvedItems) {
        insertItem.run(
          poId, item.product_id, products.get(item.product_id).name, item.quantity, item.cost_price,
          item.variant_id, item.variant_label,
        );
      }

      const updateCost = native.prepare('UPDATE products SET cost_price = ? WHERE id = ? AND user_id = ?');
      const addBranchStock = native.prepare(`
        INSERT INTO branch_stock (branch_id, product_id, stock) VALUES (?, ?, ?)
        ON CONFLICT(branch_id, product_id) DO UPDATE SET stock = stock + excluded.stock
      `);
      const syncTotalStock = native.prepare(`
        UPDATE products
        SET stock = (SELECT COALESCE(SUM(stock), 0) FROM branch_stock WHERE product_id = ?)
        WHERE id = ? AND user_id = ?
      `);
      const addLegacyStock = native.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?');

      for (const [productId, aggregate] of aggregateByProduct.entries()) {
        const product = products.get(productId);
        const oldStock = Number(product.stock) || 0;
        const oldCost = Number(product.cost_price) || 0;
        const newStock = oldStock + aggregate.quantity;
        if (!Number.isFinite(newStock) || newStock <= 0) throw httpError(409, `Tồn kho mới của "${product.name}" không hợp lệ`);
        const newCostRaw = (oldStock * oldCost + aggregate.purchase_cost) / newStock;
        if (!Number.isFinite(newCostRaw) || newCostRaw < 0) throw httpError(409, `Giá vốn mới của "${product.name}" không hợp lệ`);
        updateCost.run(Math.round(newCostRaw), productId, userId);

        if (branchId) {
          addBranchStock.run(branchId, productId, aggregate.quantity);
          syncTotalStock.run(productId, productId, userId);
        } else {
          addLegacyStock.run(aggregate.quantity, productId, userId);
        }
      }

      const updateVariant = native.prepare(
        'UPDATE product_variants SET stock = ?, cost_price = ? WHERE id = ? AND product_id = ?'
      );
      for (const aggregate of aggregateByVariant.values()) {
        const current = native.prepare(
          'SELECT stock, cost_price FROM product_variants WHERE id = ? AND product_id = ?'
        ).get(aggregate.variant_id, aggregate.product_id);
        if (!current) throw httpError(409, 'Phân loại nhập hàng không còn tồn tại');
        const oldVariantStock = Number(current.stock) || 0;
        const oldVariantCost = Number(current.cost_price) || 0;
        const newVariantStock = oldVariantStock + aggregate.quantity;
        const newVariantCost = newVariantStock > 0
          ? (oldVariantStock * oldVariantCost + aggregate.purchase_cost) / newVariantStock
          : 0;
        if (!Number.isFinite(newVariantStock) || !Number.isFinite(newVariantCost)) {
          throw httpError(409, 'Tồn hoặc giá vốn phân loại sau nhập không hợp lệ');
        }
        updateVariant.run(newVariantStock, Math.round(newVariantCost), aggregate.variant_id, aggregate.product_id);
      }

      const insertInventoryLog = native.prepare(
        `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
         VALUES (?, ?, 'IN', ?, ?, ?)`
      );
      for (const item of resolvedItems) {
        insertInventoryLog.run(
          userId, item.product_id, item.quantity,
          `Nhập hàng ${code}${item.variant_label ? ` / ${item.variant_label}` : ''}`,
          branchId,
        );
      }

      if (daTra > 0) {
        const cashFlow = native.prepare(
          `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
           VALUES (?, 'out', 'purchase', ?, ?, ?, ?)`
        ).run(userId, daTra, paymentMethod, code, `Trả tiền nhập hàng ${code}`);

        native.prepare(
          `INSERT INTO payment_evidence
            (user_id, purchase_order_id, cash_flow_id, amount, payment_method, transaction_reference, paid_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          userId,
          poId,
          Number(cashFlow.lastInsertRowid),
          daTra,
          paymentMethod,
          paymentReference,
          paidAt,
          paymentMethod === 'unknown' ? 'NEEDS_METHOD' : 'RECORDED',
        );

        if (paymentMethod === 'unknown') {
          const finding = native.prepare(
            `INSERT INTO compliance_findings
              (user_id, code, severity, subject_type, subject_id, status, message, detail_json)
             VALUES (?, 'PAYMENT_METHOD_MISSING', 'REVIEW', 'purchase_order', ?, 'OPEN', ?, ?)`
          ).run(
            userId,
            String(poId),
            `Phiếu nhập ${code} có thanh toán nhưng chưa xác định phương thức thanh toán.`,
            JSON.stringify({ purchase_code: code, amount: daTra }),
          );
          native.prepare(
            `INSERT OR IGNORE INTO audit_cases (user_id, finding_id, status, note)
             VALUES (?, ?, 'OPEN', 'Tự tạo từ PAYMENT_METHOD_MISSING')`
          ).run(userId, Number(finding.lastInsertRowid));
        }
      }

      if (supplier) {
        native.prepare(
          'UPDATE suppliers SET total_purchased = total_purchased + ?, total_debt = total_debt + ? WHERE id = ? AND user_id = ?'
        ).run(tongTien, conNo, supplier.id, userId);
        if (conNo > 0) {
          native.prepare(
            `INSERT INTO debts (user_id, type, partner_name, amount, paid_amount, status, notes)
             VALUES (?, 'payable', ?, ?, 0, 'unpaid', ?)`
          ).run(userId, supplier.name, conNo, `Nợ nhập hàng ${code}`);
        }
      }

      return { poId, branchId };
    });

    const result = createPurchase.immediate();
    writeAudit(req, {
      action: 'purchase.create',
      target: code,
      detail: {
        tongTien,
        daTra,
        conNo,
        soMatHang: normalizedItems.length,
        soSanPham: aggregateByProduct.size,
        branch_id: result.branchId,
        payment_method: paymentMethod,
      },
    });
    return res.json({
      success: true,
      id: result.poId,
      code,
      total_amount: tongTien,
      con_no: conNo,
      payment_method: paymentMethod,
      payment_evidence_status: daTra > 0 ? (paymentMethod === 'unknown' ? 'NEEDS_METHOD' : 'RECORDED') : null,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;