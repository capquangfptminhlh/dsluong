'use strict';

const WAIT_TIMEOUT_MS = 10000;
const WAIT_INTERVAL_MS = 100;

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function tableExists(db, table) {
  const rows = await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]);
  return rows.length > 0;
}

async function waitForTable(db, table) {
  const started = Date.now();
  while (Date.now() - started < WAIT_TIMEOUT_MS) {
    if (await tableExists(db, table)) return;
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  throw new Error(`Runtime schema timeout waiting for table: ${table}`);
}

async function addColumnIfMissing(db, table, columnName, columnDefinition) {
  await waitForTable(db, table);
  const columns = await all(db, `PRAGMA table_info(${table})`);
  if (columns.some((column) => column.name === columnName)) return false;
  await run(db, `ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
  return true;
}

async function ensureRuntimeSchema(db) {
  // db.js owns the legacy base schema. Wait for its CREATE TABLE queue, then apply
  // only additive/idempotent compatibility changes. No DELETE, data rewrite, or
  // business migration is allowed in this startup gate.
  await waitForTable(db, 'users');
  await waitForTable(db, 'staff');
  await waitForTable(db, 'customer_tiers');
  await waitForTable(db, 'products');
  await waitForTable(db, 'pos_orders');
  await waitForTable(db, 'pos_order_items');

  for (const [name, definition] of [
    ['password_hash', 'password_hash TEXT'], ['role', "role TEXT DEFAULT 'owner'"],
    ['status', "status TEXT DEFAULT 'active'"], ['sector', "sector TEXT DEFAULT 'retail'"],
    ['oldTaxCode', 'oldTaxCode TEXT'], ['email', 'email TEXT'], ['province', 'province TEXT'],
    ['ward', 'ward TEXT'], ['address', 'address TEXT'], ['taxDepartment', 'taxDepartment TEXT'],
  ]) await addColumnIfMissing(db, 'users', name, definition);

  for (const [name, definition] of [
    ['username', 'username TEXT'], ['password_hash', 'password_hash TEXT'],
    ['permissions', "permissions TEXT DEFAULT '[]'"], ['status', "status TEXT DEFAULT 'active'"],
    ['branch_id', 'branch_id INTEGER'],
  ]) await addColumnIfMissing(db, 'staff', name, definition);

  for (const [name, definition] of [
    ['base_unit', "base_unit TEXT DEFAULT 'Cái'"], ['track_batch', 'track_batch INTEGER DEFAULT 0'],
    ['track_serial', 'track_serial INTEGER DEFAULT 0'], ['warranty_months', 'warranty_months INTEGER DEFAULT 0'],
    ['warranty_options_json', "warranty_options_json TEXT DEFAULT '[]'"],
  ]) await addColumnIfMissing(db, 'products', name, definition);

  for (const [name, definition] of [
    ['subtotal', 'subtotal REAL DEFAULT 0'], ['promotion_id', 'promotion_id INTEGER'],
    ['vat_rate', 'vat_rate REAL DEFAULT 0'], ['vat_amount', 'vat_amount REAL DEFAULT 0'],
    ['paid_cash', 'paid_cash REAL DEFAULT 0'], ['paid_bank', 'paid_bank REAL DEFAULT 0'],
    ['debt_amount', 'debt_amount REAL DEFAULT 0'], ['branch_id', 'branch_id INTEGER'],
  ]) await addColumnIfMissing(db, 'pos_orders', name, definition);

  for (const [name, definition] of [
    ['discount', 'discount REAL DEFAULT 0'], ['unit_name', 'unit_name TEXT'],
    ['unit_ratio', 'unit_ratio REAL DEFAULT 1'], ['sku', 'sku TEXT'],
    ['warranty_months', 'warranty_months INTEGER DEFAULT 0'],
    ['variant_id', 'variant_id INTEGER'], ['variant_label', 'variant_label TEXT'],
    ['cost_price', 'cost_price REAL'],
  ]) await addColumnIfMissing(db, 'pos_order_items', name, definition);

  if (await tableExists(db, 'customers')) {
    await addColumnIfMissing(db, 'customers', 'address', 'address TEXT');
    await addColumnIfMissing(db, 'customers', 'price_level_id', 'price_level_id INTEGER');
  }
  if (await tableExists(db, 'purchase_orders')) await addColumnIfMissing(db, 'purchase_orders', 'branch_id', 'branch_id INTEGER');
  if (await tableExists(db, 'purchase_order_items')) {
    await addColumnIfMissing(db, 'purchase_order_items', 'variant_id', 'variant_id INTEGER');
    await addColumnIfMissing(db, 'purchase_order_items', 'variant_label', 'variant_label TEXT');
  }
  if (await tableExists(db, 'purchase_request_items')) {
    await addColumnIfMissing(db, 'purchase_request_items', 'variant_id', 'variant_id INTEGER');
    await addColumnIfMissing(db, 'purchase_request_items', 'variant_label', 'variant_label TEXT');
  }
  if (await tableExists(db, 'inventory_logs')) await addColumnIfMissing(db, 'inventory_logs', 'branch_id', 'branch_id INTEGER');
  if (await tableExists(db, 'return_items')) {
    await addColumnIfMissing(db, 'return_items', 'order_item_id', 'order_item_id INTEGER');
    await addColumnIfMissing(db, 'return_items', 'variant_id', 'variant_id INTEGER');
    await addColumnIfMissing(db, 'return_items', 'variant_label', 'variant_label TEXT');
  }

  // Product pricing, units, batches.
  await run(db, `CREATE TABLE IF NOT EXISTS price_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT NOT NULL,
    is_default INTEGER DEFAULT 0, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, name)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS product_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, level_id INTEGER NOT NULL,
    price REAL NOT NULL DEFAULT 0, UNIQUE(product_id, level_id)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS product_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, product_id INTEGER NOT NULL,
    name TEXT NOT NULL, ratio REAL NOT NULL DEFAULT 1, price REAL NOT NULL DEFAULT 0,
    is_base INTEGER DEFAULT 0, UNIQUE(product_id, name)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS product_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, product_id INTEGER NOT NULL,
    batch_code TEXT, expiry_date TEXT, quantity REAL NOT NULL DEFAULT 0, cost_price REAL DEFAULT 0,
    note TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_batch_prod ON product_batches(user_id, product_id, expiry_date)');

  // Combos, serials and warranties.
  await run(db, `CREATE TABLE IF NOT EXISTS combos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT NOT NULL, sku TEXT,
    price REAL NOT NULL DEFAULT 0, status TEXT DEFAULT 'active', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS combo_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, combo_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
    quantity REAL NOT NULL DEFAULT 1
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS product_serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, product_id INTEGER NOT NULL,
    serial TEXT NOT NULL, status TEXT DEFAULT 'in_stock', order_code TEXT, sold_at DATETIME, note TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, serial)
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_serial_prod ON product_serials(user_id, product_id, status)');
  await run(db, `CREATE TABLE IF NOT EXISTS warranties (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, order_code TEXT, product_id INTEGER,
    product_name TEXT, serial TEXT, customer_name TEXT, customer_phone TEXT, months INTEGER DEFAULT 0,
    start_date TEXT, end_date TEXT, note TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_wr_user ON warranties(user_id, end_date)');
  await addColumnIfMissing(db, 'warranties', 'order_item_id', 'order_item_id INTEGER');
  await addColumnIfMissing(db, 'warranties', 'quantity', 'quantity REAL DEFAULT 1');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_wr_order ON warranties(user_id, order_code, order_item_id)');

  // Branch inventory and supplier-order workflow.
  await run(db, `CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, name TEXT NOT NULL, address TEXT,
    phone TEXT, is_default INTEGER DEFAULT 0, status TEXT DEFAULT 'active',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, name)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS branch_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
    stock REAL NOT NULL DEFAULT 0, UNIQUE(branch_id, product_id)
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_bs ON branch_stock(product_id, branch_id)');

  // Compatibility repair for legacy receipts: when a product has exactly one variant,
  // every unit of parent stock necessarily belongs to that single variant. Older purchase
  // flows updated products/branch_stock but not product_variants, which made POS report
  // "không đủ tồn phân loại" even though inventory showed stock.
  if (await tableExists(db, 'product_variants')) {
    await run(db, `
      UPDATE product_variants
      SET stock = COALESCE((SELECT p.stock FROM products p WHERE p.id = product_variants.product_id), stock)
      WHERE product_id IN (
        SELECT product_id FROM product_variants GROUP BY product_id HAVING COUNT(*) = 1
      )
    `);
  }

  await run(db, `CREATE TABLE IF NOT EXISTS purchase_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, code TEXT NOT NULL, supplier_id INTEGER,
    supplier_name TEXT, branch_id INTEGER, total_amount REAL NOT NULL DEFAULT 0, status TEXT DEFAULT 'ordered',
    expected_date TEXT, note TEXT, po_id INTEGER, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, code)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS purchase_request_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, product_id INTEGER,
    product_name TEXT, quantity REAL NOT NULL DEFAULT 0, cost_price REAL NOT NULL DEFAULT 0,
    variant_id INTEGER, variant_label TEXT
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS supplier_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, code TEXT NOT NULL, supplier_id INTEGER,
    supplier_name TEXT, branch_id INTEGER, total_amount REAL NOT NULL DEFAULT 0, reason TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, code)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS supplier_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, return_id INTEGER NOT NULL, product_id INTEGER,
    product_name TEXT, quantity REAL NOT NULL DEFAULT 0, cost_price REAL NOT NULL DEFAULT 0
  )`);

  // Cash movements remain tenant-scoped; new branch_id is additive only.
  // Do not re-attribute historical manual entries during startup.
  if (await tableExists(db, 'cash_flows')) {
    await addColumnIfMissing(db, 'cash_flows', 'branch_id', 'branch_id INTEGER');
    await run(db, 'CREATE INDEX IF NOT EXISTS idx_cash_flows_branch ON cash_flows(user_id, branch_id, created_at)');
  }

  // Cashier shifts are physically tied to one branch. Historical closed
  // shifts keep NULL rather than being silently assigned to an outlet.
  if (await tableExists(db, 'cashier_shifts')) {
    await addColumnIfMissing(db, 'cashier_shifts', 'branch_id', 'branch_id INTEGER');
    // New shifts snapshot the latest committed ledger ID to avoid SQLite's
    // one-second timestamps attributing pre-opening cash to the new drawer.
    await addColumnIfMissing(db, 'cashier_shifts', 'opening_cash_flow_id', 'opening_cash_flow_id INTEGER');
    await run(db, 'CREATE INDEX IF NOT EXISTS idx_cashier_shifts_branch ON cashier_shifts(user_id, branch_id, status, opened_at)');
  }

  // HRM: retain existing attendance rows as historical evidence. New check-ins
  // snapshot the work branch, so reassignment never rewrites past attendance.
  if (await tableExists(db, 'shifts')) {
    await addColumnIfMissing(db, 'shifts', 'branch_id', 'branch_id INTEGER');
    await run(db, 'CREATE INDEX IF NOT EXISTS idx_hrm_shift_staff_branch ON shifts(staff_id, branch_id, check_in)');
  }
  // Requests never mutate attendance until an authorized reviewer approves.
  // Original shift values stay on the request to provide a tamper-evident
  // before/after trail; payroll lock is enforced at decision time.
  await run(db, `CREATE TABLE IF NOT EXISTS hrm_attendance_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, staff_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
    shift_id INTEGER,
    correction_type TEXT NOT NULL CHECK(correction_type IN ('new_shift','missing_checkout','adjust_shift')),
    proposed_check_in TEXT NOT NULL, proposed_check_out TEXT NOT NULL,
    original_check_in TEXT, original_check_out TEXT, original_status TEXT,
    reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','approved','rejected')),
    requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INTEGER, reviewed_at TEXT, review_note TEXT, applied_shift_id INTEGER
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_hrm_corrections_scope ON hrm_attendance_corrections(user_id,branch_id,status,proposed_check_in)');
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_hrm_corrections_pending_shift
    ON hrm_attendance_corrections(user_id,shift_id) WHERE status='pending' AND shift_id IS NOT NULL`);
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_hrm_corrections_pending_new
    ON hrm_attendance_corrections(user_id,staff_id,proposed_check_in,proposed_check_out)
    WHERE status='pending' AND correction_type='new_shift'`);
  await run(db, `CREATE TABLE IF NOT EXISTS hrm_pay_rates (
    user_id TEXT NOT NULL, staff_id INTEGER NOT NULL,
    hourly_rate INTEGER NOT NULL DEFAULT 0 CHECK(hourly_rate >= 0),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, staff_id)
  )`);
  // Monthly-effective contract history prevents a rate change today from
  // silently changing drafts for unrelated historical periods.
  await run(db, `CREATE TABLE IF NOT EXISTS hrm_pay_rate_periods (
    user_id TEXT NOT NULL, staff_id INTEGER NOT NULL,
    effective_month TEXT NOT NULL CHECK (
      effective_month GLOB '20[2-9][0-9]-[0-1][0-9]' AND
      substr(effective_month,6,2) BETWEEN '01' AND '12'
    ),
    salary_type TEXT NOT NULL CHECK (salary_type IN ('hourly','monthly')),
    hourly_rate INTEGER NOT NULL CHECK(hourly_rate BETWEEN 0 AND 10000000),
    monthly_salary INTEGER NOT NULL CHECK(monthly_salary BETWEEN 0 AND 1000000000),
    standard_hours INTEGER NOT NULL CHECK(standard_hours BETWEEN 1 AND 300),
    updated_by INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,staff_id,effective_month)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_hrm_pay_rate_periods
    ON hrm_pay_rate_periods(user_id,staff_id,effective_month DESC)`);
  await run(db, `CREATE TABLE IF NOT EXISTS hrm_payroll_slips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, staff_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
    month TEXT NOT NULL, work_seconds INTEGER NOT NULL DEFAULT 0,
    hourly_rate INTEGER NOT NULL DEFAULT 0,
    gross_salary INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'approved',
    approved_by INTEGER, approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, staff_id, branch_id, month)
  )`);
  for (const [column, definition] of [
    ['salary_type', "salary_type TEXT NOT NULL DEFAULT 'hourly'"],
    ['monthly_salary', 'monthly_salary INTEGER NOT NULL DEFAULT 0'],
    ['standard_hours', 'standard_hours INTEGER NOT NULL DEFAULT 208'],
  ]) await addColumnIfMissing(db, 'hrm_pay_rates', column, definition);
  for (const [column, definition] of [
    ['salary_type', "salary_type TEXT NOT NULL DEFAULT 'hourly'"],
    ['monthly_salary', 'monthly_salary INTEGER NOT NULL DEFAULT 0'],
    ['standard_hours', 'standard_hours INTEGER NOT NULL DEFAULT 208'],
  ]) await addColumnIfMissing(db, 'hrm_payroll_slips', column, definition);
  // Upgrade legacy rows once. Old payroll rate changes were not dated, so
  // historical accuracy before this migration cannot be reconstructed. The
  // migration records their currently stored values as an explicit baseline.
  await run(db, `INSERT OR IGNORE INTO hrm_pay_rate_periods
    (user_id,staff_id,effective_month,salary_type,hourly_rate,monthly_salary,standard_hours)
    SELECT r.user_id,r.staff_id,'2020-01',
      CASE WHEN r.salary_type='monthly' THEN 'monthly' ELSE 'hourly' END,
      CAST(COALESCE(r.hourly_rate,0) AS INTEGER),
      CAST(COALESCE(r.monthly_salary,0) AS INTEGER),
      CAST(COALESCE(r.standard_hours,208) AS INTEGER)
    FROM hrm_pay_rates r
    WHERE NOT EXISTS (
      SELECT 1 FROM hrm_pay_rate_periods p
      WHERE p.user_id=r.user_id AND p.staff_id=r.staff_id
    )`);
  await addColumnIfMissing(db, 'hrm_payroll_slips', 'rate_effective_month', 'rate_effective_month TEXT');
  // Approved payroll is a frozen accounting preview, not proof of payment.
  for (const [column, definition] of [
    ['base_salary', 'base_salary INTEGER'],
    ['paid_leave_minutes', 'paid_leave_minutes INTEGER'],
    ['allowance_amount', 'allowance_amount INTEGER'],
    ['overtime_amount', 'overtime_amount INTEGER'],
    ['deduction_amount', 'deduction_amount INTEGER'],
    ['payable_estimate', 'payable_estimate INTEGER'],
  ]) await addColumnIfMissing(db, 'hrm_payroll_slips', column, definition);

  await run(db, `CREATE TABLE IF NOT EXISTS hrm_leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, staff_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
    leave_date TEXT NOT NULL, minutes INTEGER NOT NULL CHECK(minutes BETWEEN 30 AND 720),
    leave_type TEXT NOT NULL CHECK(leave_type IN ('paid','unpaid')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    note TEXT, decision_note TEXT, decided_by INTEGER, decided_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_hrm_leave_tenant_month ON hrm_leave_requests(user_id,branch_id,leave_date,status)');
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_hrm_leave_approved_day
    ON hrm_leave_requests(user_id,staff_id,leave_date) WHERE status='approved'`);

  await run(db, `CREATE TABLE IF NOT EXISTS hrm_payroll_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, staff_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('allowance','overtime','deduction')),
    amount INTEGER NOT NULL CHECK(amount > 0),
    note TEXT NOT NULL, idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','void')),
    created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    voided_at TEXT, voided_by INTEGER,
    UNIQUE(user_id,idempotency_key)
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_hrm_adjustments_tenant_month ON hrm_payroll_adjustments(user_id,month,staff_id,branch_id,status)');
  // Disbursement records are appended only after the owner confirms a real
  // external payment. Each payout is paired atomically with cashbook+evidence;
  // never infer payment solely from an approved payslip.
  await run(db, `CREATE TABLE IF NOT EXISTS hrm_payroll_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    slip_id INTEGER NOT NULL,
    staff_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','bank')),
    payment_reference TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    note TEXT,
    cash_flow_id INTEGER NOT NULL,
    recorded_by INTEGER NOT NULL,
    recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, idempotency_key),
    UNIQUE(user_id, payment_method, payment_reference)
  )`);
  // A linked legacy cash expense is never copied into cash_flows a second time.
  await addColumnIfMissing(db, 'hrm_payroll_payments', 'origin',
    "origin TEXT NOT NULL DEFAULT 'new_cash_flow'");
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_hrm_payment_cashflow_unique
    ON hrm_payroll_payments(user_id, cash_flow_id) WHERE cash_flow_id > 0`);
  await run(db, `CREATE TABLE IF NOT EXISTS hrm_payroll_payment_correction_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, payment_id INTEGER NOT NULL,
    reason TEXT NOT NULL, requested_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
    resolution_note TEXT, resolved_at TEXT, resolved_by INTEGER
  )`);
  await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_hrm_payment_open_correction
    ON hrm_payroll_payment_correction_requests(user_id, payment_id) WHERE status='open'`);
  // Corrections never overwrite an original payment or its cashbook entry.
  // Reallocation is limited to one audited event, and may only move the
  // payroll association within the same tenant + branch.
  for (const [column, definition] of [
    ['resolution_action', 'resolution_action TEXT'],
    ['resolution_reference', 'resolution_reference TEXT'],
  ]) await addColumnIfMissing(db, 'hrm_payroll_payment_correction_requests', column, definition);
  await run(db, `CREATE TABLE IF NOT EXISTS hrm_payroll_payment_reallocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    payment_id INTEGER NOT NULL,
    correction_request_id INTEGER NOT NULL,
    original_slip_id INTEGER NOT NULL,
    target_slip_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    evidence_reference TEXT NOT NULL,
    note TEXT NOT NULL,
    resolved_by INTEGER NOT NULL,
    resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id,payment_id),
    UNIQUE(user_id,correction_request_id)
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_hrm_reallocations_target ON hrm_payroll_payment_reallocations(user_id,target_slip_id)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_hrm_payments_slip ON hrm_payroll_payments(user_id, slip_id, recorded_at)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_hrm_payroll_month ON hrm_payroll_slips(user_id, month, branch_id)');

  // Security/audit tables.
  await run(db, `CREATE TABLE IF NOT EXISTS shop_settings (
    user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY (user_id, key)
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, actor_type TEXT NOT NULL,
    actor_id TEXT, actor_name TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC)');

  // Shared legacy tables must be tenant-scoped in the current runtime.
  for (const table of ['workflows', 'omnichannel_channels', 'omnichannel_orders', 'customer_tiers', 'debts', 'cash_flows', 'inventory_checks', 'inventory_transfers', 'promotions', 'gemini_keys']) {
    if (await tableExists(db, table)) await addColumnIfMissing(db, table, 'user_id', "user_id TEXT DEFAULT 'default_user'");
  }

  await run(db, 'PRAGMA foreign_keys = ON');
  return true;
}

module.exports = { ensureRuntimeSchema };
