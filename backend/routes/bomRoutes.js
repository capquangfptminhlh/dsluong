const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Get all BOMs (chỉ của cửa hàng hiện tại)
router.get('/', (req, res) => {
  db.all(`
    SELECT
      b.id,
      b.product_id,
      p1.name as product_name,
      b.material_product_id,
      p2.name as material_name,
      b.quantity
    FROM product_bom b
    JOIN products p1 ON b.product_id = p1.id
    JOIN products p2 ON b.material_product_id = p2.id
    WHERE p1.user_id = ?
    ORDER BY p1.name ASC
  `, [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create BOM rule — cả 2 sản phẩm phải thuộc cửa hàng hiện tại
router.post('/', (req, res) => {
  const { product_id, material_product_id, quantity } = req.body;
  db.run(`INSERT INTO product_bom (product_id, material_product_id, quantity)
          SELECT ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND user_id = ?)
            AND EXISTS (SELECT 1 FROM products WHERE id = ? AND user_id = ?)`,
    [product_id, material_product_id, quantity, product_id, req.tenantId, material_product_id, req.tenantId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Sản phẩm không thuộc cửa hàng của bạn' });
      res.json({ success: true, id: this.lastID });
  });
});

module.exports = router;
