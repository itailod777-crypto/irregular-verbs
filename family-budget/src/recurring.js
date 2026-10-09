'use strict';
// הפרדה בין הוצאות חוזרות (מנויים, חשבונות, ארנונה...) להוצאות חד-פעמיות.
// הוצאה נחשבת חוזרת אם: (1) המשתמש סימן כך לבית העסק, או (2) הקטגוריה חוזרת מטבעה (חשמל, ארנונה, מנויים...),
// או (3) זוהתה אוטומטית: בית עסק שמופיע לפחות ב-3 מתוך 6 החודשים האחרונים בסכום דומה ולא יותר מ-2 חיובים בחודש.
const { merchantKey } = require('./text');

function addMonths(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const keyOf = (desc) => merchantKey(desc) || String(desc).trim().toLowerCase();

// מחזיר את כל הוצאות 6 החודשים שנגמרים ב-month, עם סימון recurring לכל אחת
function classifyWindow(db, month) {
  const from = addMonths(month, -5);
  const rows = db.prepare(`SELECT t.id, t.date, t.amount, t.description, t.category_id, c.name category, c.color, c.recurring_default rd,
      substr(t.date,1,7) m FROM transactions t JOIN categories c ON c.id=t.category_id
    WHERE t.ignored=0 AND c.kind='expense' AND substr(t.date,1,7) BETWEEN ? AND ?`).all(from, month);
  const overrides = new Map(db.prepare('SELECT key, recurring FROM recurring_overrides').all().map((o) => [o.key, !!o.recurring]));
  const stats = new Map();
  for (const r of rows) {
    r.key = keyOf(r.description);
    if (r.amount >= 0) continue;
    const s = stats.get(r.key) || { months: new Map(), min: Infinity, max: 0 };
    s.months.set(r.m, (s.months.get(r.m) || 0) + 1);
    const a = -r.amount; s.min = Math.min(s.min, a); s.max = Math.max(s.max, a);
    stats.set(r.key, s);
  }
  const auto = new Set();
  for (const [k, s] of stats) {
    const maxPerMonth = Math.max(...s.months.values());
    if (s.months.size >= 3 && maxPerMonth <= 2 && s.max / s.min <= 1.6) auto.add(k);
  }
  for (const r of rows) {
    const o = overrides.get(r.key);
    r.override = o === undefined ? null : o;
    r.auto = auto.has(r.key) || !!r.rd;
    r.recurring = o !== undefined ? o : r.auto;
  }
  return { rows, from, overrides };
}

function setOverride(db, key, recurring) {
  const k = String(key || '').trim();
  if (!k) throw new Error('חסר מפתח בית עסק');
  if (recurring === null || recurring === undefined) db.prepare('DELETE FROM recurring_overrides WHERE key=?').run(k);
  else db.prepare('INSERT INTO recurring_overrides (key, recurring) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET recurring=excluded.recurring').run(k, recurring ? 1 : 0);
}

function splitSummary(db, month) {
  const { rows } = classifyWindow(db, month);
  const split = { recurring: 0, oneTime: 0 };
  const trend = new Map();
  for (const r of rows) {
    const amt = -r.amount;
    const t = trend.get(r.m) || { recurring: 0, oneTime: 0 };
    t[r.recurring ? 'recurring' : 'oneTime'] += amt;
    trend.set(r.m, t);
    if (r.m === month) split[r.recurring ? 'recurring' : 'oneTime'] += amt;
  }
  return { split, trend };
}

function recurringPage(db, month) {
  const { rows } = classifyWindow(db, month);
  const months = [];
  for (let i = 0; i < 6; i++) months.push(addMonths(month, i - 5));
  const groups = new Map();
  for (const r of rows) {
    if (!r.recurring) continue;
    const g = groups.get(r.key) || { key: r.key, names: new Map(), categoryId: r.category_id, category: r.category, color: r.color, byMonth: Object.fromEntries(months.map((m) => [m, 0])), override: r.override, auto: r.auto, count: 0 };
    g.names.set(r.description, (g.names.get(r.description) || 0) + 1);
    g.byMonth[r.m] += -r.amount; g.count++;
    groups.set(r.key, g);
  }
  const prev = addMonths(month, -1);
  const items = [...groups.values()].map((g) => {
    const name = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const vals = months.map((m) => g.byMonth[m]);
    const active = vals.filter((v) => v !== 0);
    const avg = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
    return {
      key: g.key, name, categoryId: g.categoryId, category: g.category, color: g.color, auto: g.auto, override: g.override,
      monthly: vals, thisMonth: g.byMonth[month], average: avg,
      pending: g.byMonth[month] === 0 && g.byMonth[prev] !== 0, // היה בחודש שעבר וטרם חויב החודש
    };
  }).sort((a, b) => Math.max(b.thisMonth, b.average) - Math.max(a.thisMonth, a.average));
  const totals = months.map((_, i) => items.reduce((s, it) => s + it.monthly[i], 0));
  const expectedRest = items.filter((i) => i.pending).reduce((s, i) => s + i.average, 0);
  return { month, months, items, totals, thisMonth: totals[5], expectedRest, yearly: items.reduce((s, i) => s + i.average, 0) * 12 };
}

function oneTimePage(db, month) {
  const { rows } = classifyWindow(db, month);
  const mine = rows.filter((r) => r.m === month && !r.recurring);
  const byCat = new Map();
  let total = 0;
  for (const r of mine) {
    const c = byCat.get(r.category_id) || { id: r.category_id, name: r.category, color: r.color, total: 0, count: 0 };
    c.total += -r.amount; c.count++; total += -r.amount;
    byCat.set(r.category_id, c);
  }
  const trend = [];
  for (let i = 0; i < 6; i++) {
    const m = addMonths(month, i - 5);
    trend.push({ month: m, total: rows.filter((r) => r.m === m && !r.recurring).reduce((s, r) => s - r.amount, 0) });
  }
  const items = mine.sort((a, b) => a.amount - b.amount).map((r) => ({ id: r.id, date: r.date, amount: r.amount, description: r.description, category: r.category, color: r.color, key: r.key }));
  return { month, total, byCategory: [...byCat.values()].sort((a, b) => b.total - a.total), trend, items };
}

module.exports = { classifyWindow, setOverride, splitSummary, recurringPage, oneTimePage };
