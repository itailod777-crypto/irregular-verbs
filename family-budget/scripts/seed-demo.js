'use strict';
// טוען נתוני דוגמה מזויפים למסד נפרד (data-demo), כדי לא להתערבב עם הנתונים האמיתיים.
const path = require('path');
if (!process.env.BUDGET_DATA_DIR) process.env.BUDGET_DATA_DIR = path.join(__dirname, '..', 'data-demo');
const { DB_FILE } = require('../src/config');
const { openDb } = require('../src/db');
const store = require('../src/store');
const { generateDemo } = require('../src/demo-data');

const db = openDb(DB_FILE);
const now = new Date();
const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const today = now.toISOString().slice(0, 10);
const gen = generateDemo(endMonth, 6);
const bank = gen.bank.filter((t) => t.date <= today), card = gen.card.filter((t) => t.date <= today); // בלי תאריכים עתידיים
const r1 = store.addTransactions(db, bank, { source: 'demo' });
// שני כרטיסי אשראי מזויפים, כדי להדגים איחוד נתונים וסינון לפי כרטיס
const mk = (label, company) => Number(db.prepare('INSERT INTO accounts (label, company) VALUES (?,?)').run(label, company).lastInsertRowid);
const hasAcc = db.prepare('SELECT COUNT(*) c FROM accounts').get().c;
const a1 = hasAcc ? db.prepare('SELECT id FROM accounts ORDER BY id LIMIT 1').get().id : mk('ויזה כאל - דנה', 'visaCal');
const a2 = hasAcc ? db.prepare('SELECT id FROM accounts ORDER BY id DESC LIMIT 1').get().id : mk('ישראכרט - יוסי', 'isracard');
const r1b = store.addTransactions(db, card.filter((_, i) => i % 3 !== 0), { source: 'demo', accountId: a1 });
const r2 = store.addTransactions(db, card.filter((_, i) => i % 3 === 0), { source: 'demo', accountId: a2 });
r2.added += r1b.added; r2.duplicates += r1b.duplicates;
for (const [name, amt] of [['סופרמרקט', 2800], ['מסעדות וקפה', 900], ['דלק', 1000], ['בריאות', 500], ['פנאי ובילויים', 400]]) {
  const c = db.prepare('SELECT id FROM categories WHERE name=?').get(name);
  db.prepare('INSERT OR REPLACE INTO budgets (category_id, amount) VALUES (?,?)').run(c.id, amt);
}
console.log(`נתוני דוגמה נטענו ב-${DB_FILE}: ${r1.added + r2.added} עסקאות חדשות (${r1.duplicates + r2.duplicates} כפולות דולגו).`);

