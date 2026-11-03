'use strict';

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
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

async function ensureColumns(db, table, columns) {
  const existing = new Set((await all(db, `PRAGMA table_info(${table})`)).map((row) => row.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) await run(db, `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

async function ensureAuditComplianceSchema(db) {
  // Additive only. No legal rules are seeded here: production must fail closed
  // until an approved source_url + approved_by rule is explicitly configured.
  await run(db, `CREATE TABLE IF NOT EXISTS legal_rule_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    rule_code TEXT NOT NULL,
    tax_type TEXT,
    source_url TEXT NOT NULL,
    approved_by TEXT NOT NULL,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    parameters_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, rule_code, effective_from)
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_legal_rule_lookup ON legal_rule_versions(user_id, rule_code, effective_from, effective_to, status)');

  await run(db, `CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'INPUT',
    seller_tax_code TEXT,
    buyer_tax_code TEXT,
    invoice_number TEXT,
    invoice_symbol TEXT,
    invoice_date TEXT,
    subtotal REAL NOT NULL DEFAULT 0,
    vat_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'VND',
    source_type TEXT NOT NULL DEFAULT 'MANUAL',
    source_hash TEXT,
    invoice_status TEXT NOT NULL DEFAULT 'ORIGINAL',
    raw_xml TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_invoice_identity ON invoices(user_id, direction, seller_tax_code, invoice_symbol, invoice_number)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_invoice_hash ON invoices(user_id, source_hash)');

  await run(db, `CREATE TABLE IF NOT EXISTS invoice_xml_provenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    invoice_id INTEGER NOT NULL,
    schema_family TEXT NOT NULL,
    schema_version TEXT,
    wrapper_type TEXT,
    message_code TEXT,
    tax_authority_code TEXT,
    signature_present INTEGER NOT NULL DEFAULT 0,
    signature_verification_status TEXT NOT NULL DEFAULT 'NOT_VERIFIED',
    certificate_trust_status TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    certificate_chain_verified INTEGER NOT NULL DEFAULT 0,
    certificate_fingerprint_sha256 TEXT,
    certificate_subject TEXT,
    certificate_issuer TEXT,
    certificate_serial_number TEXT,
    certificate_valid_from TEXT,
    certificate_valid_to TEXT,
    certificate_current_time_status TEXT,
    certificate_revocation_status TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    certificate_trust_anchor_bundle_sha256 TEXT,
    certificate_authority_bundle_sha256 TEXT,
    certificate_authority_evidence_source TEXT,
    certificate_authority_registry_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    certificate_authority_registry_sha256 TEXT,
    certificate_authority_name TEXT,
    certificate_authority_status TEXT,
    certificate_authority_serial_number TEXT,
    certificate_authority_fingerprint_sha256 TEXT,
    certificate_authority_source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, invoice_id)
  )`);
  await ensureColumns(db, 'invoice_xml_provenance', {
    certificate_trust_status: "TEXT NOT NULL DEFAULT 'NOT_CHECKED'",
    certificate_chain_verified: 'INTEGER NOT NULL DEFAULT 0',
    certificate_fingerprint_sha256: 'TEXT',
    certificate_subject: 'TEXT',
    certificate_issuer: 'TEXT',
    certificate_serial_number: 'TEXT',
    certificate_valid_from: 'TEXT',
    certificate_valid_to: 'TEXT',
    certificate_current_time_status: 'TEXT',
    certificate_revocation_status: "TEXT NOT NULL DEFAULT 'NOT_CHECKED'",
    certificate_trust_anchor_bundle_sha256: 'TEXT',
    certificate_authority_bundle_sha256: 'TEXT',
    certificate_authority_evidence_source: 'TEXT',
    certificate_authority_registry_status: "TEXT NOT NULL DEFAULT 'NOT_CONFIGURED'",
    certificate_authority_registry_sha256: 'TEXT',
    certificate_authority_name: 'TEXT',
    certificate_authority_status: 'TEXT',
    certificate_authority_serial_number: 'TEXT',
    certificate_authority_fingerprint_sha256: 'TEXT',
    certificate_authority_source_url: 'TEXT',
  });
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_invoice_xml_provenance ON invoice_xml_provenance(user_id, schema_family, created_at)');

  await run(db, `CREATE TABLE IF NOT EXISTS invoice_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    invoice_id INTEGER NOT NULL,
    line_no INTEGER,
    description TEXT,
    quantity REAL,
    unit_price REAL,
    subtotal REAL NOT NULL DEFAULT 0,
    vat_rate REAL,
    vat_amount REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_invoice_lines ON invoice_lines(user_id, invoice_id, line_no)');

  await run(db, `CREATE TABLE IF NOT EXISTS invoice_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    invoice_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL,
    relation_id TEXT NOT NULL,
    match_status TEXT NOT NULL DEFAULT 'UNREVIEWED',
    detail_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, invoice_id, relation_type, relation_id)
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_invoice_relations ON invoice_relations(user_id, relation_type, relation_id)');

  await run(db, `CREATE TABLE IF NOT EXISTS payment_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    purchase_order_id INTEGER,
    invoice_id INTEGER,
    cash_flow_id INTEGER,
    amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'unknown',
    transaction_reference TEXT,
    paid_at TEXT,
    proof_file TEXT,
    proof_hash TEXT,
    status TEXT NOT NULL DEFAULT 'RECORDED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_payment_evidence_purchase ON payment_evidence(user_id, purchase_order_id, created_at)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_payment_evidence_invoice ON payment_evidence(user_id, invoice_id, created_at)');

  await run(db, `CREATE TABLE IF NOT EXISTS compliance_findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    code TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'REVIEW',
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    message TEXT NOT NULL,
    detail_json TEXT,
    rule_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_findings_open ON compliance_findings(user_id, status, severity, created_at)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_findings_subject ON compliance_findings(user_id, subject_type, subject_id)');

  await run(db, `CREATE TABLE IF NOT EXISTS audit_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    finding_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    assigned_to TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, finding_id)
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_audit_cases_status ON audit_cases(user_id, status, updated_at)');

  return true;
}

module.exports = { ensureAuditComplianceSchema };
