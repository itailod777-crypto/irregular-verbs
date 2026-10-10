'use strict';
// כניסה לישראכרט דרך הטופס הגלוי באתר (כמו בן אדם), במקום פנייה ישירה לשרת שהם חוסמים כרובוט.
// בדף הכניסה ברירת המחדל היא SMS; לוחצים "או כניסה עם סיסמה קבועה" ואז ממלאים ת.ז., 6 ספרות כרטיס וסיסמה.
// אם הדף לא נראה כמצופה לא שולחים כלום (כדי לא לגרום לניסיונות כושלים), וזורקים שגיאה ברורה.
const IsracardScraper = require('israeli-bank-scrapers/lib/scrapers/isracard').default;
const { ScraperErrorTypes } = require('israeli-bank-scrapers/lib/scrapers/errors');
const { maskHeadlessUserAgent } = require('israeli-bank-scrapers/lib/helpers/browser');

const PASSWORD_MODE_TEXT = 'כניסה עם סיסמה קבועה';
const ERROR_RE = /(שגוי|שגויים|לא נכון|לא תקין|נחסם|אינם תואמים|לא זוהו)/;

async function openPasswordMode(page) {
  const handle = await page.evaluateHandle((text) => {
    const norm = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const matches = [...document.querySelectorAll('button, a, [role=button], span, div')].filter((e) => norm(e).includes(text) && norm(e).length < text.length + 12 && e.offsetParent !== null);
    return matches.find((e) => ![...e.children].some((c) => matches.includes(c))) || null;
  }, PASSWORD_MODE_TEXT);
  const el = handle.asElement();
  if (!el) return false;
  await el.click();
  return true;
}

// מסמן בדף: id, card, pass, submit. מחזיר { ok, reason }
async function tagLoginFields(page) {
  return page.evaluate(() => {
    const visible = (e) => !!e && e.offsetParent !== null && e.getBoundingClientRect().width > 0;
    document.querySelectorAll('[data-fb]').forEach((e) => e.removeAttribute('data-fb'));
    const pass = [...document.querySelectorAll('input[type=password]')].find(visible);
    if (!pass) return { ok: false, reason: 'no visible password input' };
    let container = pass.parentElement, texts = [];
    for (let i = 0; i < 8 && container; i++) {
      texts = [...container.querySelectorAll('input')].filter((e) => visible(e) && e !== pass && ['text', 'tel', 'number', ''].includes((e.getAttribute('type') || '').toLowerCase()));
      if (texts.length >= 2) break;
      container = container.parentElement;
    }
    if (texts.length !== 2) return { ok: false, reason: `expected 2 text inputs, found ${texts.length}` };
    let scope = container, submit = null;
    for (let i = 0; i < 4 && scope && !submit; i++) {
      const cands = [...scope.querySelectorAll('button, input[type=submit], [role=button]')].filter(visible);
      submit = cands.find((e) => /^\s*(כניסה|כניסה לאזור האישי|התחברות)\s*$/.test(e.textContent || e.value || '')) || cands.find((e) => e.matches('[type=submit]')) || null;
      if (!submit) scope = scope.parentElement;
    }
    if (!submit) return { ok: false, reason: 'no login button' };
    texts[0].setAttribute('data-fb', 'id'); texts[1].setAttribute('data-fb', 'card'); pass.setAttribute('data-fb', 'pass'); submit.setAttribute('data-fb', 'submit');
    return { ok: true };
  });
}

const readValue = (page, sel) => page.$eval(sel, (e) => e.value).catch(() => '');

// הקלדה עם אימות: הדף של ישראכרט מרנדר שדות מחדש תוך כדי הקלדה, ולפעמים נכנס רק התו הראשון.
// מנסים להקליד, בודקים שכל הערך נכנס, ואם לא: מנסים שוב ובסוף מציבים את הערך ישירות ומודיעים לדף.
async function typeInto(page, sel, value) {
  const want = String(value);
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.click(sel, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    if (attempt === 0 || attempt === 2) {
      // הדבקה כטקסט אחד (כמו הדבקה אמיתית): אירוע input אחד במקום הקשה תו-תו שהדף של ישראכרט מפספס
      await page.evaluate((q, v) => { const e = document.querySelector(q); e.focus(); e.select(); document.execCommand('insertText', false, v); }, sel, want).catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
      if ((await readValue(page, sel)) === want) return true;
      continue;
    }
    for (const ch of want) {
      if (!(await page.$(sel))) break;
      await page.type(sel, ch, { delay: 30 });
      await new Promise((r) => setTimeout(r, 60));
    }
    if ((await readValue(page, sel)) === want) return true;
  }
  await page.$eval(sel, (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, want);
  return (await readValue(page, sel)) === want;
}

// תמונת מצב לאבחון (בלי ערכים): אורך כל שדה והודעות האימות האדומות שמוצגות בדף
async function formReport(page) {
  return page.evaluate(() => {
    const len = (k) => { const e = document.querySelector(`[data-fb="${k}"]`); return e ? e.value.length : -1; };
    const errs = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.offsetParent !== null && /ספרות|הזן|חובה|שגוי|תקין/.test(e.textContent || '') && getComputedStyle(e).color.replace(/\s/g, '').startsWith('rgb(2')).map((e) => e.textContent.trim().slice(0, 60));
    return { lengths: { id: len('id'), card: len('card'), pass: len('pass') }, errors: errs.slice(0, 4), url: location.pathname };
  }).catch(() => ({}));
}

class PatchedIsracardScraper extends IsracardScraper {
  async login(credentials) {
    const page = this.page;
    await maskHeadlessUserAgent(page);
    await this.navigateTo(`${this.baseUrl}/personalarea/Login`);
    if (!(await openPasswordMode(page))) throw new Error('Isracard login form not recognized (no password-mode button)');
    await page.waitForSelector('input[type=password]', { visible: true, timeout: 30000 });
    const r = await tagLoginFields(page);
    if (!r.ok) throw new Error(`Isracard login form not recognized (${r.reason})`);
    if (!/^\d{6}$/.test(String(credentials.card6Digits || ''))) throw new Error('Isracard: card6Digits must be exactly 6 digits (check the saved details)');
    const wanted = [['id', credentials.id], ['card', credentials.card6Digits], ['pass', credentials.password]];
    const settle = async () => { await page.waitForNetworkIdle({ idleTime: 1000, timeout: 8000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 1200)); };
    // הדף מאמת ת.ז.+כרטיס מול השרת ומרנדר מחדש את הטופס (ומרוקן את הסיסמה): ממלאים, ממתינים, ובודקים שהכל עדיין שם
    for (let round = 0, stable = false; round < 4 && !stable; round++) {
      stable = true;
      for (const [sel, v] of wanted) {
        const r = await tagLoginFields(page);
        if (!r.ok) throw new Error(`Isracard login form lost (${r.reason})`);
        if ((await readValue(page, `[data-fb="${sel}"]`)) !== String(v)) {
          stable = false;
          if (!(await typeInto(page, `[data-fb="${sel}"]`, v))) throw new Error(`Isracard: could not fill field "${sel}" ${JSON.stringify(await formReport(page))}`);
          await settle();
        }
      }
    }
    await tagLoginFields(page);
    for (const [sel, v] of wanted) if ((await readValue(page, `[data-fb="${sel}"]`)) !== String(v)) throw new Error(`Isracard: field "${sel}" did not keep its value ${JSON.stringify(await formReport(page))}`);
    const before = await formReport(page);
    if (before.errors && before.errors.length) { // הדף מציג שגיאת אימות: לא שולחים, מנסים להקליד שוב לאט
      for (const [sel, v] of wanted) { await typeInto(page, `[data-fb="${sel}"]`, v); await settle(); }
    }
    this.lastReport = before;
    await page.click('[data-fb="submit"]');
    await page.waitForFunction((src) => !/personalarea\/Login/i.test(location.href) || new RegExp(src).test(document.body.innerText), { timeout: 45000 }, ERROR_RE.source).catch(() => {});
    if (!/personalarea\/Login/i.test(page.url())) {
      // אחרי הכניסה האתר עוד מנווט כמה פעמים; קריאות הנתונים רצות בתוך הדף ונופלות אם הוא באמצע מעבר
      await page.waitForNetworkIdle({ idleTime: 2000, timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      return { success: true };
    }
    const after = await formReport(page);
    if (process.env.FB_DEBUG_DIR) await page.screenshot({ path: require('path').join(process.env.FB_DEBUG_DIR, 'isracard-login.png') }).catch(() => {});
    const failed = await page.evaluate((src) => new RegExp(src).test(document.body.innerText), ERROR_RE.source).catch(() => false);
    return { success: false, errorType: failed ? ScraperErrorTypes.InvalidPassword : ScraperErrorTypes.Generic, errorMessage: failed ? undefined : `Isracard login did not complete ${JSON.stringify({ before: this.lastReport, after })}` };
  }
}

PatchedIsracardScraper.prototype.fetchData = async function fetchData() {
  const base = IsracardScraper.prototype.fetchData;
  for (let attempt = 1; ; attempt++) {
    try { return await base.call(this); } catch (e) {
      const msg = String((e && e.message) || e);
      if (attempt < 3 && /context was destroyed|navigation|detached|Target closed/i.test(msg)) { // הדף עבר ניווט באמצע: ממתינים ומנסים שוב
        await this.page.waitForNetworkIdle({ idleTime: 1500, timeout: 20000 }).catch(() => {});
        continue;
      }
      let where = ''; try { where = ` [page: ${new URL(this.page.url()).pathname}]`; } catch {}
      throw new Error(`Isracard data fetch failed${where}: ${msg}`);
    }
  }
};

module.exports = { PatchedIsracardScraper, openPasswordMode, tagLoginFields, typeInto };
