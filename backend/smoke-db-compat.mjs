import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const require = createRequire(import.meta.url);
const sqlite3 = require('./sqliteCompat').verbose();
const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const PASSWORD = 'AuditCore2026!';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function openDb(file, mode) {
  return new Promise((resolve, reject) => {
    const db = mode === undefined
      ? new sqlite3.Database(file, (error) => (error ? reject(error) : resolve(db)))
      : new sqlite3.Database(file, mode, (error) => (error ? reject(error) : resolve(db)));
  });
}

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(error) {
    if (error) return reject(error);
    resolve({ lastID: this.lastID, changes: this.changes });
  });
});
const get = (db, sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row))));
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows))));
const close = (db) => new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));

async function directCompatSmoke() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autotax-db-compat-'));
  const file = path.join(dir, 'source.db');
  const backup = path.join(dir, 'backup.db');
  const db = await openDb(file);

  await run(db, 'CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  const first = await run(db, 'INSERT INTO t (name) VALUES (?)', ['one']);
  assert(first.lastID === 1 && first.changes === 1, `run callback metadata mismatch: ${JSON.stringify(first)}`);

  const stmt = db.prepare('INSERT INTO t (name) VALUES (?)');
  const callbackOrder = [];
  await new Promise((resolve, reject) => {
    stmt.run('two', function onTwo(error) {
      if (error) return reject(error);
      callbackOrder.push(`run:${this.lastID}`);
    });
    stmt.run('three', function onThree(error) {
      if (error) return reject(error);
      callbackOrder.push(`run:${this.lastID}`);
    });
    stmt.finalize((error) => {
      if (error) return reject(error);
      callbackOrder.push('finalize');
      resolve();
    });
  });
  assert(callbackOrder.join(',') === 'run:2,run:3,finalize', `prepared callback order mismatch: ${callbackOrder.join(',')}`);

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE', (beginError) => {
        if (beginError) return reject(beginError);
      });
      const tx = db.prepare('INSERT INTO t (name) VALUES (?)');
      tx.run('four', (error) => { if (error) reject(error); });
      tx.finalize((finalizeError) => {
        if (finalizeError) return reject(finalizeError);
        db.run('COMMIT', (commitError) => (commitError ? reject(commitError) : resolve()));
      });
    });
  });

  const row = await get(db, 'SELECT name FROM t WHERE id = ?', [4]);
  assert(row?.name === 'four', `get mismatch: ${JSON.stringify(row)}`);
  const rows = await all(db, 'SELECT id, name FROM t ORDER BY id');
  assert(rows.length === 4, `all mismatch: expected 4 rows, got ${rows.length}`);

  await run(db, 'VACUUM INTO ?', [backup]);
  assert(fs.existsSync(backup) && fs.statSync(backup).size > 0, 'VACUUM INTO did not create backup');
  await close(db);

  const readonly = await openDb(backup, sqlite3.OPEN_READONLY);
  const backupCount = await get(readonly, 'SELECT COUNT(*) AS c FROM t');
  assert(Number(backupCount?.c) === 4, `readonly backup count mismatch: ${JSON.stringify(backupCount)}`);
  let readonlyRejected = false;
  try { await run(readonly, 'INSERT INTO t (name) VALUES (?)', ['blocked']); } catch { readonlyRejected = true; }
  assert(readonlyRejected, 'readonly database accepted a write');
  await close(readonly);
  fs.rmSync(dir, { recursive: true, force: true });
}

async function jsonCall(pathname, { method = 'GET', token, body, expected = 200 } = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  assert(response.status === expected, `${method} ${pathname}: expected ${expected}, got ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function backupApiSmoke() {
  const owner = await jsonCall('/auth/login', {
    method: 'POST',
    body: { phone: '0911111111', password: PASSWORD },
  });
  assert(owner?.token, 'Tenant A login missing token');
  await jsonCall('/backup/create', { method: 'POST', token: owner.token, body: {}, expected: 403 });

  const superadminPhone = '0979164124';
  const sqlite = new Database('autotax.db');
  sqlite.pragma('busy_timeout = 5000');
  const adminHash = await bcrypt.hash(PASSWORD, 10);
  sqlite.prepare('DELETE FROM users WHERE phone = ?').run(superadminPhone);
  sqlite.prepare(
    `INSERT INTO users (name, phone, password_hash, role, status, sector)
     VALUES ('Superadmin DB Compat', ?, ?, 'superadmin', 'active', 'retail')`,
  ).run(superadminPhone, adminHash);
  sqlite.close();

  const login = await jsonCall('/auth/login', {
    method: 'POST',
    body: { phone: superadminPhone, password: PASSWORD },
  });
  assert(login?.token && login?.user?.role === 'superadmin', 'Out-of-band superadmin login missing token/role');

  const created = await jsonCall('/backup/create', { method: 'POST', token: login.token, body: {} });
  assert(created?.name && Number(created.size) > 0, `backup create response invalid: ${JSON.stringify(created)}`);

  const download = await fetch(`${BASE}/backup/download/${encodeURIComponent(created.name)}`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  assert(download.status === 200, `backup download failed: ${download.status}`);
  const bytes = await download.arrayBuffer();
  assert(bytes.byteLength > 0, 'backup download was empty');

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), 'restore-test.db');
  const restore = await fetch(`${BASE}/backup/restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.token}` },
    body: form,
  });
  const restoreText = await restore.text();
  assert(restore.status === 200, `backup restore validation failed: ${restore.status}: ${restoreText}`);
  const restoreData = JSON.parse(restoreText);
  assert(restoreData?.can_khoi_dong_lai === true, `restore response mismatch: ${restoreText}`);

  await jsonCall('/backup/restore/pending', { method: 'DELETE', token: login.token });
  await jsonCall(`/backup/${encodeURIComponent(created.name)}`, { method: 'DELETE', token: login.token });
}

await directCompatSmoke();
await backupApiSmoke();
console.log('DB COMPAT SMOKE PASSED: callback metadata/order + transaction + readonly + VACUUM + owner backup denial + superadmin backup/restore API');
