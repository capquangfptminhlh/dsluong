/**
 * migrate_shared_tables.js
 * Tách 4 bảng còn dùng chung giữa mọi cửa hàng + tạo bảng danh mục sản phẩm.
 *
 *   node migrate_shared_tables.js
 *
 * VẤN ĐỀ:
 *   - workflows            -> kịch bản tự động của cửa hàng A chạy cho đơn của cửa hàng B
 *   - omnichannel_channels -> kênh bán hàng (và API key sàn) dùng chung
 *   - omnichannel_orders   -> đơn từ sàn không biết của ai
 *   - customer_tiers       -> hạng thẻ khách hàng dùng chung
 *   - chưa có bảng danh mục sản phẩm (trang "Danh mục" đang hiện số liệu giả)
 *
 * An toàn khi chạy lại nhiều lần.
 */
const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');

const db = new sqlite3.Database(path.resolve(__dirname, 'autotax.db'));

function addColumn(table, colDef, colName) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, (err, cols) => {
      if (err) { console.error(`  ! ${table}: ${err.message}`); return resolve(); }
      if (!cols.length) { console.log(`  = ${table}: chưa có bảng, bỏ qua`); return resolve(); }
      if (cols.some((c) => c.name === colName)) { console.log(`  = ${table}.${colName} đã có, bỏ qua`); return resolve(); }
      db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`, (e) => {
        if (e) console.error(`  ! ${table}.${colName}: ${e.message}`);
        else console.log(`  + ${table}.${colName} đã thêm`);
        resolve();
      });
    });
  });
}

function run(sql, label, params = []) {
  return new Promise((resolve) => {
    db.run(sql, params, function (e) {
      if (e) console.error(`  ! ${label}: ${e.message}`);
      else console.log(`  + ${label}`);
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve) => db.all(sql, params, (e, r) => resolve(e ? [] : r)));
}

(async () => {
  console.log('== Tách các bảng dùng chung ==\n');

  console.log('[1] Thêm cột cửa hàng:');
  await addColumn('workflows', "user_id TEXT DEFAULT 'default_user'", 'user_id');
  await addColumn('omnichannel_channels', "user_id TEXT DEFAULT 'default_user'", 'user_id');
  await addColumn('omnichannel_orders', "user_id TEXT DEFAULT 'default_user'", 'user_id');
  await addColumn('customer_tiers', "user_id TEXT DEFAULT 'default_user'", 'user_id');

  console.log('\n[2] Bảng danh mục sản phẩm (cho trang "Danh mục"):');
  await run(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )
  `, 'product_categories');

  // Dựng danh mục từ dữ liệu sản phẩm đang có, để trang Danh mục hiện đúng ngay
  console.log('\n[3] Dựng danh mục từ sản phẩm đang có:');
  const rows = await all(
    `SELECT user_id, category, COUNT(*) AS soLuong FROM products
     WHERE category IS NOT NULL AND TRIM(category) <> ''
     GROUP BY user_id, category`
  );
  if (!rows.length) console.log('  = chưa có sản phẩm nào có danh mục, bỏ qua');
  for (const r of rows) {
    await new Promise((resolve) => {
      db.run(
        `INSERT INTO product_categories (user_id, name, description)
         VALUES (?, ?, ?) ON CONFLICT(user_id, name) DO NOTHING`,
        [r.user_id, r.category, `Tự tạo từ ${r.soLuong} sản phẩm đang có`],
        function (e) {
          if (e) console.error(`  ! ${r.category}: ${e.message}`);
          else if (this.changes) console.log(`  + "${r.category}" (${r.soLuong} sản phẩm)`);
          resolve();
        }
      );
    });
  }

  // Hạng thẻ mặc định cho mỗi cửa hàng chưa có
  console.log('\n[4] Hạng thẻ khách hàng mặc định cho từng cửa hàng:');
  const users = await all('SELECT phone FROM users');
  const MAC_DINH = [
    ['Đồng', 0, 0, '#CD7F32'],
    ['Bạc', 500, 3, '#C0C0C0'],
    ['Vàng', 2000, 5, '#FFD700'],
    ['Kim cương', 5000, 10, '#B9F2FF'],
  ];
  for (const u of users) {
    const co = await all('SELECT id FROM customer_tiers WHERE user_id = ?', [u.phone]);
    if (co.length) { console.log(`  = ${u.phone}: đã có ${co.length} hạng, bỏ qua`); continue; }
    for (const [name, minP, disc, color] of MAC_DINH) {
      await new Promise((resolve) =>
        db.run('INSERT INTO customer_tiers (user_id, name, min_points, discount_percent, color) VALUES (?, ?, ?, ?, ?)',
          [u.phone, name, minP, disc, color], resolve));
    }
    console.log(`  + ${u.phone}: tạo 4 hạng mặc định`);
  }

  console.log('\n== Hoàn tất ==');
  db.close();
})();
