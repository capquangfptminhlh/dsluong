/**
 * routes/staffRoutes.js  (BẢN VÁ MẪU — dùng làm KHUÔN cho mọi route khác)
 *
 * Điểm mấu chốt thay đổi so với bản cũ:
 *   CŨ:  const userId = req.headers['x-user-id'] || 'default_user';   // client tự khai -> IDOR
 *   MỚI: const userId = req.tenantId;                                 // lấy từ token đã ký
 *
 * Áp đúng khuôn này cho: posRoutes, transactionRoutes, productRoutes,
 * inventoryRoutes, customerRoutes, financeRoutes, reportRoutes...
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { resolvePosBranch } = require('../utils/branchAccess');

const { requireAuth, requireOwner, requirePermission, requireAnyPermission, writeAudit } = require('../middleware/auth');

// Assign all newly created staff to one active branch. A multi-branch shop
// must explicitly select it; other tenants' branches are never accepted.
function validateBranchAssignment(tenantId, input) {
  const branches = db._native.prepare(
    "SELECT id FROM branches WHERE user_id = ? AND COALESCE(status, 'active') = 'active' ORDER BY is_default DESC, id ASC",
  ).all(tenantId);
  if (!branches.length) return { error: 'Cửa hàng chưa có chi nhánh đang hoạt động.' };
  if (input === undefined || input === null || input === '') {
    if (branches.length > 1) return { error: 'Vui lòng chọn chi nhánh cho nhân viên.' };
    return { id: Number(branches[0].id) };
  }
  const id = Number(input);
  if (!Number.isInteger(id) || !branches.some((branch) => Number(branch.id) === id)) {
    return { error: 'Chi nhánh không hợp lệ hoặc đã ngừng hoạt động.' };
  }
  return { id };
}

// Tất cả route staff đều cần đăng nhập
router.use(requireAuth);

/**
 * Danh sách nhân viên.
 * Chủ cửa hàng: xem đầy đủ (tài khoản đăng nhập, quyền, trạng thái).
 * Nhân viên có quyền pos/appointments: chỉ xem tên + vai trò, vì màn hình
 * bán hàng spa và đặt lịch cần chọn kỹ thuật viên phục vụ.
 */
router.get('/', requireAnyPermission('staff', 'pos', 'appointments'), (req, res) => {
  const userId = req.tenantId; // <- KHÔNG còn x-user-id
  const laChu = req.user.actorType === 'owner' || req.user.role === 'superadmin';

  const cot = laChu
    ? 'id, user_id, name, phone, username, role, permissions, branch_id, status, sales_total, createdAt'
    : 'id, name, role';   // nhân viên thường KHÔNG thấy tài khoản đăng nhập của người khác

  let branchId = null;
  try { if (!laChu) branchId = resolvePosBranch(req, null); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message }); }

  db.all(
    `SELECT ${cot} FROM staff WHERE user_id = ?
       ${branchId === null ? '' : 'AND (branch_id = ? OR (branch_id IS NULL AND (SELECT COUNT(*) FROM branches WHERE user_id = ? AND COALESCE(status, \'active\') = \'active\') = 1))'}
       ORDER BY createdAt DESC`,
    branchId === null ? [userId] : [userId, branchId, userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // parse permissions về mảng cho frontend hiển thị "15 modules"
      if (laChu) {
        rows.forEach(r => { try { r.permissions = JSON.parse(r.permissions || '[]'); } catch (_) { r.permissions = []; } });
      }
      res.json(rows);
    }
  );
});

// Thêm nhân viên (có mật khẩu + quyền theo module) — chỉ chủ cửa hàng
router.post('/', requireOwner, async (req, res) => {
  const userId = req.tenantId;
  const { name, phone, username, password, role, permissions, branch_id } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Cần tên, tài khoản và mật khẩu' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  }
  const assignment = validateBranchAssignment(userId, branch_id);
  if (assignment.error) return res.status(400).json({ error: assignment.error });
  const hash = await bcrypt.hash(password, 10);
  const permJson = JSON.stringify(Array.isArray(permissions) ? permissions : []);

  db.run(
    `INSERT INTO staff (user_id, name, phone, username, password_hash, role, permissions, branch_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [userId, name, phone || null, username, hash, role || 'Thu ngân', permJson, assignment.id],
    function (err) {
      if (err) {
        if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Tài khoản đã tồn tại' });
        return res.status(500).json({ error: err.message });
      }
      writeAudit(req, { action: 'staff.create', target: username, detail: { role, permissions, branch_id: assignment.id } });
      res.json({ id: this.lastID, success: true });
    }
  );
});

/* ============ HOA HỒNG ============
   Khai báo TRƯỚC các route '/:id' để không bị nuốt mất. */

// Bảng hoa hồng theo nhân viên — chỉ chủ cửa hàng
router.get('/commissions', requireOwner, (req, res) => {
  db.all(
    `SELECT s.id as staff_id, s.name as staff_name, s.role, s.sales_total,
            COUNT(c.id) as so_lan, COALESCE(SUM(c.amount), 0) as tong_hoa_hong
     FROM staff s
     LEFT JOIN commissions c ON c.staff_id = s.id
     WHERE s.user_id = ?
     GROUP BY s.id
     ORDER BY tong_hoa_hong DESC`,
    [req.tenantId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Ghi nhận một khoản hoa hồng cho nhân viên — chỉ chủ cửa hàng
router.post('/commissions', requireOwner, (req, res) => {
  const { staff_id, amount, order_id } = req.body;
  const staffId = Number(staff_id);
  const commissionAmount = Number(amount);
  const hasOrderId = order_id !== undefined && order_id !== null && String(order_id).trim() !== '';
  const orderId = hasOrderId ? Number(order_id) : null;

  if (!Number.isInteger(staffId) || staffId <= 0) {
    return res.status(400).json({ error: 'Nhân viên không hợp lệ' });
  }
  if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) {
    return res.status(400).json({ error: 'Số tiền hoa hồng phải lớn hơn 0' });
  }
  if (hasOrderId && (!Number.isInteger(orderId) || orderId <= 0)) {
    return res.status(400).json({ error: 'Mã đơn không hợp lệ' });
  }

  const insertCommission = (validatedOrderId) => {
    db.run(
      `INSERT INTO commissions (staff_id, order_id, amount)
       SELECT id, ?, ? FROM staff WHERE id = ? AND user_id = ?`,
      [validatedOrderId, commissionAmount, staffId, req.tenantId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
        writeAudit(req, {
          action: 'staff.commission',
          target: String(staffId),
          detail: { amount: commissionAmount, order_id: validatedOrderId },
        });
        res.json({ success: true, id: this.lastID });
      }
    );
  };

  if (!hasOrderId) return insertCommission(null);

  db.get(
    'SELECT id FROM pos_orders WHERE id = ? AND user_id = ?',
    [orderId, req.tenantId],
    (err, order) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng của cửa hàng' });
      insertCommission(order.id);
    }
  );
});

// Cập nhật quyền / đổi mật khẩu nhân viên — chỉ chủ cửa hàng
router.put('/:id', requireOwner, async (req, res) => {
  const userId = req.tenantId;
  const { name, role, permissions, password, branch_id } = req.body;
  const fields = [];
  const vals = [];
  if (name !== undefined) { fields.push('name = ?'); vals.push(name); }
  if (role !== undefined) { fields.push('role = ?'); vals.push(role); }
  if (permissions !== undefined) { fields.push('permissions = ?'); vals.push(JSON.stringify(permissions)); }
  if (branch_id !== undefined) {
    const assignment = validateBranchAssignment(userId, branch_id);
    if (assignment.error) return res.status(400).json({ error: assignment.error });
    fields.push('branch_id = ?'); vals.push(assignment.id);
  }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    fields.push('password_hash = ?'); vals.push(await bcrypt.hash(password, 10));
  }
  if (!fields.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });

  // AND user_id = ? -> không cho sửa nhân viên của cửa hàng khác
  vals.push(req.params.id, userId);
  db.run(`UPDATE staff SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    writeAudit(req, { action: 'staff.update', target: req.params.id, detail: { role, permissions, passwordChanged: !!password } });
    res.json({ success: true });
  });
});

// Khóa / mở khóa nhân viên — chỉ chủ cửa hàng
router.post('/:id/lock', requireOwner, (req, res) => {
  const userId = req.tenantId;
  const status = req.body.locked ? 'locked' : 'active';
  db.run('UPDATE staff SET status = ? WHERE id = ? AND user_id = ?', [status, req.params.id, userId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    writeAudit(req, { action: 'staff.' + (status === 'locked' ? 'lock' : 'unlock'), target: req.params.id });
    res.json({ success: true, status });
  });
});

// Xem nhật ký thao tác của cửa hàng — chỉ chủ cửa hàng
router.get('/audit-log', requireOwner, (req, res) => {
  const userId = req.tenantId;
  const gioiHan = Math.min(Number(req.query.limit) || 500, 2000);
  db.all(
    `SELECT id, actor_type, actor_name, action, target, detail, ip, created_at
     FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ${gioiHan}`,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

module.exports = router;
