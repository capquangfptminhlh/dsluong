'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { triggerEvent } = require('./workflowRoutes');
const { requireAuth, requireWebhookSecret, requireAnyPermission, writeAudit } = require('../middleware/auth');
const { doiTonChiNhanh } = require('./branchRoutes');
const { resolvePosBranch } = require('../utils/branchAccess');
const { formatBusinessDate, addCalendarMonths } = require('../utils/businessDate');

const canSell = requireAnyPermission('pos');
const canReadOrders = requireAnyPermission('orders', 'pos');

const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

const neutralCategory = (value) => String(value || '')
  .replace(/\s*\((?:\d+(?:[.,]\d+)?%)\)\s*$/u, '')
  .trim();

async function revenueClassification(userId) {
  const configured = await get('SELECT value FROM shop_settings WHERE user_id = ? AND key = ?', [userId, 'tax_category']);
  return neutralCategory(configured?.value) || 'Chưa phân loại';
}

async function resolveCustomerPrices(userId, customerPhone, productIds) {
  if (!productIds.length) return new Map();

  let levelId = null;
  const normalizedPhone = String(customerPhone || '').trim();
  if (normalizedPhone) {
    const customer = await get(
      'SELECT price_level_id FROM customers WHERE user_id = ? AND phone = ?',
      [userId, normalizedPhone],
    );
    if (customer?.price_level_id) {
      const level = await get(
        'SELECT id FROM price_levels WHERE id = ? AND user_id = ?',
        [customer.price_level_id, userId],
      );
      if (!level) {
        const error = new Error('Bảng giá của khách không còn hợp lệ. Hãy gán lại bảng giá trước khi bán.');
        error.status = 409;
        throw error;
      }
      levelId = Number(level.id);
    }
  }

  if (!levelId) {
    const defaultLevel = await get(
      'SELECT id FROM price_levels WHERE user_id = ? AND is_default = 1 ORDER BY id ASC LIMIT 1',
      [userId],
    );
    levelId = defaultLevel?.id ? Number(defaultLevel.id) : null;
  }
  if (!levelId) return new Map();

  const placeholders = productIds.map(() => '?').join(',');
  const rows = await all(
    `SELECT pp.product_id, pp.price
     FROM product_prices pp
     JOIN products p ON p.id = pp.product_id AND p.user_id = ?
     JOIN price_levels pl ON pl.id = pp.level_id AND pl.user_id = ?
     WHERE pp.level_id = ? AND pp.product_id IN (${placeholders})`,
    [userId, userId, levelId, ...productIds],
  );
  const prices = new Map();
  for (const row of rows) {
    const price = Number(row.price);
    if (!Number.isFinite(price) || price < 0) {
      const error = new Error(`Bảng giá chứa giá không hợp lệ cho sản phẩm ${row.product_id}.`);
      error.status = 409;
      throw error;
    }
    prices.set(Number(row.product_id), price);
  }
  return prices;
}

async function authoritativeCart(userId, cart, customerPhone) {
  if (!Array.isArray(cart) || cart.length === 0) {
    const error = new Error('Giỏ hàng trống.');
    error.status = 400;
    throw error;
  }

  const productIds = [...new Set(cart.filter((item) => !item.combo_id).map((item) => Number(item.id)).filter(Boolean))];
  const products = new Map();
  if (productIds.length) {
    const placeholders = productIds.map(() => '?').join(',');
    const rows = await all(
      `SELECT id, user_id, name, sku, price, cost_price, stock, track_batch, track_serial, warranty_months, warranty_options_json
       FROM products WHERE id IN (${placeholders}) AND user_id = ?`,
      [...productIds, userId],
    );
    rows.forEach((row) => products.set(Number(row.id), row));
    if (products.size !== productIds.length) {
      const error = new Error('Giỏ hàng chứa sản phẩm không thuộc cửa hàng của bạn.');
      error.status = 403;
      throw error;
    }
  }
  const customerPrices = await resolveCustomerPrices(userId, customerPhone, productIds);

  const comboIds = [...new Set(cart.map((item) => Number(item.combo_id)).filter(Boolean))];
  const combos = new Map();
  if (comboIds.length) {
    const placeholders = comboIds.map(() => '?').join(',');
    const comboRows = await all(
      `SELECT id, name, price FROM combos WHERE id IN (${placeholders}) AND user_id = ?`,
      [...comboIds, userId],
    );
    if (comboRows.length !== comboIds.length) {
      const error = new Error('Giỏ hàng chứa combo không thuộc cửa hàng của bạn.');
      error.status = 403;
      throw error;
    }
    for (const combo of comboRows) {
      const parts = await all(
        `SELECT ci.product_id, ci.quantity, p.name, p.stock, p.cost_price, p.track_batch, p.track_serial
         FROM combo_items ci
         JOIN products p ON p.id = ci.product_id AND p.user_id = ?
         WHERE ci.combo_id = ?`,
        [userId, combo.id],
      );
      if (!parts.length) {
        const error = new Error(`Combo "${combo.name}" chưa có thành phần.`);
        error.status = 409;
        throw error;
      }
      combos.set(Number(combo.id), { ...combo, parts });
    }
  }

  const normalized = [];
  for (const input of cart) {
    const quantity = Number(input.quantity);
    const lineDiscount = Math.max(0, Number(input.discount) || 0);
    if (!(quantity > 0)) {
      const error = new Error('Số lượng phải lớn hơn 0.');
      error.status = 400;
      throw error;
    }

    if (input.combo_id) {
      const combo = combos.get(Number(input.combo_id));
      const gross = Number(combo.price) * quantity;
      if (lineDiscount > gross) {
        const error = new Error(`Giảm giá dòng combo "${combo.name}" lớn hơn giá trị dòng.`);
        error.status = 400;
        throw error;
      }
      normalized.push({
        kind: 'combo', combo_id: Number(combo.id), product_id: null, name: combo.name,
        quantity, unit_ratio: 1, unit_name: null, price: Number(combo.price) || 0,
        discount: lineDiscount,
        cost_price: combo.parts.reduce((sum, part) => sum + (Math.max(0, Number(part.cost_price) || 0) * (Number(part.quantity) || 0)), 0),
        parts: combo.parts,
      });
      continue;
    }

    const product = products.get(Number(input.id));
    let unitRatio = 1;
    let unitName = null;
    let variantId = null;
    let variantLabel = null;
    let variantSku = null;
    let unitPrice = customerPrices.has(Number(product.id))
      ? customerPrices.get(Number(product.id))
      : (Number(product.price) || 0);
    let baseUnitCost = Number(product.cost_price);
    if (!Number.isFinite(baseUnitCost) || baseUnitCost < 0) baseUnitCost = 0;
    if (input.variant_id) {
      const variant = await get(
        `SELECT id, sku, price, cost_price, stock, attributes_json FROM product_variants WHERE id = ? AND product_id = ?`,
        [Number(input.variant_id), product.id],
      );
      if (!variant) {
        const error = new Error(`Phân loại đã chọn không hợp lệ cho ${product.name}.`);
        error.status = 400;
        throw error;
      }
      variantId = Number(variant.id);
      variantSku = variant.sku || null;
      try {
        const attributes = JSON.parse(variant.attributes_json || '{}');
        variantLabel = Object.values(attributes).map((value) => String(value || '').trim()).filter(Boolean).join(' / ') || variantSku;
      } catch (_) {
        variantLabel = variantSku;
      }
      const variantPrice = Number(variant.price);
      if (!Number.isFinite(variantPrice) || variantPrice < 0) {
        const error = new Error(`Giá phân loại của ${product.name} không hợp lệ.`);
        error.status = 409;
        throw error;
      }
      unitPrice = variantPrice;
      if (variant.cost_price !== null && variant.cost_price !== undefined && variant.cost_price !== '') {
        const variantCost = Number(variant.cost_price);
        if (Number.isFinite(variantCost) && variantCost >= 0) baseUnitCost = variantCost;
      }
    }
    if (input.unit_name) {
      const unit = await get(
        `SELECT name, ratio, price FROM product_units
         WHERE user_id = ? AND product_id = ? AND name = ?`,
        [userId, product.id, String(input.unit_name)],
      );
      if (!unit) {
        const error = new Error(`Đơn vị "${input.unit_name}" không hợp lệ cho ${product.name}.`);
        error.status = 400;
        throw error;
      }
      unitRatio = Number(unit.ratio) > 0 ? Number(unit.ratio) : 1;
      unitName = unit.name;
      unitPrice = Number(unit.price) || 0;
    }
    const lineCostPrice = Math.max(0, baseUnitCost * unitRatio);
    const defaultWarrantyMonths = Number(product.warranty_months) || 0;
    const requestedWarrantyMonths = input.warranty_months === undefined || input.warranty_months === null || input.warranty_months === ''
      ? defaultWarrantyMonths
      : Number(input.warranty_months);
    if (!Number.isInteger(requestedWarrantyMonths) || requestedWarrantyMonths < 0 || requestedWarrantyMonths > 240) {
      const error = new Error(`Thời hạn bảo hành của "${product.name}" phải từ 0 đến 240 tháng.`);
      error.status = 400;
      throw error;
    }
    let warrantyOptions = [];
    try {
      const parsed = JSON.parse(product.warranty_options_json || '[]');
      warrantyOptions = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      warrantyOptions = [];
    }
    if (warrantyOptions.length) {
      const selected = warrantyOptions.find((option) => Number(option.months) === requestedWarrantyMonths);
      if (!selected) {
        const error = new Error(`Gói bảo hành ${requestedWarrantyMonths} tháng không hợp lệ cho "${product.name}".`);
        error.status = 400;
        throw error;
      }
      const packagePrice = Number(selected.price);
      if (!Number.isFinite(packagePrice) || packagePrice < 0) {
        const error = new Error(`Giá gói bảo hành của "${product.name}" không hợp lệ.`);
        error.status = 409;
        throw error;
      }
      unitPrice = packagePrice;
    }
    let manualPrice = null;
    if (input.manual_price !== undefined && input.manual_price !== null && input.manual_price !== '') {
      manualPrice = Number(input.manual_price);
      if (!Number.isFinite(manualPrice) || manualPrice < 0) {
        const error = new Error(`Giá sửa tay của "${product.name}" không hợp lệ.`);
        error.status = 400;
        throw error;
      }
      unitPrice = manualPrice;
    }
    const gross = unitPrice * quantity;
    if (lineDiscount > gross) {
      const error = new Error(`Giảm giá dòng "${product.name}" lớn hơn giá trị dòng.`);
      error.status = 400;
      throw error;
    }
    const lineName = variantLabel ? `${product.name} - ${variantLabel}` : product.name;
    normalized.push({
      kind: 'product', product_id: Number(product.id), combo_id: null, name: lineName,
      quantity, unit_ratio: unitRatio, unit_name: unitName, price: unitPrice, cost_price: lineCostPrice,
      discount: lineDiscount, product, warranty_months: requestedWarrantyMonths,
      variant_id: variantId, variant_label: variantLabel, sku: variantSku || product.sku || null, manual_price: manualPrice,
      serials: Array.isArray(input.serials) ? input.serials.map(String) : [],
    });
  }
  return normalized;
}

function variantStockRequirements(lines) {
  const requirements = new Map();
  for (const line of lines) {
    if (line.kind !== 'product' || !line.variant_id) continue;
    const key = `${line.product_id}:${line.variant_id}`;
    const current = requirements.get(key) || {
      product_id: Number(line.product_id), variant_id: Number(line.variant_id), quantity: 0, name: line.name,
    };
    current.quantity += Number(line.quantity) * Number(line.unit_ratio || 1);
    requirements.set(key, current);
  }
  return [...requirements.values()];
}

async function assertVariantStock(userId, requirements) {
  for (const item of requirements) {
    const row = await get(
      `SELECT pv.stock
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = ? AND pv.product_id = ? AND p.user_id = ?`,
      [item.variant_id, item.product_id, userId],
    );
    if (!row) {
      const error = new Error(`Phân loại của "${item.name}" không còn hợp lệ.`);
      error.status = 409;
      throw error;
    }
    const available = Number(row.stock) || 0;
    if (available < item.quantity) {
      const error = new Error(`Không đủ tồn phân loại "${item.name}": cần ${item.quantity}, hiện có ${available}.`);
      error.status = 409;
      throw error;
    }
  }
}

async function changeVariantStock(userId, productId, variantId, delta) {
  if (!variantId) return;
  const result = await run(
    `UPDATE product_variants
     SET stock = stock + ?
     WHERE id = ? AND product_id = ?
       AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_variants.product_id AND p.user_id = ?)`,
    [delta, variantId, productId, userId],
  );
  if (!result.changes) {
    const error = new Error(`Không thể cập nhật tồn phân loại ${variantId} của sản phẩm ${productId}.`);
    error.status = 409;
    throw error;
  }
}

function stockRequirements(lines) {
  const requirements = new Map();
  const add = (productId, quantity, name, trackBatch = 0, trackSerial = 0) => {
    const current = requirements.get(Number(productId)) || { product_id: Number(productId), quantity: 0, name, track_batch: trackBatch, track_serial: trackSerial };
    current.quantity += Number(quantity) || 0;
    current.track_batch = current.track_batch || trackBatch;
    current.track_serial = current.track_serial || trackSerial;
    requirements.set(Number(productId), current);
  };
  for (const line of lines) {
    if (line.kind === 'product') {
      add(line.product_id, line.quantity * line.unit_ratio, line.name, line.product.track_batch, line.product.track_serial);
    } else {
      for (const part of line.parts) add(part.product_id, Number(part.quantity) * line.quantity, part.name, part.track_batch, part.track_serial);
    }
  }
  return [...requirements.values()];
}

async function assertStock(userId, branchId, requirements) {
  for (const item of requirements) {
    let available;
    if (branchId) {
      const row = await get(
        `SELECT COALESCE(bs.stock, 0) AS stock
         FROM products p
         LEFT JOIN branch_stock bs ON bs.product_id = p.id AND bs.branch_id = ?
         WHERE p.id = ? AND p.user_id = ?`,
        [branchId, item.product_id, userId],
      );
      if (!row) {
        const error = new Error(`Sản phẩm ${item.name} không thuộc cửa hàng.`);
        error.status = 403;
        throw error;
      }
      available = Number(row.stock) || 0;
    } else {
      const row = await get('SELECT stock FROM products WHERE id = ? AND user_id = ?', [item.product_id, userId]);
      available = Number(row?.stock) || 0;
    }
    if (available < item.quantity) {
      const error = new Error(`Không đủ tồn "${item.name}": cần ${item.quantity}, hiện có ${available}.`);
      error.status = 409;
      throw error;
    }
  }
}

async function consumeBatches(userId, branchId, orderId, orderItemId, productId, quantity, mustTrack) {
  if (!mustTrack) return [];
  if (!branchId) {
    const error = new Error(`Sản phẩm ${productId} theo dõi lô nhưng đơn chưa xác định chi nhánh bán.`);
    error.status = 409;
    throw error;
  }
  if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
    const error = new Error(`Số lượng FEFO không hợp lệ cho sản phẩm ${productId}.`);
    error.status = 409;
    throw error;
  }

  const batches = await all(
    `SELECT id, quantity FROM product_batches
     WHERE user_id = ? AND product_id = ? AND branch_id = ? AND quantity > 0
       AND COALESCE(status, 'active') = 'active'
     ORDER BY (expiry_date IS NULL), expiry_date ASC, id ASC`,
    [userId, productId, branchId],
  );
  const total = batches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
  if (total < quantity) {
    const unresolved = await get(
      `SELECT COALESCE(SUM(quantity), 0) AS quantity
       FROM product_batches
       WHERE user_id = ? AND product_id = ? AND branch_id IS NULL AND quantity > 0
         AND COALESCE(status, 'active') = 'active'`,
      [userId, productId],
    );
    if (Number(unresolved?.quantity || 0) > 0) {
      const error = new Error(`Có lô cũ của sản phẩm ${productId} chưa xác định chi nhánh. Hãy vào Lô & Hạn sử dụng để gán đúng kho trước khi bán.`);
      error.status = 409;
      throw error;
    }
    const error = new Error(`Tồn theo lô tại chi nhánh không đủ cho sản phẩm ${productId}: cần ${quantity}, có ${total}.`);
    error.status = 409;
    throw error;
  }

  const allocations = [];
  let remaining = Number(quantity);
  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = Number(batch.quantity) || 0;
    const take = Math.min(available, remaining);
    if (!(take > 0)) continue;
    const updated = await run(
      `UPDATE product_batches SET quantity = quantity - ?
       WHERE id = ? AND user_id = ? AND branch_id = ?
         AND COALESCE(status, 'active') = 'active' AND quantity >= ?`,
      [take, batch.id, userId, branchId, take],
    );
    if (!updated.changes) {
      const error = new Error(`Lô ${batch.id} vừa thay đổi trong lúc bán; vui lòng thử lại.`);
      error.status = 409;
      throw error;
    }
    const allocation = await run(
      `INSERT INTO pos_batch_allocations
        (user_id, order_id, order_item_id, product_id, batch_id, branch_id, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, orderId, orderItemId || null, productId, batch.id, branchId, take],
    );
    allocations.push({ id: allocation.lastID, batch_id: batch.id, quantity: take });
    remaining -= take;
  }
  if (remaining > 1e-9) {
    const error = new Error(`Không thể phân bổ đủ lô cho sản phẩm ${productId}; còn thiếu ${remaining}.`);
    error.status = 409;
    throw error;
  }
  return allocations;
}

async function markSerialsSold(userId, line, orderCode, customerName, customerPhone, orderItemId) {
  const baseQuantity = line.quantity * line.unit_ratio;
  const hasSerialTracking = Boolean(line.product.track_serial || line.serials.length);

  if (hasSerialTracking) {
    if (line.serials.length !== baseQuantity) {
      const error = new Error(`Sản phẩm "${line.name}" cần đúng ${baseQuantity} serial cho số lượng bán.`);
      error.status = 409;
      throw error;
    }
    for (const serial of line.serials) {
      const result = await run(
        `UPDATE product_serials SET status = 'sold', order_code = ?, sold_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND product_id = ? AND serial = ? AND status = 'in_stock'`,
        [orderCode, userId, line.product_id, serial],
      );
      if (!result.changes) {
        const error = new Error(`Serial ${serial} không tồn tại hoặc đã bán.`);
        error.status = 409;
        throw error;
      }
    }
  }

  const months = Number(line.warranty_months) || 0;
  if (months <= 0) return;

  const startDate = formatBusinessDate();
  const endDate = addCalendarMonths(startDate, months);
  const warrantySerials = line.serials.length ? line.serials : [null];
  for (const serial of warrantySerials) {
    await run(
      `INSERT INTO warranties
        (user_id, order_code, order_item_id, product_id, product_name, serial, customer_name, customer_phone,
         months, quantity, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, orderCode, orderItemId || null, line.product_id, line.name, serial,
        customerName || null, customerPhone || null, months, serial ? 1 : baseQuantity, startDate, endDate],
    );
  }
}

router.post('/checkout', requireAuth, canSell, async (req, res) => {
  const userId = req.tenantId;
  try {
    const lines = await authoritativeCart(userId, req.body.cart, req.body.customer_phone);
    const hasWarranty = lines.some((line) => line.kind === 'product' && Number(line.warranty_months) > 0);
    if (hasWarranty && !String(req.body.customer_phone || '').trim()) {
      return res.status(400).json({ error: 'Đơn có bảo hành: vui lòng nhập số điện thoại khách ngay trên đơn để tự tạo phiếu bảo hành.' });
    }
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity - line.discount, 0);
    const orderDiscount = Math.max(0, Number(req.body.discount) || 0);
    if (orderDiscount > subtotal) return res.status(400).json({ error: 'Giảm giá đơn lớn hơn tiền hàng.' });

    const afterDiscount = subtotal - orderDiscount;
    const vatRate = Math.max(0, Number(req.body.vat_rate) || 0);
    if (vatRate > 100) return res.status(400).json({ error: 'Tỷ lệ VAT không hợp lệ.' });
    const vatAmount = Math.round(afterDiscount * vatRate / 100);
    const totalAmount = afterDiscount + vatAmount;

    let paidCash = Number(req.body.paid_cash);
    let paidBank = Number(req.body.paid_bank);
    if (Number.isNaN(paidCash) && Number.isNaN(paidBank)) {
      paidCash = req.body.payment_method === 'bank' ? 0 : totalAmount;
      paidBank = req.body.payment_method === 'bank' ? totalAmount : 0;
    }
    paidCash = Math.max(0, paidCash || 0);
    paidBank = Math.max(0, paidBank || 0);
    if (paidCash + paidBank > totalAmount) return res.status(400).json({ error: 'Số tiền thanh toán vượt tổng đơn.' });

    const debtAmount = Math.max(0, totalAmount - paidCash - paidBank);
    if (debtAmount > 0 && !req.body.cho_no) return res.status(400).json({ error: 'Khách còn thiếu tiền. Bật bán ghi nợ nếu muốn cho nợ.' });
    if (debtAmount > 0 && !req.body.customer_phone) return res.status(400).json({ error: 'Bán ghi nợ phải có số điện thoại khách.' });

    const branchId = resolvePosBranch(req, req.body.branch_id);
    const requirements = stockRequirements(lines);
    const variantRequirements = variantStockRequirements(lines);
    const classification = await revenueClassification(userId);
    const orderCode = `DH${Date.now().toString(36).toUpperCase()}`;
    const date = formatBusinessDate();
    const paymentMethod = paidCash > 0 && paidBank > 0 ? 'mixed' : (paidBank > 0 ? 'bank' : 'cash');
    const status = paidBank > 0 ? 'pending_payment' : 'paid';

    await run('BEGIN IMMEDIATE');
    try {
      await assertStock(userId, branchId, requirements);
      await assertVariantStock(userId, variantRequirements);

      if (req.body.promotion_id) {
        const promo = await get('SELECT id FROM promotions WHERE id = ? AND user_id = ?', [req.body.promotion_id, userId]);
        if (!promo) {
          const error = new Error('Khuyến mãi không thuộc cửa hàng hiện tại.');
          error.status = 403;
          throw error;
        }
      }

      const order = await run(
        `INSERT INTO pos_orders
          (user_id, order_code, subtotal, discount, promotion_id, vat_rate, vat_amount, total_amount,
           paid_cash, paid_bank, debt_amount, customer_name, customer_phone, payment_method, branch_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, orderCode, subtotal, orderDiscount, req.body.promotion_id || null, vatRate, vatAmount, totalAmount,
          paidCash, paidBank, debtAmount, req.body.customer_name || null, req.body.customer_phone || null,
          paymentMethod, branchId || null, status],
      );

      for (const line of lines) {
        const orderItem = await run(
          `INSERT INTO pos_order_items
            (order_id, product_id, product_name, quantity, price, cost_price, discount, unit_name, unit_ratio, combo_id, warranty_months, variant_id, variant_label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [order.lastID, line.product_id, line.name, line.quantity, line.price, Number(line.cost_price) || 0, line.discount,
            line.unit_name, line.unit_ratio, line.combo_id, Number(line.warranty_months) || 0, line.variant_id || null, line.variant_label || null],
        );

        if (line.kind === 'product') {
          const baseQuantity = line.quantity * line.unit_ratio;
          if (branchId) await doiTonChiNhanh(branchId, line.product_id, -baseQuantity);
          else await run('UPDATE products SET stock = stock - ? WHERE id = ? AND user_id = ?', [baseQuantity, line.product_id, userId]);
          await changeVariantStock(userId, line.product_id, line.variant_id, -baseQuantity);
          await consumeBatches(userId, branchId, order.lastID, orderItem.lastID, line.product_id, baseQuantity, line.product.track_batch);
          await markSerialsSold(userId, line, orderCode, req.body.customer_name, req.body.customer_phone, orderItem.lastID);
          await run(
            `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
             VALUES (?, ?, 'OUT', ?, ?, ?)`,
            [userId, line.product_id, baseQuantity, `Bán hàng ${orderCode}`, branchId || null],
          );
        } else {
          for (const part of line.parts) {
            const baseQuantity = Number(part.quantity) * line.quantity;
            if (branchId) await doiTonChiNhanh(branchId, part.product_id, -baseQuantity);
            else await run('UPDATE products SET stock = stock - ? WHERE id = ? AND user_id = ?', [baseQuantity, part.product_id, userId]);
            await consumeBatches(userId, branchId, order.lastID, orderItem.lastID, part.product_id, baseQuantity, part.track_batch);
            await run(
              `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
               VALUES (?, ?, 'OUT', ?, ?, ?)`,
              [userId, part.product_id, baseQuantity, `Bán combo ${line.name} / ${orderCode}`, branchId || null],
            );
          }
        }
      }

      if (req.body.promotion_id) {
        await run('UPDATE promotions SET usage_count = COALESCE(usage_count, 0) + 1 WHERE id = ? AND user_id = ?', [req.body.promotion_id, userId]);
      }

      let customerId = null;
      if (req.body.customer_phone) {
        const customerName = req.body.customer_name || 'Khách vãng lai';
        await run(
          `INSERT INTO customers (user_id, name, phone, total_spend, tags)
           VALUES (?, ?, ?, ?, 'Khách vãng lai')
           ON CONFLICT(user_id, phone) DO UPDATE SET total_spend = total_spend + excluded.total_spend`,
          [userId, customerName, req.body.customer_phone, totalAmount],
        );
        const customer = await get('SELECT id FROM customers WHERE user_id = ? AND phone = ?', [userId, req.body.customer_phone]);
        customerId = customer?.id || null;
        if (customerId) await run('UPDATE pos_orders SET customer_id = ? WHERE id = ? AND user_id = ?', [customerId, order.lastID, userId]);

        if (debtAmount > 0) {
          await run(
            `INSERT INTO debts (user_id, type, partner_name, amount, paid_amount, status, notes, order_code, customer_id)
             VALUES (?, 'receivable', ?, ?, 0, 'unpaid', ?, ?, ?)`,
            [userId, customerName, debtAmount, `Bán ghi nợ đơn ${orderCode}`, orderCode, customerId],
          );
        }
      }

      if (paidCash > 0) {
        await run(
          `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes, branch_id)
           VALUES (?, 'in', 'sales', ?, 'cash', ?, ?, ?)`,
          [userId, paidCash, orderCode, `Bán hàng ${orderCode}`, branchId],
        );
      }
      // Bank payment is recorded only when the signed VietQR webhook confirms it.

      await run(
        `INSERT INTO transactions (date, voucherNumber, description, amount, category, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [date, orderCode, `Bán hàng POS - ${orderCode}`, afterDiscount, classification, userId],
      );

      await run('COMMIT');

      writeAudit(req, { action: 'pos.checkout', target: orderCode, detail: { totalAmount, paidCash, paidBank, debtAmount, branchId, lines: lines.length } });
      Promise.resolve(triggerEvent('ORDER_CREATED', {
        order_code: orderCode,
        total_amount: totalAmount,
        customer_phone: req.body.customer_phone || null,
      }, userId)).catch((error) => console.error('[WORKFLOW] ORDER_CREATED:', error.message));

      res.json({
        success: true,
        order_code: orderCode,
        receipt_url: `/receipt/${order.lastID}`,
        subtotal,
        discount: orderDiscount,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        paid_cash: paidCash,
        paid_bank: paidBank,
        debt_amount: debtAmount,
        payment_status: status,
      });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Checkout failed.' });
  }
});

router.post('/vietqr-webhook', requireWebhookSecret, async (req, res) => {
  try {
    const data = Array.isArray(req.body?.data) ? req.body.data : [];
    const userId = req.body?.user_id;
    if (!userId) return res.status(400).json({ error: 'Thiếu user_id của cửa hàng nhận tiền.' });
    if (!data.length) return res.json({ success: false, matched: false });

    const description = String(data[0]?.description || data[0]?.content || '');
    const match = description.match(/\b(DH[A-Z0-9]+|ORD-\d+)\b/i);
    if (!match) return res.json({ success: true, matched: false });
    const orderCode = match[1].toUpperCase();

    await run('BEGIN IMMEDIATE');
    try {
      const order = await get('SELECT * FROM pos_orders WHERE user_id = ? AND UPPER(order_code) = ?', [userId, orderCode]);
      if (!order) {
        await run('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy đơn phù hợp webhook.' });
      }
      if (order.status !== 'paid') {
        await run('UPDATE pos_orders SET status = ? WHERE id = ? AND user_id = ?', ['paid', order.id, userId]);
        if (Number(order.paid_bank) > 0) {
          await run(
            `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes, branch_id)
             SELECT ?, 'in', 'sales', ?, 'bank', ?, ?, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM cash_flows WHERE user_id = ? AND transaction_type = 'in' AND category = 'sales'
                 AND payment_method = 'bank' AND reference_id = ?
             )`,
            [userId, Number(order.paid_bank), order.order_code, `VietQR xác nhận ${order.order_code}`, order.branch_id || null, userId, order.order_code],
          );
        }
      }
      await run('COMMIT');
      res.json({ success: true, matched: true, order_code: order.order_code, status: 'paid' });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/order/:orderCode', requireAuth, canReadOrders, async (req, res) => {
  try {
    const branchId = req.user.actorType === 'staff' ? resolvePosBranch(req, null) : null;
    const order = await get(
      `SELECT status FROM pos_orders WHERE user_id = ? AND order_code = ? ${branchId === null ? '' : 'AND branch_id = ?'}`,
      branchId === null ? [req.tenantId, req.params.orderCode] : [req.tenantId, req.params.orderCode, branchId],
    );
    res.json({ status: order ? order.status : 'not_found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/cancel', requireAuth, canReadOrders, async (req, res) => {
  const userId = req.tenantId;
  try {
    await run('BEGIN IMMEDIATE');
    try {
      const order = await get('SELECT * FROM pos_orders WHERE id = ? AND user_id = ?', [req.params.id, userId]);
      if (!order) {
        const error = new Error('Không tìm thấy đơn hàng.');
        error.status = 404;
        throw error;
      }
      if (req.user.actorType === 'staff' && Number(order.branch_id) !== resolvePosBranch(req, null)) {
        const error = new Error('Không được hủy đơn ở chi nhánh khác.');
        error.status = 403;
        throw error;
      }
      if (order.status === 'cancelled') {
        const error = new Error('Đơn đã hủy.');
        error.status = 409;
        throw error;
      }
      const priorReturn = await get('SELECT id, code FROM returns WHERE user_id = ? AND order_id = ? LIMIT 1', [userId, order.id]);
      if (priorReturn) {
        const error = new Error(`Đơn đã có phiếu trả ${priorReturn.code || priorReturn.id}; không thể hủy toàn bộ vì sẽ hoàn tồn/tiền trùng.`);
        error.status = 409;
        throw error;
      }

      const items = await all(
        `SELECT product_id, combo_id, product_name, quantity, COALESCE(unit_ratio, 1) AS unit_ratio, variant_id
         FROM pos_order_items WHERE order_id = ?`,
        [order.id],
      );
      if (items.some((item) => !item.product_id && !item.combo_id)) {
        const error = new Error('Đơn combo legacy thiếu liên kết thành phần; cần review thủ công trước khi hủy để tránh sai tồn.');
        error.status = 409;
        throw error;
      }

      const trackedRequired = new Map();
      const addTrackedRequired = (productId, quantity) => {
        const id = Number(productId);
        const value = Number(quantity);
        if (!Number.isFinite(value) || value <= 0) {
          const error = new Error(`Số lượng lô cần hoàn không hợp lệ cho sản phẩm ${id}.`);
          error.status = 409;
          throw error;
        }
        trackedRequired.set(id, (trackedRequired.get(id) || 0) + value);
      };

      for (const item of items) {
        if (item.product_id) {
          const product = await get('SELECT track_batch FROM products WHERE id = ? AND user_id = ?', [item.product_id, userId]);
          if (!product) {
            const error = new Error(`Sản phẩm ${item.product_id} của đơn không còn thuộc cửa hàng.`);
            error.status = 409;
            throw error;
          }
          if (product.track_batch) {
            addTrackedRequired(item.product_id, Number(item.quantity) * (Number(item.unit_ratio) > 0 ? Number(item.unit_ratio) : 1));
          }
        } else if (item.combo_id) {
          const parts = await all(
            `SELECT ci.product_id, ci.quantity, p.track_batch
             FROM combo_items ci
             JOIN products p ON p.id = ci.product_id AND p.user_id = ?
             WHERE ci.combo_id = ?`,
            [userId, item.combo_id],
          );
          if (!parts.length) {
            const error = new Error('Combo của đơn không còn đủ thành phần để hoàn tồn; cần review thủ công.');
            error.status = 409;
            throw error;
          }
          for (const part of parts) {
            if (part.track_batch) addTrackedRequired(part.product_id, Number(part.quantity) * Number(item.quantity));
          }
        }
      }

      const allocations = await all(
        `SELECT a.id, a.product_id, a.batch_id, a.branch_id, a.quantity, a.restored_at,
                pb.status AS batch_status, pb.branch_id AS batch_branch_id
         FROM pos_batch_allocations a
         LEFT JOIN product_batches pb ON pb.id = a.batch_id AND pb.user_id = a.user_id
         WHERE a.user_id = ? AND a.order_id = ?
         ORDER BY a.id ASC`,
        [userId, order.id],
      );
      const allocatedByProduct = new Map();
      for (const allocation of allocations) {
        const quantity = Number(allocation.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          const error = new Error(`Allocation lô ${allocation.id} của đơn không hợp lệ.`);
          error.status = 409;
          throw error;
        }
        if (allocation.restored_at) {
          const error = new Error('Allocation lô của đơn đã được hoàn trước đó; cần review thủ công.');
          error.status = 409;
          throw error;
        }
        if (!allocation.batch_status || String(allocation.batch_status) !== 'active') {
          const error = new Error(`Lô ${allocation.batch_id} đã bị hủy/không còn hoạt động; không tự hồi sinh hàng khi hủy đơn.`);
          error.status = 409;
          throw error;
        }
        if (Number(allocation.branch_id || 0) !== Number(order.branch_id || 0)
          || Number(allocation.batch_branch_id || 0) !== Number(order.branch_id || 0)) {
          const error = new Error(`Allocation lô ${allocation.batch_id} không khớp chi nhánh của đơn; cần review thủ công.`);
          error.status = 409;
          throw error;
        }
        const productId = Number(allocation.product_id);
        allocatedByProduct.set(productId, (allocatedByProduct.get(productId) || 0) + quantity);
      }

      for (const [productId, required] of trackedRequired) {
        const allocated = allocatedByProduct.get(productId) || 0;
        if (Math.abs(allocated - required) > 1e-9) {
          const error = new Error(
            allocations.length === 0
              ? `Đơn legacy có sản phẩm ${productId} theo lô nhưng không có lịch sử phân bổ lô; cần đối soát thủ công trước khi hủy.`
              : `Phân bổ lô của sản phẩm ${productId} không khớp số lượng đơn (${allocated}/${required}); cần đối soát thủ công.`,
          );
          error.status = 409;
          throw error;
        }
      }
      for (const [productId, allocated] of allocatedByProduct) {
        if (!trackedRequired.has(productId) && allocated > 0) {
          const error = new Error(`Đơn có allocation lô ngoài danh sách sản phẩm cần hoàn (${productId}); cần review thủ công.`);
          error.status = 409;
          throw error;
        }
      }

      for (const allocation of allocations) {
        const restoredBatch = await run(
          `UPDATE product_batches SET quantity = quantity + ?
           WHERE id = ? AND user_id = ? AND branch_id = ? AND COALESCE(status, 'active') = 'active'`,
          [allocation.quantity, allocation.batch_id, userId, allocation.branch_id],
        );
        if (!restoredBatch.changes) {
          const error = new Error(`Không thể hoàn lại lô ${allocation.batch_id}; cần review thủ công.`);
          error.status = 409;
          throw error;
        }
        const marked = await run(
          `UPDATE pos_batch_allocations SET restored_at = CURRENT_TIMESTAMP
           WHERE id = ? AND user_id = ? AND restored_at IS NULL`,
          [allocation.id, userId],
        );
        if (!marked.changes) {
          const error = new Error(`Allocation ${allocation.id} vừa được hoàn bởi yêu cầu khác.`);
          error.status = 409;
          throw error;
        }
      }

      for (const item of items) {
        if (item.product_id) {
          const quantity = Number(item.quantity) * (Number(item.unit_ratio) > 0 ? Number(item.unit_ratio) : 1);
          if (order.branch_id) await doiTonChiNhanh(order.branch_id, item.product_id, quantity);
          else await run('UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?', [quantity, item.product_id, userId]);
          await changeVariantStock(userId, item.product_id, item.variant_id, quantity);
          await run(
            `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
             VALUES (?, ?, 'IN', ?, ?, ?)`,
            [userId, item.product_id, quantity, `Hủy đơn ${order.order_code}`, order.branch_id || null],
          );
        } else if (item.combo_id) {
          const parts = await all(
            `SELECT ci.product_id, ci.quantity FROM combo_items ci
             JOIN products p ON p.id = ci.product_id AND p.user_id = ?
             WHERE ci.combo_id = ?`,
            [userId, item.combo_id],
          );
          for (const part of parts) {
            const quantity = Number(part.quantity) * Number(item.quantity);
            if (order.branch_id) await doiTonChiNhanh(order.branch_id, part.product_id, quantity);
            else await run('UPDATE products SET stock = stock + ? WHERE id = ? AND user_id = ?', [quantity, part.product_id, userId]);
            await run(
              `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
               VALUES (?, ?, 'IN', ?, ?, ?)`,
              [userId, part.product_id, quantity, `Hủy combo đơn ${order.order_code}`, order.branch_id || null],
            );
          }
        }
      }

      const collected = await all(
        `SELECT amount, payment_method FROM cash_flows
         WHERE user_id = ? AND transaction_type = 'in' AND category = 'sales' AND reference_id = ?`,
        [userId, order.order_code],
      );
      for (const flow of collected) {
        await run(
          `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes, branch_id)
           VALUES (?, 'out', 'refund', ?, ?, ?, ?, ?)`,
          [userId, Number(flow.amount) || 0, flow.payment_method || 'cash', order.order_code, `Hoàn tiền hủy đơn ${order.order_code}`, order.branch_id || null],
        );
      }

      await run('DELETE FROM debts WHERE user_id = ? AND order_code = ? AND COALESCE(paid_amount, 0) = 0', [userId, order.order_code]);
      await run('DELETE FROM warranties WHERE user_id = ? AND order_code = ?', [userId, order.order_code]);
      if (order.customer_phone) {
        await run('UPDATE customers SET total_spend = MAX(0, total_spend - ?) WHERE user_id = ? AND phone = ?', [order.total_amount, userId, order.customer_phone]);
      }
      await run(
        `INSERT INTO transactions (date, voucherNumber, description, amount, category, user_id)
         SELECT date, ?, ?, -amount, category, user_id FROM transactions
         WHERE user_id = ? AND voucherNumber = ? ORDER BY id ASC LIMIT 1`,
        [`HUY-${order.order_code}`, `Hủy đơn ${order.order_code}`, userId, order.order_code],
      );
      await run('UPDATE pos_orders SET status = ?, cancel_reason = ? WHERE id = ? AND user_id = ?', ['cancelled', req.body.cancel_reason || '', order.id, userId]);

      await run('COMMIT');
      writeAudit(req, { action: 'order.cancel', target: order.order_code, detail: { reason: req.body.cancel_reason || '' } });
      res.json({ message: 'Order cancelled successfully' });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;