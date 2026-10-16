'use strict';
// מקור נתונים דרך Financy (Open Banking מפוקח, קריאה בלבד): בנקים וכרטיסי אשראי מחוברים אצלם, והאפליקציה קוראת תנועות ב-REST API.
// אין כאן סיסמאות בנק בכלל: רק מפתח API (clientId/clientSecret/userId) שמופיע ב-Financy ← הגדרות ← API. נדרשת תוכנית Starter ומעלה.
const API = 'https://api.open-finance.ai';
const PAGE = 200;
// בעברית  לא עובד, לכן גבולות מפורשים. חיוב כרטיס בעו"ש מופיע כמו 'מקס איט פיננ-י' או 'ישראכרט בע"מ'
const CARD_ISSUERS = /ישראכרט|מקס[ ]*איט|max(?![a-z])|(?<![א-ת])כאל(?![א-ת])|visa[ ]*cal|ויזה[ ]*כאל|לאומי[ ]*קארד|דיינרס|diners|אמריקן[ ]*אקספרס|amex|isracard|כרטיסי[ ]*אשראי/i;

class FinancyError extends Error {
  constructor(message, errorType) { super(message); this.errorType = errorType || 'GENERIC'; }
}

async function getToken(creds, f) {
  const res = await f(`${API}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: creds.clientId, clientSecret: creds.clientSecret, userId: creds.userId }),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new FinancyError('פרטי ה-API של Financy לא נכונים (בדוק clientId / clientSecret / userId).', 'INVALID_PASSWORD');
  if (!res.ok) throw new FinancyError(`Financy token failed (${res.status})`);
  const j = await res.json();
  if (!j.accessToken) throw new FinancyError('Financy token response without accessToken');
  return j.accessToken;
}

// Financy מחזיר את כל התשלומים של עסקה בתשלומים עם תאריך הרכישה. כדי שכל תשלום ייספר בחודש שבו הוא באמת יורד, מזיזים תשלום מספר n ב-(n-1) חודשים.
function shiftMonths(iso, months) {
  if (!months) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + months, ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// ממפה תנועה של Financy לשורה של האפליקציה. מחזיר null כשצריך לדלג.
function mapItem(t, cardProviders, accountLabels) {
  if (!t || t.isDuplicate) return null;
  const date = t.date && (t.date.transactionDate || t.date.bookingDate || t.date.valueDate);
  const amt = t.amount && t.amount.chargedAmount;
  if (!date || !amt || typeof amt.amount !== 'number') return null;
  const desc = String((t.merchantName || (t.description && t.description.description) || t.creditorName || t.debtorName || '')).trim();
  if (!desc) return null;
  // חיוב כרטיס אשראי שנגבה מהעו"ש הוא סיכום של תנועות הכרטיס שכבר נמשכות בנפרד: מדלגים כדי לא לספור פעמיים
  const pid = String(t.providerId || '').toLowerCase();
  const isCardProvider = (cardProviders && cardProviders.has(pid)) || /^(max|isracard|cal|visacal|visa_cal|amex|diners)$/i.test(pid);
  if (!isCardProvider && String(t.type || '') !== 'CARD' && amt.amount < 0 && CARD_ISSUERS.test(desc)) return null;
  return {
    date: shiftMonths(String(date).slice(0, 10), t.installments && t.installments.total && t.installments.number > 1 ? t.installments.number - 1 : 0), amount: amt.amount, description: desc,
    memo: (t.description && t.description.additionalInfo) || null,
    card: (accountLabels && accountLabels.get(t.accountId)) || null,
    installment: t.installments && t.installments.total ? { number: t.installments.number, total: t.installments.total } : null,
  };
}

// מזהי ספקים מסוג כרטיס אשראי לפי Financy (לא חובה: בכשל נשארים עם הזיהוי לפי שם)
async function getCardProviders(token, f) {
  try {
    const res = await f(`${API}/v2/providers`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const j = await res.json();
    const ids = (Array.isArray(j) ? j : []).filter((p) => p && p.type === 'CARD' && p.providerFriendlyId).map((p) => String(p.providerFriendlyId).toLowerCase());
    return ids.length ? new Set(ids) : null;
  } catch { return null; }
}

const PROVIDER_NAMES = { isracard: 'ישראכרט', max: 'מקס', cal: 'כאל', visacal: 'כאל', leumi: 'לאומי', hapoalim: 'הפועלים', discount: 'דיסקונט', mizrahi: 'מזרחי', diners: 'דיינרס', amex: 'אמריקן אקספרס' };
// שם קריא לכל חשבון או כרטיס ב-Financy, כדי שבדשבורד יוצג איזה כרטיס שילם
async function getAccountLabels(token, f) {
  const map = new Map(); const items = [];
  try {
    let cursor = null, pages = 0;
    do {
      const q = new URLSearchParams({ limit: '100' }); if (cursor) q.set('nextPage', cursor);
      const res = await f(`${API}/v2/data/accounts?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) break;
      const j = await res.json();
      for (const a of j.items || []) {
        if (!a || !a.id) continue;
        items.push(a);
        const last4 = String(a.accountNumber || '').replace(/D/g, '').slice(-4);
        const prov = PROVIDER_NAMES[String(a.providerId || '').toLowerCase()] || a.providerId || '';
        const product = /חיוב נדחה/.test(a.product || '') ? '' : (a.product || ''); // 'חיוב נדחה' הוא סוג החיוב ולא שם הכרטיס
        const kind = product || (a.accountType === 'CARD' ? 'כרטיס' : 'חשבון');
        map.set(a.id, [prov, kind, last4 ? `·${last4}` : ''].filter(Boolean).join(' '));
      }
      cursor = j.nextPage || null;
    } while (cursor && ++pages < 20);
  } catch { /* בלי שמות: נשארים עם שם המקור */ }
  return { map, items };
}

async function fetchFinancy(creds, startDate, { fetchImpl = globalThis.fetch } = {}) {
  const f = fetchImpl;
  let token = await getToken(creds, f);
  const cardProviders = await getCardProviders(token, f);
  const { map: accountLabels, items: accountItems } = await getAccountLabels(token, f);
  let refreshed = false;
  const from = new Date(startDate).toISOString().slice(0, 10);
  const rows = []; let skipped = 0, cursor = null, pages = 0;
  for (;;) {
    const q = new URLSearchParams({ dateFrom: from, limit: String(PAGE), sort: '-1' });
    if (cursor) q.set('nextPage', cursor);
    const res = await f(`${API}/v2/data/transactions?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 && !refreshed) { refreshed = true; token = await getToken(creds, f); continue; } // הטוקן פג: מנפיקים חדש ומנסים שוב
    if (res.status === 403) {
      const body = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {};
      if (body && body.type === 'ACCOUNT_LIMIT_REACHED') throw new FinancyError('חרגת ממכסת החשבונות בתוכנית ב-Financy. הסר חשבון או שדרג.', 'PLAN');
      throw new FinancyError('התוכנית ב-Financy לא כוללת API (נדרשת Starter ומעלה).', 'PLAN');
    }
    if (res.status === 401) throw new FinancyError('ההרשאה ל-Financy נדחתה. בדוק את פרטי ה-API.', 'INVALID_PASSWORD');
    if (res.status === 409) throw new FinancyError('אין ב-Financy בנק או כרטיס מחובר. חבר אותם באתר של Financy.', 'GENERIC');
    if (!res.ok) throw new FinancyError(`Financy transactions failed (${res.status})`);
    const j = await res.json();
    for (const it of j.items || []) { const r = mapItem(it, cardProviders, accountLabels); if (r) rows.push(r); else skipped++; }
    cursor = j.nextPage || null;
    if (!cursor || ++pages >= 200) break;
  }
  return { rows, skipped, accounts: require('./overview').normalizeAccounts(accountItems) };
}

module.exports = { fetchFinancy, mapItem, shiftMonths, FinancyError };
