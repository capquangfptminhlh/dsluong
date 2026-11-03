const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');
const { ensureHospitalitySchema } = require('../hospitalitySchema');
const { requireAuth, requireAnyPermission, writeAudit } = require('../middleware/auth');
const { formatBusinessDate } = require('../utils/businessDate');

router.use(requireAuth);
router.use(requireAnyPermission('rooms', 'pos', 'appointments'));

let hospitalityReady = null;
router.use(async (req, res, next) => {
  try {
    if (!hospitalityReady) hospitalityReady = ensureHospitalitySchema(db);
    await hospitalityReady;
    next();
  } catch (error) {
    hospitalityReady = null;
    res.status(500).json({ error: 'Không khởi tạo được dữ liệu phòng/booking.' });
  }
});

const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); }));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));

// Every /:id mutation belongs to one room and is verified server-side, including
// hotel/spa checkouts. An owner may administer every branch, but staff cannot.
router.param('id', async (req, res, next, id) => {
  try {
    const room = await get('SELECT id, branch_id FROM rooms WHERE id = ? AND user_id = ?', [id, req.tenantId]);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy bàn/phòng.' });
    if (req.user.actorType === 'staff' && Number(room.branch_id) !== resolvePosBranch(req, null)) {
      return res.status(403).json({ error: 'Bàn/phòng không thuộc chi nhánh của nhân viên.' });
    }
    req.roomBranchId = Number(room.branch_id);
    next();
  } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

function normalizeRoom(body = {}) {
  return {
    name: String(body.name || '').trim(),
    type: String(body.type || 'Phòng').trim() || 'Phòng',
    capacity: Math.max(1, Number.parseInt(body.capacity, 10) || 1),
    price: Math.max(0, Number(body.price) || 0),
    image: body.image ? String(body.image) : null,
  };
}

router.get('/', async (req, res) => {
  try {
    const branchId = req.query.branch_id || req.user.actorType === 'staff'
      ? resolvePosBranch(req, req.query.branch_id)
      : null;
    const rows = await all(
      `SELECT * FROM rooms WHERE user_id = ? ${branchId === null ? '' : 'AND branch_id = ?'} ORDER BY name ASC`,
      branchId === null ? [req.tenantId] : [req.tenantId, branchId],
    );
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const room = normalizeRoom(req.body);
  if (!room.name) return res.status(400).json({ error: 'Cần tên phòng/giường.' });
  try {
    const branchId = resolvePosBranch(req, req.body.branch_id);
    const result = await run(
      `INSERT INTO rooms (user_id, name, type, capacity, price, image, branch_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'available')`,
      [req.tenantId, room.name, room.type, room.capacity, room.price, room.image, branchId],
    );
    writeAudit(req, { action: 'room.create', target: String(result.lastID), details: { name: room.name } });
    res.status(201).json({ id: result.lastID, ...room, branch_id: branchId, status: 'available' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const room = normalizeRoom(req.body);
  if (!room.name) return res.status(400).json({ error: 'Cần tên phòng/giường.' });
  try {
    const result = await run(
      `UPDATE rooms SET name = ?, type = ?, capacity = ?, price = ?, image = ?
       WHERE id = ? AND user_id = ?`,
      [room.name, room.type, room.capacity, room.price, room.image, req.params.id, req.tenantId],
    );
    if (!result.changes) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
    writeAudit(req, { action: 'room.update', target: String(req.params.id), details: { name: room.name } });
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/bookings/active', async (req, res) => {
  try {
    const branchId = req.user.actorType === 'staff' ? resolvePosBranch(req, null) : null;
    const rows = await all(
      `SELECT rb.*, r.name AS room_name, r.type AS room_type, r.image AS room_image
       FROM room_bookings rb
       JOIN rooms r ON r.id = rb.room_id AND r.user_id = rb.user_id
       WHERE rb.user_id = ? AND rb.status = 'checked_in'
       ${branchId === null ? '' : 'AND r.branch_id = ?'}
       ORDER BY rb.check_in ASC`,
      branchId === null ? [req.tenantId] : [req.tenantId, branchId],
    );
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/check-in', async (req, res) => {
  const guestName = String(req.body.guest_name || '').trim();
  const guestPhone = String(req.body.guest_phone || '').trim();
  const nights = Number.parseInt(req.body.nights, 10);
  const requestedRate = req.body.rate === undefined ? null : Number(req.body.rate);
  if (!guestName) return res.status(400).json({ error: 'Cần tên khách lưu trú.' });
  if (!Number.isInteger(nights) || nights <= 0 || nights > 365) return res.status(400).json({ error: 'Số đêm phải từ 1 đến 365.' });
  if (requestedRate !== null && (!Number.isFinite(requestedRate) || requestedRate < 0)) return res.status(400).json({ error: 'Giá phòng không hợp lệ.' });

  try {
    const room = await get('SELECT * FROM rooms WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
    const active = await get(
      `SELECT id FROM room_bookings WHERE user_id = ? AND room_id = ? AND status = 'checked_in' LIMIT 1`,
      [req.tenantId, room.id],
    );
    if (active) return res.status(409).json({ error: 'Phòng đang có khách lưu trú.' });
    const rate = requestedRate === null ? Math.max(0, Number(room.price) || 0) : requestedRate;
    const result = await run(
      `INSERT INTO room_bookings (user_id, room_id, guest_name, guest_phone, nights, rate, status)
       VALUES (?, ?, ?, ?, ?, ?, 'checked_in')`,
      [req.tenantId, room.id, guestName, guestPhone || null, nights, rate],
    );
    await run(`UPDATE rooms SET status = 'occupied' WHERE id = ? AND user_id = ?`, [room.id, req.tenantId]);
    writeAudit(req, { action: 'hotel.checkin', target: String(result.lastID), details: { room_id: room.id, nights, rate } });
    res.status(201).json({ id: result.lastID, room_id: room.id, guest_name: guestName, guest_phone: guestPhone, nights, rate, status: 'checked_in' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/:id/check-out', async (req, res) => {
  const paymentMethod = ['cash', 'bank'].includes(req.body.payment_method) ? req.body.payment_method : 'cash';
  try {
    const room = await get('SELECT * FROM rooms WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
    const booking = await get(
      `SELECT * FROM room_bookings WHERE user_id = ? AND room_id = ? AND status = 'checked_in' ORDER BY id DESC LIMIT 1`,
      [req.tenantId, room.id],
    );
    if (!booking) return res.status(409).json({ error: 'Phòng không có booking đang mở.' });

    const total = Math.max(0, Number(booking.rate) || 0) * Math.max(1, Number(booking.nights) || 1);
    const paidCash = paymentMethod === 'cash' ? total : 0;
    const paidBank = paymentMethod === 'bank' ? total : 0;
    const orderCode = `KS${Date.now().toString(36).toUpperCase()}`;
    const date = formatBusinessDate();

    await run('BEGIN IMMEDIATE');
    try {
      const order = await run(
        `INSERT INTO pos_orders
          (user_id, order_code, subtotal, discount, vat_rate, vat_amount, total_amount,
           paid_cash, paid_bank, debt_amount, customer_name, customer_phone, payment_method, branch_id, status)
         VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, 0, ?, ?, ?, ?, 'paid')`,
        [req.tenantId, orderCode, total, total, paidCash, paidBank, booking.guest_name, booking.guest_phone || null, paymentMethod, room.branch_id],
      );
      await run(
        `INSERT INTO pos_order_items (order_id, product_id, product_name, quantity, price, discount, unit_name, unit_ratio)
         VALUES (?, NULL, ?, ?, ?, 0, 'Đêm', 1)`,
        [order.lastID, `Tiền phòng ${room.name}`, booking.nights, booking.rate],
      );
      await run(
        `INSERT INTO transactions (date, voucherNumber, description, amount, category, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [date, orderCode, `Doanh thu phòng ${room.name}`, total, 'Dịch vụ, xây dựng không bao thầu NVL', req.tenantId],
      );
      await run(
        `UPDATE room_bookings SET status = 'checked_out', pos_order_id = ?, checked_out_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ? AND status = 'checked_in'`,
        [order.lastID, booking.id, req.tenantId],
      );
      await run(`UPDATE rooms SET status = 'available' WHERE id = ? AND user_id = ?`, [room.id, req.tenantId]);
      await run('COMMIT');
      writeAudit(req, { action: 'hotel.checkout', target: String(booking.id), details: { order_code: orderCode, total, payment_method: paymentMethod } });
      res.json({ success: true, order_id: order.lastID, order_code: orderCode, total_amount: total, booking_id: booking.id });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});


router.get('/spa-sessions/active', async (req, res) => {
  try {
    const branchId = req.user.actorType === 'staff' ? resolvePosBranch(req, null) : null;
    const sessions = await all(`SELECT s.*, r.name AS room_name FROM room_service_sessions s JOIN rooms r ON r.id = s.room_id AND r.user_id = s.user_id WHERE s.user_id = ? AND s.status = 'open' ${branchId === null ? '' : 'AND r.branch_id = ?'} ORDER BY s.started_at ASC`, branchId === null ? [req.tenantId] : [req.tenantId, branchId]);
    for (const session of sessions) {
      session.items = await all('SELECT * FROM room_service_session_items WHERE session_id = ? ORDER BY id ASC', [session.id]);
      session.total_amount = session.items.reduce((sum, item) => sum + Number(item.price || 0), 0);
    }
    res.json(sessions);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.put('/:id/spa-session', async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: 'Danh sách dịch vụ không hợp lệ.' });
  try {
    const room = await get('SELECT * FROM rooms WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng/giường.' });
    const booking = await get(`SELECT id FROM room_bookings WHERE user_id = ? AND room_id = ? AND status = 'checked_in' LIMIT 1`, [req.tenantId, room.id]);
    if (booking) return res.status(409).json({ error: 'Phòng đang dùng cho khách lưu trú.' });

    const normalized = [];
    for (const input of items) {
      const service = await get('SELECT id, name, price FROM products WHERE id = ? AND user_id = ?', [Number(input.service_id), req.tenantId]);
      if (!service) return res.status(403).json({ error: 'Dịch vụ không thuộc cửa hàng hiện tại.' });
      let staff = null;
      if (input.staff_id) {
        staff = await get('SELECT id, name FROM staff WHERE id = ? AND user_id = ?', [Number(input.staff_id), req.tenantId]);
        if (!staff) return res.status(403).json({ error: 'Kỹ thuật viên không thuộc cửa hàng hiện tại.' });
      }
      normalized.push({ service, staff });
    }

    await run('BEGIN IMMEDIATE');
    try {
      let session = await get(`SELECT * FROM room_service_sessions WHERE user_id = ? AND room_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`, [req.tenantId, room.id]);
      if (!items.length) {
        if (session) {
          await run('DELETE FROM room_service_session_items WHERE session_id = ?', [session.id]);
          await run(`UPDATE room_service_sessions SET status='cancelled', closed_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [session.id, req.tenantId]);
        }
        await run(`UPDATE rooms SET status='available' WHERE id = ? AND user_id = ?`, [room.id, req.tenantId]);
        await run('COMMIT');
        return res.json({ success: true, cancelled: true });
      }
      if (!session) {
        const created = await run(`INSERT INTO room_service_sessions (user_id, room_id, status) VALUES (?, ?, 'open')`, [req.tenantId, room.id]);
        session = { id: created.lastID };
      }
      await run('DELETE FROM room_service_session_items WHERE session_id = ?', [session.id]);
      for (const item of normalized) {
        await run(`INSERT INTO room_service_session_items (session_id, service_id, service_name, price, staff_id, staff_name) VALUES (?, ?, ?, ?, ?, ?)`, [session.id, item.service.id, item.service.name, Number(item.service.price) || 0, item.staff?.id || null, item.staff?.name || null]);
      }
      await run(`UPDATE rooms SET status='occupied' WHERE id = ? AND user_id = ?`, [room.id, req.tenantId]);
      await run('COMMIT');
      writeAudit(req, { action: 'spa.session.save', target: String(session.id), details: { room_id: room.id, items: normalized.length } });
      res.json({ success: true, session_id: session.id });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/:id/spa-checkout', async (req, res) => {
  const paymentMethod = ['cash', 'bank'].includes(req.body.payment_method) ? req.body.payment_method : 'cash';
  try {
    const room = await get('SELECT * FROM rooms WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng/giường.' });
    const session = await get(`SELECT * FROM room_service_sessions WHERE user_id = ? AND room_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`, [req.tenantId, room.id]);
    if (!session) return res.status(409).json({ error: 'Giường chưa có phiên phục vụ đang mở.' });
    const items = await all('SELECT * FROM room_service_session_items WHERE session_id = ? ORDER BY id ASC', [session.id]);
    if (!items.length) return res.status(409).json({ error: 'Phiên phục vụ chưa có dịch vụ.' });
    const total = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
    const orderCode = `SPA${Date.now().toString(36).toUpperCase()}`;
    const paidCash = paymentMethod === 'cash' ? total : 0;
    const paidBank = paymentMethod === 'bank' ? total : 0;
    const date = formatBusinessDate();

    await run('BEGIN IMMEDIATE');
    try {
      const order = await run(`INSERT INTO pos_orders (user_id, order_code, subtotal, discount, vat_rate, vat_amount, total_amount, paid_cash, paid_bank, debt_amount, customer_name, payment_method, branch_id, status) VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, 0, 'Khách Spa', ?, ?, 'paid')`, [req.tenantId, orderCode, total, total, paidCash, paidBank, paymentMethod, room.branch_id]);
      for (const item of items) {
        const label = item.staff_name ? `${item.service_name} (KTV: ${item.staff_name})` : item.service_name;
        await run(`INSERT INTO pos_order_items (order_id, product_id, product_name, quantity, price, discount, unit_name, unit_ratio) VALUES (?, NULL, ?, 1, ?, 0, 'Lần', 1)`, [order.lastID, label, item.price]);
      }
      await run(`INSERT INTO transactions (date, voucherNumber, description, amount, category, user_id) VALUES (?, ?, ?, ?, ?, ?)`, [date, orderCode, `Doanh thu Spa - ${room.name}`, total, 'Dịch vụ, xây dựng không bao thầu NVL', req.tenantId]);
      await run(`UPDATE room_service_sessions SET status='closed', closed_at=CURRENT_TIMESTAMP, pos_order_id=? WHERE id=? AND user_id=? AND status='open'`, [order.lastID, session.id, req.tenantId]);
      await run(`UPDATE rooms SET status='available' WHERE id=? AND user_id=?`, [room.id, req.tenantId]);
      await run('COMMIT');
      writeAudit(req, { action: 'spa.checkout', target: String(session.id), details: { order_code: orderCode, total, payment_method: paymentMethod } });
      res.json({ success: true, order_id: order.lastID, order_code: orderCode, total_amount: total });
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const active = await get(
      `SELECT id FROM room_bookings WHERE user_id = ? AND room_id = ? AND status = 'checked_in' LIMIT 1`,
      [req.tenantId, req.params.id],
    );
    if (active) return res.status(409).json({ error: 'Không thể xóa phòng đang có khách.' });
    const spaActive = await get(`SELECT id FROM room_service_sessions WHERE user_id = ? AND room_id = ? AND status = 'open' LIMIT 1`, [req.tenantId, req.params.id]);
    if (spaActive) return res.status(409).json({ error: 'Không thể xóa giường/phòng đang có phiên Spa.' });
    const fnbActive = await get(`SELECT id FROM fnb_sessions WHERE user_id = ? AND room_id = ? AND status = 'open' LIMIT 1`, [req.tenantId, req.params.id]);
    if (fnbActive) return res.status(409).json({ error: 'Không thể xóa bàn/phòng đang có order F&B.' });
    const result = await run('DELETE FROM rooms WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId]);
    if (!result.changes) return res.status(404).json({ error: 'Không tìm thấy phòng.' });
    writeAudit(req, { action: 'room.delete', target: String(req.params.id) });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
