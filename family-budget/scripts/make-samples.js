'use strict';
// יוצר קבצי דוגמה מזויפים ליבוא בתיקיית data-samples (CSV בשתי תבניות + XLSX).
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { generateDemo } = require('../src/demo-data');

const out = path.join(__dirname, '..', 'data-samples');
fs.mkdirSync(out, { recursive: true });
const { bank, card } = generateDemo('2026-09', 2);
const fmt = (iso) => iso.split('-').reverse().join('/');
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;

// 1) כרטיס אשראי: הוצאות חיוביות, שורות פתיחה לפני הכותרות, סכום עסקה וסכום חיוב
let csv = '﻿פירוט עסקאות לכרטיס דוגמה\n"תאריך הפקה: 01/10/2026"\n\n' + 'תאריך עסקה,שם בית עסק,סכום עסקה,סכום חיוב,הערות\n';
for (const t of card) csv += `${fmt(t.date)},${q(t.description)},${q((-t.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }))},${q((-t.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }))},\n`;
fs.writeFileSync(path.join(out, 'card-sample.csv'), csv);

// 2) בנק: עמודות חובה / זכות, מפריד נקודה-פסיק
let bcsv = '﻿תאריך;תיאור;חובה;זכות;יתרה\n';
for (const t of bank) bcsv += `${fmt(t.date)};${t.description};${t.amount < 0 ? -t.amount : ''};${t.amount > 0 ? t.amount : ''};\n`;
fs.writeFileSync(path.join(out, 'bank-sample.csv'), bcsv);

// 3) XLSX
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('עסקאות');
  ws.addRow(['תאריך', 'שם בית העסק', 'סכום']);
  for (const t of card.slice(0, 60)) ws.addRow([new Date(t.date + 'T00:00:00Z'), t.description, -t.amount]);
  await wb.xlsx.writeFile(path.join(out, 'card-sample.xlsx'));
  console.log('נוצרו קבצי דוגמה ב-', out);
})();
