'use strict';
// הגדרת שדות כניסה לכל בנק/חברת אשראי, לפי הספרייה. טעינה עצלה כי הספרייה כבדה.
const LABELS = {
  userCode: 'קוד משתמש', username: 'שם משתמש', password: 'סיסמה', id: 'תעודת זהות', num: 'מספר זהות נוסף / קוד',
  card6Digits: '6 ספרות אחרונות של הכרטיס', nationalID: 'תעודת זהות', email: 'אימייל', phoneNumber: 'טלפון (עם קידומת, לקוד SMS)',
  otpLongTermToken: 'טוקן SMS ארוך טווח',
};
const HEBREW_NAMES = {
  hapoalim: 'בנק הפועלים', leumi: 'בנק לאומי', discount: 'בנק דיסקונט', mizrahi: 'מזרחי טפחות', mercantile: 'מרכנתיל',
  otsarHahayal: 'אוצר החייל', beinleumi: 'הבינלאומי', massad: 'מסד', union: 'איגוד', yahav: 'בנק יהב', pagi: 'פאגי',
  max: 'מקס', visaCal: 'ויזה כאל', isracard: 'ישראכרט', amex: 'אמריקן אקספרס', oneZero: 'וואן זירו (דורש SMS)',
  behatsdaa: 'בהצדעה', beyahadBishvilha: 'ביחד בשבילך',
};
const SECRET_FIELDS = new Set(['clientId', 'clientSecret', 'userId', 'password', 'otpLongTermToken', 'card6Digits', 'id', 'nationalID', 'userCode', 'num', 'username']);

// מקור נתונים דרך Open Banking (Financy): בלי סיסמאות בנק, רק מפתח API שנוצר באפליקציה שלהם
const FINANCY = {
  id: 'financy', name: 'פיננסי (Open Banking) - מומלץ', needsSms: false,
  fields: [
    { key: 'clientId', label: 'clientId (מ-Financy ← הגדרות ← API)', secret: false },
    { key: 'clientSecret', label: 'clientSecret', secret: true },
    { key: 'userId', label: 'userId', secret: false },
  ],
};

function listCompanies() {
  const { SCRAPERS } = require('israeli-bank-scrapers');
  return [FINANCY, ...Object.entries(SCRAPERS).map(([id, def]) => ({
    id,
    name: HEBREW_NAMES[id] || def.name,
    needsSms: id === 'oneZero',
    fields: def.loginFields
      .filter((f) => f !== 'otpCodeRetriever')
      .map((f) => ({ key: f, label: LABELS[f] || f, secret: f === 'password' || f === 'otpLongTermToken' })),
  }))];
}

function getCompany(id) { return listCompanies().find((c) => c.id === id) || null; }

module.exports = { listCompanies, getCompany, SECRET_FIELDS };
