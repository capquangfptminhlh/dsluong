const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'autotax.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default_user',
      name TEXT NOT NULL,
      type TEXT DEFAULT 'Phòng',
      capacity INTEGER DEFAULT 1,
      status TEXT DEFAULT 'available',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("Error creating rooms:", err.message);
    else console.log("Table rooms ready.");
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default_user',
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      service_id INTEGER,
      service_name TEXT NOT NULL,
      room_id INTEGER,
      staff_id INTEGER,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("Error creating appointments:", err.message);
    else console.log("Table appointments ready.");
  });
});
