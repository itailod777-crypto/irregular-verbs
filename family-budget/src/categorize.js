'use strict';
const { normalize } = require('./text');

// rules: שורות מה-DB (pattern, category_id, sign, whole_word, builtin, id) + kind של הקטגוריה.
// סדר עדיפות: חוקי משתמש לפני חוקים מובנים, ואז תבנית ארוכה יותר קודמת.
function compileRules(rows) {
  return rows
    .map((r) => ({ ...r, np: normalize(r.pattern) }))
    .filter((r) => r.np)
    .sort((a, b) => (a.builtin - b.builtin) || (b.np.length - a.np.length) || (a.id - b.id));
}

function matches(rule, normDesc, amount) {
  if (rule.sign === 'positive' && !(amount > 0)) return false;
  if (rule.sign === 'negative' && !(amount < 0)) return false;
  if (rule.kind === 'income' && amount < 0) return false;
  if (rule.whole_word) return (` ${normDesc} `).includes(` ${rule.np} `);
  return normDesc.includes(rule.np);
}

function categorize(description, amount, compiled, fallback) {
  const nd = normalize(description);
  for (const r of compiled) {
    if (matches(r, nd, amount)) return { categoryId: r.category_id, ruleId: r.id };
  }
  return { categoryId: amount > 0 ? fallback.income : fallback.expense, ruleId: null };
}

module.exports = { compileRules, categorize, matches };
