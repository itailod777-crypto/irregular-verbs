'use strict';
const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  wallet: 'M3 7a2 2 0 0 1 2-2h14v4M3 7v10a2 2 0 0 0 2 2h16V9H5a2 2 0 0 1-2-2zM17 14h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18',
  sync: 'M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v4h-4M6 22v-4h4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  plus: 'M12 5v14M5 12h14',
  print: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
  prev: 'M9 6l6 6-6 6', next: 'M15 6l-6 6 6 6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9 9.5C9 8.1 10.3 7 12 7s3 1.1 3 2.5S13.7 12 12 12s-3 1.1-3 2.5S10.3 17 12 17s3-1.1 3-2.5M12 5.5V7M12 17v1.5',
};
function icon(name, size = 20) {
  return s('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d: ICONS[name] }));
}

const state = { auth: null, year: null, month: null, months: [], cats: [], accounts: [], account: null, status: null, route: 'home' };
const ROUTES = [
  ['home', 'בית', 'home'], ['recurring', 'מנויים והוצאות קבועות', 'repeat'], ['onetime', 'הוצאות חד-פעמיות', 'bolt'],
  ['transactions', 'כל העסקאות', 'list'], ['budget', 'תקציב', 'wallet'], ['year', 'סיכום שנתי', 'calendar'], ['family', 'משפחה', 'users'], ['accounts', 'כרטיסים וחשבונות', 'bank'],
];
const isAdmin = () => !state.auth || !state.auth.usersExist || state.auth.user?.role === 'admin';
const catName = (id) => state.cats.find((c) => c.id === id)?.name || '';
const acctLabel = (id) => state.accounts.find((a) => a.id === id)?.label || '';
const q = (path, extra = '') => `${path}?month=${state.month}${state.account ? `&accountId=${state.account}` : ''}${extra}`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const pageHead = (title, sub, ...extra) => h('div', { class: 'page-title' }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), h('span', { class: 'spacer' }), ...extra);
const card = (title, sub, ...body) => h('div', { class: 'card' }, title ? h('h2', {}, title) : null, sub ? h('p', { class: 'sub' }, sub) : null, ...body);

// ---------- חלונות וכפתורים ----------
function modal(title, body, makeActions) {
  const d = h('dialog', {});
  const actions = h('div', { class: 'actions' });
  d.append(h('form', { method: 'dialog', onsubmit: (e) => e.preventDefault() }, h('h3', {}, title), body, actions));
  actions.append(...makeActions(() => d.close()));
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}
function busy(btn, fn) {
  return async () => {
    btn.disabled = true; btn.classList.add('busy');
    try { await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.classList.remove('busy'); }
  };
}
const catOptions = (sel, kinds = ['expense', 'income', 'transfer']) =>
  ['expense', 'income', 'transfer'].filter((k) => kinds.includes(k)).map((k) =>
    h('optgroup', { label: { expense: 'הוצאות', income: 'הכנסות', transfer: 'העברות (לא נספרות)' }[k] },
      state.cats.filter((c) => c.kind === k).map((c) => h('option', { value: c.id, selected: c.id === sel }, c.name))));
const field = (label, input, hint) => h('label', { class: 'field' }, label, input, hint ? h('span', { class: 'hint' }, hint) : null);

// הסבר פשוט בעברית במקום שגיאה טכנית (הטקסט המקורי נשאר ביומן העדכונים)
function friendlyError(m = '') {
  if (/INVALID_PASSWORD/.test(m)) return 'שם המשתמש או הסיסמה לא נכונים. לחצו על "עדכון סיסמה" בכרטיס.';
  if (/CHANGE_PASSWORD/.test(m)) return 'האתר מבקש להחליף סיסמה. היכנסו לאתר, החליפו סיסמה, ואז עדכנו אותה כאן.';
  if (/ACCOUNT_BLOCKED/.test(m)) return 'החשבון ננעל. צריך לפנות לחברה כדי לשחרר אותו.';
  if (/TIMEOUT|timed? ?out|Navigation/i.test(m)) return 'האתר לא הגיב בזמן. נסו שוב בעוד כמה דקות.';
  if (/Chrome|browser|puppeteer/i.test(m)) return 'חסר רכיב דפדפן שהאפליקציה צריכה כדי להיכנס לאתר. הריצו שוב את install-windows.bat.';
  if (/לא נמצאו פרטי כניסה/.test(m)) return 'חסרים פרטי כניסה. לחצו על "עדכון סיסמה" בכרטיס.';
  return 'משהו השתבש באתר. אפשר לנסות שוב מאוחר יותר.';
}

// ---------- סטטוס, באנרים ועדכון ----------
async function refreshAccounts() {
  state.accounts = await api('GET', '/api/accounts');
  const sel = document.getElementById('acc-select');
  sel.replaceChildren(h('option', { value: '' }, 'כל הכרטיסים יחד'), ...state.accounts.map((a) => h('option', { value: a.id, selected: String(a.id) === String(state.account) }, a.label)));
  sel.hidden = state.accounts.length < 2;
  if (state.accounts.length < 2) state.account = null;
}

async function refreshStatus() {
  state.status = await api('GET', '/api/status');
  const box = document.getElementById('banners');
  box.replaceChildren();
  const st = state.status;
  if (st.vault === 'locked' && !isAdmin()) box.append(h('div', { class: 'banner info' }, icon('lock'), h('div', { class: 'grow' }, h('strong', {}, 'הכספת נעולה'), 'בקשו ממנהל המשפחה לפתוח אותה כדי שאפשר יהיה לעדכן עסקאות.')));
  else if (st.vault === 'locked') {
    const pw = h('input', { type: 'password', placeholder: 'הסיסמה האישית', autocomplete: 'current-password', 'aria-label': 'הסיסמה האישית', style: { maxWidth: '240px' } });
    const btn = h('button', { class: 'btn primary sm', type: 'button' }, 'פתיחה');
    const rem = window.desktop ? h('label', { class: 'field inline' }, h('input', { type: 'checkbox' }), 'זכור במחשב הזה') : null;
    const go = busy(btn, async () => { await api('POST', '/api/vault/unlock', { password: pw.value }); if (rem && rem.querySelector('input').checked) await window.desktop.rememberPassword(pw.value); pw.value = ''; toast('נפתח. עכשיו אפשר לעדכן עסקאות'); await refreshStatus(); render(); });
    btn.addEventListener('click', go); pw.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    box.append(h('div', { class: 'banner info' }, icon('lock'), h('div', { class: 'grow' }, h('strong', {}, 'הסיסמה האישית נעולה'), 'כדי שהאפליקציה תוכל לעדכן עסקאות מהבנק, הקלידו את הסיסמה שבחרתם.'), pw, rem, btn));
  }
  if (st.syncing) box.append(h('div', { class: 'banner info', role: 'status' }, h('span', { class: 'spinner' }), h('div', { class: 'grow' }, h('strong', {}, 'מעדכן עסקאות מהבנק...'), 'זה יכול לקחת כמה דקות. אפשר להמשיך להסתכל באפליקציה.')));
  if (st.failing.length) {
    box.append(h('div', { class: 'banner crit', role: 'alert' }, h('span', { 'aria-hidden': 'true', class: 'warn-ic' }, '⚠'),
      h('div', { class: 'grow' }, h('strong', {}, st.failing.length === 1 ? 'העדכון נכשל עבור כרטיס אחד' : `העדכון נכשל עבור ${st.failing.length} כרטיסים`),
        st.failing.map((f) => h('div', {}, h('b', {}, f.label), ': ', friendlyError(f.last_status)))),
      h('a', { class: 'btn sm', href: '#/accounts' }, 'מה עושים?')));
  }
  const sb = document.getElementById('sync-btn');
  sb.replaceChildren(icon('sync', 18), st.syncing ? 'מעדכן...' : 'עדכן עכשיו');
  sb.disabled = st.syncing;
}

async function doSync(accountId) {
  if (!state.status.accounts) { location.hash = '#/accounts'; return toast('קודם מוסיפים כרטיס או חשבון', true); }
  if (state.status.vault !== 'unlocked') return toast('קודם מקלידים את הסיסמה האישית (בראש העמוד)', true);
  try { await api('POST', '/api/sync', accountId ? { accountId } : {}); } catch (e) { return toast(e.message, true); }
  await refreshStatus();
  for (let i = 0; i < 900; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await api('GET', '/api/status').catch(() => null);
    if (st && !st.syncing) break;
  }
  await refreshStatus(); await loadMonths();
  if (state.months.length && !state.months.includes(state.month)) setMonth(state.months.includes(currentMonth()) ? currentMonth() : state.months[0], true);
  const bad = state.status.failing.length;
  toast(bad ? 'העדכון הסתיים עם שגיאה. פרטים למעלה.' : 'העסקאות עודכנו', !!bad);
  // לא מציירים מחדש אם המשתמש באמצע מילוי טופס (קובץ שנבחר, טקסט שהוקלד), כדי לא למחוק לו את מה שהזין
  const typing = [...document.querySelectorAll('#view input, #view select')].some((i) => (i.type === 'file' ? i.files.length : ['text', 'password', 'number', 'search'].includes(i.type) && i.value));
  if (!typing) render();
}

// ---------- ניווט ----------
async function loadMonths() { state.months = await api('GET', '/api/months'); }
function setMonth(m, silent) { state.month = m; document.getElementById('m-label').textContent = monthLabel(m); if (!silent) render(); }
function render() {
  let route = (location.hash.replace(/^#\//, '') || 'home').split('?')[0];
  if (route === 'import') route = 'accounts';
  state.route = PAGES[route] ? route : 'home';
  document.querySelectorAll('#tabs a').forEach((a) => { if (a.dataset.route === state.route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const root = document.getElementById('view');
  const view = h('div', {}, h('div', { class: 'skeleton-wrap', 'aria-busy': 'true' }, h('div', { class: 'skeleton tall' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }))); // לכל ניווט מכל משלו, כך שדף ישן שמסיים באיחור לא דורס את החדש
  root.replaceChildren(view);
  PAGES[state.route](view).catch((e) => view.replaceChildren(h('div', { class: 'card empty' }, h('h3', {}, 'משהו השתבש'), e.message)));
}

// ---------- בית ----------
function verdictOf(sum, rec, ins) {
  if (!(sum.income > 0)) return { tone: 'none', title: 'חסר מידע על ההכנסה', text: 'כתבו כמה נכנס החודש, ואז נראה כמה נשאר ואם אתם במצב טוב.' };
  let projExp = sum.expense, projected = false;
  const spentToToday = ins.current.length ? ins.current[ins.current.length - 1] : 0;
  // צפי רק אם כל ההוצאות שנרשמו הן עד היום (אחרת אין מה להעריך)
  if (ins.todayDay && Math.abs(spentToToday - sum.expense) < 1) { projected = true; projExp = sum.expense + rec.expectedRest + (sum.split.oneTime / ins.todayDay) * (ins.daysInMonth - ins.todayDay); }
  const bal = sum.income - projExp, rate = bal / sum.income;
  const when = projected ? 'בקצב הנוכחי, ' : '';
  if (rate >= 0.2) return { tone: 'good', title: 'אתם במצב מצוין', text: `${when}אתם חוסכים בערך ${pct(rate)} מההכנסה. כל הכבוד.`, projBal: bal, projected };
  if (rate >= 0.05) return { tone: 'ok', title: 'אתם במצב טוב', text: `${when}נשאר לכם כסף בסוף החודש (כ-${fmt(bal)}).`, projBal: bal, projected };
  if (rate >= 0) return { tone: 'warn', title: 'אתם על הגבול', text: `${when}כמעט כל ההכנסה הולכת על הוצאות. כדאי לשים לב.`, projBal: bal, projected };
  return { tone: 'crit', title: 'אתם במינוס', text: `${when}ההוצאות גדולות מההכנסה בכ-${fmt(-bal)}. כדאי לצמצם.`, projBal: bal, projected };
}
const VERDICT_ICON = { good: '✓', ok: '✓', warn: '!', crit: '✕', none: '?' };

function incomeDialog(sum) {
  const amount = h('input', { type: 'number', min: '0', step: '100', inputMode: 'numeric', value: sum.incomeSource === 'transactions' ? '' : sum.income || '', placeholder: 'למשל 18000', style: { fontSize: '1.4rem', fontWeight: 700 } });
  const scope = h('select', {}, h('option', { value: 'month' }, `רק ל${monthLabel(state.month)}`), h('option', { value: 'all', selected: sum.incomeSource === 'default' }, 'לכל חודש (אפשר לשנות אחר כך)'));
  const note = sum.incomeSource === 'transactions' ? h('p', { class: 'hint' }, `כרגע ההכנסה מחושבת לבד מהעסקאות בחשבון (${fmt(sum.incomeComputed)}). אם תכתבו סכום, הוא יחליף אותה.`) : null;
  modal('כמה הכנסתם החודש?', h('div', { class: 'stack-gap' }, h('p', {}, 'כתבו את סך ההכנסות של המשפחה (משכורות, קצבאות וכו׳), ואחרי זה האפליקציה תחשב כמה נשאר.'), field('סכום (₪)', amount), field('לאיזה חודשים?', scope), note),
    (close) => {
      const ok = h('button', { class: 'btn primary', type: 'button' }, 'שמירה');
      ok.addEventListener('click', busy(ok, async () => { if (!amount.value) throw new Error('כתבו סכום'); await api('PUT', '/api/income', { month: state.month, amount: Number(amount.value), all: scope.value === 'all' }); toast('נשמר'); close(); render(); }));
      const out = [ok, h('button', { class: 'btn', type: 'button', onclick: close }, 'ביטול')];
      if (sum.incomeSource === 'manual') out.push(h('button', { class: 'btn danger', type: 'button', onclick: async () => { await api('PUT', '/api/income', { month: state.month, amount: null }); close(); render(); } }, 'ביטול ההזנה הידנית'));
      return out;
    });
}

function animateCounts(root) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-v]').forEach((el) => {
    const target = Number(el.dataset.v), t0 = performance.now();
    const tick = (now) => { const k = Math.min(1, (now - t0) / 700); el.textContent = fmt(k < 1 ? target * (1 - (1 - k) ** 3) : target); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}

async function pageHome(view) {
  if (!state.months.length && !state.accounts.length) { view.replaceChildren(welcomeCard()); return; }
  const [sum, rec, ins, one, al] = await Promise.all([api('GET', q('/api/summary')), api('GET', q('/api/recurring')), api('GET', q('/api/insights')), api('GET', q('/api/onetime')), api('GET', q('/api/alerts'))]);
  const v = verdictOf(sum, rec, ins);
  const src = { transactions: 'לפי העסקאות בחשבון', manual: 'הוזן על ידכם', default: 'סכום קבוע שהזנתם', none: 'עדיין לא הוזן' }[sum.incomeSource];
  const frag = h('div', { class: 'fade-in' });
  frag.append(pageHead(`איך נראה ${monthLabel(state.month)}`, state.account ? `מוצג: ${acctLabel(state.account)}` : state.accounts.length > 1 ? 'כל הכרטיסים מאוחדים' : 'סיכום פשוט של הכסף שלכם'));
  const spark = (vals) => h('div', { class: 'big-spark', title: '6 החודשים האחרונים' }, sparkline(vals, 'rgba(255,255,255,.95)', 'rgba(0,0,0,.28)', 120, 30));
  const incSeries = sum.trend.map((t) => t.income), expSeries = sum.trend.map((t) => t.expense), balSeries = sum.trend.map((t) => Math.max(0, t.income - t.expense));
  const editBtn = h('button', { class: 'btn sm light', type: 'button', onclick: () => incomeDialog(sum), disabled: !!state.account, title: state.account ? 'ההכנסה מוזנת לכל הכרטיסים יחד' : null }, '✎ ', sum.incomeSource === 'none' ? 'כתבו כמה נכנס' : 'שינוי');
  const extras = [];
  if (ins.todayDay && sum.income > 0) {
    const remaining = sum.income - sum.expense - rec.expectedRest, daysLeft = ins.daysInMonth - ins.todayDay + 1;
    extras.push(h('div', { class: 'allowance' }, h('b', {}, remaining > 0 ? `אפשר להוציא עוד כ-${fmt(remaining / daysLeft)} ליום` : 'כבר הגעתם לתקרת החודש'),
      h('span', {}, remaining > 0 ? ` עד סוף החודש (${daysLeft} ימים), אחרי שהוצאות קבועות שעוד לא ירדו.` : ` נשארו ${daysLeft} ימים עד סוף החודש.`)));
  }
  if (sum.savingsGoal && sum.income > 0) {
    const saved = Math.max(0, sum.balance), k = Math.min(1, saved / sum.savingsGoal);
    extras.push(h('div', { class: 'goal' }, h('div', { class: 'goal-top' }, h('b', {}, k >= 1 ? '✓ הגעתם ליעד החיסכון' : 'יעד חיסכון'), h('span', { class: 'num' }, `${fmt(saved)} מתוך ${fmt(sum.savingsGoal)}`)),
      h('div', { class: 'goal-track', role: 'progressbar', 'aria-valuenow': Math.round(k * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'התקדמות ליעד החיסכון' }, h('div', { class: 'goal-fill', style: { width: `${k * 100}%` } }))));
  }
  frag.append(h('div', { class: `card status-card tone-${v.tone}` },
    h('div', { class: 'verdict' }, h('span', { class: 'verdict-ic', 'aria-hidden': 'true' }, VERDICT_ICON[v.tone]), h('div', {}, h('div', { class: 'verdict-title' }, v.title), h('div', { class: 'verdict-text' }, v.text))),
    h('div', { class: 'trio' },
      h('div', { class: 'big' }, h('div', { class: 'big-label' }, 'נכנס'), h('div', { class: 'big-value num', 'data-v': sum.income > 0 ? sum.income : null }, sum.income > 0 ? fmt(sum.income) : '—'), h('div', { class: 'big-note' }, src), spark(incSeries), editBtn),
      h('div', { class: 'big' }, h('div', { class: 'big-label' }, 'יצא'), h('div', { class: 'big-value num', 'data-v': sum.expense }, fmt(sum.expense)), h('div', { class: 'big-note' }, deltaNote(sum)), spark(expSeries)),
      h('div', { class: 'big' }, h('div', { class: 'big-label' }, 'נשאר'), h('div', { class: 'big-value num ' + (sum.income > 0 ? (sum.balance >= 0 ? 'pos-on' : 'neg-on') : ''), 'data-v': sum.income > 0 ? sum.balance : null }, sum.income > 0 ? fmt(sum.balance) : '—'),
        h('div', { class: 'big-note' }, v.projected && v.projBal !== undefined ? `צפי לסוף החודש: ${fmt(v.projBal)}` : sum.income > 0 ? 'ההכנסה פחות ההוצאות' : 'נחשב אחרי שמזינים הכנסה'), sum.income > 0 ? spark(balSeries) : null)),
    ...extras));

  // שימו לב
  frag.append(h('div', { class: 'grid' }, h('div', { class: 'card alerts' }, h('div', { class: 'row-between' }, h('h2', {}, 'שימו לב'), al.length ? h('span', { class: 'chip warn' }, `${al.length} דברים שכדאי לבדוק`) : h('span', { class: 'chip good' }, '✓ הכול נראה תקין')),
    al.length ? h('ul', { class: 'alert-list' }, al.map((a) => h('li', { class: 'alert ' + a.level }, h('span', { class: 'alert-ic', 'aria-hidden': 'true' }, a.level === 'info' ? 'i' : '!'), h('div', {}, h('b', {}, a.title), h('p', {}, a.text)))))
      : h('p', { class: 'sub' }, 'לא נמצא חיוב כפול, מנוי שהתייקר, הוצאה חריגה או חריגה מהתקציב ב' + monthLabel(state.month) + '.'))));

  // קבועות / חד-פעמיות
  frag.append(h('div', { class: 'grid g2' },
    h('a', { class: 'card link-card', href: '#/recurring' }, h('div', { class: 'lc-top' }, h('span', { class: 'dot big-dot', style: { background: 'var(--s1)' } }), h('b', {}, 'הוצאות קבועות'), h('span', { class: 'spacer' }), h('span', { class: 'go' }, 'לכל המנויים ←')),
      h('div', { class: 'lc-value num', 'data-v': sum.split.recurring }, fmt(sum.split.recurring)), h('p', { class: 'sub' }, 'מנויים, חשבונות, ארנונה וביטוחים: דברים שחוזרים כל חודש.'), rec.expectedRest > 0 ? h('span', { class: 'chip warn' }, `עוד צפוי ~${fmt(rec.expectedRest)} החודש`) : null),
    h('a', { class: 'card link-card', href: '#/onetime' }, h('div', { class: 'lc-top' }, h('span', { class: 'dot big-dot', style: { background: 'var(--s2)' } }), h('b', {}, 'הוצאות חד-פעמיות'), h('span', { class: 'spacer' }), h('span', { class: 'go' }, 'לכל ההוצאות ←')),
      h('div', { class: 'lc-value num', 'data-v': sum.split.oneTime }, fmt(sum.split.oneTime)), h('p', { class: 'sub' }, 'קניות, בילויים, תיקונים ועוד: מה שלא חוזר כל חודש.'), splitBar(sum.split.recurring, sum.split.oneTime))));

  // קצב + חלוקה
  const cur = ins.current.length ? ins.current[ins.current.length - 1] : 0;
  const prevAt = ins.todayDay ? ins.previous[ins.todayDay - 1] ?? 0 : ins.previous[ins.previous.length - 1] ?? 0;
  const diff = cur - prevAt;
  const paceNote = ins.previous.length ? h('p', { class: 'pace-note' }, ins.todayDay ? `עד היום (יום ${ins.todayDay}) הוצאתם ${fmt(cur)}. באותו שלב בחודש שעבר: ${fmt(prevAt)}. ` : `החודש הוצאתם ${fmt(cur)}, בחודש שעבר ${fmt(prevAt)}. `,
    h('span', { class: 'chip ' + (diff <= 0 ? 'good' : 'warn') }, diff <= 0 ? `✓ פחות ב-${fmt(-diff)}` : `▲ יותר ב-${fmt(diff)}`)) : h('p', { class: 'pace-note' }, 'אין עדיין חודש קודם להשוואה.');
  frag.append(h('div', { class: 'grid g-main' },
    card('האם מוציאים יותר מהחודש שעבר?', 'כמה כסף יצא עד כל יום בחודש', paceChart(ins), paceNote),
    card('כמה קבוע וכמה חד-פעמי?', 'החלוקה של כל מה שיצא החודש', h('div', { class: 'donut-wrap' }, splitDonut(sum.split.recurring, sum.split.oneTime),
      h('div', { class: 'donut-legend' }, splitLine('var(--s1)', 'קבועות', sum.split.recurring, sum.expense), splitLine('var(--s2)', 'חד-פעמיות', sum.split.oneTime, sum.expense))))));

  // 6 חודשים: גרף + טבלה
  frag.append(h('div', { class: 'grid g-main' },
    card('הכנסות מול הוצאות ב-6 החודשים האחרונים', 'למטה מה שקבוע, למעלה מה שחד-פעמי, והקו הטורקיז הוא מה שנכנס', trendChart(sum.trend)),
    card('שישה חודשים במספרים', 'כמה נשאר וכמה אחוז מההכנסה נחסך', monthsTable(sum.trend))));

  // מפת חום + ימי שבוע
  frag.append(h('div', { class: 'grid g2' },
    card('באילו ימים יוצא הכי הרבה כסף?', 'כל ריבוע הוא יום. ככל שהצבע כהה יותר, יצא יותר.', heatmapCalendar(ins)),
    card('באילו ימי שבוע מוציאים הכי הרבה?', 'ממוצע הוצאה ביום, לפי יום בשבוע', weekdayChart(ins.weekday))));

  // קטגוריות + מה השתנה
  frag.append(h('div', { class: 'grid g2' },
    card('על מה הכסף הולך?', 'הקטגוריות הגדולות החודש', categoryBars(sum.expenses, { onlyTop: 8, total: sum.expense })),
    card('מה השתנה מהחודש שעבר?', 'כל קטגוריה מול החודש הקודם. ▲ אדום = יצא יותר', deltaTable(ins.categoriesDelta))));

  const withBudget = sum.expenses.filter((e) => e.budget);
  const extra = [card('איפה מוציאים הכי הרבה?', 'בתי העסק שקיבלו הכי הרבה כסף החודש', rankBars(ins.topMerchants))];
  if (!state.account && ins.byAccount.length > 1) extra.push(card('כמה הוציא כל כרטיס?', 'החלוקה בין הכרטיסים והחשבונות', rankBars(ins.byAccount.map((a) => ({ name: a.label, total: a.total })))));
  else extra.push(card('התקציב החודשי', 'כמה נשאר בכל קטגוריה שהגדרתם לה תקציב', withBudget.length ? categoryBars(withBudget, { onlyTop: 10 }) : h('div', { class: 'empty small' }, h('p', {}, 'עוד לא הגדרתם תקציב. זה עוזר לא לחרוג.'), h('a', { class: 'btn', href: '#/budget' }, 'להגדרת תקציב'))));
  frag.append(h('div', { class: 'grid g2' }, ...extra));
  if (!state.account && ins.byAccount.length > 1) frag.append(h('div', { class: 'grid' }, card('התקציב החודשי', 'כמה נשאר בכל קטגוריה שהגדרתם לה תקציב', withBudget.length ? categoryBars(withBudget, { onlyTop: 10 }) : h('div', { class: 'empty small' }, h('p', {}, 'עוד לא הגדרתם תקציב. זה עוזר לא לחרוג.'), h('a', { class: 'btn', href: '#/budget' }, 'להגדרת תקציב')))));
  frag.append(h('div', { class: 'grid' }, h('div', { class: 'card' },
    h('div', { class: 'row-between' }, h('h2', {}, 'סיכום החודש במילים'), h('span', { class: 'row-gap' }, h('a', { class: 'btn sm', href: `/api/export.csv?month=${state.month}${state.account ? `&accountId=${state.account}` : ''}` }, 'הורדה לאקסל'), h('a', { class: 'btn sm no-print', href: `/report.html?month=${state.month}`, target: '_blank', rel: 'noopener' }, icon('print', 16), 'להדפסה'))),
    h('p', { class: 'summary-text' }, ...summaryParts(sum, rec, one)))));
  view.replaceChildren(frag);
  animateCounts(view);
}

function splitLine(color, label, value, total) {
  return h('div', { class: 'split-line' }, h('div', { class: 'sl-top' }, h('span', { class: 'dot', style: { background: color } }), label, h('span', { class: 'spacer' }), pct(total ? value / total : 0)), h('div', { class: 'sl-value num' }, fmt(value)));
}
function deltaNote(sum) {
  const prev = sum.trend[sum.trend.length - 2];
  if (!prev || !prev.expense) return 'כל מה שיצא החודש';
  const d = sum.expense - prev.expense;
  return `${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d))} ${d >= 0 ? 'יותר' : 'פחות'} מהחודש הקודם`;
}
function summaryParts(sum, rec, one) {
  const top = sum.expenses[0];
  const parts = [`ב${monthLabel(sum.month)} נכנסו `, h('b', { class: 'num' }, sum.income > 0 ? fmt(sum.income) : 'סכום שלא הוזן'), ' ויצאו ', h('b', { class: 'num' }, fmt(sum.expense)), '. '];
  if (sum.income > 0) parts.push(sum.balance >= 0 ? 'נשארו ' : 'חסרו ', h('b', { class: 'num ' + (sum.balance >= 0 ? 'pos' : 'neg') }, fmt(Math.abs(sum.balance))), '. ');
  if (sum.expense > 0) parts.push(`מתוך ההוצאות, ${fmt(sum.split.recurring)} (${pct(sum.split.recurring / sum.expense)}) קבועות ו-${fmt(sum.split.oneTime)} חד-פעמיות. `);
  if (top && top.total > 0) parts.push(`הסעיף הגדול ביותר הוא ${top.name} (${fmt(top.total)}). `);
  const bigOne = one.items[0];
  if (bigOne) parts.push(`ההוצאה החד-פעמית הגדולה: ${bigOne.description} (${fmt(-bigOne.amount)}). `);
  const over = sum.expenses.filter((e) => e.budget && e.pct > 1);
  if (over.length) parts.push(`חרגתם מהתקציב ב: ${over.map((o) => o.name).join(', ')}. `);
  if (rec.expectedRest > 0) parts.push(`עוד צפויות הוצאות קבועות של כ-${fmt(rec.expectedRest)}. `);
  return parts;
}

function welcomeCard() {
  return h('div', { class: 'card welcome fade-in' },
    h('div', { class: 'welcome-ic' }, icon('coin', 64)),
    h('h1', {}, 'ברוכים הבאים לתקציב המשפחה'),
    h('p', { class: 'lead' }, 'האפליקציה מרכזת את כל הכרטיסים והחשבונות במקום אחד ומראה בפשטות כמה נכנס, כמה יצא, וכמה נשאר.'),
    h('ol', { class: 'steps' },
      h('li', {}, h('span', {}, h('b', {}, 'מוסיפים כרטיס אשראי'), ' (או כמה כרטיסים). זה לוקח דקה.')),
      h('li', {}, h('span', {}, h('b', {}, 'האפליקציה מורידה לבד'), ' את העסקאות, מסווגת אותן ומזהה מנויים והוצאות קבועות.')),
      h('li', {}, h('span', {}, h('b', {}, 'כותבים כמה נכנס בחודש'), ', ורואים כמה נשאר ואם אתם במצב טוב.'))),
    h('p', { class: 'hint' }, 'הכול נשמר רק במחשב הזה. פרטי הכניסה מוצפנים, והאפליקציה רק קוראת עסקאות ואף פעם לא מבצעת פעולות בחשבון.'),
    h('div', { class: 'actions center' }, h('a', { class: 'btn primary big', href: '#/accounts' }, 'הוספת כרטיס אשראי')));
}

// ---------- מנויים והוצאות קבועות ----------
async function pageRecurring(view) {
  const r = await api('GET', q('/api/recurring'));
  const key = h('input', { placeholder: 'שם בית העסק, למשל: גן ילדים', 'aria-label': 'בית עסק להוספה כקבוע' });
  const add = h('button', { class: 'btn', type: 'button' }, icon('plus', 16), 'הוספה לרשימה');
  add.addEventListener('click', busy(add, async () => { if (!key.value.trim()) throw new Error('כתבו שם בית עסק'); await api('PUT', '/api/recurring/override', { key: key.value.trim(), recurring: true }); toast('נוסף'); render(); }));
  const groups = new Map();
  for (const i of r.items) { const g = groups.get(i.category) || { name: i.category, color: i.color, items: [], total: 0 }; g.items.push(i); g.total += i.thisMonth || i.average; groups.set(i.category, g); }
  const sorted = [...groups.values()].sort((a, b) => b.total - a.total);
  const subCard = (i) => h('div', { class: 'sub-card' },
    h('div', { class: 'sc-name' }, i.name),
    h('div', { class: 'sc-amount num' }, fmt(i.thisMonth || i.average), h('span', { class: 'of' }, ' בחודש')),
    h('div', { class: 'sc-meta' }, i.day ? `מתחייב בדרך כלל ב-${i.day} לחודש` : 'יום חיוב משתנה'),
    h('div', { class: 'sc-foot' },
      i.thisMonth ? h('span', { class: 'chip good' }, '✓ חויב החודש') : i.pending ? h('span', { class: 'chip warn' }, '◔ עוד לא חויב') : h('span', { class: 'chip' }, 'לא פעיל החודש'),
      sparkline(i.monthly)),
    h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => { await api('PUT', '/api/recurring/override', { key: i.key, recurring: false }).catch((e) => toast(e.message, true)); toast('הועבר להוצאות חד-פעמיות'); render(); } }, 'זה לא הוצאה קבועה'));
  view.replaceChildren(h('div', { class: 'fade-in' },
    pageHead('מנויים והוצאות קבועות', 'האפליקציה מזהה לבד כל דבר שחוזר כל חודש: מנויים, חשבונות, ארנונה, ביטוחים ועוד.'),
    h('div', { class: 'grid g3' },
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, h('span', { class: 'dot', style: { background: 'var(--s1)' } }), `חויב ב${monthLabel(state.month)}`), h('div', { class: 'value num' }, fmt(r.thisMonth)), h('div', { class: 'note' }, 'הוצאות קבועות שכבר ירדו')),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'עוד צפוי החודש'), h('div', { class: 'value num' }, fmt(r.expectedRest)), h('div', { class: 'note' }, 'חיובים שהיו בחודש שעבר ועוד לא הגיעו')),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'בשנה שלמה'), h('div', { class: 'value num' }, fmt(r.yearly)), h('div', { class: 'note' }, 'מה שהקבועות עולות בערך בשנה'))),
    h('div', { class: 'grid' }, card('כמה עלו ההוצאות הקבועות בכל חודש?', 'אם העמודות עולות, משהו התייקר או התווסף', barTrend(r.months.map((m, i) => ({ month: m, total: r.totals[i] })), 'var(--s1)'))),
    h('div', { class: 'grid' }, sorted.length ? h('div', { class: 'card' }, sorted.map((g, idx) => h('section', { class: 'rec-group' + (idx ? ' sep' : '') },
      h('div', { class: 'row-between' }, h('h2', {}, h('span', { class: 'dot', style: { background: g.color, marginInlineEnd: '8px' } }), g.name), h('b', { class: 'num' }, `${fmt(g.total)} לחודש`)),
      h('div', { class: 'sub-grid' }, g.items.map(subCard)))))
      : h('div', { class: 'card empty' }, h('h3', {}, 'עוד לא זוהו הוצאות קבועות'), h('p', {}, 'ברגע שיהיו כמה חודשי נתונים, הן יופיעו כאן לבד. אפשר גם להוסיף ידנית למטה.'))),
    h('div', { class: 'grid' }, card('חסר משהו ברשימה?', 'כתבו שם של בית עסק והוא יוגדר כהוצאה קבועה', h('div', { class: 'row' }, key, add)))));
}

// ---------- הוצאות חד-פעמיות ----------
async function pageOneTime(view) {
  const o = await api('GET', q('/api/onetime'));
  const rows = o.items.map((i) => h('tr', {}, h('td', {}, dateLabel(i.date)), h('td', {}, h('div', { class: 'cell-desc' }, i.description)),
    h('td', {}, h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: i.color } }), i.category)), h('td', { class: 'amt' }, fmt2(-i.amount)),
    h('td', {}, h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => { await api('PUT', '/api/recurring/override', { key: i.key, recurring: true }).catch((e) => toast(e.message, true)); toast('סומן כהוצאה קבועה'); render(); } }, 'זה בעצם קבוע'))));
  view.replaceChildren(h('div', { class: 'fade-in' },
    pageHead('הוצאות חד-פעמיות', 'כל מה שלא חוזר כל חודש: קניות, בילויים, תיקונים ועוד'),
    h('div', { class: 'grid g-main' },
      card('לפי קטגוריה', `בסך הכול ${fmt(o.total)} ב${monthLabel(state.month)}`, categoryBars(o.byCategory.map((c) => ({ ...c, budget: null, pct: null })), { onlyTop: 12, total: o.total })),
      card('האם זה עולה או יורד?', 'הוצאות חד-פעמיות ב-6 החודשים האחרונים', barTrend(o.trend, 'var(--s2)'))),
    h('div', { class: 'grid' }, card(`כל ההוצאות (${o.items.length})`, 'מהגדולה לקטנה',
      rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'stack' }, h('thead', {}, h('tr', {}, ['תאריך', 'מה', 'קטגוריה', 'כמה', ''].map((t, i) => h('th', { class: i === 3 ? 'amt' : '' }, t)))), h('tbody', {}, rows))) : h('div', { class: 'empty' }, 'אין הוצאות חד-פעמיות בחודש הזה')))));
}

// ---------- כל העסקאות ----------
async function pageTransactions(view) {
  const qin = h('input', { type: 'search', placeholder: 'חיפוש לפי שם בית עסק...', 'aria-label': 'חיפוש' });
  const cat = h('select', { 'aria-label': 'קטגוריה' }, h('option', { value: '' }, 'כל הקטגוריות'), catOptions(null));
  const type = h('select', { 'aria-label': 'סוג' }, h('option', { value: '' }, 'הוצאות והכנסות'), h('option', { value: 'expense' }, 'רק הוצאות'), h('option', { value: 'income' }, 'רק הכנסות'));
  const allm = h('label', { class: 'field inline' }, h('input', { type: 'checkbox' }), 'כל החודשים');
  const list = h('div', {}), count = h('p', { class: 'sub' });
  let limit = 200;
  async function load() { try { await loadInner(); } catch (e) { toast(e.message, true); } }
  async function loadInner() {
    const p = new URLSearchParams({ q: qin.value, categoryId: cat.value, type: type.value, limit });
    if (!allm.querySelector('input').checked) p.set('month', state.month);
    if (state.account) p.set('accountId', state.account);
    const r = await api('GET', `/api/transactions?${p}`);
    count.textContent = `${r.total} עסקאות`;
    list.replaceChildren(r.items.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'stack' },
      h('thead', {}, h('tr', {}, ['תאריך', 'מה', 'קטגוריה', 'סכום', ''].map((t, i) => h('th', { class: i === 3 ? 'amt' : '' }, t)))),
      h('tbody', {}, r.items.map(txRow)))) : h('div', { class: 'empty' }, 'לא נמצאו עסקאות'),
      r.total > r.items.length ? h('div', { class: 'actions center' }, h('button', { class: 'btn', type: 'button', onclick: () => { limit += 200; load(); } }, 'הצגת עוד')) : null);
  }
  function txRow(t) {
    const sel = h('select', { class: 'cat-select', 'aria-label': 'קטגוריה', onchange: async () => {
      try { const res = await api('PATCH', `/api/transactions/${t.id}`, { categoryId: Number(sel.value) }); toast('הקטגוריה עודכנה'); if (res.suggestion) suggestRule(t, res.suggestion); else load(); } catch (e) { toast(e.message, true); }
    } }, catOptions(t.category_id));
    return h('tr', {}, h('td', {}, dateLabel(t.date)),
      h('td', {}, h('div', { class: 'cell-desc', title: t.description }, t.description), h('div', { class: 'chips' }, t.source === 'manual' ? h('span', { class: 'chip' }, t.created_by_name ? `הוזן על ידי ${t.created_by_name}` : 'הוזן ידנית') : null, state.accounts.length > 1 && t.account_id ? h('span', { class: 'chip' }, acctLabel(t.account_id)) : null)),
      h('td', {}, sel), h('td', { class: 'amt ' + (t.amount > 0 ? 'pos' : '') }, (t.amount > 0 ? '+' : '') + fmt2(t.amount)),
      h('td', {}, t.source === 'manual' ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (!confirm('למחוק את העסקה?')) return; await api('DELETE', `/api/transactions/${t.id}`); load(); } }, 'מחיקה') : null));
  }
  [qin, cat, type].forEach((el) => el.addEventListener(el === qin ? 'input' : 'change', debounce(load, 250)));
  allm.querySelector('input').addEventListener('change', load);
  view.replaceChildren(h('div', { class: 'fade-in' },
    pageHead('כל העסקאות', `מוצגות העסקאות של ${monthLabel(state.month)}. אפשר לתקן קטגוריה בכל שורה.`, h('span', { class: 'row-gap' }, h('button', { class: 'btn', type: 'button', onclick: () => { location.href = `/api/export.csv?month=${allm.querySelector('input').checked ? 'all' : state.month}${state.account ? `&accountId=${state.account}` : ''}`; } }, 'הורדה לאקסל'), h('button', { class: 'btn primary', type: 'button', onclick: () => addTxDialog(load) }, icon('plus', 18), 'הוספת הוצאה או הכנסה'))),
    h('div', { class: 'grid' }, h('div', { class: 'card' }, h('div', { class: 'row' }, qin, cat, type, allm), count, list))));
  await load();
}

function suggestRule(t, sg) {
  const pat = h('input', { value: sg.pattern, 'aria-label': 'שם בית העסק' });
  modal('לסווג כך גם בעתיד?', h('div', { class: 'stack-gap' },
    h('p', {}, `כל עסקה ששמה מכיל את המילים למטה תסווג כ"${catName(sg.categoryId)}". ${sg.similar ? `זה יתקן גם ${sg.similar} עסקאות קיימות.` : 'זה יעבוד על עסקאות חדשות.'}`), field('שם בית העסק', pat)),
    (close) => {
      const yes = h('button', { class: 'btn primary', type: 'button' }, 'כן, לסווג תמיד כך');
      yes.addEventListener('click', busy(yes, async () => { const r = await api('POST', '/api/rules', { pattern: pat.value, categoryId: sg.categoryId }); toast(`נשמר. עודכנו ${r.updated} עסקאות`); close(); render(); }));
      return [yes, h('button', { class: 'btn', type: 'button', onclick: () => { close(); render(); } }, 'רק בעסקה הזו')];
    });
}

function addTxDialog(done) {
  const today = new Date().toISOString().slice(0, 10);
  const type = h('select', {}, h('option', { value: 'expense' }, 'הוצאה (יצא כסף)'), h('option', { value: 'income' }, 'הכנסה (נכנס כסף)'));
  const amount = h('input', { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', placeholder: '0' });
  const date = h('input', { type: 'date', value: today });
  const desc = h('input', { placeholder: 'למשל: מזומן לירקן' });
  const cat = h('select', {}, h('option', { value: '' }, 'לבחור לבד'), catOptions(null, ['expense', 'income']));
  modal('הוספת הוצאה או הכנסה', h('div', { class: 'stack-gap' }, h('p', { class: 'hint' }, 'מתאים למזומן ולדברים שלא מופיעים בכרטיס או בבנק.'), field('מה זה?', type), field('סכום (₪)', amount), field('תאריך', date), field('תיאור', desc), field('קטגוריה', cat)),
    (close) => {
      const ok = h('button', { class: 'btn primary', type: 'button' }, 'שמירה');
      ok.addEventListener('click', busy(ok, async () => {
        await api('POST', '/api/transactions', { type: type.value, amount: amount.value, date: date.value, description: desc.value, categoryId: cat.value || null });
        toast('נוסף'); close(); await loadMonths();
        const m = date.value.slice(0, 7); // אם התאריך בחודש אחר, עוברים אליו כדי שהעסקה תיראה
        if (m !== state.month) setMonth(m); else done();
      }));
      return [ok, h('button', { class: 'btn', type: 'button', onclick: close }, 'ביטול')];
    });
}

// ---------- תקציב ----------
async function pageBudget(view) {
  const [sum, budgets, rules, settings] = await Promise.all([api('GET', q('/api/summary')), api('GET', '/api/budgets'), api('GET', '/api/rules'), api('GET', '/api/settings')]);
  const goalIn = h('input', { type: 'number', min: '0', step: '100', inputMode: 'numeric', value: settings.savings_goal || '', placeholder: 'למשל 2000', 'aria-label': 'יעד חיסכון חודשי' });
  const goalSave = h('button', { class: 'btn primary', type: 'button' }, 'שמירת היעד');
  goalSave.addEventListener('click', busy(goalSave, async () => { await api('PUT', '/api/settings', { savings_goal: goalIn.value }); toast(goalIn.value ? 'היעד נשמר' : 'היעד בוטל'); }));
  const bmap = new Map(budgets.map((b) => [b.category_id, b.amount]));
  const spent = new Map(sum.expenses.map((e) => [e.id, e.total]));
  const rows = state.cats.filter((c) => c.kind === 'expense').map((c) => {
    const inp = h('input', { type: 'number', min: '0', step: '50', inputMode: 'numeric', value: bmap.get(c.id) || '', placeholder: 'ללא', 'aria-label': `תקציב ל${c.name}`, style: { maxWidth: '130px' } });
    inp.addEventListener('change', async () => { try { await api('PUT', `/api/budgets/${c.id}`, { amount: inp.value || 0 }); toast('נשמר'); } catch (e) { toast(e.message, true); } });
    const sp = spent.get(c.id) || 0, b = bmap.get(c.id);
    return h('tr', {}, h('td', {}, h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: c.color } }), c.name)), h('td', { class: 'amt' }, fmt(sp)), h('td', {}, inp),
      h('td', {}, b ? h('span', { class: 'chip ' + (sp > b ? 'crit' : sp >= b * 0.85 ? 'warn' : 'good') }, sp > b ? '⚠ חרגתם' : sp >= b * 0.85 ? '◔ קרוב לתקרה' : '✓ בסדר') : null));
  });
  const name = h('input', { placeholder: 'שם קטגוריה חדשה', 'aria-label': 'שם קטגוריה' });
  const kind = h('select', { 'aria-label': 'סוג' }, h('option', { value: 'expense' }, 'הוצאה'), h('option', { value: 'income' }, 'הכנסה'));
  const color = h('input', { type: 'color', value: '#5c7cfa', 'aria-label': 'צבע' });
  const rec = h('label', { class: 'field inline' }, h('input', { type: 'checkbox' }), 'חוזרת כל חודש');
  const addCat = h('button', { class: 'btn primary', type: 'button' }, 'הוספת קטגוריה');
  addCat.addEventListener('click', busy(addCat, async () => { await api('POST', '/api/categories', { name: name.value, kind: kind.value, color: color.value, recurring: rec.querySelector('input').checked }); state.cats = await api('GET', '/api/categories'); toast('נוספה'); render(); }));
  const catList = h('div', { class: 'chips wrap' }, state.cats.filter((c) => c.kind !== 'transfer').map((c) => h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: c.color } }), c.name,
    !['אחר', 'הכנסה אחרת'].includes(c.name) ? h('button', { class: 'chip-x', type: 'button', title: `מחיקת ${c.name}`, 'aria-label': `מחיקת ${c.name}`, onclick: async () => { if (!confirm(`למחוק את "${c.name}"? העסקאות יעברו ל"אחר".`)) return; await api('DELETE', `/api/categories/${c.id}`).catch((e) => toast(e.message, true)); state.cats = await api('GET', '/api/categories'); render(); } }, '×') : null)));
  const mine = rules.filter((r) => !r.builtin);
  view.replaceChildren(h('div', { class: 'fade-in' },
    pageHead('תקציב', `כמה רוצים להוציא לכל דבר בחודש. הניצול מחושב עבור ${monthLabel(state.month)}.`),
    h('div', { class: 'grid' }, card('תקציב חודשי לכל קטגוריה', 'כתבו סכום ליד כל קטגוריה שרוצים לעקוב אחריה. השאירו ריק כדי לא להגביל.',
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['קטגוריה', 'יצא החודש', 'תקציב (₪)', ''].map((t, i) => h('th', { class: i === 1 ? 'amt' : '' }, t)))), h('tbody', {}, rows))))),
    h('div', { class: 'grid' }, card('יעד חיסכון חודשי', 'כמה רוצים לחסוך כל חודש. במסך הבית יופיע פס שמראה כמה כבר חסכתם. השאירו ריק כדי לבטל.', h('div', { class: 'row' }, goalIn, goalSave))),
    h('div', { class: 'grid' }, card('הקטגוריות שלי', 'אפשר להוסיף קטגוריה חדשה, למשל "חתונות" או "חיות מחמד"', h('div', { class: 'row' }, name, kind, color, rec, addCat), catList)),
    mine.length ? h('div', { class: 'grid' }, h('div', { class: 'card' }, h('details', {}, h('summary', {}, `הכללים שלמדתי מהתיקונים שלכם (${mine.length})`),
      h('p', { class: 'sub' }, 'כשמתקנים קטגוריה של עסקה, האפליקציה זוכרת את זה. אפשר למחוק כלל שלא נכון.'),
      h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, mine.map((r) => h('tr', {}, h('td', {}, r.pattern), h('td', {}, r.category), h('td', {}, h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { await api('DELETE', `/api/rules/${r.id}`); render(); } }, 'מחיקה')))))))))) : null));
}

// ---------- כרטיסים וחשבונות ----------
const POPULAR = ['visaCal', 'isracard', 'max', 'amex', 'leumi', 'hapoalim', 'discount', 'mizrahi'];

function credentialsDialog(a, company) {
  const inputs = {};
  const fields = company.fields.map((f) => { inputs[f.key] = h('input', { type: 'password', autocomplete: 'off', 'aria-label': f.label }); return field(f.label, inputs[f.key]); });
  modal(`עדכון פרטי כניסה: ${a.label}`, h('div', { class: 'stack-gap' }, h('p', {}, 'זה נחוץ כשהסיסמה באתר הבנק או הכרטיס השתנתה. הפרטים נשמרים מוצפנים ולא יוצאים מהמחשב.'), ...fields),
    (close) => {
      const ok = h('button', { class: 'btn primary', type: 'button' }, 'שמירה');
      ok.addEventListener('click', busy(ok, async () => { await api('PUT', `/api/accounts/${a.id}/credentials`, { credentials: Object.fromEntries(company.fields.map((f) => [f.key, inputs[f.key].value])) }); toast('נשמר'); close(); await refreshStatus(); render(); }));
      return [ok, h('button', { class: 'btn', type: 'button', onclick: close }, 'ביטול')];
    });
}

function addCardForm(st, companies) {
  if (st.vault === 'locked') return card('הוספת כרטיס או חשבון', null, h('div', { class: 'banner info' }, icon('lock'), h('div', { class: 'grow' }, 'קודם פותחים את הסיסמה האישית (בשורה הכחולה בראש העמוד).')));
  let cur = null;
  const inputs = {};
  const fieldsBox = h('div', { class: 'form-grid' });
  const nameIn = h('input', { placeholder: 'למשל: הכרטיס של דנה', 'aria-label': 'שם לכרטיס' });
  const btns = h('div', { class: 'company-grid', role: 'group', 'aria-label': 'בחירת חברה' });
  const more = h('select', { 'aria-label': 'חברה אחרת' }, h('option', { value: '' }, 'חברה אחרת...'), companies.filter((c) => !POPULAR.includes(c.id)).map((c) => h('option', { value: c.id }, c.name)));
  const submit = h('button', { class: 'btn primary big', type: 'button', hidden: true }, 'הוספה ועדכון עסקאות');
  const pw1 = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'סיסמה אישית' }), pw2 = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'סיסמה אישית שוב' });
  const rem = window.desktop ? h('label', { class: 'field inline' }, h('input', { type: 'checkbox', checked: true }), 'זכור במחשב הזה (מוצפן על ידי Windows, והאפליקציה תיפתח בלי להקליד סיסמה)') : null;
  const pwBox = st.vault === 'missing' ? h('div', { class: 'pw-box' }, h('h3', {}, 'בחרו סיסמה אישית'), h('p', { class: 'hint' }, 'הסיסמה הזו מגינה על פרטי הכניסה לבנק. היא נשמרת רק אצלכם ואי אפשר לשחזר אותה, אז רשמו אותה במקום בטוח.'), h('div', { class: 'form-grid' }, field('סיסמה (8 תווים לפחות)', pw1), field('הקלידו שוב', pw2)), rem) : null;
  const choose = (id) => {
    cur = companies.find((c) => c.id === id);
    btns.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    fieldsBox.replaceChildren(); submit.hidden = true;
    if (!cur) return;
    if (cur.needsSms) { fieldsBox.append(h('p', { class: 'hint' }, 'חשבון זה דורש קוד SMS ולכן מוסיפים אותו דרך הטרמינל: npm run set-credentials. אפשר בינתיים להעלות קובץ למטה.')); return; }
    for (const f of cur.fields) { inputs[f.key] = h('input', { type: 'password', autocomplete: 'off', 'aria-label': f.label }); fieldsBox.append(field(f.label, inputs[f.key])); }
    if (!nameIn.value) nameIn.value = cur.name;
    submit.hidden = false;
  };
  for (const id of POPULAR) { const c = companies.find((x) => x.id === id); if (c) btns.append(h('button', { class: 'company-btn', type: 'button', 'data-id': id, 'aria-pressed': 'false', onclick: () => { more.value = ''; choose(id); } }, icon('bank', 22), c.name)); }
  more.addEventListener('change', () => choose(more.value));
  submit.addEventListener('click', busy(submit, async () => {
    if (!cur) throw new Error('בחרו חברה');
    if (st.vault === 'missing') { if (pw1.value !== pw2.value) throw new Error('הסיסמאות לא זהות'); await api('POST', '/api/vault/init', { password: pw1.value }); if (rem && rem.querySelector('input').checked) await window.desktop.rememberPassword(pw1.value); }
    const credentials = Object.fromEntries(cur.fields.map((f) => [f.key, inputs[f.key].value]));
    const r = await api('POST', '/api/accounts', { label: nameIn.value || cur.name, company: cur.id, credentials });
    Object.values(inputs).forEach((i) => (i.value = ''));
    await refreshStatus(); await refreshAccounts();
    toast('הכרטיס נוסף. מתחילים לטעון עסקאות...');
    location.hash = '#/home';
    doSync(r.id);
  }));
  return card('הוספת כרטיס או חשבון', 'אפשר להוסיף כמה שרוצים, והכול יתאחד. כל כרטיס מתווסף בנפרד.',
    h('div', { class: 'step' }, h('span', { class: 'step-n' }, '1'), h('b', {}, 'איזו חברה?')), btns, h('div', { class: 'row', style: { marginTop: '10px' } }, more),
    h('div', { class: 'step' }, h('span', { class: 'step-n' }, '2'), h('b', {}, 'פרטי הכניסה לאתר שלהם')), fieldsBox, field('איך לקרוא לכרטיס?', nameIn),
    pwBox, h('div', { class: 'actions' }, submit),
    h('p', { class: 'hint' }, 'מה שחשוב לדעת: האפליקציה רק קוראת עסקאות. היא לא יכולה לבצע שום פעולה בחשבון, ואף פעם לא שומרת מספר כרטיס.'));
}

function importCard() {
  const file = h('input', { type: 'file', accept: '.csv,.xlsx,.txt', 'aria-label': 'בחירת קובץ' });
  const target = h('select', { 'aria-label': 'לאיזה כרטיס' }, h('option', { value: '' }, 'לא משנה'), state.accounts.map((a) => h('option', { value: a.id }, a.label)));
  const sign = h('select', { 'aria-label': 'סימן סכומים' }, h('option', { value: 'auto' }, 'לזהות לבד (מומלץ)'), h('option', { value: 'expenses-positive' }, 'הוצאות מופיעות כמספר חיובי'), h('option', { value: 'expenses-negative' }, 'הוצאות מופיעות כמספר שלילי'));
  const out = h('div', {});
  const go = h('button', { class: 'btn primary', type: 'button' }, 'בדיקה לפני הוספה');
  const url = (kind) => `/api/import/${kind}?sign=${sign.value}${target.value ? `&accountId=${target.value}` : ''}`;
  const send = async (kind) => { const f = file.files[0]; if (!f) throw new Error('בחרו קובץ'); return api('POST', url(kind), await f.arrayBuffer(), { 'X-Filename': encodeURIComponent(f.name) }); };
  go.addEventListener('click', busy(go, async () => {
    const p = await send('preview');
    const commit = h('button', { class: 'btn primary', type: 'button' }, `הוספת ${p.new} עסקאות חדשות`);
    commit.addEventListener('click', busy(commit, async () => { const r = await send('commit'); toast(`נוספו ${r.added}, כפולות שדולגו ${r.duplicates}`); await loadMonths(); out.replaceChildren(h('div', { class: 'banner info' }, `✓ הושלם: נוספו ${r.added} עסקאות. ${r.duplicates} כבר היו קיימות.`)); }));
    out.replaceChildren(h('div', { class: 'preview' }, h('h3', {}, 'מה האפליקציה הבינה מהקובץ'),
      h('p', {}, `${p.count} שורות: ${p.new} חדשות, ${p.duplicates} כבר קיימות${p.invalid ? `, ${p.invalid} לא תקינות` : ''}.`),
      h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, p.sample.map((r) => h('tr', {}, h('td', {}, dateLabel(r.date)), h('td', {}, r.description), h('td', { class: 'amt' }, fmt2(r.amount))))))),
      p.sample.length ? h('p', { class: 'hint' }, 'אם התאריכים והסכומים נראים נכון, אפשר להוסיף. עסקאות שכבר קיימות לא יוכפלו.') : null,
      h('div', { class: 'actions' }, commit)));
  }));
  return card('אין חיבור אוטומטי? אפשר להעלות קובץ', 'הורידו מאתר הכרטיס או הבנק קובץ אקסל או CSV של העסקאות, והעלו אותו כאן.',
    h('div', { class: 'form-grid' }, field('הקובץ', file), field('לאיזה כרטיס הוא שייך?', target)),
    h('details', {}, h('summary', {}, 'אפשרויות מתקדמות'), field('איך מופיעות ההוצאות בקובץ?', sign)), h('div', { class: 'actions' }, go), out);
}

async function pageAccounts(view) {
  const [st, companies, log, settings] = await Promise.all([api('GET', '/api/status'), api('GET', '/api/companies'), api('GET', '/api/sync/log'), api('GET', '/api/settings')]);
  state.status = st; await refreshAccounts();
  const frag = h('div', { class: 'fade-in' }, pageHead('כרטיסים וחשבונות', 'מחברים כרטיסי אשראי וחשבונות בנק. אפשר כמה שרוצים, והאפליקציה מאחדת את הכול לסיכום אחד.'));
  const compName = (id) => companies.find((c) => c.id === id)?.name || id;
  if (state.accounts.length) {
    frag.append(h('div', { class: 'grid' }, card(`הכרטיסים והחשבונות שלי (${state.accounts.length})`, 'העסקאות מתעדכנות לבד פעם ביום. אפשר גם לעדכן ידנית.',
      h('div', { class: 'acct-grid' }, state.accounts.map((a) => {
        const bad = a.last_status && a.last_status !== 'ok';
        return h('div', { class: 'acct-card' },
          h('div', { class: 'acct-top' }, icon('bank', 22), h('div', {}, h('div', { class: 'acct-name' }, a.label), h('div', { class: 'acct-co' }, compName(a.company)))),
          bad ? h('span', { class: 'chip crit', title: a.last_status.slice(0, 200) }, '✘ ' + friendlyError(a.last_status)) : a.last_sync ? h('span', { class: 'chip good' }, '✓ מעודכן') : h('span', { class: 'chip' }, 'עוד לא עודכן'),
          h('div', { class: 'acct-when' }, a.last_sync ? `עדכון אחרון: ${new Date(a.last_sync).toLocaleString('he-IL')}` : ''),
          h('div', { class: 'acct-actions' },
            h('button', { class: 'btn sm primary', type: 'button', onclick: () => doSync(a.id) }, 'עדכן עכשיו'),
            isAdmin() && h('button', { class: 'btn sm', type: 'button', onclick: () => { const c = companies.find((x) => x.id === a.company); if (!c || c.needsSms) return toast('חשבון זה מעודכן דרך הטרמינל', true); credentialsDialog(a, c); } }, 'עדכון סיסמה'),
            isAdmin() && h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (!confirm(`להסיר את "${a.label}"? העסקאות שכבר נטענו יישארו.`)) return; await api('DELETE', `/api/accounts/${a.id}`).catch((e) => toast(e.message, true)); await refreshStatus(); render(); } }, 'הסרה')));
      })))));
  }
  if (isAdmin()) frag.append(h('div', { class: 'grid' }, addCardForm(st, companies)));
  frag.append(h('div', { class: 'grid' }, importCard()));
  // יומן והגדרות מתקדמות
  const topic = h('input', { value: settings.ntfy_topic, placeholder: 'למשל: budget-x7k29q', dir: 'ltr' });
  const server = h('input', { value: settings.ntfy_server, placeholder: 'https://ntfy.sh', dir: 'ltr' });
  const auto = h('input', { type: 'checkbox', checked: settings.auto_sync === '1' });
  const hour = h('input', { type: 'number', min: '0', max: '23', value: settings.sync_hour });
  const saveS = h('button', { class: 'btn primary', type: 'button' }, 'שמירה');
  saveS.addEventListener('click', busy(saveS, async () => { await api('PUT', '/api/settings', { ntfy_topic: topic.value, ntfy_server: server.value, auto_sync: auto.checked ? '1' : '0', sync_hour: hour.value }); toast('נשמר'); }));
  const test = h('button', { class: 'btn', type: 'button' }, 'שליחת הודעת בדיקה');
  test.addEventListener('click', busy(test, async () => { await api('POST', '/api/settings/test-notify'); toast('נשלחה'); }));
  frag.append(h('div', { class: 'grid g2' },
    isAdmin() && h('div', { class: 'card' }, h('details', {}, h('summary', {}, 'הגדרות מתקדמות'), h('div', { class: 'stack-gap', style: { marginTop: '12px' } },
      h('label', { class: 'field inline' }, auto, 'לעדכן עסקאות אוטומטית פעם ביום (כשהאפליקציה פתוחה)'), field('באיזו שעה בערך? (0-23)', hour),
      field('התראה לטלפון כשהעדכון נכשל (לא חובה)', topic, 'אפשר להתקין את האפליקציה ntfy בטלפון ולהירשם לאותו שם. ההודעה לא כוללת סכומים.'), field('כתובת שרת ntfy (לא חובה)', server), h('div', { class: 'actions' }, saveS, test)))),
    h('div', { class: 'card' }, h('details', {}, h('summary', {}, `יומן עדכונים (${log.length})`), log.length ? h('div', { class: 'table-wrap', style: { maxHeight: '320px', overflowY: 'auto' } }, h('table', {}, h('tbody', {}, log.map((l) => h('tr', {}, h('td', {}, new Date(l.started_at).toLocaleString('he-IL')), h('td', {}, l.account_label || ''),
      h('td', {}, l.status === 'ok' ? `✓ נוספו ${l.added}, כפולות ${l.duplicates}` : l.status === 'running' ? '… רץ' : h('span', { class: 'neg' }, '✘ ' + (l.error || '').slice(0, 140)))))))) : h('p', { class: 'hint' }, 'עוד לא בוצעו עדכונים')))));
  view.replaceChildren(frag);
}


// ---------- סיכום שנתי ----------
async function pageYear(view) {
  const year = state.year || state.month.slice(0, 4);
  const y = await api('GET', `/api/year?year=${year}${state.account ? `&accountId=${state.account}` : ''}`);
  const shift = (d) => { state.year = String(Number(year) + d); render(); };
  const active = y.months.filter((m) => m.hasData);
  const noteBits = [];
  if (y.best) noteBits.push(`החודש הכי טוב: ${monthLabel(y.best.month)} (נשארו ${fmt(y.best.balance)}).`);
  if (y.worst && y.worst !== y.best) noteBits.push(`החודש הכי יקר: ${monthLabel(y.worst.month)} (${y.worst.balance >= 0 ? 'נשארו' : 'חסרו'} ${fmt(Math.abs(y.worst.balance))}).`);
  if (y.monthsWithData) noteBits.push(`בממוצע יוצאים ${fmt(y.avgExpense)} בחודש.`);
  view.replaceChildren(h('div', { class: 'fade-in' },
    pageHead(`סיכום שנת ${year}`, 'כל השנה במבט אחד', h('div', { class: 'month-pick' }, h('button', { class: 'btn icon', type: 'button', 'aria-label': 'שנה קודמת', onclick: () => shift(-1) }, icon('prev', 18)), h('strong', {}, year), h('button', { class: 'btn icon', type: 'button', 'aria-label': 'שנה הבאה', onclick: () => shift(1) }, icon('next', 18)))),
    h('div', { class: 'grid g4' },
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, h('span', { class: 'dot', style: { background: 'var(--s3)' } }), 'נכנס השנה'), h('div', { class: 'value num' }, y.income ? fmt(y.income) : '—')),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, h('span', { class: 'dot', style: { background: 'var(--exp)' } }), 'יצא השנה'), h('div', { class: 'value num' }, fmt(y.expense))),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'נשאר'), h('div', { class: 'value num ' + (y.balance >= 0 ? 'pos' : 'neg') }, y.income ? fmt(y.balance) : '—')),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'אחוז חיסכון'), h('div', { class: 'value num' }, y.savingsRate === null ? '—' : pct(y.savingsRate)), h('div', { class: 'note' }, y.monthsWithData ? `לפי ${y.monthsWithData} חודשים עם נתונים` : 'אין עדיין נתונים'))),
    h('div', { class: 'grid' }, card('הכנסות והוצאות לפי חודש', noteBits.join(' ') || 'אין עדיין נתונים בשנה הזו', yearChart(y.months))),
    h('div', { class: 'grid g2' },
      card('החודשים במספרים', 'מהחדש לישן', active.length ? monthsTable(active) : h('div', { class: 'empty small' }, 'אין נתונים')),
      card('על מה הלך הכסף השנה?', 'הקטגוריות הגדולות', categoryBars(y.categories.map((c) => ({ ...c, budget: null, pct: null })), { onlyTop: 10, total: y.expense }))))); }

// ---------- כניסה, משתמשים ומשפחה ----------
function showLogin() {
  document.body.classList.add('login-mode');
  const user = h('input', { autocomplete: 'username', 'aria-label': 'שם משתמש', autofocus: true });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'סיסמה' });
  const btn = h('button', { class: 'btn primary big', type: 'button' }, 'כניסה');
  const go = busy(btn, async () => { await api('POST', '/api/auth/login', { username: user.value, password: pw.value }); location.reload(); });
  btn.addEventListener('click', go); pw.addEventListener('keydown', (e) => e.key === 'Enter' && go()); user.addEventListener('keydown', (e) => e.key === 'Enter' && pw.focus());
  document.getElementById('view').replaceChildren(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card fade-in' },
    h('div', { class: 'welcome-ic' }, icon('coin', 56)), h('h1', {}, 'תקציב המשפחה'), h('p', { class: 'sub' }, 'התחברו עם שם המשתמש והסיסמה האישיים שלכם'),
    h('div', { class: 'stack-gap' }, field('שם משתמש', user), field('סיסמה', pw), btn),
    h('p', { class: 'hint' }, 'שכחתם סיסמה? מנהל המשפחה יכול לאפס אותה.'))));
  toast('נדרשת התחברות');
}

function renderUserChip() {
  const btn = document.getElementById('user-btn');
  if (!state.auth || !state.auth.user) { btn.hidden = true; return; }
  btn.hidden = false;
  btn.replaceChildren(h('span', { class: 'avatar' }, state.auth.user.displayName.slice(0, 1)), state.auth.user.displayName);
  btn.onclick = () => {
    const cur = h('input', { type: 'password', autocomplete: 'current-password' }), nxt = h('input', { type: 'password', autocomplete: 'new-password' });
    modal(`שלום ${state.auth.user.displayName}`, h('div', { class: 'stack-gap' }, h('p', {}, `מחוברים כ-${state.auth.user.username} (${state.auth.user.role === 'admin' ? 'מנהל' : 'בן משפחה'})`),
      h('h3', {}, 'שינוי סיסמה'), field('הסיסמה הנוכחית', cur), field('סיסמה חדשה (8 תווים לפחות)', nxt)),
    (close) => {
      const ok = h('button', { class: 'btn primary', type: 'button' }, 'שמירת סיסמה');
      ok.addEventListener('click', busy(ok, async () => { await api('POST', '/api/auth/password', { current: cur.value, next: nxt.value }); toast('הסיסמה עודכנה'); close(); }));
      return [ok, h('button', { class: 'btn danger', type: 'button', onclick: async () => { await api('POST', '/api/auth/logout'); location.reload(); } }, 'התנתקות'), h('button', { class: 'btn', type: 'button', onclick: close }, 'סגירה')];
    });
  };
}

async function pageFamily(view) {
  if (!state.auth.usersExist) {
    const f = { username: h('input', { autocomplete: 'username', placeholder: 'למשל: dana' }), name: h('input', { placeholder: 'למשל: דנה' }), pw: h('input', { type: 'password', autocomplete: 'new-password' }), pw2: h('input', { type: 'password', autocomplete: 'new-password' }) };
    const go = h('button', { class: 'btn primary big', type: 'button' }, 'הפעלת כניסה אישית');
    go.addEventListener('click', busy(go, async () => {
      if (f.pw.value !== f.pw2.value) throw new Error('הסיסמאות לא זהות');
      await api('POST', '/api/auth/setup', { username: f.username.value, displayName: f.name.value, password: f.pw.value });
      location.hash = '#/family'; location.reload();
    }));
    view.replaceChildren(h('div', { class: 'fade-in' }, pageHead('משפחה', 'כל בן משפחה נכנס עם שם משתמש וסיסמה משלו, וכולם רואים את אותם כרטיסים ואותם נתונים.'),
      h('div', { class: 'grid g-main' },
        card('איך זה עובד', null, h('ol', { class: 'steps' },
          h('li', {}, h('span', {}, h('b', {}, 'יוצרים משתמש מנהל'), ' (אתם). המנהל מוסיף כרטיסים ומנהל את בני המשפחה.')),
          h('li', {}, h('span', {}, h('b', {}, 'מוסיפים בני משפחה'), ', לכל אחד שם משתמש וסיסמה, והם רואים את אותם כרטיסים.')),
          h('li', {}, h('span', {}, h('b', {}, 'מפעילים גישה מהרשת הביתית'), ' כדי שהם יוכלו להיכנס מהמחשב או מהטלפון שלהם בבית.'))),
          h('p', { class: 'hint' }, 'הכול נשאר בבית: אין ענן ואין כניסה עם גוגל. אחרי ההפעלה גם במחשב הזה צריך להתחבר.')),
        card('יצירת המנהל הראשון', 'זה המשתמש שלכם', h('div', { class: 'stack-gap' }, field('השם שיוצג', f.name), field('שם משתמש (באנגלית או בעברית, בלי רווחים)', f.username), field('סיסמה (8 תווים לפחות)', f.pw), field('הקלידו שוב', f.pw2), go)))));
    return;
  }
  if (!isAdmin()) { view.replaceChildren(card('אין הרשאה', 'העמוד הזה שמור למנהל המשפחה.')); return; }
  const [users, lan] = await Promise.all([api('GET', '/api/users'), api('GET', '/api/lan')]);
  const rows = users.map((u) => h('tr', {}, h('td', {}, h('b', {}, u.displayName), h('div', { class: 'muted' }, u.username)), h('td', {}, h('span', { class: 'chip' }, u.role === 'admin' ? 'מנהל' : 'בן משפחה')),
    h('td', {}, u.lastLogin ? new Date(u.lastLogin.replace(' ', 'T') + 'Z').toLocaleString('he-IL') : 'עוד לא התחבר'),
    h('td', {}, h('div', { class: 'row-gap' }, h('button', { class: 'btn sm', type: 'button', onclick: () => resetPwDialog(u) }, 'איפוס סיסמה'),
      u.id !== state.auth.user.id ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (!confirm(`להסיר את ${u.displayName}? הנתונים המשותפים יישארו.`)) return; await api('DELETE', `/api/users/${u.id}`).catch((e) => toast(e.message, true)); render(); } }, 'הסרה') : h('span', { class: 'chip good' }, 'אתם')))));
  const nm = h('input', { placeholder: 'למשל: יוסי' }), un = h('input', { placeholder: 'למשל: yossi', autocomplete: 'off' }), pw = h('input', { type: 'password', autocomplete: 'new-password' });
  const role = h('select', {}, h('option', { value: 'member' }, 'בן משפחה (רואה ומתקן נתונים)'), h('option', { value: 'admin' }, 'מנהל (גם מנהל כרטיסים ומשתמשים)'));
  const add = h('button', { class: 'btn primary', type: 'button' }, icon('plus', 16), 'הוספת בן משפחה');
  add.addEventListener('click', busy(add, async () => { await api('POST', '/api/users', { displayName: nm.value, username: un.value, password: pw.value, role: role.value }); toast('נוסף. תנו לו את שם המשתמש והסיסמה'); render(); }));
  const toggle = h('button', { class: 'btn ' + (lan.enabled ? 'danger' : 'primary'), type: 'button' }, lan.enabled ? 'כיבוי הגישה מהרשת הביתית' : 'הפעלת גישה מהרשת הביתית');
  toggle.addEventListener('click', busy(toggle, async () => { await api('PUT', '/api/lan', { enabled: !lan.enabled }); toast(lan.enabled ? 'הגישה כובתה' : 'הגישה מהרשת הביתית הופעלה'); render(); }));
  const urls = (lan.urls || []).map((u) => h('div', { class: 'url-row' }, h('code', { dir: 'ltr' }, u), h('button', { class: 'btn sm', type: 'button', onclick: () => navigator.clipboard?.writeText(u).then(() => toast('הועתק')) }, 'העתקה')));
  view.replaceChildren(h('div', { class: 'fade-in' }, pageHead('משפחה', 'מי יכול להיכנס, ואיך נכנסים מהרשת הביתית'),
    h('div', { class: 'grid' }, card(`בני המשפחה (${users.length})`, 'כולם רואים את אותם כרטיסים ונתונים. רק מנהל מוסיף כרטיסים ומנהל משתמשים.', h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['שם', 'תפקיד', 'כניסה אחרונה', ''].map((t) => h('th', {}, t)))), h('tbody', {}, rows))))),
    h('div', { class: 'grid' }, card('הוספת בן משפחה', 'אחרי ההוספה אפשר לשנות את הסיסמה בעצמו (לחיצה על השם שלו למעלה).', h('div', { class: 'form-grid' }, field('שם שיוצג', nm), field('שם משתמש', un), field('סיסמה זמנית (8 תווים לפחות)', pw), field('תפקיד', role)), h('div', { class: 'actions' }, add))),
    h('div', { class: 'grid' }, card('כניסה מהמחשבים והטלפונים של המשפחה בבית', lan.enabled ? 'הגישה פעילה' : 'כרגע האפליקציה נגישה רק מהמחשב הזה',
      h('div', { class: 'stack-gap' },
        lan.enabled ? h('div', {}, h('p', {}, 'בני המשפחה פותחים בדפדפן (באותו Wi-Fi) את אחת הכתובות האלה ומתחברים עם השם והסיסמה שלהם:'), ...urls) : h('p', {}, 'כשמפעילים, האפליקציה נפתחת לכל מי שמחובר לרשת הביתית ויודע שם משתמש וסיסמה. מבחוץ, מהאינטרנט, אי אפשר להגיע אליה.'),
        h('div', { class: 'actions' }, toggle),
        h('details', {}, h('summary', {}, 'חשוב לדעת'), h('ul', { class: 'plain-list' },
          h('li', {}, 'המחשב הזה צריך להיות דלוק והאפליקציה פתוחה כדי שאחרים יוכלו להיכנס.'),
          h('li', {}, 'Windows עשוי לשאול על חומת אש. אשרו רק "רשתות פרטיות" ולא "ציבוריות".'),
          h('li', {}, 'האפליקציה דוחה כל חיבור שלא מגיע מהרשת הביתית, ונועלת משתמש שמנחש סיסמה.'),
          h('li', {}, 'החיבור בתוך הבית אינו מוצפן (http). אל תפעילו את זה ברשת Wi-Fi ציבורית.'),
          h('li', {}, 'כל בן משפחה שנכנס רואה את כל העסקאות והכרטיסים. פרטי הכניסה לבנק לעולם לא מוצגים לאף אחד.'))))))));
}

function resetPwDialog(u) {
  const pw = h('input', { type: 'password', autocomplete: 'new-password' });
  modal(`איפוס סיסמה: ${u.displayName}`, h('div', { class: 'stack-gap' }, h('p', {}, 'הסיסמה החדשה תנתק את המשתמש מכל המכשירים.'), field('סיסמה חדשה (8 תווים לפחות)', pw)),
    (close) => {
      const ok = h('button', { class: 'btn primary', type: 'button' }, 'שמירה');
      ok.addEventListener('click', busy(ok, async () => { await api('PUT', `/api/users/${u.id}/password`, { password: pw.value }); toast('הסיסמה אופסה'); close(); }));
      return [ok, h('button', { class: 'btn', type: 'button', onclick: close }, 'ביטול')];
    });
}


const PAGES = { home: pageHome, recurring: pageRecurring, onetime: pageOneTime, transactions: pageTransactions, budget: pageBudget, year: pageYear, family: pageFamily, accounts: pageAccounts };

// ---------- אתחול ----------
(async function init() {
  document.getElementById('brand-mark').append(icon('coin', 22));
  document.getElementById('m-prev').append(icon('prev', 18));
  document.getElementById('m-next').append(icon('next', 18));
  document.getElementById('theme-btn').append(icon('moon', 18));
  document.getElementById('m-prev').addEventListener('click', () => setMonth(addMonths(state.month, -1)));
  document.getElementById('m-next').addEventListener('click', () => setMonth(addMonths(state.month, 1)));
  document.getElementById('sync-btn').addEventListener('click', () => doSync());
  document.getElementById('acc-select').addEventListener('change', (e) => { state.account = e.target.value ? Number(e.target.value) : null; render(); });
  document.getElementById('theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme; const next = !cur ? 'dark' : cur === 'dark' ? 'light' : '';
    if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
    safeStore('theme', next || 'auto'); toast(next === 'dark' ? 'מצב כהה' : next === 'light' ? 'מצב בהיר' : 'מצב אוטומטי');
  });
  window.addEventListener('hashchange', render);
  try { state.auth = await api('GET', '/api/auth/state'); } catch (e) { document.getElementById('view').replaceChildren(h('div', { class: 'card empty' }, h('h3', {}, 'לא ניתן להתחבר לשרת'), e.message)); return; }
  if (state.auth.usersExist && !state.auth.user) { showLogin(); return; }
  renderUserChip();
  document.getElementById('tabs').append(...ROUTES.filter(([id]) => id !== 'family' || isAdmin()).map(([id, label, ic]) => h('a', { href: `#/${id}`, 'data-route': id }, icon(ic, 18), label)));
  try {
    state.cats = await api('GET', '/api/categories');
    await loadMonths(); await refreshAccounts(); await refreshStatus();
  } catch (e) { document.getElementById('view').replaceChildren(h('div', { class: 'card empty' }, h('h3', {}, 'לא ניתן להתחבר לשרת'), e.message)); return; }
  state.month = state.months.includes(currentMonth()) || !state.months.length ? currentMonth() : state.months[0];
  document.getElementById('m-label').textContent = monthLabel(state.month);
  render();
  setInterval(() => { if (state.status && state.status.syncing) refreshStatus().catch(() => {}); }, 5000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
