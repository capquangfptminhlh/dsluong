'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireSuperadmin, writeAudit } = require('../middleware/auth');

const router = express.Router();

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

router.post('/users/:id/lock', requireAuth, requireSuperadmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Tài khoản không hợp lệ' });
  }
  if (typeof req.body?.locked !== 'boolean') {
    return res.status(400).json({ error: 'Cần chỉ định locked=true hoặc locked=false' });
  }
  if (Number(req.user?.actorId) === targetId) {
    return res.status(409).json({ error: 'Không thể tự khóa tài khoản superadmin đang đăng nhập' });
  }

  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  try {
    const changeStatus = native.transaction(() => {
      const target = native.prepare(
        'SELECT id, name, phone, role, status FROM users WHERE id = ?',
      ).get(targetId);
      if (!target) throw httpError(404, 'Không tìm thấy tài khoản');

      const nextStatus = req.body.locked ? 'locked' : 'active';
      if (String(target.role || '').toLowerCase() === 'superadmin' && req.body.locked) {
        throw httpError(409, 'Không thể khóa một tài khoản superadmin qua giao diện quản trị');
      }

      const updated = native.prepare(
        'UPDATE users SET status = ? WHERE id = ? AND phone = ?',
      ).run(nextStatus, target.id, target.phone);
      if (Number(updated.changes || 0) !== 1) {
        throw httpError(409, 'Tài khoản đã thay đổi trong lúc cập nhật, vui lòng thử lại');
      }

      return { ...target, nextStatus };
    });

    const target = changeStatus.immediate();
    writeAudit(req, {
      action: target.nextStatus === 'locked' ? 'user.lock' : 'user.unlock',
      target: String(target.id),
      detail: { phone: target.phone, account_name: target.name, status: target.nextStatus },
    });
    return res.json({ success: true, id: target.id, status: target.nextStatus });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi cập nhật trạng thái tài khoản' });
  }
});

router.delete('/users/:id', requireAuth, requireSuperadmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Tài khoản không hợp lệ' });
  }
  if (Number(req.user?.actorId) === targetId) {
    return res.status(409).json({ error: 'Không thể tự xóa tài khoản superadmin đang đăng nhập' });
  }

  return res.status(409).json({
    error: 'Đã tắt xóa cứng tài khoản online để bảo vệ dữ liệu cửa hàng. Hãy dùng Khóa tài khoản; việc xóa vĩnh viễn cần quy trình bảo trì có sao lưu và kiểm tra dữ liệu liên quan.',
  });
});

module.exports = router;
