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

// ממפה תנועה של Financy לשורה של האפליקציה. מחזיר null כשצריך לדלג.
function mapItem(t, cardProviders) {
  if (!t || t.isDuplicate) return null;
  const date = t.date && (t.date.transactionDate || t.date.bookingDate);
  const amt = t.amount && t.amount.chargedAmount;
  if (!date || !amt || typeof amt.amount !== 'number') return null;
  const desc = String((t.merchantName || (t.description && t.description.description) || t.creditorName || t.debtorName || '')).trim();
  if (!desc) return null;
  // חיוב כרטיס אשראי שנגבה מהעו"ש הוא סיכום של תנועות הכרטיס שכבר נמשכות בנפרד: מדלגים כדי לא לספור פעמיים
  const pid = String(t.providerId || '').toLowerCase();
  const isCardProvider = (cardProviders && cardProviders.has(pid)) || /^(max|isracard|cal|visacal|visa_cal|amex|diners)$/i.test(pid);
  if (!isCardProvider && String(t.type || '') !== 'CARD' && amt.amount < 0 && CARD_ISSUERS.test(desc)) return null;
  return {
    date: String(date).slice(0, 10), amount: amt.amount, description: desc,
    memo: (t.description && t.description.additionalInfo) || null,
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

async function fetchFinancy(creds, startDate, { fetchImpl = globalThis.fetch } = {}) {
  const f = fetchImpl;
  let token = await getToken(creds, f);
  const cardProviders = await getCardProviders(token, f);
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
    for (const it of j.items || []) { const r = mapItem(it, cardProviders); if (r) rows.push(r); else skipped++; }
    cursor = j.nextPage || null;
    if (!cursor || ++pages >= 200) break;
  }
  return { rows, skipped };
}

module.exports = { fetchFinancy, mapItem, FinancyError };
