/**
 * middleware/auth.js
 * Trái tim của lớp bảo mật mới. Mọi route nhạy cảm đi qua đây.
 *
 * Nguyên tắc vàng: KHÔNG BAO GIỜ tin user_id do client gửi (header/query/body).
 * Danh tính chỉ đến từ token đã ký -> req.user.
 */
const path = require('path');
const jwt = require('jsonwebtoken');

const JWT_SECRET = String(process.env.JWT_SECRET || '');
const INSECURE_DEFAULTS = new Set([
  'CHANGE_ME_autotax_secret_2026',
  'change-me',
  'secret',
]);

/**
 * Commercial fail-closed gate. Importing this module is allowed for offline utilities,
 * but the server and every auth operation must explicitly validate runtime key material.
 */
function assertJwtSecretConfigured() {
  if (JWT_SECRET.length < 32 || INSECURE_DEFAULTS.has(JWT_SECRET)) {
    throw new Error('[SECURITY] JWT_SECRET must be explicitly configured with at least 32 characters');
  }
  return true;
}

// `node server.js` (including the PM2 production entrypoint) must never boot with
// missing/weak key material. Offline smoke utilities can still import auth helpers safely.
if (path.basename(process.argv[1] || '') === 'server.js') {
  assertJwtSecretConfigured();
}

const db = require('../db');
const TOKEN_TTL = '12h';

function signToken(payload) {
  assertJwtSecretConfigured();
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function assertLiveAccount(payload) {
  const native = db._native;
  if (!native || typeof native.prepare !== 'function') {
    return { status: 503, error: 'Không thể kiểm tra trạng thái tài khoản lúc này' };
  }

  const actorId = Number(payload?.actorId);
  const tenantId = String(payload?.tenantId || '');
  if (!Number.isInteger(actorId) || actorId <= 0 || !tenantId) {
    return { status: 401, error: 'Phiên đăng nhập thiếu thông tin tài khoản' };
  }

  if (payload.actorType === 'owner') {
    const owner = native.prepare(
      'SELECT id, phone, status, role FROM users WHERE id = ? AND phone = ?',
    ).get(actorId, tenantId);
    if (!owner) return { status: 401, error: 'Tài khoản không còn tồn tại' };
    if (String(owner.status || 'active').toLowerCase() !== 'active') {
      return { status: 403, error: 'Tài khoản đã bị khóa' };
    }
    if (payload.role === 'superadmin' && String(owner.role || '').toLowerCase() !== 'superadmin') {
      return { status: 403, error: 'Quyền superadmin không còn hiệu lực' };
    }
    return null;
  }

  if (payload.actorType === 'staff') {
    const staff = native.prepare(
      'SELECT id, user_id, status FROM staff WHERE id = ? AND user_id = ?',
    ).get(actorId, tenantId);
    if (!staff) return { status: 401, error: 'Tài khoản nhân viên không còn tồn tại' };
    if (String(staff.status || 'active').toLowerCase() !== 'active') {
      return { status: 403, error: 'Tài khoản nhân viên đã bị khóa' };
    }

    const owner = native.prepare(
      'SELECT id, status FROM users WHERE phone = ?',
    ).get(tenantId);
    if (!owner) return { status: 403, error: 'Cửa hàng không còn hoạt động' };
    if (String(owner.status || 'active').toLowerCase() !== 'active') {
      return { status: 403, error: 'Cửa hàng đã bị khóa' };
    }
    return null;
  }

  return { status: 401, error: 'Loại tài khoản trong phiên đăng nhập không hợp lệ' };
}

/**
 * requireAuth: bắt buộc có token hợp lệ và account vẫn đang active.
 * Sau middleware này, LUÔN có:
 *   req.user     = { tenantId, actorType, actorId, actorName, role, permissions }
 *   req.tenantId = cửa hàng hiện tại (dùng cho MỌI query thay cho x-user-id)
 */
function requireAuth(req, res, next) {
  try {
    assertJwtSecretConfigured();
  } catch (e) {
    console.error('[AUTH CONFIG]', e.message);
    return res.status(503).json({ error: 'Máy chủ chưa cấu hình bảo mật đăng nhập' });
  }

  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ' });
  }

  try {
    const accountError = assertLiveAccount(payload);
    if (accountError) return res.status(accountError.status).json({ error: accountError.error });
    req.user = payload;
    req.tenantId = payload.tenantId;
    return next();
  } catch (e) {
    console.error('[AUTH STATUS]', e.message);
    return res.status(503).json({ error: 'Không thể xác minh trạng thái tài khoản' });
  }
}

/** Chỉ chủ cửa hàng (owner) hoặc superadmin mới qua được. */
function requireOwner(req, res, next) {
  if (req.user && (req.user.actorType === 'owner' || req.user.role === 'superadmin')) return next();
  return res.status(403).json({ error: 'Chỉ chủ cửa hàng mới có quyền này' });
}

/** Chỉ superadmin mới xem/điều khiển phạm vi toàn hệ thống. */
function requireSuperadmin(req, res, next) {
  if (req.user && req.user.role === 'superadmin') return next();
  return res.status(403).json({ error: 'Không có quyền quản trị hệ thống' });
}

function requirePermission(moduleName) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (req.user.actorType === 'owner' || req.user.role === 'superadmin') return next();
    const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (perms.includes(moduleName)) return next();
    return res.status(403).json({ error: `Bạn không có quyền truy cập module: ${moduleName}` });
  };
}

function requireAnyPermission(...moduleNames) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (req.user.actorType === 'owner' || req.user.role === 'superadmin') return next();
    const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (moduleNames.some((m) => perms.includes(m))) return next();
    return res.status(403).json({ error: `Bạn không có quyền truy cập module: ${moduleNames[0]}` });
  };
}

function requireWebhookSecret(req, res, next) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[WEBHOOK] Bị từ chối: chưa đặt biến môi trường WEBHOOK_SECRET');
    return res.status(503).json({ error: 'Webhook chưa được cấu hình trên máy chủ' });
  }
  const sent = req.headers['x-webhook-secret'];
  if (sent !== secret) return res.status(401).json({ error: 'Sai khóa webhook' });
  return next();
}

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
      (e) => { if (e) console.error('[AUDIT]', e.message); },
    );
  } catch (e) {
    console.error('[AUDIT] fatal', e.message);
  }
}

module.exports = {
  JWT_SECRET, assertJwtSecretConfigured, signToken,
  requireAuth, requireOwner, requireSuperadmin, requirePermission, requireAnyPermission,
  requireWebhookSecret,
  writeAudit,
};
