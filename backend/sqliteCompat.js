'use strict';

const BetterSqlite3 = require('better-sqlite3');

const OPEN_READONLY = 1;
const OPEN_READWRITE = 2;
const OPEN_CREATE = 4;

function splitCallback(args) {
  const values = [...args];
  const callback = typeof values.at(-1) === 'function' ? values.pop() : null;
  return { values, callback };
}

function normalizeBindings(values) {
  if (values.length === 0) return [];
  if (values.length === 1) {
    const only = values[0];
    if (Array.isArray(only)) return only;
    if (only && typeof only === 'object' && !Buffer.isBuffer(only) && !(only instanceof Date)) return only;
  }
  return values;
}

function invokeStatement(statement, method, bindings) {
  if (Array.isArray(bindings)) return statement[method](...bindings);
  return statement[method](bindings);
}

function callbackLater(callback, context, ...args) {
  if (!callback) return;
  queueMicrotask(() => callback.call(context, ...args));
}

class StatementCompat {
  constructor(database, sql, onPrepared) {
    this.database = database;
    this.sql = sql;
    this._statement = null;
    this.lastID = 0;
    this.changes = 0;

    try {
      this._statement = database._native.prepare(sql);
      callbackLater(onPrepared, this, null);
    } catch (error) {
      callbackLater(onPrepared, this, error);
      if (!onPrepared) throw error;
    }
  }

  run(...args) {
    const { values, callback } = splitCallback(args);
    try {
      const bindings = normalizeBindings(values);
      let info;
      if (this._statement.reader) {
        invokeStatement(this._statement, 'all', bindings);
        info = { changes: 0, lastInsertRowid: 0 };
      } else {
        info = invokeStatement(this._statement, 'run', bindings);
      }
      this.changes = Number(info?.changes || 0);
      this.lastID = Number(info?.lastInsertRowid || 0);

      // node-sqlite3 exposes lastID/changes for the specific execution inside
      // each callback. Our native calls are synchronous but callbacks are queued,
      // so capture an execution context instead of sharing the mutable Statement.
      const callbackContext = Object.create(this);
      callbackContext.changes = this.changes;
      callbackContext.lastID = this.lastID;
      callbackLater(callback, callbackContext, null);
    } catch (error) {
      callbackLater(callback, this, error);
      if (!callback) throw error;
    }
    return this;
  }

  get(...args) {
    const { values, callback } = splitCallback(args);
    try {
      const row = invokeStatement(this._statement, 'get', normalizeBindings(values));
      if (callback) callbackLater(callback, this, null, row);
      else return row;
    } catch (error) {
      callbackLater(callback, this, error);
      if (!callback) throw error;
    }
    return this;
  }

  all(...args) {
    const { values, callback } = splitCallback(args);
    try {
      const rows = invokeStatement(this._statement, 'all', normalizeBindings(values));
      if (callback) callbackLater(callback, this, null, rows);
      else return rows;
    } catch (error) {
      callbackLater(callback, this, error);
      if (!callback) throw error;
    }
    return this;
  }

  each(...args) {
    const values = [...args];
    const completion = typeof values.at(-1) === 'function' && typeof values.at(-2) === 'function' ? values.pop() : null;
    const rowCallback = typeof values.at(-1) === 'function' ? values.pop() : null;
    if (!rowCallback) throw new TypeError('Statement#each requires a row callback');

    try {
      const rows = invokeStatement(this._statement, 'all', normalizeBindings(values));
      rows.forEach((row) => callbackLater(rowCallback, this, null, row));
      callbackLater(completion, this, null, rows.length);
    } catch (error) {
      callbackLater(rowCallback, this, error);
      callbackLater(completion, this, error, 0);
    }
    return this;
  }

  bind(...args) {
    const { values, callback } = splitCallback(args);
    try {
      const bindings = normalizeBindings(values);
      if (Array.isArray(bindings)) this._statement.bind(...bindings);
      else this._statement.bind(bindings);
      callbackLater(callback, this, null);
    } catch (error) {
      callbackLater(callback, this, error);
      if (!callback) throw error;
    }
    return this;
  }

  reset(callback) {
    // better-sqlite3 statements are reusable without an explicit reset call.
    callbackLater(callback, this, null);
    return this;
  }

  finalize(callback) {
    // better-sqlite3 finalizes prepared statements automatically. Keeping this
    // method preserves sqlite3 callback ordering for legacy code.
    callbackLater(callback, this, null);
    return this;
  }
}

class DatabaseCompat {
  constructor(filename, mode, callback) {
    if (typeof mode === 'function') {
      callback = mode;
      mode = undefined;
    }

    this.filename = filename;
    this.open = false;
    this._native = null;

    try {
      const readonly = Boolean((mode || 0) & OPEN_READONLY) && !Boolean((mode || 0) & OPEN_READWRITE);
      const fileMustExist = readonly || (Boolean(mode) && !Boolean(mode & OPEN_CREATE));
      this._native = new BetterSqlite3(filename, { readonly, fileMustExist });
      this.open = true;
      this._native.pragma('busy_timeout = 5000');
      callbackLater(callback, this, null);
    } catch (error) {
      callbackLater(callback, this, error);
      if (!callback) throw error;
    }
  }

  prepare(sql, ...args) {
    const { values, callback } = splitCallback(args);
    const statement = new StatementCompat(this, sql, callback);
    if (values.length) statement.bind(...values);
    return statement;
  }

  run(sql, ...args) {
    const { values, callback } = splitCallback(args);
    const context = { lastID: 0, changes: 0 };
    try {
      const statement = this._native.prepare(sql);
      const bindings = normalizeBindings(values);
      let info;
      if (statement.reader) {
        invokeStatement(statement, 'all', bindings);
        info = { changes: 0, lastInsertRowid: 0 };
      } else {
        info = invokeStatement(statement, 'run', bindings);
      }
      context.changes = Number(info?.changes || 0);
      context.lastID = Number(info?.lastInsertRowid || 0);
      callbackLater(callback, context, null);
    } catch (error) {
      callbackLater(callback, context, error);
      if (!callback) throw error;
    }
    return this;
  }

  get(sql, ...args) {
    const { values, callback } = splitCallback(args);
    try {
      const row = invokeStatement(this._native.prepare(sql), 'get', normalizeBindings(values));
      if (callback) callbackLater(callback, this, null, row);
      else return row;
    } catch (error) {
      callbackLater(callback, this, error);
      if (!callback) throw error;
    }
    return this;
  }

  all(sql, ...args) {
    const { values, callback } = splitCallback(args);
    try {
      const rows = invokeStatement(this._native.prepare(sql), 'all', normalizeBindings(values));
      if (callback) callbackLater(callback, this, null, rows);
      else return rows;
    } catch (error) {
      callbackLater(callback, this, error);
      if (!callback) throw error;
    }
    return this;
  }

  each(sql, ...args) {
    const statement = new StatementCompat(this, sql);
    return statement.each(...args);
  }

  exec(sql, callback) {
    try {
      this._native.exec(sql);
      callbackLater(callback, this, null);
    } catch (error) {
      callbackLater(callback, this, error);
      if (!callback) throw error;
    }
    return this;
  }

  serialize(callback) {
    if (typeof callback === 'function') callback();
    return this;
  }

  parallelize(callback) {
    if (typeof callback === 'function') callback();
    return this;
  }

  configure(option, value) {
    if (option === 'busyTimeout') this._native.pragma(`busy_timeout = ${Number(value) || 0}`);
    return this;
  }

  close(callback) {
    try {
      if (this.open && this._native?.open) this._native.close();
      this.open = false;
      callbackLater(callback, this, null);
    } catch (error) {
      callbackLater(callback, this, error);
      if (!callback) throw error;
    }
  }
}

const sqliteCompat = {
  Database: DatabaseCompat,
  OPEN_READONLY,
  OPEN_READWRITE,
  OPEN_CREATE,
  verbose() { return this; },
};

module.exports = sqliteCompat;
