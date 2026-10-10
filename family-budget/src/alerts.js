'use strict';
// "שימו לב": דברים שכדאי לבדוק בחודש הנבחר. הכול נקבע לפי כללים פשוטים ושקופים, בלי ניחושים.
const { classifyWindow } = require('./recurring');

const money = (n) => `₪${Math.round(n).toLocaleString('he-IL')}`;
const dateHe = (iso) => iso.split('-').reverse().join('/');

function alerts(db, month, accountId = null) {
  const { rows } = classifyWindow(db, month, accountId);
  const cur = rows.filter((r) => r.m === month && r.amount < 0);
  const out = [];

  // 1. אותו חיוב פעמיים באותו יום (ייתכן חיוב כפול)
  const same = new Map();
  for (const r of cur) { const k = `${r.date}|${r.key}|${r.amount}`; (same.get(k) || same.set(k, []).get(k)).push(r); }
  for (const list of same.values()) {
    const r = list[0];
    if (list.length >= 2 && -r.amount >= 30) {
      out.push({ weight: 90, level: 'warn', type: 'duplicate', title: 'אותו חיוב הופיע פעמיים?',
        text: `${r.description}: ${money(-r.amount)} חויב ${list.length} פעמים ב-${dateHe(r.date)}. אם זה לא צפוי, כדאי לבדוק מול הכרטיס.` });
    }
  }

  // 2. מנוי במחיר קבוע שהתייקר
  const byKey = new Map();
  for (const r of rows) {
    if (!r.recurring || r.amount >= 0) continue;
    const g = byKey.get(r.key) || { name: r.description, months: new Map() };
    g.months.set(r.m, (g.months.get(r.m) || 0) - r.amount);
    byKey.set(r.key, g);
  }
  for (const g of byKey.values()) {
    const now = g.months.get(month);
    const prev = [...g.months.entries()].filter(([m]) => m !== month).map(([, v]) => v);
    if (!now || prev.length < 2) continue;
    const lo = Math.min(...prev), hi = Math.max(...prev);
    if (hi / lo > 1.03) continue; // מחיר שלא היה קבוע (למשל חשמל) לא נחשב
    const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
    if (now >= avg * 1.08 && now - avg >= 5) {
      out.push({ weight: 80, level: 'warn', type: 'price', title: `${g.name} התייקר`,
        text: `החודש ${money(now)} במקום ${money(avg)} בדרך כלל (תוספת של ${money(now - avg)} בחודש).` });
    }
  }

  // 3. הוצאה חד-פעמית גדולה במיוחד
  const all = rows.filter((r) => r.amount < 0).map((r) => -r.amount).sort((a, b) => a - b);
  const median = all.length ? all[Math.floor(all.length / 2)] : 0;
  const limit = Math.max(800, median * 4);
  cur.filter((r) => !r.recurring && -r.amount >= limit).sort((a, b) => a.amount - b.amount).slice(0, 2).forEach((r) => {
    out.push({ weight: 60, level: 'info', type: 'big', title: 'הוצאה גדולה מהרגיל',
      text: `${r.description}: ${money(-r.amount)} ב-${dateHe(r.date)} (${r.category}).` });
  });

  // 4. תקציב
  const spent = new Map();
  for (const r of cur) spent.set(r.category_id, (spent.get(r.category_id) || 0) - r.amount);
  for (const b of db.prepare('SELECT b.category_id, b.amount, c.name FROM budgets b JOIN categories c ON c.id=b.category_id').all()) {
    const sp = spent.get(b.category_id) || 0, p = sp / b.amount;
    if (p > 1) out.push({ weight: 85, level: 'crit', type: 'budget', title: `חרגתם בתקציב: ${b.name}`, text: `יצא ${money(sp)} מתוך תקציב של ${money(b.amount)} (חריגה של ${money(sp - b.amount)}).` });
    else if (p >= 0.85) out.push({ weight: 50, level: 'info', type: 'budget', title: `קרובים לתקרה: ${b.name}`, text: `יצא ${money(sp)} מתוך ${money(b.amount)}. נשארו ${money(b.amount - sp)}.` });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 6).map(({ weight, ...rest }) => rest); // eslint-disable-line no-unused-vars
}

module.exports = { alerts };
