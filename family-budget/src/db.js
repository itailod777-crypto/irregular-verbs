'use strict';
// SQLite מקומי דרך node:sqlite המובנה ב-Node 22 (בלי תלות native).
const origEmit = process.emitWarning;
process.emitWarning = function (w, ...a) {
  const type = typeof a[0] === 'string' ? a[0] : a[0] && a[0].type;
  if (type === 'ExperimentalWarning' && /SQLite/i.test(String(w))) return;
  return origEmit.call(process, w, ...a);
};
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = origEmit;

const { CATEGORIES, RULES } = require('./seed-data');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('expense','income','transfer')),
  color TEXT NOT NULL DEFAULT '#adb5bd', recurring_default INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY, label TEXT NOT NULL, company TEXT NOT NULL,
  last_sync TEXT, last_status TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY, pattern TEXT NOT NULL, category_id INTEGER NOT NULL REFERENCES categories(id),
  sign TEXT NOT NULL DEFAULT 'any', whole_word INTEGER NOT NULL DEFAULT 0, builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY, hash TEXT UNIQUE NOT NULL, date TEXT NOT NULL, amount REAL NOT NULL,
  description TEXT NOT NULL, norm TEXT NOT NULL, memo TEXT, category_id INTEGER NOT NULL REFERENCES categories(id),
  manual_category INTEGER NOT NULL DEFAULT 0, ignored INTEGER NOT NULL DEFAULT 0,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL, source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_cat ON transactions(category_id);
CREATE TABLE IF NOT EXISTS budgets (category_id INTEGER PRIMARY KEY REFERENCES categories(id), amount REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, account_id INTEGER, account_label TEXT,
  status TEXT NOT NULL, added INTEGER NOT NULL DEFAULT 0, duplicates INTEGER NOT NULL DEFAULT 0,
  pending_skipped INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE TABLE IF NOT EXISTS recurring_overrides (key TEXT PRIMARY KEY, recurring INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db) {
  const hasCats = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
  if (hasCats) return;
  db.exec('BEGIN');
  try {
    const insCat = db.prepare('INSERT INTO categories (name, kind, color) VALUES (?,?,?)');
    for (const [n, k, c] of CATEGORIES) insCat.run(n, k, c);
    const RECURRING = ['חשמל', 'מים וגז', 'ארנונה', 'סלולר ואינטרנט', 'מנויים', 'ביטוח', 'שכר דירה ומשכנתא'];
    for (const n of RECURRING) db.prepare('UPDATE categories SET recurring_default=1 WHERE name=?').run(n);
    const catId = (n) => db.prepare('SELECT id FROM categories WHERE name=?').get(n).id;
    const insRule = db.prepare('INSERT INTO rules (pattern, category_id, sign, whole_word, builtin) VALUES (?,?,?,?,1)');
    for (const [cat, patterns, opts = {}] of RULES) {
      const id = catId(cat);
      for (const p of patterns) insRule.run(p.trim(), id, opts.sign || 'any', opts.whole ? 1 : 0);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function getSetting(db, key, def = null) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : def;
}
function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}

module.exports = { openDb, tx, getSetting, setSetting };
