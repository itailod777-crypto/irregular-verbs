'use strict';
const crypto = require('crypto');
const { normalize } = require('./text');

// hash לפי תאריך, סכום ושם בית עסק (+ מספר תשלום אם יש).
// עסקאות זהות באותו יום בתוך אותה קבוצה מקבלות מונה (#0, #1...) כדי לא להתמזג,
// ומשיכה חוזרת של אותו טווח מייצרת בדיוק אותם hash-ים.
function baseKey(t) {
  const inst = t.installment ? `${t.installment.number}/${t.installment.total}` : '';
  return `${t.date}|${Number(t.amount).toFixed(2)}|${normalize(t.description)}|${inst}`;
}

function assignHashes(txns) {
  const seen = new Map();
  for (const t of txns) {
    const base = baseKey(t);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    t.hash = crypto.createHash('sha256').update(`${base}#${n}`).digest('hex');
  }
  return txns;
}

module.exports = { assignHashes, baseKey };
