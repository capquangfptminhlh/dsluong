const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

router.use(requireAuth);
router.use(requirePermission('appointments'));

// Get all appointments
router.get('/', (req, res) => {
  const userId = req.tenantId;
  db.all('SELECT * FROM appointments WHERE user_id = ? ORDER BY start_time ASC', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create appointment
router.post('/', (req, res) => {
  const { customer_name, customer_phone, service_id, service_name, room_id, staff_id, start_time, end_time, notes } = req.body;
  const userId = req.tenantId;

  db.run(`
    INSERT INTO appointments (user_id, customer_name, customer_phone, service_id, service_name, room_id, staff_id, start_time, end_time, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [userId, customer_name, customer_phone, service_id, service_name, room_id, staff_id, start_time, end_time, notes], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: "Appointment created" });
  });
});

// Update appointment status
router.put('/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.tenantId;

  db.run('UPDATE appointments SET status = ? WHERE id = ? AND user_id = ?', [status, id, userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Status updated" });
  });
});

// Delete appointment
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.tenantId;
  
  db.run('DELETE FROM appointments WHERE id = ? AND user_id = ?', [id, userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Deleted" });
  });
});

module.exports = router;
