'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner, writeAudit } = require('../middleware/auth');

const router = express.Router();

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

router.put('/:id', requireAuth, requireOwner, (req, res) => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return res.status(400).json({ error: 'Chi nhánh không hợp lệ' });
  }

  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Cần nhập tên chi nhánh' });

  const status = String(req.body?.status || 'active').trim().toLowerCase();
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ error: 'Trạng thái chi nhánh chỉ được là active hoặc inactive' });
  }

  const address = String(req.body?.address || '').trim() || null;
  const phone = String(req.body?.phone || '').trim() || null;
  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  try {
    const updateBranch = native.transaction(() => {
      const branch = native.prepare(
        `SELECT id, name, COALESCE(status, 'active') AS status, is_default
         FROM branches WHERE id = ? AND user_id = ?`,
      ).get(branchId, req.tenantId);
      if (!branch) throw httpError(404, 'Không tìm thấy chi nhánh');

      if (status === 'inactive' && Number(branch.is_default) === 1) {
        throw httpError(409, 'Không thể ngừng hoạt động chi nhánh mặc định. Hãy đặt một chi nhánh đang hoạt động khác làm mặc định trước.');
      }

      const updated = native.prepare(
        `UPDATE branches
         SET name = ?, address = ?, phone = ?, status = ?
         WHERE id = ? AND user_id = ?`,
      ).run(name, address, phone, status, branch.id, req.tenantId);
      if (Number(updated.changes || 0) !== 1) {
        throw httpError(409, 'Chi nhánh đã thay đổi trong lúc cập nhật, vui lòng thử lại');
      }

      return {
        ...branch,
        newName: name,
        oldStatus: String(branch.status || 'active').toLowerCase(),
        newStatus: status,
      };
    });

    const branch = updateBranch.immediate();
    writeAudit(req, {
      action: 'branch.update',
      target: branch.newName,
      detail: {
        branch_id: branch.id,
        old_name: branch.name,
        old_status: branch.oldStatus,
        new_status: branch.newStatus,
        atomic: true,
      },
    });
    return res.json({ success: true, id: branch.id, status: branch.newStatus });
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Chi nhánh trùng tên' });
    }
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi cập nhật chi nhánh' });
  }
});

router.post('/:id/mac-dinh', requireAuth, requireOwner, (req, res) => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return res.status(400).json({ error: 'Chi nhánh không hợp lệ' });
  }

  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  try {
    const setDefault = native.transaction(() => {
      const branch = native.prepare(
        `SELECT id, name, COALESCE(status, 'active') AS status, is_default
         FROM branches WHERE id = ? AND user_id = ?`,
      ).get(branchId, req.tenantId);
      if (!branch) throw httpError(404, 'Không tìm thấy chi nhánh');
      if (String(branch.status).toLowerCase() !== 'active') {
        throw httpError(409, 'Chỉ có thể đặt chi nhánh đang hoạt động làm mặc định');
      }

      const updated = native.prepare(
        `UPDATE branches
         SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END
         WHERE user_id = ?`,
      ).run(branch.id, req.tenantId);
      if (Number(updated.changes || 0) < 1) throw httpError(409, 'Không thể cập nhật chi nhánh mặc định');

      const invariant = native.prepare(
        `SELECT
           SUM(CASE WHEN is_default = 1 THEN 1 ELSE 0 END) AS default_count,
           SUM(CASE WHEN id = ? AND is_default = 1 THEN 1 ELSE 0 END) AS target_default
         FROM branches WHERE user_id = ?`,
      ).get(branch.id, req.tenantId);
      if (Number(invariant?.default_count || 0) !== 1 || Number(invariant?.target_default || 0) !== 1) {
        throw httpError(409, 'Không thể đảm bảo duy nhất một chi nhánh mặc định');
      }

      return branch;
    });

    const branch = setDefault.immediate();
    writeAudit(req, {
      action: 'branch.default',
      target: branch.name,
      detail: { branch_id: branch.id, atomic: true },
    });
    return res.json({ success: true, branch_id: branch.id });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi đặt chi nhánh mặc định' });
  }
});

router.delete('/:id', requireAuth, requireOwner, (req, res) => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return res.status(400).json({ error: 'Chi nhánh không hợp lệ' });
  }

  const native = db._native;
  if (!native || typeof native.transaction !== 'function') {
    return res.status(500).json({ error: 'SQLite transaction engine unavailable' });
  }

  try {
    const deleteBranch = native.transaction(() => {
      const branch = native.prepare(
        'SELECT id, name, is_default FROM branches WHERE id = ? AND user_id = ?',
      ).get(branchId, req.tenantId);
      if (!branch) throw httpError(404, 'Không tìm thấy chi nhánh');
      if (Number(branch.is_default) === 1) {
        throw httpError(400, 'Không xóa được chi nhánh mặc định');
      }

      const nonZeroStock = Number(native.prepare(
        `SELECT COUNT(*) AS count
         FROM branch_stock
         WHERE branch_id = ? AND ABS(COALESCE(stock, 0)) > 0.0000001`,
      ).get(branch.id)?.count || 0);
      if (nonZeroStock > 0) {
        throw httpError(409, 'Chi nhánh vẫn còn tồn kho. Hãy chuyển hết hàng đi trước khi xóa.');
      }

      const references = [
        ['Đơn bán hàng', 'pos_orders', 'branch_id'],
        ['Phiếu nhập hàng', 'purchase_orders', 'branch_id'],
        ['Nhật ký kho', 'inventory_logs', 'branch_id'],
        ['Yêu cầu mua hàng NCC', 'purchase_requests', 'branch_id'],
        ['Phiếu trả hàng NCC', 'supplier_returns', 'branch_id'],
        ['Nhân viên', 'staff', 'branch_id'],
        ['Bàn / phòng', 'rooms', 'branch_id'],
      ];

      for (const [label, table, column] of references) {
        const exists = native.prepare(
          "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?",
        ).get(table);
        if (!exists) continue;
        const columns = native.prepare(`PRAGMA table_info(${table})`).all();
        if (!columns.some((item) => item.name === column) || !columns.some((item) => item.name === 'user_id')) continue;
        const count = Number(native.prepare(
          `SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ? AND ${column} = ?`,
        ).get(req.tenantId, branch.id)?.count || 0);
        if (count > 0) {
          throw httpError(409, `Không thể xóa chi nhánh đã có lịch sử nghiệp vụ (${label}). Có thể chuyển trạng thái chi nhánh sang ngừng hoạt động thay vì xóa.`);
        }
      }

      const transferTable = native.prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'inventory_transfers'",
      ).get();
      if (transferTable) {
        const transferColumns = native.prepare('PRAGMA table_info(inventory_transfers)').all().map((item) => item.name);
        if (transferColumns.includes('user_id') && transferColumns.includes('from_branch') && transferColumns.includes('to_branch')) {
          const transferCount = Number(native.prepare(
            `SELECT COUNT(*) AS count FROM inventory_transfers
             WHERE user_id = ? AND (from_branch = ? OR to_branch = ?)`,
          ).get(req.tenantId, branch.name, branch.name)?.count || 0);
          if (transferCount > 0) {
            throw httpError(409, 'Không thể xóa chi nhánh đã có lịch sử chuyển kho. Có thể chuyển trạng thái chi nhánh sang ngừng hoạt động thay vì xóa.');
          }
        }
      }

      native.prepare('DELETE FROM branch_stock WHERE branch_id = ?').run(branch.id);
      const deleted = native.prepare('DELETE FROM branches WHERE id = ? AND user_id = ?').run(branch.id, req.tenantId);
      if (Number(deleted.changes || 0) !== 1) throw httpError(409, 'Chi nhánh đã thay đổi trong lúc xóa, vui lòng thử lại');

      return branch;
    });

    const branch = deleteBranch.immediate();
    writeAudit(req, {
      action: 'branch.delete',
      target: branch.name,
      detail: { branch_id: branch.id, history_safe: true },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Lỗi xóa chi nhánh' });
  }
});

module.exports = router;
