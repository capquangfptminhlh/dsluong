'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

const router = express.Router();
const canWriteProducts = [requireAuth, requirePermission('products')];

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(error) {
    if (error) return reject(error);
    resolve({ lastID: this.lastID, changes: this.changes });
  });
});
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows || []))));

function generatedSku(prefix) {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
}

function toNonNegative(value, field) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`${field} không hợp lệ`);
    error.status = 400;
    throw error;
  }
  return number;
}

function toWarrantyMonths(value) {
  const months = Number(value ?? 0);
  if (!Number.isInteger(months) || months < 0 || months > 240) {
    const error = new Error('Số tháng bảo hành phải là số nguyên từ 0 đến 240');
    error.status = 400;
    throw error;
  }
  return months;
}

function normalizeWarrantyOptions(value, defaultMonths = 0) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) {
    const error = new Error('Gói bảo hành phải là danh sách tháng và giá bán');
    error.status = 400;
    throw error;
  }
  const seen = new Set();
  const options = value.map((option, index) => {
    const months = Number(option?.months);
    const price = Number(option?.price);
    if (!Number.isInteger(months) || months < 0 || months > 240) {
      const error = new Error(`Gói bảo hành ${index + 1}: số tháng phải từ 0 đến 240`);
      error.status = 400;
      throw error;
    }
    if (!Number.isFinite(price) || price < 0) {
      const error = new Error(`Gói bảo hành ${index + 1}: giá bán không hợp lệ`);
      error.status = 400;
      throw error;
    }
    if (seen.has(months)) {
      const error = new Error(`Không được tạo hai gói cùng ${months} tháng bảo hành`);
      error.status = 400;
      throw error;
    }
    seen.add(months);
    return { months, price };
  }).sort((a, b) => a.months - b.months);
  if (options.length && !seen.has(Number(defaultMonths))) {
    const error = new Error('Bảo hành mặc định phải trùng với một gói bảo hành đã khai báo');
    error.status = 400;
    throw error;
  }
  return options;
}

function sendWriteError(res, error) {
  const message = String(error?.message || 'Lỗi ghi dữ liệu sản phẩm');
  if (error?.status) return res.status(error.status).json({ error: message });
  if (/UNIQUE|constraint/i.test(message)) return res.status(409).json({ error: 'SKU bị trùng. Vui lòng đổi SKU và thử lại.' });
  return res.status(500).json({ error: message });
}

router.post('/', ...canWriteProducts, async (req, res) => {
  const { name, sku, price, cost_price, stock, category, image_url, warranty_months, warranty_options } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên sản phẩm' });

  try {
    const cleanPrice = toNonNegative(price, 'Giá bán');
    const cleanCost = toNonNegative(cost_price, 'Giá vốn');
    const cleanStock = toNonNegative(stock, 'Tồn kho');
    const cleanWarrantyMonths = toWarrantyMonths(warranty_months);
    const cleanWarrantyOptions = normalizeWarrantyOptions(warranty_options, cleanWarrantyMonths);
    const insertSku = String(sku || '').trim() || generatedSku('SP');

    const result = await run(
      `INSERT INTO products (user_id, name, sku, price, cost_price, stock, category, image_url, warranty_months, warranty_options_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, String(name).trim(), insertSku, cleanPrice, cleanCost, cleanStock, category || 'Khác', image_url || '', cleanWarrantyMonths, JSON.stringify(cleanWarrantyOptions)],
    );

    writeAudit(req, { action: 'product.create', target: String(result.lastID), detail: { sku: insertSku } });
    return res.json({ id: result.lastID, name: String(name).trim(), sku: insertSku, success: true });
  } catch (error) {
    return sendWriteError(res, error);
  }
});

router.post('/with-variants', ...canWriteProducts, async (req, res) => {
  const { name, category, image_url, variants, warranty_months, warranty_options } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên sản phẩm' });
  if (!Array.isArray(variants) || variants.length === 0) return res.status(400).json({ error: 'Cần ít nhất một biến thể' });
  if (variants.length > 500) return res.status(400).json({ error: 'Tối đa 500 biến thể cho một sản phẩm' });

  let transactionStarted = false;
  try {
    const cleanWarrantyMonths = toWarrantyMonths(warranty_months);
    const cleanWarrantyOptions = normalizeWarrantyOptions(warranty_options, cleanWarrantyMonths);
    const normalized = variants.map((variant, index) => ({
      sku: String(variant?.sku || '').trim() || generatedSku(`SKU${index + 1}`),
      price: toNonNegative(variant?.price, `Giá bán biến thể ${index + 1}`),
      cost_price: toNonNegative(variant?.cost_price, `Giá vốn biến thể ${index + 1}`),
      stock: toNonNegative(variant?.stock, `Tồn kho biến thể ${index + 1}`),
      image_url: variant?.image_url || '',
      attributes: variant?.attributes && typeof variant.attributes === 'object' ? variant.attributes : {},
    }));

    await run('BEGIN IMMEDIATE');
    transactionStarted = true;

    const totalStock = normalized.reduce((sum, variant) => sum + variant.stock, 0);
    const base = normalized[0];
    const parentSku = generatedSku('VAR');
    const parent = await run(
      `INSERT INTO products (user_id, name, sku, price, cost_price, stock, category, image_url, warranty_months, warranty_options_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, String(name).trim(), parentSku, base.price, base.cost_price, totalStock, category || 'Khác', image_url || '', cleanWarrantyMonths, JSON.stringify(cleanWarrantyOptions)],
    );

    for (const variant of normalized) {
      await run(
        `INSERT INTO product_variants (product_id, sku, price, cost_price, stock, image_url, attributes_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [parent.lastID, variant.sku, variant.price, variant.cost_price, variant.stock, variant.image_url, JSON.stringify(variant.attributes)],
      );
    }

    await run('COMMIT');
    transactionStarted = false;
    writeAudit(req, { action: 'product.create_with_variants', target: String(parent.lastID), detail: { variants: normalized.length, sku: parentSku } });
    return res.json({ success: true, product_id: parent.lastID, variants_created: normalized.length });
  } catch (error) {
    if (transactionStarted) await run('ROLLBACK').catch(() => {});
    return sendWriteError(res, error);
  }
});

router.post('/bulk-update-price', ...canWriteProducts, async (req, res) => {
  const { ids, type, value } = req.body || {};
  const allowed = new Set(['percent_add', 'percent_sub', 'fixed_add', 'fixed_sub', 'set_exact']);
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Chưa chọn sản phẩm nào' });
  if (!allowed.has(type)) return res.status(400).json({ error: 'Kiểu cập nhật giá không hợp lệ' });
  const amount = Number(value);
  if (!Number.isFinite(amount)) return res.status(400).json({ error: 'Giá trị cập nhật không hợp lệ' });

  const uniqueIds = [...new Set(ids.map(Number).filter(Number.isInteger))];
  if (!uniqueIds.length) return res.status(400).json({ error: 'Danh sách sản phẩm không hợp lệ' });
  const placeholders = uniqueIds.map(() => '?').join(',');

  let transactionStarted = false;
  try {
    const rows = await all(
      `SELECT id, price FROM products WHERE user_id = ? AND id IN (${placeholders})`,
      [req.tenantId, ...uniqueIds],
    );

    await run('BEGIN IMMEDIATE');
    transactionStarted = true;

    for (const product of rows) {
      const current = Number(product.price) || 0;
      let next = current;
      if (type === 'percent_add') next = Math.round(current * (1 + amount / 100));
      if (type === 'percent_sub') next = Math.max(0, Math.round(current * (1 - amount / 100)));
      if (type === 'fixed_add') next = Math.max(0, current + amount);
      if (type === 'fixed_sub') next = Math.max(0, current - amount);
      if (type === 'set_exact') next = Math.max(0, amount);

      await run('UPDATE products SET price = ? WHERE id = ? AND user_id = ?', [next, product.id, req.tenantId]);
      await run('UPDATE product_variants SET price = ? WHERE product_id = ?', [next, product.id]);
    }

    await run('COMMIT');
    transactionStarted = false;
    writeAudit(req, { action: 'products.bulk_update_price', detail: { count: rows.length, type, value: amount } });
    return res.json({ success: true, count: rows.length, message: `Đã cập nhật giá cho ${rows.length} sản phẩm!` });
  } catch (error) {
    if (transactionStarted) await run('ROLLBACK').catch(() => {});
    return sendWriteError(res, error);
  }
});

module.exports = router;
