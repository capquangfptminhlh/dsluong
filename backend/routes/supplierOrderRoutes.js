const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');
const { doiTonChiNhanh, chiNhanhMacDinh } = require('./branchRoutes');

// Đặt hàng NCC & Trả hàng NCC — dùng chung quyền 'purchase'
router.use(requireAuth);
router.use(requirePermission('purchase'));

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
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

async function resolveTenantBranch(userId, branchId) {
  const id = branchId || await chiNhanhMacDinh(userId);
  if (!id) return null;
  return get('SELECT id FROM branches WHERE id = ? AND user_id = ?', [id, userId]);
}

/* ==================== ĐẶT HÀNG NCC ==================== */

router.get('/requests', async (req, res) => {
  try {
    res.json(await all('SELECT * FROM purchase_requests WHERE user_id = ? ORDER BY createdAt DESC LIMIT 200', [req.tenantId]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const r = await get('SELECT * FROM purchase_requests WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!r) return res.status(404).json({ error: 'Không tìm thấy đơn đặt hàng' });
    r.items = await all('SELECT * FROM purchase_request_items WHERE request_id = ?', [r.id]);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Tạo đơn ĐẶT hàng (hàng CHƯA về, chưa cộng kho, chưa sinh công nợ).
 * Khi hàng về mới gọi /requests/:id/nhan-hang để chuyển thành phiếu nhập thật.
 */
router.post('/requests', async (req, res) => {
  const { supplier_id, branch_id, items, expected_date, note } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Đơn đặt hàng cần ít nhất một mặt hàng' });
  for (const it of items) {
    if (!(Number(it.quantity) > 0)) return res.status(400).json({ error: 'Số lượng đặt phải lớn hơn 0' });
    if (Number(it.cost_price) < 0) return res.status(400).json({ error: 'Giá nhập không được âm' });
  }
  try {
    const ids = items.map((i) => i.product_id).filter(Boolean);
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      const sp = await all(`SELECT id FROM products WHERE id IN (${ph}) AND user_id = ?`, [...ids, req.tenantId]);
      if (sp.length !== new Set(ids).size) return res.status(403).json({ error: 'Có sản phẩm không thuộc cửa hàng của bạn' });
    }
    let ncc = null;
    if (supplier_id) {
      ncc = await get('SELECT * FROM suppliers WHERE id = ? AND user_id = ?', [supplier_id, req.tenantId]);
      if (!ncc) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });
    }

    const branch = await resolveTenantBranch(req.tenantId, branch_id);
    if (!branch) return res.status(404).json({ error: 'Không tìm thấy chi nhánh thuộc cửa hàng của bạn' });

    const tong = items.reduce((s, it) => s + Number(it.quantity) * Number(it.cost_price), 0);
    const code = `DH-NCC${Date.now().toString().slice(-7)}`;
    const cn = branch.id;

    const r = await run(
      `INSERT INTO purchase_requests (user_id, code, supplier_id, supplier_name, branch_id, total_amount, status, expected_date, note)
       VALUES (?, ?, ?, ?, ?, ?, 'ordered', ?, ?)`,
      [req.tenantId, code, supplier_id || null, ncc ? ncc.name : null, cn, tong, expected_date || null, note || null]
    );
    for (const it of items) {
      const sp = it.product_id ? await get('SELECT name FROM products WHERE id = ?', [it.product_id]) : null;
      await run(
        `INSERT INTO purchase_request_items (request_id, product_id, product_name, quantity, cost_price) VALUES (?, ?, ?, ?, ?)`,
        [r.lastID, it.product_id || null, sp ? sp.name : (it.product_name || ''), Number(it.quantity), Number(it.cost_price) || 0]
      );
    }
    writeAudit(req, { action: 'porder.create', target: code, detail: { tong, so_mat_hang: items.length } });
    res.json({ success: true, id: r.lastID, code, total_amount: tong });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Hàng về: chuyển đơn đặt thành PHIẾU NHẬP thật.
 * Toàn bộ claim trạng thái + giá vốn + tồn kho + công nợ + bằng chứng thanh toán
 * nằm trong một SQLite IMMEDIATE transaction để không thể nhận cùng đơn hai lần.
 *
 * Body: {
 *   paid_amount?, payment_method?: 'cash'|'bank'|'card'|'other',
 *   payment_reference?, paid_at?
 * }
 * Client cũ có paid_amount nhưng thiếu payment_method vẫn chạy, nhưng phương thức được
 * ghi là 'unknown' và tạo compliance finding thay vì tự gán sai thành tiền mặt.
 */
router.post('/requests/:id/nhan-hang', (req, res) => {
  const userId = req.tenantId;
  const requestId = Number(req.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Đơn đặt hàng không hợp lệ' });
  }

  const paidInput = Number(req.body?.paid_amount ?? 0);
  if (!Number.isFinite(paidInput) || paidInput < 0) {
    return res.status(400).json({ error: 'Số tiền đã trả NCC không hợp lệ' });
  }
  const paymentReference = String(req.body?.payment_reference || '').trim() || null;
  const requestedPaidAt = String(req.body?.paid_at || '').trim() || null;

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');

    const receiveOrder = native.transaction(() => {
      const dh = native.prepare('SELECT * FROM purchase_requests WHERE id = ? AND user_id = ?').get(requestId, userId);
      if (!dh) throw httpError(404, 'Không tìm thấy đơn đặt hàng');
      if (dh.status === 'received') throw httpError(409, 'Đơn này đã nhận hàng rồi');
      if (dh.status === 'cancelled') throw httpError(409, 'Đơn này đã hủy');
      if (dh.status !== 'ordered') throw httpError(409, `Đơn đang ở trạng thái "${dh.status}", không thể nhận hàng`);

      const branch = native.prepare('SELECT id, name FROM branches WHERE id = ? AND user_id = ?').get(dh.branch_id, userId);
      if (!branch) throw httpError(409, 'Chi nhánh nhận hàng không còn hợp lệ với cửa hàng này');

      let supplier = null;
      if (dh.supplier_id) {
        supplier = native.prepare('SELECT * FROM suppliers WHERE id = ? AND user_id = ?').get(dh.supplier_id, userId);
        if (!supplier) throw httpError(409, 'Nhà cung cấp của đơn không còn hợp lệ với cửa hàng này');
      }

      const items = native.prepare('SELECT * FROM purchase_request_items WHERE request_id = ? ORDER BY id ASC').all(dh.id);
      if (items.length === 0) throw httpError(400, 'Đơn không có mặt hàng nào');

      let tong = 0;
      const aggregateByProduct = new Map();
      const aggregateByVariant = new Map();
      const normalizedItems = [];
      const variantRowsStmt = native.prepare(
        'SELECT id, sku, cost_price, stock, attributes_json FROM product_variants WHERE product_id = ? ORDER BY id ASC'
      );
      for (const item of items) {
        const productId = Number(item.product_id);
        const quantity = Number(item.quantity);
        const costPrice = Number(item.cost_price);
        if (!Number.isInteger(productId) || productId <= 0) {
          throw httpError(409, 'Đơn đặt hàng có dòng sản phẩm không hợp lệ');
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw httpError(409, 'Đơn đặt hàng có số lượng không hợp lệ');
        }
        if (!Number.isFinite(costPrice) || costPrice < 0) {
          throw httpError(409, 'Đơn đặt hàng có giá nhập không hợp lệ');
        }
        const lineTotal = quantity * costPrice;
        if (!Number.isFinite(lineTotal)) throw httpError(409, 'Giá trị dòng đặt hàng vượt giới hạn hợp lệ');
        tong += lineTotal;
        if (!Number.isFinite(tong)) throw httpError(409, 'Tổng tiền đơn đặt hàng vượt giới hạn hợp lệ');

        const variants = variantRowsStmt.all(productId);
        let selectedVariant = null;
        if (item.variant_id) {
          selectedVariant = variants.find((row) => Number(row.id) === Number(item.variant_id)) || null;
          if (!selectedVariant) throw httpError(409, `Phân loại của "${item.product_name || productId}" không còn hợp lệ`);
        } else if (variants.length === 1) {
          selectedVariant = variants[0];
        } else if (variants.length > 1) {
          throw httpError(409, `Đơn cũ của "${item.product_name || productId}" chưa xác định phân loại. Hãy tạo lại đơn nhập và chọn đúng phân loại.`);
        }

        const variantId = selectedVariant ? Number(selectedVariant.id) : null;
        const resolvedVariantLabel = variantLabel(selectedVariant);
        normalizedItems.push({
          product_id: productId,
          product_name: item.product_name || '',
          quantity,
          cost_price: costPrice,
          variant_id: variantId,
          variant_label: resolvedVariantLabel,
        });
        if (variantId) {
          const key = `${productId}:${variantId}`;
          const variantAggregate = aggregateByVariant.get(key) || {
            product_id: productId, variant_id: variantId, quantity: 0, purchase_cost: 0,
          };
          variantAggregate.quantity += quantity;
          variantAggregate.purchase_cost += lineTotal;
          aggregateByVariant.set(key, variantAggregate);
        }
        const aggregate = aggregateByProduct.get(productId) || { quantity: 0, purchase_cost: 0 };
        aggregate.quantity += quantity;
        aggregate.purchase_cost += lineTotal;
        if (!Number.isFinite(aggregate.quantity) || !Number.isFinite(aggregate.purchase_cost)) {
          throw httpError(409, 'Tổng số lượng hoặc giá trị sản phẩm đặt hàng không hợp lệ');
        }
        aggregateByProduct.set(productId, aggregate);
      }

      if (paidInput > tong) throw httpError(400, 'Số tiền trả NCC không được lớn hơn tổng tiền đơn đặt hàng');
      const daTra = paidInput;
      const conNo = tong - daTra;
      const paymentMethod = daTra > 0 ? normalizePaymentMethod(req.body?.payment_method) : null;
      const paidAt = daTra > 0 ? (requestedPaidAt || new Date().toISOString()) : null;
      const code = `PN${Date.now().toString().slice(-8)}`;
      const trangThai = conNo <= 0 ? 'paid' : (daTra > 0 ? 'partial' : 'unpaid');

      const productStmt = native.prepare('SELECT id, name, stock, cost_price FROM products WHERE id = ? AND user_id = ?');
      const products = new Map();
      for (const productId of aggregateByProduct.keys()) {
        const product = productStmt.get(productId, userId);
        if (!product) throw httpError(403, 'Có sản phẩm trong đơn không thuộc cửa hàng của bạn');
        products.set(productId, product);
      }

      // Claim đúng một lần bên trong write transaction. Nếu phần sau lỗi, claim cũng rollback.
      const claimed = native.prepare(
        `UPDATE purchase_requests SET status = 'receiving' WHERE id = ? AND user_id = ? AND status = 'ordered'`
      ).run(dh.id, userId);
      if (Number(claimed.changes) !== 1) throw httpError(409, 'Đơn đã được xử lý bởi yêu cầu khác');

      const po = native.prepare(
        `INSERT INTO purchase_orders (user_id, code, supplier_id, supplier_name, branch_id, total_amount, paid_amount, status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(userId, code, dh.supplier_id || null, supplier ? supplier.name : dh.supplier_name, branch.id, tong, daTra, trangThai, `Nhận từ đơn đặt ${dh.code}`);
      const poId = Number(po.lastInsertRowid);

      const insertItem = native.prepare(
        `INSERT INTO purchase_order_items
          (po_id, product_id, product_name, quantity, cost_price, variant_id, variant_label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of normalizedItems) {
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

      for (const [productId, aggregate] of aggregateByProduct.entries()) {
        const product = products.get(productId);
        const oldStock = Number(product.stock) || 0;
        const oldCost = Number(product.cost_price) || 0;
        const newStock = oldStock + aggregate.quantity;
        if (!Number.isFinite(newStock) || newStock <= 0) throw httpError(409, `Tồn kho mới của "${product.name}" không hợp lệ`);
        const newCostRaw = (oldStock * oldCost + aggregate.purchase_cost) / newStock;
        if (!Number.isFinite(newCostRaw) || newCostRaw < 0) throw httpError(409, `Giá vốn mới của "${product.name}" không hợp lệ`);
        updateCost.run(Math.round(newCostRaw), productId, userId);
        addBranchStock.run(branch.id, productId, aggregate.quantity);
        syncTotalStock.run(productId, productId, userId);
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
        `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id) VALUES (?, ?, 'IN', ?, ?, ?)`
      );
      for (const item of normalizedItems) {
        insertInventoryLog.run(userId, item.product_id, item.quantity, `Nhập hàng ${code}`, branch.id);
      }

      let paymentEvidenceStatus = null;
      if (daTra > 0) {
        const cashFlow = native.prepare(
          `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
           VALUES (?, 'out', 'purchase', ?, ?, ?, ?)`
        ).run(userId, daTra, paymentMethod, code, `Trả tiền nhập hàng ${code} từ đơn đặt ${dh.code}`);

        paymentEvidenceStatus = paymentMethod === 'unknown' ? 'NEEDS_METHOD' : 'RECORDED';
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
          paymentEvidenceStatus,
        );

        if (paymentMethod === 'unknown') {
          const finding = native.prepare(
            `INSERT INTO compliance_findings
              (user_id, code, severity, subject_type, subject_id, status, message, detail_json)
             VALUES (?, 'PAYMENT_METHOD_MISSING', 'REVIEW', 'purchase_order', ?, 'OPEN', ?, ?)`
          ).run(
            userId,
            String(poId),
            `Phiếu nhập ${code} từ đơn đặt ${dh.code} có thanh toán nhưng chưa xác định phương thức thanh toán.`,
            JSON.stringify({ purchase_code: code, purchase_request_code: dh.code, amount: daTra }),
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
        ).run(tong, conNo, supplier.id, userId);
        if (conNo > 0) {
          native.prepare(
            `INSERT INTO debts (user_id, type, partner_name, amount, paid_amount, status, notes)
             VALUES (?, 'payable', ?, ?, 0, 'unpaid', ?)`
          ).run(userId, supplier.name, conNo, `Nợ nhập hàng ${code}`);
        }
      }

      const completed = native.prepare(
        `UPDATE purchase_requests SET status = 'received', po_id = ? WHERE id = ? AND user_id = ? AND status = 'receiving'`
      ).run(poId, dh.id, userId);
      if (Number(completed.changes) !== 1) throw httpError(409, 'Không thể chốt trạng thái nhận hàng an toàn');

      return { code, poId, tong, daTra, conNo, paymentMethod, paymentEvidenceStatus, branchId: branch.id, requestCode: dh.code };
    });

    const result = receiveOrder.immediate();
    writeAudit(req, {
      action: 'porder.receive',
      target: result.requestCode,
      detail: {
        phieu_nhap: result.code,
        tong: result.tong,
        daTra: result.daTra,
        conNo: result.conNo,
        branch_id: result.branchId,
        payment_method: result.paymentMethod,
      },
    });
    return res.json({
      success: true,
      id: result.poId,
      purchase_code: result.code,
      total_amount: result.tong,
      paid_amount: result.daTra,
      con_no: result.conNo,
      payment_method: result.paymentMethod,
      payment_evidence_status: result.paymentEvidenceStatus,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/requests/:id/huy', async (req, res) => {
  try {
    const dh = await get('SELECT * FROM purchase_requests WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!dh) return res.status(404).json({ error: 'Không tìm thấy đơn đặt hàng' });
    if (dh.status === 'received') return res.status(400).json({ error: 'Đơn đã nhận hàng, không hủy được' });
    await run(`UPDATE purchase_requests SET status = 'cancelled' WHERE id = ?`, [dh.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==================== TRẢ HÀNG CHO NCC ==================== */

router.get('/returns', async (req, res) => {
  try {
    res.json(await all('SELECT * FROM supplier_returns WHERE user_id = ? ORDER BY createdAt DESC LIMIT 200', [req.tenantId]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Trả hàng cho NCC: trừ kho chi nhánh, GIẢM công nợ phải trả NCC
 * (nếu không còn nợ thì ghi nhận thu lại tiền vào sổ quỹ).
 */
router.post('/returns', async (req, res) => {
  const { supplier_id, branch_id, items, reason } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Chọn ít nhất một mặt hàng để trả' });

  try {
    const branch = await resolveTenantBranch(req.tenantId, branch_id);
    if (!branch) return res.status(404).json({ error: 'Không tìm thấy chi nhánh thuộc cửa hàng của bạn' });
    const cn = branch.id;
    let ncc = null;
    if (supplier_id) {
      ncc = await get('SELECT * FROM suppliers WHERE id = ? AND user_id = ?', [supplier_id, req.tenantId]);
      if (!ncc) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });
    }

    // Kiểm tra đủ hàng trong kho chi nhánh
    for (const it of items) {
      const sl = Number(it.quantity);
      if (!(sl > 0)) return res.status(400).json({ error: 'Số lượng trả phải lớn hơn 0' });
      const sp = await get('SELECT name FROM products WHERE id = ? AND user_id = ?', [it.product_id, req.tenantId]);
      if (!sp) return res.status(403).json({ error: 'Có sản phẩm không thuộc cửa hàng của bạn' });
      const ton = await get('SELECT COALESCE(stock,0) s FROM branch_stock WHERE branch_id = ? AND product_id = ?', [cn, it.product_id]);
      const dangCo = ton ? ton.s : 0;
      if (dangCo < sl) return res.status(400).json({ error: `"${sp.name}" chỉ còn ${dangCo} trong kho, không đủ trả ${sl}` });
    }

    const tong = items.reduce((s, it) => s + Number(it.quantity) * Number(it.cost_price || 0), 0);
    const code = `TH-NCC${Date.now().toString().slice(-7)}`;

    const r = await run(
      `INSERT INTO supplier_returns (user_id, code, supplier_id, supplier_name, branch_id, total_amount, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, code, supplier_id || null, ncc ? ncc.name : null, cn, tong, reason || null]
    );

    for (const it of items) {
      const sp = await get('SELECT name FROM products WHERE id = ?', [it.product_id]);
      await run(
        `INSERT INTO supplier_return_items (return_id, product_id, product_name, quantity, cost_price) VALUES (?, ?, ?, ?, ?)`,
        [r.lastID, it.product_id, sp ? sp.name : '', Number(it.quantity), Number(it.cost_price) || 0]
      );
      await doiTonChiNhanh(cn, it.product_id, -Number(it.quantity));
      await run(
        `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id) VALUES (?, ?, 'OUT', ?, ?, ?)`,
        [req.tenantId, it.product_id, Number(it.quantity), `Trả NCC ${code}`, cn]
      );
    }

    // Giảm nợ NCC; phần vượt quá nợ coi như NCC hoàn tiền
    if (ncc) {
      const noHienTai = ncc.total_debt || 0;
      const giamNo = Math.min(noHienTai, tong);
      const hoanTien = tong - giamNo;
      await run('UPDATE suppliers SET total_debt = total_debt - ?, total_purchased = total_purchased - ? WHERE id = ? AND user_id = ?',
        [giamNo, tong, ncc.id, req.tenantId]);

      if (giamNo > 0) {
        // Trừ dần vào các khoản phải trả chưa thanh toán
        const cacKhoan = await all(
          `SELECT * FROM debts WHERE user_id = ? AND type = 'payable' AND partner_name = ? AND status != 'paid' ORDER BY id ASC`,
          [req.tenantId, ncc.name]
        );
        let conTru = giamNo;
        for (const k of cacKhoan) {
          if (conTru <= 0) break;
          const conLai = (k.amount || 0) - (k.paid_amount || 0);
          const tru = Math.min(conLai, conTru);
          const moi = (k.paid_amount || 0) + tru;
          await run(`UPDATE debts SET paid_amount = ?, status = ? WHERE id = ?`,
            [moi, moi >= k.amount ? 'paid' : 'partial', k.id]);
          conTru -= tru;
        }
      }
      if (hoanTien > 0) {
        await run(
          `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
           VALUES (?, 'in', 'refund', ?, 'cash', ?, ?)`,
          [req.tenantId, hoanTien, code, `NCC hoàn tiền trả hàng ${code}`]
        );
      }
    }

    writeAudit(req, { action: 'supplier.return', target: code, detail: { tong, so_mat_hang: items.length } });
    res.json({ success: true, id: r.lastID, code, total_amount: tong });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
