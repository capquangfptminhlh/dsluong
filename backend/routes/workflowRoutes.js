const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const EXECUTION_STATUS = 'NOT_IMPLEMENTED';

// Get all workflows — chỉ kịch bản của cửa hàng hiện tại.
// AutoTax hiện chỉ lưu cấu hình rule; chưa có executor/provider SMS/Zalo production.
router.get('/', requireAuth, (req, res) => {
  db.all('SELECT * FROM workflows WHERE user_id = ? ORDER BY createdAt DESC', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({
      ...r,
      is_active: 0,
      execution_status: EXECUTION_STATUS,
      condition: JSON.parse(r.condition_json || '{}'),
      action_payload: JSON.parse(r.action_payload || '{}')
    })));
  });
});

// Lưu workflow dưới dạng bản nháp. Không nhận is_active từ client cho đến khi có executor thật.
router.post('/', requireAuth, requireOwner, (req, res) => {
  const { name, trigger_event, condition, action_type, action_payload } = req.body;

  db.run(`
    INSERT INTO workflows (user_id, name, trigger_event, condition_json, action_type, action_payload, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `, [
    req.tenantId, name, trigger_event, JSON.stringify(condition || {}), action_type, JSON.stringify(action_payload || {})
  ], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID, is_active: false, execution_status: EXECUTION_STATUS });
  });
});

// Delete workflow
router.delete('/:id', requireAuth, requireOwner, (req, res) => {
  db.run('DELETE FROM workflows WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy kịch bản' });
    res.json({ success: true, deleted: this.changes });
  });
});

/**
 * Executor chưa được tích hợp production. Giữ helper để các caller hiện tại không lỗi,
 * nhưng tuyệt đối không giả vờ đã gửi SMS/Zalo hoặc thực thi action.
 */
const triggerEvent = (eventName, _data, userId) => {
  if (!userId) {
    console.warn('[WORKFLOW] Bỏ qua: thiếu userId khi nhận sự kiện', eventName);
    return;
  }
  console.info(`[WORKFLOW] Event ${eventName} của shop ${userId} được bỏ qua: executor chưa tích hợp.`);
};

module.exports = { router, triggerEvent };