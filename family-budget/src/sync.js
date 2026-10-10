'use strict';
// משיכת עסקאות מהבנקים/כרטיסי האשראי. קריאה בלבד: הספרייה רק נכנסת וקוראת עסקאות.
const { getSetting, setSetting } = require('./db');
const { addTransactions } = require('./store');
const { notifyFailure } = require('./notify');
const fs = require('fs');
const CREDENTIAL_ERRORS = ['INVALID_PASSWORD', 'CHANGE_PASSWORD', 'ACCOUNT_BLOCKED'];

// מציאת דפדפן להרצת הסריקה: משתנה סביבה, אחר כך הדפדפן שהספרייה הורידה, ואחר כך Chrome / Edge שכבר מותקנים במחשב
function browserCandidates(env = process.env) {
  const pf = env.ProgramFiles || 'C:\\Program Files', pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', local = env.LOCALAPPDATA || '';
  return [
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`, `${pf86}\\Google\\Chrome\\Application\\chrome.exe`, local && `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`, `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ].filter(Boolean);
}
function findBrowser({ env = process.env, exists = fs.existsSync, bundled } = {}) {
  if (env.PUPPETEER_EXECUTABLE_PATH && exists(env.PUPPETEER_EXECUTABLE_PATH)) return env.PUPPETEER_EXECUTABLE_PATH;
  try { const b = bundled === undefined ? require('puppeteer').executablePath() : bundled; if (b && exists(b)) return b; } catch { /* אין דפדפן מצורף */ }
  return browserCandidates(env).find((c) => exists(c)) || null;
}

const TZ_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
// הספרייה מחזירה חצות ישראל כ-ISO ב-UTC (ליום הקודם). ממירים לתאריך ישראלי.
function israelDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return TZ_FMT.format(d);
}

function redact(text, creds) {
  let out = String(text || '');
  for (const v of Object.values(creds || {})) {
    if (typeof v === 'string' && v.length >= 3) out = out.split(v).join('***');
  }
  return out.slice(0, 500);
}

function mapTransactions(accounts) {
  const rows = [];
  let pendingSkipped = 0;
  for (const acc of accounts || []) {
    for (const t of acc.txns || []) {
      if (t.status === 'pending') { pendingSkipped++; continue; } // טרם סופי אצל החברה - יימשך כשיתעדכן
      let amount = t.chargedAmount;
      if (!amount && (!t.originalCurrency || t.originalCurrency === 'ILS')) amount = t.originalAmount;
      const date = israelDate(t.date);
      if (!date || !amount) continue;
      rows.push({
        date, amount, description: t.description, memo: t.memo || null,
        installment: t.installments ? { number: t.installments.number, total: t.installments.total } : null,
      });
    }
  }
  return { rows, pendingSkipped };
}

function acquireLock(db) {
  const cur = Number(getSetting(db, 'sync_lock', '0'));
  if (cur && Date.now() - cur < 30 * 60 * 1000) return false;
  setSetting(db, 'sync_lock', Date.now());
  return true;
}
function releaseLock(db) { setSetting(db, 'sync_lock', 0); }

async function syncAccount({ db, vault, account, createScraperImpl, now = new Date() }) {
  const startedAt = now.toISOString();
  const log = db.prepare('INSERT INTO sync_log (started_at, account_id, account_label, status) VALUES (?,?,?,?)')
    .run(startedAt, account.id, account.label, 'running');
  const logId = Number(log.lastInsertRowid);
  let creds = null;
  const finish = (status, extra = {}) => {
    db.prepare('UPDATE sync_log SET finished_at=?, status=?, added=?, duplicates=?, pending_skipped=?, error=? WHERE id=?')
      .run(new Date().toISOString(), status, extra.added || 0, extra.duplicates || 0, extra.pendingSkipped || 0, extra.error || null, logId);
    // מפסק בטיחות: כשל בפרטי הכניסה משהה את הכרטיס מיד; כשל אחר משהה אחרי שני כשלים רצופים. כך לא ננסה שוב ושוב ונחסום את החשבון.
    const prev = db.prepare('SELECT fail_count FROM accounts WHERE id=?').get(account.id)?.fail_count || 0;
    const failCount = status === 'ok' ? 0 : prev + 1;
    const paused = status === 'ok' ? 0 : (CREDENTIAL_ERRORS.includes(extra.errorType) || failCount >= 2 ? 1 : 0);
    db.prepare('UPDATE accounts SET last_status=?, last_sync=CASE WHEN ?=\'ok\' THEN ? ELSE last_sync END, fail_count=?, paused=? WHERE id=?')
      .run(status === 'ok' ? 'ok' : (extra.error || status), status, new Date().toISOString(), failCount, paused, account.id);
    return { accountId: account.id, label: account.label, status, ...extra, paused: !!paused };
  };
  try {
    creds = vault.get(account.id);
    if (!creds) return finish('error', { error: 'לא נמצאו פרטי כניסה לחשבון. הזן אותם מחדש.' });
    const initialMonths = Number(getSetting(db, 'initial_months', '6'));
    const start = account.last_sync
      ? new Date(new Date(account.last_sync).getTime() - 14 * 86400000) // חפיפה של שבועיים; הכפילויות מסוננות
      : new Date(now.getFullYear(), now.getMonth() - initialMonths, now.getDate());
    const executablePath = findBrowser();
    const scraper = createScraperImpl({
      ...(executablePath ? { executablePath } : {}), companyId: account.company, startDate: start, combineInstallments: false,
      showBrowser: getSetting(db, 'show_browser', '0') === '1', // לבדיקה: רואים את הדפדפן עובד
      verbose: false, navigationRetryCount: 2, timeout: 120000, defaultTimeout: 120000, // אתרי בנקים איטיים, 2 דקות לכל שלב
    });
    const { otpLongTermToken, ...rest } = creds;
    const result = await scraper.scrape(otpLongTermToken ? { ...rest, otpLongTermToken } : rest);
    if (!result.success) {
      const type = result.errorType || 'GENERIC';
      const hint = type === 'INVALID_PASSWORD' ? ' (בדוק סיסמה / ייתכן שהחשבון ננעל)'
        : type === 'CHANGE_PASSWORD' ? ' (האתר דורש החלפת סיסמה, עשה זאת ידנית באתר ואז עדכן כאן)' : '';
      return finish('error', { errorType: type, error: `${type}${hint}: ${redact(result.errorMessage, creds)}` });
    }
    const { rows, pendingSkipped } = mapTransactions(result.accounts);
    const r = addTransactions(db, rows, { source: 'scraper', accountId: account.id });
    return finish('ok', { added: r.added, duplicates: r.duplicates, pendingSkipped });
  } catch (e) {
    return finish('error', { error: redact(e && e.message, creds) });
  }
}

async function runSync({ db, vault, accountId = null, createScraperImpl, now }) {
  if (!createScraperImpl) {
    const { createScraper } = require('israeli-bank-scrapers');
    // מקס: כניסה מותאמת לדף החדש שלהם (ראו src/max-login.js). שאר החברות: הספרייה כמות שהיא.
    createScraperImpl = (opts) => (opts.companyId === 'max' ? new (require('./max-login').PatchedMaxScraper)(opts) : createScraper(opts));
  }
  if (!vault.isUnlocked()) throw new Error('הכספת נעולה. הזן סיסמת-על.');
  if (!acquireLock(db)) throw new Error('משיכה אחרת כבר רצה כרגע.');
  const results = [];
  try {
    // עדכון כללי / יומי מדלג על כרטיסים מושהים. רק לחיצה ישירה על כרטיס מסוים מנסה שוב (בכוונה, אחרי אזהרה).
    const accounts = accountId
      ? db.prepare('SELECT * FROM accounts WHERE id=?').all(accountId)
      : db.prepare('SELECT * FROM accounts WHERE paused=0 ORDER BY id').all();
    for (const account of accounts) results.push(await syncAccount({ db, vault, account, createScraperImpl, now }));
    if (!accountId) for (const a of db.prepare('SELECT id, label FROM accounts WHERE paused=1').all()) results.push({ accountId: a.id, label: a.label, status: 'paused', paused: true });
  } finally { releaseLock(db); }
  const failed = results.filter((r) => r.status === 'error');
  if (failed.length) await notifyFailure(db, `משיכה נכשלה עבור ${failed.length} חשבונות: ${failed.map((f) => f.label).join(', ')}`);
  return results;
}

module.exports = { runSync, mapTransactions, israelDate, redact, findBrowser, browserCandidates };
