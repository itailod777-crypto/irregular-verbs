'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { findBrowser } = require('../src/sync');

// דף מדומה שמחקה את דף הכניסה של ישראכרט: ברירת מחדל SMS, וכפתור "או כניסה עם סיסמה קבועה" חושף טופס סיסמה
const PAGE = `<!doctype html><meta charset="utf-8"><body>
<header><button id="top">כניסה לחשבון שלי</button></header>
<div id="sms"><h2>כניסה באמצעות SMS</h2><button id="sw" type="button">או כניסה עם סיסמה קבועה</button>
<input id="a" type="text" placeholder="מספר תעודת זהות"><input id="b" type="text" placeholder="ארבע ספרות"><button class="send">שלח קוד לנייד</button></div>
<form id="pw" style="display:none"><input id="id" type="text"><input id="card" type="text"><input id="pass" type="password"><button type="button" id="go" onclick="window.clicked=true">כניסה</button></form>
<script>document.getElementById('sw').onclick=()=>{document.getElementById('sms').style.display='none';document.getElementById('pw').style.display='block';};</script></body>`;

test('כניסה לישראכרט: עוברת למצב סיסמה, ממלאת ת.ז./כרטיס/סיסמה ולוחצת כניסה (לא שלח קוד)', async (t) => {
  const exe = findBrowser();
  if (!exe) return t.skip('אין דפדפן במחשב');
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const { openPasswordMode, tagLoginFields } = require('../src/isracard-login');
  const page = await browser.newPage();
  await page.setContent(PAGE);
  assert.equal((await tagLoginFields(page)).ok, false);
  assert.equal(await openPasswordMode(page), true);
  await page.waitForSelector('input[type=password]', { visible: true });
  assert.deepEqual(await tagLoginFields(page), { ok: true });
  await page.type('[data-fb="id"]', '000000000'); await page.type('[data-fb="card"]', '123456'); await page.type('[data-fb="pass"]', 'demo-pass');
  const v = await page.evaluate(() => ({ id: id.value, card: card.value, pass: pass.value, a: a.value }));
  assert.deepEqual(v, { id: '000000000', card: '123456', pass: 'demo-pass', a: '' });
  await page.click('[data-fb="submit"]');
  assert.equal(await page.evaluate(() => window.clicked), true);
});

test('הכניסה המתוקנת של ישראכרט נטענת', () => {
  const { PatchedIsracardScraper } = require('../src/isracard-login');
  assert.equal(typeof new PatchedIsracardScraper({ companyId: 'isracard', startDate: new Date() }).login, 'function');
});

test('הקלדה בשדה שמרנדר את עצמו אחרי התו הראשון עדיין ממלאת את כל הערך', async (t) => {
  const exe = findBrowser();
  if (!exe) return t.skip('אין דפדפן במחשב');
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`<input id="c" data-fb="card" type="text"><script>let n=0;c.addEventListener('input',()=>{ if(n++===0){ const v=c.value; const f=c.cloneNode(); f.value=v; c.replaceWith(f); f.id='c'; } });</script>`);
  const { typeInto } = require('../src/isracard-login');
  assert.equal(await typeInto(page, '[data-fb="card"]', '123456'), true);
  assert.equal(await page.$eval('[data-fb="card"]', (e) => e.value), '123456');
});
