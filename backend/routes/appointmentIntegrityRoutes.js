'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePermission('appointments'));

const httpError = (status, message) => Object.assign(new Error(message), { status });
const ACTIVE_STATUSES = ['pending', 'confirmed'];
const TRANSITIONS = {
  pending: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
};

function positiveId(value, label, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || String(value).trim() === '')) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, `${label} không hợp lệ`);
  return id;
}

function normalizeDateTime(value, label) {
  const text = String(value || '').trim();
  if (!text) throw httpError(400, `Cần ${label}`);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw httpError(400, `${label} không hợp lệ`);
  return { text, timestamp };
}

function validateReference(native, table, id, tenantId, label) {
  if (id === null) return null;
  const row = native.prepare(`SELECT id, name FROM ${table} WHERE id = ? AND user_id = ?`).get(id, tenantId);
  if (!row) throw httpError(403, `${label} không thuộc cửa hàng hiện tại`);
  return row;
}

function findOverlap(native, tenantId, column, id, startTime, endTime) {
  if (id === null) return null;
  return native.prepare(`
    SELECT id, customer_name, start_time, end_time
    FROM appointments
    WHERE user_id = ?
      AND ${column} = ?
      AND status IN ('pending', 'confirmed')
      AND datetime(start_time) < datetime(?)
      AND datetime(end_time) > datetime(?)
    ORDER BY start_time ASC
    LIMIT 1
  `).get(tenantId, id, endTime, startTime);
}

router.post('/', (req, res) => {
  let serviceId;
  let roomId;
  let staffId;
  let start;
  let end;
  const customerName = String(req.body.customer_name || '').trim();
  const customerPhone = String(req.body.customer_phone || '').trim() || null;
  const notes = String(req.body.notes || '').trim() || null;

  try {
    if (!customerName) throw httpError(400, 'Cần tên khách hàng');
    serviceId = positiveId(req.body.service_id, 'Dịch vụ');
    roomId = positiveId(req.body.room_id, 'Phòng/giường', { optional: true });
    staffId = positiveId(req.body.staff_id, 'Nhân viên/KTV', { optional: true });
    start = normalizeDateTime(req.body.start_time, 'thời gian bắt đầu');
    end = normalizeDateTime(req.body.end_time, 'thời gian kết thúc');
    if (end.timestamp <= start.timestamp) throw httpError(400, 'Thời gian kết thúc phải sau thời gian bắt đầu');
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');

    const createAppointment = native.transaction(() => {
      const service = validateReference(native, 'products', serviceId, req.tenantId, 'Dịch vụ');
      const room = validateReference(native, 'rooms', roomId, req.tenantId, 'Phòng/giường');
      const staff = validateReference(native, 'staff', staffId, req.tenantId, 'Nhân viên/KTV');

      const roomOverlap = findOverlap(native, req.tenantId, 'room_id', roomId, start.text, end.text);
      if (roomOverlap) {
        throw httpError(409, `Phòng/giường đã có lịch trùng giờ (lịch #${roomOverlap.id})`);
      }
      const staffOverlap = findOverlap(native, req.tenantId, 'staff_id', staffId, start.text, end.text);
      if (staffOverlap) {
        throw httpError(409, `Nhân viên/KTV đã có lịch trùng giờ (lịch #${staffOverlap.id})`);
      }

      const result = native.prepare(`
        INSERT INTO appointments
          (user_id, customer_name, customer_phone, service_id, service_name,
           room_id, staff_id, start_time, end_time, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        req.tenantId,
        customerName,
        customerPhone,
        service.id,
        service.name,
        room?.id || null,
        staff?.id || null,
        start.text,
        end.text,
        notes,
      );

      return {
        id: Number(result.lastInsertRowid),
        serviceName: service.name,
        roomId: room?.id || null,
        staffId: staff?.id || null,
      };
    });

    const result = createAppointment.immediate();
    writeAudit(req, {
      action: 'appointment.create',
      target: String(result.id),
      detail: {
        service_id: serviceId,
        service_name: result.serviceName,
        room_id: result.roomId,
        staff_id: result.staffId,
        start_time: start.text,
        end_time: end.text,
      },
    });
    return res.json({ id: result.id, message: 'Appointment created' });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.put('/:id/status', (req, res) => {
  let appointmentId;
  try {
    appointmentId = positiveId(req.params.id, 'Lịch hẹn');
  } catch (error) {
    return res.status(error.status).json({ error: error.message });
  }

  const nextStatus = String(req.body.status || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, nextStatus)) {
    return res.status(400).json({ error: 'Trạng thái lịch hẹn không hợp lệ' });
  }

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');

    const updateStatus = native.transaction(() => {
      const current = native.prepare(
        'SELECT id, status FROM appointments WHERE id = ? AND user_id = ?'
      ).get(appointmentId, req.tenantId);
      if (!current) throw httpError(404, 'Không tìm thấy lịch hẹn');
      if (current.status === nextStatus) return { previous: current.status, changed: false };

      const allowed = TRANSITIONS[current.status];
      if (!allowed || !allowed.has(nextStatus)) {
        throw httpError(409, `Không thể chuyển lịch từ ${current.status} sang ${nextStatus}`);
      }

      const result = native.prepare(
        'UPDATE appointments SET status = ? WHERE id = ? AND user_id = ? AND status = ?'
      ).run(nextStatus, appointmentId, req.tenantId, current.status);
      if (Number(result.changes) !== 1) throw httpError(409, 'Lịch hẹn đã thay đổi bởi yêu cầu khác');
      return { previous: current.status, changed: true };
    });

    const result = updateStatus.immediate();
    if (result.changed) {
      writeAudit(req, {
        action: 'appointment.status',
        target: String(appointmentId),
        detail: { from: result.previous, to: nextStatus },
      });
    }
    return res.json({ message: 'Status updated', status: nextStatus });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  let appointmentId;
  try {
    appointmentId = positiveId(req.params.id, 'Lịch hẹn');
  } catch (error) {
    return res.status(error.status).json({ error: error.message });
  }

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');

    const deleteAppointment = native.transaction(() => {
      const current = native.prepare(
        'SELECT id, status, customer_name, start_time FROM appointments WHERE id = ? AND user_id = ?'
      ).get(appointmentId, req.tenantId);
      if (!current) throw httpError(404, 'Không tìm thấy lịch hẹn');
      if (current.status !== 'pending') {
        throw httpError(409, 'Lịch đã được xác nhận/xử lý; hãy hủy trạng thái thay vì xóa lịch sử');
      }
      const result = native.prepare(
        "DELETE FROM appointments WHERE id = ? AND user_id = ? AND status = 'pending'"
      ).run(appointmentId, req.tenantId);
      if (Number(result.changes) !== 1) throw httpError(409, 'Lịch hẹn đã thay đổi bởi yêu cầu khác');
      return current;
    });

    const removed = deleteAppointment.immediate();
    writeAudit(req, {
      action: 'appointment.delete',
      target: String(appointmentId),
      detail: { pending_only: true, customer_name: removed.customer_name, start_time: removed.start_time },
    });
    return res.json({ message: 'Deleted', id: appointmentId });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
