/**
 * migrate_tenant_isolation.js
 * Vá lỗi "đụng dữ liệu giữa các cửa hàng".
 *
 *   node migrate_tenant_isolation.js
 *
 * VẤN ĐỀ: các bảng đang đặt ràng buộc UNIQUE trên TOÀN HỆ THỐNG:
 *   - customers.phone      -> cửa hàng B không thêm được khách trùng SĐT với khách của A
 *   - products.sku         -> B không tạo được sản phẩm trùng mã với A
 *   - staff.phone          -> B không thêm được nhân viên trùng SĐT
 *   - product_mapping.keyword, pos_orders.order_code, gemini_keys.key_value, product_variants.sku
 *
 * CÁCH VÁ: chuyển thành UNIQUE theo từng cửa hàng — UNIQUE(user_id, phone), UNIQUE(user_id, sku)...
 * Ràng buộc mới LỎNG HƠN ràng buộc cũ nên mọi dữ liệu đang có đều hợp lệ, không mất dòng nào.
 *
 * An toàn khi chạy lại nhiều lần: tự bỏ qua bảng đã vá.
 * SQLite không sửa được ràng buộc trực tiếp -> phải dựng bảng mới rồi chép dữ liệu sang.
 */
const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'autotax.db');
const db = new sqlite3.Database(dbPath);

// Mỗi bảng: định nghĩa mới + danh sách cột để chép dữ liệu + dấu hiệu nhận biết "đã vá"
const PLAN = [
  {
    table: 'customers',
    daVa: /UNIQUE\s*\(\s*user_id\s*,\s*phone\s*\)/i,
    schema: `CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default_user',
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      total_spend REAL DEFAULT 0,
      tags TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, phone)
    )`,
    cols: 'id, user_id, name, phone, total_spend, tags, createdAt',
  },
  {
    table: 'products',
    daVa: /UNIQUE\s*\(\s*user_id\s*,\s*sku\s*\)/i,
    schema: `CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default_user',
      name TEXT NOT NULL,
      sku TEXT,
      price REAL NOT NULL DEFAULT 0,
      cost_price REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      category TEXT,
      image_url TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      attributes TEXT,
      UNIQUE(user_id, sku)
    )`,
    cols: 'id, user_id, name, sku, price, cost_price, stock, category, image_url, createdAt, attributes',
  },
  {
    table: 'staff',
    daVa: /UNIQUE\s*\(\s*user_id\s*,\s*username\s*\)/i,
    schema: `CREATE TABLE staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default_user',
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'Thu ngân',
      sales_total REAL DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      username TEXT,
      password_hash TEXT,
      permissions TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      UNIQUE(user_id, phone),
      UNIQUE(user_id, username)
    )`,
    cols: 'id, user_id, name, phone, role, sales_total, createdAt, username, password_hash, permissions, status',
  },
  {
    table: 'product_mapping',
    daVa: /UNIQUE\s*\(\s*user_id\s*,\s*keyword\s*\)/i,
    schema: `CREATE TABLE product_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      category TEXT NOT NULL,
      user_id TEXT DEFAULT 'default_user',
      UNIQUE(user_id, keyword)
    )`,
    cols: 'id, keyword, category, user_id',
  },
  {
    table: 'pos_orders',
    daVa: /UNIQUE\s*\(\s*user_id\s*,\s*order_code\s*\)/i,
    schema: `CREATE TABLE pos_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default_user',
      order_code TEXT NOT NULL,
      total_amount REAL NOT NULL,
      discount REAL DEFAULT 0,
      customer_name TEXT,
      customer_phone TEXT,
      payment_method TEXT DEFAULT 'cash',
      status TEXT DEFAULT 'completed',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      cancel_reason TEXT,
      UNIQUE(user_id, order_code)
    )`,
    cols: 'id, user_id, order_code, total_amount, discount, customer_name, customer_phone, payment_method, status, createdAt, cancel_reason',
  },
  {
    table: 'gemini_keys',
    daVa: /UNIQUE\s*\(\s*user_id\s*,\s*key_value\s*\)/i,
    schema: `CREATE TABLE gemini_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_value TEXT NOT NULL,
      usage_count INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      status TEXT DEFAULT 'ok',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT DEFAULT 'default_user',
      UNIQUE(user_id, key_value)
    )`,
    cols: 'id, key_value, usage_count, is_active, status, createdAt, user_id',
  },
  {
    table: 'product_variants',
    daVa: /UNIQUE\s*\(\s*product_id\s*,\s*sku\s*\)/i,
    schema: `CREATE TABLE product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      sku TEXT,
      price REAL,
      cost_price REAL,
      stock INTEGER DEFAULT 0,
      attributes_json TEXT,
      UNIQUE(product_id, sku),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )`,
    cols: 'id, product_id, sku, price, cost_price, stock, attributes_json',
  },
];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

(async () => {
  console.log('== Vá tách dữ liệu giữa các cửa hàng ==\n');

  await run('PRAGMA foreign_keys = OFF');

  for (const p of PLAN) {
    const row = await get('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?', ['table', p.table]);
    if (!row) { console.log(`  = ${p.table}: chưa có bảng, bỏ qua`); continue; }
    if (p.daVa.test(row.sql)) { console.log(`  = ${p.table}: đã vá trước đó, bỏ qua`); continue; }

    const truoc = await get(`SELECT COUNT(*) AS c FROM ${p.table}`);

    try {
      await run('BEGIN IMMEDIATE');
      await run(`DROP TABLE IF EXISTS ${p.table}__moi`);
      await run(p.schema.replace(`CREATE TABLE ${p.table}`, `CREATE TABLE ${p.table}__moi`));
      await run(`INSERT INTO ${p.table}__moi (${p.cols}) SELECT ${p.cols} FROM ${p.table}`);
      await run(`DROP TABLE ${p.table}`);
      await run(`ALTER TABLE ${p.table}__moi RENAME TO ${p.table}`);
      await run('COMMIT');

      const sau = await get(`SELECT COUNT(*) AS c FROM ${p.table}`);
      const ok = truoc.c === sau.c;
      console.log(`  ${ok ? '+' : '!'} ${p.table}: ${truoc.c} -> ${sau.c} dòng ${ok ? '(giữ nguyên đủ)' : '<<< LỆCH SỐ DÒNG!'}`);
    } catch (e) {
      await run('ROLLBACK').catch(() => {});
      console.error(`  ! ${p.table}: LỖI -> ${e.message} (bảng cũ giữ nguyên, không mất dữ liệu)`);
    }
  }

  // Kiểm tra toàn vẹn sau khi dựng lại bảng
  const kt = await get('PRAGMA integrity_check');
  console.log(`\nKiểm tra toàn vẹn CSDL: ${kt ? Object.values(kt)[0] : '?'}`);

  await run('PRAGMA foreign_keys = ON');
  console.log('\n== Hoàn tất ==');
  db.close();
})();
