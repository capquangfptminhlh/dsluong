const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'autotax.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS gemini_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_value TEXT UNIQUE NOT NULL,
      usage_count INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      status TEXT DEFAULT 'ok',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error("Error creating gemini_keys:", err.message);
    else console.log("Table gemini_keys ready.");
  });
});
