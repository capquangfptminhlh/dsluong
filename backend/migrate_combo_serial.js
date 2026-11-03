/**
 * migrate_combo_serial.js — Combo, Serial/IMEI, Bảo hành.
 *   node migrate_combo_serial.js
 * An toàn khi chạy lại nhiều lần.
 */
const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, 'autotax.db'));

function run(sql, label) {
  return new Promise((resolve) => {
    db.run(sql, (e) => {
      if (e) console.error(`  ! ${label}: ${e.message}`);
      else console.log(`  + ${label}`);
      resolve();
    });
  });
}
function addColumn(table, colDef, colName) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, (err, cols) => {
      if (err || !cols.length) return resolve();
      if (cols.some((c) => c.name === colName)) { console.log(`  = ${table}.${colName} đã có`); return resolve(); }
      db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`, (e) => {
        if (e) console.error(`  ! ${table}.${colName}: ${e.message}`);
        else console.log(`  + ${table}.${colName}`);
        resolve();
      });
    });
  });
}

(async () => {
  console.log('== Combo, Serial/IMEI, Bảo hành ==\n');

  console.log('[1] Combo (bán theo bộ):');
  await run(`
    CREATE TABLE IF NOT EXISTS combos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      price REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )`, 'combos');
  await run(`
    CREATE TABLE IF NOT EXISTS combo_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      combo_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 1
    )`, 'combo_items');

  console.log('\n[2] Serial / IMEI:');
  await run(`
    CREATE TABLE IF NOT EXISTS product_serials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      serial TEXT NOT NULL,
      status TEXT DEFAULT 'in_stock',
      order_code TEXT,
      sold_at DATETIME,
      note TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, serial)
    )`, 'product_serials');
  await run(`CREATE INDEX IF NOT EXISTS idx_serial_prod ON product_serials(user_id, product_id, status)`, 'index product_serials');
  await addColumn('products', 'track_serial INTEGER DEFAULT 0', 'track_serial');

  console.log('\n[3] Bảo hành:');
  await run(`
    CREATE TABLE IF NOT EXISTS warranties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      order_code TEXT,
      product_id INTEGER,
      product_name TEXT,
      serial TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      months INTEGER DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      note TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, 'warranties');
  await run(`CREATE INDEX IF NOT EXISTS idx_wr_user ON warranties(user_id, end_date)`, 'index warranties');
  await addColumn('products', 'warranty_months INTEGER DEFAULT 0', 'warranty_months');

  console.log('\n== Hoàn tất ==');
  db.close();
})();
