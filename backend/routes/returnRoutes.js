const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');
const { requireAuth, requireAnyPermission, writeAudit } = require('../middleware/auth');
const { formatBusinessDate } = require('../utils/businessDate');

router.use(requireAuth);
router.use(requireAnyPermission('orders', 'pos'));

const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
const httpError = (status, message) => Object.assign(new Error(message), { status });

function aggregateSoldRows(order, soldRows) {
  const subtotal = Number(order.subtotal) || soldRows.reduce((sum, row) => {
    const quantity = Number(row.quantity) || 0;
    const price = Number(row.price) || 0;
    const discount = Math.max(0, Number(row.discount) || 0);
    return sum + Math.max(0, quantity * price - discount);
  }, 0);
  const orderTotal = Math.max(0, Number(order.total_amount) || 0);
  const map = new Map();

  for (const row of soldRows) {
    const productId = Number(row.product_id);
    const orderItemId = Number(row.id);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(orderItemId) || orderItemId <= 0) continue;
    const quantity = Number(row.quantity) || 0;
    if (quantity <= 0) continue;
    const price = Number(row.price) || 0;
    const discount = Math.max(0, Number(row.discount) || 0);
    const baseValue = Math.max(0, quantity * price - discount);
    const unitRatio = Number(row.unit_ratio) > 0 ? Number(row.unit_ratio) : 1;
    const current = map.get(orderItemId) || {
      order_item_id: orderItemId,
      product_id: productId,
      product_name: row.product_name,
      variant_id: Number(row.variant_id) || null,
      variant_label: row.variant_label || '',
      sold_quantity: 0,
      base_value: 0,
      unit_ratio: unitRatio,
      mixed_unit_ratio: false,
    };
    if (Math.abs(current.unit_ratio - unitRatio) > 1e-9) current.mixed_unit_ratio = true;
    current.sold_quantity += quantity;
    current.base_value += baseValue;
    map.set(orderItemId, current);
  }

  for (const item of map.values()) {
    const allocatedOrderValue = subtotal > 0 ? orderTotal * item.base_value / subtotal : 0;
    item.refund_unit_value = item.sold_quantity > 0 ? allocatedOrderValue / item.sold_quantity : 0;
  }
  return map;
}

function returnedQuantityMap(rows) {
  const map = new Map();
  const legacyByProduct = new Map();
  const seenReturns = new Set();
  let totalRefund = 0;
  for (const row of rows) {
    const productId = Number(row.product_id);
    const orderItemId = Number(row.order_item_id);
    const quantity = Number(row.quantity) || 0;
    if (Number.isInteger(productId) && productId > 0 && quantity > 0) {
      if (Number.isInteger(orderItemId) && orderItemId > 0) map.set(orderItemId, (map.get(orderItemId) || 0) + quantity);
      else legacyByProduct.set(productId, (legacyByProduct.get(productId) || 0) + quantity);
    }
    const returnId = Number(row.return_id);
    if (Number.isInteger(returnId) && returnId > 0 && !seenReturns.has(returnId)) {
      seenReturns.add(returnId);
      totalRefund += Math.max(0, Number(row.total_refund) || 0);
    }
  }
  return { map, legacyByProduct, totalRefund };
}

async function loadEligibility(userId, orderId) {
  const order = await get('SELECT * FROM pos_orders WHERE id = ? AND user_id = ?', [orderId, userId]);
  if (!order) throw httpError(404, 'Không tìm thấy đơn hàng');
  const soldRows = await all(
    'SELECT id, product_id, product_name, quantity, price, discount, unit_ratio, variant_id, variant_label FROM pos_order_items WHERE order_id = ? AND product_id IS NOT NULL',
    [order.id]
  );
  const previousRows = await all(
    `SELECT r.id AS return_id, ri.order_item_id, ri.product_id, ri.variant_id, ri.quantity, r.total_refund
     FROM return_items ri JOIN returns r ON r.id = ri.return_id
     WHERE r.user_id = ? AND r.order_id = ?`,
    [userId, order.id]
  );
  const soldMap = aggregateSoldRows(order, soldRows);
  const previous = returnedQuantityMap(previousRows);
  const productLineCounts = new Map();
  for (const item of soldMap.values()) productLineCounts.set(item.product_id, (productLineCounts.get(item.product_id) || 0) + 1);
  const items = Array.from(soldMap.values()).map((item) => {
    const legacyReturned = previous.legacyByProduct.get(item.product_id) || 0;
    const legacyAmbiguous = legacyReturned > 0 && (productLineCounts.get(item.product_id) || 0) > 1;
    const returned = (previous.map.get(item.order_item_id) || 0) + (legacyAmbiguous ? 0 : legacyReturned);
    return {
      order_item_id: item.order_item_id,
      product_id: item.product_id,
      product_name: item.product_name,
      variant_id: item.variant_id,
      variant_label: item.variant_label,
      legacy_variant_ambiguous: legacyAmbiguous,
      sold_quantity: item.sold_quantity,
      returned_quantity: returned,
      remaining_quantity: Math.max(0, item.sold_quantity - returned),
      unit_ratio: item.unit_ratio,
      mixed_unit_ratio: item.mixed_unit_ratio,
      refund_unit_estimate: item.refund_unit_value,
    };
  });
  return {
    order_id: order.id,
    order_code: order.order_code,
    order_status: order.status,
    total_amount: Number(order.total_amount) || 0,
    already_refunded: previous.totalRefund,
    remaining_refundable: Math.max(0, (Number(order.total_amount) || 0) - previous.totalRefund),
    items,
  };
}

router.get('/', async (req, res) => {
  try {
    const scopeId = req.user.actorType === 'staff' ? resolvePosBranch(req, null) : null;
    const rows = await all(
      `SELECT r.* FROM returns r JOIN pos_orders o ON o.id = r.order_id AND o.user_id = r.user_id
       WHERE r.user_id = ? ${scopeId === null ? '' : 'AND o.branch_id = ?'} ORDER BY r.createdAt DESC LIMIT 200`,
      scopeId === null ? [req.tenantId] : [req.tenantId, scopeId],
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/eligibility/:orderId', async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ error: 'Đơn hàng không hợp lệ' });
    if (req.user.actorType === 'staff') {
      const scopeId = resolvePosBranch(req, null);
      const order = await get('SELECT branch_id FROM pos_orders WHERE id = ? AND user_id = ?', [orderId, req.tenantId]);
      if (!order || Number(order.branch_id) !== scopeId) return res.status(403).json({ error: 'Không được xem trả hàng của chi nhánh khác.' });
    }
    const result = await loadEligibility(req.tenantId, orderId);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const record = await get('SELECT * FROM returns WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!record) return res.status(404).json({ error: 'Không tìm thấy phiếu trả' });
    if (req.user.actorType === 'staff') {
      const scopeId = resolvePosBranch(req, null);
      const order = await get('SELECT branch_id FROM pos_orders WHERE id = ? AND user_id = ?', [record.order_id, req.tenantId]);
      if (!order || Number(order.branch_id) !== scopeId) return res.status(403).json({ error: 'Không được xem phiếu trả của chi nhánh khác.' });
    }
    record.items = await all('SELECT * FROM return_items WHERE return_id = ?', [record.id]);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req, res) => {
  const userId = req.tenantId;
  const orderId = Number(req.body?.order_id);
  const reason = String(req.body?.reason || '').trim();
  const requestedItems = req.body?.items;

  if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).json({ error: 'Đơn hàng không hợp lệ' });
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) return res.status(400).json({ error: 'Chọn ít nhất một mặt hàng cần trả' });

  const requestedLines = [];
  for (const item of requestedItems) {
    const productId = Number(item?.product_id);
    const orderItemId = item?.order_item_id == null || item?.order_item_id === '' ? null : Number(item.order_item_id);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Sản phẩm trả hàng không hợp lệ' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Số lượng trả phải là số hữu hạn lớn hơn 0' });
    if (orderItemId !== null && (!Number.isInteger(orderItemId) || orderItemId <= 0)) return res.status(400).json({ error: 'Dòng bán cần trả không hợp lệ' });
    requestedLines.push({ product_id: productId, order_item_id: orderItemId, quantity });
  }

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');

    const executeReturn = native.transaction(() => {
      const order = native.prepare('SELECT * FROM pos_orders WHERE id = ? AND user_id = ?').get(orderId, userId);
      if (!order) throw httpError(404, 'Không tìm thấy đơn hàng');
      if (req.user.actorType === 'staff' && Number(order.branch_id) !== resolvePosBranch(req, null)) {
        throw httpError(403, 'Không được trả hàng của chi nhánh khác.');
      }
      if (order.status === 'cancelled') throw httpError(409, 'Đơn đã hủy, không thể tạo phiếu trả hàng');
      if (order.status === 'pending_payment') {
        throw httpError(409, 'Đơn chuyển khoản chưa được xác nhận thanh toán. Hãy xác nhận thanh toán hoặc hủy đơn trước khi trả hàng.');
      }

      const soldRows = native.prepare(
        'SELECT id, product_id, product_name, quantity, price, discount, unit_ratio, variant_id, variant_label FROM pos_order_items WHERE order_id = ? AND product_id IS NOT NULL'
      ).all(order.id);
      const soldMap = aggregateSoldRows(order, soldRows);
      if (soldMap.size === 0) throw httpError(409, 'Đơn không có mặt hàng có thể hoàn kho');

      const previousRows = native.prepare(
        `SELECT r.id AS return_id, ri.order_item_id, ri.product_id, ri.variant_id, ri.quantity, r.total_refund
         FROM return_items ri JOIN returns r ON r.id = ri.return_id
         WHERE r.user_id = ? AND r.order_id = ?`
      ).all(userId, order.id);
      const previous = returnedQuantityMap(previousRows);

      const prepared = [];
      let rawRefundTotal = 0;
      const soldLines = [...soldMap.values()];
      const requestedByLine = new Map();
      for (const requested of requestedLines) {
        let sold;
        if (requested.order_item_id) {
          sold = soldMap.get(requested.order_item_id);
          if (!sold || Number(sold.product_id) !== requested.product_id) throw httpError(403, 'Dòng bán không thuộc sản phẩm/đơn hàng gốc');
        } else {
          const candidates = soldLines.filter((line) => Number(line.product_id) === requested.product_id);
          if (candidates.length !== 1) throw httpError(409, 'Sản phẩm có nhiều phân loại/dòng bán trong đơn. Hãy chọn đúng phân loại cần trả.');
          sold = candidates[0];
        }
        const quantity = (requestedByLine.get(sold.order_item_id) || 0) + requested.quantity;
        if (!Number.isFinite(quantity)) throw httpError(400, 'Tổng số lượng trả không hợp lệ');
        requestedByLine.set(sold.order_item_id, quantity);
      }
      const productLineCounts = new Map();
      for (const line of soldLines) productLineCounts.set(line.product_id, (productLineCounts.get(line.product_id) || 0) + 1);
      for (const [orderItemId, quantity] of requestedByLine.entries()) {
        const sold = soldMap.get(orderItemId);
        if (!sold) throw httpError(403, 'Có dòng bán không thuộc đơn hàng gốc');
        if (sold.mixed_unit_ratio) {
          throw httpError(409, `"${sold.product_name}" đã được bán theo nhiều quy đổi đơn vị trong cùng đơn; chưa thể hoàn an toàn theo sản phẩm gộp.`);
        }
        const legacyReturned = previous.legacyByProduct.get(sold.product_id) || 0;
        if (legacyReturned > 0 && (productLineCounts.get(sold.product_id) || 0) > 1) {
          throw httpError(409, 'Đơn cũ đã có phiếu trả gộp trước khi hỗ trợ phân loại. Cần đối soát thủ công để tránh hoàn trùng.');
        }
        const returned = (previous.map.get(sold.order_item_id) || 0) + legacyReturned;
        const remaining = Math.max(0, sold.sold_quantity - returned);
        if (quantity > remaining + 1e-9) {
          throw httpError(409, `"${sold.product_name}" chỉ còn ${remaining} có thể trả, không thể trả ${quantity}`);
        }
        const rawRefund = quantity * sold.refund_unit_value;
        if (!Number.isFinite(rawRefund) || rawRefund < 0) throw httpError(409, `Giá trị hoàn của "${sold.product_name}" không hợp lệ`);
        prepared.push({ ...sold, quantity, rawRefund });
        rawRefundTotal += rawRefund;
      }

      if (!Number.isFinite(rawRefundTotal) || rawRefundTotal < 0) throw httpError(409, 'Tổng tiền hoàn không hợp lệ');
      const remainingOrderRefund = Math.max(0, Number(order.total_amount || 0) - previous.totalRefund);
      const targetRefund = Math.min(Math.round(rawRefundTotal), Math.round(remainingOrderRefund));
      if (rawRefundTotal > 0 && targetRefund <= 0) throw httpError(409, 'Đơn hàng đã được hoàn hết giá trị thanh toán');

      let allocated = 0;
      for (let index = 0; index < prepared.length; index += 1) {
        const item = prepared[index];
        let lineRefund;
        if (index === prepared.length - 1) {
          lineRefund = Math.max(0, targetRefund - allocated);
        } else if (rawRefundTotal > 0) {
          lineRefund = Math.max(0, Math.round(targetRefund * item.rawRefund / rawRefundTotal));
          lineRefund = Math.min(lineRefund, targetRefund - allocated);
        } else {
          lineRefund = 0;
        }
        item.refund_total = lineRefund;
        item.refund_unit = item.quantity > 0 ? lineRefund / item.quantity : 0;
        allocated += lineRefund;
      }
      const totalRefund = allocated;

      const branchId = Number(order.branch_id) || null;
      if (branchId) {
        const branch = native.prepare('SELECT id FROM branches WHERE id = ? AND user_id = ?').get(branchId, userId);
        if (!branch) throw httpError(409, 'Chi nhánh của đơn gốc không còn hợp lệ; chưa thể hoàn kho tự động');
      }

      const code = `PT${Date.now().toString(36).toUpperCase()}${String(Number(process.hrtime.bigint() % 10000n)).padStart(4, '0')}`;
      const returnResult = native.prepare(
        `INSERT INTO returns (user_id, code, order_id, order_code, total_refund, reason)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(userId, code, order.id, order.order_code, totalRefund, reason || null);
      const returnId = Number(returnResult.lastInsertRowid);

      const insertItem = native.prepare(
        `INSERT INTO return_items (return_id, order_item_id, product_id, product_name, variant_id, variant_label, quantity, price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const restoreVariantStock = native.prepare(
        `UPDATE product_variants SET stock = stock + ?
         WHERE id = ? AND product_id = ?
           AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_variants.product_id AND p.user_id = ?)`
      );
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
      const insertLog = native.prepare(
        `INSERT INTO inventory_logs (user_id, product_id, type, quantity, note, branch_id)
         VALUES (?, ?, 'IN', ?, ?, ?)`
      );

      for (const item of prepared) {
        insertItem.run(returnId, item.order_item_id, item.product_id, item.product_name, item.variant_id, item.variant_label || null, item.quantity, item.refund_unit);
        const baseQuantity = item.quantity * item.unit_ratio;
        if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) throw httpError(409, `Số lượng hoàn kho của "${item.product_name}" không hợp lệ`);
        if (branchId) {
          addBranchStock.run(branchId, item.product_id, baseQuantity);
          syncTotalStock.run(item.product_id, item.product_id, userId);
        } else {
          const changed = addLegacyStock.run(baseQuantity, item.product_id, userId);
          if (changed.changes !== 1) throw httpError(403, 'Có sản phẩm không thuộc cửa hàng của bạn');
        }
        if (item.variant_id) {
          const restoredVariant = restoreVariantStock.run(baseQuantity, item.variant_id, item.product_id, userId);
          if (restoredVariant.changes !== 1) throw httpError(409, `Không thể hoàn tồn phân loại của "${item.product_name}"`);
        }
        insertLog.run(userId, item.product_id, baseQuantity, `Trả hàng ${code} từ đơn ${order.order_code}`, branchId);
      }

      const orderDebts = native.prepare(
        `SELECT id, amount, paid_amount, status FROM debts
         WHERE user_id = ? AND order_code = ? ORDER BY id ASC`
      ).all(userId, order.order_code);
      let debtReduction = 0;
      let needDebtReduction = totalRefund;
      const updateDebt = native.prepare('UPDATE debts SET amount = ?, status = ? WHERE id = ? AND user_id = ?');
      for (const debt of orderDebts) {
        if (needDebtReduction <= 0) break;
        const paidAmount = Math.max(0, Number(debt.paid_amount || 0));
        const outstanding = Math.max(0, Number(debt.amount || 0) - paidAmount);
        const reduce = Math.min(needDebtReduction, outstanding);
        if (reduce <= 0) continue;
        const newAmount = Math.max(paidAmount, Number(debt.amount || 0) - reduce);
        const newStatus = newAmount <= paidAmount ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid');
        updateDebt.run(newAmount, newStatus, debt.id, userId);
        debtReduction += reduce;
        needDebtReduction -= reduce;
      }

      const cashRefund = Math.max(0, totalRefund - debtReduction);
      if (cashRefund > 0) {
        const referenceIds = [order.order_code, ...orderDebts.map((debt) => `DEBT-${debt.id}`)];
        const placeholders = referenceIds.map(() => '?').join(',');
        const collectedRows = native.prepare(
          `SELECT COALESCE(NULLIF(payment_method, ''), 'cash') AS payment_method, SUM(amount) AS amount
           FROM cash_flows
           WHERE user_id = ? AND transaction_type = 'in' AND reference_id IN (${placeholders})
           GROUP BY COALESCE(NULLIF(payment_method, ''), 'cash')`
        ).all(userId, ...referenceIds);

        const byMethod = new Map();
        for (const row of collectedRows) {
          const amount = Math.max(0, Number(row.amount) || 0);
          if (amount > 0) byMethod.set(String(row.payment_method || 'cash'), amount);
        }

        if (byMethod.size === 0) {
          const legacyCash = Math.max(0, Number(order.paid_cash || 0))
            + orderDebts.reduce((sum, debt) => sum + Math.max(0, Number(debt.paid_amount || 0)), 0);
          const legacyBank = Math.max(0, Number(order.paid_bank || 0));
          if (legacyCash > 0) byMethod.set('cash', legacyCash);
          if (legacyBank > 0) byMethod.set('bank', legacyBank);
        }

        const collectedTotal = Array.from(byMethod.values()).reduce((sum, amount) => sum + amount, 0);
        if (!(collectedTotal > 0)) {
          throw httpError(409, 'Không xác định được dòng tiền khách đã thanh toán để hoàn tiền an toàn');
        }
        if (cashRefund > collectedTotal + 0.5) {
          throw httpError(409, 'Số tiền cần hoàn vượt dòng tiền đã thu của đơn. Cần đối soát công nợ trước khi hoàn.');
        }

        const insertCashFlow = native.prepare(
          `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes, branch_id)
           VALUES (?, 'out', 'refund', ?, ?, ?, ?, ?)`
        );
        const methods = Array.from(byMethod.entries());
        let allocatedRefund = 0;
        for (let index = 0; index < methods.length; index += 1) {
          const [method, sourceAmount] = methods[index];
          const amount = index === methods.length - 1
            ? Math.max(0, cashRefund - allocatedRefund)
            : Math.min(cashRefund - allocatedRefund, Math.max(0, Math.round(cashRefund * sourceAmount / collectedTotal)));
          if (amount > 0) {
            insertCashFlow.run(userId, amount, method, code, `Hoàn tiền trả hàng ${code} - ${order.order_code}`, branchId);
            allocatedRefund += amount;
          }
        }
        if (allocatedRefund !== cashRefund) throw httpError(409, 'Không phân bổ được đủ dòng tiền hoàn khách');
      }

      const orderRevenue = Math.max(0, (Number(order.subtotal) || 0) - (Number(order.discount) || 0));
      const orderTotal = Math.max(0, Number(order.total_amount) || 0);
      const revenueRefund = orderTotal > 0 ? totalRefund * orderRevenue / orderTotal : 0;
      if (revenueRefund > 0) {
        native.prepare(
          `INSERT INTO transactions (date, voucherNumber, description, amount, category, user_id)
           SELECT ?, ?, ?, ?, category, user_id FROM transactions
           WHERE user_id = ? AND voucherNumber = ? ORDER BY rowid ASC LIMIT 1`
        ).run(
          formatBusinessDate(new Date()),
          code,
          `Trả hàng đơn ${order.order_code}`,
          -revenueRefund,
          userId,
          order.order_code
        );
      }

      if (order.customer_phone && totalRefund > 0) {
        native.prepare(
          'UPDATE customers SET total_spend = MAX(0, total_spend - ?) WHERE user_id = ? AND phone = ?'
        ).run(totalRefund, userId, order.customer_phone);
      }

      return {
        id: returnId,
        code,
        totalRefund,
        debtReduction,
        cashRefund,
        remainingRefundable: Math.max(0, remainingOrderRefund - totalRefund),
      };
    });

    const result = executeReturn.immediate();
    writeAudit(req, {
      action: 'return.create',
      target: result.code,
      detail: {
        order_id: orderId,
        total_refund: result.totalRefund,
        debt_reduction: result.debtReduction,
        cash_refund: result.cashRefund,
        item_count: requestedLines.length,
      },
    });
    return res.json({
      success: true,
      id: result.id,
      code: result.code,
      total_refund: result.totalRefund,
      debt_reduction: result.debtReduction,
      cash_refund: result.cashRefund,
      remaining_refundable: result.remainingRefundable,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
