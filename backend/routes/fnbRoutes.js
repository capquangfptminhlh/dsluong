'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');
const { ensureHospitalitySchema } = require('../hospitalitySchema');
const { requireAuth, requireAnyPermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireAnyPermission('pos', 'rooms'));

let schemaReady = null;
router.use(async (req, res, next) => {
  try {
    if (!schemaReady) schemaReady = ensureHospitalitySchema(db);
    await schemaReady;
    next();
  } catch (error) {
    schemaReady = null;
    res.status(500).json({ error: 'Không khởi tạo được dữ liệu F&B.' });
  }
});

const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

const fnbUnitName = (sessionId) => `__FNB_${Number(sessionId)}`;

// Staff may operate only their assigned room; owners may operate any of
// their locations. An explicit branch must always match the room's branch.
function assertRoomBranch(req, room, requestedBranchId) {
  if (!room) {
    const error = new Error('Không tìm thấy bàn/phòng.');
    error.status = 404;
    throw error;
  }
  const authorized = req.user.actorType === 'staff'
    ? resolvePosBranch(req, room.branch_id)
    : requestedBranchId === undefined || requestedBranchId === null || requestedBranchId === ''
      ? Number(room.branch_id)
      : resolvePosBranch(req, requestedBranchId);
  if (Number(authorized) !== Number(room.branch_id)) {
    const error = new Error('Bàn/phòng thuộc chi nhánh khác.');
    error.status = 403;
    throw error;
  }
  return Number(room.branch_id);
}


async function activeSession(userId, roomId) {
  return get(`SELECT * FROM fnb_sessions WHERE user_id = ? AND room_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`, [userId, roomId]);
}

async function sessionPayload(session) {
  const unitName = fnbUnitName(session.id);
  const items = await all(`
    SELECT i.*, COALESCE(pu.price, p.price, 0) AS snapshot_price, p.stock
    FROM fnb_session_items i
    JOIN products p ON p.id = i.product_id AND p.user_id = ?
    LEFT JOIN product_units pu
      ON pu.user_id = ? AND pu.product_id = i.product_id AND pu.name = ?
    WHERE i.session_id = ?
    ORDER BY i.id ASC
  `, [session.user_id, session.user_id, unitName, session.id]);
  return {
    ...session,
    unit_name: unitName,
    items: items.map((item) => ({ ...item, price: Number(item.snapshot_price) || 0, unit_name: unitName })),
    total_amount: items.reduce((sum, item) => sum + (Number(item.snapshot_price) || 0) * (Number(item.quantity) || 0), 0),
  };
}

router.get('/sessions/active', async (req, res) => {
  try {
    const branchId = resolvePosBranch(req, req.query.branch_id);
    const sessions = await all(`
      SELECT s.*, r.name AS room_name, r.type AS room_type, r.image AS room_image
      FROM fnb_sessions s
      JOIN rooms r ON r.id = s.room_id AND r.user_id = s.user_id
      WHERE s.user_id = ? AND s.status = 'open' AND r.branch_id = ?
      ORDER BY s.started_at ASC
    `, [req.tenantId, branchId]);
    const payload = [];
    for (const session of sessions) payload.push(await sessionPayload(session));
    res.json(payload);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/rooms/:roomId/session', async (req, res) => {
  const inputs = Array.isArray(req.body.items) ? req.body.items : null;
  if (!inputs) return res.status(400).json({ error: 'Danh sách món không hợp lệ.' });
  try {
    const room = await get('SELECT id, branch_id FROM rooms WHERE id = ? AND user_id = ?', [req.params.roomId, req.tenantId]);
    assertRoomBranch(req, room, req.body.branch_id);

    const hotel = await get(`SELECT id FROM room_bookings WHERE user_id = ? AND room_id = ? AND status = 'checked_in' LIMIT 1`, [req.tenantId, room.id]);
    const spa = await get(`SELECT id FROM room_service_sessions WHERE user_id = ? AND room_id = ? AND status = 'open' LIMIT 1`, [req.tenantId, room.id]);
    if (hotel || spa) return res.status(409).json({ error: 'Bàn/phòng đang được dùng bởi nghiệp vụ khác.' });

    const normalized = [];
    const seenProducts = new Set();
    for (const input of inputs) {
      const quantity = Number(input.quantity);
      const productId = Number(input.product_id);
      if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Số lượng món phải lớn hơn 0.' });
      if (!Number.isInteger(productId) || productId <= 0 || seenProducts.has(productId)) {
        return res.status(400).json({ error: 'Danh sách món có sản phẩm trùng hoặc không hợp lệ.' });
      }
      const product = await get('SELECT id, name, price FROM products WHERE id = ? AND user_id = ?', [productId, req.tenantId]);
      if (!product) return res.status(403).json({ error: 'Món không thuộc cửa hàng hiện tại.' });
      const currentPrice = Number(product.price);
      if (!Number.isFinite(currentPrice) || currentPrice < 0) return res.status(409).json({ error: `Giá món "${product.name}" không hợp lệ.` });
      seenProducts.add(productId);
      normalized.push({ product, quantity, note: String(input.note || '').trim(), currentPrice });
    }

    await run('BEGIN IMMEDIATE');
    try {
      let session = await activeSession(req.tenantId, room.id);
      if (!normalized.length) {
        if (session) {
          const unitName = fnbUnitName(session.id);
          await run('DELETE FROM fnb_session_items WHERE session_id = ?', [session.id]);
          await run('DELETE FROM product_units WHERE user_id = ? AND name = ?', [req.tenantId, unitName]);
          await run(`UPDATE fnb_sessions SET status = 'cancelled', closed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [session.id, req.tenantId]);
        }
        await run(`UPDATE rooms SET status = 'available' WHERE id = ? AND user_id = ?`, [room.id, req.tenantId]);
        await run('COMMIT');
        return res.json({ success: true, cancelled: true });
      }
      if (!session) {
        const created = await run(`INSERT INTO fnb_sessions (user_id, room_id, status) VALUES (?, ?, 'open')`, [req.tenantId, room.id]);
        session = { id: created.lastID, user_id: req.tenantId };
      }

      const unitName = fnbUnitName(session.id);
      const previousUnits = await all(
        'SELECT product_id, price FROM product_units WHERE user_id = ? AND name = ?',
        [req.tenantId, unitName],
      );
      const previousPrice = new Map(previousUnits.map((row) => [Number(row.product_id), Number(row.price)]));

      await run('DELETE FROM fnb_session_items WHERE session_id = ?', [session.id]);
      await run('DELETE FROM product_units WHERE user_id = ? AND name = ?', [req.tenantId, unitName]);
      for (const item of normalized) {
        const stored = previousPrice.get(Number(item.product.id));
        const snapshotPrice = Number.isFinite(stored) && stored >= 0 ? stored : item.currentPrice;
        await run(`INSERT INTO fnb_session_items (session_id, product_id, product_name, quantity, note) VALUES (?, ?, ?, ?, ?)`,
          [session.id, item.product.id, item.product.name, item.quantity, item.note || null]);
        await run(
          `INSERT INTO product_units (user_id, product_id, name, ratio, price, is_base)
           VALUES (?, ?, ?, 1, ?, 0)`,
          [req.tenantId, item.product.id, unitName, snapshotPrice],
        );
      }
      await run(`UPDATE rooms SET status = 'occupied' WHERE id = ? AND user_id = ?`, [room.id, req.tenantId]);
      await run('COMMIT');
      writeAudit(req, { action: 'fnb.session.save', target: String(session.id), detail: { room_id: room.id, items: normalized.length, price_snapshot: true } });
      res.json({ success: true, session_id: session.id, unit_name: unitName });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/rooms/:roomId/kitchen', async (req, res) => {
  try {
    const room = await get('SELECT id, branch_id FROM rooms WHERE id = ? AND user_id = ?', [req.params.roomId, req.tenantId]);
    assertRoomBranch(req, room, req.body.branch_id);
    const session = await activeSession(req.tenantId, req.params.roomId);
    if (!session) return res.status(409).json({ error: 'Bàn chưa có order đang mở.' });
    await run(`UPDATE fnb_sessions SET sent_to_kitchen = 1 WHERE id = ? AND user_id = ?`, [session.id, req.tenantId]);
    writeAudit(req, { action: 'fnb.kitchen.send', target: String(session.id), detail: { room_id: Number(req.params.roomId) } });
    res.json({ success: true, session_id: session.id });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/rooms/:roomId/transfer', async (req, res) => {
  const targetRoomId = Number(req.body.target_room_id);
  if (!Number.isInteger(targetRoomId) || targetRoomId <= 0 || targetRoomId === Number(req.params.roomId)) {
    return res.status(400).json({ error: 'Bàn đích không hợp lệ.' });
  }
  try {
    const [source, target] = await Promise.all([
      get('SELECT id, branch_id FROM rooms WHERE id = ? AND user_id = ?', [req.params.roomId, req.tenantId]),
      get('SELECT id, branch_id FROM rooms WHERE id = ? AND user_id = ?', [targetRoomId, req.tenantId]),
    ]);
    if (!source || !target) return res.status(404).json({ error: 'Không tìm thấy bàn nguồn hoặc bàn đích.' });
    assertRoomBranch(req, source, req.body.branch_id);
    assertRoomBranch(req, target, req.body.branch_id);
    if (Number(source.branch_id) !== Number(target.branch_id)) {
      return res.status(403).json({ error: 'Không thể chuyển bàn sang chi nhánh khác.' });
    }
    const session = await activeSession(req.tenantId, source.id);
    if (!session) return res.status(409).json({ error: 'Bàn nguồn chưa có order.' });
    if (await activeSession(req.tenantId, target.id)) return res.status(409).json({ error: 'Bàn đích đang có order.' });

    await run('BEGIN IMMEDIATE');
    try {
      await run(`UPDATE fnb_sessions SET room_id = ? WHERE id = ? AND user_id = ? AND status = 'open'`, [target.id, session.id, req.tenantId]);
      await run(`UPDATE rooms SET status = 'available' WHERE id = ? AND user_id = ?`, [source.id, req.tenantId]);
      await run(`UPDATE rooms SET status = 'occupied' WHERE id = ? AND user_id = ?`, [target.id, req.tenantId]);
      await run('COMMIT');
      writeAudit(req, { action: 'fnb.table.transfer', target: String(session.id), detail: { from_room_id: source.id, to_room_id: target.id } });
      res.json({ success: true, session_id: session.id, room_id: target.id });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/sessions/:id/complete', async (req, res) => {
  const orderCode = String(req.body.order_code || '').trim();
  if (!orderCode) return res.status(400).json({ error: 'Thiếu mã đơn POS.' });
  try {
    const session = await get(`SELECT * FROM fnb_sessions WHERE id = ? AND user_id = ?`, [req.params.id, req.tenantId]);
    if (!session) return res.status(404).json({ error: 'Không tìm thấy phiên F&B.' });
    const room = await get('SELECT id, branch_id FROM rooms WHERE id = ? AND user_id = ?', [session.room_id, req.tenantId]);
    assertRoomBranch(req, room, req.body.branch_id);
    if (session.status === 'closed') return res.json({ success: true, already_closed: true, pos_order_id: session.pos_order_id });
    if (session.status !== 'open') return res.status(409).json({ error: 'Phiên F&B không còn ở trạng thái thanh toán.' });

    const order = await get(`SELECT id, discount, promotion_id, branch_id FROM pos_orders WHERE user_id = ? AND order_code = ?`, [req.tenantId, orderCode]);
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn POS của cửa hàng hiện tại.' });
    if (Number(order.branch_id) !== Number(room.branch_id)) {
      return res.status(403).json({ error: 'Đơn POS không thuộc chi nhánh của bàn F&B.' });
    }
    if (Number(order.discount || 0) !== 0 || order.promotion_id) return res.status(409).json({ error: 'Đơn POS F&B không được có giảm giá ngoài snapshot phiên.' });

    const unitName = fnbUnitName(session.id);
    const sessionItems = await all(`
      SELECT i.product_id, i.quantity, pu.price
      FROM fnb_session_items i
      JOIN product_units pu
        ON pu.user_id = ? AND pu.product_id = i.product_id AND pu.name = ?
      WHERE i.session_id = ?
      ORDER BY i.product_id ASC
    `, [req.tenantId, unitName, session.id]);
    const orderItems = await all(`
      SELECT product_id, combo_id, quantity, price, discount, unit_name
      FROM pos_order_items WHERE order_id = ? ORDER BY product_id ASC
    `, [order.id]);
    if (sessionItems.length === 0 || orderItems.length !== sessionItems.length) {
      return res.status(409).json({ error: 'Đơn POS không khớp số món của phiên F&B.' });
    }
    for (let index = 0; index < sessionItems.length; index += 1) {
      const expected = sessionItems[index];
      const actual = orderItems[index];
      const matches = !actual.combo_id
        && Number(actual.product_id) === Number(expected.product_id)
        && Math.abs(Number(actual.quantity) - Number(expected.quantity)) < 1e-9
        && Math.abs(Number(actual.price) - Number(expected.price)) < 1e-9
        && Number(actual.discount || 0) === 0
        && String(actual.unit_name || '') === unitName;
      if (!matches) return res.status(409).json({ error: 'Đơn POS không khớp giá/số lượng snapshot của phiên F&B.' });
    }

    await run('BEGIN IMMEDIATE');
    try {
      const closed = await run(`UPDATE fnb_sessions SET status = 'closed', closed_at = CURRENT_TIMESTAMP, pos_order_id = ? WHERE id = ? AND user_id = ? AND status = 'open'`, [order.id, session.id, req.tenantId]);
      if (!closed.changes) throw Object.assign(new Error('Phiên F&B vừa thay đổi, vui lòng tải lại.'), { status: 409 });
      await run(`UPDATE rooms SET status = 'available' WHERE id = ? AND user_id = ?`, [session.room_id, req.tenantId]);
      await run('DELETE FROM product_units WHERE user_id = ? AND name = ?', [req.tenantId, unitName]);
      await run('COMMIT');
      writeAudit(req, { action: 'fnb.session.complete', target: String(session.id), detail: { order_code: orderCode, price_snapshot: true } });
      res.json({ success: true, pos_order_id: order.id });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
