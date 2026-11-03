import fs from 'node:fs';

function once(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(before, after);
}

// Add line/variant identity to customer return items at runtime.
{
  const path = 'backend/runtimeSchema.js';
  let s = fs.readFileSync(path, 'utf8');
  s = once(s,
`  if (await tableExists(db, 'inventory_logs')) await addColumnIfMissing(db, 'inventory_logs', 'branch_id', 'branch_id INTEGER');`,
`  if (await tableExists(db, 'inventory_logs')) await addColumnIfMissing(db, 'inventory_logs', 'branch_id', 'branch_id INTEGER');
  if (await tableExists(db, 'return_items')) {
    await addColumnIfMissing(db, 'return_items', 'order_item_id', 'order_item_id INTEGER');
    await addColumnIfMissing(db, 'return_items', 'variant_id', 'variant_id INTEGER');
    await addColumnIfMissing(db, 'return_items', 'variant_label', 'variant_label TEXT');
  }`,
  'runtime return columns');
  fs.writeFileSync(path, s);
}

// Make returns exact-line / exact-variant aware while keeping legacy single-line payloads compatible.
{
  const path = 'backend/routes/returnRoutes.js';
  let s = fs.readFileSync(path, 'utf8');

  s = once(s,
`    const productId = Number(row.product_id);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    const quantity = Number(row.quantity) || 0;
    if (quantity <= 0) continue;`,
`    const productId = Number(row.product_id);
    const orderItemId = Number(row.id);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(orderItemId) || orderItemId <= 0) continue;
    const quantity = Number(row.quantity) || 0;
    if (quantity <= 0) continue;`,
  'aggregate order item id');

  s = once(s,
`    const current = map.get(productId) || {
      product_id: productId,
      product_name: row.product_name,`,
`    const current = map.get(orderItemId) || {
      order_item_id: orderItemId,
      product_id: productId,
      product_name: row.product_name,
      variant_id: Number(row.variant_id) || null,
      variant_label: row.variant_label || '',`,
  'aggregate line key');
  s = once(s, `    map.set(productId, current);`, `    map.set(orderItemId, current);`, 'set line key');

  s = once(s,
`function returnedQuantityMap(rows) {
  const map = new Map();`,
`function returnedQuantityMap(rows) {
  const map = new Map();
  const legacyByProduct = new Map();`,
  'legacy return map init');
  s = once(s,
`    const productId = Number(row.product_id);
    const quantity = Number(row.quantity) || 0;
    if (Number.isInteger(productId) && productId > 0 && quantity > 0) {
      map.set(productId, (map.get(productId) || 0) + quantity);
    }`,
`    const productId = Number(row.product_id);
    const orderItemId = Number(row.order_item_id);
    const quantity = Number(row.quantity) || 0;
    if (Number.isInteger(productId) && productId > 0 && quantity > 0) {
      if (Number.isInteger(orderItemId) && orderItemId > 0) map.set(orderItemId, (map.get(orderItemId) || 0) + quantity);
      else legacyByProduct.set(productId, (legacyByProduct.get(productId) || 0) + quantity);
    }`,
  'returned line map');
  s = once(s, `  return { map, totalRefund };`, `  return { map, legacyByProduct, totalRefund };`, 'returned map result');

  s = once(s,
`    'SELECT id, product_id, product_name, quantity, price, discount, unit_ratio FROM pos_order_items WHERE order_id = ? AND product_id IS NOT NULL',`,
`    'SELECT id, product_id, product_name, quantity, price, discount, unit_ratio, variant_id, variant_label FROM pos_order_items WHERE order_id = ? AND product_id IS NOT NULL',`,
  'eligibility sold variant fields');
  s = once(s,
`    \`SELECT r.id AS return_id, ri.product_id, ri.quantity, r.total_refund
     FROM return_items ri JOIN returns r ON r.id = ri.return_id`,
`    \`SELECT r.id AS return_id, ri.order_item_id, ri.product_id, ri.variant_id, ri.quantity, r.total_refund
     FROM return_items ri JOIN returns r ON r.id = ri.return_id`,
  'eligibility prior line fields');

  s = once(s,
`  const soldMap = aggregateSoldRows(order, soldRows);
  const previous = returnedQuantityMap(previousRows);
  const items = Array.from(soldMap.values()).map((item) => {
    const returned = previous.map.get(item.product_id) || 0;`,
`  const soldMap = aggregateSoldRows(order, soldRows);
  const previous = returnedQuantityMap(previousRows);
  const productLineCounts = new Map();
  for (const item of soldMap.values()) productLineCounts.set(item.product_id, (productLineCounts.get(item.product_id) || 0) + 1);
  const items = Array.from(soldMap.values()).map((item) => {
    const legacyReturned = previous.legacyByProduct.get(item.product_id) || 0;
    const legacyAmbiguous = legacyReturned > 0 && (productLineCounts.get(item.product_id) || 0) > 1;
    const returned = (previous.map.get(item.order_item_id) || 0) + (legacyAmbiguous ? 0 : legacyReturned);`,
  'eligibility returned by line');
  s = once(s,
`      product_id: item.product_id,
      product_name: item.product_name,`,
`      order_item_id: item.order_item_id,
      product_id: item.product_id,
      product_name: item.product_name,
      variant_id: item.variant_id,
      variant_label: item.variant_label,
      legacy_variant_ambiguous: legacyAmbiguous,`,
  'eligibility line response');

  // Parse requests by order item; legacy product-only requests remain valid only when exactly one sold line exists.
  s = once(s,
`  const quantityByProduct = new Map();
  for (const item of requestedItems) {
    const productId = Number(item?.product_id);
    const quantity = Number(item?.quantity);`,
`  const requestedLines = [];
  for (const item of requestedItems) {
    const productId = Number(item?.product_id);
    const orderItemId = item?.order_item_id == null || item?.order_item_id === '' ? null : Number(item.order_item_id);
    const quantity = Number(item?.quantity);`,
  'request line parser');
  s = once(s,
`    const total = (quantityByProduct.get(productId) || 0) + quantity;
    if (!Number.isFinite(total)) return res.status(400).json({ error: 'Tổng số lượng trả không hợp lệ' });
    quantityByProduct.set(productId, total);`,
`    if (orderItemId !== null && (!Number.isInteger(orderItemId) || orderItemId <= 0)) return res.status(400).json({ error: 'Dòng bán cần trả không hợp lệ' });
    requestedLines.push({ product_id: productId, order_item_id: orderItemId, quantity });`,
  'request lines collect');

  s = once(s,
`        'SELECT id, product_id, product_name, quantity, price, discount, unit_ratio FROM pos_order_items WHERE order_id = ? AND product_id IS NOT NULL'`,
`        'SELECT id, product_id, product_name, quantity, price, discount, unit_ratio, variant_id, variant_label FROM pos_order_items WHERE order_id = ? AND product_id IS NOT NULL'`,
  'execute sold variant fields');
  s = once(s,
`        \`SELECT r.id AS return_id, ri.product_id, ri.quantity, r.total_refund
         FROM return_items ri JOIN returns r ON r.id = ri.return_id`,
`        \`SELECT r.id AS return_id, ri.order_item_id, ri.product_id, ri.variant_id, ri.quantity, r.total_refund
         FROM return_items ri JOIN returns r ON r.id = ri.return_id`,
  'execute prior line fields');

  s = once(s,
`      const prepared = [];
      let rawRefundTotal = 0;
      for (const [productId, quantity] of quantityByProduct.entries()) {
        const sold = soldMap.get(productId);
        if (!sold) throw httpError(403, 'Có sản phẩm không thuộc đơn hàng gốc');`,
`      const prepared = [];
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
        if (!sold) throw httpError(403, 'Có dòng bán không thuộc đơn hàng gốc');`,
  'execute request exact line');
  s = once(s,
`        const returned = previous.map.get(productId) || 0;`,
`        const legacyReturned = previous.legacyByProduct.get(sold.product_id) || 0;
        if (legacyReturned > 0 && (productLineCounts.get(sold.product_id) || 0) > 1) {
          throw httpError(409, 'Đơn cũ đã có phiếu trả gộp trước khi hỗ trợ phân loại. Cần đối soát thủ công để tránh hoàn trùng.');
        }
        const returned = (previous.map.get(sold.order_item_id) || 0) + legacyReturned;`,
  'execute returned exact line');

  s = once(s,
`        prepared.push({ ...sold, quantity, rawRefund });`,
`        prepared.push({ ...sold, quantity, rawRefund });`,
  'noop prepared marker');

  s = once(s,
`      const insertItem = native.prepare(
        \`INSERT INTO return_items (return_id, product_id, product_name, quantity, price)
         VALUES (?, ?, ?, ?, ?)\`
      );`,
`      const insertItem = native.prepare(
        \`INSERT INTO return_items (return_id, order_item_id, product_id, product_name, variant_id, variant_label, quantity, price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`
      );
      const restoreVariantStock = native.prepare(
        \`UPDATE product_variants SET stock = stock + ?
         WHERE id = ? AND product_id = ?
           AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_variants.product_id AND p.user_id = ?)\`
      );`,
  'insert variant return item');
  s = once(s,
`        insertItem.run(returnId, item.product_id, item.product_name, item.quantity, item.refund_unit);`,
`        insertItem.run(returnId, item.order_item_id, item.product_id, item.product_name, item.variant_id, item.variant_label || null, item.quantity, item.refund_unit);`,
  'insert return exact line');
  s = once(s,
`        insertLog.run(userId, item.product_id, baseQuantity, \`Trả hàng \${code} từ đơn \${order.order_code}\`, branchId);`,
`        if (item.variant_id) {
          const restoredVariant = restoreVariantStock.run(baseQuantity, item.variant_id, item.product_id, userId);
          if (restoredVariant.changes !== 1) throw httpError(409, \`Không thể hoàn tồn phân loại của "\${item.product_name}"\`);
        }
        insertLog.run(userId, item.product_id, baseQuantity, \`Trả hàng \${code} từ đơn \${order.order_code}\`, branchId);`,
  'restore variant stock on return');

  fs.writeFileSync(path, s);
}

// Block full cancellation after any partial/full return; otherwise money and stock would be restored twice.
{
  const path = 'backend/routes/posIntegrityRoutes.js';
  let s = fs.readFileSync(path, 'utf8');
  s = once(s,
`      if (order.status === 'cancelled') {
        const error = new Error('Đơn đã hủy.');
        error.status = 409;
        throw error;
      }

      const items = await all(`,
`      if (order.status === 'cancelled') {
        const error = new Error('Đơn đã hủy.');
        error.status = 409;
        throw error;
      }
      const priorReturn = await get('SELECT id, code FROM returns WHERE user_id = ? AND order_id = ? LIMIT 1', [userId, order.id]);
      if (priorReturn) {
        const error = new Error(\`Đơn đã có phiếu trả \${priorReturn.code || priorReturn.id}; không thể hủy toàn bộ vì sẽ hoàn tồn/tiền trùng.\`);
        error.status = 409;
        throw error;
      }

      const items = await all(`,
  'cancel returned order guard');
  fs.writeFileSync(path, s);
}

// Return UI keys and payloads use exact order-item identity and show variant labels.
{
  const path = 'frontend/src/pages/Returns.jsx';
  let s = fs.readFileSync(path, 'utf8');
  s = s.replaceAll('qty[item.product_id]', 'qty[item.order_item_id || item.product_id]');
  s = s.replaceAll('[item.product_id]: e.target.value', '[item.order_item_id || item.product_id]: e.target.value');
  s = s.replaceAll('key={item.product_id}', 'key={item.order_item_id || item.product_id}');
  s = once(s,
`items: selectedItems.map((item) => ({ product_id: item.product_id, quantity: item.requested })),`,
`items: selectedItems.map((item) => ({ order_item_id: item.order_item_id, product_id: item.product_id, variant_id: item.variant_id, quantity: item.requested })),`,
  'return UI exact-line payload');
  s = once(s,
`                        <div className="font-bold text-slate-800 truncate">{item.product_name}</div>`,
`                        <div className="font-bold text-slate-800 truncate">{item.product_name}</div>
                        {item.variant_label && <div className="text-xs font-semibold text-blue-600 mt-0.5">Phân loại: {item.variant_label}</div>}`,
  'return UI variant label');
  fs.writeFileSync(path, s);
}

console.log('Applied variant-aware returns + returned-order cancellation guard');
