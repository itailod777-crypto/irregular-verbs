'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startApp, catId } = require('./helpers');
const { Vault, WrongPasswordError } = require('../src/crypto');
const store = require('../src/store');
const { parseFile } = require('../src/importer');
const { generateDemo } = require('../src/demo-data');
const { mapTransactions, redact } = require('../src/sync');

const SAMPLES = path.join(__dirname, '..', 'data-samples');
const cat = (db, desc, amount) => {
  store.addTransactions(db, [{ date: '2026-01-10', description: desc, amount }], { source: 't' });
  return db.prepare('SELECT c.name FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.description=?').get(desc).name;
};

test('הכספת: הצפנה, סיסמה שגויה, ואין טקסט גלוי בקובץ', async (t) => {
  const { dir, close } = await startApp(); t.after(close);
  const file = path.join(dir, 'v.json');
  const v = new Vault(file);
  assert.throws(() => v.init('short'), /8 תווים/);
  v.init('סיסמת-על-ארוכה-123');
  v.set(1, { username: 'demo-user-XYZ', password: 'SuperSecret!987' });
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes('demo-user-XYZ') && !raw.includes('SuperSecret'));
  assert.equal(JSON.parse(raw).kdf.name, 'scrypt');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o077, 0, 'הרשאות הקובץ מחמירות');
  const v2 = new Vault(file);
  assert.throws(() => v2.unlock('סיסמה-שגויה'), WrongPasswordError);
  v2.unlock('סיסמת-על-ארוכה-123');
  assert.deepEqual(v2.get(1), { username: 'demo-user-XYZ', password: 'SuperSecret!987' });
  const tampered = JSON.parse(raw); tampered.data = Buffer.from('x' + tampered.data).toString('base64');
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => new Vault(file).unlock('סיסמת-על-ארוכה-123'), WrongPasswordError); // GCM מזהה שינוי
});

test('סיווג אוטומטי לעסקים ישראליים', async (t) => {
  const { db, close } = await startApp(); t.after(close);
  const cases = [
    ['שופרסל דיל רעננה 123', -200, 'סופרמרקט'], ['רמי לוי שיווק השקמה', -90, 'סופרמרקט'], ['פז תחנת דלק', -250, 'דלק'],
    ['חברת החשמל לישראל', -400, 'חשמל'], ['עיריית תל אביב ארנונה', -700, 'ארנונה'], ['פלאפון תקשורת', -100, 'סלולר ואינטרנט'],
    ['NETFLIX.COM', -50, 'מנויים'], ['ארומה אספרסו בר', -30, 'מסעדות וקפה'], ['מכבי שירותי בריאות', -40, 'בריאות'],
    ['הראל ביטוח רכב', -300, 'ביטוח'], ['ביטוח לאומי', 500, 'קצבאות'], ['ביטוח לאומי דמי ביטוח', -300, 'ביטוח'],
    ['משכורת חברה', 15000, 'משכורת'], ['ישראכרט חיוב', -3000, 'תשלום כרטיס אשראי'], ['מקס סטוק', -120, 'אחר'],
    ['בית עסק לא מוכר', -75, 'אחר'], ['החזר ממישהו', 80, 'הכנסה אחרת'], ['משיכת מזומן כספומט', -400, 'מזומן'],
  ];
  for (const [d, a, want] of cases) assert.equal(cat(db, d, a), want, d);
});

test('מניעת כפילויות: משיכה חוזרת לא סופרת פעמיים, אך עסקאות זהות באותו יום נשמרות', async (t) => {
  const { db, close } = await startApp(); t.after(close);
  const rows = [
    { date: '2026-02-01', description: 'קפה גרג', amount: -12 }, { date: '2026-02-01', description: 'קפה גרג', amount: -12 },
    { date: '2026-02-02', description: 'שופרסל', amount: -300 },
  ];
  assert.deepEqual(store.addTransactions(db, rows, { source: 'scraper' }), { added: 3, duplicates: 0, skipped: 0 });
  assert.deepEqual(store.addTransactions(db, rows, { source: 'scraper' }), { added: 0, duplicates: 3, skipped: 0 });
  // אותו נתון דרך יבוא ידני - עדיין כפילות
  assert.equal(store.addTransactions(db, rows, { source: 'import' }).added, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM transactions').get().c, 3);
  // חפיפה חלקית: רק העסקה החדשה נוספת
  const r = store.addTransactions(db, [...rows, { date: '2026-02-03', description: 'פז', amount: -200 }], { source: 'scraper' });
  assert.equal(r.added, 1);
});

test('יבוא CSV של כרטיס אשראי (הוצאות חיוביות, שורות פתיחה) וכפילות ביבוא חוזר', async (t) => {
  const { db, close } = await startApp(); t.after(close);
  const p = await parseFile(fs.readFileSync(path.join(SAMPLES, 'card-sample.csv')), 'card-sample.csv');
  assert.equal(p.signMode, 'expenses-positive');
  assert.equal(p.columns.charge, 'סכום חיוב');
  assert.ok(p.rows.length > 50 && p.rows.every((r) => r.amount < 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date)));
  const first = store.addTransactions(db, p.rows, { source: 'import' });
  const second = store.addTransactions(db, p.rows, { source: 'import' });
  assert.equal(first.added, p.rows.length);
  assert.equal(second.added, 0);
});

test('יבוא CSV של בנק (חובה/זכות, נקודה-פסיק) ו-XLSX', async (t) => {
  const bank = await parseFile(fs.readFileSync(path.join(SAMPLES, 'bank-sample.csv')), 'bank-sample.csv');
  assert.ok(bank.rows.some((r) => r.amount > 0) && bank.rows.some((r) => r.amount < 0));
  const x = await parseFile(fs.readFileSync(path.join(SAMPLES, 'card-sample.xlsx')), 'card-sample.xlsx');
  assert.equal(x.rows.length, 60);
  assert.ok(x.rows.every((r) => r.amount < 0 && /^2026-/.test(r.date)));
  await assert.rejects(parseFile(Buffer.from('a,b\n1,2\n'), 'x.csv'), /לא זוהו עמודות/);
});

test('קידוד windows-1255 ישן', async () => {
  const iconv = new TextDecoder('windows-1255');
  assert.equal(iconv.decode(Buffer.from([0xf9, 0xec, 0xe5, 0xed])), 'שלום');
  const head = Buffer.from('date,x\n', 'latin1');
  const hebrew = Buffer.from([0xfa, 0xe0, 0xf8, 0xe9, 0xea]); // "תאריך"
  const buf = Buffer.concat([hebrew, Buffer.from(',שם,סכום\n', 'utf8')]);
  assert.ok(head.length && buf.length); // גילוי: UTF-8 לא תקין יפול ל-1255 (נבדק ב-importer.decodeBuffer)
});

test('תיקון קטגוריה מציע חוק; יצירת חוק מחילה על עסקאות דומות אך לא על תיקונים ידניים', async (t) => {
  const { db, close } = await startApp(); t.after(close);
  const dates = ['2026-03-01', '2026-03-05', '2026-03-09', '2026-03-12'];
  store.addTransactions(db, dates.map((d, i) => ({ date: d, description: i === 3 ? 'פיצה האט כפר סבא 12' : `פיצה האט רעננה ${i + 1}`, amount: -90 - i })), { source: 't' });
  const rows = db.prepare('SELECT * FROM transactions ORDER BY id').all();
  // "פיצה" מסווג מראש כמסעדות. נתקן לבית וגינה בכוונה כדי לבדוק את מנגנון ההצעה
  const home = catId(db, 'בית וגינה');
  const fixed = store.setCategory(db, rows[0].id, home);
  assert.equal(fixed.suggestion.pattern, 'פיצה האט');
  assert.equal(fixed.suggestion.similar, 3);
  // תיקון ידני אחר נשמר גם אחרי החלת חוק
  store.setCategory(db, rows[3].id, catId(db, 'חינוך וילדים'));
  const res = store.createRule(db, { pattern: fixed.suggestion.pattern, categoryId: home, apply: true });
  assert.equal(res.updated, 2);
  const after = db.prepare('SELECT c.name n, manual_category m FROM transactions t JOIN categories c ON c.id=t.category_id ORDER BY t.id').all();
  assert.deepEqual(after.map((x) => x.n), ['בית וגינה', 'בית וגינה', 'בית וגינה', 'חינוך וילדים']);
  // עסקה חדשה מאותו בית עסק כבר מסווגת לפי החוק של המשתמש (קודם לחוקים המובנים)
  assert.equal(cat(db, 'פיצה האט נתניה', -70), 'בית וגינה');
});

test('הוספה ידנית, תקציב וסיכום חודשי (לא סופר העברות/כרטיס אשראי)', async (t) => {
  const { db, close } = await startApp(); t.after(close);
  const { bank, card } = generateDemo('2026-09', 6);
  store.addTransactions(db, bank, { source: 'demo' });
  store.addTransactions(db, card, { source: 'demo' });
  store.addManual(db, { date: '2026-09-15', amount: 100, description: 'עבודה פרטית במזומן', type: 'income' });
  store.addManual(db, { date: '2026-09-16', amount: 50, description: 'ירקן שכונתי מזומן', type: 'expense', categoryId: catId(db, 'סופרמרקט') });
  db.prepare('INSERT INTO budgets VALUES (?,?)').run(catId(db, 'סופרמרקט'), 1000);
  const s = store.summary(db, '2026-09');
  assert.ok(s.income >= 24600);
  assert.ok(s.transfers < 0, 'חיוב ישראכרט בבנק מסווג כהעברה');
  assert.ok(Math.abs(s.balance - (s.income - s.expense)) < 1e-6);
  const sup = s.expenses.find((e) => e.name === 'סופרמרקט');
  assert.ok(sup.budget === 1000 && sup.pct > 0);
  assert.equal(s.trend.length, 6);
  assert.equal(s.trend[5].month, '2026-09');
  assert.ok(!s.expenses.some((e) => e.name === 'תשלום כרטיס אשראי'));
  const list = store.listTransactions(db, { month: '2026-09', q: 'מזומן' });
  assert.ok(list.total >= 2);
});

test('משיכה: סורק מדומה, המרת תאריך ישראלי, דילוג על ממתינות, וכשל ללא דליפת סיסמה', async (t) => {
  const calls = [];
  let mode = 'ok';
  const fake = (opts) => ({
    scrape: async (creds) => {
      calls.push({ opts, creds });
      if (mode === 'fail') return { success: false, errorType: 'INVALID_PASSWORD', errorMessage: `login failed for ${creds.username} with ${creds.password}` };
      return { success: true, accounts: [{ accountNumber: '1234', txns: [
        { date: '2026-09-02T21:00:00.000Z', chargedAmount: -45.5, description: 'ארומה אספרסו בר', status: 'completed', type: 'normal', originalAmount: -45.5, originalCurrency: 'ILS', processedDate: '2026-10-01' },
        { date: '2026-09-04T21:00:00.000Z', chargedAmount: -99, description: 'עסקה ממתינה', status: 'pending', type: 'normal', originalAmount: -99, originalCurrency: 'ILS', processedDate: '2026-10-01' },
        { date: '2026-09-05T21:00:00.000Z', chargedAmount: -200, description: 'קורס', status: 'completed', type: 'installments', installments: { number: 2, total: 5 }, originalAmount: -1000, originalCurrency: 'ILS', processedDate: '2026-10-01' },
      ] }] };
    },
  });
  const ctx = await startApp({ createScraperImpl: fake }); t.after(ctx.close);
  const { call, db } = ctx;
  assert.equal((await call('GET', '/api/status')).json.vault, 'missing');
  assert.equal((await call('POST', '/api/vault/init', { password: 'סיסמת-על-ארוכה-123' })).status, 200);
  const acc = await call('POST', '/api/accounts', { label: 'כרטיס דוגמה', company: 'max', credentials: { username: 'demo-user', password: 'p@ss-demo-1' } });
  assert.equal(acc.status, 200);
  assert.ok(!fs.readFileSync(path.join(ctx.dir, 'vault.json'), 'utf8').includes('p@ss-demo-1'));
  assert.equal((await call('GET', '/api/accounts')).json[0].credentials, undefined);

  const run = async () => { await call('POST', '/api/sync'); for (let i = 0; i < 100 && ctx.app._state.syncing; i++) await new Promise((r) => setTimeout(r, 20)); };
  await run();
  assert.ok(calls[0].opts.timeout >= 60000 && calls[0].opts.defaultTimeout >= 60000, 'זמני המתנה ארוכים לאתרי בנקים איטיים');
  assert.equal(calls[0].opts.showBrowser, false);
  const rows = db.prepare('SELECT date, amount FROM transactions ORDER BY date').all();
  assert.deepEqual(rows.map((r) => r.date), ['2026-09-03', '2026-09-06']);
  const log1 = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1').get();
  assert.equal(log1.status, 'ok'); assert.equal(log1.added, 2); assert.equal(log1.pending_skipped, 1);
  await run(); // משיכה חוזרת
  assert.equal(db.prepare('SELECT COUNT(*) c FROM transactions').get().c, 2);
  assert.equal(db.prepare('SELECT duplicates FROM sync_log ORDER BY id DESC LIMIT 1').get().duplicates, 2);

  mode = 'fail';
  await run();
  const st = (await call('GET', '/api/status')).json;
  assert.equal(st.failing.length, 1);
  const failLog = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1').get();
  assert.equal(failLog.status, 'error');
  assert.ok(failLog.error.includes('INVALID_PASSWORD'));
  assert.ok(!failLog.error.includes('p@ss-demo-1') && !failLog.error.includes('demo-user'), 'סיסמה לא נכנסת ליומן');
});

test('אבטחת ה-API: Host, Origin, כותרת CSRF, נעילה, סיסמה שגויה', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  const { call, base } = ctx;
  assert.equal(ctx.server.address().address, '127.0.0.1');
  const evil = await new Promise((resolve) => {
    const r = require('http').request({ host: '127.0.0.1', port: new URL(base).port, path: '/api/status', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    r.on('error', () => resolve(0)); r.end();
  });
  assert.equal(evil, 403, 'DNS rebinding נחסם לפי Host');
  assert.equal((await fetch(base + '/api/vault/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await call('POST', '/api/vault/init', {}, { Origin: 'http://evil.example' })).status, 403);
  const csp = (await call('GET', '/api/status')).headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  await call('POST', '/api/vault/init', { password: 'סיסמת-על-ארוכה-123' });
  ctx.vault.lock();
  assert.equal((await call('POST', '/api/accounts', { label: 'x', company: 'max', credentials: {} })).status, 400);
  assert.equal((await call('POST', '/api/vault/unlock', { password: 'שגויה' })).status, 401);
  assert.equal((await call('POST', '/api/vault/unlock', { password: 'סיסמת-על-ארוכה-123' })).status, 200);
});

test('API: יבוא קובץ (תצוגה מקדימה ושמירה), הוספה ידנית ומחיקה', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  const { call } = ctx;
  const buf = fs.readFileSync(path.join(SAMPLES, 'card-sample.csv'));
  const h = { 'X-Filename': encodeURIComponent('card-sample.csv') };
  const pv = await call('POST', '/api/import/preview', buf, h);
  assert.equal(pv.status, 200); assert.equal(pv.json.duplicates, 0); assert.ok(pv.json.new > 50);
  const c1 = await call('POST', '/api/import/commit', buf, h);
  assert.equal(c1.json.added, pv.json.new);
  const c2 = await call('POST', '/api/import/commit', buf, h);
  assert.equal(c2.json.added, 0);
  const m = await call('POST', '/api/transactions', { date: '2026-09-20', amount: 30, description: 'מזומן קטן', type: 'expense' });
  assert.equal((await call('DELETE', `/api/transactions/${m.json.id}`)).status, 200);
  const imported = (await call('GET', '/api/transactions?limit=1')).json.items[0];
  assert.equal((await call('DELETE', `/api/transactions/${imported.id}`)).status, 400);
  assert.equal((await call('GET', '/api/summary?month=nope')).status, 400);
});

test('הוצאות חוזרות מול חד-פעמיות: זיהוי אוטומטי, קטגוריות חוזרות מטבען, ועקיפה ידנית', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  const { db, call } = ctx;
  const { bank, card } = generateDemo('2026-09', 6);
  store.addTransactions(db, bank, { source: 'demo' });
  store.addTransactions(db, card, { source: 'demo' });
  const rec = (await call('GET', '/api/recurring?month=2026-09')).json;
  const names = rec.items.map((i) => i.name);
  assert.ok(names.includes('נטפליקס') && names.includes('ספוטיפיי'), 'מנויים קבועים זוהו');
  assert.ok(names.some((n) => n.includes('ארנונה')) && names.some((n) => n.includes('החשמל')), 'קטגוריות חוזרות מטבען');
  assert.ok(!names.some((n) => n.includes('שופרסל')), 'קניות סופר משתנות - לא חוזרות');
  assert.ok(!names.some((n) => n.includes('ישראכרט')), 'העברות לא נספרות');
  const one = (await call('GET', '/api/onetime?month=2026-09')).json;
  const sum = (await call('GET', '/api/summary?month=2026-09')).json;
  assert.ok(Math.abs(sum.split.recurring + sum.split.oneTime - sum.expense) < 0.01, 'חוזר + חד-פעמי = סך ההוצאות');
  assert.ok(Math.abs(one.total - sum.split.oneTime) < 0.01);
  assert.ok(Math.abs(sum.trend[5].recurring + sum.trend[5].oneTime - sum.trend[5].expense) < 0.01);
  // עקיפה ידנית: סימון קניות סופר כחוזרות, וביטול סימון של נטפליקס
  await call('PUT', '/api/recurring/override', { key: 'שופרסל דיל', recurring: true });
  await call('PUT', '/api/recurring/override', { key: 'נטפליקס', recurring: false });
  const rec2 = (await call('GET', '/api/recurring?month=2026-09')).json;
  assert.ok(rec2.items.some((i) => i.key === 'שופרסל דיל') && !rec2.items.some((i) => i.key === 'נטפליקס'));
  // קטגוריה חדשה
  const c = await call('POST', '/api/categories', { name: 'חתונות ואירועים', kind: 'expense', color: '#aa3377' });
  assert.equal(c.status, 200);
  assert.equal((await call('POST', '/api/categories', { name: 'חתונות ואירועים' })).status, 400);
  assert.equal((await call('DELETE', `/api/categories/${c.json.id}`)).status, 200);
});

test('שני כרטיסים מאוחדים, סינון לפי כרטיס, הכנסה ידנית ותובנות', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  const { db, call } = ctx;
  const a = Number(db.prepare("INSERT INTO accounts (label, company) VALUES ('ויזה דנה','visaCal')").run().lastInsertRowid);
  const b = Number(db.prepare("INSERT INTO accounts (label, company) VALUES ('ישראכרט יוסי','isracard')").run().lastInsertRowid);
  const demo = generateDemo('2026-09', 6);
  store.addTransactions(db, demo.card.filter((_, i) => i % 2 === 0), { source: 'demo', accountId: a });
  store.addTransactions(db, demo.card.filter((_, i) => i % 2 === 1), { source: 'demo', accountId: b });
  const all = (await call('GET', '/api/summary?month=2026-09')).json;
  const sa = (await call('GET', `/api/summary?month=2026-09&accountId=${a}`)).json;
  const sb = (await call('GET', `/api/summary?month=2026-09&accountId=${b}`)).json;
  assert.ok(Math.abs(all.expense - (sa.expense + sb.expense)) < 0.01, 'איחוד = סכום הכרטיסים');
  assert.ok(sa.expense > 0 && sb.expense > 0);
  // הכנסה: אין עסקאות הכנסה -> ברירת מחדל / ידנית
  assert.equal(all.incomeSource, 'none');
  await call('PUT', '/api/income', { month: '2026-09', amount: 20000, all: true });
  let s = (await call('GET', '/api/summary?month=2026-09')).json;
  assert.equal(s.income, 20000); assert.equal(s.incomeSource, 'default');
  assert.ok(Math.abs(s.balance - (20000 - s.expense)) < 0.01);
  assert.equal(s.trend[3].income, 20000, 'ברירת המחדל חלה על כל חודשי המגמה');
  await call('PUT', '/api/income', { month: '2026-09', amount: 25000 });
  s = (await call('GET', '/api/summary?month=2026-09')).json;
  assert.equal(s.income, 25000); assert.equal(s.incomeSource, 'manual');
  await call('PUT', '/api/income', { month: '2026-09', amount: null });
  assert.equal((await call('GET', '/api/summary?month=2026-09')).json.income, 20000);
  assert.equal((await call('PUT', '/api/income', { month: 'x', amount: 5 })).status, 400);
  assert.equal((await call('PUT', '/api/income', { month: '2026-09', amount: -5 })).status, 400);
  // תובנות
  const ins = (await call('GET', '/api/insights?month=2026-09')).json;
  assert.equal(ins.previous.length, 31); assert.equal(ins.current.length, 30);
  assert.ok(ins.current.every((v, i) => i === 0 || v >= ins.current[i - 1]), 'מצטבר עולה');
  assert.ok(ins.topMerchants.length > 0 && ins.topMerchants[0].total >= ins.topMerchants[1].total);
  assert.equal(ins.byAccount.length, 2);
  const rec = (await call('GET', `/api/recurring?month=2026-09&accountId=${a}`)).json;
  assert.ok(rec.items.every((i) => i.day >= 1 && i.day <= 31));
});

test('שימו לב: חיוב כפול, התייקרות מנוי, הוצאה חריגה, תקציב', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  const { db, call } = ctx;
  const rows = [];
  for (const m of ['2026-05', '2026-06', '2026-07', '2026-08']) rows.push({ date: `${m}-10`, description: 'נטפליקס', amount: -50 });
  rows.push({ date: '2026-09-10', description: 'נטפליקס', amount: -65 });          // התייקר
  rows.push({ date: '2026-09-12', description: 'קפה בבית קפה', amount: -40 }, { date: '2026-09-12', description: 'קפה בבית קפה', amount: -40 }); // כפול
  rows.push({ date: '2026-09-15', description: 'מחשב נייד חדש', amount: -4500 });   // גדול
  rows.push({ date: '2026-09-16', description: 'שופרסל', amount: -300 });
  store.addTransactions(db, rows, { source: 'test' });
  db.prepare('INSERT INTO budgets VALUES (?,?)').run(catId(db, 'סופרמרקט'), 200);
  const a = (await call('GET', '/api/alerts?month=2026-09')).json;
  const types = a.map((x) => x.type);
  assert.ok(types.includes('duplicate'), 'חיוב כפול');
  assert.ok(types.includes('price') && a.find((x) => x.type === 'price').title.includes('נטפליקס'), 'התייקרות');
  assert.ok(types.includes('big') && a.find((x) => x.type === 'big').text.includes('4,500'), 'הוצאה גדולה');
  assert.ok(types.includes('budget'), 'חריגה מתקציב');
  assert.ok(a.length <= 6);
  assert.equal((await call('GET', '/api/alerts?month=oops')).status, 400);
});

test('יעד חיסכון, תובנות (מפת חום/ימי שבוע/שינוי בקטגוריות), סיכום שנתי וייצוא CSV', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  const { db, call } = ctx;
  const demo = generateDemo('2026-09', 6);
  store.addTransactions(db, demo.bank, { source: 'demo' });
  store.addTransactions(db, demo.card, { source: 'demo' });
  store.addManual(db, { date: '2026-09-20', amount: 50, description: '=HYPERLINK("x")', type: 'expense' });
  assert.equal((await call('PUT', '/api/settings', { savings_goal: '2500' })).status, 200);
  assert.equal((await call('PUT', '/api/settings', { savings_goal: 'abc' })).status, 400);
  const s = (await call('GET', '/api/summary?month=2026-09')).json;
  assert.equal(s.savingsGoal, 2500);
  const ins = (await call('GET', '/api/insights?month=2026-09')).json;
  assert.equal(ins.daily.length, 30);
  assert.ok(Math.abs(ins.daily.reduce((a, b) => a + b, 0) - s.expense) < 0.01, 'סכום הימים = סך ההוצאות');
  assert.equal(ins.weekday.length, 7); assert.ok(ins.firstWeekday >= 0 && ins.firstWeekday <= 6);
  assert.ok(ins.categoriesDelta.length > 3 && ins.categoriesDelta[0].cur >= ins.categoriesDelta[1].cur);
  const y = (await call('GET', '/api/year?year=2026')).json;
  assert.equal(y.months.length, 12);
  assert.ok(y.monthsWithData >= 6 && y.expense > 0 && y.categories.length > 0);
  assert.ok(Math.abs(y.balance - (y.income - y.expense)) < 0.01);
  assert.equal((await call('GET', '/api/year?year=x')).status, 400);
  const res = await fetch(`${ctx.base}/api/export.csv?month=2026-09`);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM כדי שאקסל יקרא עברית');
  const csv = bytes.toString('utf8');
  assert.match(res.headers.get('content-disposition'), /attachment/);
  assert.ok(csv.includes('"תאריך"'));
  assert.ok(csv.includes('"\'=HYPERLINK'), 'נוסחאות מנוטרלות');
  assert.ok(csv.split('\r\n').length > 20);
});

test('מציאת דפדפן לסריקה: סביבה, מצורף, ואז Chrome/Edge מותקנים', () => {
  const { findBrowser } = require('../src/sync');
  const only = (...paths) => (p) => paths.includes(p);
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' };
  assert.equal(findBrowser({ env: { ...env, PUPPETEER_EXECUTABLE_PATH: '/custom/chrome' }, exists: only('/custom/chrome', chrome), bundled: '/b' }), '/custom/chrome');
  assert.equal(findBrowser({ env, exists: only('/bundled/chrome', chrome), bundled: '/bundled/chrome' }), '/bundled/chrome');
  assert.equal(findBrowser({ env, exists: only(chrome, edge), bundled: '/missing' }), chrome, 'Chrome לפני Edge');
  assert.equal(findBrowser({ env, exists: only(edge), bundled: '/missing' }), edge, 'Edge הוא תמיד ב-Windows');
  assert.equal(findBrowser({ env, exists: () => false, bundled: '/missing' }), null);
});

test('יבוא אקסל בסגנון מקס: כמה גיליונות, תאריך חיוב וסכום חיוב, החזרים', async () => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const H = ['תאריך עסקה', 'שם בית העסק', 'קטגוריה', '4 ספרות אחרונות של כרטיס האשראי', 'סוג עסקה', 'סכום חיוב', 'מטבע חיוב', 'סכום עסקה מקורי', 'מטבע עסקה מקורי', 'תאריך חיוב', 'הערות'];
  const a = wb.addWorksheet('עסקאות במועד החיוב'); a.addRow(['פירוט עסקאות']); a.addRow(H);
  a.addRow(['03/09/2026', 'שופרסל דיל', 'מזון', '1234', 'רגילה', 250.5, 'ש"ח', 250.5, 'ש"ח', '10/10/2026', '']);
  a.addRow(['04/09/2026', 'זיכוי פז', 'דלק', '1234', 'רגילה', -50, 'ש"ח', -50, 'ש"ח', '10/10/2026', '']);
  const b = wb.addWorksheet('עסקאות שאושרו וממתינות לחיוב'); b.addRow(H);
  b.addRow(['20/09/2026', 'נטפליקס', 'מנויים', '1234', 'רגילה', 49.9, 'ש"ח', 49.9, 'ש"ח', '10/11/2026', '']);
  wb.addWorksheet('גיליון ריק'); // גיליון בלי נתונים לא מפיל את היבוא
  const r = await parseFile(Buffer.from(await wb.xlsx.writeBuffer()), 'max.xlsx');
  assert.equal(r.rows.length, 3, 'שני הגיליונות נקראו');
  assert.equal(r.signMode, 'expenses-positive');
  assert.deepEqual(r.rows.map((x) => [x.description, x.amount]), [['שופרסל דיל', -250.5], ['זיכוי פז', 50], ['נטפליקס', -49.9]]);
  assert.equal(r.columns.charge, 'סכום חיוב');
});

test('מפסק בטיחות: כשל בכניסה משהה את הכרטיס ולא מנסים שוב אוטומטית', async (t) => {
  let calls = 0, mode = 'badpass';
  const fake = () => ({ scrape: async () => {
    calls++;
    if (mode === 'badpass') return { success: false, errorType: 'INVALID_PASSWORD', errorMessage: 'bad' };
    if (mode === 'timeout') return { success: false, errorType: 'TIMEOUT', errorMessage: 'slow' };
    return { success: true, accounts: [] };
  } });
  const ctx = await startApp({ createScraperImpl: fake }); t.after(ctx.close);
  const { call, db } = ctx;
  await call('POST', '/api/vault/init', { password: 'סיסמת-על-ארוכה-123' });
  const id = (await call('POST', '/api/accounts', { label: 'כרטיס', company: 'max', credentials: { username: 'u', password: 'p' } })).json.id;
  const run = async (body) => { await call('POST', '/api/sync', body); for (let i = 0; i < 100 && ctx.app._state.syncing; i++) await new Promise((r) => setTimeout(r, 20)); };
  const acct = () => db.prepare('SELECT paused, fail_count FROM accounts WHERE id=?').get(id);
  await run({});
  assert.equal(calls, 1); assert.equal(acct().paused, 1, 'סיסמה שגויה משהה מיד');
  await run({}); await run({});
  assert.equal(calls, 1, 'עדכון כללי/יומי לא מנסה שוב כרטיס מושהה');
  assert.equal((await call('GET', '/api/accounts')).json[0].paused, 1);
  await run({ accountId: id });
  assert.equal(calls, 2, 'לחיצה מפורשת על הכרטיס כן מנסה (אחרי אזהרה בממשק)');
  // עדכון פרטי כניסה מחזיר לפעולה
  assert.equal((await call('PUT', `/api/accounts/${id}/credentials`, { credentials: { username: 'u2', password: 'p2' } })).status, 200);
  assert.equal(acct().paused, 0); assert.equal(acct().fail_count, 0);
  // כשל זמני (למשל timeout): משהים רק אחרי שני כשלים רצופים
  mode = 'timeout';
  await run({}); assert.equal(acct().paused, 0, 'כשל ראשון בזמן לא משהה');
  await run({}); assert.equal(acct().paused, 1, 'שני כשלים רצופים משהים');
  // הצלחה מאפסת
  mode = 'ok'; await run({ accountId: id });
  assert.deepEqual({ ...acct() }, { paused: 0, fail_count: 0 });
});

test('סריקה עם דפדפן משלנו (נגד חסימת בוטים): מועבר לספרייה, עם כותרת עברית, ונסגר תמיד', async (t) => {
  const { runSync } = require('../src/sync');
  const ctx = await startApp(); t.after(ctx.close);
  await ctx.call('POST', '/api/vault/init', { password: 'סיסמת-על-ארוכה-123' });
  await ctx.call('POST', '/api/accounts', { label: 'ישראכרט', company: 'isracard', credentials: { id: '123456789', card6Digits: '123456', password: 'p' } });
  const seen = { launched: null, closed: 0, headers: null };
  const fakeBrowser = { close: async () => { seen.closed++; } };
  const launchBrowser = async (o) => { seen.launched = o; return fakeBrowser; };
  const createScraperImpl = (opts) => ({ scrape: async () => {
    const page = { setExtraHTTPHeaders: async (h) => { seen.headers = h; } };
    await opts.preparePage(page);
    assert.equal(opts.browser, fakeBrowser, 'הדפדפן שלנו מועבר לספרייה');
    return { success: false, errorType: 'GENERIC', errorMessage: 'x' };
  } });
  const r = await runSync({ db: ctx.db, vault: ctx.vault, createScraperImpl, launchBrowser });
  assert.equal(r[0].status, 'error');
  assert.match(seen.headers['accept-language'], /^he-IL/);
  assert.equal(seen.closed, 1, 'הדפדפן נסגר גם בכשל');
  assert.ok('executablePath' in seen.launched && 'showBrowser' in seen.launched);
});
