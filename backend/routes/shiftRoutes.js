const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');
const { requireAuth, requireAnyPermission, writeAudit } = require('../middleware/auth');

// Chốt ca — cho người bán hàng (pos) hoặc quản lý tài chính
router.use(requireAuth);
router.use(requireAnyPermission('pos', 'finance'));

const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r || []))));

function parseNonNegativeMoney(value, { defaultZero = false } = {}) {
  if ((value === '' || value === null || value === undefined) && defaultZero) return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

async function shiftScope(req, requestedId) {
  const branchId = resolvePosBranch(req, requestedId);
  const count = await get(
    "SELECT COUNT(*) AS count FROM branches WHERE user_id = ? AND COALESCE(status, 'active') = 'active'",
    [req.tenantId],
  );
  const singleStore = Number(count?.count) === 1;
  return {
    branchId,
    singleStore,
    shiftClause: singleStore ? '(branch_id = ? OR branch_id IS NULL)' : 'branch_id = ?',
  };
}

// Ca đang mở (nếu có)
router.get('/current', async (req, res) => {
  try {
    const scope = await shiftScope(req, req.query.branch_id);
    const s = await get(
      `SELECT * FROM cashier_shifts WHERE user_id = ? AND status = 'open'
       AND ${scope.shiftClause} ORDER BY opened_at DESC LIMIT 1`,
      [req.tenantId, scope.branchId],
    );
    if (!s) return res.json(null);
    const tt = await tinhToanCa(req.tenantId, s.opened_at, scope.branchId, scope.singleStore, s.opening_cash_flow_id);
    const opening = Number(s.opening_cash) || 0;
    res.json({ ...s, ...tt, expected_now: opening + tt.cash_sales - tt.cash_out });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Lịch sử ca
router.get('/', async (req, res) => {
  try {
    const scope = await shiftScope(req, req.query.branch_id);
    const rows = await all(
      `SELECT * FROM cashier_shifts WHERE user_id = ? AND ${scope.shiftClause}
       ORDER BY opened_at DESC LIMIT 100`,
      [req.tenantId, scope.branchId],
    );
    res.json(rows);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Mở ca — atomic: hai request đồng thời chỉ một request insert được.
router.post('/open', async (req, res) => {
  try {
    const scope = await shiftScope(req, req.body.branch_id);
    const opening = parseNonNegativeMoney(req.body.opening_cash, { defaultZero: true });
    if (!scope.singleStore) {
      const old = await get(
        "SELECT id FROM cashier_shifts WHERE user_id = ? AND status = 'open' AND branch_id IS NULL",
        [req.tenantId],
      );
      if (old) return res.status(409).json({
        error: 'Còn ca cũ chưa phân chi nhánh. Chủ cửa hàng phải đối soát ca này trước khi mở ca riêng.',
      });
    }
    if (opening === null) return res.status(400).json({ error: 'Tiền đầu ca không hợp lệ' });

    const r = await run(
      `INSERT INTO cashier_shifts (user_id, actor_name, opening_cash, branch_id, opening_cash_flow_id, status)
       SELECT ?, ?, ?, ?,
              COALESCE((SELECT MAX(id) FROM cash_flows WHERE user_id = ?), 0), 'open'
       WHERE NOT EXISTS (
         SELECT 1 FROM cashier_shifts WHERE user_id = ? AND status = 'open'
           AND ${scope.shiftClause}
       )`,
      [req.tenantId, req.user.actorName || null, opening, scope.branchId,
        req.tenantId, req.tenantId, scope.branchId],
    );
    if (r.changes === 0) {
      return res.status(409).json({ error: 'Chi nhánh này đang có ca mở. Hãy chốt ca cũ trước khi mở ca mới.' });
    }

    writeAudit(req, { action: 'shift.open', target: String(r.lastID), detail: { opening_cash: opening, branch_id: scope.branchId } });
    res.json({ success: true, id: r.lastID });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Atomic /close is handled exclusively by shiftCloseIntegrityRoutes,
// which is registered ahead of this router in server.js.

// Toàn bộ tiền mặt thực sự đi vào/đi ra két kể từ lúc mở ca.
// Dùng cash_flows thay vì pos_orders để tính đúng cả thanh toán mixed, thu công nợ,
// phiếu thu/chi và hoàn tiền tiền mặt. cash_sales là tên cột legacy, nay mang nghĩa cash-in.
async function tinhToanCa(userId, openedAt, branchId, singleStore = false, openingFlowId = null) {
  const clause = singleStore ? '(branch_id = ? OR branch_id IS NULL)' : 'branch_id = ?';
  const hasWatermark = openingFlowId !== null && openingFlowId !== undefined
    && Number.isInteger(Number(openingFlowId)) && Number(openingFlowId) >= 0;
  const sinceClause = hasWatermark ? 'id > ?' : 'created_at >= ?';
  const sinceValue = hasWatermark ? Number(openingFlowId) : openedAt;
  const thu = await get(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM cash_flows
     WHERE user_id = ? AND ${clause} AND transaction_type = 'in' AND payment_method = 'cash' AND ${sinceClause}`,
    [userId, branchId, sinceValue],
  );
  const chi = await get(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM cash_flows
     WHERE user_id = ? AND ${clause} AND transaction_type = 'out' AND payment_method = 'cash' AND ${sinceClause}`,
    [userId, branchId, sinceValue],
  );
  return { cash_sales: Number(thu?.s) || 0, cash_out: Number(chi?.s) || 0 };
}

module.exports = router;
