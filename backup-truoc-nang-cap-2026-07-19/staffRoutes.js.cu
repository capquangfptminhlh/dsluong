const express = require('express');
const router = express.Router();
const db = require('../db');

// Lấy danh sách nhân viên
router.get('/', (req, res) => {
  const userId = req.headers['x-user-id'] || 'default_user';
  db.all('SELECT * FROM staff WHERE user_id = ? ORDER BY createdAt DESC', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Thêm nhân viên
router.post('/', (req, res) => {
  const { name, phone, role } = req.body;
  const userId = req.headers['x-user-id'] || 'default_user';

  db.run(`
    INSERT INTO staff (user_id, name, phone, role)
    VALUES (?, ?, ?, ?)
  `, [userId, name, phone, role || 'Thu ngân'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, success: true });
  });
});

module.exports = router;
