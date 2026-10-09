'use strict';
// נתוני דוגמה מזויפים לגמרי (בתי עסק ישראליים כלליים, סכומים אקראיים). אין כאן מידע אמיתי.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const pad = (n) => String(n).padStart(2, '0');

const MERCHANTS = [
  ['שופרסל דיל רעננה', -60, -480, 9], ['רמי לוי שיווק השקמה', -80, -520, 6], ['יוחננוף סניף 14', -40, -300, 4],
  ['פז תחנת דלק 212', -150, -330, 4], ['סונול דרום', -120, -300, 2], ['ארומה אספרסו בר', -18, -65, 6],
  ['וולט מסעדות', -55, -190, 4], ['מקדונלדס קניון', -45, -150, 2], ['סופר-פארם סניף 33', -25, -210, 3],
  ['מכבי שירותי בריאות', -30, -250, 1], ['רב קו טעינה', -50, -150, 2], ['נטפליקס', -49.9, -49.9, 1],
  ['ספוטיפיי', -19.9, -19.9, 1], ['איקאה נתניה', -90, -900, 1], ['קסטרו אופנה', -80, -400, 1],
  ['סינמה סיטי', -60, -180, 1], ['גן ילדים פרטי', -1200, -1200, 1], ['חוג כדורגל', -280, -280, 1],
  ['אמזון', -35, -420, 2],
];
const FIXED = [
  { d: 1, desc: 'שכר דירה', amt: -5200, acct: 'bank' }, { d: 5, desc: 'חברת החשמל', amt: -420, jitter: 160, acct: 'bank' },
  { d: 8, desc: 'עיריית רעננה ארנונה', amt: -690, acct: 'bank' }, { d: 10, desc: 'פרטנר תקשורת', amt: -129, acct: 'card' },
  { d: 12, desc: 'הראל ביטוח רכב', amt: -310, acct: 'bank' }, { d: 15, desc: 'הוט אינטרנט', amt: -149, acct: 'card' },
  { d: 3, desc: 'משכורת חברת דוגמה', amt: 14500, acct: 'bank' }, { d: 4, desc: 'משכורת בן/בת זוג', amt: 9800, acct: 'bank' },
  { d: 20, desc: 'ביטוח לאומי קצבת ילדים', amt: 300, acct: 'bank' },
];

// מחזיר { bank: [...], card: [...] } עבור 6 החודשים שמסתיימים ב-endMonth ('YYYY-MM')
function generateDemo(endMonth, months = 6, seed = 42) {
  const rand = rng(seed);
  const [ey, em] = endMonth.split('-').map(Number);
  const bank = [], card = [];
  for (let i = months - 1; i >= 0; i--) {
    const d0 = new Date(Date.UTC(ey, em - 1 - i, 1));
    const y = d0.getUTCFullYear(), m = d0.getUTCMonth() + 1;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const date = (day) => `${y}-${pad(m)}-${pad(Math.min(day, dim))}`;
    for (const f of FIXED) (f.acct === 'bank' ? bank : card).push({ date: date(f.d), description: f.desc, amount: Math.round((f.amt - (f.jitter ? rand() * f.jitter : 0)) * 100) / 100 });
    for (const [desc, lo, hi, perMonth] of MERCHANTS) {
      const n = Math.max(1, Math.round(perMonth * (0.6 + rand() * 0.8)));
      for (let k = 0; k < n; k++) {
        const amt = lo === hi ? lo : Math.round((lo + rand() * (hi - lo)) * 100) / 100;
        card.push({ date: date(1 + Math.floor(rand() * 28)), description: desc, amount: amt });
      }
    }
    card.push({ date: date(10), description: 'משיכת מזומן כספומט', amount: -400 });
    bank.push({ date: date(2), description: 'ישראכרט חיוב חודשי', amount: -(Math.round(rand() * 2000 + 4000)) });
  }
  const key = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return { bank: bank.sort(key), card: card.sort(key) };
}

module.exports = { generateDemo };
