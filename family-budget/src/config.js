'use strict';
// הגדרות בסיס. מגדיר umask מחמיר כדי שכל קובץ שנוצר יהיה נגיש רק למשתמש (ב-Windows אין השפעה).
const fs = require('fs');
const path = require('path');

try { process.umask(0o077); } catch { /* לא נתמך בחלק מהמערכות */ }

const DATA_DIR = process.env.BUDGET_DATA_DIR
  ? path.resolve(process.env.BUDGET_DATA_DIR)
  : path.join(__dirname, '..', 'data');

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
try { fs.chmodSync(DATA_DIR, 0o700); } catch { /* ignore */ }

module.exports = {
  DATA_DIR,
  DB_FILE: path.join(DATA_DIR, 'budget.db'),
  VAULT_FILE: path.join(DATA_DIR, 'vault.json'),
  DEFAULT_KEY_FILE: path.join(DATA_DIR, 'master.key'),
  HOST: '127.0.0.1', // קבוע בכוונה - לא ניתן לשינוי דרך הגדרות
  PORT: Number(process.env.PORT) || 3000,
};
