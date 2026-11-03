const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Get all mappings for a user
router.get('/', (req, res) => {
  const userId = req.tenantId;
  db.all('SELECT * FROM product_mapping WHERE user_id = ?', [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Save or update a mapping
router.post('/', (req, res) => {
  const { keyword, category } = req.body;
  const userId = req.tenantId;

  if (!keyword || !category) {
    return res.status(400).json({ error: 'Keyword and category are required' });
  }

  // Insert or Replace (if using SQLite UPSERT)
  // For SQLite, if keyword is UNIQUE, we can use INSERT ... ON CONFLICT REPLACE
  const query = `
    INSERT INTO product_mapping (keyword, category, user_id)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, keyword) DO UPDATE SET category = excluded.category
  `;

  db.run(query, [keyword, category, userId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID || null, keyword, category, message: 'Mapping saved successfully' });
  });
});

// Bulk save mappings
router.post('/bulk', (req, res) => {
  const { mappings } = req.body;
  const userId = req.tenantId;

  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: 'Mappings must be an array' });
  }

  const query = `
    INSERT INTO product_mapping (keyword, category, user_id)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, keyword) DO UPDATE SET category = excluded.category
  `;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    const stmt = db.prepare(query);
    
    for (const mapping of mappings) {
      if (mapping.keyword && mapping.category) {
        stmt.run([mapping.keyword, mapping.category, userId]);
      }
    }
    
    stmt.finalize();
    db.run("COMMIT", (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Bulk mappings saved successfully' });
    });
  });
});

// Delete all mappings
router.delete('/all', (req, res) => {
  const userId = req.tenantId;

  db.run('DELETE FROM product_mapping WHERE user_id = ?', [userId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'All mappings deleted successfully', count: this.changes });
  });
});

// Delete a mapping
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.tenantId;

  db.run('DELETE FROM product_mapping WHERE id = ? AND user_id = ?', [id, userId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Mapping not found or not authorized' });
    }
    res.json({ message: 'Mapping deleted successfully' });
  });
});

module.exports = router;
