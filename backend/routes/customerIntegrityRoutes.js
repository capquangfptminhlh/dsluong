'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission, writeAudit } = require('../middleware/auth');

router.use(requireAuth);

const canWriteCustomers = requirePermission('customers');
const httpError = (status, message) => Object.assign(new Error(message), { status });

function parseCustomerId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Khách hàng không hợp lệ');
  return id;
}

function readHistory(native, userId, customer) {
  const byPhone = (table) => Number(native.prepare(
    `SELECT COUNT(*) AS c FROM ${table} WHERE user_id = ? AND customer_phone = ?`
  ).get(userId, customer.phone)?.c || 0);

  return {
    pos_orders: byPhone('pos_orders'),
    appointments: byPhone('appointments'),
    warranties: byPhone('warranties'),
    loyalty_logs: Number(native.prepare(
      'SELECT COUNT(*) AS c FROM loyalty_logs WHERE customer_id = ?'
    ).get(customer.id)?.c || 0),
    total_spend: Number(customer.total_spend) || 0,
  };
}

function hasBusinessHistory(history) {
  return history.pos_orders > 0
    || history.appointments > 0
    || history.warranties > 0
    || history.loyalty_logs > 0
    || history.total_spend !== 0;
}

function historyMessage(history) {
  return `Khách hàng đã có lịch sử nghiệp vụ (đơn POS: ${history.pos_orders}, lịch hẹn: ${history.appointments}, bảo hành: ${history.warranties}, nhật ký điểm: ${history.loyalty_logs}, tổng mua: ${history.total_spend}), không thể thay đổi định danh/xóa cứng.`;
}

/**
 * Integrity boundary for PUT /api/customers/:id.
 *
 * Name/tags/price level remain editable. Phone is a legacy business key used by POS,
 * appointments and warranties, so changing it is allowed only before any history exists.
 * The history check and update share one IMMEDIATE transaction. Price levels are also
 * tenant-validated to prevent cross-shop references.
 */
router.put('/:id', canWriteCustomers, (req, res) => {
  let customerId;
  try {
    customerId = parseCustomerId(req.params.id);
  } catch (error) {
    return res.status(error.status).json({ error: error.message });
  }

  const requested = {};
  if (req.body.name !== undefined) {
    requested.name = String(req.body.name || '').trim();
    if (!requested.name) return res.status(400).json({ error: 'Cần tên khách hàng' });
  }
  if (req.body.phone !== undefined) {
    requested.phone = String(req.body.phone || '').trim();
    if (!requested.phone) return res.status(400).json({ error: 'Cần số điện thoại khách hàng' });
  }
  if (req.body.address !== undefined) requested.address = String(req.body.address || '').trim();
  if (req.body.tags !== undefined) requested.tags = String(req.body.tags || '').trim();
  if (req.body.price_level_id !== undefined) {
    if (req.body.price_level_id === null || req.body.price_level_id === '') requested.price_level_id = null;
    else {
      const levelId = Number(req.body.price_level_id);
      if (!Number.isInteger(levelId) || levelId <= 0) return res.status(400).json({ error: 'Mức giá không hợp lệ' });
      requested.price_level_id = levelId;
    }
  }
  if (!Object.keys(requested).length) return res.status(400).json({ error: 'Không có gì để cập nhật' });

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');

    const updateCustomer = native.transaction(() => {
      const current = native.prepare(
        'SELECT id, name, phone, address, tags, price_level_id, total_spend FROM customers WHERE id = ? AND user_id = ?'
      ).get(customerId, req.tenantId);
      if (!current) throw httpError(404, 'Không tìm thấy khách hàng');

      if (requested.price_level_id !== undefined && requested.price_level_id !== null) {
        const level = native.prepare(
          'SELECT id FROM price_levels WHERE id = ? AND user_id = ?'
        ).get(requested.price_level_id, req.tenantId);
        if (!level) throw httpError(404, 'Không tìm thấy mức giá của cửa hàng hiện tại');
      }

      if (requested.phone !== undefined && requested.phone !== current.phone) {
        const history = readHistory(native, req.tenantId, current);
        if (hasBusinessHistory(history)) throw httpError(409, historyMessage(history));
      }

      const fields = [];
      const values = [];
      for (const key of ['name', 'phone', 'address', 'tags', 'price_level_id']) {
        if (requested[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(requested[key]);
        }
      }
      values.push(customerId, req.tenantId);
      const changed = native.prepare(
        `UPDATE customers SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
      ).run(...values);
      if (Number(changed.changes) !== 1) throw httpError(409, 'Khách hàng đã thay đổi bởi yêu cầu khác');

      return {
        id: customerId,
        previousPhone: current.phone,
        phoneChanged: requested.phone !== undefined && requested.phone !== current.phone,
        fields: Object.keys(requested),
      };
    });

    const result = updateCustomer.immediate();
    writeAudit(req, {
      action: 'customer.update',
      target: String(result.id),
      detail: {
        fields: result.fields,
        phone_changed: result.phoneChanged,
        previous_phone: result.phoneChanged ? result.previousPhone : undefined,
      },
    });
    return res.json({ success: true, id: result.id });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Số điện thoại đã tồn tại' });
    return res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * Hard deletion is reserved for an entirely unused customer. Historical customer
 * identities remain available for POS, CRM loyalty, appointment and warranty evidence.
 */
router.delete('/:id', canWriteCustomers, (req, res) => {
  let customerId;
  try {
    customerId = parseCustomerId(req.params.id);
  } catch (error) {
    return res.status(error.status).json({ error: error.message });
  }

  try {
    const native = db._native;
    if (!native || typeof native.transaction !== 'function') throw new Error('SQLite transaction engine unavailable');

    const deleteCustomer = native.transaction(() => {
      const customer = native.prepare(
        'SELECT id, name, phone, total_spend FROM customers WHERE id = ? AND user_id = ?'
      ).get(customerId, req.tenantId);
      if (!customer) throw httpError(404, 'Không tìm thấy khách hàng');

      const history = readHistory(native, req.tenantId, customer);
      if (hasBusinessHistory(history)) throw httpError(409, historyMessage(history));

      const deleted = native.prepare(
        'DELETE FROM customers WHERE id = ? AND user_id = ?'
      ).run(customerId, req.tenantId);
      if (Number(deleted.changes) !== 1) throw httpError(409, 'Khách hàng đã thay đổi bởi yêu cầu khác');

      return { id: customer.id, name: customer.name, phone: customer.phone };
    });

    const result = deleteCustomer.immediate();
    writeAudit(req, {
      action: 'customer.delete',
      target: String(result.id),
      detail: { name: result.name, phone: result.phone, hard_delete: true, unused_only: true },
    });
    return res.json({ success: true, id: result.id });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
