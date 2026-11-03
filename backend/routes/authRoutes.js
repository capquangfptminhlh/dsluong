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
const { sendXlsx } = require('../utils/xlsxExport');
const { signToken, requireAuth, requireOwner, requireSuperadmin, writeAudit } = require('../middleware/auth');

// --- Rate limit đăng nhập đơn giản (chống dò mật khẩu) ---
const loginAttempts = new Map();
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

/* ============ ĐĂNG KÝ CHỦ CỬA HÀNG (legacy fallback, integrity router chạy trước) ============ */
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
    // Public registration is tenant onboarding only. Superadmin is provisioned out-of-band.
    const role = 'owner';

    db.run(
      `INSERT INTO users (name, phone, password_hash, role, status, sector) VALUES (?, ?, ?, ?, 'active', ?)`,
      [name, phone, hash, role, sector],
      function (e) {
        if (e) return res.status(500).json({ error: e.message });

        const lv = db.prepare('INSERT INTO price_levels (user_id, name, is_default) VALUES (?, ?, ?)');
        lv.run(phone, 'Giá lẻ', 1);
        lv.run(phone, 'Giá sỉ', 0);
        lv.run(phone, 'Giá VIP', 0);
        lv.finalize();

        db.run('INSERT INTO branches (user_id, name, is_default) VALUES (?, ?, 1)', [phone, 'Chi nhánh chính']);

        const tier = db.prepare('INSERT INTO customer_tiers (user_id, name, min_points, discount_percent, color) VALUES (?, ?, ?, ?, ?)');
        [['Đồng', 0, 0, '#CD7F32'], ['Bạc', 500, 3, '#C0C0C0'], ['Vàng', 2000, 5, '#FFD700'], ['Kim cương', 5000, 10, '#B9F2FF']]
          .forEach(([n, mp, dc, c]) => tier.run(phone, n, mp, dc, c));
        tier.finalize();

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
    if (String(u.status || 'active').toLowerCase() !== 'active') {
      return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
    }

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

  db.all('SELECT * FROM staff WHERE username = ?', [username], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'Sai thông tin đăng nhập' });

    let s = null;
    for (const ungVien of rows) {
      if (!ungVien.password_hash) continue;
      if (await bcrypt.compare(password, ungVien.password_hash)) { s = ungVien; break; }
    }
    if (!s) return res.status(401).json({ error: 'Sai thông tin đăng nhập' });
    if (String(s.status || 'active').toLowerCase() !== 'active') {
      return res.status(403).json({ error: 'Tài khoản nhân viên đã bị khóa' });
    }

    try {
      const owner = db._native.prepare('SELECT id, status FROM users WHERE phone = ?').get(s.user_id);
      if (!owner || String(owner.status || 'active').toLowerCase() !== 'active') {
        return res.status(403).json({ error: 'Cửa hàng đã bị khóa hoặc không còn hoạt động' });
      }
    } catch (ownerError) {
      console.error('[STAFF LOGIN TENANT]', ownerError.message);
      return res.status(503).json({ error: 'Không thể xác minh trạng thái cửa hàng' });
    }

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

router.get('/profile', requireAuth, (req, res) => {
  db.get('SELECT id,name,phone,taxCode,email,province,ward,address,taxDepartment,role,sector FROM users WHERE phone = ?',
    [req.tenantId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Không tìm thấy' });
      res.json(row);
    });
});

router.put('/profile', requireAuth, requireOwner, (req, res) => {
  const { name, taxCode, oldTaxCode, email, province, ward, address, taxDepartment } = req.body;
  db.run(
    `UPDATE users SET name=?, taxCode=?, oldTaxCode=?, email=?, province=?, ward=?, address=?, taxDepartment=? WHERE phone=?`,
    [name, taxCode, oldTaxCode, email, province, ward, address, taxDepartment, req.tenantId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      writeAudit(req, { action: 'profile.update', target: req.tenantId });
      res.json({ message: 'Đã cập nhật' });
    });
});

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
  db.all('SELECT id,name,phone,createdAt FROM users ORDER BY createdAt DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    try {
      writeAudit(req, { action: 'users.export' });
      sendXlsx(res, {
        filename: 'Leads-Export.xlsx',
        sheetName: 'Leads',
        headers: ['ID', 'Tên', 'SĐT', 'Ngày ĐK'],
        rows: rows.map((row) => [row.id, row.name, row.phone, row.createdAt]),
        widths: [10, 30, 20, 25],
      });
    } catch (exportError) {
      console.error('[USERS EXPORT]', exportError);
      res.status(500).json({ error: 'Không thể tạo file xuất người dùng.' });
    }
  });
});

module.exports = router;
