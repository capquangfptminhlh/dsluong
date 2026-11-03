const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireOwner, requireWebhookSecret } = require('../middleware/auth');
const { encryptSettingValue } = require('../utils/secretSettings');

const SUPPORTED_PLATFORMS = new Set(['Shopee', 'TikTok Shop', 'Lazada']);

// Kênh bán hàng + API key của sàn: tách theo từng cửa hàng.
// LƯU Ý: /webhook/order công khai cho sàn gọi vào nên không dùng router.use ở đây.

// Get all channels — chứa cấu hình sàn nên chỉ chủ cửa hàng.
// Trả thêm số đơn thật đã nhận qua webhook thay vì để UI hiển thị số giả.
router.get('/channels', requireAuth, requireOwner, (req, res) => {
  db.all(
    `SELECT c.*,
            (SELECT COUNT(*) FROM omnichannel_orders o
             WHERE o.user_id = c.user_id AND o.channel_id = c.id) AS order_count
     FROM omnichannel_channels c
     WHERE c.user_id = ?
     ORDER BY c.id DESC`,
    [req.tenantId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

// Add new channel. Lưu cấu hình KHÔNG đồng nghĩa đã xác minh được API của sàn,
// vì AutoTax hiện chưa có OAuth/pull-sync trực tiếp cho Shopee/TikTok/Lazada.
router.post('/channels', requireAuth, requireOwner, (req, res) => {
  const { platform, app_key, app_secret, shop_id } = req.body;
  if (!SUPPORTED_PLATFORMS.has(platform)) return res.status(400).json({ error: 'Nền tảng chưa được hỗ trợ' });
  if (!app_key || !app_secret || !shop_id) return res.status(400).json({ error: 'Thiếu App Key, App Secret hoặc Shop ID' });

  let protectedSecret;
  try {
    protectedSecret = encryptSettingValue(app_secret);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }

  db.get(
    'SELECT id FROM omnichannel_channels WHERE user_id = ? AND platform = ? LIMIT 1',
    [req.tenantId, platform],
    (findErr, existing) => {
      if (findErr) return res.status(500).json({ error: findErr.message });
      if (existing) return res.status(409).json({ error: 'Kênh này đã được cấu hình cho cửa hàng' });

      db.run(
        `INSERT INTO omnichannel_channels (user_id, platform, status) VALUES (?, ?, 'configured')`,
        [req.tenantId, platform],
        function onInsert(err) {
          if (err) return res.status(500).json({ error: err.message });

          // API key lưu tenant-scoped trong shop_settings. Không trả secret qua API channels.
          const prefix = platform.toLowerCase().replace(/\s+/g, '_');
          const stmt = db.prepare(`INSERT INTO shop_settings (user_id, key, value) VALUES (?, ?, ?)
                                   ON CONFLICT(user_id, key) DO UPDATE SET value = ?`);
          stmt.run(req.tenantId, `${prefix}_app_key`, app_key, app_key);
          stmt.run(req.tenantId, `${prefix}_app_secret`, protectedSecret, protectedSecret);
          stmt.run(req.tenantId, `${prefix}_shop_id`, shop_id, shop_id);
          stmt.finalize();

          res.json({ success: true, id: this.lastID, status: 'configured' });
        },
      );
    },
  );
});

// Delete channel
router.delete('/channels/:id', requireAuth, requireOwner, (req, res) => {
  db.run(
    'DELETE FROM omnichannel_channels WHERE id = ? AND user_id = ?',
    [req.params.id, req.tenantId],
    function onDelete(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy kênh' });
      res.json({ success: true });
    },
  );
});

function rollbackWith(res, status, message) {
  db.run('ROLLBACK', () => res.status(status).json({ error: message }));
}

function resolveWebhookItems(userId, items, done) {
  const resolved = [];
  let index = 0;

  const next = () => {
    if (index >= items.length) return done(null, resolved);
    const raw = items[index++];
    const quantity = Number(raw?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return done(new Error('Số lượng sản phẩm không hợp lệ'));

    const hasId = raw?.product_id !== undefined && raw?.product_id !== null && raw?.product_id !== '';
    const hasSku = typeof raw?.sku === 'string' && raw.sku.trim() !== '';
    if (!hasId && !hasSku) return done(new Error('Mỗi dòng đơn phải có product_id hoặc sku'));

    const sql = hasId
      ? 'SELECT id, sku, name, stock FROM products WHERE id = ? AND user_id = ? LIMIT 1'
      : 'SELECT id, sku, name, stock FROM products WHERE sku = ? AND user_id = ? LIMIT 1';
    const key = hasId ? raw.product_id : raw.sku.trim();

    db.get(sql, [key, userId], (err, product) => {
      if (err) return done(err);
      if (!product) return done(new Error(`Không tìm thấy sản phẩm ${hasId ? `ID ${key}` : `SKU ${key}`}`));
      if (Number(product.stock || 0) < quantity) return done(Object.assign(new Error(`Không đủ tồn kho cho ${product.sku || product.name}`), { status: 409 }));
      resolved.push({ product_id: product.id, quantity });
      next();
    });
  };

  next();
}

// Nhận đơn từ webhook đã xác thực.
// Idempotent theo user + channel + external_order_id và chỉ trừ đúng product_id/SKU của tenant.
router.post('/webhook/order', requireWebhookSecret, (req, res) => {
  const { platform, order_id, total_amount, items, user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'Thiếu user_id (cửa hàng nhận đơn)' });
  if (!platform || !order_id) return res.status(400).json({ error: 'Thiếu platform hoặc order_id' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Đơn hàng phải có ít nhất một sản phẩm' });

  db.get(
    'SELECT id FROM omnichannel_channels WHERE platform = ? AND user_id = ? LIMIT 1',
    [platform, user_id],
    (channelErr, channel) => {
      if (channelErr) return res.status(500).json({ error: channelErr.message });
      if (!channel) return res.status(404).json({ error: 'Cửa hàng chưa cấu hình kênh này' });

      db.get(
        `SELECT id FROM omnichannel_orders
         WHERE user_id = ? AND channel_id = ? AND external_order_id = ? LIMIT 1`,
        [user_id, channel.id, String(order_id)],
        (duplicateErr, duplicate) => {
          if (duplicateErr) return res.status(500).json({ error: duplicateErr.message });
          if (duplicate) return res.json({ success: true, duplicate: true, message: `Order ${order_id} already synced` });

          resolveWebhookItems(user_id, items, (resolveErr, resolvedItems) => {
            if (resolveErr) return res.status(resolveErr.status || 400).json({ error: resolveErr.message });

            db.serialize(() => {
              db.run('BEGIN TRANSACTION');
              db.run(
                `INSERT INTO omnichannel_orders (user_id, channel_id, external_order_id, total_amount, status)
                 VALUES (?, ?, ?, ?, 'COMPLETED')`,
                [user_id, channel.id, String(order_id), Number(total_amount) || 0],
                function onOrderInsert(insertErr) {
                  if (insertErr) return rollbackWith(res, 500, insertErr.message);

                  let itemIndex = 0;
                  const reduceNext = () => {
                    if (itemIndex >= resolvedItems.length) {
                      return db.run('COMMIT', (commitErr) => {
                        if (commitErr) return rollbackWith(res, 500, commitErr.message);
                        res.json({ success: true, message: `Synced order ${order_id} from ${platform}` });
                      });
                    }

                    const item = resolvedItems[itemIndex++];
                    db.run(
                      `UPDATE products
                       SET stock = stock - ?
                       WHERE id = ? AND user_id = ? AND stock >= ?`,
                      [item.quantity, item.product_id, user_id, item.quantity],
                      function onStockUpdate(stockErr) {
                        if (stockErr) return rollbackWith(res, 500, stockErr.message);
                        if (this.changes !== 1) return rollbackWith(res, 409, 'Tồn kho đã thay đổi, không thể đồng bộ đơn an toàn');
                        reduceNext();
                      },
                    );
                  };

                  reduceNext();
                },
              );
            });
          });
        },
      );
    },
  );
});

module.exports = router;
