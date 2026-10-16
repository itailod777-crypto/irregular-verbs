'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');
const { normalizeAccounts, saveFinAccounts, buildOverview } = require('../src/overview');

const bal = (type, amount, date, credit = false) => ({ balanceType: type, balanceAmount: { currency: 'ILS', amount: String(amount) }, referenceDate: date, creditLimitIncluded: credit });
const ITEMS = [
  { id: 'c1', providerId: 'leumi', accountType: 'CHECKING', product: 'חשבון שקלי', accountName: '803-228179/57', balances: [bal('closingBooked', '1000.50', '2026-10-15'), bal('closingBooked', '51000.50', '2026-10-15', true)], creditLimit: { amount: 50000 } },
  { id: 'k1', providerId: 'isracard', accountType: 'CARD', product: 'גולד', accountNumber: '************0357', status: 'enabled', details: 'מועד חיוב: 02', creditLimit: { amount: 40000 }, balances: [bal('closingBooked', '24505', '2026-10-02'), bal('interimBooked', '12379.85', '2026-10-16'), bal('interimAvailable', '28504.87', '2026-10-16')] },
  { id: 'k2', providerId: 'max', accountType: 'CARD', product: 'חיוב נדחה', accountNumber: '************9216', status: 'blocked', balances: [bal('interimBooked', '0', '2026-10-16')] },
  // משכנתא ראשית + שני מסלולים שמסתכמים בה: צריך לספור פעם אחת
  { id: 'm0', providerId: 'leumi', accountType: 'LOAN', loanType: 'MORTGAGE', product: 'משכנתא', accountName: '10-3140943-01-69', balances: [bal('closingBooked', '300000', '2026-10-15')] },
  { id: 'm1', providerId: 'leumi', accountType: 'LOAN', loanType: 'MORTGAGE', product: 'משכנתא מסלולים', accountName: '10-3140943-01-69-01', balances: [bal('closingBooked', '100000', '2026-10-15')], interest: [{ rate: [{ percentage: '5' }] }], relatedDates: { contractEndDate: '2056-09-01' } },
  { id: 'm2', providerId: 'leumi', accountType: 'LOAN', loanType: 'MORTGAGE', product: 'משכנתא מסלולים', accountName: '10-3140943-01-69-02', balances: [bal('closingBooked', '200000', '2026-10-15')] },
  { id: 'l1', providerId: 'leumi', accountType: 'LOAN', loanType: 'RETAIL_LOAN', product: 'הלוואה', accountName: 'x', balances: [bal('closingBooked', '60000', '2024-11-19'), bal('expected', '51069.41', '2026-10-16')] },
  { id: 'o1', providerId: 'leumi', accountType: 'LOAN', loanType: 'CREDIT_LIMIT', product: 'מסגרת עו״ש', balances: [bal('expected', '0', '2026-10-16')] },
  { id: 's1', providerId: 'leumi', accountType: 'SECURITIES', accountName: 'sec', securityPositions: [{ unitsNumber: 10, averageBuyingPrice: { amount: '2.5' }, financialInstrument: { name: 'קרן' } }] },
];

test('יתרות: עו"ש, חיוב הבא בכרטיס, ומשכנתא נספרת פעם אחת (בלי כפילות עם המסלולים)', async (t) => {
  const ctx = await startApp(); t.after(ctx.close);
  const list = normalizeAccounts(ITEMS);
  assert.equal(list.find((a) => a.kind === 'checking').balance, 1000.5, 'היתרה בלי מסגרת האשראי');
  const card = list.find((a) => a.key === 'k1');
  assert.equal(card.nextCharge, 12379.85); assert.equal(card.chargeDay, 2); assert.equal(card.available, 28504.87);
  assert.ok(!list.some((a) => a.key === 'o1'), 'מסגרת עו"ש אינה חוב');
  ctx.db.prepare("INSERT INTO accounts (label, company) VALUES ('Financy','financy')").run();
  saveFinAccounts(ctx.db, 1, list);
  const ov = buildOverview(ctx.db);
  assert.equal(ov.totals.cash, 1000.5);
  assert.equal(ov.totals.cardsDue, 12379.85, 'כרטיס חסום לא נכלל');
  assert.equal(ov.blockedCards, 1);
  assert.equal(ov.totals.mortgageDebt, 300000, 'ראשית בלבד, בלי לספור גם את המסלולים');
  assert.equal(ov.mortgages[0].tracks.length, 2);
  assert.equal(ov.totals.retailDebt, 51069.41, 'היתרה העדכנית ולא הסכום המקורי');
  assert.equal(ov.securities[0].positions[0].name, 'קרן');
});
