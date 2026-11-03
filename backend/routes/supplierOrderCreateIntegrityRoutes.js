'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePermission('purchase'));

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

/**
 * Integrity boundary for POST /api/supplier-orders/requests.
 *
 * Supplier-order creation is accounting-neutral: it creates only an ordered request and
 * its immutable request lines. Header + all lines commit in one IMMEDIATE transaction;
 * stock, supplier debt and cash-flow remain unchanged until the receive endpoint runs.
 */
router.post('/requests', (req, res) => {
  const userId = req.tenantId;
  const rawItems = req.body?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: 'Đơn đặt hàng cần ít nhất một mặt hàng' });
  }

  const normalizedItems = [];
  let total = 0;
  for (const rawItem of rawItems) {
    const productId = Number(rawItem?.product_id);
    const quantity = Number(rawItem?.quantity);
    const costPrice = Number(rawItem?.cost_price);
    const rawVariantId = rawItem?.variant_id;
    const variantId = rawVariantId === null || rawVariantId === undefined || rawVariantId === ''
      ? null
      : Number(rawVariantId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Sản phẩm đặt hàng không hợp lệ' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Số lượng đặt phải là số hữu hạn lớn hơn 0' });
    }
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      return res.status(400).json({ error: 'Giá nhập phải là số hữu hạn không âm' });
    }
    if (variantId !== null && (!Number.isInteger(variantId) || variantId <= 0)) {
      return res.status(400).json({ error: 'Phân loại sản phẩm không hợp lệ' });
    }

    const lineTotal = quantity * costPrice;
    if (!Number.isFinite(lineTotal)) {
      return res.status(400).json({ error: 'Giá trị dòng đặt hàng vượt giới hạn hợp lệ' });
    }
    total += lineTotal;
    if (!Number.isFinite(total)) {
      return res.status(400).json({ error: 'Tổng tiền đơn đặt hàng vượt giới hạn hợp lệ' });
    }
    normalizedItems.push({ productId, quantity, costPrice, variantId });
  }

  const rawSupplierId = req.body?.supplier_id;
  const supplierId = rawSupplierId === null || rawSupplierId === undefined || rawSupplierId === ''
    ? null
    : Number(rawSupplierId);
  if (supplierId !== null && (!Number.isInteger(supplierId) || supplierId <= 0)) {
    return res.status(400).json({ error: 'Nhà cung cấp không hợp lệ' });
  }

  const rawBranchId = req.body?.branch_id;
  const branchId = rawBranchId === null || rawBranchId === undefined || rawBranchId === ''
    ? null
    : Number(rawBranchId);
  if (branchId !== null && (!Number.isInteger(branchId) || branchId <= 0)) {
    return res.status(400).json({ error: 'Chi nhánh không hợp lệ' });
  }

  const expectedDate = String(req.body?.expected_date || '').trim() || null;
  const note = String(req.body?.note || '').trim() || null;

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') {
      throw new Error('SQLite transaction engine unavailable');
    }

    const createRequest = native.transaction(() => {
      const branch = branchId !== null
        ? native.prepare('SELECT id, name FROM branches WHERE id = ? AND user_id = ?').get(branchId, userId)
        : native.prepare('SELECT id, name FROM branches WHERE user_id = ? ORDER BY is_default DESC, id ASC LIMIT 1').get(userId);
      if (!branch) throw httpError(404, 'Không tìm thấy chi nhánh thuộc cửa hàng của bạn');

      let supplier = null;
      if (supplierId !== null) {
        supplier = native.prepare('SELECT id, name FROM suppliers WHERE id = ? AND user_id = ?').get(supplierId, userId);
        if (!supplier) throw httpError(404, 'Không tìm thấy nhà cung cấp');
      }

      const productStmt = native.prepare('SELECT id, name FROM products WHERE id = ? AND user_id = ?');
      const variantsStmt = native.prepare(
        'SELECT id, sku, attributes_json FROM product_variants WHERE product_id = ? ORDER BY id ASC'
      );
      const productNames = new Map();
      const resolvedItems = [];
      for (const item of normalizedItems) {
        let product = productNames.get(item.productId);
        if (!product) {
          product = productStmt.get(item.productId, userId);
          if (!product) throw httpError(403, 'Có sản phẩm không thuộc cửa hàng của bạn');
          productNames.set(item.productId, product);
        }
        const variants = variantsStmt.all(item.productId);
        let selectedVariant = null;
        if (item.variantId !== null) {
          selectedVariant = variants.find((row) => Number(row.id) === Number(item.variantId)) || null;
          if (!selectedVariant) throw httpError(400, `Phân loại đã chọn không thuộc sản phẩm "${product.name}"`);
        } else if (variants.length === 1) {
          selectedVariant = variants[0];
        } else if (variants.length > 1) {
          throw httpError(400, `Sản phẩm "${product.name}" có nhiều phân loại. Hãy chọn đúng phân loại cần nhập.`);
        }
        resolvedItems.push({
          ...item,
          variantId: selectedVariant ? Number(selectedVariant.id) : null,
          variantLabel: variantLabel(selectedVariant),
        });
      }

      const code = `DH-NCC${Date.now().toString().slice(-7)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
      const inserted = native.prepare(
        `INSERT INTO purchase_requests
          (user_id, code, supplier_id, supplier_name, branch_id, total_amount, status, expected_date, note)
         VALUES (?, ?, ?, ?, ?, ?, 'ordered', ?, ?)`
      ).run(
        userId,
        code,
        supplierId,
        supplier ? supplier.name : null,
        branch.id,
        total,
        expectedDate,
        note,
      );
      const requestId = Number(inserted.lastInsertRowid);

      const insertItem = native.prepare(
        `INSERT INTO purchase_request_items
          (request_id, product_id, product_name, quantity, cost_price, variant_id, variant_label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of resolvedItems) {
        insertItem.run(
          requestId,
          item.productId,
          productNames.get(item.productId).name || '',
          item.quantity,
          item.costPrice,
          item.variantId,
          item.variantLabel,
        );
      }

      return {
        requestId,
        code,
        total,
        branchId: Number(branch.id),
        supplierId,
        itemCount: normalizedItems.length,
      };
    });

    const result = createRequest.immediate();
    writeAudit(req, {
      action: 'porder.create',
      target: result.code,
      detail: {
        tong: result.total,
        so_mat_hang: result.itemCount,
        branch_id: result.branchId,
        supplier_id: result.supplierId,
      },
    });

    return res.json({
      success: true,
      id: result.requestId,
      code: result.code,
      total_amount: result.total,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
