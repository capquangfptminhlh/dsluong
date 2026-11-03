'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth, writeAudit } = require('../middleware/auth');
const { resolvePosBranch } = require('../utils/branchAccess');
const router = express.Router();
router.use(requireAuth);
const requireStaffIdentity = (req, res, next) => {
  if (req.user.actorType !== 'staff') {
    return res.status(403).json({ error: 'Chấm công cá nhân dành cho tài khoản nhân viên.' });
  }
  next();
};
const reply = (res, error) => res.status(error.status || 500).json({ error: error.message });

router.get('/me', requireStaffIdentity, (req, res) => {
  try {
    const rows = db._native.prepare(`
      SELECT id, staff_id, branch_id, check_in, check_out, status
      FROM shifts WHERE staff_id=? AND
        EXISTS (SELECT 1 FROM staff WHERE id=? AND user_id=?)
      ORDER BY id DESC LIMIT 90
    `).all(req.user.actorId, req.user.actorId, req.tenantId);
    // Hours/wage data are owner-only. Employees see their own attendance.
    return res.json({ active: rows.find(row => row.status === 'ACTIVE') || null, history: rows });
  } catch (e) { return reply(res, e); }
});

router.post('/me/checkin', requireStaffIdentity, (req, res) => {
  try {
    const branchId = resolvePosBranch(req, null);
    const staffId = Number(req.user.actorId);
    const result = db._native.prepare(`
      INSERT INTO shifts (staff_id, branch_id, status)
      SELECT ?, ?, 'ACTIVE'
      WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE staff_id=? AND status='ACTIVE')
    `).run(staffId, branchId, staffId);
    if (!result.changes) {
      return res.status(409).json({ error: 'Đã có ca làm việc đang mở. Hãy chấm ra trước.' });
    }
    writeAudit(req, { action: 'hrm.self.checkin', target: String(result.lastInsertRowid),
      detail: { staff_id: staffId, branch_id: branchId } });
    return res.json({ success: true, shift_id: Number(result.lastInsertRowid), branch_id: branchId });
  } catch (e) { return reply(res, e); }
});

router.post('/me/checkout', requireStaffIdentity, (req, res) => {
  try {
    const staffId = Number(req.user.actorId);
    // A moved worker is allowed to close their own older shift, but this never
    // reassigns that shift to the new branch.
    const transaction = db._native.transaction(() => {
      const current = db._native.prepare(
        "SELECT id, branch_id FROM shifts WHERE staff_id=? AND status='ACTIVE' ORDER BY id DESC LIMIT 1",
      ).get(staffId);
      if (!current) return null;
      const updated = db._native.prepare(`
        UPDATE shifts SET check_out=CURRENT_TIMESTAMP, status='CLOSED'
        WHERE id=? AND staff_id=? AND status='ACTIVE'
      `).run(current.id, staffId);
      return updated.changes ? current : null;
    });
    const closed = transaction.immediate();
    if (!closed) return res.status(409).json({ error: 'Không có ca chấm công đang mở.' });
    writeAudit(req, { action: 'hrm.self.checkout', target: String(closed.id),
      detail: { staff_id: staffId, branch_id: closed.branch_id } });
    return res.json({ success: true, shift_id: closed.id, branch_id: closed.branch_id });
  } catch (e) { return reply(res, e); }
});

module.exports = router;
