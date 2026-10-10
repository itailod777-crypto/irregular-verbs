'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createUpdater } = require('../src/updater');
const { startApp } = require('./helpers');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();

test('עדכון אמיתי מול ריפו מקומי: בדיקה, משיכה והפעלה מחדש', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-upd-'));
  const origin = path.join(root, 'origin.git'), a = path.join(root, 'a'), b = path.join(root, 'b');
  git(root, 'init', '--bare', '-b', 'main', origin);
  git(root, 'clone', origin, a); git(a, 'checkout', '-b', 'main');
  fs.writeFileSync(path.join(a, 'f.txt'), '1'); git(a, 'add', '.'); git(a, 'commit', '-m', 'first'); git(a, 'push', '-u', 'origin', 'main');
  git(root, 'clone', origin, b);
  let restarted = 0, installs = 0;
  const gitRun = async (args) => git(b, ...args);
  const up = createUpdater({ dir: b, git: gitRun, npmInstall: async () => { installs++; }, restart: () => { restarted++; } });
  const v = await up.info();
  assert.equal(v.hasGit, true); assert.equal(v.branch, 'main');
  assert.equal((await up.check()).behind, 0);
  fs.writeFileSync(path.join(a, 'f.txt'), '2'); git(a, 'commit', '-am', 'שינוי חדש'); git(a, 'push');
  const c = await up.check();
  assert.equal(c.behind, 1); assert.equal(c.message, 'שינוי חדש');
  fs.writeFileSync(path.join(b, 'f.txt'), 'שינוי מקומי שנוצר ע"י npm'); // שינוי מקומי שבעבר חסם את העדכון
  fs.writeFileSync(path.join(b, 'untracked-data.db'), 'data'); // קובץ שלא במעקב (כמו data) חייב לשרוד
  const r = await up.apply();
  assert.equal(r.ok, true); assert.notEqual(r.from, r.to);
  assert.equal(fs.readFileSync(path.join(b, 'f.txt'), 'utf8'), '2');
  assert.equal(installs, 1);
  assert.equal(fs.readFileSync(path.join(b, 'untracked-data.db'), 'utf8'), 'data');
  await new Promise((res) => setTimeout(res, 1000));
  assert.equal(restarted, 1);
  assert.equal((await up.check()).behind, 0);
  // תיקייה שאינה git
  const none = createUpdater({ dir: os.tmpdir(), git: async () => { throw new Error('not a repo'); } });
  assert.deepEqual(await none.info(), { hasGit: false });
  await assert.rejects(none.apply(), /בלי Git/);
});

test('API עדכון: מנהל בלבד, לא בזמן עדכון עסקאות, ושגיאות מוצגות בעברית', async (t) => {
  const calls = [];
  const updater = { info: async () => ({ hasGit: true, current: 'abc1234', branch: 'main' }), check: async () => ({ hasGit: true, current: 'abc1234', branch: 'main', behind: 2, message: 'x' }), apply: async () => { calls.push('apply'); return { ok: true, from: 'a', to: 'b' }; } };
  const ctx = await startApp({ updater }); t.after(ctx.close);
  assert.equal((await ctx.call('GET', '/api/version')).json.current, 'abc1234');
  assert.equal((await ctx.call('POST', '/api/version/check')).json.behind, 2);
  assert.equal((await ctx.call('POST', '/api/update')).status, 200);
  ctx.app._state.syncing = true;
  assert.equal((await ctx.call('POST', '/api/update')).status, 400, 'לא מעדכנים באמצע משיכה');
  ctx.app._state.syncing = false;
  // הרשאות
  await ctx.call('POST', '/api/auth/setup', { username: 'dana', displayName: 'דנה', password: 'סיסמה-חזקה-123' });
  await ctx.call('POST', '/api/users', { username: 'yossi', displayName: 'יוסי', password: 'יוסי-סיסמה-456' });
  const m = ctx.client(); await m('POST', '/api/auth/login', { username: 'yossi', password: 'יוסי-סיסמה-456' });
  for (const [meth, url] of [['GET', '/api/version'], ['POST', '/api/version/check'], ['POST', '/api/update']]) assert.equal((await m(meth, url)).status, 403, url);
  assert.equal(calls.length, 1);
});

test('restart.bat קיים, בפורמט Windows, ומפעיל את app.vbs מהתיקייה שלו', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'restart.bat'), 'utf8');
  assert.ok(raw.includes('\r\n'), 'שורות CRLF');
  assert.match(raw, /wscript "%~dp0app\.vbs" hidden/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'app.vbs')));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), /'cmd\.exe', \['\/c', 'restart\.bat'\]/);
});
