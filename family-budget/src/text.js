'use strict';
// נרמול טקסט לשם בית עסק: ללא סימני כיווניות, גרשיים וסימנים, באותיות קטנות.
function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[‎‏‪-‮⁦-⁩֑-ׇ]/g, '')
    .replace(/["'״׳`]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// מפתח בית עסק מוצע לחוק: עד 2 מילים ראשונות ללא מילים עם ספרות (מספרי סניף וכד')
function merchantKey(desc) {
  const toks = normalize(desc).split(' ').filter((t) => t && !/\d/.test(t));
  return toks.slice(0, 2).join(' ');
}

module.exports = { normalize, merchantKey };
