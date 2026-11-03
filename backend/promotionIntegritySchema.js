'use strict';

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

async function ensurePromotionIntegritySchema(db) {
  // Defense in depth: application preflight gives a friendly response and rewrites the
  // selected-promotion discount from authoritative prices. This trigger is the final
  // persistence boundary so a stale/tampered request cannot store a promotion with a
  // discount that does not match the promotion policy for the actual order subtotal.
  await run(db, `
    CREATE TRIGGER IF NOT EXISTS trg_autotax_pos_promotion_guard
    BEFORE INSERT ON pos_orders
    WHEN NEW.promotion_id IS NOT NULL
    BEGIN
      SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM promotions p
        WHERE p.id = NEW.promotion_id
          AND p.user_id = NEW.user_id
          AND (p.status IS NULL OR UPPER(p.status) = 'ACTIVE')
          AND COALESCE(p.min_order_value, 0) >= 0
          AND COALESCE(p.min_order_value, 0) <= COALESCE(NEW.subtotal, 0)
          AND COALESCE(p.discount_percent, 0) >= 0
          AND COALESCE(p.discount_percent, 0) <= 100
          AND COALESCE(p.discount_amount, 0) >= 0
          AND (p.start_date IS NULL OR p.start_date = '' OR p.start_date <= date('now', '+7 hours'))
          AND (p.end_date IS NULL OR p.end_date = '' OR p.end_date >= date('now', '+7 hours'))
          AND ABS(
            COALESCE(NEW.discount, 0) -
            MIN(
              MAX(
                ROUND(COALESCE(NEW.subtotal, 0) * COALESCE(p.discount_percent, 0) / 100.0),
                COALESCE(p.discount_amount, 0)
              ),
              COALESCE(NEW.subtotal, 0)
            )
          ) < 0.0001
      ) THEN RAISE(ABORT, 'PROMOTION_POLICY_MISMATCH') END;
    END
  `);

  return true;
}

module.exports = { ensurePromotionIntegritySchema };
