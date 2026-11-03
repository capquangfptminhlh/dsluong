const sqlite3 = require('./sqliteCompat').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'autotax.db');
const db = new sqlite3.Database(dbPath);

const columns = [
  'taxCode TEXT',
  'oldTaxCode TEXT',
  'email TEXT',
  'province TEXT',
  'ward TEXT',
  'address TEXT',
  'taxDepartment TEXT'
];

db.serialize(() => {
  columns.forEach(col => {
    const colName = col.split(' ')[0];
    db.run(`ALTER TABLE users ADD COLUMN ${col}`, (err) => {
      if (err) {
        console.log(`Column ${colName} might already exist or error:`, err.message);
      } else {
        console.log(`Added column ${colName}`);
      }
    });
  });
});
db.close();
