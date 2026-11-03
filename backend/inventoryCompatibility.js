'use strict';

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

async function ensureInventoryCompatibility(db) {
  // Legacy AutoTax stored all stock in products.stock. The branch module later made
  // branch_stock authoritative, but existing/new product creation did not seed it.
  // Backfill only products that have NO branch allocation at all, placing their
  // existing total in that tenant's default branch. Existing allocations are untouched.
  await run(db, `
    INSERT OR IGNORE INTO branch_stock (branch_id, product_id, stock)
    SELECT b.id, p.id, COALESCE(p.stock, 0)
    FROM products p
    JOIN branches b ON b.user_id = p.user_id AND b.is_default = 1
    WHERE NOT EXISTS (
      SELECT 1 FROM branch_stock bs WHERE bs.product_id = p.id
    )
  `);

  // New products inherit their initial stock into the default branch immediately.
  await run(db, `
    CREATE TRIGGER IF NOT EXISTS trg_autotax_product_seed_branch_stock
    AFTER INSERT ON products
    BEGIN
      INSERT OR IGNORE INTO branch_stock (branch_id, product_id, stock)
      SELECT id, NEW.id, COALESCE(NEW.stock, 0)
      FROM branches
      WHERE user_id = NEW.user_id AND is_default = 1
      ORDER BY id ASC
      LIMIT 1;
    END
  `);

  // If a product still has no branch allocation when stock is edited, seed the
  // default branch. This covers imported/legacy rows created before branch setup.
  await run(db, `
    CREATE TRIGGER IF NOT EXISTS trg_autotax_product_stock_seed_on_update
    AFTER UPDATE OF stock ON products
    WHEN NOT EXISTS (SELECT 1 FROM branch_stock WHERE product_id = NEW.id)
    BEGIN
      INSERT OR IGNORE INTO branch_stock (branch_id, product_id, stock)
      SELECT id, NEW.id, COALESCE(NEW.stock, 0)
      FROM branches
      WHERE user_id = NEW.user_id AND is_default = 1
      ORDER BY id ASC
      LIMIT 1;
    END
  `);

  // When there is exactly one branch allocation, products.stock and branch_stock
  // represent the same quantity. Keep manual product edits consistent. With multiple
  // branches we deliberately do NOT guess how a changed total should be distributed.
  await run(db, `
    CREATE TRIGGER IF NOT EXISTS trg_autotax_single_branch_stock_sync
    AFTER UPDATE OF stock ON products
    WHEN (SELECT COUNT(*) FROM branch_stock WHERE product_id = NEW.id) = 1
      AND COALESCE((SELECT SUM(stock) FROM branch_stock WHERE product_id = NEW.id), 0) != COALESCE(NEW.stock, 0)
    BEGIN
      UPDATE branch_stock SET stock = COALESCE(NEW.stock, 0) WHERE product_id = NEW.id;
    END
  `);

  await run(db, `
    CREATE TRIGGER IF NOT EXISTS trg_autotax_product_branch_stock_cleanup
    AFTER DELETE ON products
    BEGIN
      DELETE FROM branch_stock WHERE product_id = OLD.id;
    END
  `);

  return true;
}

module.exports = { ensureInventoryCompatibility };
