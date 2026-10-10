'use strict';
// משתמשים, סיסמאות וסשנים לבני המשפחה. הכול מקומי: הסיסמאות נשמרות רק כ-hash (scrypt + מלח),
// ובקוקי נשמר טוקן אקראי שרק ה-hash שלו נשמר במסד.
const crypto = require('crypto');

const SC = { N: 1 << 14, r: 8, p: 1 };
const SESSION_DAYS = 30;
const USERNAME_RE = /^[\p{L}\p{N}._-]{2,30}$/u;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32, { ...SC, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SC.N}$${SC.r}$${SC.p}$${salt.toString('base64')}$${h.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [, N, r, p, salt, hash] = String(stored).split('$');
    const want = Buffer.from(hash, 'base64');
    const got = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), want.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return crypto.timingSafeEqual(got, want);
  } catch { return false; }
}
const DUMMY = hashPassword('dummy-password-for-timing');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };

class Auth {
  constructor(db) { this.db = db; this.fails = new Map(); }

  usersExist() { return this.db.prepare('SELECT COUNT(*) c FROM users').get().c > 0; }

  _publicUser(u) { return u && { id: u.id, username: u.username, displayName: u.display_name, role: u.role, lastLogin: u.last_login || null }; }
  listUsers() { return this.db.prepare('SELECT * FROM users ORDER BY id').all().map((u) => this._publicUser(u)); }

  createUser({ username, displayName, password, role = 'member' }) {
    const uname = String(username || '').trim().toLowerCase();
    if (!USERNAME_RE.test(uname)) throw fail('שם משתמש: 2 עד 30 תווים (אותיות, ספרות, נקודה, מקף או קו תחתון)');
    const name = String(displayName || '').trim().slice(0, 40);
    if (!name) throw fail('חסר שם להצגה');
    if (String(password || '').length < 8) throw fail('הסיסמה חייבת להכיל לפחות 8 תווים');
    if (!['admin', 'member'].includes(role)) throw fail('תפקיד לא תקין');
    if (this.db.prepare('SELECT 1 FROM users WHERE username=?').get(uname)) throw fail('שם המשתמש הזה כבר תפוס');
    const r = this.db.prepare('INSERT INTO users (username, display_name, password_hash, role) VALUES (?,?,?,?)').run(uname, name, hashPassword(password), role);
    return Number(r.lastInsertRowid);
  }

  _throttleKey(username, ip) { return `${String(username).toLowerCase()}|${ip}`; }
  authenticate(username, password, ip) {
    const key = this._throttleKey(username, ip), f = this.fails.get(key);
    if (f && f.until > Date.now()) throw fail('יותר מדי ניסיונות. נסו שוב בעוד דקה.', 429);
    const u = this.db.prepare('SELECT * FROM users WHERE username=?').get(String(username || '').trim().toLowerCase());
    const ok = verifyPassword(password, u ? u.password_hash : DUMMY) && !!u;
    if (!ok) {
      const expired = f && f.until && f.until <= Date.now(); // חסימה שפגה מתחילה ספירה מחדש
      const n = (f && !expired ? f.n : 0) + 1;
      this.fails.set(key, { n, until: n >= 5 ? Date.now() + 60000 : 0 });
      throw fail('שם משתמש או סיסמה לא נכונים', 401);
    }
    this.fails.delete(key);
    this.db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
    return u;
  }

  createSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    this.db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
    this.db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,datetime('now','+${SESSION_DAYS} days'))`).run(sha(token), userId);
    return token;
  }
  cookieFor(token) { return `fb_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}`; }
  clearCookie() { return 'fb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'; }

  userFromRequest(req) {
    const token = parseCookies(req.headers.cookie).fb_session;
    if (!token) return null;
    const u = this.db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')`).get(sha(token));
    return u ? this._publicUser(u) : null;
  }
  destroySession(req) { const t = parseCookies(req.headers.cookie).fb_session; if (t) this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(t)); }

  setPassword(userId, password) {
    if (String(password || '').length < 8) throw fail('הסיסמה החדשה חייבת להכיל לפחות 8 תווים');
    this.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), userId);
    this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); // מנתק את כל המכשירים
  }
  changeOwnPassword(userId, current, next) {
    const u = this.db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    if (!u || !verifyPassword(current, u.password_hash)) throw fail('הסיסמה הנוכחית לא נכונה', 401);
    this.setPassword(userId, next);
  }
  deleteUser(id, actingId) {
    const u = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) throw fail('משתמש לא נמצא', 404);
    if (id === actingId) throw fail('אי אפשר למחוק את עצמך');
    if (u.role === 'admin' && this.db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c <= 1) throw fail('חייב להישאר לפחות מנהל אחד');
    this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    this.db.prepare('UPDATE transactions SET created_by=NULL WHERE created_by=?').run(id);
    this.db.prepare('DELETE FROM users WHERE id=?').run(id);
  }
}

// כתובות שמותר להתחבר מהן: רשת מקומית בלבד (לופבק או כתובות פרטיות)
function isPrivateIp(ip) {
  let a = String(ip || '').replace(/^::ffff:/, '');
  if (a === '::1' || a === '127.0.0.1') return true;
  const m = a.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return /^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a);
  const [o1, o2] = [Number(m[1]), Number(m[2])];
  return o1 === 127 || o1 === 10 || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168) || (o1 === 169 && o2 === 254);
}

module.exports = { Auth, hashPassword, verifyPassword, isPrivateIp, parseCookies };
