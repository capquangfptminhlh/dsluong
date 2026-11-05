const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireOwner, requireAnyPermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);

// Đảm bảo các cột lương của bảng staff luôn tồn tại
db.serialize(() => {
  db.run("ALTER TABLE staff ADD COLUMN base_salary REAL DEFAULT 0", () => {});
  db.run("ALTER TABLE staff ADD COLUMN hourly_rate REAL DEFAULT 25000", () => {});
  db.run("ALTER TABLE staff ADD COLUMN allowance REAL DEFAULT 0", () => {});
});

router.get('/', requireAnyPermission('staff', 'pos', 'appointments'), (req, res) => {
  const userId = req.tenantId;
  const laChu = req.user.actorType === 'owner' || req.user.role === 'superadmin';

  const cot = laChu
    ? 'id, user_id, name, phone, username, role, permissions, status, sales_total, COALESCE(base_salary, 0) as base_salary, COALESCE(hourly_rate, 25000) as hourly_rate, COALESCE(allowance, 0) as allowance, createdAt'
    : 'id, name, role';

  db.all(
    `SELECT ${cot} FROM staff WHERE user_id = ? ORDER BY createdAt DESC`,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (laChu) {
        rows.forEach(r => { try { r.permissions = JSON.parse(r.permissions || '[]'); } catch (_) { r.permissions = []; } });
      }
      res.json(rows);
    }
  );
});

// Thêm nhân viên (có mật khẩu + quyền + cấu hình lương) — chỉ chủ cửa hàng
router.post('/', requireOwner, async (req, res) => {
  const userId = req.tenantId;
  const { name, phone, username, password, role, permissions, base_salary, hourly_rate, allowance } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Cần tên, tài khoản và mật khẩu' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  }
  const hash = await bcrypt.hash(password, 10).catch(e => null);
  if (!hash) return res.status(500).json({ error: 'Lỗi mã hóa mật khẩu' });
  const permJson = JSON.stringify(Array.isArray(permissions) ? permissions : []);

  db.run(
    `INSERT INTO staff (user_id, name, phone, username, password_hash, role, permissions, status, base_salary, hourly_rate, allowance)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [
      userId,
      name,
      phone || null,
      username,
      hash,
      role || 'Dược sĩ bán thuốc',
      permJson,
      Number(base_salary) || 0,
      Number(hourly_rate) || 25000,
      Number(allowance) || 0
    ],
    function (err) {
      if (err) {
        if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Tài khoản hoặc SĐT đã tồn tại' });
        return res.status(500).json({ error: err.message });
      }
      writeAudit(req, { action: 'staff.create', target: username, detail: { role, permissions } });
      res.json({ id: this.lastID, success: true });
    }
  );
});

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

// Ghi nhận một khoản hoa hồng / thưởng tư vấn đơn thuốc cho nhân viên
router.post('/commissions', requireOwner, (req, res) => {
  const { staff_id, amount, order_id } = req.body;
  if (!staff_id || !amount) return res.status(400).json({ error: 'Cần chọn nhân viên và số tiền' });

  db.run(
    `INSERT INTO commissions (staff_id, order_id, amount)
     SELECT id, ?, ? FROM staff WHERE id = ? AND user_id = ?`,
    [order_id || null, Math.round(Number(amount) || 0), staff_id, req.tenantId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
      writeAudit(req, { action: 'staff.commission', target: String(staff_id), detail: { amount, order_id } });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Cập nhật quyền / mức lương / đổi mật khẩu nhân viên — chỉ chủ cửa hàng
router.put('/:id', requireOwner, async (req, res) => {
  const userId = req.tenantId;
  const { name, phone, role, permissions, password, base_salary, hourly_rate, allowance } = req.body;
  const fields = [];
  const vals = [];
  if (name !== undefined) { fields.push('name = ?'); vals.push(name); }
  if (phone !== undefined) { fields.push('phone = ?'); vals.push(phone || null); }
  if (role !== undefined) { fields.push('role = ?'); vals.push(role); }
  if (permissions !== undefined) { fields.push('permissions = ?'); vals.push(JSON.stringify(permissions)); }
  if (base_salary !== undefined) { fields.push('base_salary = ?'); vals.push(Number(base_salary) || 0); }
  if (hourly_rate !== undefined) { fields.push('hourly_rate = ?'); vals.push(Number(hourly_rate) || 0); }
  if (allowance !== undefined) { fields.push('allowance = ?'); vals.push(Number(allowance) || 0); }
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    const hash = await bcrypt.hash(password, 10).catch(e => null);
    if (!hash) return res.status(500).json({ error: 'Lỗi mã hóa mật khẩu' });
    fields.push('password_hash = ?'); vals.push(hash);
  }
  if (!fields.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });

  vals.push(req.params.id, userId);
  db.run(`UPDATE staff SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    writeAudit(req, { action: 'staff.update', target: req.params.id, detail: { role, permissions, passwordChanged: !!password } });
    res.json({ success: true });
  });
});

// Khóa / mở khóa nhân viên
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

// Xem nhật ký thao tác của cửa hàng
router.get('/audit-log', requireOwner, (req, res) => {
  const userId = req.tenantId;
  const gioiHan = Math.min(Number(req.query.limit) || 500, 2000);
  db.all(
    `SELECT id, actor_type, actor_name, action, target, detail, ip, createdAt as created_at
     FROM audit_log WHERE user_id = ? ORDER BY createdAt DESC LIMIT ${gioiHan}`,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

module.exports = router;
