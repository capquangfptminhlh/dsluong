/**
 * migrate_returns_shift.js — Thêm module Trả hàng & Chốt ca thu ngân.
 *   node migrate_returns_shift.js
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
  console.log('== Thêm module Trả hàng & Chốt ca ==\n');

  await run(`
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      order_id INTEGER,
      order_code TEXT,
      total_refund REAL NOT NULL DEFAULT 0,
      reason TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, code)
    )
  `, 'returns');

  await run(`
    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL DEFAULT 0
    )
  `, 'return_items');

  await run(`
    CREATE TABLE IF NOT EXISTS cashier_shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      actor_name TEXT,
      opening_cash REAL NOT NULL DEFAULT 0,
      closing_cash REAL,
      expected_cash REAL,
      difference REAL,
      cash_sales REAL DEFAULT 0,
      cash_out REAL DEFAULT 0,
      note TEXT,
      status TEXT DEFAULT 'open',
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME
    )
  `, 'cashier_shifts');

  await run(`CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id, createdAt DESC)`, 'index returns');
  await run(`CREATE INDEX IF NOT EXISTS idx_shift_user ON cashier_shifts(user_id, status)`, 'index cashier_shifts');

  console.log('\n== Hoàn tất ==');
  db.close();
})();
