'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');
const { resolvePosBranch } = require('../utils/branchAccess');

router.use(requireAuth);
router.use(requirePermission('staff'));

const error = (status, message) => Object.assign(new Error(message), { status });
const replyError = (res, e) => res.status(e.status || 500).json({ error: e.message });

function activeBranchCount(tenantId) {
  return Number(db._native.prepare(
    "SELECT COUNT(*) AS n FROM branches WHERE user_id=? AND COALESCE(status,'active')='active'",
  ).get(tenantId).n);
}

function authorizedStaff(req, staffId, requestedBranchId) {
  if (!Number.isInteger(staffId) || staffId <= 0) throw error(400, 'Nhân viên không hợp lệ');
  const person = db._native.prepare(
    'SELECT id, branch_id, name, status FROM staff WHERE id=? AND user_id=?',
  ).get(staffId, req.tenantId);
  if (!person) throw error(404, 'Không tìm thấy nhân viên');
  if (person.status !== 'active') throw error(409, 'Tài khoản nhân viên không hoạt động');
  if (person.branch_id == null && activeBranchCount(req.tenantId) !== 1) {
    throw error(409, 'Nhân viên chưa được phân công chi nhánh');
  }
  const assigned = resolvePosBranch(req, person.branch_id);
  if (requestedBranchId !== undefined && requestedBranchId !== null && requestedBranchId !== ''
    && Number(requestedBranchId) !== assigned) throw error(403, 'Chi nhánh chấm công không khớp phân công');
  return { ...person, branch_id: assigned };
}

// Staff managers see attendance only at the current assigned branch. Owners
// retain access to historical rows, including old shifts lacking branch_id.
router.get('/', (req, res) => {
  try {
    const scoped = req.user.actorType === 'staff';
    const branchId = scoped ? resolvePosBranch(req, req.query.branch_id) : null;
    const single = scoped && activeBranchCount(req.tenantId) === 1;
    const sql = `SELECT s.*, st.name AS staff_name
      FROM shifts s JOIN staff st ON st.id=s.staff_id AND st.user_id=?
      WHERE 1=1 ${scoped ? (single ? 'AND (s.branch_id=? OR s.branch_id IS NULL)' : 'AND s.branch_id=?') : ''}
      ORDER BY s.check_in DESC, s.id DESC LIMIT 200`;
    res.json(db._native.prepare(sql).all(...(scoped ? [req.tenantId, branchId] : [req.tenantId])));
  } catch (e) { replyError(res, e); }
});

router.post('/checkin', (req, res) => {
  try {
    const person = authorizedStaff(req, Number(req.body.staff_id), req.body.branch_id);
    // INSERT .. SELECT + NOT EXISTS has a unique writer boundary in SQLite.
    const result = db._native.prepare(`
      INSERT INTO shifts(staff_id, branch_id, status)
      SELECT ?, ?, 'ACTIVE'
      WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE staff_id=? AND status='ACTIVE')
    `).run(person.id, person.branch_id, person.id);
    if (!result.changes) throw error(409, 'Nhân viên đang có ca làm việc ACTIVE');
    writeAudit(req, { action: 'hrm.checkin', target: String(result.lastInsertRowid),
      detail: { staff_id: person.id, branch_id: person.branch_id } });
    return res.json({ success: true, shift_id: Number(result.lastInsertRowid), branch_id: person.branch_id });
  } catch (e) { return replyError(res, e); }
});

router.post('/checkout', (req, res) => {
  try {
    const shiftId = Number(req.body.shift_id);
    if (!Number.isInteger(shiftId) || shiftId <= 0) throw error(400, 'Ca làm việc không hợp lệ');
    const shift = db._native.prepare(`
      SELECT s.id, s.status, s.branch_id, st.branch_id AS current_branch
      FROM shifts s JOIN staff st ON st.id=s.staff_id AND st.user_id=?
      WHERE s.id=?
    `).get(req.tenantId, shiftId);
    if (!shift) throw error(404, 'Không tìm thấy ca làm việc');
    if (req.user.actorType === 'staff') {
      const current = resolvePosBranch(req, null);
      const historicalBranch = shift.branch_id ?? (activeBranchCount(req.tenantId) === 1 ? current : null);
      if (historicalBranch == null || Number(historicalBranch) !== current) {
        throw error(403, 'Không được chấm công hộ chi nhánh khác');
      }
    }
    if (shift.status !== 'ACTIVE') throw error(409, 'Ca làm việc đã kết thúc');
    const result = db._native.prepare(`
      UPDATE shifts SET check_out=CURRENT_TIMESTAMP, status='CLOSED'
      WHERE id=? AND status='ACTIVE'
    `).run(shiftId);
    if (!result.changes) throw error(409, 'Ca làm việc đã kết thúc');
    writeAudit(req, { action: 'hrm.checkout', target: String(shiftId),
      detail: { branch_id: shift.branch_id } });
    return res.json({ success: true, shift_id: shiftId, branch_id: shift.branch_id });
  } catch (e) { return replyError(res, e); }
});

module.exports = router;
