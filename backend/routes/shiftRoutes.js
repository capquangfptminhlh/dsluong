const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAnyPermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireAnyPermission('pos', 'finance', 'staff'));

const get = (sql, p) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));

// Ca đang mở (nếu có)
router.get('/current', async (req, res) => {
  try {
    const s = await get(`SELECT * FROM cashier_shifts WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`, [req.tenantId]);
    if (!s) return res.json(null);
    const tt = await tinhToanCa(req.tenantId, s.opened_at);
    const expected_now = Math.round((s.opening_cash || 0) + tt.cash_sales - tt.cash_out);
    res.json({ ...s, ...tt, expected_now });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Lịch sử ca
router.get('/', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM cashier_shifts WHERE user_id = ? ORDER BY opened_at DESC LIMIT 100', [req.tenantId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mở ca trực quầy thuốc
router.post('/open', async (req, res) => {
  try {
    const dangMo = await get(`SELECT id FROM cashier_shifts WHERE user_id = ? AND status = 'open'`, [req.tenantId]);
    if (dangMo) return res.status(409).json({ error: 'Đang có một ca mở. Hãy chốt ca cũ trước khi mở ca mới.' });
    const opening = Number(req.body.opening_cash) || 0;
    if (opening < 0) return res.status(400).json({ error: 'Tiền đầu ca không hợp lệ' });
    const actorName = req.body.pharmacist_name || req.user.actorName || 'Dược sĩ trực ca';
    const note = req.body.note || null;
    const r = await run(
      `INSERT INTO cashier_shifts (user_id, actor_name, opening_cash, note, status) VALUES (?, ?, ?, ?, 'open')`,
      [req.tenantId, actorName, opening, note]
    );
    writeAudit(req, { action: 'shift.open', detail: { opening_cash: opening, actor_name: actorName } });
    res.json({ success: true, id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Chốt ca trực quầy thuốc
router.post('/close', async (req, res) => {
  try {
    const s = await get(`SELECT * FROM cashier_shifts WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`, [req.tenantId]);
    if (!s) return res.status(404).json({ error: 'Không có ca nào đang mở' });

    const closing = Math.round(Number(req.body.closing_cash) || 0);
    if (isNaN(closing) || closing < 0) return res.status(400).json({ error: 'Tiền cuối ca không hợp lệ' });

    const tt = await tinhToanCa(req.tenantId, s.opened_at);
    const expected = Math.round((s.opening_cash || 0) + tt.cash_sales - tt.cash_out);
    const difference = Math.round(closing - expected);

    await run(
      `UPDATE cashier_shifts SET closing_cash = ?, expected_cash = ?, difference = ?, cash_sales = ?, cash_out = ?, note = ?, status = 'closed', closed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [closing, expected, difference, tt.cash_sales, tt.cash_out, req.body.note || s.note || null, s.id, req.tenantId]
    );
    writeAudit(req, { action: 'shift.close', detail: { opening: s.opening_cash, expected, closing, difference } });
    res.json({
      success: true,
      expected_cash: expected,
      closing_cash: closing,
      difference,
      cash_sales: tt.cash_sales,
      bank_sales: tt.bank_sales,
      order_count: tt.order_count,
      cash_out: tt.cash_out
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Doanh thu tiền mặt, chuyển khoản và chi tiền mặt kể từ lúc mở ca
async function tinhToanCa(userId, openedAt) {
  const banTM = await get(
    `SELECT COALESCE(SUM(total_amount), 0) AS s, COUNT(id) AS cnt FROM pos_orders
     WHERE user_id = ? AND payment_method = 'cash' AND status != 'cancelled' AND createdAt >= ?`,
    [userId, openedAt]
  );
  const banCK = await get(
    `SELECT COALESCE(SUM(total_amount), 0) AS s, COUNT(id) AS cnt FROM pos_orders
     WHERE user_id = ? AND payment_method != 'cash' AND status != 'cancelled' AND createdAt >= ?`,
    [userId, openedAt]
  );
  const chi = await get(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM cash_flows
     WHERE user_id = ? AND transaction_type = 'out' AND payment_method = 'cash' AND created_at >= ?`,
    [userId, openedAt]
  );
  const cashSales = Math.round(banTM ? (banTM.s || 0) : 0);
  const bankSales = Math.round(banCK ? (banCK.s || 0) : 0);
  const orderCount = (banTM ? (banTM.cnt || 0) : 0) + (banCK ? (banCK.cnt || 0) : 0);
  return {
    cash_sales: cashSales,
    bank_sales: bankSales,
    total_revenue: cashSales + bankSales,
    order_count: orderCount,
    cash_out: Math.round(chi ? (chi.s || 0) : 0)
  };
}

module.exports = router;
