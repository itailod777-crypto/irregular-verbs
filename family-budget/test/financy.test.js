'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchFinancy, mapItem } = require('../src/financy');

const tx = (o) => ({ id: 'x', providerId: 'max', type: 'NORMAL', merchantName: 'Shufersal', amount: { chargedAmount: { amount: -239.9, currency: 'ILS' } }, description: { description: 'SHUFERSAL DEAL', additionalInfo: '' }, date: { transactionDate: '2026-10-04' }, ...o });

test('מיפוי תנועת Financy: סכום, תאריך, תיאור, תשלומים', () => {
  assert.deepEqual(mapItem(tx({ installments: { number: 2, total: 6 } })), { date: '2026-10-04', amount: -239.9, description: 'Shufersal', memo: null, installment: { number: 2, total: 6 } });
});
test('מדלג על כפילויות, ועל חיוב כרטיס אשראי בעו"ש (כדי לא לספור פעמיים)', () => {
  assert.equal(mapItem(tx({ isDuplicate: true })), null);
  assert.equal(mapItem(tx({ providerId: 'hapoalim', type: 'NORMAL', merchantName: 'ישראכרט', description: { description: 'ישראכרט' } })), null);
  assert.ok(mapItem(tx({ providerId: 'hapoalim', merchantName: 'משכורת', amount: { chargedAmount: { amount: 12000, currency: 'ILS' } } })), 'הכנסה נשמרת');
});
test('משיכה: טוקן, עימוד ושגיאות', async () => {
  const calls = [];
  const fetchImpl = async (url, opt) => {
    calls.push(url);
    if (url.endsWith('/oauth/token')) return { ok: true, status: 200, json: async () => ({ accessToken: 'T' }) };
    assert.equal(opt.headers.Authorization, 'Bearer T');
    const first = !/nextPage/.test(url);
    return { ok: true, status: 200, json: async () => (first ? { nextPage: 'C1', items: [tx({})] } : { nextPage: null, items: [tx({ merchantName: 'Wolt' })] }) };
  };
  const r = await fetchFinancy({ clientId: 'a', clientSecret: 'b', userId: 'c' }, new Date('2026-09-01'), { fetchImpl });
  assert.equal(r.rows.length, 2);
  assert.ok(calls.some((c) => c.includes('dateFrom=2026-09-01')));
  await assert.rejects(fetchFinancy({}, new Date(), { fetchImpl: async () => ({ ok: false, status: 401 }) }), (e) => e.errorType === 'INVALID_PASSWORD');
  const planFetch = async (url) => (url.endsWith('/oauth/token') ? { ok: true, status: 200, json: async () => ({ accessToken: 'T' }) } : { ok: false, status: 403 });
  await assert.rejects(fetchFinancy({}, new Date(), { fetchImpl: planFetch }), (e) => e.errorType === 'PLAN');
});

test('סנכרון דרך Financy שומר תנועות, בלי דפדפן, ובכשל תוכנית מציג שגיאה ברורה', async (t) => {
  const { runSync } = require('../src/sync');
  const { startApp } = require('./helpers');
  const ctx = await startApp(); t.after(ctx.close);
  await ctx.call('POST', '/api/vault/init', { password: 'סיסמת-על-ארוכה-123' });
  const acc = await ctx.call('POST', '/api/accounts', { label: 'פיננסי', company: 'financy', credentials: { clientId: 'a', clientSecret: 'b', userId: 'c' } });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  const rows = [{ date: '2026-10-04', amount: -239.9, description: 'שופרסל', memo: null, installment: null }, { date: '2026-10-01', amount: 12000, description: 'משכורת', memo: null, installment: null }];
  const r = await runSync({ db: ctx.db, vault: ctx.vault, opts: { fetchFinancy: async () => ({ rows }) } });
  assert.equal(r[0].status, 'ok'); assert.equal(r[0].added, 2);
  const again = await runSync({ db: ctx.db, vault: ctx.vault, opts: { fetchFinancy: async () => ({ rows }) } });
  assert.equal(again[0].added, 0, 'כפילויות לא נוספות');
  const { FinancyError } = require('../src/financy');
  const bad = await runSync({ db: ctx.db, vault: ctx.vault, accountId: 1, opts: { fetchFinancy: async () => { throw new FinancyError('התוכנית ב-Financy לא כוללת API', 'PLAN'); } } });
  assert.equal(bad[0].status, 'error'); assert.equal(bad[0].errorType, 'PLAN');
});

test('טוקן שפג באמצע משיכה: מונפק חדש ומנסים שוב פעם אחת', async () => {
  let tokens = 0, first = true;
  const fetchImpl = async (url) => {
    if (url.endsWith('/oauth/token')) return { ok: true, status: 200, json: async () => ({ accessToken: 'T' + (++tokens) }) };
    if (url.includes('/v2/providers')) return { ok: true, status: 200, json: async () => [{ providerFriendlyId: 'isracard', type: 'CARD' }] };
    if (first) { first = false; return { ok: false, status: 401 }; }
    return { ok: true, status: 200, json: async () => ({ items: [tx({})] }) };
  };
  const r = await fetchFinancy({ clientId: 'a', clientSecret: 'b', userId: 'c' }, new Date('2026-09-01'), { fetchImpl });
  assert.equal(r.rows.length, 1); assert.equal(tokens, 2);
});
test('ספק כרטיס לפי רשימת הספקים של Financy: תנועת הכרטיס נשמרת גם כשהשם מזכיר חברת אשראי', () => {
  const cards = new Set(['newcard']);
  const d = { description: 'ישראכרט - רכישה' };
  assert.ok(mapItem(tx({ providerId: 'newcard', merchantName: 'ישראכרט חנות', description: d }), cards));
  assert.equal(mapItem(tx({ providerId: 'hapoalim', merchantName: 'ישראכרט', description: d }), cards), null);
});

test('חיוב כרטיס בעו"ש בשם מקוצר ("מקס איט פיננ-י") מדולג, אבל "המקסיקני" ו"מקס סטוק" נשמרים', () => {
  const bank = { providerId: 'leumi', type: 'NORMAL' };
  assert.equal(mapItem(tx({ ...bank, merchantName: 'מקס איט פיננ-י', description: { description: 'מקס איט פיננ-י' } })), null);
  assert.ok(mapItem(tx({ ...bank, merchantName: 'המקסיקני פתח תקווה', description: { description: 'המקסיקני פתח תקווה' } })));
  assert.ok(mapItem(tx({ ...bank, merchantName: 'מקס סטוק פ"ת - 2', description: { description: 'מקס סטוק פ"ת - 2' } })));
});
