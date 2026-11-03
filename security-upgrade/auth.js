/**
 * middleware/auth.js
 * Trái tim của lớp bảo mật mới. Mọi route nhạy cảm đi qua đây.
 *
 * Nguyên tắc vàng: KHÔNG BAO GIỜ tin user_id do client gửi (header/query/body).
 * Danh tính chỉ đến từ token đã ký -> req.user.
 */
const jwt = require('jsonwebtoken');
const db = require('../db');

// ĐỔI secret này và để trong biến môi trường, đừng hardcode khi lên production.
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_autotax_secret_2026';
const TOKEN_TTL = '12h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/**
 * requireAuth: bắt buộc có token hợp lệ.
 * Sau middleware này, LUÔN có:
 *   req.user     = { tenantId, actorType, actorId, actorName, role, permissions }
 *   req.tenantId = cửa hàng hiện tại (dùng cho MỌI query thay cho x-user-id)
 */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });

  try {
    const p = jwt.verify(token, JWT_SECRET);
    req.user = p;
    req.tenantId = p.tenantId;          // <- thay thế req.headers['x-user-id']
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ' });
  }
}

/** Chỉ chủ cửa hàng (owner) hoặc superadmin mới qua được. */
function requireOwner(req, res, next) {
  if (req.user && (req.user.actorType === 'owner' || req.user.role === 'superadmin')) return next();
  return res.status(403).json({ error: 'Chỉ chủ cửa hàng mới có quyền này' });
}

/** Chỉ superadmin (bạn) mới xem được toàn bộ danh sách khách hàng. */
function requireSuperadmin(req, res, next) {
  if (req.user && req.user.role === 'superadmin') return next();
  return res.status(403).json({ error: 'Không có quyền quản trị hệ thống' });
}

/**
 * requirePermission('reports'): chặn theo module.
 * Owner mặc định có tất cả quyền. Staff phải có module trong permissions.
 * Đây là chỗ khiến con số "15 modules" trên UI có HIỆU LỰC THẬT ở backend.
 */
function requirePermission(moduleName) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (req.user.actorType === 'owner' || req.user.role === 'superadmin') return next();
    const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (perms.includes(moduleName)) return next();
    return res.status(403).json({ error: `Bạn không có quyền truy cập module: ${moduleName}` });
  };
}

/**
 * writeAudit: ghi nhật ký hành động nhạy cảm.
 * Gọi ở các chỗ: hủy đơn, sửa giá, xóa hàng, xóa user, xuất dữ liệu...
 */
function writeAudit(req, { action, target = null, detail = null }) {
  try {
    const u = req.user || {};
    db.run(
      `INSERT INTO audit_log (user_id, actor_type, actor_id, actor_name, action, target, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.tenantId || 'unknown',
        u.actorType || 'unknown',
        u.actorId || null,
        u.actorName || null,
        action,
        target,
        detail ? JSON.stringify(detail) : null,
        req.ip || req.headers['x-forwarded-for'] || null,
      ],
      (e) => { if (e) console.error('[AUDIT]', e.message); }
    );
  } catch (e) {
    console.error('[AUDIT] fatal', e.message);
  }
}

module.exports = {
  JWT_SECRET, signToken,
  requireAuth, requireOwner, requireSuperadmin, requirePermission,
  writeAudit,
};
