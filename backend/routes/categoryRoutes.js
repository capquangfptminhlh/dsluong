const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireOwner, requireAnyPermission, writeAudit } = require('../middleware/auth');

// Danh mục sản phẩm — tách theo từng cửa hàng, hỗ trợ 2 tầng:
// Nhóm lớn (parent_id = NULL) -> danh mục con (parent_id = id nhóm lớn).
// Migration chạy idempotent để DB cũ không mất dữ liệu.
db.run('ALTER TABLE product_categories ADD COLUMN parent_id INTEGER', (err) => {
  if (err && !/duplicate column name/i.test(String(err.message || ''))) {
    console.error('[categories] add parent_id:', err.message);
  }
});
db.run(`INSERT OR IGNORE INTO product_categories (user_id, name)
        SELECT DISTINCT user_id, TRIM(category)
        FROM products
        WHERE category IS NOT NULL AND TRIM(category) <> ''`, (err) => {
  if (err) console.error('[categories] sync existing product categories:', err.message);
});

router.use(requireAuth);
router.use(requireAnyPermission('categories', 'products', 'pos'));

function getCategory(req, id, callback) {
  db.get('SELECT id, name, parent_id FROM product_categories WHERE id = ? AND user_id = ?', [id, req.tenantId], callback);
}

function validateParent(req, parentId, currentId, callback) {
  if (!parentId) return callback(null, null);
  const parsed = Number(parentId);
  if (!Number.isInteger(parsed) || parsed <= 0) return callback(new Error('Nhóm lớn không hợp lệ'));
  if (currentId && Number(currentId) === parsed) return callback(new Error('Danh mục không thể thuộc chính nó'));
  getCategory(req, parsed, (err, parent) => {
    if (err) return callback(err);
    if (!parent) return callback(new Error('Không tìm thấy nhóm lớn'));
    if (parent.parent_id) return callback(new Error('Chỉ hỗ trợ 2 tầng: Nhóm lớn → Danh mục con'));
    callback(null, parent);
  });
}

// Danh sách đầy đủ để màn hình Danh mục và màn hình Thêm hàng hóa dùng chung.
router.get('/', (req, res) => {
  db.all(
    `SELECT c.id, c.name, c.description, c.status, c.parent_id, c.createdAt,
  p.name AS parent_name,
  (SELECT COUNT(*) FROM product_categories cc
    WHERE cc.user_id = c.user_id AND cc.parent_id = c.id) AS child_count,
  CASE WHEN c.parent_id IS NULL THEN
    (SELECT COUNT(*) FROM products pr
      WHERE pr.user_id = c.user_id
        AND (pr.category = c.name OR pr.category IN (
          SELECT ch.name FROM product_categories ch
          WHERE ch.user_id = c.user_id AND ch.parent_id = c.id
        )))
  ELSE
    (SELECT COUNT(*) FROM products pr
      WHERE pr.user_id = c.user_id AND pr.category = c.name)
  END AS product_count
     FROM product_categories c
     LEFT JOIN product_categories p ON p.id = c.parent_id AND p.user_id = c.user_id
     WHERE c.user_id = ?
     ORDER BY CASE WHEN c.parent_id IS NULL THEN c.name ELSE COALESCE(p.name, c.name) END ASC,
    CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END ASC,
    c.name ASC`,
    [req.tenantId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/', requireOwner, (req, res) => {
  const { name, description, parent_id } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên danh mục' });

  validateParent(req, parent_id, null, (parentErr, parent) => {
    if (parentErr) return res.status(400).json({ error: parentErr.message });
    db.run(
      'INSERT INTO product_categories (user_id, name, description, parent_id) VALUES (?, ?, ?, ?)',
      [req.tenantId, String(name).trim(), description || null, parent ? parent.id : null],
      function onInsert(err) {
        if (err) {
if (/UNIQUE/i.test(String(err.message))) return res.status(409).json({ error: 'Danh mục này đã tồn tại' });
return res.status(500).json({ error: err.message });
        }
        writeAudit(req, { action: 'category.create', target: String(name).trim(), detail: { parent_id: parent ? parent.id : null } });
        res.json({ success: true, id: this.lastID });
      }
    );
  });
});

router.put('/:id', requireOwner, (req, res) => {
  const { name, description, status, parent_id } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên danh mục' });

  getCategory(req, req.params.id, (err, current) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!current) return res.status(404).json({ error: 'Không tìm thấy danh mục' });

    validateParent(req, parent_id, req.params.id, (parentErr, parent) => {
      if (parentErr) return res.status(400).json({ error: parentErr.message });
      const nextParentId = parent ? parent.id : null;

      // Một nhóm đang có danh mục con không được biến thành danh mục con của nhóm khác.
      db.get('SELECT COUNT(*) AS c FROM product_categories WHERE user_id = ? AND parent_id = ?', [req.tenantId, req.params.id], (childErr, childRow) => {
        if (childErr) return res.status(500).json({ error: childErr.message });
        if (Number(childRow?.c || 0) > 0 && nextParentId) {
return res.status(409).json({ error: 'Nhóm lớn này đang có danh mục con. Hãy chuyển các danh mục con trước.' });
        }

        db.run(
'UPDATE product_categories SET name = ?, description = ?, status = ?, parent_id = ? WHERE id = ? AND user_id = ?',
[String(name).trim(), description || null, status || 'active', nextParentId, req.params.id, req.tenantId],
function onUpdate(err2) {
  if (err2) {
    if (/UNIQUE/i.test(String(err2.message))) return res.status(409).json({ error: 'Đã có danh mục trùng tên' });
    return res.status(500).json({ error: err2.message });
  }
  if (current.name !== String(name).trim()) {
    db.run('UPDATE products SET category = ? WHERE category = ? AND user_id = ?',
      [String(name).trim(), current.name, req.tenantId]);
  }
  writeAudit(req, { action: 'category.update', target: String(req.params.id), detail: { parent_id: nextParentId } });
  res.json({ success: true });
}
        );
      });
    });
  });
});

router.delete('/:id', requireOwner, (req, res) => {
  getCategory(req, req.params.id, (err, category) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!category) return res.status(404).json({ error: 'Không tìm thấy danh mục' });

    db.get('SELECT COUNT(*) AS c FROM product_categories WHERE user_id = ? AND parent_id = ?', [req.tenantId, req.params.id], (childErr, childRow) => {
      if (childErr) return res.status(500).json({ error: childErr.message });
      if (Number(childRow?.c || 0) > 0) {
        return res.status(409).json({ error: `Nhóm này còn ${childRow.c} danh mục con. Hãy chuyển hoặc xóa danh mục con trước.` });
      }
      db.get('SELECT COUNT(*) AS c FROM products WHERE category = ? AND user_id = ?', [category.name, req.tenantId], (prodErr, row) => {
        if (prodErr) return res.status(500).json({ error: prodErr.message });
        if (Number(row?.c || 0) > 0) {
return res.status(409).json({ error: `Còn ${row.c} sản phẩm trong danh mục này. Hãy chuyển chúng sang danh mục khác trước.` });
        }
        db.run('DELETE FROM product_categories WHERE id = ? AND user_id = ?', [req.params.id, req.tenantId], function onDelete(err3) {
if (err3) return res.status(500).json({ error: err3.message });
writeAudit(req, { action: 'category.delete', target: category.name });
res.json({ success: true });
        });
      });
    });
  });
});

module.exports = router;
