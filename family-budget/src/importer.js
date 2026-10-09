'use strict';
// יבוא CSV / XLSX עם זיהוי עמודות אוטומטי בעברית.
const ExcelJS = require('exceljs');

const SYN = {
  date: ['תאריך עסקה', 'תאריך העסקה', 'תאריך רכישה', 'תאריך', 'date', 'transaction date'],
  charge: ['סכום חיוב', 'סכום החיוב', 'סכום בשח', 'חיוב בשח', 'סכום בש"ח', 'amount'],
  amount: ['סכום עסקה', 'סכום העסקה', 'סכום מקורי', 'סכום', 'תנועה'],
  debit: ['חובה', 'חיוב', 'משיכה', 'debit'],
  credit: ['זכות', 'זיכוי', 'הפקדה', 'credit'],
  description: ['שם בית עסק', 'שם בית העסק', 'שם העסק', 'בית עסק', 'תיאור', 'תאור', 'תיאור התנועה', 'פרטים', 'תאור העסקה', 'description', 'merchant'],
  memo: ['הערות', 'פירוט נוסף', 'הערה', 'אסמכתא', 'memo'],
};
const clean = (s) => String(s ?? '').replace(/[‎‏‪-‮"'״׳]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const SYN_CLEAN = Object.fromEntries(Object.entries(SYN).map(([k, v]) => [k, v.map(clean)]));

function decodeBuffer(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder('utf-8').decode(buf.subarray(3));
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1255').decode(buf); // קבצי CSV ישנים של חברות אשראי
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch]++;
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = [];
    } else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

async function parseXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets.find((w) => w.rowCount > 0);
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      let v = r.getCell(c).value;
      if (v && typeof v === 'object' && !(v instanceof Date)) v = v.result ?? v.text ?? (v.richText ? v.richText.map((x) => x.text).join('') : '');
      vals.push(v ?? '');
    }
    rows.push(vals);
  });
  return rows;
}

function detectColumns(rows) {
  let best = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].map(clean);
    const map = {};
    for (const key of Object.keys(SYN_CLEAN)) {
      // התאמה מדויקת קודם, אחר כך התאמה חלקית; הסדר ברשימה = עדיפות
      for (const syn of SYN_CLEAN[key]) {
        let idx = cells.indexOf(syn);
        if (idx < 0) idx = cells.findIndex((c) => c && c.length > 2 && c.includes(syn));
        if (idx >= 0 && !Object.values(map).includes(idx)) { map[key] = idx; break; }
      }
    }
    const score = Object.keys(map).length;
    if (map.date !== undefined && (map.description !== undefined) && (map.charge !== undefined || map.amount !== undefined || map.debit !== undefined || map.credit !== undefined)) {
      if (!best || score > best.score) best = { headerRow: i, map, score };
      break;
    }
  }
  return best;
}

function pad(n) { return String(n).padStart(2, '0'); }
function toIsoDate(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number' && v > 30000 && v < 80000) { // מספר סידורי של אקסל
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  return null;
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[‎‏‪-‮₪\s]|ש"ח|שח|nis/gi, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  s = s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return neg ? -n : n;
}

// sign: 'auto' | 'expenses-positive' | 'expenses-negative'
async function parseFile(buffer, filename, { sign = 'auto' } = {}) {
  const isXlsx = /\.xlsx$/i.test(filename) || (buffer[0] === 0x50 && buffer[1] === 0x4b);
  if (/\.xls$/i.test(filename) && !isXlsx) {
    const head = buffer.subarray(0, 512).toString('latin1').toLowerCase();
    if (!head.includes('<html') && !head.includes('<table')) throw new Error('קובץ xls ישן אינו נתמך. פתח באקסל ושמור כ-xlsx או CSV.');
    throw new Error('קובץ xls מסוג HTML אינו נתמך. פתח באקסל ושמור כ-xlsx או CSV.');
  }
  const rows = isXlsx ? await parseXlsx(buffer) : parseCsv(decodeBuffer(buffer));
  const det = detectColumns(rows);
  if (!det) throw new Error('לא זוהו עמודות תאריך / תיאור / סכום. ודא שיש שורת כותרות בעברית (למשל: תאריך עסקה, שם בית עסק, סכום חיוב).');
  const { map } = det;
  const amountCol = map.charge ?? map.amount;
  const parsed = [];
  let invalid = 0;
  for (const r of rows.slice(det.headerRow + 1)) {
    const date = toIsoDate(r[map.date]);
    const description = String(r[map.description] ?? '').trim();
    let amount = null;
    if (map.debit !== undefined || map.credit !== undefined) {
      const d = map.debit !== undefined ? toNumber(r[map.debit]) : null;
      const c = map.credit !== undefined ? toNumber(r[map.credit]) : null;
      if (d || c) amount = (c || 0) - (d || 0);
      else if (amountCol !== undefined) amount = toNumber(r[amountCol]);
    } else amount = toNumber(r[amountCol]);
    if (!date || !description || amount === null || amount === 0) { if (r.some((x) => String(x ?? '').trim())) invalid++; continue; }
    parsed.push({ date, description, amount, memo: map.memo !== undefined ? String(r[map.memo] ?? '').trim() || null : null, _dc: map.debit !== undefined || map.credit !== undefined });
  }
  const dualCol = parsed.length && parsed[0]._dc;
  let mode = sign;
  if (mode === 'auto') {
    if (dualCol) mode = 'expenses-negative';
    else { const neg = parsed.filter((p) => p.amount < 0).length; mode = parsed.length && neg / parsed.length > 0.5 ? 'expenses-negative' : 'expenses-positive'; }
  }
  for (const p of parsed) { if (mode === 'expenses-positive') p.amount = -p.amount; delete p._dc; }
  const headerNames = rows[det.headerRow].map((c) => String(c ?? '').trim());
  return {
    rows: parsed, invalid, signMode: mode,
    columns: Object.fromEntries(Object.entries(map).map(([k, i]) => [k, headerNames[i]])),
  };
}

module.exports = { parseFile, parseCsv, toIsoDate, toNumber, detectColumns };
