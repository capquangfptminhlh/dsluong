const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolveReportBranch } = require('../utils/branchAccess');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { formatBusinessDate } = require('../utils/businessDate');

router.use(requireAuth);
router.use(requirePermission('reports'));

function storedTimestampBusinessDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasZone ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatBusinessDate(parsed);
}

router.get('/', (req, res) => {
  db.all('SELECT * FROM reports WHERE user_id = ? ORDER BY createdAt DESC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Branch performance deliberately reports GROSS profit only. Existing cash_flows do
// not carry reliable branch attribution, so net profit is unavailable by location.
router.get('/branch-gross-profit', (req, res) => {
  try {
    const branchId = resolveReportBranch(req, req.query.branch_id);
    if (branchId === null) return res.status(400).json({ error: 'Vui lòng chọn một chi nhánh để xem lợi nhuận gộp.' });
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
        (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) || (from && to && from > to)) {
      return res.status(400).json({ error: 'Khoảng ngày báo cáo không hợp lệ.' });
    }
    const native = db._native;
    const period = (column, params) => {
      let sql = '';
      if (from) { sql += ` AND date(${column}) >= date(?)`; params.push(from); }
      if (to) { sql += ` AND date(${column}) <= date(?)`; params.push(to); }
      return sql;
    };
    const salesParams = [req.tenantId, branchId];
    const sale = native.prepare(`
      SELECT COALESCE(SUM(MAX(0, COALESCE(o.subtotal,0)-COALESCE(o.discount,0))),0) AS gross_sales,
        COUNT(*) AS paid_orders
      FROM pos_orders o
      WHERE o.user_id=? AND o.branch_id=? AND o.status='paid'${period('o.createdAt', salesParams)}
    `).get(...salesParams);

    const returnedParams = [req.tenantId, branchId];
    const returned = native.prepare(`
      SELECT COALESCE(SUM(COALESCE(r.total_refund,0) *
        CASE WHEN COALESCE(o.total_amount,0)>0
          THEN MAX(0,COALESCE(o.subtotal,0)-COALESCE(o.discount,0))/o.total_amount ELSE 0 END),0) AS sales_returns
      FROM returns r JOIN pos_orders o ON o.id=r.order_id AND o.user_id=r.user_id
      WHERE o.user_id=? AND o.branch_id=?${period('r.createdAt', returnedParams)}
    `).get(...returnedParams);

    const cogsParams = [req.tenantId, branchId];
    const sold = native.prepare(`
      SELECT COALESCE(SUM(COALESCE(i.cost_price,
        (CASE WHEN i.variant_id IS NOT NULL THEN COALESCE(pv.cost_price,p.cost_price,0)
              ELSE COALESCE(p.cost_price,0) END)*COALESCE(NULLIF(i.unit_ratio,0),1),
        0)*COALESCE(i.quantity,0)),0) AS sold_cogs
      FROM pos_order_items i
      JOIN pos_orders o ON o.id=i.order_id AND o.user_id=? AND o.status='paid' AND o.branch_id=?
      LEFT JOIN products p ON p.id=i.product_id AND p.user_id=o.user_id
      LEFT JOIN product_variants pv ON pv.id=i.variant_id AND pv.product_id=i.product_id
      WHERE 1=1${period('o.createdAt', cogsParams)}
    `).get(...cogsParams);

    const returnCostParams = [req.tenantId, branchId];
    const returnedCost = native.prepare(`
      SELECT COALESCE(SUM(COALESCE(i.cost_price,
        (CASE WHEN COALESCE(i.variant_id,ri.variant_id) IS NOT NULL THEN COALESCE(pv.cost_price,p.cost_price,0)
              ELSE COALESCE(p.cost_price,0) END)*COALESCE(NULLIF(i.unit_ratio,0),1),
        0)*COALESCE(ri.quantity,0)),0) AS returned_cogs
      FROM return_items ri
      JOIN returns r ON r.id=ri.return_id
      JOIN pos_orders o ON o.id=r.order_id AND o.user_id=r.user_id
      LEFT JOIN pos_order_items i ON i.id=ri.order_item_id
      LEFT JOIN products p ON p.id=COALESCE(i.product_id,ri.product_id) AND p.user_id=o.user_id
      LEFT JOIN product_variants pv ON pv.id=COALESCE(i.variant_id,ri.variant_id)
         AND pv.product_id=COALESCE(i.product_id,ri.product_id)
      WHERE o.user_id=? AND o.branch_id=?${period('r.createdAt', returnCostParams)}
    `).get(...returnCostParams);

    const grossSales = Number(sale.gross_sales)||0;
    const salesReturns = Number(returned.sales_returns)||0;
    const netRevenue = grossSales - salesReturns;
    const costOfGoods = (Number(sold.sold_cogs)||0) - (Number(returnedCost.returned_cogs)||0);
    const grossProfit = netRevenue - costOfGoods;

    // Financial cash flows that have explicit branch attribution can improve
    // the branch overview. Do not silently allocate shared/legacy entries.
    const flowParams = [req.tenantId, branchId];
    const flowPeriod = period('created_at', flowParams);
    const attributed = native.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'in'
          AND category NOT IN ('sales', 'debt_collection', 'refund')
          THEN amount ELSE 0 END), 0) AS other_income,
        COALESCE(SUM(CASE WHEN transaction_type = 'out'
          AND category NOT IN ('purchase', 'refund', 'debt_collection')
          THEN amount ELSE 0 END), 0) AS operating_expenses
      FROM cash_flows
      WHERE user_id = ? AND branch_id = ?${flowPeriod}
    `).get(...flowParams);

    const unallocatedParams = [req.tenantId];
    const unallocatedPeriod = period('created_at', unallocatedParams);
    const shared = native.prepare(`
      SELECT COUNT(*) AS entries,
        COALESCE(SUM(CASE WHEN transaction_type = 'out'
          AND category NOT IN ('purchase', 'refund', 'debt_collection')
          THEN amount ELSE 0 END), 0) AS shared_operating_expenses
      FROM cash_flows WHERE user_id = ? AND branch_id IS NULL
      AND category NOT IN ('sales', 'refund', 'debt_collection')${unallocatedPeriod}
    `).get(...unallocatedParams);

    const attributedOtherIncome = Number(attributed.other_income) || 0;
    const attributedOperatingExpenses = Number(attributed.operating_expenses) || 0;
    // Shared/HQ finances belong only to the owner. A staff member may see
    // assigned-branch results but not company-wide unallocated expenditures.
    const unallocatedEntries = req.user.actorType === 'staff' ? null : (Number(shared.entries) || 0);
    const sharedOperatingExpenses = req.user.actorType === 'staff' ? null : (Number(shared.shared_operating_expenses) || 0);

    return res.json({
      branch_id: branchId, from: from || null, to: to || null,
      paid_orders: Number(sale.paid_orders)||0,
      gross_sales: grossSales, sales_returns: salesReturns, net_revenue: netRevenue,
      cost_of_goods: costOfGoods, gross_profit: grossProfit,
      gross_margin_percent: netRevenue ? 100*grossProfit/netRevenue : 0,
      operating_expense: null, net_profit: null,
      attributed_other_income: attributedOtherIncome,
      attributed_operating_expenses: attributedOperatingExpenses,
      profit_after_attributed_expenses: grossProfit + attributedOtherIncome - attributedOperatingExpenses,
      unallocated_cashflow_entries: unallocatedEntries,
      shared_operating_expenses: sharedOperatingExpenses,
      expense_allocation: unallocatedEntries > 0 ? 'partial' : 'unverified',
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/dashboard', (req, res) => {
  const userId = req.tenantId;
  let branchId;
  try { branchId = resolveReportBranch(req, req.query.branch_id); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message }); }
  const filter = branchId === null ? '' : ' AND branch_id = ?';
  db.all(`SELECT total_amount, createdAt FROM pos_orders WHERE user_id = ? AND status != 'cancelled'${filter}`,
    branchId === null ? [userId] : [userId, branchId], (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });
    let totalRevenue = 0;
    const dailyRevenue = {};
    orders.forEach((o) => {
      totalRevenue += Number(o.total_amount) || 0;
      const date = storedTimestampBusinessDate(o.createdAt);
      if (date) dailyRevenue[date] = (dailyRevenue[date] || 0) + (Number(o.total_amount) || 0);
    });
    const chartData = Object.keys(dailyRevenue).sort().map((date) => ({ date: date.substring(5), revenue: dailyRevenue[date] })).slice(-7);

    db.all(`
      SELECT i.product_name AS name, SUM(i.quantity) AS sold, SUM(i.price * i.quantity) AS revenue
      FROM pos_order_items i
      JOIN pos_orders o ON i.order_id = o.id AND o.user_id = ? AND o.status != 'cancelled'
      ${branchId === null ? '' : 'AND o.branch_id = ?'}
      GROUP BY i.product_name
      ORDER BY sold DESC
      LIMIT 5
    `, branchId === null ? [userId] : [userId, branchId], (topErr, topProducts) => {
      if (topErr) return res.status(500).json({ error: topErr.message });
      res.json({ overview: { totalRevenue, totalOrders: orders.length }, chartData, topProducts: topProducts || [] });
    });
  });
});

router.get('/profit-by-product', (req, res) => {
  const userId = req.tenantId;
  let branchId;
  try { branchId = resolveReportBranch(req, req.query.branch_id); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message }); }
  const query = `
    SELECT
      i.product_name AS name,
      p.sku AS sku,
      SUM(i.quantity) AS total_sold,
      SUM(i.price * i.quantity) AS total_revenue,
      SUM(COALESCE(p.cost_price, 0) * i.quantity) AS total_cost,
      (SUM(i.price * i.quantity) - SUM(COALESCE(p.cost_price, 0) * i.quantity)) AS profit,
      ROUND(
        CASE WHEN SUM(i.price * i.quantity) > 0
          THEN ((SUM(i.price * i.quantity) - SUM(COALESCE(p.cost_price, 0) * i.quantity)) * 100.0 / SUM(i.price * i.quantity))
          ELSE 0 END, 1
      ) AS margin_percent
    FROM pos_order_items i
    JOIN pos_orders o ON i.order_id = o.id AND o.user_id = ? AND o.status != 'cancelled'
      ${branchId === null ? '' : 'AND o.branch_id = ?'}
    LEFT JOIN products p
      ON p.user_id = o.user_id
      AND (p.id = i.product_id OR (i.product_id IS NULL AND p.name = i.product_name))
    GROUP BY i.product_name, p.sku
    ORDER BY profit DESC
  `;
  db.all(query, branchId === null ? [userId] : [userId, branchId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.get('/inventory-valuation', (req, res) => {
  let branchId;
  try { branchId = resolveReportBranch(req, req.query.branch_id); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message }); }
  const stockExpression = branchId === null ? 'COALESCE(p.stock, 0)' : 'COALESCE(bs.stock, 0)';
  const query = `
    SELECT p.id, p.name, p.sku, p.category,
      ${stockExpression} AS stock,
      COALESCE(p.cost_price, 0) AS cost_price,
      COALESCE(p.price, 0) AS price,
      (${stockExpression} * COALESCE(p.cost_price, 0)) AS total_cost_value,
      (${stockExpression} * COALESCE(p.price, 0)) AS total_retail_value
    FROM products p
    ${branchId === null ? '' : 'LEFT JOIN branch_stock bs ON bs.product_id = p.id AND bs.branch_id = ?'}
    WHERE p.user_id = ? ORDER BY total_cost_value DESC
  `;
  db.all(query, branchId === null ? [req.tenantId] : [branchId, req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    let totalStock = 0;
    let totalCostVal = 0;
    let totalRetailVal = 0;
    (rows || []).forEach((r) => {
      totalStock += Number(r.stock) || 0;
      totalCostVal += Number(r.total_cost_value) || 0;
      totalRetailVal += Number(r.total_retail_value) || 0;
    });
    res.json({
      summary: {
        totalStock,
        totalCostValue: totalCostVal,
        totalRetailValue: totalRetailVal,
        expectedProfit: totalRetailVal - totalCostVal,
      },
      items: rows || [],
    });
  });
});

router.get('/top-slow-selling', (req, res) => {
  const userId = req.tenantId;
  let branchId;
  try { branchId = resolveReportBranch(req, req.query.branch_id); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message }); }
  const stockExpression = branchId === null ? 'COALESCE(p.stock, 0)' : 'COALESCE(bs.stock, 0)';
  // Aggregate only orders that belong to the current tenant before joining products.
  // This prevents same-name/SKU items from another shop from leaking into this report.
  const query = `
    WITH sold AS (
      SELECT
        COALESCE(i.product_id, 0) AS product_id,
        i.product_name,
        SUM(i.quantity) AS sold_count,
        SUM(i.quantity * i.price) AS revenue
      FROM pos_order_items i
      JOIN pos_orders o ON o.id = i.order_id
      WHERE o.user_id = ? AND o.status != 'cancelled' ${branchId === null ? '' : 'AND o.branch_id = ?'}
      GROUP BY COALESCE(i.product_id, 0), i.product_name
    )
    SELECT
      p.id,
      p.name,
      p.sku,
      ${stockExpression} AS stock,
      COALESCE(p.price, 0) AS price,
      COALESCE(SUM(s.sold_count), 0) AS sold_count,
      COALESCE(SUM(s.revenue), 0) AS revenue
    FROM products p
    LEFT JOIN sold s ON s.product_id = p.id OR (s.product_id = 0 AND s.product_name = p.name)
    ${branchId === null ? '' : 'LEFT JOIN branch_stock bs ON bs.product_id = p.id AND bs.branch_id = ?'}
    WHERE p.user_id = ?
    GROUP BY p.id
  `;
  db.all(query, branchId === null ? [userId, userId] : [userId, branchId, branchId, userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const items = rows || [];
    const topSelling = [...items].sort((a, b) => b.sold_count - a.sold_count).slice(0, 10);
    const slowSelling = [...items].sort((a, b) => a.sold_count - b.sold_count).slice(0, 10);
    res.json({ topSelling, slowSelling });
  });
});

router.post('/', (req, res) => {
  const { fileName, totalRevenue } = req.body;
  if (!fileName) return res.status(400).json({ error: 'fileName is required' });
  db.run('INSERT INTO reports (fileName, totalRevenue, user_id) VALUES (?, ?, ?)',
    [fileName, totalRevenue || 0, req.tenantId], function onInsert(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, fileName, totalRevenue, createdAt: new Date() });
    });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM reports WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], function onDelete(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Report not found or not authorized' });
    res.json({ message: 'Report deleted successfully' });
  });
});

module.exports = router;
