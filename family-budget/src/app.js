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
const { alerts } = require('./alerts');
const { Auth, isPrivateIp } = require('./auth');

function createApp({ db, vault, port, createScraperImpl, lan }) {
  const app = express();
  app.disable('x-powered-by');
  const state = { syncing: false, unlockFails: 0, lockedUntil: 0 };
  const auth = new Auth(db);
  lan = lan || { _on: false, get() { return { enabled: this._on, addresses: [], port }; }, async set(on) { this._on = !!on; } };
  // Host מותר רק אם הוא localhost או כתובת IP פרטית (כתובת מספרית לא ניתנת ל-DNS rebinding) ובפורט הנכון
  const hostOk = (hostHeader) => {
    const m = String(hostHeader || '').match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
    if (!m || Number(m[2]) !== port) return false;
    const name = m[1];
    return name === 'localhost' || name === '[::1]' || (/^\d+\.\d+\.\d+\.\d+$/.test(name) && isPrivateIp(name));
  };

  // הגנה: רק מהרשת המקומית, מ-Host תקין, ומבקשות שנשלחו מהאפליקציה עצמה (CSRF)
  app.use((req, res, next) => {
    if (!isPrivateIp(req.socket.remoteAddress)) return res.status(403).json({ error: 'גישה מהרשת הביתית בלבד' });
    if (!hostOk(req.headers.host)) return res.status(403).json({ error: 'Host לא מורשה' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return res.status(403).json({ error: 'Origin לא מורשה' });
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

  // ---- משתמשים והתחברות ----
  // כל עוד לא הוגדרו משתמשים האפליקציה פתוחה (שימוש אישי על המחשב). ברגע שיש משתמשים, כל ה-API דורש התחברות.
  app.use('/api', (req, res, next) => {
    req.authEnabled = auth.usersExist();
    req.user = req.authEnabled ? auth.userFromRequest(req) : null;
    if (req.authEnabled && !req.user && !req.path.startsWith('/auth/')) return res.status(401).json({ error: 'נדרשת התחברות' });
    next();
  });
  const admin = (req) => { if (req.authEnabled && req.user?.role !== 'admin') { const e = new Error('הפעולה שמורה למנהל המשפחה'); e.status = 403; throw e; } };
  const ipOf = (req) => req.socket.remoteAddress || '';
  app.get('/api/auth/state', wrap((req, res) => res.json({ usersExist: req.authEnabled, user: req.user })));
  app.post('/api/auth/setup', wrap((req, res) => {
    need(!auth.usersExist(), 'כבר הוגדרו משתמשים');
    need(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ipOf(req)), 'את המשתמש הראשון יוצרים מהמחשב עצמו');
    const id = auth.createUser({ ...req.body, role: 'admin' });
    res.setHeader('Set-Cookie', auth.cookieFor(auth.createSession(id)));
    res.json({ ok: true });
  }));
  app.post('/api/auth/login', wrap((req, res) => {
    const u = auth.authenticate(req.body.username, req.body.password, ipOf(req));
    res.setHeader('Set-Cookie', auth.cookieFor(auth.createSession(u.id)));
    res.json({ ok: true });
  }));
  app.post('/api/auth/logout', wrap((req, res) => { auth.destroySession(req); res.setHeader('Set-Cookie', auth.clearCookie()); res.json({ ok: true }); }));
  app.post('/api/auth/password', wrap((req, res) => {
    need(req.user, 'נדרשת התחברות');
    auth.changeOwnPassword(req.user.id, req.body.current, req.body.next);
    res.setHeader('Set-Cookie', auth.cookieFor(auth.createSession(req.user.id)));
    res.json({ ok: true });
  }));
  app.get('/api/users', wrap((req, res) => { admin(req); res.json(auth.listUsers()); }));
  app.post('/api/users', wrap((req, res) => { admin(req); res.json({ id: auth.createUser({ ...req.body, role: req.body.role === 'admin' ? 'admin' : 'member' }) }); }));
  app.put('/api/users/:id/password', wrap((req, res) => { admin(req); auth.setPassword(intId(req.params.id), req.body.password); res.json({ ok: true }); }));
  app.delete('/api/users/:id', wrap((req, res) => { admin(req); auth.deleteUser(intId(req.params.id), req.user?.id); res.json({ ok: true }); }));
  app.get('/api/lan', wrap((req, res) => { admin(req); res.json(lan.get()); }));
  app.put('/api/lan', wrap(async (req, res) => {
    admin(req);
    need(auth.usersExist(), 'קודם צריך ליצור משתמשים עם סיסמה');
    await lan.set(!!req.body.enabled);
    res.json(lan.get());
  }));

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
  app.post('/api/vault/init', wrap((req, res) => { admin(req);
    need(!vault.exists(), 'הכספת כבר קיימת');
    vault.init(req.body.password);
    res.json({ ok: true });
  }));
  app.post('/api/vault/unlock', wrap((req, res) => { admin(req);
    if (Date.now() < state.lockedUntil) { const e = new Error('יותר מדי ניסיונות. נסה שוב בעוד דקה.'); e.status = 429; throw e; }
    try { vault.unlock(String(req.body.password || '')); state.unlockFails = 0; res.json({ ok: true }); }
    catch (e) {
      if (e instanceof WrongPasswordError && ++state.unlockFails >= 5) { state.lockedUntil = Date.now() + 60000; state.unlockFails = 0; }
      throw e;
    }
  }));
  app.post('/api/vault/lock', wrap((req, res) => { admin(req); vault.lock(); res.json({ ok: true }); }));

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
  app.post('/api/accounts', wrap((req, res) => { admin(req);
    need(vault.isUnlocked(), 'הכספת נעולה');
    const label = String(req.body.label || '').trim();
    need(label, 'חסר שם לחשבון');
    const creds = readCreds(req.body.company, req.body.credentials);
    const r = db.prepare('INSERT INTO accounts (label, company) VALUES (?,?)').run(label, req.body.company);
    const id = Number(r.lastInsertRowid);
    try { vault.set(id, creds); } catch (e) { db.prepare('DELETE FROM accounts WHERE id=?').run(id); throw e; }
    res.json({ id });
  }));
  app.put('/api/accounts/:id/credentials', wrap((req, res) => { admin(req);
    need(vault.isUnlocked(), 'הכספת נעולה');
    const a = db.prepare('SELECT * FROM accounts WHERE id=?').get(intId(req.params.id));
    need(a, 'חשבון לא נמצא');
    vault.set(a.id, readCreds(a.company, req.body.credentials));
    db.prepare('UPDATE accounts SET last_status=NULL WHERE id=?').run(a.id);
    res.json({ ok: true });
  }));
  app.delete('/api/accounts/:id', wrap((req, res) => { admin(req);
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
    res.json({ id: store.addManual(db, { createdBy: req.user?.id ?? null, date: b.date, amount: b.amount, description: b.description, type: b.type === 'income' ? 'income' : 'expense', categoryId: b.categoryId ? intId(b.categoryId) : null }) });
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
  app.get('/api/alerts', wrap((req, res) => { need(store.MONTH_RE.test(String(req.query.month)), 'חודש לא תקין'); res.json(alerts(db, req.query.month, accQ(req))); }));
  app.get('/api/year', wrap((req, res) => res.json(store.yearSummary(db, String(req.query.year), accQ(req)))));
  app.get('/api/export.csv', wrap((req, res) => {
    const month = req.query.month ? String(req.query.month) : 'all';
    const csv = store.exportCsv(db, { month, accountId: accQ(req) });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${month}.csv"`);
    res.send(csv);
  }));
  app.put('/api/income', wrap((req, res) => {
    const b = req.body;
    need(store.MONTH_RE.test(String(b.month)), 'חודש לא תקין');
    store.setIncome(db, b.month, b.amount === null || b.amount === '' ? null : Number(b.amount), !!b.all);
    res.json({ ok: true });
  }));
  app.get('/api/months', wrap((req, res) => res.json(db.prepare('SELECT DISTINCT substr(date,1,7) m FROM transactions ORDER BY m DESC').all().map((r) => r.m))));
  const SETTING_KEYS = ['ntfy_topic', 'ntfy_server', 'auto_sync', 'sync_hour', 'initial_months', 'savings_goal'];
  app.get('/api/settings', wrap((req, res) => {
    const isAdm = !req.authEnabled || req.user.role === 'admin';
    res.json({
    ntfy_topic: isAdm ? getSetting(db, 'ntfy_topic', '') : '', ntfy_server: isAdm ? getSetting(db, 'ntfy_server', '') : '',
    auto_sync: getSetting(db, 'auto_sync', '1'), savings_goal: getSetting(db, 'savings_goal', ''), sync_hour: getSetting(db, 'sync_hour', '6'), initial_months: getSetting(db, 'initial_months', '6'),
    });
  }));
  app.put('/api/settings', wrap((req, res) => {
    if (req.authEnabled && req.user.role !== 'admin' && Object.keys(req.body).some((k) => k !== 'savings_goal')) { const e = new Error('הפעולה שמורה למנהל המשפחה'); e.status = 403; throw e; }
    const b = req.body;
    for (const k of SETTING_KEYS) {
      if (b[k] === undefined) continue;
      const v = String(b[k]).trim();
      if (k === 'ntfy_server') need(v === '' || /^https?:\/\/[^\s]+$/.test(v), 'כתובת שרת ntfy לא תקינה');
      if (k === 'ntfy_topic') need(/^[A-Za-z0-9_-]{0,64}$/.test(v), 'נושא ntfy: אותיות לטיניות, ספרות, - ו-_ בלבד');
      if (k === 'sync_hour') need(/^([0-9]|1[0-9]|2[0-3])$/.test(v), 'שעה בין 0 ל-23');
      if (k === 'initial_months') need(/^([1-9]|1[0-2])$/.test(v), 'חודשים בין 1 ל-12');
      if (k === 'savings_goal') need(v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'יעד חיסכון לא תקין');
      if (k === 'auto_sync') need(v === '0' || v === '1', 'ערך לא תקין');
      setSetting(db, k, v);
    }
    res.json({ ok: true });
  }));
  app.post('/api/settings/test-notify', wrap(async (req, res) => { admin(req);
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
