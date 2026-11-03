'use strict';

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows || [])));
  });
}

async function addColumnIfMissing(db, table, columnName, definition) {
  const columns = await all(db, `PRAGMA table_info(${table})`);
  if (columns.some((column) => column.name === columnName)) return false;
  await run(db, `ALTER TABLE ${table} ADD COLUMN ${definition}`);
  return true;
}

async function ensureBatchIntegritySchema(db) {
  await addColumnIfMissing(db, 'product_batches', 'branch_id', 'branch_id INTEGER');
  await addColumnIfMissing(db, 'product_batches', 'branch_name_snapshot', 'branch_name_snapshot TEXT');
  await addColumnIfMissing(db, 'product_batches', 'status', "status TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, 'product_batches', 'destroyed_at', 'destroyed_at DATETIME');
  await addColumnIfMissing(db, 'product_batches', 'destroy_reason', 'destroy_reason TEXT');

  await run(db, `
    CREATE TABLE IF NOT EXISTS pos_batch_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      order_id INTEGER NOT NULL,
      order_item_id INTEGER,
      product_id INTEGER NOT NULL,
      batch_id INTEGER NOT NULL,
      branch_id INTEGER,
      quantity REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      restored_at DATETIME
    )
  `);
  await addColumnIfMissing(db, 'pos_batch_allocations', 'restored_at', 'restored_at DATETIME');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_pos_batch_alloc_order ON pos_batch_allocations(user_id, order_id)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_pos_batch_alloc_batch ON pos_batch_allocations(user_id, batch_id)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_batch_fefo_branch ON product_batches(user_id, product_id, branch_id, status, expiry_date, id)');

  // A legacy batch can be located without guessing only when its shop has exactly one
  // branch. Multi-branch legacy batches intentionally remain NULL until the user assigns
  // their physical branch through the guarded API/UI.
  await run(db, `
    UPDATE product_batches
    SET branch_id = (
          SELECT b.id FROM branches b
          WHERE b.user_id = product_batches.user_id
          ORDER BY b.is_default DESC, b.id ASC LIMIT 1
        ),
        branch_name_snapshot = (
          SELECT b.name FROM branches b
          WHERE b.user_id = product_batches.user_id
          ORDER BY b.is_default DESC, b.id ASC LIMIT 1
        )
    WHERE branch_id IS NULL
      AND (SELECT COUNT(*) FROM branches b WHERE b.user_id = product_batches.user_id) = 1
  `);

  // Preserve a human-readable branch name on existing resolved batches. A later branch
  // lifecycle change must not erase the historical physical location printed on batch logs.
  await run(db, `
    UPDATE product_batches
    SET branch_name_snapshot = (
      SELECT b.name FROM branches b WHERE b.id = product_batches.branch_id
    )
    WHERE branch_id IS NOT NULL
      AND (branch_name_snapshot IS NULL OR branch_name_snapshot = '')
  `);

  await run(db, `
    CREATE TRIGGER IF NOT EXISTS trg_autotax_batch_branch_snapshot_insert
    AFTER INSERT ON product_batches
    WHEN NEW.branch_id IS NOT NULL
      AND (NEW.branch_name_snapshot IS NULL OR NEW.branch_name_snapshot = '')
    BEGIN
      UPDATE product_batches
      SET branch_name_snapshot = (SELECT name FROM branches WHERE id = NEW.branch_id)
      WHERE id = NEW.id;
    END
  `);

  await run(db, `
    CREATE TRIGGER IF NOT EXISTS trg_autotax_batch_branch_snapshot_update
    AFTER UPDATE OF branch_id ON product_batches
    WHEN NEW.branch_id IS NOT NULL
      AND (NEW.branch_name_snapshot IS NULL OR NEW.branch_name_snapshot = '' OR NEW.branch_id != OLD.branch_id)
    BEGIN
      UPDATE product_batches
      SET branch_name_snapshot = (SELECT name FROM branches WHERE id = NEW.branch_id)
      WHERE id = NEW.id;
    END
  `);

  return true;
}

module.exports = { ensureBatchIntegritySchema };
