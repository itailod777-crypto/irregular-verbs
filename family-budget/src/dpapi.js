'use strict';
// "זכור במחשב הזה" ל-Windows: סיסמת-העל נשמרת מוצפנת בעזרת DPAPI של המשתמש הנוכחי, כדי שהכספת תיפתח לבד אחרי הפעלה מחדש.
// הסוד עובר ב-stdin ולא בשורת הפקודה. הקובץ לא ניתן לפענוח בחשבון Windows אחר או במחשב אחר.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const file = () => path.join(DATA_DIR, 'master.dpapi');
const PS = (script, input) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input, encoding: 'utf8', windowsHide: true, timeout: 20000 }).trim();
const LOAD = 'Add-Type -AssemblyName System.Security;[Console]::InputEncoding=[Text.Encoding]::UTF8;$i=[Console]::In.ReadToEnd();';

const supported = () => process.platform === 'win32';
const exists = () => fs.existsSync(file());
function save(password) {
  const b64 = PS(`${LOAD}$b=[Text.Encoding]::UTF8.GetBytes($i);[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,'CurrentUser'))`, password);
  fs.writeFileSync(file(), b64, { mode: 0o600 });
}
function load() {
  if (!supported() || !exists()) return null;
  const out = PS(`${LOAD}$b=[Convert]::FromBase64String($i.Trim());$o=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');[Console]::OutputEncoding=[Text.Encoding]::UTF8;[Console]::Out.Write([Text.Encoding]::UTF8.GetString($o))`, fs.readFileSync(file(), 'utf8'));
  return out || null;
}
function forget() { try { fs.unlinkSync(file()); } catch { /* לא קיים */ } }

module.exports = { supported, exists, save, load, forget };
