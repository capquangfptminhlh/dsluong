/**
 * migrate_branches.js — Nhiều chi nhánh/kho, Đặt hàng NCC, Trả hàng NCC.
 *   node migrate_branches.js
 *
 * CÁCH LÀM AN TOÀN với dữ liệu đang có:
 *   - Mỗi cửa hàng được tạo sẵn "Chi nhánh chính"
 *   - Toàn bộ tồn kho hiện tại chuyển vào chi nhánh chính
 *   - Cột products.stock GIỮ NGUYÊN vai trò "tổng tồn tất cả chi nhánh"
 *     -> mọi màn hình cũ vẫn chạy đúng, không phải sửa lại
 *
 * An toàn khi chạy lại nhiều lần.
 */
const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, 'autotax.db'));

const run = (sql, p = []) => new Promise((res) => db.run(sql, p, function (e) {
  if (e) console.error('  ! ' + e.message);
  res(this);
}));
const all = (sql, p = []) => new Promise((res) => db.all(sql, p, (e, r) => res(e ? [] : r)));
const get = (sql, p = []) => new Promise((res) => db.get(sql, p, (e, r) => res(e ? null : r)));

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
  console.log('== Chi nhánh / Kho · Đặt hàng NCC · Trả hàng NCC ==\n');

  console.log('[1] Bảng chi nhánh:');
  await run(`CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      is_default INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )`);
  console.log('  + branches');

  await run(`CREATE TABLE IF NOT EXISTS branch_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      stock REAL NOT NULL DEFAULT 0,
      UNIQUE(branch_id, product_id)
    )`);
  console.log('  + branch_stock');
  await run(`CREATE INDEX IF NOT EXISTS idx_bs ON branch_stock(product_id, branch_id)`);

  console.log('\n[2] Gắn chi nhánh vào chứng từ:');
  await addColumn('pos_orders', 'branch_id INTEGER', 'branch_id');
  await addColumn('purchase_orders', 'branch_id INTEGER', 'branch_id');
  await addColumn('inventory_logs', 'branch_id INTEGER', 'branch_id');
  await addColumn('staff', 'branch_id INTEGER', 'branch_id');

  console.log('\n[3] Đặt hàng nhà cung cấp:');
  await run(`CREATE TABLE IF NOT EXISTS purchase_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      supplier_id INTEGER,
      supplier_name TEXT,
      branch_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'ordered',
      expected_date TEXT,
      note TEXT,
      po_id INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, code)
    )`);
  console.log('  + purchase_requests');
  await run(`CREATE TABLE IF NOT EXISTS purchase_request_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0
    )`);
  console.log('  + purchase_request_items');

  console.log('\n[4] Trả hàng nhà cung cấp:');
  await run(`CREATE TABLE IF NOT EXISTS supplier_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      supplier_id INTEGER,
      supplier_name TEXT,
      branch_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0,
      reason TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, code)
    )`);
  console.log('  + supplier_returns');
  await run(`CREATE TABLE IF NOT EXISTS supplier_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0
    )`);
  console.log('  + supplier_return_items');

  console.log('\n[5] Tạo chi nhánh chính & chuyển tồn kho hiện có:');
  const users = await all('SELECT phone FROM users');
  for (const u of users) {
    let cn = await get('SELECT * FROM branches WHERE user_id = ? AND is_default = 1', [u.phone]);
    if (!cn) {
      const r = await run('INSERT INTO branches (user_id, name, is_default) VALUES (?, ?, 1)', [u.phone, 'Chi nhánh chính']);
      cn = { id: r.lastID };
      console.log(`  + ${u.phone}: tạo "Chi nhánh chính"`);
    } else {
      console.log(`  = ${u.phone}: đã có chi nhánh chính`);
    }

    // Chuyển tồn kho hiện tại vào chi nhánh chính (chỉ làm với sản phẩm chưa có dòng nào)
    const sp = await all(
      `SELECT p.id, p.stock FROM products p
       WHERE p.user_id = ?
         AND NOT EXISTS (SELECT 1 FROM branch_stock bs WHERE bs.product_id = p.id)`,
      [u.phone]
    );
    for (const s of sp) {
      await run('INSERT INTO branch_stock (branch_id, product_id, stock) VALUES (?, ?, ?)',
        [cn.id, s.id, s.stock || 0]);
    }
    if (sp.length) console.log(`    -> chuyển tồn kho ${sp.length} sản phẩm vào chi nhánh chính`);
  }

  console.log('\n[6] Gắn chi nhánh mặc định cho chứng từ cũ:');
  for (const u of users) {
    const cn = await get('SELECT id FROM branches WHERE user_id = ? AND is_default = 1', [u.phone]);
    if (!cn) continue;
    const r1 = await run('UPDATE pos_orders SET branch_id = ? WHERE user_id = ? AND branch_id IS NULL', [cn.id, u.phone]);
    const r2 = await run('UPDATE purchase_orders SET branch_id = ? WHERE user_id = ? AND branch_id IS NULL', [cn.id, u.phone]);
    const r3 = await run('UPDATE inventory_logs SET branch_id = ? WHERE user_id = ? AND branch_id IS NULL', [cn.id, u.phone]);
    console.log(`  + ${u.phone}: đơn ${r1.changes}, phiếu nhập ${r2.changes}, nhật ký kho ${r3.changes}`);
  }

  // Kiểm tra khớp: tổng tồn chi nhánh phải bằng products.stock
  console.log('\n[7] Kiểm tra khớp tồn kho:');
  const lech = await all(`
    SELECT p.id, p.name, p.stock, COALESCE(SUM(bs.stock), 0) AS tong_cn
    FROM products p LEFT JOIN branch_stock bs ON bs.product_id = p.id
    GROUP BY p.id HAVING p.stock <> COALESCE(SUM(bs.stock), 0)
  `);
  if (lech.length === 0) console.log('  + Khớp 100%');
  else {
    console.log(`  ! Lệch ${lech.length} sản phẩm — đang tự sửa...`);
    for (const l of lech) {
      await run('UPDATE products SET stock = ? WHERE id = ?', [l.tong_cn, l.id]);
    }
    console.log('  + Đã đồng bộ lại');
  }

  console.log('\n== Hoàn tất ==');
  db.close();
})();
