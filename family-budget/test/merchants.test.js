'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { identify, searchUrl } = require('../src/merchants');

test('מי זה: מזהה מנויים וחברות נפוצים לפי שם בית העסק, עם קישור לביטול', () => {
  assert.equal(identify('NETFLIX.COM').name, 'Netflix');
  assert.ok(identify('NETFLIX.COM').cancel.startsWith('https://www.netflix.com'));
  assert.equal(identify('APPLE.COM/BILL').name, 'Apple');
  assert.equal(identify('GOOGLE *YouTubePremium').name, 'YouTube Premium');
  assert.equal(identify('מגדל ר. חובה').name, 'מגדל');
  assert.equal(identify('דמי כרטיס').name, 'עמלה בנקאית');
});

test('מי זה: אין זיהוי שגוי של שמות דומים (גבולות מילה בעברית ובאנגלית)', () => {
  for (const d of ['קפה הלוי - קשב', 'המקסיקני פתח תקווה', 'kitten shop', 'מפזר ביתי', 'hotel eilat', 'אל באשא מסעדה', '']) assert.equal(identify(d), null, d);
});

test('מי זה: לשם שלא זוהה יש קישור לחיפוש, ושם בית העסק בלבד נשלח בו', () => {
  const u = new URL(searchUrl('אל באשא מסעדה'));
  assert.equal(u.hostname, 'www.google.com');
  assert.ok(decodeURIComponent(u.searchParams.get('q')).startsWith('אל באשא מסעדה'));
});
