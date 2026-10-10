'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startApp, catId } = require('./helpers');
const store = require('../src/store');
const { isPrivateIp, verifyPassword } = require('../src/auth');

const PW = 'סיסמה-חזקה-123';
const rawGet = (port, host, path = '/api/auth/state') => new Promise((resolve) => {
  const r = http.request({ host: '127.0.0.1', port, path, headers: { Host: host } }, (res) => { res.resume(); resolve(res.statusCode); });
  r.on('error', () => resolve(0)); r.end();
});

test('בלי משתמשים האפליקציה פתוחה; הקמת מנהל נועלת אותה', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  const { call } = ctx;
  assert.equal((await call('GET', '/api/summary?month=2026-09')).status, 200);
  assert.deepEqual((await call('GET', '/api/auth/state')).json, { usersExist: false, user: null });
  assert.equal((await call('POST', '/api/auth/setup', { username: 'dana', displayName: 'דנה', password: 'short' })).status, 400);
  assert.equal((await call('POST', '/api/auth/setup', { username: '!!', displayName: 'דנה', password: PW })).status, 400);
  const r = await call('POST', '/api/auth/setup', { username: 'Dana', displayName: 'דנה', password: PW });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const st = (await call('GET', '/api/auth/state')).json;
  assert.equal(st.user.username, 'dana'); assert.equal(st.user.role, 'admin');
  const anon = ctx.client();
  assert.equal((await anon('GET', '/api/summary?month=2026-09')).status, 401);
  assert.equal((await anon('GET', '/api/transactions')).status, 401);
  assert.equal((await anon('POST', '/api/auth/setup', { username: 'x1', displayName: 'x', password: PW })).status, 400, 'אי אפשר להקים מנהל נוסף');
  const row = ctx.db.prepare('SELECT password_hash FROM users').get();
  assert.ok(row.password_hash.startsWith('scrypt$') && !row.password_hash.includes(PW));
  assert.ok(verifyPassword(PW, row.password_hash) && !verifyPassword('אחרת', row.password_hash));
});

test('בני משפחה: הרשאות, שיתוף נתונים ומי הוסיף עסקה', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  const admin = ctx.call, member = ctx.client();
  await admin('POST', '/api/auth/setup', { username: 'dana', displayName: 'דנה', password: PW });
  assert.equal((await admin('POST', '/api/users', { username: 'yossi', displayName: 'יוסי', password: 'short' })).status, 400);
  assert.equal((await admin('POST', '/api/users', { username: 'yossi', displayName: 'יוסי', password: 'יוסי-סיסמה-456' })).status, 200);
  assert.equal((await admin('POST', '/api/users', { username: 'YOSSI', displayName: 'כפול', password: PW + 'x' })).status, 400, 'שם משתמש תפוס');
  assert.equal((await member('POST', '/api/auth/login', { username: 'yossi', password: 'לא-נכון-12345' })).status, 401);
  assert.equal((await member('POST', '/api/auth/login', { username: 'yossi', password: 'יוסי-סיסמה-456' })).status, 200);
  // חבר משפחה לא יכול לנהל
  for (const [m, u, b] of [['POST', '/api/vault/init', { password: PW }], ['POST', '/api/accounts', {}], ['PUT', '/api/settings', { ntfy_topic: 'x' }], ['GET', '/api/users'], ['POST', '/api/users', { username: 'zz', displayName: 'z', password: PW }], ['PUT', '/api/lan', { enabled: true }], ['DELETE', '/api/accounts/1']]) {
    assert.equal((await member(m, u, b)).status, 403, `${m} ${u}`);
  }
  // אבל רואה ומשתף נתונים
  store.addTransactions(ctx.db, [{ date: '2026-09-03', description: 'שופרסל', amount: -300 }], { source: 'test' });
  assert.equal((await member('GET', '/api/summary?month=2026-09')).json.expense, 300);
  const added = await member('POST', '/api/transactions', { date: '2026-09-05', amount: 40, description: 'מזומן', type: 'expense' });
  assert.equal(added.status, 200);
  const list = (await admin('GET', '/api/transactions?month=2026-09')).json.items;
  assert.equal(list.find((x) => x.description === 'מזומן').created_by_name, 'יוסי');
  assert.equal((await member('PATCH', `/api/transactions/${list[0].id}`, { categoryId: catId(ctx.db, 'בית וגינה') })).status, 200);
  // איפוס סיסמה מנתק את המכשירים של המשתמש
  const yossiId = (await admin('GET', '/api/users')).json.find((u) => u.username === 'yossi').id;
  assert.equal((await admin('PUT', `/api/users/${yossiId}/password`, { password: 'חדשה-לגמרי-789' })).status, 200);
  assert.equal((await member('GET', '/api/summary?month=2026-09')).status, 401);
  assert.equal((await member('POST', '/api/auth/login', { username: 'yossi', password: 'חדשה-לגמרי-789' })).status, 200);
  // שינוי סיסמה עצמי
  assert.equal((await member('POST', '/api/auth/password', { current: 'שגויה-שגויה-1', next: 'עוד-אחת-חדשה-1' })).status, 401);
  assert.equal((await member('POST', '/api/auth/password', { current: 'חדשה-לגמרי-789', next: 'עוד-אחת-חדשה-1' })).status, 200);
  assert.equal((await member('GET', '/api/summary?month=2026-09')).status, 200, 'נשארים מחוברים במכשיר הנוכחי');
  // מחיקה
  const me = (await admin('GET', '/api/auth/state')).json.user;
  assert.equal((await admin('DELETE', `/api/users/${me.id}`)).status, 400, 'לא מוחקים את עצמך');
  assert.equal((await admin('DELETE', `/api/users/${yossiId}`)).status, 200);
  assert.equal((await member('GET', '/api/summary?month=2026-09')).status, 401);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) c FROM transactions WHERE created_by IS NOT NULL").get().c, 0);
  await admin('POST', '/api/auth/logout');
  assert.equal((await admin('GET', '/api/summary?month=2026-09')).status, 401);
});

test('הגנה מפני ניחוש סיסמאות, CSRF ו-Host', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  await ctx.call('POST', '/api/auth/setup', { username: 'dana', displayName: 'דנה', password: PW });
  const c = ctx.client();
  for (let i = 0; i < 5; i++) assert.equal((await c('POST', '/api/auth/login', { username: 'dana', password: 'שגויה-' + i + '-xxxx' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { username: 'dana', password: PW })).status, 429, 'חסימה זמנית אחרי 5 ניסיונות');
  assert.equal((await fetch(`${ctx.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403, 'בלי כותרת CSRF');
  assert.equal((await c('POST', '/api/auth/login', {}, { Origin: 'http://evil.example' })).status, 403);
  assert.equal(await rawGet(ctx.port, `192.168.1.20:${ctx.port}`), 200, 'כתובת פרטית מותרת');
  assert.equal(await rawGet(ctx.port, `8.8.8.8:${ctx.port}`), 403, 'כתובת ציבורית נדחית');
  assert.equal(await rawGet(ctx.port, 'evil.example'), 403);
  assert.equal(await rawGet(ctx.port, `192.168.1.20:${ctx.port + 1}`), 403, 'פורט שגוי');
  assert.equal(await rawGet(ctx.port, `localhost:${ctx.port}`), 200);
});

test('כתובות פרטיות מול ציבוריות', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.4.4', '172.31.9.9', '192.168.0.9', '::1', '::ffff:192.168.1.7']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '11.0.0.1', '193.168.0.1', '2001:4860:4860::8888', '', undefined]) assert.ok(!isPrivateIp(ip), String(ip));
});

test('גישה מהרשת הביתית דורשת קודם משתמשים, ורק מנהל מפעיל', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  assert.equal((await ctx.call('PUT', '/api/lan', { enabled: true })).status, 400, 'בלי משתמשים אסור');
  await ctx.call('POST', '/api/auth/setup', { username: 'dana', displayName: 'דנה', password: PW });
  const r = await ctx.call('PUT', '/api/lan', { enabled: true });
  assert.equal(r.status, 200); assert.equal(r.json.enabled, true);
  assert.equal((await ctx.call('PUT', '/api/lan', { enabled: false })).json.enabled, false);
});

test('האזנה אמיתית לכתובת ברשת הביתית: נפתחת, מגינה, ונסגרת', async (t) => {
  const { createLan } = require('../src/lan');
  const ctx = await startApp(); t.after(ctx.close);
  await ctx.call('POST', '/api/auth/setup', { username: 'dana', displayName: 'דנה', password: PW });
  const lan = createLan({ app: ctx.app, port: ctx.port, addresses: () => ['127.0.0.2'] }); // כתובת לופבק אחרת = כרטיס רשת פרטי מדומה
  const get = (path, host) => fetch(`http://127.0.0.2:${ctx.port}${path}`, host ? { headers: { Host: host } } : {}).then((r) => r.status, () => 0);
  assert.equal(await get('/api/auth/state'), 0, 'סגור כברירת מחדל');
  await lan.set(true);
  assert.equal(lan.get().enabled, true);
  assert.equal(await get('/api/auth/state'), 200, 'פתוח לרשת');
  assert.equal(await get('/api/summary?month=2026-09'), 401, 'נדרשת התחברות');
  const c = ctx.client();
  assert.equal((await fetch(`http://127.0.0.2:${ctx.port}/api/auth/login`, { method: 'POST', headers: { 'X-Requested-With': 'budget', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'dana', password: PW }) })).status, 200);
  assert.ok(c);
  await lan.set(false);
  assert.equal(await get('/api/auth/state'), 0, 'נסגר אחרי הכיבוי');
  await assert.rejects(createLan({ app: ctx.app, port: ctx.port, addresses: () => [] }).set(true), /לא נמצאה כתובת/);
});
