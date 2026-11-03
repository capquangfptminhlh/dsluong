const express = require('express');
const router = express.Router();
const db = require('../db');

// Get setting
router.get('/:key', (req, res) => {
  db.get('SELECT value FROM system_settings WHERE key = ?', [req.params.key], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ value: row ? row.value : '' });
  });
});

// Save setting
router.post('/', (req, res) => {
  const { key, value } = req.body;
  db.run(`INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`,
    [key, value, value], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
  });
});

module.exports = router;
