'use strict';
const crypto = require('crypto');
const { tx, getSetting, setSetting } = require('./db');
const { normalize, merchantKey } = require('./text');
const { compileRules, categorize } = require('./categorize');
const { assignHashes } = require('./dedupe');
const { splitSummary } = require('./recurring');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function loadRules(db) {
  return compileRules(db.prepare(
    'SELECT r.*, c.kind FROM rules r JOIN categories c ON c.id=r.category_id').all());
}
function fallbacks(db) {
  const g = (n) => db.prepare('SELECT id FROM categories WHERE name=?').get(n).id;
  return { expense: g('אחר'), income: g('הכנסה אחרת') };
}

// rows: [{date:'YYYY-MM-DD', amount:number (שלילי=הוצאה), description, memo?, installment?}]
function addTransactions(db, rows, { source, accountId = null } = {}) {
  const clean = [];
  for (const r of rows) {
    const amount = Number(r.amount);
    const description = String(r.description ?? '').trim();
    if (!DATE_RE.test(r.date) || !Number.isFinite(amount) || !description) continue;
    clean.push({ ...r, amount, description });
  }
  assignHashes(clean);
  const rules = loadRules(db);
  const fb = fallbacks(db);
  const ins = db.prepare(`INSERT OR IGNORE INTO transactions
    (hash,date,amount,description,norm,memo,category_id,account_id,source) VALUES (?,?,?,?,?,?,?,?,?)`);
  let added = 0, duplicates = 0;
  tx(db, () => {
    for (const t of clean) {
      const { categoryId } = categorize(t.description, t.amount, rules, fb);
      const res = ins.run(t.hash, t.date, t.amount, t.description, normalize(t.description), t.memo || null, categoryId, accountId, source);
      if (res.changes) added++; else duplicates++;
    }
  });
  return { added, duplicates, skipped: rows.length - clean.length };
}

// בדיקה יבשה: כמה חדשות וכמה כפולות, בלי לכתוב
function previewDuplicates(db, rows) {
  const clean = rows.filter((r) => DATE_RE.test(r.date) && Number.isFinite(Number(r.amount)) && String(r.description || '').trim())
    .map((r) => ({ ...r, amount: Number(r.amount), description: String(r.description).trim() }));
  assignHashes(clean);
  const q = db.prepare('SELECT 1 FROM transactions WHERE hash=?');
  let fresh = 0, dup = 0;
  for (const t of clean) (q.get(t.hash) ? dup++ : fresh++);
  return { new: fresh, duplicates: dup, invalid: rows.length - clean.length };
}

function addManual(db, { date, amount, description, categoryId, type }) {
  let amt = Math.abs(Number(amount));
  if (!Number.isFinite(amt) || amt === 0) throw new Error('סכום לא תקין');
  if (!DATE_RE.test(date)) throw new Error('תאריך לא תקין');
  if (!String(description || '').trim()) throw new Error('חסר תיאור');
  const signed = type === 'income' ? amt : -amt;
  const cat = categoryId || (signed > 0 ? fallbacks(db).income : fallbacks(db).expense);
  const hash = 'manual:' + crypto.randomUUID();
  const r = db.prepare(`INSERT INTO transactions (hash,date,amount,description,norm,category_id,manual_category,source)
    VALUES (?,?,?,?,?,?,1,'manual')`).run(hash, date, signed, String(description).trim(), normalize(description), cat);
  return Number(r.lastInsertRowid);
}

// תיקון קטגוריה. מחזיר הצעה ליצור חוק + כמה עסקאות דומות יושפעו.
function setCategory(db, txId, categoryId) {
  const t = db.prepare('SELECT * FROM transactions WHERE id=?').get(txId);
  if (!t) throw new Error('עסקה לא נמצאה');
  if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(categoryId)) throw new Error('קטגוריה לא קיימת');
  db.prepare('UPDATE transactions SET category_id=?, manual_category=1 WHERE id=?').run(categoryId, txId);
  const pattern = merchantKey(t.description);
  let similar = 0;
  if (pattern) {
    similar = db.prepare(`SELECT COUNT(*) c FROM transactions WHERE id<>? AND manual_category=0 AND category_id<>? AND instr(norm, ?)>0`)
      .get(txId, categoryId, pattern).c;
  }
  return { suggestion: pattern ? { pattern, categoryId, similar } : null };
}

// יצירת חוק והחלה על עסקאות דומות שלא תוקנו ידנית
function createRule(db, { pattern, categoryId, sign = 'any', wholeWord = false, apply = true }) {
  const np = normalize(pattern);
  if (!np) throw new Error('תבנית ריקה');
  if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(categoryId)) throw new Error('קטגוריה לא קיימת');
  const r = db.prepare('INSERT INTO rules (pattern, category_id, sign, whole_word, builtin) VALUES (?,?,?,?,0)')
    .run(pattern.trim(), categoryId, sign, wholeWord ? 1 : 0);
  const updated = apply ? applyRule(db, Number(r.lastInsertRowid)) : 0;
  return { id: Number(r.lastInsertRowid), updated };
}

function applyRule(db, ruleId) {
  const rule = db.prepare('SELECT r.*, c.kind FROM rules r JOIN categories c ON c.id=r.category_id WHERE r.id=?').get(ruleId);
  if (!rule) return 0;
  const np = normalize(rule.pattern);
  const cands = db.prepare('SELECT id, norm, amount FROM transactions WHERE manual_category=0 AND category_id<>?').all(rule.category_id);
  const { matches } = require('./categorize');
  const upd = db.prepare('UPDATE transactions SET category_id=? WHERE id=?');
  let n = 0;
  tx(db, () => {
    for (const c of cands) if (matches({ ...rule, np }, c.norm, c.amount)) { upd.run(rule.category_id, c.id); n++; }
  });
  return n;
}

// סיווג מחדש של כל העסקאות שלא תוקנו ידנית (למשל אחרי עריכת חוקים)
function recategorizeAll(db) {
  const rules = loadRules(db);
  const fb = fallbacks(db);
  const rows = db.prepare('SELECT id, description, amount, category_id FROM transactions WHERE manual_category=0').all();
  const upd = db.prepare('UPDATE transactions SET category_id=? WHERE id=?');
  let n = 0;
  tx(db, () => {
    for (const r of rows) {
      const { categoryId } = categorize(r.description, r.amount, rules, fb);
      if (categoryId !== r.category_id) { upd.run(categoryId, r.id); n++; }
    }
  });
  return n;
}

function monthRange(month) {
  if (!MONTH_RE.test(month)) throw new Error('חודש לא תקין (YYYY-MM)');
  return month;
}
function addMonths(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function effectiveIncome(db, month, computed) {
  const ov = getSetting(db, `income:${month}`, null);
  if (ov !== null) return { income: Number(ov), source: 'manual' };
  const def = getSetting(db, 'income_default', null);
  if (computed <= 0 && def !== null) return { income: Number(def), source: 'default' };
  return { income: computed, source: computed > 0 ? 'transactions' : 'none' };
}

// הכנסה שהוזנה ידנית: לחודש מסוים, או כברירת מחדל לכל החודשים. amount=null מבטל.
function setIncome(db, month, amount, all) {
  monthRange(month);
  if (amount === null) { db.prepare('DELETE FROM settings WHERE key=?').run(`income:${month}`); return; }
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) throw new Error('סכום הכנסה לא תקין');
  if (all) { setSetting(db, 'income_default', n); db.prepare('DELETE FROM settings WHERE key=?').run(`income:${month}`); } else setSetting(db, `income:${month}`, n);
}

function summary(db, month, accountId = null) {
  monthRange(month);
  const rows = db.prepare(`SELECT c.id, c.name, c.kind, c.color, SUM(t.amount) total, COUNT(*) n
    FROM transactions t JOIN categories c ON c.id=t.category_id
    WHERE t.ignored=0 AND substr(t.date,1,7)=? AND (? IS NULL OR t.account_id=?) GROUP BY c.id`).all(month, accountId, accountId);
  const budgets = new Map(db.prepare('SELECT category_id, amount FROM budgets').all().map((b) => [b.category_id, b.amount]));
  let income = 0, expense = 0, transfers = 0;
  const expenses = [], incomes = [];
  for (const r of rows) {
    if (r.kind === 'transfer') { transfers += r.total; continue; }
    if (r.kind === 'income') { income += r.total; incomes.push({ id: r.id, name: r.name, color: r.color, total: r.total, count: r.n }); }
    else {
      const spent = -r.total; expense += spent;
      const budget = budgets.get(r.id) || null;
      expenses.push({ id: r.id, name: r.name, color: r.color, total: spent, count: r.n, budget, pct: budget ? spent / budget : null });
    }
  }
  // קטגוריות עם תקציב ובלי הוצאות החודש
  for (const [cid, amount] of budgets) {
    if (!expenses.find((e) => e.id === cid)) {
      const c = db.prepare('SELECT * FROM categories WHERE id=?').get(cid);
      if (c && c.kind === 'expense') expenses.push({ id: c.id, name: c.name, color: c.color, total: 0, count: 0, budget: amount, pct: 0 });
    }
  }
  expenses.sort((a, b) => b.total - a.total);
  incomes.sort((a, b) => b.total - a.total);

  const trend = [];
  const from = addMonths(month, -5);
  const tr = db.prepare(`SELECT substr(t.date,1,7) m, c.kind, SUM(t.amount) total FROM transactions t
    JOIN categories c ON c.id=t.category_id WHERE t.ignored=0 AND c.kind<>'transfer' AND substr(t.date,1,7) BETWEEN ? AND ? AND (? IS NULL OR t.account_id=?)
    GROUP BY m, c.kind`).all(from, month, accountId, accountId);
  for (let i = 0; i < 6; i++) {
    const m = addMonths(from, i);
    let inc = tr.find((x) => x.m === m && x.kind === 'income')?.total || 0;
    if (!accountId) inc = effectiveIncome(db, m, inc).income;
    const exp = -(tr.find((x) => x.m === m && x.kind === 'expense')?.total || 0);
    trend.push({ month: m, income: inc, expense: exp });
  }
  const incomeComputed = income;
  let incomeSource = income > 0 ? 'transactions' : 'none';
  if (!accountId) { const e = effectiveIncome(db, month, income); income = e.income; incomeSource = e.source; }
  const { split, trend: st } = splitSummary(db, month, accountId);
  for (const t of trend) { const x = st.get(t.month); t.recurring = x ? x.recurring : 0; t.oneTime = x ? x.oneTime : 0; }
  return { month, income, incomeComputed, incomeSource, expense, balance: income - expense, transfers, expenses, incomes, trend, split };
}

// תובנות לגרפים: קצב הוצאה מצטבר מול החודש הקודם, בתי העסק הגדולים, וחלוקה לפי כרטיס
function insights(db, month, accountId = null) {
  monthRange(month);
  const prev = addMonths(month, -1);
  const rows = db.prepare(`SELECT t.date, t.amount, t.description, t.account_id FROM transactions t JOIN categories c ON c.id=t.category_id
    WHERE t.ignored=0 AND c.kind='expense' AND substr(t.date,1,7) IN (?,?)`).all(month, prev);
  const daysIn = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  const now = new Date();
  const todayM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const cum = (m, upTo) => {
    const daily = new Array(daysIn(m)).fill(0);
    for (const r of rows) if (r.date.startsWith(m) && (!accountId || r.account_id === accountId)) daily[Number(r.date.slice(8, 10)) - 1] += -r.amount;
    const out = []; let sum = 0;
    for (let d = 0; d < Math.min(daily.length, upTo); d++) { sum += daily[d]; out.push(Math.round(sum * 100) / 100); }
    return out;
  };
  const isNow = month === todayM;
  const merchants = new Map();
  for (const r of rows) {
    if (!r.date.startsWith(month) || r.amount >= 0 || (accountId && r.account_id !== accountId)) continue;
    const k = merchantKey(r.description) || r.description;
    const m = merchants.get(k) || { total: 0, count: 0, names: new Map() };
    m.total += -r.amount; m.count++; m.names.set(r.description, (m.names.get(r.description) || 0) + 1);
    merchants.set(k, m);
  }
  const topMerchants = [...merchants.values()].map((m) => ({ name: [...m.names.entries()].sort((a, b) => b[1] - a[1])[0][0], total: m.total, count: m.count }))
    .sort((a, b) => b.total - a.total).slice(0, 8);
  const byAccount = db.prepare(`SELECT a.id, COALESCE(a.label, 'ללא כרטיס (ידני או מקובץ)') label, SUM(-t.amount) total FROM transactions t JOIN categories c ON c.id=t.category_id
    LEFT JOIN accounts a ON a.id=t.account_id WHERE t.ignored=0 AND c.kind='expense' AND substr(t.date,1,7)=? GROUP BY a.id ORDER BY total DESC`).all(month).filter((r) => r.total > 0);
  return {
    month, prevMonth: prev, daysInMonth: daysIn(month), todayDay: isNow ? now.getDate() : null,
    current: cum(month, isNow ? now.getDate() : 99), previous: cum(prev, 99), topMerchants, byAccount,
  };
}

function listTransactions(db, { month, q, categoryId, accountId, type, limit = 200, offset = 0 }) {
  const where = ['1=1'], args = [];
  if (month) { monthRange(month); where.push('substr(t.date,1,7)=?'); args.push(month); }
  if (q) { where.push("(t.norm LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR IFNULL(t.memo,'') LIKE ? ESCAPE '\\')"); const esc = (x) => x.replace(/[\\%_]/g, (c) => '\\' + c); const l = `%${esc(String(q))}%`; args.push(`%${esc(normalize(String(q)))}%`, l, l); }
  if (categoryId) { where.push('t.category_id=?'); args.push(Number(categoryId)); }
  if (accountId) { where.push('t.account_id=?'); args.push(Number(accountId)); }
  if (type === 'income') where.push('t.amount>0');
  if (type === 'expense') where.push('t.amount<0');
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM transactions t WHERE ${w}`).get(...args).c;
  const items = db.prepare(`SELECT t.id,t.date,t.amount,t.description,t.memo,t.category_id,t.manual_category,t.ignored,t.source,t.account_id,
      c.name category, c.color color, c.kind kind
    FROM transactions t JOIN categories c ON c.id=t.category_id WHERE ${w}
    ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?`).all(...args, Math.min(Number(limit) || 200, 1000), Number(offset) || 0);
  return { total, items };
}

module.exports = {
  addTransactions, previewDuplicates, addManual, setCategory, createRule, applyRule, recategorizeAll,
  summary, listTransactions, insights, setIncome, addMonths, loadRules, MONTH_RE,
};
