'use strict';

const express = require('express');
const db = require('../db');
const { ensureHospitalitySchema } = require('../hospitalitySchema');
const { requireAuth, requireAnyPermission, writeAudit } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireAnyPermission('rooms', 'pos', 'appointments'));

let hospitalityReady = null;
router.use(async (req, res, next) => {
  try {
    if (!hospitalityReady) hospitalityReady = ensureHospitalitySchema(db);
    await hospitalityReady;
    return next();
  } catch (error) {
    hospitalityReady = null;
    return res.status(500).json({ error: 'Không khởi tạo được dữ liệu phòng/booking.' });
  }
});

const httpError = (status, message) => Object.assign(new Error(message), { status });

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, `${label} không hợp lệ`);
  return id;
}

router.post('/:id/check-in', (req, res) => {
  let roomId;
  let nights;
  const guestName = String(req.body?.guest_name || '').trim();
  const guestPhone = String(req.body?.guest_phone || '').trim() || null;

  try {
    roomId = positiveId(req.params.id, 'Phòng');
    nights = Number.parseInt(req.body?.nights, 10);

    if (!guestName) throw httpError(400, 'Cần tên khách lưu trú.');
    if (!Number.isInteger(nights) || nights <= 0 || nights > 365) {
      throw httpError(400, 'Số đêm phải từ 1 đến 365.');
    }
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  try {
    const checkIn = native.transaction(() => {
      const room = native.prepare(
        'SELECT id, name, price, status FROM rooms WHERE id = ? AND user_id = ?'
      ).get(roomId, req.tenantId);
      if (!room) throw httpError(404, 'Không tìm thấy phòng.');

      const active = native.prepare(
        `SELECT id FROM room_bookings
         WHERE user_id = ? AND room_id = ? AND status = 'checked_in'
         ORDER BY id DESC LIMIT 1`
      ).get(req.tenantId, room.id);
      if (active) throw httpError(409, 'Phòng đang có khách lưu trú.');

      const roomPrice = Number(room.price || 0);
      if (!Number.isFinite(roomPrice) || roomPrice < 0) {
        throw httpError(409, 'Giá phòng hiện tại không hợp lệ; cần cập nhật trước khi check-in.');
      }

      // Revenue integrity: the configured room price is authoritative. Never accept a
      // client-supplied rate at check-in because the browser payload can be tampered with.
      // Persist a snapshot so future room-price changes do not rewrite an active stay.
      const rate = roomPrice;

      const booking = native.prepare(
        `INSERT INTO room_bookings
          (user_id, room_id, guest_name, guest_phone, nights, rate, status)
         VALUES (?, ?, ?, ?, ?, ?, 'checked_in')`
      ).run(req.tenantId, room.id, guestName, guestPhone, nights, rate);

      const updated = native.prepare(
        `UPDATE rooms SET status = 'occupied'
         WHERE id = ? AND user_id = ?`
      ).run(room.id, req.tenantId);
      if (Number(updated.changes) !== 1) {
        throw httpError(409, 'Trạng thái phòng đã thay đổi bởi yêu cầu khác.');
      }

      return {
        id: Number(booking.lastInsertRowid),
        roomId: Number(room.id),
        roomName: room.name,
        rate,
      };
    });

    // Acquire the writer lock before the active-booking read. Concurrent check-ins therefore
    // serialize, and booking creation plus the occupied-room flag commit or roll back together.
    const booking = checkIn.immediate();
    writeAudit(req, {
      action: 'hotel.checkin',
      target: String(booking.id),
      detail: {
        room_id: booking.roomId,
        room_name: booking.roomName,
        nights,
        rate: booking.rate,
      },
    });

    return res.status(201).json({
      id: booking.id,
      room_id: booking.roomId,
      guest_name: guestName,
      guest_phone: guestPhone || '',
      nights,
      rate: booking.rate,
      status: 'checked_in',
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi check-in phòng.' });
  }
});

router.put('/:id/spa-session', (req, res) => {
  const inputs = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!inputs) return res.status(400).json({ error: 'Danh sách dịch vụ không hợp lệ.' });

  let roomId;
  try {
    roomId = positiveId(req.params.id, 'Phòng/giường');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  try {
    const saveSession = native.transaction(() => {
      const room = native.prepare(
        'SELECT id, name FROM rooms WHERE id = ? AND user_id = ?'
      ).get(roomId, req.tenantId);
      if (!room) throw httpError(404, 'Không tìm thấy phòng/giường.');

      const booking = native.prepare(
        `SELECT id FROM room_bookings
         WHERE user_id = ? AND room_id = ? AND status = 'checked_in'
         LIMIT 1`
      ).get(req.tenantId, room.id);
      if (booking) throw httpError(409, 'Phòng đang dùng cho khách lưu trú.');

      let session = native.prepare(
        `SELECT * FROM room_service_sessions
         WHERE user_id = ? AND room_id = ? AND status = 'open'
         ORDER BY id DESC LIMIT 1`
      ).get(req.tenantId, room.id);

      if (inputs.length === 0) {
        if (session) {
          native.prepare('DELETE FROM room_service_session_items WHERE session_id = ?').run(session.id);
          native.prepare(
            `UPDATE room_service_sessions
             SET status = 'cancelled', closed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND user_id = ? AND status = 'open'`
          ).run(session.id, req.tenantId);
        }
        native.prepare(
          `UPDATE rooms SET status = 'available' WHERE id = ? AND user_id = ?`
        ).run(room.id, req.tenantId);
        return { cancelled: true, sessionId: session ? Number(session.id) : null, roomName: room.name };
      }

      const oldItems = session
        ? native.prepare(
            `SELECT id, service_id, price
             FROM room_service_session_items
             WHERE session_id = ?
             ORDER BY id ASC`
          ).all(session.id)
        : [];

      const priorPriceQueues = new Map();
      for (const oldItem of oldItems) {
        const key = Number(oldItem.service_id);
        if (!priorPriceQueues.has(key)) priorPriceQueues.set(key, []);
        priorPriceQueues.get(key).push(Number(oldItem.price));
      }

      const normalized = inputs.map((input) => {
        const serviceId = positiveId(input?.service_id, 'Dịch vụ');
        const service = native.prepare(
          'SELECT id, name, price FROM products WHERE id = ? AND user_id = ?'
        ).get(serviceId, req.tenantId);
        if (!service) throw httpError(403, 'Dịch vụ không thuộc cửa hàng hiện tại.');

        let staff = null;
        if (input?.staff_id !== undefined && input?.staff_id !== null && String(input.staff_id).trim() !== '') {
          const staffId = positiveId(input.staff_id, 'Kỹ thuật viên');
          staff = native.prepare(
            'SELECT id, name FROM staff WHERE id = ? AND user_id = ?'
          ).get(staffId, req.tenantId);
          if (!staff) throw httpError(403, 'Kỹ thuật viên không thuộc cửa hàng hiện tại.');
        }

        const queue = priorPriceQueues.get(serviceId);
        const priorPrice = queue && queue.length ? queue.shift() : null;
        const currentPrice = Number(service.price);
        const snapshotPrice = priorPrice === null ? currentPrice : Number(priorPrice);
        if (!Number.isFinite(snapshotPrice) || snapshotPrice < 0) {
          throw httpError(409, 'Giá dịch vụ không hợp lệ; cần cập nhật trước khi lưu phiên Spa.');
        }

        return { service, staff, price: snapshotPrice, preserved: priorPrice !== null };
      });

      if (!session) {
        const created = native.prepare(
          `INSERT INTO room_service_sessions (user_id, room_id, status)
           VALUES (?, ?, 'open')`
        ).run(req.tenantId, room.id);
        session = { id: Number(created.lastInsertRowid) };
      }

      native.prepare('DELETE FROM room_service_session_items WHERE session_id = ?').run(session.id);
      const insertItem = native.prepare(
        `INSERT INTO room_service_session_items
          (session_id, service_id, service_name, price, staff_id, staff_name)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const item of normalized) {
        insertItem.run(
          session.id,
          item.service.id,
          item.service.name,
          item.price,
          item.staff?.id || null,
          item.staff?.name || null,
        );
      }

      const roomUpdate = native.prepare(
        `UPDATE rooms SET status = 'occupied' WHERE id = ? AND user_id = ?`
      ).run(room.id, req.tenantId);
      if (Number(roomUpdate.changes) !== 1) {
        throw httpError(409, 'Trạng thái phòng/giường đã thay đổi bởi yêu cầu khác.');
      }

      return {
        cancelled: false,
        sessionId: Number(session.id),
        roomName: room.name,
        itemCount: normalized.length,
        preservedCount: normalized.filter((item) => item.preserved).length,
      };
    });

    const result = saveSession.immediate();
    if (result.cancelled) {
      writeAudit(req, {
        action: 'spa.session.cancel',
        target: result.sessionId ? String(result.sessionId) : String(roomId),
        detail: { room_id: roomId, room_name: result.roomName },
      });
      return res.json({ success: true, cancelled: true });
    }

    writeAudit(req, {
      action: 'spa.session.save',
      target: String(result.sessionId),
      detail: {
        room_id: roomId,
        room_name: result.roomName,
        items: result.itemCount,
        preserved_price_items: result.preservedCount,
      },
    });
    return res.json({ success: true, session_id: result.sessionId });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Không thể lưu phiên Spa.' });
  }
});

module.exports = router;
