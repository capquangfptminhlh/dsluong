const sqlite3 = require('./sqliteCompat').verbose();
const db = new sqlite3.Database('./autotax.db');

db.run(`ALTER TABLE products ADD COLUMN image_url TEXT`, (err) => {
  if (err) {
    console.log("Column might already exist or error:", err.message);
  } else {
    console.log("Added image_url column to products table.");
  }
});
