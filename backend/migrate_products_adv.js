/**
 * migrate_products_adv.js — Hàng hóa chuyên sâu.
 *   node migrate_products_adv.js
 *
 * Thêm:
 *   1) Bảng giá nhiều mức   : giá lẻ / giá sỉ / giá VIP, gán mức giá cho khách
 *   2) Đơn vị quy đổi       : thùng ↔ lốc ↔ lon (quy về đơn vị gốc để trừ kho)
 *   3) Lô & hạn sử dụng     : theo dõi từng lô nhập, cảnh báo sắp hết hạn
 *
 * An toàn khi chạy lại nhiều lần.
 */
const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, 'autotax.db'));

function run(sql, label, params = []) {
  return new Promise((resolve) => {
    db.run(sql, params, function (e) {
      if (e) console.error(`  ! ${label}: ${e.message}`);
      else console.log(`  + ${label}`);
      resolve(this);
    });
  });
}
function addColumn(table, colDef, colName) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, (err, cols) => {
      if (err || !cols.length) { console.log(`  = ${table}: bỏ qua`); return resolve(); }
      if (cols.some((c) => c.name === colName)) { console.log(`  = ${table}.${colName} đã có`); return resolve(); }
      db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`, (e) => {
        if (e) console.error(`  ! ${table}.${colName}: ${e.message}`);
        else console.log(`  + ${table}.${colName}`);
        resolve();
      });
    });
  });
}
const all = (sql, p = []) => new Promise((res) => db.all(sql, p, (e, r) => res(e ? [] : r)));

(async () => {
  console.log('== Hàng hóa chuyên sâu ==\n');

  console.log('[1] Bảng giá nhiều mức:');
  await run(`
    CREATE TABLE IF NOT EXISTS price_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )`, 'price_levels');
  await run(`
    CREATE TABLE IF NOT EXISTS product_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      level_id INTEGER NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      UNIQUE(product_id, level_id)
    )`, 'product_prices');
  await addColumn('customers', 'price_level_id INTEGER', 'price_level_id');

  console.log('\n[2] Đơn vị quy đổi:');
  await run(`
    CREATE TABLE IF NOT EXISTS product_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      ratio REAL NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0,
      is_base INTEGER DEFAULT 0,
      UNIQUE(product_id, name)
    )`, 'product_units');
  await addColumn('products', "base_unit TEXT DEFAULT 'Cái'", 'base_unit');
  await addColumn('pos_order_items', 'unit_name TEXT', 'unit_name');
  await addColumn('pos_order_items', 'unit_ratio REAL DEFAULT 1', 'unit_ratio');

  console.log('\n[3] Lô & hạn sử dụng:');
  await run(`
    CREATE TABLE IF NOT EXISTS product_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      batch_code TEXT,
      expiry_date TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      note TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, 'product_batches');
  await run(`CREATE INDEX IF NOT EXISTS idx_batch_prod ON product_batches(user_id, product_id, expiry_date)`, 'index product_batches');
  await addColumn('products', 'track_batch INTEGER DEFAULT 0', 'track_batch');

  console.log('\n[4] Tạo mức giá mặc định cho từng cửa hàng:');
  const users = await all('SELECT phone FROM users');
  for (const u of users) {
    const co = await all('SELECT id FROM price_levels WHERE user_id = ?', [u.phone]);
    if (co.length) { console.log(`  = ${u.phone}: đã có ${co.length} mức giá`); continue; }
    await run('INSERT INTO price_levels (user_id, name, is_default) VALUES (?, ?, 1)', `${u.phone}: Giá lẻ (mặc định)`, [u.phone, 'Giá lẻ']);
    await run('INSERT INTO price_levels (user_id, name, is_default) VALUES (?, ?, 0)', `${u.phone}: Giá sỉ`, [u.phone, 'Giá sỉ']);
    await run('INSERT INTO price_levels (user_id, name, is_default) VALUES (?, ?, 0)', `${u.phone}: Giá VIP`, [u.phone, 'Giá VIP']);
  }

  console.log('\n== Hoàn tất ==');
  db.close();
})();
