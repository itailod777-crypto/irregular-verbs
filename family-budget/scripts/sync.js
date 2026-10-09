'use strict';
// משיכה מכל החשבונות מהטרמינל / מתזמון יומי: npm run sync
// סיסמת-על נלקחת מ-BUDGET_KEY_FILE, data/master.key או BUDGET_MASTER_PASSWORD; אחרת תישאל (רק בטרמינל אינטראקטיבי).
const { DB_FILE, VAULT_FILE } = require('../src/config');
const { openDb } = require('../src/db');
const { Vault } = require('../src/crypto');
const { findMasterPassword } = require('../src/masterpw');
const { askHidden } = require('../src/prompt');
const { runSync } = require('../src/sync');

(async () => {
  const db = openDb(DB_FILE);
  const vault = new Vault(VAULT_FILE);
  if (!vault.exists()) { console.log('אין כספת עדיין, אין מה למשוך. הרץ: npm run set-credentials'); process.exit(0); }
  if (!db.prepare('SELECT COUNT(*) c FROM accounts').get().c) { console.log('לא הוגדרו חשבונות. הרץ: npm run set-credentials'); process.exit(0); }
  let pw = findMasterPassword();
  if (!pw) {
    if (!process.stdin.isTTY) { console.error('אין סיסמת-על זמינה להרצה אוטומטית. ראה README (קובץ מפתח).'); process.exit(2); }
    pw = await askHidden('סיסמת-על: ');
  }
  vault.unlock(pw);
  const results = await runSync({ db, vault });
  let bad = 0;
  for (const r of results) {
    if (r.status === 'ok') console.log(`✔ ${r.label}: נוספו ${r.added}, כפולות ${r.duplicates}${r.pendingSkipped ? `, ממתינות שדולגו ${r.pendingSkipped}` : ''}`);
    else { bad++; console.error(`✘ ${r.label}: ${r.error}`); }
  }
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('שגיאה:', e.message); process.exit(1); });
