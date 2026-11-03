/**
 * migrate_security.js
 * Chạy MỘT LẦN để nâng cấp DB hiện tại lên chuẩn bảo mật.
 *   node migrate_security.js
 *
 * An toàn khi chạy lại nhiều lần (idempotent): bỏ qua cột/bảng đã tồn tại.
 */
const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'autotax.db');
const db = new sqlite3.Database(dbPath);

// Helper: thêm cột nếu chưa có (SQLite không có "ADD COLUMN IF NOT EXISTS")
function addColumn(table, colDef, colName) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, (err, cols) => {
      if (err) { console.error(`  ! ${table}: ${err.message}`); return resolve(); }
      const exists = cols.some(c => c.name === colName);
      if (exists) { console.log(`  = ${table}.${colName} đã có, bỏ qua`); return resolve(); }
      db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`, (e) => {
        if (e) console.error(`  ! ${table}.${colName}: ${e.message}`);
        else console.log(`  + ${table}.${colName} đã thêm`);
        resolve();
      });
    });
  });
}

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
  console.log('== Nâng cấp bảo mật AutoTax ==');

  // 1. Bảng users (chủ cửa hàng / tenant): thêm mật khẩu, vai trò, trạng thái
  console.log('\n[1] Bảng users:');
  await addColumn('users', "password_hash TEXT", 'password_hash');
  await addColumn('users', "role TEXT DEFAULT 'owner'", 'role');       // 'owner' | 'superadmin'
  await addColumn('users', "status TEXT DEFAULT 'active'", 'status');  // 'active' | 'locked'

  // 2. Bảng staff (nhân viên trong cửa hàng): thêm mật khẩu + quyền theo module
  console.log('\n[2] Bảng staff:');
  await addColumn('staff', "username TEXT", 'username');
  await addColumn('staff', "password_hash TEXT", 'password_hash');
  await addColumn('staff', "permissions TEXT DEFAULT '[]'", 'permissions'); // JSON mảng module
  await addColumn('staff', "status TEXT DEFAULT 'active'", 'status');

  // 3. Vá rò tenant: debts chưa có user_id -> mọi cửa hàng dùng chung công nợ
  console.log('\n[3] Vá rò tenant:');
  await addColumn('debts', "user_id TEXT DEFAULT 'default_user'", 'user_id');
  await addColumn('cash_flows', "user_id TEXT DEFAULT 'default_user'", 'user_id');
  await addColumn('inventory_checks', "user_id TEXT DEFAULT 'default_user'", 'user_id');
  await addColumn('inventory_transfers', "user_id TEXT DEFAULT 'default_user'", 'user_id');
  await addColumn('promotions', "user_id TEXT DEFAULT 'default_user'", 'user_id');
  await addColumn('gemini_keys', "user_id TEXT DEFAULT 'default_user'", 'user_id');
  // system_settings dùng chung -> chuyển sang có user_id (bảng mới, giữ bảng cũ làm mặc định)
  await run(`
    CREATE TABLE IF NOT EXISTS shop_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )
  `, 'shop_settings (settings tách theo cửa hàng)');

  // 4. Nhật ký thao tác (audit log) — chống thất thoát
  console.log('\n[4] Audit log:');
  await run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,           -- cửa hàng nào
      actor_type TEXT NOT NULL,        -- 'owner' | 'staff'
      actor_id TEXT,                   -- id nhân viên (nếu là staff)
      actor_name TEXT,
      action TEXT NOT NULL,            -- 'order.void','product.price_change','user.delete'...
      target TEXT,                     -- đối tượng bị tác động (mã đơn, id sp...)
      detail TEXT,                     -- JSON: giá trị cũ/mới...
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, 'audit_log');
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC)`, 'index audit_log');

  console.log('\n== Hoàn tất. Nhớ: cài thêm 2 gói -> npm i bcryptjs jsonwebtoken ==');
  db.close();
})();
