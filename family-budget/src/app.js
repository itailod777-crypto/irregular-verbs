'use strict';
const express = require('express');
const path = require('path');
const { getSetting, setSetting } = require('./db');
const store = require('./store');
const { parseFile } = require('./importer');
const { runSync } = require('./sync');
const { listCompanies, getCompany } = require('./companies');
const { notifyFailure } = require('./notify');
const { WrongPasswordError } = require('./crypto');
const recurring = require('./recurring');

function createApp({ db, vault, port, createScraperImpl }) {
  const app = express();
  app.disable('x-powered-by');
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));
  const state = { syncing: false, unlockFails: 0, lockedUntil: 0 };

  // הגנה מפני DNS-rebinding ו-CSRF מאתרים אחרים בדפדפן
  app.use((req, res, next) => {
    if (!allowedHosts.has(req.headers.host)) return res.status(403).json({ error: 'Host לא מורשה' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return res.status(403).json({ error: 'Origin לא מורשה' });
      if (req.headers['x-requested-with'] !== 'budget') return res.status(403).json({ error: 'בקשה לא מורשית' });
    }
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      const status = e.status || (e instanceof WrongPasswordError ? 401 : 400);
      res.status(status).json({ error: e.message || 'שגיאה' });
    }
  };
  const need = (cond, msg) => { if (!cond) { const e = new Error(msg); e.status = 400; throw e; } };
  const intId = (v) => { const n = Number(v); need(Number.isInteger(n) && n > 0, 'מזהה לא תקין'); return n; };

  // ---- סטטוס וכספת ----
  app.get('/api/status', wrap((req, res) => {
    const accounts = db.prepare('SELECT id,label,company,last_sync,last_status FROM accounts ORDER BY id').all();
    const failing = accounts.filter((a) => a.last_status && a.last_status !== 'ok');
    const last = db.prepare("SELECT * FROM sync_log WHERE status<>'running' ORDER BY id DESC LIMIT 1").get() || null;
    res.json({
      vault: !vault.exists() ? 'missing' : vault.isUnlocked() ? 'unlocked' : 'locked',
      syncing: state.syncing, accounts: accounts.length, failing, lastSync: last,
    });
  }));
  app.post('/api/vault/init', wrap((req, res) => {
    need(!vault.exists(), 'הכספת כבר קיימת');
    vault.init(req.body.password);
    res.json({ ok: true });
  }));
  app.post('/api/vault/unlock', wrap((req, res) => {
    if (Date.now() < state.lockedUntil) { const e = new Error('יותר מדי ניסיונות. נסה שוב בעוד דקה.'); e.status = 429; throw e; }
    try { vault.unlock(String(req.body.password || '')); state.unlockFails = 0; res.json({ ok: true }); }
    catch (e) {
      if (e instanceof WrongPasswordError && ++state.unlockFails >= 5) { state.lockedUntil = Date.now() + 60000; state.unlockFails = 0; }
      throw e;
    }
  }));
  app.post('/api/vault/lock', wrap((req, res) => { vault.lock(); res.json({ ok: true }); }));

  // ---- חשבונות (פרטי כניסה נשמרים רק בכספת המוצפנת ולעולם לא מוחזרים) ----
  app.get('/api/companies', wrap((req, res) => res.json(listCompanies())));
  app.get('/api/accounts', wrap((req, res) => res.json(db.prepare('SELECT id,label,company,last_sync,last_status FROM accounts ORDER BY id').all())));
  const readCreds = (company, input) => {
    const c = getCompany(company);
    need(c, 'חברה לא מוכרת');
    need(!c.needsSms, 'חשבון שדורש קוד SMS מוגדר דרך הטרמינל: npm run set-credentials');
    const creds = {};
    for (const f of c.fields) {
      const v = String(input?.[f.key] ?? '').trim();
      need(v, `חסר שדה: ${f.label}`);
      creds[f.key] = v;
    }
    return creds;
  };
  app.post('/api/accounts', wrap((req, res) => {
    need(vault.isUnlocked(), 'הכספת נעולה');
    const label = String(req.body.label || '').trim();
    need(label, 'חסר שם לחשבון');
    const creds = readCreds(req.body.company, req.body.credentials);
    const r = db.prepare('INSERT INTO accounts (label, company) VALUES (?,?)').run(label, req.body.company);
    const id = Number(r.lastInsertRowid);
    try { vault.set(id, creds); } catch (e) { db.prepare('DELETE FROM accounts WHERE id=?').run(id); throw e; }
    res.json({ id });
  }));
  app.put('/api/accounts/:id/credentials', wrap((req, res) => {
    need(vault.isUnlocked(), 'הכספת נעולה');
    const a = db.prepare('SELECT * FROM accounts WHERE id=?').get(intId(req.params.id));
    need(a, 'חשבון לא נמצא');
    vault.set(a.id, readCreds(a.company, req.body.credentials));
    db.prepare('UPDATE accounts SET last_status=NULL WHERE id=?').run(a.id);
    res.json({ ok: true });
  }));
  app.delete('/api/accounts/:id', wrap((req, res) => {
    need(vault.isUnlocked(), 'הכספת נעולה');
    const id = intId(req.params.id);
    vault.remove(id);
    db.prepare('DELETE FROM accounts WHERE id=?').run(id);
    res.json({ ok: true });
  }));

  // ---- משיכה ----
  app.post('/api/sync', wrap((req, res) => {
    need(vault.isUnlocked(), 'הכספת נעולה. הזן סיסמת-על.');
    need(!state.syncing, 'משיכה כבר רצה');
    need(db.prepare('SELECT COUNT(*) c FROM accounts').get().c > 0, 'אין חשבונות מוגדרים. הוסף חשבון תחילה.');
    state.syncing = true;
    runSync({ db, vault, accountId: req.body?.accountId ? intId(req.body.accountId) : null, createScraperImpl })
      .catch(() => {}).finally(() => { state.syncing = false; });
    res.json({ started: true });
  }));
  app.get('/api/sync/log', wrap((req, res) => res.json(db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 100').all())));

  // ---- קטגוריות, חוקים, תקציב ----
  app.get('/api/categories', wrap((req, res) => res.json(db.prepare('SELECT * FROM categories ORDER BY kind, id').all())));
  app.post('/api/categories', wrap((req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 40);
    need(name, 'חסר שם קטגוריה');
    const kind = ['expense', 'income', 'transfer'].includes(req.body.kind) ? req.body.kind : 'expense';
    const color = /^#[0-9a-fA-F]{6}$/.test(req.body.color || '') ? req.body.color : '#868e96';
    need(!db.prepare('SELECT 1 FROM categories WHERE name=?').get(name), 'קטגוריה בשם הזה כבר קיימת');
    const r = db.prepare('INSERT INTO categories (name, kind, color, recurring_default) VALUES (?,?,?,?)').run(name, kind, color, req.body.recurring ? 1 : 0);
    res.json({ id: Number(r.lastInsertRowid) });
  }));
  app.put('/api/categories/:id', wrap((req, res) => {
    const id = intId(req.params.id);
    const c = db.prepare('SELECT * FROM categories WHERE id=?').get(id);
    need(c, 'קטגוריה לא נמצאה');
    const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 40) : c.name;
    need(name, 'חסר שם');
    const dupe = db.prepare('SELECT id FROM categories WHERE name=? AND id<>?').get(name, id);
    need(!dupe, 'קטגוריה בשם הזה כבר קיימת');
    const color = /^#[0-9a-fA-F]{6}$/.test(req.body.color || '') ? req.body.color : c.color;
    const rd = req.body.recurring === undefined ? c.recurring_default : (req.body.recurring ? 1 : 0);
    db.prepare('UPDATE categories SET name=?, color=?, recurring_default=? WHERE id=?').run(name, color, rd, id);
    res.json({ ok: true });
  }));
  app.delete('/api/categories/:id', wrap((req, res) => {
    const id = intId(req.params.id);
    const c = db.prepare('SELECT * FROM categories WHERE id=?').get(id);
    need(c, 'קטגוריה לא נמצאה');
    need(!['אחר', 'הכנסה אחרת'].includes(c.name), 'קטגוריית ברירת המחדל אינה ניתנת למחיקה');
    const to = db.prepare('SELECT id FROM categories WHERE name=?').get(c.kind === 'income' ? 'הכנסה אחרת' : 'אחר').id;
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE transactions SET category_id=? WHERE category_id=?').run(to, id);
      db.prepare('DELETE FROM rules WHERE category_id=?').run(id);
      db.prepare('DELETE FROM budgets WHERE category_id=?').run(id);
      db.prepare('DELETE FROM categories WHERE id=?').run(id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.json({ ok: true });
  }));
  app.get('/api/recurring', wrap((req, res) => { need(store.MONTH_RE.test(String(req.query.month)), 'חודש לא תקין'); res.json(recurring.recurringPage(db, req.query.month, accQ(req))); }));
  app.get('/api/onetime', wrap((req, res) => { need(store.MONTH_RE.test(String(req.query.month)), 'חודש לא תקין'); res.json(recurring.oneTimePage(db, req.query.month, accQ(req))); }));
  app.put('/api/recurring/override', wrap((req, res) => {
    const v = req.body.recurring;
    need(v === null || typeof v === 'boolean', 'ערך לא תקין');
    recurring.setOverride(db, req.body.key, v);
    res.json({ ok: true });
  }));
  app.get('/api/rules', wrap((req, res) => res.json(db.prepare(
    'SELECT r.*, c.name category FROM rules r JOIN categories c ON c.id=r.category_id ORDER BY r.builtin, r.id DESC').all())));
  app.post('/api/rules', wrap((req, res) => {
    const b = req.body;
    res.json(store.createRule(db, { pattern: String(b.pattern || ''), categoryId: intId(b.categoryId),
      sign: ['any', 'positive', 'negative'].includes(b.sign) ? b.sign : 'any', wholeWord: !!b.wholeWord, apply: b.apply !== false }));
  }));
  app.delete('/api/rules/:id', wrap((req, res) => { db.prepare('DELETE FROM rules WHERE id=?').run(intId(req.params.id)); res.json({ ok: true }); }));
  app.post('/api/rules/recategorize', wrap((req, res) => res.json({ updated: store.recategorizeAll(db) })));
  app.get('/api/budgets', wrap((req, res) => res.json(db.prepare('SELECT category_id, amount FROM budgets').all())));
  app.put('/api/budgets/:categoryId', wrap((req, res) => {
    const cid = intId(req.params.categoryId);
    const amount = Number(req.body.amount);
    need(Number.isFinite(amount) && amount >= 0, 'סכום לא תקין');
    need(db.prepare("SELECT 1 FROM categories WHERE id=? AND kind='expense'").get(cid), 'קטגוריה לא תקינה');
    if (amount === 0) db.prepare('DELETE FROM budgets WHERE category_id=?').run(cid);
    else db.prepare('INSERT INTO budgets (category_id, amount) VALUES (?,?) ON CONFLICT(category_id) DO UPDATE SET amount=excluded.amount').run(cid, amount);
    res.json({ ok: true });
  }));

  // ---- עסקאות ----
  app.get('/api/transactions', wrap((req, res) => res.json(store.listTransactions(db, req.query))));
  app.post('/api/transactions', wrap((req, res) => {
    const b = req.body;
    res.json({ id: store.addManual(db, { date: b.date, amount: b.amount, description: b.description, type: b.type === 'income' ? 'income' : 'expense', categoryId: b.categoryId ? intId(b.categoryId) : null }) });
  }));
  app.patch('/api/transactions/:id', wrap((req, res) => {
    const id = intId(req.params.id);
    const t = db.prepare('SELECT * FROM transactions WHERE id=?').get(id);
    need(t, 'עסקה לא נמצאה');
    let result = {};
    if (req.body.categoryId !== undefined) result = store.setCategory(db, id, intId(req.body.categoryId));
    if (req.body.ignored !== undefined) db.prepare('UPDATE transactions SET ignored=? WHERE id=?').run(req.body.ignored ? 1 : 0, id);
    if (req.body.memo !== undefined) db.prepare('UPDATE transactions SET memo=? WHERE id=?').run(String(req.body.memo).slice(0, 300) || null, id);
    res.json(result);
  }));
  app.delete('/api/transactions/:id', wrap((req, res) => {
    const id = intId(req.params.id);
    const t = db.prepare('SELECT source FROM transactions WHERE id=?').get(id);
    need(t, 'עסקה לא נמצאה');
    need(t.source === 'manual', 'אפשר למחוק רק עסקאות ידניות. עסקה אחרת אפשר להסתיר (ignored) כדי שלא תחזור במשיכה הבאה.');
    db.prepare('DELETE FROM transactions WHERE id=?').run(id);
    res.json({ ok: true });
  }));

  // ---- יבוא קובץ ----
  const raw = express.raw({ type: () => true, limit: '20mb' });
  const parseUpload = async (req) => {
    need(Buffer.isBuffer(req.body) && req.body.length, 'לא התקבל קובץ');
    const name = decodeURIComponent(String(req.headers['x-filename'] || 'file.csv'));
    return parseFile(req.body, name, { sign: req.query.sign || 'auto' });
  };
  app.post('/api/import/preview', raw, wrap(async (req, res) => {
    const p = await parseUpload(req);
    res.json({ columns: p.columns, signMode: p.signMode, invalid: p.invalid, count: p.rows.length,
      ...store.previewDuplicates(db, p.rows), sample: p.rows.slice(0, 8) });
  }));
  app.post('/api/import/commit', raw, wrap(async (req, res) => {
    const p = await parseUpload(req);
    const accountId = req.query.accountId ? intId(req.query.accountId) : null;
    const r = store.addTransactions(db, p.rows, { source: 'import', accountId });
    db.prepare('INSERT INTO sync_log (started_at, finished_at, account_label, status, added, duplicates) VALUES (?,?,?,?,?,?)')
      .run(new Date().toISOString(), new Date().toISOString(), 'יבוא קובץ', 'ok', r.added, r.duplicates);
    res.json({ ...r, invalid: p.invalid });
  }));

  // ---- סיכומים והגדרות ----
  const accQ = (req) => (req.query.accountId ? intId(req.query.accountId) : null);
  app.get('/api/summary', wrap((req, res) => res.json(store.summary(db, String(req.query.month), accQ(req)))));
  app.get('/api/insights', wrap((req, res) => { need(store.MONTH_RE.test(String(req.query.month)), 'חודש לא תקין'); res.json(store.insights(db, req.query.month, accQ(req))); }));
  app.put('/api/income', wrap((req, res) => {
    const b = req.body;
    need(store.MONTH_RE.test(String(b.month)), 'חודש לא תקין');
    store.setIncome(db, b.month, b.amount === null || b.amount === '' ? null : Number(b.amount), !!b.all);
    res.json({ ok: true });
  }));
  app.get('/api/months', wrap((req, res) => res.json(db.prepare('SELECT DISTINCT substr(date,1,7) m FROM transactions ORDER BY m DESC').all().map((r) => r.m))));
  const SETTING_KEYS = ['ntfy_topic', 'ntfy_server', 'auto_sync', 'sync_hour', 'initial_months'];
  app.get('/api/settings', wrap((req, res) => res.json({
    ntfy_topic: getSetting(db, 'ntfy_topic', ''), ntfy_server: getSetting(db, 'ntfy_server', ''),
    auto_sync: getSetting(db, 'auto_sync', '1'), sync_hour: getSetting(db, 'sync_hour', '6'), initial_months: getSetting(db, 'initial_months', '6'),
  })));
  app.put('/api/settings', wrap((req, res) => {
    const b = req.body;
    for (const k of SETTING_KEYS) {
      if (b[k] === undefined) continue;
      const v = String(b[k]).trim();
      if (k === 'ntfy_server') need(v === '' || /^https?:\/\/[^\s]+$/.test(v), 'כתובת שרת ntfy לא תקינה');
      if (k === 'ntfy_topic') need(/^[A-Za-z0-9_-]{0,64}$/.test(v), 'נושא ntfy: אותיות לטיניות, ספרות, - ו-_ בלבד');
      if (k === 'sync_hour') need(/^([0-9]|1[0-9]|2[0-3])$/.test(v), 'שעה בין 0 ל-23');
      if (k === 'initial_months') need(/^([1-9]|1[0-2])$/.test(v), 'חודשים בין 1 ל-12');
      if (k === 'auto_sync') need(v === '0' || v === '1', 'ערך לא תקין');
      setSetting(db, k, v);
    }
    res.json({ ok: true });
  }));
  app.post('/api/settings/test-notify', wrap(async (req, res) => {
    const r = await notifyFailure(db, 'בדיקת התראה מ-Family Budget');
    need(r.sent, 'ההתראה לא נשלחה. ודא שהוגדר נושא ושיש חיבור לאינטרנט.');
    res.json({ ok: true });
  }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: 0 }));
  app.use((req, res) => res.status(404).json({ error: 'לא נמצא' }));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    res.status(err.status || 400).json({ error: err.type === 'entity.too.large' ? 'הקובץ גדול מדי' : 'בקשה לא תקינה' });
  });
  app._state = state;
  return app;
}

module.exports = { createApp };
