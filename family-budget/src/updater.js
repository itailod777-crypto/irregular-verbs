'use strict';
// עדכון גרסה מתוך האפליקציה: git pull + npm install + הפעלה מחדש.
// אין קלט מהמשתמש בפקודות (ענף ונתיב נקראים מהמערכת), והכול מוגבל למנהל.
const { execFile, exec } = require('child_process');
const path = require('path');

function run(file, args, cwd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd, timeout, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      if (err) { const e = new Error(String(stderr || err.message).trim().slice(0, 400)); e.code = err.code; return reject(e); }
      resolve(String(stdout).trim());
    });
  });
}
function runShell(cmd, cwd, timeout = 600000) {
  return new Promise((resolve, reject) => exec(cmd, { cwd, timeout, windowsHide: true }, (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).trim().slice(0, 400))) : resolve(String(stdout)))));
}

function createUpdater({ dir = path.join(__dirname, '..'), git = (args) => run('git', args, dir), npmInstall = () => runShell('npm install --no-audit --no-fund', dir), restart = () => {} } = {}) {
  let busy = false;
  const info = async () => {
    let current, branch;
    try { current = await git(['rev-parse', '--short', 'HEAD']); branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']); } catch (e) { return { hasGit: false }; }
    return { hasGit: true, current, branch };
  };
  return {
    info,
    async check() {
      const v = await info();
      if (!v.hasGit) return v;
      await git(['fetch', 'origin', v.branch]);
      const behind = Number(await git(['rev-list', '--count', `HEAD..origin/${v.branch}`]));
      const message = behind ? await git(['log', '-1', '--format=%s', `origin/${v.branch}`]) : '';
      return { ...v, behind, message };
    },
    async apply() {
      if (busy) throw new Error('עדכון כבר רץ');
      busy = true;
      try {
        const v = await info();
        if (!v.hasGit) throw new Error('האפליקציה הותקנה בלי Git, ולכן אי אפשר לעדכן מכאן');
        await git(['pull', '--ff-only', 'origin', v.branch]);
        await npmInstall();
        const after = await info();
        setTimeout(() => restart(), 800); // נותן לתשובה להישלח לפני שהשרת נסגר
        return { ok: true, from: v.current, to: after.current };
      } finally { busy = false; }
    },
  };
}

module.exports = { createUpdater };
