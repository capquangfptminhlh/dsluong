/**
 * migrate_purchase.js — Thêm module Nhập hàng & Nhà cung cấp.
 *
 *   node migrate_purchase.js
 *
 * Tạo 3 bảng (tách theo từng cửa hàng):
 *   - suppliers            : nhà cung cấp
 *   - purchase_orders      : phiếu nhập kho
 *   - purchase_order_items : chi tiết mặt hàng trong phiếu nhập
 *
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

(async () => {
  console.log('== Thêm module Nhập hàng & Nhà cung cấp ==\n');

  await run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      tax_code TEXT,
      note TEXT,
      total_purchased REAL DEFAULT 0,
      total_debt REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, phone)
    )
  `, 'suppliers');

  await run(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      supplier_id INTEGER,
      supplier_name TEXT,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'received',
      note TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, code)
    )
  `, 'purchase_orders');

  await run(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT,
      quantity INTEGER NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0
    )
  `, 'purchase_order_items');

  await run(`CREATE INDEX IF NOT EXISTS idx_po_user ON purchase_orders(user_id, createdAt DESC)`, 'index purchase_orders');
  await run(`CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(po_id)`, 'index purchase_order_items');

  console.log('\n== Hoàn tất ==');
  db.close();
})();
