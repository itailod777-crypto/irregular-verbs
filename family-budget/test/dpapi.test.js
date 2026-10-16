'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers'); // קובע BUDGET_DATA_DIR זמני לפני טעינת ההגדרות
const dp = require('../src/dpapi');

test('זכור במחשב הזה: סיסמת-העל נשמרת מוצפנת (DPAPI) ונטענת בחזרה', { skip: !dp.supported() }, () => {
  const secret = 'בדיקה-א1_ב2';
  dp.save(secret);
  try {
    assert.ok(dp.exists());
    assert.equal(require('node:fs').readFileSync(require('node:path').join(process.env.BUDGET_DATA_DIR, 'master.dpapi'), 'utf8').includes(secret), false, 'לא נשמר בטקסט גלוי');
    assert.equal(dp.load(), secret);
  } finally { dp.forget(); }
  assert.equal(dp.exists(), false);
});
