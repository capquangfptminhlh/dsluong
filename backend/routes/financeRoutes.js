const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolvePosBranch, resolveReportBranch, requireCompanyFinanceAccess } = require('../utils/branchAccess');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

// Toàn bộ dữ liệu tài chính tách theo cửa hàng (req.tenantId từ token)
router.use(requireAuth);

const quyenCongNo = requirePermission('debt');
const quyenTaiChinh = requirePermission('finance');

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || {})));
});
const validDate = (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(String(value));
const periodFilter = (column, from, to, params) => {
  let sql = '';
  if (from) { sql += ` AND date(${column}) >= date(?)`; params.push(from); }
  if (to) { sql += ` AND date(${column}) <= date(?)`; params.push(to); }
  return sql;
};

// --- DEBTS ---
router.get('/debts', quyenCongNo, requireCompanyFinanceAccess, (req, res) => {
  db.all('SELECT * FROM debts WHERE user_id = ? ORDER BY created_at DESC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/debts', quyenCongNo, (req, res) => {
  const { type, partner_name, amount, due_date, notes } = req.body;
  if (!type || !partner_name || !amount) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  if (!['receivable', 'payable'].includes(type)) return res.status(400).json({ error: 'Loại công nợ không hợp lệ' });
  if (Number(amount) <= 0) return res.status(400).json({ error: 'Số tiền phải lớn hơn 0' });

  db.run(`INSERT INTO debts (user_id, type, partner_name, amount, due_date, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.tenantId, type, partner_name, amount, due_date, notes], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
  });
});

router.post('/debts/:id/pay', quyenCongNo, (req, res) => {
  const { id } = req.params;
  const { paid_amount } = req.body;
  if (!paid_amount || Number(paid_amount) <= 0) return res.status(400).json({ error: 'Số tiền thanh toán phải lớn hơn 0' });

  db.get('SELECT * FROM debts WHERE id = ? AND user_id = ?', [id, req.tenantId], (err, debt) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!debt) return res.status(404).json({ error: 'Không tìm thấy công nợ' });

    const newPaidAmount = (debt.paid_amount || 0) + parseFloat(paid_amount);
    let status = 'partial';
    if (newPaidAmount >= debt.amount) status = 'paid';

    db.run('UPDATE debts SET paid_amount = ?, status = ? WHERE id = ? AND user_id = ?',
      [newPaidAmount, status, id, req.tenantId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // Ghi nhận vào CashFlow (kèm user_id)
      const transactionType = debt.type === 'receivable' ? 'in' : 'out';
      db.run(`INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.tenantId, transactionType, 'debt_collection', parseFloat(paid_amount), 'cash', `DEBT-${id}`, `Thanh toán công nợ: ${debt.partner_name}`], (err3) => {
          if (err3) console.error("Error creating cash flow from debt:", err3);
      });

      writeAudit(req, { action: 'debt.pay', target: String(id), detail: { paid_amount, new_status: status } });
      res.json({ success: true, new_status: status });
    });
  });
});

// --- CASH FLOWS ---
router.get('/cash-flows', quyenTaiChinh, (req, res) => {
  let branchId = null;
  let scope = false;
  try {
    if (req.user.actorType === 'staff') {
      branchId = resolvePosBranch(req, req.query.branch_id);
      scope = true;
    } else if (req.query.branch_id !== undefined && req.query.branch_id !== null && req.query.branch_id !== '') {
      branchId = resolveReportBranch(req, req.query.branch_id);
      scope = true;
    }
  } catch (error) { return res.status(error.status || 500).json({ error: error.message }); }
  db.all(
    `SELECT * FROM cash_flows WHERE user_id = ? ${scope ? 'AND branch_id = ?' : ''} ORDER BY created_at DESC`,
    scope ? [req.tenantId, branchId] : [req.tenantId],
    (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/cash-flows', quyenTaiChinh, (req, res) => {
  const { transaction_type, category, amount, payment_method, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Số tiền phải lớn hơn 0' });
  if (!['in', 'out'].includes(transaction_type)) return res.status(400).json({ error: 'Loại thu/chi không hợp lệ' });

  // Sinh mã phiếu: PT = phiếu thu, PC = phiếu chi
  const ma = `${transaction_type === 'in' ? 'PT' : 'PC'}${Date.now().toString().slice(-8)}`;

  db.run(
    `INSERT INTO cash_flows (user_id, transaction_type, category, amount, payment_method, reference_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.tenantId, transaction_type, category || 'other', amount, payment_method || 'cash', ma, notes],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      writeAudit(req, { action: transaction_type === 'in' ? 'cash.in' : 'cash.out', target: ma, detail: { amount, category, notes } });
      res.json({ success: true, id: this.lastID, reference_id: ma });
    }
  );
});

// --- P&L (LÃI/LỖ) ---
router.get('/pnl', quyenTaiChinh, requireCompanyFinanceAccess, async (req, res) => {
  try {
    const userId = req.tenantId;
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    if (!validDate(from) || !validDate(to)) return res.status(400).json({ error: 'Khoảng ngày phải theo định dạng YYYY-MM-DD' });
    if (from && to && from > to) return res.status(400).json({ error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc' });

    const orderParams = [userId];
    const orderPeriod = periodFilter('o.createdAt', from, to, orderParams);
    const sales = await get(
      `SELECT COALESCE(SUM(CASE WHEN COALESCE(o.subtotal,0)-COALESCE(o.discount,0) > 0
        THEN COALESCE(o.subtotal,0)-COALESCE(o.discount,0) ELSE 0 END),0) AS gross_sales
       FROM pos_orders o WHERE o.user_id = ? AND o.status = 'paid'${orderPeriod}`, orderParams);

    const returnParams=[userId,userId];
    const returnPeriod=periodFilter('r.createdAt',from,to,returnParams);
    const returnedRevenue=await get(
      `SELECT COALESCE(SUM(COALESCE(r.total_refund,0) *
        CASE WHEN COALESCE(o.total_amount,0)>0
          THEN MAX(0,COALESCE(o.subtotal,0)-COALESCE(o.discount,0))/o.total_amount ELSE 0 END),0) AS returned_revenue
       FROM returns r JOIN pos_orders o ON o.id=r.order_id AND o.user_id=?
       WHERE r.user_id=?${returnPeriod}`, returnParams);

    const cogsParams=[userId];
    const cogsPeriod=periodFilter('o.createdAt',from,to,cogsParams);
    const soldCogs=await get(
      `SELECT COALESCE(SUM(COALESCE(
          i.cost_price,
          (CASE WHEN i.variant_id IS NOT NULL THEN COALESCE(pv.cost_price,p.cost_price,0)
                ELSE COALESCE(p.cost_price,0) END) * COALESCE(NULLIF(i.unit_ratio,0),1),
          0) * COALESCE(i.quantity,0)),0) AS sold_cogs
       FROM pos_order_items i
       JOIN pos_orders o ON o.id=i.order_id AND o.user_id=? AND o.status='paid'
       LEFT JOIN products p ON p.id=i.product_id AND p.user_id=o.user_id
       LEFT JOIN product_variants pv ON pv.id=i.variant_id AND pv.product_id=i.product_id
       WHERE 1=1${cogsPeriod}`, cogsParams);

    const returnCogsParams=[userId,userId];
    const returnCogsPeriod=periodFilter('r.createdAt',from,to,returnCogsParams);
    const returnedCogs=await get(
      `SELECT COALESCE(SUM(COALESCE(
          i.cost_price,
          (CASE WHEN COALESCE(i.variant_id,ri.variant_id) IS NOT NULL THEN COALESCE(pv.cost_price,p.cost_price,0)
                ELSE COALESCE(p.cost_price,0) END) * COALESCE(NULLIF(i.unit_ratio,0),1),
          0) * COALESCE(ri.quantity,0)),0) AS returned_cogs
       FROM return_items ri
       JOIN returns r ON r.id=ri.return_id AND r.user_id=?
       LEFT JOIN pos_order_items i ON i.id=ri.order_item_id
       LEFT JOIN products p ON p.id=COALESCE(i.product_id,ri.product_id) AND p.user_id=?
       LEFT JOIN product_variants pv ON pv.id=COALESCE(i.variant_id,ri.variant_id) AND pv.product_id=COALESCE(i.product_id,ri.product_id)
       WHERE 1=1${returnCogsPeriod}`, returnCogsParams);

    const flowParams=[userId];
    const flowPeriod=periodFilter('created_at',from,to,flowParams);
    const flows=await get(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type='in' AND category NOT IN ('sales','debt_collection','refund') THEN amount ELSE 0 END),0) AS other_income,
         COALESCE(SUM(CASE WHEN transaction_type='out' AND category NOT IN ('purchase','refund','debt_collection') THEN amount ELSE 0 END),0) AS operating_expense
       FROM cash_flows WHERE user_id=?${flowPeriod}`, flowParams);

    const grossSales=Number(sales.gross_sales)||0;
    const salesReturns=Number(returnedRevenue.returned_revenue)||0;
    const netRevenue=grossSales-salesReturns;
    const costOfGoods=(Number(soldCogs.sold_cogs)||0)-(Number(returnedCogs.returned_cogs)||0);
    const grossProfit=netRevenue-costOfGoods;
    const otherIncome=Number(flows.other_income)||0;
    const operatingExpense=Number(flows.operating_expense)||0;
    const netProfit=grossProfit+otherIncome-operatingExpense;

    res.json({
      from:from||null,to:to||null,
      gross_sales:grossSales,sales_returns:salesReturns,net_revenue:netRevenue,
      cost_of_goods:costOfGoods,gross_profit:grossProfit,
      gross_margin_percent:netRevenue ? grossProfit*100/netRevenue : 0,
      other_income:otherIncome,operating_expense:operatingExpense,
      net_profit:netProfit,net_margin_percent:netRevenue ? netProfit*100/netRevenue : 0,
      revenue:netRevenue,expense:costOfGoods+operatingExpense,profit:netProfit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
