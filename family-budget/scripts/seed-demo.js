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
const { bank, card } = generateDemo(endMonth, 6);
const r1 = store.addTransactions(db, bank, { source: 'demo' });
const r2 = store.addTransactions(db, card, { source: 'demo' });
for (const [name, amt] of [['סופרמרקט', 2800], ['מסעדות וקפה', 900], ['דלק', 1000], ['בריאות', 500], ['פנאי ובילויים', 400]]) {
  const c = db.prepare('SELECT id FROM categories WHERE name=?').get(name);
  db.prepare('INSERT OR REPLACE INTO budgets (category_id, amount) VALUES (?,?)').run(c.id, amt);
}
console.log(`נתוני דוגמה נטענו ב-${DB_FILE}: ${r1.added + r2.added} עסקאות חדשות (${r1.duplicates + r2.duplicates} כפולות דולגו).`);

