'use strict';

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) { err ? reject(err) : resolve(this); });
});
const all = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});

async function addColumnIfMissing(db, table, name, definition) {
  const columns = await all(db, `PRAGMA table_info(${table})`);
  if (columns.some((column) => column.name === name)) return;
  await run(db, `ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

async function ensureHospitalitySchema(db) {
  await addColumnIfMissing(db, 'rooms', 'price', 'price REAL DEFAULT 0');
  await addColumnIfMissing(db, 'rooms', 'image', 'image TEXT');

  await run(db, `CREATE TABLE IF NOT EXISTS room_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    room_id INTEGER NOT NULL,
    guest_name TEXT NOT NULL,
    guest_phone TEXT,
    check_in DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nights INTEGER NOT NULL DEFAULT 1,
    rate REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'checked_in',
    pos_order_id INTEGER,
    checked_out_at DATETIME,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_room_booking_active ON room_bookings(user_id, room_id, status)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_room_booking_order ON room_bookings(user_id, pos_order_id)');

  await run(db, `CREATE TABLE IF NOT EXISTS room_service_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    room_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    pos_order_id INTEGER,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS room_service_session_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    service_id INTEGER,
    service_name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    staff_id INTEGER,
    staff_name TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_room_service_active ON room_service_sessions(user_id, room_id, status)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_room_service_items ON room_service_session_items(session_id)');

  await run(db, `CREATE TABLE IF NOT EXISTS fnb_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    room_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    sent_to_kitchen INTEGER NOT NULL DEFAULT 0,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    pos_order_id INTEGER,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS fnb_session_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    note TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_fnb_active ON fnb_sessions(user_id, room_id, status)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_fnb_items ON fnb_session_items(session_id)');

  // Legacy open F&B sessions did not snapshot menu prices. Materialize an internal
  // ratio-1 unit once so all subsequent reads/checkouts stay pinned to one server price.
  // INSERT OR IGNORE preserves any snapshot already created by the current runtime.
  await run(db, `
    INSERT OR IGNORE INTO product_units (user_id, product_id, name, ratio, price, is_base)
    SELECT s.user_id, i.product_id, '__FNB_' || s.id, 1, COALESCE(p.price, 0), 0
    FROM fnb_session_items i
    JOIN fnb_sessions s ON s.id = i.session_id AND s.status = 'open'
    JOIN products p ON p.id = i.product_id AND p.user_id = s.user_id
  `);
}

module.exports = { ensureHospitalitySchema };
