'use strict';
// הזנת פרטי כניסה מהטרמינל בלבד (קלט מוסתר). מוצפן ישירות לכספת; שום דבר לא נכתב לדיסק בטקסט גלוי.
const { DB_FILE, VAULT_FILE } = require('../src/config');
const { openDb } = require('../src/db');
const { Vault } = require('../src/crypto');
const { findMasterPassword } = require('../src/masterpw');
const { ask, askHidden } = require('../src/prompt');
const { listCompanies } = require('../src/companies');

async function getVault() {
  const vault = new Vault(VAULT_FILE);
  if (!vault.exists()) {
    console.log('יוצרים כספת חדשה. בחר סיסמת-על (לפחות 8 תווים). אין דרך לשחזר אותה!');
    for (;;) {
      const a = await askHidden('סיסמת-על חדשה: ');
      const b = await askHidden('שוב: ');
      if (a !== b) { console.log('הסיסמאות לא זהות.'); continue; }
      try { vault.init(a); break; } catch (e) { console.log(e.message); }
    }
    return vault;
  }
  let pw = findMasterPassword();
  for (let i = 0; i < 3; i++) {
    if (!pw) pw = await askHidden('סיסמת-על: ');
    try { vault.unlock(pw); return vault; } catch (e) { console.log(e.message); pw = null; }
  }
  process.exit(1);
}

async function otpFlow(company, creds) {
  const { createScraper, CompanyTypes } = require('israeli-bank-scrapers');
  const scraper = createScraper({ companyId: CompanyTypes[company], startDate: new Date(), showBrowser: false });
  console.log('שולח קוד SMS לטלפון...');
  const trig = await scraper.triggerTwoFactorAuth(creds.phoneNumber);
  if (!trig.success) throw new Error(`שליחת SMS נכשלה: ${trig.errorType || ''}`);
  const code = await ask('הזן את הקוד שהתקבל ב-SMS: ');
  const res = await scraper.getLongTermTwoFactorToken(code);
  if (!res.success) throw new Error(`אימות הקוד נכשל: ${res.errorType || ''}`);
  return res.longTermTwoFactorAuthToken;
}

async function addAccount(db, vault) {
  const companies = listCompanies();
  companies.forEach((c, i) => console.log(`${i + 1}. ${c.name}`));
  const idx = Number(await ask('בחר מספר: ')) - 1;
  const company = companies[idx];
  if (!company) { console.log('בחירה לא תקינה.'); return; }
  const label = (await ask('שם לחשבון (למשל "ויזה כאל - דנה"): ')) || company.name;
  const creds = {};
  for (const f of company.fields) {
    if (f.key === 'otpLongTermToken') continue;
    creds[f.key] = (await askHidden(`${f.label}: `)).trim();
  }
  if (company.needsSms) creds.otpLongTermToken = await otpFlow(company.id, creds);
  const r = db.prepare('INSERT INTO accounts (label, company) VALUES (?,?)').run(label, company.id);
  vault.set(Number(r.lastInsertRowid), creds);
  console.log(`✔ החשבון "${label}" נשמר בכספת המוצפנת. להרצה: npm run sync`);
}

async function updateAccount(db, vault) {
  const a = await pick(db, 'איזה חשבון לעדכן?');
  if (!a) return;
  const company = listCompanies().find((c) => c.id === a.company);
  const creds = {};
  for (const f of company.fields) { if (f.key !== 'otpLongTermToken') creds[f.key] = (await askHidden(`${f.label}: `)).trim(); }
  if (company.needsSms) creds.otpLongTermToken = await otpFlow(company.id, creds);
  vault.set(a.id, creds);
  db.prepare('UPDATE accounts SET last_status=NULL WHERE id=?').run(a.id);
  console.log('✔ עודכן.');
}

async function pick(db, title) {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY id').all();
  if (!accounts.length) { console.log('אין חשבונות.'); return null; }
  console.log(title);
  accounts.forEach((a, i) => console.log(`${i + 1}. ${a.label}`));
  return accounts[Number(await ask('מספר: ')) - 1] || null;
}

(async () => {
  const db = openDb(DB_FILE);
  const vault = await getVault();
  for (;;) {
    console.log('\n1. הוספת חשבון  2. עדכון פרטי כניסה  3. הסרת חשבון  4. רשימת חשבונות  0. יציאה');
    const c = await ask('בחירה: ');
    if (c === '1') await addAccount(db, vault).catch((e) => console.log('שגיאה:', e.message));
    else if (c === '2') await updateAccount(db, vault).catch((e) => console.log('שגיאה:', e.message));
    else if (c === '3') { const a = await pick(db, 'איזה חשבון להסיר?'); if (a) { vault.remove(a.id); db.prepare('DELETE FROM accounts WHERE id=?').run(a.id); console.log('✔ הוסר (העסקאות הקיימות נשארות).'); } }
    else if (c === '4') db.prepare('SELECT * FROM accounts').all().forEach((a) => console.log(`- ${a.label} (${a.company}) סטטוס אחרון: ${a.last_status || 'טרם נמשך'}`));
    else if (c === '0') break;
  }
  process.exit(0);
})();
