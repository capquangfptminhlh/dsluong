/**
 * routes/authRoutes.js  (BẢN VIẾT LẠI)
 * - Đăng ký/đăng nhập bằng mật khẩu (bcrypt) + phát JWT.
 * - Chỉ CÓ MỘT route /register (bản cũ bị trùng đã bỏ).
 * - Route /users, DELETE /users chỉ superadmin mới gọi được (đóng lỗ hổng lộ toàn bộ khách hàng).
 * - Có rate-limit đăng nhập vì link WAN là công khai.
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const excel = require('exceljs');
const { signToken, requireAuth, requireSuperadmin, writeAudit } = require('../middleware/auth');

// Số điện thoại superadmin (bạn). Nên để trong biến môi trường.
const SUPERADMIN_PHONE = process.env.SUPERADMIN_PHONE || '0979164124';

// --- Rate limit đăng nhập đơn giản (chống dò mật khẩu) ---
const loginAttempts = new Map(); // key -> { count, first }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;
function checkRateLimit(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now - rec.first > WINDOW_MS) { loginAttempts.set(key, { count: 1, first: now }); return true; }
  rec.count++;
  return rec.count <= MAX_ATTEMPTS;
}
function resetRateLimit(key) { loginAttempts.delete(key); }

const phoneRegex = /^(0[3|5|7|8|9])+([0-9]{8})$/;

/* ============ ĐĂNG KÝ CHỦ CỬA HÀNG (một bản duy nhất) ============ */
router.post('/register', async (req, res) => {
  const { name, phone, password, sector = 'retail' } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập Tên, Số điện thoại và Mật khẩu' });
  }
  if (!phoneRegex.test(String(phone).replace(/\s+/g, ''))) {
    return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  }

  db.get('SELECT id FROM users WHERE phone = ?', [phone], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(409).json({ error: 'Số điện thoại đã được đăng ký' });

    const hash = await bcrypt.hash(password, 10);
    const role = phone === SUPERADMIN_PHONE ? 'superadmin' : 'owner';

    db.run(
      `INSERT INTO users (name, phone, password_hash, role, status, sector) VALUES (?, ?, ?, ?, 'active', ?)`,
      [name, phone, hash, role, sector],
      function (e) {
        if (e) return res.status(500).json({ error: e.message });
        // (seed sản phẩm mẫu có thể gọi ở đây — giữ nguyên logic cũ nếu muốn, dùng tham số ? cho SKU)
        const token = signToken({ tenantId: phone, actorType: 'owner', actorId: this.lastID, actorName: name, role, permissions: [] });
        res.json({ token, user: { id: this.lastID, name, phone, role, sector } });
      }
    );
  });
});

/* ============ ĐĂNG NHẬP CHỦ CỬA HÀNG ============ */
router.post('/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Thiếu số điện thoại hoặc mật khẩu' });

  const rlKey = 'owner:' + phone;
  if (!checkRateLimit(rlKey)) {
    return res.status(429).json({ error: 'Sai quá nhiều lần. Thử lại sau 5 phút.' });
  }

  db.get('SELECT * FROM users WHERE phone = ?', [phone], async (err, u) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!u || !u.password_hash) return res.status(401).json({ error: 'Sai thông tin đăng nhập' });
    if (u.status === 'locked') return res.status(403).json({ error: 'Tài khoản đã bị khóa' });

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Sai thông tin đăng nhập' });

    resetRateLimit(rlKey);
    const token = signToken({
      tenantId: u.phone, actorType: 'owner', actorId: u.id, actorName: u.name,
      role: u.role || 'owner', permissions: [],
    });
    res.json({ token, user: { id: u.id, name: u.name, phone: u.phone, role: u.role, sector: u.sector } });
  });
});

/* ============ ĐĂNG NHẬP NHÂN VIÊN (staff) ============ */
router.post('/staff-login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Thiếu tài khoản hoặc mật khẩu' });

  const rlKey = 'staff:' + username;
  if (!checkRateLimit(rlKey)) return res.status(429).json({ error: 'Sai quá nhiều lần. Thử lại sau 5 phút.' });

  db.get('SELECT * FROM staff WHERE username = ?', [username], async (err, s) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!s || !s.password_hash) return res.status(401).json({ error: 'Sai thông tin đăng nhập' });
    if (s.status === 'locked') return res.status(403).json({ error: 'Tài khoản đã bị khóa' });

    const ok = await bcrypt.compare(password, s.password_hash);
    if (!ok) return res.status(401).json({ error: 'Sai thông tin đăng nhập' });

    resetRateLimit(rlKey);
    let perms = [];
    try { perms = JSON.parse(s.permissions || '[]'); } catch (_) {}
    const token = signToken({
      tenantId: s.user_id, actorType: 'staff', actorId: s.id, actorName: s.name,
      role: 'staff', permissions: perms,
    });
    res.json({ token, user: { id: s.id, name: s.name, role: s.role, permissions: perms } });
  });
});

/* ============ HỒ SƠ (đã đăng nhập) ============ */
router.get('/profile', requireAuth, (req, res) => {
  db.get('SELECT id,name,phone,taxCode,email,province,ward,address,taxDepartment,role,sector FROM users WHERE phone = ?',
    [req.tenantId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Không tìm thấy' });
      res.json(row);
    });
});

router.put('/profile', requireAuth, (req, res) => {
  // tenantId lấy từ TOKEN, không cho client tự khai phone -> chặn sửa hồ sơ người khác
  const { name, taxCode, oldTaxCode, email, province, ward, address, taxDepartment } = req.body;
  db.run(
    `UPDATE users SET name=?, taxCode=?, oldTaxCode=?, email=?, province=?, ward=?, address=?, taxDepartment=? WHERE phone=?`,
    [name, taxCode, oldTaxCode, email, province, ward, address, taxDepartment, req.tenantId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Đã cập nhật' });
    });
});

/* ============ QUẢN TRỊ HỆ THỐNG — chỉ superadmin ============ */
router.get('/users', requireAuth, requireSuperadmin, (req, res) => {
  db.all('SELECT id,name,phone,role,status,createdAt FROM users ORDER BY createdAt DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.delete('/users/:id', requireAuth, requireSuperadmin, (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    writeAudit(req, { action: 'user.delete', target: req.params.id });
    res.json({ message: 'Đã xóa' });
  });
});

router.get('/users/export', requireAuth, requireSuperadmin, (req, res) => {
  db.all('SELECT id,name,phone,createdAt FROM users ORDER BY createdAt DESC', [], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    writeAudit(req, { action: 'users.export' });
    const wb = new excel.Workbook();
    const sheet = wb.addWorksheet('Leads');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Tên', key: 'name', width: 30 },
      { header: 'SĐT', key: 'phone', width: 20 },
      { header: 'Ngày ĐK', key: 'createdAt', width: 25 },
    ];
    sheet.getRow(1).font = { bold: true };
    rows.forEach(r => sheet.addRow(r));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Leads-Export.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  });
});

module.exports = router;
