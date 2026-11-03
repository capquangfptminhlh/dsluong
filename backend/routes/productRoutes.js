const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');
const multer = require('multer');
const xlsx = require('xlsx');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const upload = multer({ storage: multer.memoryStorage() });
const generatedSku = (prefix) => `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
const { requireAuth, requirePermission, requireAnyPermission, writeAudit } = require('../middleware/auth');

// Mọi route sản phẩm cần đăng nhập
router.use(requireAuth);

// ĐỌC: cho phép cả thu ngân (POS) và lễ tân (lịch hẹn) vì màn hình của họ cần danh sách hàng
const docSanPham = requireAnyPermission('products', 'pos', 'appointments');
// GHI: phải đúng quyền quản lý sản phẩm
const ghiSanPham = requirePermission('products');

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

function parseWarrantyOptions(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

// Get all products with their variants
router.get('/', docSanPham, (req, res) => {
  const userId = req.tenantId;
  let localStock = null;
  try {
    if (req.user.actorType === 'staff') {
      const branchId = resolvePosBranch(req, null);
      const rows = db._native.prepare(
        `SELECT bs.product_id, bs.stock FROM branch_stock bs
         JOIN products p ON p.id = bs.product_id AND p.user_id = ?
         WHERE bs.branch_id = ?`,
      ).all(userId, branchId);
      localStock = new Map(rows.map((row) => [Number(row.product_id), Number(row.stock) || 0]));
    }
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
  db.all('SELECT * FROM products WHERE user_id = ? ORDER BY createdAt DESC', [userId], (err, products) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (products.length === 0) return res.json([]);
    
    // Fetch variants for all these products
    const productIds = products.map(p => p.id);
    const placeholders = productIds.map(() => '?').join(',');
    
    db.all(`SELECT * FROM product_variants WHERE product_id IN (${placeholders})`, productIds, (err, variants) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const productsWithVariants = products.map(p => {
        return {
          ...p,
          stock: localStock === null ? p.stock : (localStock.get(Number(p.id)) || 0),
          warranty_options: parseWarrantyOptions(p.warranty_options_json),
          variants: variants.filter(v => v.product_id === p.id).map(v => ({
            ...v,
            attributes: JSON.parse(v.attributes_json || '{}')
          }))
        };
      });
      
      res.json(productsWithVariants);
    });
  });
});

// POST /api/products
router.post('/', ghiSanPham, (req, res) => {
  const { name, sku, price, cost_price, stock, category, image_url } = req.body;
  const userId = req.tenantId;

  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên sản phẩm' });
  if (price !== undefined && Number(price) < 0) return res.status(400).json({ error: 'Giá bán không được âm' });
  if (cost_price !== undefined && Number(cost_price) < 0) return res.status(400).json({ error: 'Giá vốn không được âm' });
  if (stock !== undefined && Number(stock) < 0) return res.status(400).json({ error: 'Tồn kho không được âm' });

  const insertSku = sku || generatedSku('SP');

  db.run(`
    INSERT INTO products (user_id, name, sku, price, cost_price, stock, category, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [userId, name, insertSku, price || 0, cost_price || 0, stock || 0, category || 'Khác', image_url || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, sku: insertSku, success: true });
  });
});

// Update parent product
router.put('/:id', ghiSanPham, (req, res) => {
  const { name, sku, price, cost_price, stock, category, image_url, description, warranty_months, warranty_options } = req.body;
  const userId = req.tenantId;
  try {
    const warrantyMonths = Number(warranty_months ?? 0);
    if (!Number.isInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 240) {
      return res.status(400).json({ error: 'Số tháng bảo hành phải là số nguyên từ 0 đến 240' });
    }
    const cleanWarrantyOptions = normalizeWarrantyOptions(warranty_options, warrantyMonths);
    db.run(
      `UPDATE products SET name = ?, sku = ?, price = ?, cost_price = ?, stock = ?, category = ?, image_url = ?, description = ?, warranty_months = ?, warranty_options_json = ? WHERE id = ? AND user_id = ?`,
      [name, sku, price || 0, cost_price || 0, stock || 0, category || 'Chưa phân loại', image_url || '', description || '', warrantyMonths, JSON.stringify(cleanWarrantyOptions), req.params.id, userId],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        writeAudit(req, { action: 'product.update', target: req.params.id, detail: { warranty_packages: cleanWarrantyOptions.length } });
        res.json({ success: true, updated: this.changes });
      }
    );
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

// Update child variant
router.put('/variants/:id', ghiSanPham, (req, res) => {
  const { sku, price, cost_price, stock, image_url, attributes } = req.body;
  const userId = req.tenantId;

  db.run(
    `UPDATE product_variants SET sku = ?, price = ?, cost_price = ?, stock = ?, image_url = ?, attributes_json = ? WHERE id = ? AND EXISTS (SELECT 1 FROM products WHERE id = product_variants.product_id AND user_id = ?)`,
    [sku, price || 0, cost_price || 0, stock || 0, image_url || '', JSON.stringify(attributes || {}), req.params.id, userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, updated: this.changes });
    }
  );
});

// Delete product and its variants
router.delete('/:id', ghiSanPham, (req, res) => {
  const userId = req.tenantId;
  // Chỉ xóa variants của sản phẩm thuộc đúng cửa hàng
  db.run('DELETE FROM product_variants WHERE product_id = ? AND EXISTS (SELECT 1 FROM products WHERE id = ? AND user_id = ?)',
    [req.params.id, req.params.id, userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM products WHERE id = ? AND user_id = ?', [req.params.id, userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes > 0) writeAudit(req, { action: 'product.delete', target: req.params.id });
      res.json({ success: true, deleted: this.changes });
    });
  });
});

// POST /api/products/with-variants
router.post('/with-variants', ghiSanPham, (req, res) => {
  const { name, category, image_url, variants } = req.body;
  const userId = req.tenantId;

  if (!variants || variants.length === 0) return res.status(400).json({ error: "Missing variants" });

  // Use the first variant as the base price/cost for the parent product
  const basePrice = variants[0].price || 0;
  const baseCost = variants[0].cost_price || 0;
  const totalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);

  db.run(`
    INSERT INTO products (user_id, name, sku, price, cost_price, stock, category, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [userId, name, 'VARIANTS-' + Date.now(), basePrice, baseCost, totalStock, category || 'Khác', image_url || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    const productId = this.lastID;
    
    // Insert all variants
    const stmt = db.prepare(`
      INSERT INTO product_variants (product_id, sku, price, cost_price, stock, attributes_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    let insertedCount = 0;
    variants.forEach((v) => {
      const vSku = v.sku || generatedSku(`SKU-${productId}`);
      stmt.run([productId, vSku, v.price, v.cost_price, v.stock, JSON.stringify(v.attributes || {})], (err) => {
        if (!err) insertedCount++;
        // Naive async tracking for simplicity
        if (insertedCount === variants.length) {
          stmt.finalize();
          res.json({ success: true, product_id: productId, variants_created: insertedCount });
        }
      });
    });
  });
});

// POST /api/products/import
router.post('/import', ghiSanPham, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không tìm thấy file tải lên' });
  
  const userId = req.tenantId;
  
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }); // array of arrays
    
    if (data.length < 2) return res.status(400).json({ error: 'File trống hoặc không hợp lệ' });
    
    // Find header row (assuming row 0 is header, but sometimes it's row 1 or 2)
    let headerRowIdx = 0;
    for (let i=0; i<5; i++) {
      if (data[i] && data[i].length > 2) {
        headerRowIdx = i;
        break;
      }
    }
    
    const headers = data[headerRowIdx].map(h => String(h || '').toLowerCase().trim());
    
    let colName = 0; // Cột 0 luôn là Tên sản phẩm* trong file Sapo xuất
    let colDesc = headers.findIndex(h => h.includes('mô tả'));
    let colVariantFull = headers.findIndex(h => h === 'tên phiên bản sản phẩm');
    let colAttrVal = headers.findIndex(h => h.includes('giá trị thuộc tính'));
    let colCategory = headers.findIndex(h => h.includes('loại sản phẩm') || h.includes('danh mục'));
    let colSku = headers.findIndex(h => h === 'mã sku*' || h.includes('mã sku') || h === 'sku' || h === 'mã hàng');
    if (colSku === -1) colSku = headers.findIndex(h => h.includes('barcode'));
    
    let colImage = headers.findIndex(h => h.includes('ảnh đại diện') || h.includes('hình ảnh') || h === 'ảnh' || h === 'image');
    let colStock = headers.findIndex(h => h.includes('tồn kho') || h.includes('số lượng'));
    let colCost = headers.findIndex(h => h.includes('giá vốn') || h.includes('giá nhập'));
    let colPrice = headers.findIndex(h => h.includes('giá lẻ') || h.includes('giá bán') || h.includes('giá sỉ') || h.includes('giá shopee') || h.includes('giá lazada') || h.includes('đơn giá') || h.includes('pl_giá'));

    const productsMap = new Map();
    let currentParentKey = '';

    for (let i = headerRowIdx + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      let rawName = row[colName] ? String(row[colName]).trim() : '';
      let descVal = colDesc !== -1 && row[colDesc] ? String(row[colDesc]).trim() : '';
      let vFull = colVariantFull !== -1 && row[colVariantFull] ? String(row[colVariantFull]).trim() : '';
      let vAttr = colAttrVal !== -1 && row[colAttrVal] ? String(row[colAttrVal]).trim() : '';
      let catVal = colCategory !== -1 && row[colCategory] ? String(row[colCategory]).trim() : '';
      let skuVal = colSku !== -1 && row[colSku] ? String(row[colSku]).trim() : '';
      let imgVal = '';
      if (colImage !== -1 && row[colImage] && String(row[colImage]).trim().startsWith('http')) {
        imgVal = String(row[colImage]).trim();
      } else {
        for (let c = 0; c < row.length; c++) {
          if (c !== colDesc && row[c] && String(row[c]).trim().startsWith('http')) {
            imgVal = String(row[c]).trim();
            break;
          }
        }
      }

      if (rawName && !/^\d+$/.test(rawName)) {
        currentParentKey = rawName.replace(/<[^>]*>?/gm, '').trim();
      }
      if (!currentParentKey) continue;

      if (!productsMap.has(currentParentKey)) {
        productsMap.set(currentParentKey, {
          name: currentParentKey,
          category: catVal || 'Chưa phân loại',
          image_url: imgVal || '',
          description: descVal || '',
          variants: []
        });
      }

      const parentProd = productsMap.get(currentParentKey);
      if (imgVal && !parentProd.image_url) parentProd.image_url = imgVal;
      if (catVal && parentProd.category === 'Chưa phân loại') parentProd.category = catVal.trim();
      if (descVal && !parentProd.description) parentProd.description = descVal;

      let variantLabel = vAttr || (vFull.includes('-') ? vFull.split('-').pop().trim() : (vFull || 'Mặc định'));
      let price = colPrice !== -1 ? parseFloat(row[colPrice]) || 0 : 0;
      let cost = colCost !== -1 ? parseFloat(row[colCost]) || 0 : 0;
      let stock = colStock !== -1 ? parseInt(row[colStock]) || 0 : 0;

      parentProd.variants.push({
        sku: skuVal || generatedSku('IMP'),
        price,
        cost_price: cost,
        stock,
        image_url: imgVal || (parentProd.image_url || ''),
        attributes: { 'Phiên bản': variantLabel }
      });
    }

    const parentList = Array.from(productsMap.values());
    if (parentList.length === 0) return res.status(400).json({ error: 'Không đọc được sản phẩm nào từ file' });
    
    db.serialize(async () => {
      try {
        await new Promise((resolve, reject) => db.run("BEGIN TRANSACTION", err => err ? reject(err) : resolve()));
        
        // Auto-clean old products for clean sync
        await new Promise((resolve, reject) => db.run("DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE user_id = ?)", [userId], err => err ? reject(err) : resolve()));
        await new Promise((resolve, reject) => db.run("DELETE FROM products WHERE user_id = ?", [userId], err => err ? reject(err) : resolve()));

        let totalVariantsCount = 0;

        for (const prod of parentList) {
          const baseVariant = prod.variants[0] || {};
          const parentSku = baseVariant.sku || generatedSku('SP');
          const basePrice = baseVariant.price || 0;
          const baseCost = baseVariant.cost_price || 0;
          const totalStock = prod.variants.reduce((sum, v) => sum + (v.stock || 0), 0);

          const productId = await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO products (user_id, name, sku, price, cost_price, stock, category, image_url, description, attributes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
              [userId, prod.name, parentSku, basePrice, baseCost, totalStock, prod.category, prod.image_url, prod.description],
              function(err) { if (err) reject(err); else resolve(this.lastID); }
            );
          });

          for (const v of prod.variants) {
            totalVariantsCount++;
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO product_variants (product_id, sku, price, cost_price, stock, image_url, attributes_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [productId, v.sku, v.price, v.cost_price, v.stock, v.image_url, JSON.stringify(v.attributes)],
                err => err ? reject(err) : resolve()
              );
            });
          }
        }

        await new Promise((resolve, reject) => db.run("COMMIT", err => err ? reject(err) : resolve()));

        res.json({ success: true, count: parentList.length, variantsCount: totalVariantsCount, message: `Đã nhập thành công ${parentList.length} sản phẩm mẹ (${totalVariantsCount} biến thể) từ Sapo!` });
      } catch (dbErr) {
        db.run("ROLLBACK");
        res.status(500).json({ error: 'Lỗi ghi database: ' + dbErr.message });
      }
    });
    
  } catch (err) {
    res.status(500).json({ error: 'Lỗi đọc file Excel: ' + err.message });
  }
});

// POST /api/products/bulk-delete
router.post('/bulk-delete', ghiSanPham, (req, res) => {
  const { ids } = req.body;
  const userId = req.tenantId;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Chưa chọn sản phẩm nào để xóa' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const params = [userId, ...ids];

  db.run(`DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE user_id = ? AND id IN (${placeholders}))`, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM products WHERE user_id = ? AND id IN (${placeholders})`, params, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      writeAudit(req, { action: 'products.bulk_delete', count: this.changes });
      res.json({ success: true, deleted: this.changes, message: `Đã xóa thành công ${this.changes} sản phẩm!` });
    });
  });
});

// POST /api/products/bulk-update-price
router.post('/bulk-update-price', ghiSanPham, (req, res) => {
  const { ids, type, value } = req.body;
  const userId = req.tenantId;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Chưa chọn sản phẩm nào' });
  }

  const numVal = Number(value) || 0;
  const placeholders = ids.map(() => '?').join(',');

  db.all(`SELECT id, price FROM products WHERE user_id = ? AND id IN (${placeholders})`, [userId, ...ids], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    rows.forEach(p => {
      let newPrice = p.price;
      if (type === 'percent_add') newPrice = Math.round(p.price * (1 + numVal / 100));
      else if (type === 'percent_sub') newPrice = Math.max(0, Math.round(p.price * (1 - numVal / 100)));
      else if (type === 'fixed_add') newPrice = p.price + numVal;
      else if (type === 'fixed_sub') newPrice = Math.max(0, p.price - numVal);
      else if (type === 'set_exact') newPrice = Math.max(0, numVal);

      db.run(`UPDATE products SET price = ? WHERE id = ?`, [newPrice, p.id]);
      db.run(`UPDATE product_variants SET price = ? WHERE product_id = ?`, [newPrice, p.id]);
    });

    res.json({ success: true, count: rows.length, message: `Đã cập nhật giá cho ${rows.length} sản phẩm!` });
  });
});

// DELETE /api/products/clear-all
router.delete('/clear-all/confirm', ghiSanPham, (req, res) => {
  const userId = req.tenantId;
  db.run(`DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE user_id = ?)`, [userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM products WHERE user_id = ?`, [userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, deleted: this.changes, message: `Đã xóa toàn bộ sản phẩm!` });
    });
  });
});

module.exports = router;
