'use strict';

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

async function ensureComboIntegritySchema(db) {
  // Checkout reads combo composition before its write transaction. This persistence
  // boundary closes delete-vs-checkout races: a combo must still belong to the order's
  // tenant and still have components at the exact moment the order item is inserted.
  await run(db, `
    CREATE TRIGGER IF NOT EXISTS trg_autotax_pos_combo_reference_guard
    BEFORE INSERT ON pos_order_items
    WHEN NEW.combo_id IS NOT NULL
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM combos c
        JOIN pos_orders o ON o.id = NEW.order_id
        WHERE c.id = NEW.combo_id
          AND c.user_id = o.user_id
          AND COALESCE(c.status, 'active') = 'active'
          AND EXISTS (SELECT 1 FROM combo_items ci WHERE ci.combo_id = c.id)
      ) THEN RAISE(ABORT, 'COMBO_REFERENCE_INVALID') END;
    END
  `);
  return true;
}

module.exports = { ensureComboIntegritySchema };
