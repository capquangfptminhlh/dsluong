const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./backend/autotax.sqlite');

db.run(`ALTER TABLE pos_orders ADD COLUMN cancel_reason TEXT`, (err) => {
  if (err) {
    console.log("Column might already exist or error:", err.message);
  } else {
    console.log("Successfully added cancel_reason column to pos_orders");
  }
});
