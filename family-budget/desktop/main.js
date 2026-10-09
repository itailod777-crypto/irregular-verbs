'use strict';
// עטיפת שולחן עבודה: מפעילה את השרת המקומי (127.0.0.1 בלבד) ופותחת אותו בחלון משלו, עם אייקון במגש המערכת.
// הנתונים נשמרים בתיקיית המשתמש של המערכת, והחלון נסגר למגש כדי שהמשיכה היומית תמשיך לרוץ ברקע.
const { app, BrowserWindow, Tray, Menu, nativeImage, safeStorage, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

const PORT = 38417;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ICON = path.join(__dirname, '..', 'build', 'icon.png');

if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  process.env.PORT = String(PORT);
  process.env.BUDGET_DATA_DIR = path.join(app.getPath('userData'), 'data');
  const keyFile = path.join(app.getPath('userData'), 'master.enc');
  let win = null, tray = null;
  app.isQuitting = false;

  // סיסמת-על שנשמרה (מוצפנת ע"י מחזיק המפתחות של מערכת ההפעלה) -> פותחת את הכספת אוטומטית
  try {
    if (fs.existsSync(keyFile) && safeStorage.isEncryptionAvailable()) {
      process.env.BUDGET_MASTER_PASSWORD = safeStorage.decryptString(fs.readFileSync(keyFile));
    }
  } catch { /* נבקש סיסמה בממשק */ }

  ipcMain.handle('remember', (e, pw) => {
    if (e.senderFrame.url.indexOf(ORIGIN) !== 0 || !safeStorage.isEncryptionAvailable()) return false;
    fs.writeFileSync(keyFile, safeStorage.encryptString(String(pw)), { mode: 0o600 });
    return true;
  });
  ipcMain.handle('forget', () => { try { fs.unlinkSync(keyFile); } catch { /* ignore */ } return true; });

  require('../server'); // מפעיל את Express על 127.0.0.1

  const waitForServer = async () => {
    for (let i = 0; i < 100; i++) {
      try { const r = await fetch(`${ORIGIN}/api/status`); if (r.ok) return; } catch { /* עוד לא עלה */ }
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const show = () => { if (!win) createWindow(); else { win.show(); win.focus(); } };

  function createWindow() {
    win = new BrowserWindow({
      width: 1280, height: 880, minWidth: 380, minHeight: 600, icon: ICON, backgroundColor: '#f4f3ef', autoHideMenuBar: true, title: 'תקציב המשפחה',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    win.removeMenu();
    win.loadURL(ORIGIN);
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) e.preventDefault(); });
    win.webContents.setWindowOpenHandler(({ url }) => (url.startsWith(ORIGIN) ? { action: 'allow' } : { action: 'deny' }));
    win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
    win.on('closed', () => { win = null; });
  }

  async function syncNow() {
    try { await fetch(`${ORIGIN}/api/sync`, { method: 'POST', headers: { 'X-Requested-With': 'budget', 'Content-Type': 'application/json' }, body: '{}' }); } catch { /* ignore */ }
    show();
  }

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false)); // אין צורך בשום הרשאה
    await waitForServer();
    createWindow();
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 20, height: 20 }));
    tray.setToolTip('תקציב המשפחה');
    const menu = () => Menu.buildFromTemplate([
      { label: 'פתיחה', click: show }, { label: 'משוך עכשיו', click: syncNow },
      { label: 'הפעלה אוטומטית עם המחשב', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) },
      { type: 'separator' }, { label: 'יציאה', click: () => { app.isQuitting = true; app.quit(); } }]);
    tray.setContextMenu(menu());
    tray.on('click', show);
    if (process.argv.includes('--hidden') && win) win.hide();
  });
  app.on('second-instance', show);
  app.on('before-quit', () => { app.isQuitting = true; });
  app.on('window-all-closed', () => { /* נשארים פעילים במגש */ });
}
