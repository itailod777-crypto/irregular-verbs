'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findBrowser } = require('../src/sync');

// דף מדומה שמחקה את דף הכניסה החדש של מקס: שתי לשוניות, כפילות id-ים, והטופס הנכון מוסתר עד שלוחצים על הלשונית
const PAGE = `<!doctype html><meta charset="utf-8"><body>
<div class="tabs"><a id="tab-id" class="active">כניסה עם תעודת זהות</a><a id="tab-pw">כניסה עם סיסמה</a></div>
<div id="pane-id"><input id="user-name" type="text" placeholder="מספר תעודת זהות או דרכון"><button class="send-code">שלחו לי קוד לנייד</button></div>
<div id="pane-pw" style="display:none"><form><label>שם משתמש</label><input id="user-name" type="text"><label>סיסמה</label><input id="password" type="password"><button type="button" id="go" onclick="window.clicked=true">כניסה</button></form></div>
<script>document.getElementById('tab-pw').onclick=()=>{document.getElementById('pane-id').style.display='none';document.getElementById('pane-pw').style.display='block';};</script></body>`;

test('כניסה למקס: מזהה את הטופס החדש (לשונית סיסמה, id כפולים) ומקליד בשדות הנכונים', async (t) => {
  const exe = findBrowser();
  if (!exe) return t.skip('אין דפדפן במחשב');
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const { openPasswordTab, tagLoginFields } = require('../src/max-login');
  const page = await browser.newPage();
  await page.setContent(PAGE);
  assert.equal((await tagLoginFields(page)).ok, false, 'לפני מעבר ללשונית אין טופס סיסמה גלוי');
  assert.equal(await openPasswordTab(page), true);
  await page.waitForSelector('input[type=password]', { visible: true });
  assert.deepEqual(await tagLoginFields(page), { ok: true });
  await page.type('[data-fb="user"]', 'demo-user'); await page.type('[data-fb="pass"]', 'demo-pass');
  const vals = await page.evaluate(() => ({ pw: document.querySelector('#pane-pw input[type=text]').value, pass: document.querySelector('#password').value, idTab: document.querySelector('#pane-id input').value }));
  assert.deepEqual(vals, { pw: 'demo-user', pass: 'demo-pass', idTab: '' }, 'הערכים נכנסו לטופס הנכון ולא ללשונית תעודת הזהות');
  await page.click('[data-fb="submit"]');
  assert.equal(await page.evaluate(() => window.clicked), true, 'נלחץ כפתור הכניסה הנכון, לא "שלחו לי קוד"');
});

test('הכניסה המתוקנת של מקס נטענת ומחליפה את המקורית רק עבור מקס', () => {
  const { PatchedMaxScraper } = require('../src/max-login');
  assert.equal(typeof PatchedMaxScraper, 'function');
  const o = new PatchedMaxScraper({ companyId: 'max', startDate: new Date() }).getLoginOptions({ username: 'u', password: 'p' });
  assert.equal(o.submitButtonSelector, '[data-fb="submit"]');
  assert.deepEqual(o.fields.map((f) => f.value), ['u', 'p']);
  assert.equal(typeof o.preAction, 'function'); assert.equal(typeof o.checkReadiness, 'function');
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'sync.js'), 'utf8'), /companyId === 'max' \? new \(require\('\.\/max-login'\)/);
});
