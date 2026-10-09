'use strict';
// איתור סיסמת-על להרצה לא-אינטראקטיבית (משיכה יומית):
// 1) BUDGET_KEY_FILE  2) data/master.key  3) BUDGET_MASTER_PASSWORD  4) null (ישאל בטרמינל/בממשק)
const fs = require('fs');
const { DEFAULT_KEY_FILE } = require('./config');

function readKeyFile(file) {
  const st = fs.statSync(file);
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
    throw new Error(`הרשאות קובץ המפתח ${file} רחבות מדי. הרץ: chmod 600 "${file}"`);
  }
  return fs.readFileSync(file, 'utf8').replace(/\r?\n$/, '');
}

function findMasterPassword() {
  const f = process.env.BUDGET_KEY_FILE;
  if (f) return readKeyFile(f);
  if (fs.existsSync(DEFAULT_KEY_FILE)) return readKeyFile(DEFAULT_KEY_FILE);
  if (process.env.BUDGET_MASTER_PASSWORD) return process.env.BUDGET_MASTER_PASSWORD;
  return null;
}

module.exports = { findMasterPassword };
