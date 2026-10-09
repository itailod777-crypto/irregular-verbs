'use strict';
// כספת פרטי כניסה: AES-256-GCM, מפתח נגזר מסיסמת-על דרך scrypt.
// הקובץ vault.json מכיל רק מלח, פרמטרי KDF, IV, תג אימות וטקסט מוצפן.
const crypto = require('crypto');
const fs = require('fs');

const KDF = { N: 1 << 15, r: 8, p: 1 };
const AAD = Buffer.from('family-budget-vault-v1');

function deriveKey(password, salt, kdf = KDF) {
  return crypto.scryptSync(String(password), salt, 32, {
    N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * kdf.N * kdf.r,
  });
}

function seal(key, obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ct.toString('base64') };
}

function open(key, blob) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

class WrongPasswordError extends Error {
  constructor() { super('סיסמת-על שגויה'); this.name = 'WrongPasswordError'; }
}

class Vault {
  constructor(file) {
    this.file = file;
    this.key = null;
    this.salt = null;
    this.kdf = KDF;
    this.content = null; // { accounts: { [accountId]: credentials } }
  }

  exists() { return fs.existsSync(this.file); }
  isUnlocked() { return this.key !== null; }

  init(password) {
    if (this.exists()) throw new Error('הכספת כבר קיימת');
    if (!password || String(password).length < 8) throw new Error('סיסמת-על חייבת להכיל לפחות 8 תווים');
    this.salt = crypto.randomBytes(16);
    this.kdf = KDF;
    this.key = deriveKey(password, this.salt, this.kdf);
    this.content = { accounts: {} };
    this._save();
  }

  unlock(password) {
    if (!this.exists()) throw new Error('הכספת עדיין לא נוצרה');
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    const salt = Buffer.from(raw.kdf.salt, 'base64');
    const key = deriveKey(password, salt, raw.kdf);
    try {
      this.content = open(key, raw);
    } catch {
      throw new WrongPasswordError();
    }
    this.key = key;
    this.salt = salt;
    this.kdf = { N: raw.kdf.N, r: raw.kdf.r, p: raw.kdf.p };
  }

  lock() { this.key = null; this.content = null; }

  _requireUnlocked() { if (!this.key) throw new Error('הכספת נעולה'); }

  _save() {
    const blob = seal(this.key, this.content);
    const out = { v: 1, kdf: { name: 'scrypt', ...this.kdf, salt: this.salt.toString('base64') }, ...blob };
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  get(accountId) { this._requireUnlocked(); return this.content.accounts[accountId] || null; }

  set(accountId, creds) {
    this._requireUnlocked();
    this.content.accounts[accountId] = creds;
    this._save();
  }

  remove(accountId) {
    this._requireUnlocked();
    delete this.content.accounts[accountId];
    this._save();
  }
}

module.exports = { Vault, WrongPasswordError, deriveKey, seal, open, KDF };
