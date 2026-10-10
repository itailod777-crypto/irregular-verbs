'use strict';
const { HOST, PORT, DB_FILE, VAULT_FILE } = require('./src/config');
const { openDb, getSetting, setSetting } = require('./src/db');
const { Vault } = require('./src/crypto');
const { findMasterPassword } = require('./src/masterpw');
const { createApp } = require('./src/app');
const { runSync } = require('./src/sync');
const { createLan } = require('./src/lan');

const db = openDb(DB_FILE);
const vault = new Vault(VAULT_FILE);

if (vault.exists()) {
  try {
    const pw = findMasterPassword();
    if (pw) { vault.unlock(pw); console.log('הכספת נפתחה (סיסמה מקובץ מפתח / משתנה סביבה).'); }
    else console.log('הכספת נעולה. פתח אותה בדפדפן.');
  } catch (e) { console.error('פתיחת הכספת נכשלה:', e.message); }
}

let app;
const lan = { get: () => realLan.get(), set: (on) => realLan.set(on) };
app = createApp({ db, vault, port: PORT, lan });
const realLan = createLan({ app, port: PORT, onChange: (on) => setSetting(db, 'lan_enabled', on ? '1' : '0') });
const server = app.listen(PORT, HOST, () => {
  console.log(`Family Budget פועל על http://${HOST}:${PORT} (מקומי בלבד)`);
});
if (getSetting(db, 'lan_enabled', '0') === '1' && db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) {
  lan.set(true).then(() => console.log('גישה מהרשת הביתית פעילה:', lan.get().urls.join(', '))).catch((e) => console.error('הפעלת הגישה מהרשת הביתית נכשלה:', e.message));
}
server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `הפורט ${PORT} תפוס. הגדר PORT אחר.` : e.message); process.exit(1); });

// משיכה יומית אוטומטית בזמן שהאפליקציה פתוחה: רק אם יש חשבונות, הכספת פתוחה והשעה הגיעה.
setInterval(async () => {
  try {
    if (getSetting(db, 'auto_sync', '1') !== '1' || !vault.isUnlocked() || app._state.syncing) return;
    if (!db.prepare('SELECT COUNT(*) c FROM accounts').get().c) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (now.getHours() < Number(getSetting(db, 'sync_hour', '6')) || getSetting(db, 'last_auto_sync', '') === today) return;
    setSetting(db, 'last_auto_sync', today);
    app._state.syncing = true;
    try { await runSync({ db, vault }); } finally { app._state.syncing = false; }
  } catch (e) { console.error('משיכה אוטומטית נכשלה:', e.message); }
}, 10 * 60 * 1000).unref();

process.on('SIGINT', () => process.exit(0));
