'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../middleware/auth');

const router = express.Router();
const phoneRegex = /^(0[3|5|7|8|9])+([0-9]{8})$/;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

router.post('/register', async (req, res) => {
  const { name, phone, password, sector = 'retail' } = req.body || {};
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập Tên, Số điện thoại và Mật khẩu' });
  }
  if (!phoneRegex.test(String(phone).replace(/\s+/g, ''))) {
    return res.status(400).json({ error: 'Số điện thoại không hợp lệ' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  }

  let hash;
  try {
    hash = await bcrypt.hash(password, 10);
  } catch (error) {
    return res.status(500).json({ error: 'Không thể bảo vệ mật khẩu đăng ký' });
  }

  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  // Public registration is tenant onboarding only. Platform superadmin authority must be
  // provisioned out-of-band and must never be inferred from a client-supplied phone number.
  const role = 'owner';

  try {
    const registerShop = native.transaction(() => {
      const existing = native.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
      if (existing) throw httpError(409, 'Số điện thoại đã được đăng ký');

      const insertedUser = native.prepare(
        `INSERT INTO users (name, phone, password_hash, role, status, sector)
         VALUES (?, ?, ?, ?, 'active', ?)`,
      ).run(name, phone, hash, role, sector);
      const userId = Number(insertedUser.lastInsertRowid);
      if (!Number.isInteger(userId) || userId <= 0) {
        throw httpError(500, 'Không thể tạo tài khoản cửa hàng');
      }

      const insertPriceLevel = native.prepare(
        'INSERT INTO price_levels (user_id, name, is_default) VALUES (?, ?, ?)',
      );
      insertPriceLevel.run(phone, 'Giá lẻ', 1);
      insertPriceLevel.run(phone, 'Giá sỉ', 0);
      insertPriceLevel.run(phone, 'Giá VIP', 0);

      native.prepare(
        `INSERT INTO branches (user_id, name, is_default, status)
         VALUES (?, 'Chi nhánh chính', 1, 'active')`,
      ).run(phone);

      const insertTier = native.prepare(
        `INSERT INTO customer_tiers
          (user_id, name, min_points, discount_percent, color)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const [tierName, minPoints, discount, color] of [
        ['Đồng', 0, 0, '#CD7F32'],
        ['Bạc', 500, 3, '#C0C0C0'],
        ['Vàng', 2000, 5, '#FFD700'],
        ['Kim cương', 5000, 10, '#B9F2FF'],
      ]) {
        insertTier.run(phone, tierName, minPoints, discount, color);
      }

      const seeded = native.prepare(
        `SELECT
          (SELECT COUNT(*) FROM users WHERE phone = ?) AS users_count,
          (SELECT COUNT(*) FROM price_levels WHERE user_id = ?) AS price_levels_count,
          (SELECT SUM(CASE WHEN is_default = 1 THEN 1 ELSE 0 END) FROM price_levels WHERE user_id = ?) AS default_price_levels,
          (SELECT COUNT(*) FROM branches WHERE user_id = ?) AS branches_count,
          (SELECT SUM(CASE WHEN is_default = 1 AND COALESCE(status, 'active') = 'active' THEN 1 ELSE 0 END) FROM branches WHERE user_id = ?) AS active_default_branches,
          (SELECT COUNT(*) FROM customer_tiers WHERE user_id = ?) AS customer_tiers_count`,
      ).get(phone, phone, phone, phone, phone, phone);

      if (
        Number(seeded?.users_count || 0) !== 1
        || Number(seeded?.price_levels_count || 0) !== 3
        || Number(seeded?.default_price_levels || 0) !== 1
        || Number(seeded?.branches_count || 0) !== 1
        || Number(seeded?.active_default_branches || 0) !== 1
        || Number(seeded?.customer_tiers_count || 0) !== 4
      ) {
        throw httpError(500, 'Khởi tạo dữ liệu cửa hàng chưa đầy đủ');
      }

      return userId;
    });

    const userId = registerShop.immediate();
    const token = signToken({
      tenantId: phone,
      actorType: 'owner',
      actorId: userId,
      actorName: name,
      role,
      permissions: [],
    });

    return res.json({ token, user: { id: userId, name, phone, role, sector } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (String(error.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Số điện thoại đã được đăng ký' });
    }
    return res.status(500).json({ error: error.message || 'Lỗi đăng ký cửa hàng' });
  }
});

module.exports = router;
