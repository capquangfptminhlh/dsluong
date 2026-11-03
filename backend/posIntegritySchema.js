'use strict';

const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); }));

async function addColumn(db, table, name, definition) {
  const columns = await all(db, `PRAGMA table_info(${table})`);
  if (columns.some((column) => column.name === name)) return;
  await run(db, `ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

async function ensurePosIntegritySchema(db) {
  for (const [name, definition] of [
    ['customer_id', 'customer_id INTEGER'],
    ['cancel_reason', 'cancel_reason TEXT'],
  ]) await addColumn(db, 'pos_orders', name, definition);

  await addColumn(db, 'pos_order_items', 'combo_id', 'combo_id INTEGER');

  for (const [name, definition] of [
    ['order_code', 'order_code TEXT'],
    ['customer_id', 'customer_id INTEGER'],
  ]) await addColumn(db, 'debts', name, definition);

  for (const [name, definition] of [
    ['start_date', 'start_date TEXT'],
    ['end_date', 'end_date TEXT'],
    ['usage_count', 'usage_count INTEGER DEFAULT 0'],
  ]) await addColumn(db, 'promotions', name, definition);

  await run(db, 'CREATE INDEX IF NOT EXISTS idx_debts_order ON debts(user_id, order_code)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_pos_order_code_tenant ON pos_orders(user_id, order_code)');

  // Serial state must follow the order lifecycle atomically. When a successfully sold
  // order is cancelled, make every serial belonging to that order available again in
  // the same SQLite transaction that changes pos_orders.status.
  await run(db, `
    CREATE TRIGGER IF NOT EXISTS trg_pos_cancel_restore_serials
    AFTER UPDATE OF status ON pos_orders
    WHEN NEW.status = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled'
    BEGIN
      UPDATE product_serials
      SET status = 'in_stock', order_code = NULL, sold_at = NULL
      WHERE user_id = NEW.user_id
        AND order_code = NEW.order_code
        AND status = 'sold';
    END
  `);

  return true;
}

module.exports = { ensurePosIntegritySchema };
