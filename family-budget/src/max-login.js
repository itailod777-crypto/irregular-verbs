'use strict';
// כניסה למקס שמותאמת לדף הכניסה החדש שלהם.
// הספרייה המקורית מחכה לכפתור "אזור אישי" שכבר לא קיים (ולכן נתקעת ב-TIMEOUT), ומתבססת על id-ים שהתחלפו.
// כאן מזהים את הטופס לפי המבנה שנראה לעין: לשונית "כניסה עם סיסמה", שדה שם משתמש, שדה סיסמה וכפתור "כניסה".
const MaxScraper = require('israeli-bank-scrapers/lib/scrapers/max').default;

const PASSWORD_TAB_TEXT = 'כניסה עם סיסמה';

async function openPasswordTab(page) {
  const handle = await page.evaluateHandle((text) => {
    const norm = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const matches = [...document.querySelectorAll('a, button, li, span, div, [role=tab]')].filter((e) => norm(e) === text && e.offsetParent !== null);
    return matches.find((e) => ![...e.children].some((c) => matches.includes(c))) || null; // האלמנט הפנימי ביותר
  }, PASSWORD_TAB_TEXT);
  const el = handle.asElement();
  if (!el) return false;
  await el.click();
  return true;
}

// מסמן בדף את שדות הכניסה (data-fb) כדי שלא נהיה תלויים ב-id-ים. מחזיר { ok, reason }
async function tagLoginFields(page) {
  return page.evaluate(() => {
    const visible = (e) => !!e && e.offsetParent !== null && e.getBoundingClientRect().width > 0;
    document.querySelectorAll('[data-fb]').forEach((e) => e.removeAttribute('data-fb'));
    const pass = [...document.querySelectorAll('input[type=password]')].find(visible);
    if (!pass) return { ok: false, reason: 'no visible password input' };
    let container = pass.parentElement, user = null;
    for (let i = 0; i < 8 && container && !user; i++) {
      const texts = [...container.querySelectorAll('input')].filter((e) => visible(e) && e !== pass && ['text', 'tel', 'email', 'number', ''].includes((e.getAttribute('type') || '').toLowerCase()));
      user = texts.filter((e) => e.compareDocumentPosition(pass) & Node.DOCUMENT_POSITION_FOLLOWING).pop() || null; // השדה האחרון שלפני הסיסמה
      if (!user) container = container.parentElement;
    }
    if (!user) return { ok: false, reason: 'no visible username input' };
    let scope = container, submit = null;
    for (let i = 0; i < 4 && scope && !submit; i++) {
      const cands = [...scope.querySelectorAll('button, a, input[type=submit], [role=button]')].filter(visible);
      submit = cands.find((e) => /^\s*כניסה\s*$/.test(e.textContent || e.value || ''))
        || cands.find((e) => e.matches('[type=submit], .send-me-code, .general-button')) || null;
      if (!submit) scope = scope.parentElement;
    }
    if (!submit) return { ok: false, reason: 'no login button' };
    user.setAttribute('data-fb', 'user'); pass.setAttribute('data-fb', 'pass'); submit.setAttribute('data-fb', 'submit');
    return { ok: true };
  });
}

class PatchedMaxScraper extends MaxScraper {
  getLoginOptions(credentials) {
    const base = super.getLoginOptions(credentials);
    return {
      ...base,
      fields: [{ selector: '[data-fb="user"]', value: credentials.username }, { selector: '[data-fb="pass"]', value: credentials.password }],
      submitButtonSelector: '[data-fb="submit"]',
      // מוכנים כשיש כפתור אזור אישי (הדף הישן) או טופס כניסה (הדף החדש)
      checkReadiness: async () => {
        await this.page.waitForFunction(() => !!document.querySelector('.personal-area > a.go-to-personal-area') || !!document.querySelector('input[type=password]') || document.body.innerText.includes('כניסה עם סיסמה'), { timeout: 60000 });
      },
      preAction: async () => {
        const page = this.page;
        if (await page.$('.personal-area > a.go-to-personal-area')) await base.preAction(); // הדף הישן
        else await openPasswordTab(page); // הדף החדש: מעבר ללשונית "כניסה עם סיסמה"
        await page.waitForSelector('input[type=password]', { visible: true, timeout: 30000 });
        const r = await tagLoginFields(page);
        if (!r.ok) throw new Error(`Max login form not recognized (${r.reason})`);
      },
    };
  }
}

module.exports = { PatchedMaxScraper, openPasswordTab, tagLoginFields };
