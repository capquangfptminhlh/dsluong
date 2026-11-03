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
const { requireAuth, requireOwner, requirePermission, writeAudit } = require('../middleware/auth');

// Tất cả route staff đều cần đăng nhập
router.use(requireAuth);

// Danh sách nhân viên — chỉ chủ cửa hàng xem
router.get('/', requireOwner, (req, res) => {
  const userId = req.tenantId; // <- KHÔNG còn x-user-id
  db.all(
    'SELECT id, user_id, name, phone, username, role, permissions, status, sales_total, createdAt FROM staff WHERE user_id = ? ORDER BY createdAt DESC',
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // parse permissions về mảng cho frontend hiển thị "15 modules"
      rows.forEach(r => { try { r.permissions = JSON.parse(r.permissions || '[]'); } catch (_) { r.permissions = []; } });
      res.json(rows);
    }
  );
});

// Thêm nhân viên (có mật khẩu + quyền theo module) — chỉ chủ cửa hàng
router.post('/', requireOwner, async (req, res) => {
  const userId = req.tenantId;
  const { name, phone, username, password, role, permissions } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Cần tên, tài khoản và mật khẩu' });
  }
  const hash = await bcrypt.hash(password, 10);
  const permJson = JSON.stringify(Array.isArray(permissions) ? permissions : []);

  db.run(
    `INSERT INTO staff (user_id, name, phone, username, password_hash, role, permissions, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [userId, name, phone || null, username, hash, role || 'Thu ngân', permJson],
    function (err) {
      if (err) {
        if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Tài khoản đã tồn tại' });
        return res.status(500).json({ error: err.message });
      }
      writeAudit(req, { action: 'staff.create', target: username, detail: { role, permissions } });
      res.json({ id: this.lastID, success: true });
    }
  );
});

// Cập nhật quyền / đổi mật khẩu nhân viên — chỉ chủ cửa hàng
router.put('/:id', requireOwner, async (req, res) => {
  const userId = req.tenantId;
  const { name, role, permissions, password } = req.body;
  const fields = [];
  const vals = [];
  if (name !== undefined) { fields.push('name = ?'); vals.push(name); }
  if (role !== undefined) { fields.push('role = ?'); vals.push(role); }
  if (permissions !== undefined) { fields.push('permissions = ?'); vals.push(JSON.stringify(permissions)); }
  if (password) { fields.push('password_hash = ?'); vals.push(await bcrypt.hash(password, 10)); }
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
  db.all(
    'SELECT actor_type, actor_name, action, target, detail, ip, created_at FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

module.exports = router;
