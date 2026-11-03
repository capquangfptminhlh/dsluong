const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'autotax.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`ALTER TABLE users ADD COLUMN sector TEXT DEFAULT 'retail'`, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log("Column sector already exists.");
      } else {
        console.error("Error adding sector column:", err.message);
      }
    } else {
      console.log("Column sector added successfully.");
    }
  });
});
