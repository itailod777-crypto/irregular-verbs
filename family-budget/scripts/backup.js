'use strict';
// גיבוי: עותק עקבי של המסד והכספת לתיקייה לבחירתך (ברירת מחדל: data/backups). הכספת נשארת מוצפנת.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, DB_FILE, VAULT_FILE } = require('../src/config');
const { openDb } = require('../src/db');

const dest = path.resolve(process.argv[2] || path.join(DATA_DIR, 'backups'));
fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const db = openDb(DB_FILE);
const dbOut = path.join(dest, `budget-${stamp}.db`);
db.exec(`VACUUM INTO '${dbOut.replace(/'/g, "''")}'`);
if (fs.existsSync(VAULT_FILE)) fs.copyFileSync(VAULT_FILE, path.join(dest, `vault-${stamp}.json`));
console.log('גיבוי נשמר ב:', dest);
