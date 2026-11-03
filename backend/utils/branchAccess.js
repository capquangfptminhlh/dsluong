'use strict';

// The server resolves the trading branch from the live staff assignment, never the JWT
// or a client-controlled branch id. Owners may choose any active branch.
const db = require('../db');

function branchError(status, message) {
  return Object.assign(new Error(message), { status });
}

function branchRows(req, onlyActive = true) {
  const native = db._native;
  if (!native || typeof native.prepare !== 'function') {
    throw branchError(503, 'Không thể kiểm tra chi nhánh lúc này.');
  }
  return native.prepare(
    `SELECT id, name, is_default, status FROM branches
     WHERE user_id = ? ${onlyActive ? "AND COALESCE(status,'active') = 'active'" : ''}
     ORDER BY is_default DESC, name ASC`,
  ).all(req.tenantId);
}

function staffBranch(req, branches) {
  const staff = db._native.prepare(
    'SELECT branch_id FROM staff WHERE id = ? AND user_id = ? AND status = ?',
  ).get(req.user.actorId, req.tenantId, 'active');
  if (!staff) throw branchError(403, 'Tài khoản nhân viên không còn hoạt động.');
  if (staff.branch_id !== null && staff.branch_id !== undefined) {
    const assigned = branches.find((branch) => Number(branch.id) === Number(staff.branch_id));
    if (!assigned) throw branchError(403, 'Chi nhánh được phân công đã ngừng hoạt động.');
    return assigned;
  }
  // Preserve single-branch existing shops; never let unassigned staff use an
  // arbitrary "default" branch after the owner creates a second branch.
  if (branches.length === 1) return branches[0];
  throw branchError(403, 'Nhân viên chưa được phân công chi nhánh. Vui lòng liên hệ chủ cửa hàng.');
}

function resolvePosBranch(req, requestedBranchId) {
  const branches = branchRows(req);
  if (!branches.length) throw branchError(409, 'Cửa hàng chưa có chi nhánh đang hoạt động.');
  const requested = requestedBranchId === undefined || requestedBranchId === null || requestedBranchId === ''
    ? null : Number(requestedBranchId);
  if (requested !== null && (!Number.isInteger(requested) || requested <= 0)) {
    throw branchError(400, 'Chi nhánh không hợp lệ.');
  }
  if (req.user.actorType === 'staff') {
    const assigned = staffBranch(req, branches);
    if (requested !== null && requested !== Number(assigned.id)) {
      throw branchError(403, 'Không được bán hàng hoặc xem tồn kho của chi nhánh khác.');
    }
    return Number(assigned.id);
  }
  const chosen = requested === null ? branches[0] : branches.find((b) => Number(b.id) === requested);
  if (!chosen) throw branchError(403, 'Chi nhánh không thuộc cửa hàng hoặc đã ngừng hoạt động.');
  return Number(chosen.id);
}

function resolveReportBranch(req, requestedBranchId) {
  if (req.user.actorType === 'staff') return resolvePosBranch(req, requestedBranchId);
  if (requestedBranchId === undefined || requestedBranchId === null || requestedBranchId === '') return null;
  const id = Number(requestedBranchId);
  if (!Number.isInteger(id) || id <= 0 || !branchRows(req, false).some((b) => Number(b.id) === id)) {
    throw branchError(403, 'Chi nhánh báo cáo không thuộc cửa hàng.');
  }
  return id;
}

function posBranchContext(req) {
  const branches = branchRows(req);
  const branchId = resolvePosBranch(req, null);
  const isOwner = req.user.actorType !== 'staff';
  return {
    branch_id: branchId,
    can_select: isOwner,
    branches: (isOwner ? branches : branches.filter((b) => Number(b.id) === branchId))
      .map(({ id, name, is_default }) => ({ id, name, is_default })),
  };
}

// Debt records and company net-P&L predate branch attribution. For multi-branch
// companies, fail closed for staff instead of exposing figures from all stores.
function requireCompanyFinanceAccess(req, res, next) {
  try {
    if (req.user.actorType === 'staff' && branchRows(req).length > 1) {
      return res.status(403).json({
        error: 'Công nợ và lãi/lỗ ròng chưa tách chi nhánh. Chỉ chủ doanh nghiệp được xem hoặc thao tác.',
      });
    }
    next();
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
}

module.exports = { resolvePosBranch, resolveReportBranch, posBranchContext, requireCompanyFinanceAccess };
