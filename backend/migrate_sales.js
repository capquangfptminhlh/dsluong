/**
 * migrate_sales.js — Hoàn chỉnh nghiệp vụ bán hàng.
 *   node migrate_sales.js
 *
 * Thêm vào pos_orders:
 *   - subtotal      : tiền hàng trước giảm giá
 *   - discount      : đã có sẵn (tiền giảm)
 *   - promotion_id  : chương trình khuyến mãi đã áp
 *   - vat_rate/vat_amount : thuế VAT trên hóa đơn
 *   - paid_cash/paid_bank : thanh toán nhiều hình thức trên cùng 1 đơn
 *   - debt_amount   : phần khách còn nợ (bán ghi nợ)
 *   - customer_id   : gắn đơn với khách để theo dõi công nợ
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
        else console.log(`  + ${table}.${colName}`);
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
  console.log('== Hoàn chỉnh nghiệp vụ bán hàng ==\n');

  console.log('[1] Đơn hàng POS:');
  await addColumn('pos_orders', 'subtotal REAL DEFAULT 0', 'subtotal');
  await addColumn('pos_orders', 'promotion_id INTEGER', 'promotion_id');
  await addColumn('pos_orders', 'vat_rate REAL DEFAULT 0', 'vat_rate');
  await addColumn('pos_orders', 'vat_amount REAL DEFAULT 0', 'vat_amount');
  await addColumn('pos_orders', 'paid_cash REAL DEFAULT 0', 'paid_cash');
  await addColumn('pos_orders', 'paid_bank REAL DEFAULT 0', 'paid_bank');
  await addColumn('pos_orders', 'debt_amount REAL DEFAULT 0', 'debt_amount');
  await addColumn('pos_orders', 'customer_id INTEGER', 'customer_id');

  console.log('\n[2] Chi tiết đơn (giảm giá theo từng dòng):');
  await addColumn('pos_order_items', 'discount REAL DEFAULT 0', 'discount');

  console.log('\n[3] Khuyến mãi (bổ sung điều kiện áp dụng):');
  await addColumn('promotions', "start_date TEXT", 'start_date');
  await addColumn('promotions', "end_date TEXT", 'end_date');
  await addColumn('promotions', 'usage_count INTEGER DEFAULT 0', 'usage_count');

  console.log('\n[4] Công nợ khách (gắn với đơn hàng):');
  await addColumn('debts', 'order_code TEXT', 'order_code');
  await addColumn('debts', 'customer_id INTEGER', 'customer_id');

  console.log('\n[5] Đơn hàng cũ: lấp subtotal cho khớp:');
  await run(`UPDATE pos_orders SET subtotal = total_amount WHERE subtotal = 0 OR subtotal IS NULL`, 'cập nhật subtotal đơn cũ');
  await run(`UPDATE pos_orders SET paid_cash = total_amount WHERE paid_cash = 0 AND payment_method = 'cash' AND status != 'cancelled'`, 'đơn cũ tiền mặt');
  await run(`UPDATE pos_orders SET paid_bank = total_amount WHERE paid_bank = 0 AND payment_method = 'bank' AND status != 'cancelled'`, 'đơn cũ chuyển khoản');

  console.log('\n== Hoàn tất ==');
  db.close();
})();
