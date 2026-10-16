'use strict';
// "חשבונות ויתרות": יתרות עו"ש, חיוב הבא בכל כרטיס, משכנתאות, הלוואות וניירות ערך, לפי נתוני החשבונות של Financy.
// הנתונים נשמרים בטבלה fin_accounts בכל משיכה, והעמוד קורא אותם משם (בלי בקשה לחוץ).
const num = (x) => { const n = Number(String(x ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };

// היתרה העדכנית ביותר לפי תאריך (ובשוויון, זו שמופיעה ראשונה)
function pick(balances, types, { withCredit } = {}) {
  const list = (balances || []).filter((b) => types.includes(b.balanceType) && (withCredit === undefined || !!b.creditLimitIncluded === withCredit));
  list.sort((a, b) => String(b.referenceDate || '').localeCompare(String(a.referenceDate || '')));
  return list[0] ? { amount: num(list[0].balanceAmount && list[0].balanceAmount.amount), date: String(list[0].referenceDate || '').slice(0, 10) } : null;
}
const last4 = (s) => String(s || '').replace(/\D/g, '').slice(-4);
const PROVIDERS = { isracard: 'ישראכרט', max: 'מקס', cal: 'כאל', visacal: 'כאל', leumi: 'לאומי', hapoalim: 'הפועלים', discount: 'דיסקונט', mizrahi: 'מזרחי', diners: 'דיינרס', amex: 'אמריקן אקספרס' };

// ממיר חשבון של Financy למבנה קטן ויציב. מחזיר null לסוגים שלא מציגים.
function normalizeAccount(a) {
  if (!a || !a.id) return null;
  const provider = PROVIDERS[String(a.providerId || '').toLowerCase()] || a.providerId || '';
  const base = { key: a.id, provider, name: String(a.accountName || ''), product: a.product || '', last4: last4(a.accountNumber || a.accountName) };
  switch (a.accountType) {
    case 'CHECKING': {
      const cur = pick(a.balances, ['closingBooked', 'expected'], { withCredit: false });
      const limit = a.creditLimit && num(a.creditLimit.amount);
      return { ...base, kind: 'checking', balance: cur ? cur.amount : 0, asOf: cur ? cur.date : null, creditLimit: limit || 0 };
    }
    case 'CARD': {
      const due = pick(a.balances, ['interimBooked']);
      const closed = pick(a.balances, ['closingBooked']);
      const avail = pick(a.balances, ['interimAvailable']);
      const dayMatch = /(\d{1,2})/.exec(String(a.details || ''));
      return { ...base, kind: 'card', status: a.status || '', nextCharge: due ? due.amount : 0, asOf: due ? due.date : null, lastCharge: closed ? closed.amount : 0, lastChargeDate: closed ? closed.date : null,
        available: avail ? avail.amount : null, creditLimit: a.creditLimit ? num(a.creditLimit.amount) : 0, chargeDay: dayMatch ? Number(dayMatch[1]) : null };
    }
    case 'LOAN': {
      if (a.loanType === 'CREDIT_LIMIT') return null; // מסגרות עו"ש: לא חוב רגיל
      const cur = pick(a.balances, ['closingBooked', 'expected']);
      const first = (a.balances || []).slice().sort((x, y) => String(x.referenceDate).localeCompare(String(y.referenceDate)))[0];
      const rate = a.interest && a.interest[0] && a.interest[0].rate && a.interest[0].rate[0] ? num(a.interest[0].rate[0].percentage) : null;
      return { ...base, kind: 'loan', loanType: a.loanType || '', balance: cur ? Math.abs(cur.amount) : 0, asOf: cur ? cur.date : null, rate,
        endDate: a.relatedDates && a.relatedDates.contractEndDate || null, startDate: a.relatedDates && a.relatedDates.contractStartDate || null, original: first ? Math.abs(num(first.balanceAmount && first.balanceAmount.amount)) : null };
    }
    case 'SECURITIES':
      return { ...base, kind: 'securities', positions: (a.securityPositions || []).map((p) => ({ name: p.financialInstrument && p.financialInstrument.name || '', units: num(p.unitsNumber), avgPrice: p.averageBuyingPrice ? num(p.averageBuyingPrice.amount) : null })).filter((p) => p.name) };
    default: return null;
  }
}

const normalizeAccounts = (items) => (items || []).map(normalizeAccount).filter(Boolean);

function saveFinAccounts(db, accountId, list) {
  if (!Array.isArray(list) || !list.length) return;
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM fin_accounts WHERE account_id=?').run(accountId);
    const ins = db.prepare('INSERT OR REPLACE INTO fin_accounts (key, account_id, kind, data, updated_at) VALUES (?,?,?,?,?)');
    for (const a of list) ins.run(`${accountId}:${a.key}`, accountId, a.kind, JSON.stringify(a), now);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// התשלום החודשי על משכנתאות והלוואות: סכום הקטגוריה "שכר דירה ומשכנתא" בחודש המלא האחרון
function monthlyDebtPayments(db, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const r = db.prepare("SELECT -SUM(t.amount) s FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.ignored=0 AND c.name='שכר דירה ומשכנתא' AND t.amount<0 AND substr(t.date,1,7)=?").get(m);
  return { month: m, amount: r && r.s ? Math.round(r.s) : 0 };
}

function buildOverview(db, now = new Date()) {
  const rows = db.prepare('SELECT data, updated_at FROM fin_accounts').all();
  const all = rows.map((r) => JSON.parse(r.data));
  const updatedAt = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '');
  const checking = all.filter((a) => a.kind === 'checking');
  const cards = all.filter((a) => a.kind === 'card' && a.status !== 'blocked');
  const blocked = all.filter((a) => a.kind === 'card' && a.status === 'blocked').length;
  const loans = all.filter((a) => a.kind === 'loan');
  // משכנתא "ראשית" מסכמת את המסלולים שלה: סופרים רק אותה (ואת הלוואות האשראי הרגילות), והמסלולים משמשים לפירוט
  const parents = loans.filter((l) => l.loanType === 'MORTGAGE' && l.product === 'משכנתא');
  const tracks = loans.filter((l) => l.loanType === 'MORTGAGE' && l.product !== 'משכנתא');
  const mortgages = parents.map((p) => ({ ...p, tracks: tracks.filter((t) => t.name.startsWith(`${p.name}-`) && t.balance > 0).sort((a, b) => b.balance - a.balance) }));
  const looseTracks = tracks.filter((t) => !parents.some((p) => t.name.startsWith(`${p.name}-`)) && t.balance > 0); // מסלולים בלי חשבון ראשי
  const retail = loans.filter((l) => l.loanType !== 'MORTGAGE').filter((l) => l.balance > 0).sort((a, b) => b.balance - a.balance);
  const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
  const cash = sum(checking, (a) => a.balance);
  const cardsDue = sum(cards, (a) => a.nextCharge);
  const mortgageDebt = sum(mortgages, (m) => m.balance) + sum(looseTracks, (t) => t.balance);
  const retailDebt = sum(retail, (l) => l.balance);
  return {
    updatedAt, hasData: all.length > 0,
    checking, cards, blockedCards: blocked,
    mortgages, looseTracks, retail, securities: all.filter((a) => a.kind === 'securities'),
    totals: { cash, cardsDue, afterCards: cash - cardsDue, mortgageDebt, retailDebt, debt: mortgageDebt + retailDebt },
    debtPayments: monthlyDebtPayments(db, now),
  };
}

module.exports = { normalizeAccount, normalizeAccounts, saveFinAccounts, buildOverview, monthlyDebtPayments };
