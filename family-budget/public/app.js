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
  coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9 9.5C9 8.1 10.3 7 12 7s3 1.1 3 2.5S13.7 12 12 12s-3 1.1-3 2.5S10.3 17 12 17s3-1.1 3-2.5M12 5.5V7M12 17v1.5',
};
function icon(name, size = 20) {
  return s('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d: ICONS[name] }));
}

const state = { month: null, months: [], cats: [], status: null, route: 'home' };
const ROUTES = [
  ['home', 'בית', 'home'], ['recurring', 'הוצאות חוזרות', 'repeat'], ['onetime', 'הוצאות חד-פעמיות', 'bolt'],
  ['transactions', 'עסקאות', 'list'], ['budget', 'תקציב וקטגוריות', 'wallet'], ['import', 'יבוא קובץ', 'upload'], ['accounts', 'חשבונות ומשיכות', 'bank'],
];
const catName = (id) => state.cats.find((c) => c.id === id)?.name || '';

// ---------- חלונות ----------
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

// ---------- סטטוס ובאנרים ----------
async function refreshStatus() {
  state.status = await api('GET', '/api/status');
  const box = document.getElementById('banners');
  box.replaceChildren();
  const st = state.status;
  if (st.vault === 'locked') {
    const pw = h('input', { type: 'password', placeholder: 'סיסמת-על', autocomplete: 'current-password', 'aria-label': 'סיסמת-על', style: { maxWidth: '240px' } });
    const btn = h('button', { class: 'btn primary sm', type: 'button' }, 'פתיחה');
    const rem = window.desktop ? h('label', { class: 'field', style: { flexDirection: 'row', alignItems: 'center', gap: '6px' } }, h('input', { type: 'checkbox' }), 'זכור במחשב הזה') : null;
    const go = busy(btn, async () => { await api('POST', '/api/vault/unlock', { password: pw.value }); if (rem && rem.querySelector('input').checked) await window.desktop.rememberPassword(pw.value); pw.value = ''; toast('הכספת נפתחה'); await refreshStatus(); render(); });
    btn.addEventListener('click', go); pw.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    box.append(h('div', { class: 'banner info' }, icon('lock'), h('div', { class: 'grow' }, h('strong', {}, 'הכספת נעולה'), 'הזן סיסמת-על כדי לאפשר משיכה מהבנקים.'), pw, rem, btn));
  }
  if (st.failing.length) {
    box.append(h('div', { class: 'banner crit', role: 'alert' }, h('span', { 'aria-hidden': 'true' }, '⚠'),
      h('div', { class: 'grow' }, h('strong', {}, `המשיכה נכשלה עבור ${st.failing.length === 1 ? 'חשבון אחד' : st.failing.length + ' חשבונות'}`),
        st.failing.map((f) => h('div', {}, `${f.label}: ${f.last_status}`))),
      h('a', { class: 'btn sm', href: '#/accounts' }, 'פרטים ויומן')));
  }
  const sb = document.getElementById('sync-btn');
  sb.replaceChildren(icon('sync', 18), st.syncing ? 'מושך...' : 'משוך עכשיו');
  sb.disabled = st.syncing;
}

async function doSync() {
  if (state.status.vault === 'missing') { location.hash = '#/accounts'; return toast('קודם צריך ליצור כספת ולהוסיף חשבון', true); }
  if (!state.status.accounts) { location.hash = '#/accounts'; return toast('עוד לא הוגדר חשבון. הוסף חשבון כדי להתחיל.', true); }
  try { await api('POST', '/api/sync'); } catch (e) { return toast(e.message, true); }
  toast('המשיכה התחילה. זה יכול לקחת כמה דקות...');
  const sb = document.getElementById('sync-btn');
  sb.disabled = true; sb.classList.add('busy');
  for (let i = 0; i < 900; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await api('GET', '/api/status').catch(() => null);
    if (st && !st.syncing) break;
  }
  sb.classList.remove('busy');
  await refreshStatus();
  const bad = state.status.failing.length;
  toast(bad ? 'המשיכה הסתיימה עם שגיאות. ראה פרטים בבאנר.' : 'המשיכה הסתיימה בהצלחה', !!bad);
  await loadMonths(); render();
}

// ---------- ניווט ----------
async function loadMonths() { state.months = await api('GET', '/api/months'); }
function setMonth(m) { state.month = m; document.getElementById('m-label').textContent = monthLabel(m); render(); }
function render() {
  const route = (location.hash.replace(/^#\//, '') || 'home').split('?')[0];
  state.route = PAGES[route] ? route : 'home';
  document.querySelectorAll('#tabs a').forEach((a) => { if (a.dataset.route === state.route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const view = document.getElementById('view');
  view.replaceChildren(h('div', { class: 'empty' }, 'טוען...'));
  PAGES[state.route](view).catch((e) => view.replaceChildren(h('div', { class: 'card empty' }, h('h3', {}, 'משהו השתבש'), e.message)));
}

// ---------- בית ----------
const pageHead = (title, sub, ...extra) => h('div', { class: 'page-title' }, h('h1', {}, title), sub ? h('p', {}, sub) : null, h('span', { class: 'spacer' }), ...extra);

async function pageHome(view) {
  const [sum, rec] = await Promise.all([api('GET', `/api/summary?month=${state.month}`), api('GET', `/api/recurring?month=${state.month}`)]);
  const noData = !state.months.length;
  const frag = h('div', { class: 'fade-in' });
  if (noData) { frag.append(welcomeCard()); view.replaceChildren(frag); return; }
  frag.append(pageHead(`סיכום ${monthLabel(state.month)}`, 'ההכנסות, ההוצאות והיתרה שלך במבט אחד'));
  const savings = sum.income > 0 ? sum.balance / sum.income : null;
  frag.append(h('div', { class: 'grid g3' },
    h('div', { class: 'card stat' }, h('div', { class: 'label' }, h('span', { class: 'dot', style: { background: 'var(--s3)' } }), 'הכנסות'), h('div', { class: 'value num' }, fmt(sum.income)), h('div', { class: 'note' }, sum.incomes[0] ? `הגדולה: ${sum.incomes[0].name}` : 'אין הכנסות רשומות')),
    h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'הוצאות'), h('div', { class: 'value num' }, fmt(sum.expense)), h('div', { class: 'note' }, deltaNote(sum))),
    h('div', { class: 'card stat hero' }, h('div', { class: 'label' }, 'יתרה לחודש'), h('div', { class: 'value num' }, fmt(sum.balance)), h('div', { class: 'note' }, savings === null ? 'אין הכנסות לחישוב חיסכון' : sum.balance >= 0 ? `חסכת ${pct(savings)} מההכנסה` : 'ההוצאות עלו על ההכנסות'))));

  const tbtn = h('button', { class: 'btn sm', type: 'button' }, 'הצג כטבלה');
  const chartHolder = h('div', {}, trendChart(sum.trend));
  let asTable = false;
  tbtn.addEventListener('click', () => { asTable = !asTable; chartHolder.replaceChildren(asTable ? trendTable(sum.trend) : trendChart(sum.trend)); tbtn.textContent = asTable ? 'הצג כגרף' : 'הצג כטבלה'; });
  frag.append(h('div', { class: 'grid g-main' },
    h('div', { class: 'card' }, h('div', { class: 'row', style: { alignItems: 'center' } }, h('div', {}, h('h2', {}, 'מגמה של 6 חודשים'), h('p', { class: 'sub' }, 'הוצאות חוזרות וחד-פעמיות מול הכנסות')), tbtn), chartHolder),
    h('div', { class: 'card' }, h('h2', {}, 'חוזרות מול חד-פעמיות'), h('p', { class: 'sub' }, 'איפה הכסף באמת הולך'),
      h('div', { class: 'donut-wrap' }, splitDonut(sum.split.recurring, sum.split.oneTime),
        h('div', { style: { flex: '1 1 150px' } },
          splitLine('var(--s1)', 'חוזרות', sum.split.recurring, sum.expense, '#/recurring'),
          splitLine('var(--s2)', 'חד-פעמיות', sum.split.oneTime, sum.expense, '#/onetime'))),
      rec.expectedRest > 0 ? h('p', { class: 'hint' }, `צפויות עוד ~${fmt(rec.expectedRest)} בהוצאות חוזרות שטרם חויבו החודש.`) : null)));

  const withBudget = sum.expenses.filter((e) => e.budget);
  frag.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h2', {}, 'הוצאות לפי קטגוריה'), h('p', { class: 'sub' }, '8 הקטגוריות הגדולות'), categoryBars(sum.expenses, { onlyTop: 8, total: sum.expense })),
    h('div', { class: 'card' }, h('h2', {}, 'תקציב חודשי'), h('p', { class: 'sub' }, 'כמה נשאר בכל קטגוריה'),
      withBudget.length ? categoryBars(withBudget, { onlyTop: 10 }) : h('div', { class: 'empty' }, h('p', {}, 'עוד לא הוגדר תקציב.'), h('a', { class: 'btn primary', href: '#/budget' }, 'הגדרת תקציב')))));

  frag.append(h('div', { class: 'grid' }, h('div', { class: 'card' },
    h('div', { class: 'row', style: { alignItems: 'center' } }, h('h2', {}, 'סיכום סוף חודש'), h('a', { class: 'btn sm no-print', href: `/report.html?month=${state.month}`, target: '_blank', rel: 'noopener' }, icon('print', 16), 'הדפסה / PDF')),
    h('p', { class: 'summary-text' }, ...summaryParts(sum, rec)))));
  view.replaceChildren(frag);
}

function splitLine(color, label, value, total, href) {
  return h('a', { href, style: { display: 'block', textDecoration: 'none', color: 'inherit', padding: '8px 0' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-2)', fontSize: '.9rem' } }, h('span', { class: 'dot', style: { background: color } }), label, h('span', { class: 'spacer' }), pct(total ? value / total : 0)),
    h('div', { class: 'num', style: { fontSize: '1.4rem', fontWeight: 800 } }, fmt(value)));
}
function deltaNote(sum) {
  const prev = sum.trend[sum.trend.length - 2];
  if (!prev || !prev.expense) return 'אין חודש קודם להשוואה';
  const d = sum.expense - prev.expense;
  return `${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d))} ${d >= 0 ? 'יותר' : 'פחות'} מהחודש הקודם`;
}
function summaryParts(sum, rec) {
  const top = sum.expenses[0];
  const parts = [`ב${monthLabel(sum.month)} נכנסו `, h('b', { class: 'num' }, fmt(sum.income)), ' והוצאת ', h('b', { class: 'num' }, fmt(sum.expense)),
    sum.balance >= 0 ? ', כך שנשארה יתרה של ' : ', כך שנוצר גרעון של ', h('b', { class: ['num', sum.balance >= 0 ? 'pos' : 'neg'].join(' ') }, fmt(Math.abs(sum.balance))), '. '];
  if (sum.expense > 0) parts.push(`מתוך ההוצאות, ${fmt(sum.split.recurring)} (${pct(sum.split.recurring / sum.expense)}) הן חוזרות וקבועות ו-${fmt(sum.split.oneTime)} חד-פעמיות. `);
  if (top && top.total > 0) parts.push(`הקטגוריה הגדולה ביותר היא ${top.name} (${fmt(top.total)}). `);
  const over = sum.expenses.filter((e) => e.budget && e.pct > 1);
  if (over.length) parts.push(`חריגה מהתקציב ב: ${over.map((o) => o.name).join(', ')}. `);
  if (rec.expectedRest > 0) parts.push(`עוד צפויות ~${fmt(rec.expectedRest)} בהוצאות חוזרות שטרם חויבו. `);
  if (sum.transfers) parts.push('חיובי כרטיס אשראי והעברות פנימיות אינם נספרים כהוצאה כדי לא לספור פעמיים.');
  return parts;
}

function welcomeCard() {
  const b = h('button', { class: 'btn primary', type: 'button', onclick: () => (location.hash = '#/accounts') }, 'חיבור חשבון');
  return h('div', { class: 'card empty fade-in', style: { marginTop: '24px', maxWidth: '640px', marginInline: 'auto' } },
    h('div', { style: { color: 'var(--s1)' } }, icon('coin', 56)),
    h('h3', {}, 'ברוכים הבאים לתקציב המשפחה'),
    h('p', {}, 'הכול מוכן. ברגע שתחבר חשבון, העסקאות יתחילו להירשם, להיות מסווגות ולהצטבר לסיכום החודשי, בלי שום שירות ענן.'),
    h('ol', { class: 'steps' },
      h('li', {}, h('span', {}, h('b', {}, 'יוצרים כספת מוצפנת'), ' עם סיסמת-על שרק אתה מכיר.')),
      h('li', {}, h('span', {}, h('b', {}, 'מוסיפים בנק או כרטיס אשראי'), ' (הפרטים נשמרים מוצפנים, קריאה בלבד).')),
      h('li', {}, h('span', {}, h('b', {}, 'לוחצים "משוך עכשיו"'), ', ומשם זה רץ לבד פעם ביום. אפשר גם ליבא קובץ אקסל/CSV.'))),
    h('div', { class: 'actions', style: { justifyContent: 'center' } }, b, h('a', { class: 'btn', href: '#/import' }, 'יבוא קובץ במקום')));
}

// ---------- הוצאות חוזרות ----------
async function pageRecurring(view) {
  const r = await api('GET', `/api/recurring?month=${state.month}`);
  const key = h('input', { placeholder: 'שם בית עסק, למשל: גן ילדים', 'aria-label': 'בית עסק להוספה כחוזר' });
  const add = h('button', { class: 'btn', type: 'button' }, icon('plus', 16), 'סמן כחוזר');
  add.addEventListener('click', busy(add, async () => {
    if (!key.value.trim()) throw new Error('הקלד שם בית עסק');
    await api('PUT', '/api/recurring/override', { key: key.value.trim().toLowerCase(), recurring: true }); toast('נוסף'); render();
  }));
  const rows = r.items.map((i) => h('tr', {},
    h('td', {}, h('div', { class: 'cell-desc' }, i.name), h('div', { style: { display: 'flex', gap: '6px', marginTop: '2px' } }, h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: i.color } }), i.category), i.override === true ? h('span', { class: 'chip' }, 'סומן ידנית') : null)),
    h('td', {}, sparkline(i.monthly)),
    h('td', { class: 'amt' }, fmt(i.average)),
    h('td', { class: 'amt' }, i.thisMonth ? fmt(i.thisMonth) : '—'),
    h('td', {}, i.thisMonth ? h('span', { class: 'chip good' }, '✓ חויב') : i.pending ? h('span', { class: 'chip warn' }, '◔ טרם חויב') : h('span', { class: 'chip' }, 'לא פעיל')),
    h('td', {}, h('button', { class: 'btn sm', type: 'button', title: 'להעביר להוצאות חד-פעמיות', onclick: async () => { await api('PUT', '/api/recurring/override', { key: i.key, recurring: false }).catch((e) => toast(e.message, true)); toast('הועבר לחד-פעמיות'); render(); } }, 'לא חוזר'))));
  view.replaceChildren(h('div', { class: 'fade-in' },
    pageHead('הוצאות חוזרות', 'מנויים, חשבונות וחיובים קבועים. מזוהים אוטומטית, וניתן לתקן.'),
    h('div', { class: 'grid g3' },
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, h('span', { class: 'dot', style: { background: 'var(--s1)' } }), `חויב ב${monthLabel(state.month)}`), h('div', { class: 'value num' }, fmt(r.thisMonth))),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'צפוי עוד החודש'), h('div', { class: 'value num' }, fmt(r.expectedRest)), h('div', { class: 'note' }, 'חיובים שהיו בחודש שעבר וטרם הגיעו')),
      h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'הערכה שנתית'), h('div', { class: 'value num' }, fmt(r.yearly)), h('div', { class: 'note' }, 'ממוצע חיובים × 12'))),
    h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, 'כל החיובים החוזרים'),
      rows.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['בית עסק', '6 חודשים', 'ממוצע', 'החודש', 'מצב', ''].map((t, i) => h('th', { class: i === 2 || i === 3 ? 'amt' : '' }, t)))), h('tbody', {}, rows))) : h('div', { class: 'empty' }, 'עוד לא זוהו הוצאות חוזרות. הן יופיעו אחרי כמה חודשי נתונים או כשתסמן ידנית.'),
      h('div', { class: 'row', style: { marginTop: '16px' } }, key, add)))));
}

// ---------- הוצאות חד-פעמיות ----------
async function pageOneTime(view) {
  const o = await api('GET', `/api/onetime?month=${state.month}`);
  const rows = o.items.map((i) => h('tr', {}, h('td', {}, dateLabel(i.date)), h('td', {}, h('div', { class: 'cell-desc' }, i.description)),
    h('td', {}, h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: i.color } }), i.category)), h('td', { class: 'amt' }, fmt2(-i.amount)),
    h('td', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => { await api('PUT', '/api/recurring/override', { key: i.key, recurring: true }).catch((e) => toast(e.message, true)); toast('סומן כחוזר'); render(); } }, 'סמן כחוזרת'))));
  const bars = o.byCategory.map((c) => ({ ...c, budget: null, pct: null }));
  view.replaceChildren(h('div', { class: 'fade-in' },
    pageHead('הוצאות חד-פעמיות', 'כל מה שלא חוזר מדי חודש: קניות, בילויים, תיקונים ועוד'),
    h('div', { class: 'grid g-main' },
      h('div', { class: 'card' }, h('h2', {}, 'לפי קטגוריה'), h('p', { class: 'sub' }, `סה״כ ${fmt(o.total)}`), categoryBars(bars, { onlyTop: 12, total: o.total })),
      h('div', { class: 'card' }, h('h2', {}, 'מגמה'), h('p', { class: 'sub' }, 'חד-פעמיות ב-6 חודשים'), oneTimeTrend(o.trend))),
    h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, `העסקאות (${o.items.length})`),
      rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'stack' }, h('thead', {}, h('tr', {}, ['תאריך', 'תיאור', 'קטגוריה', 'סכום', ''].map((t, i) => h('th', { class: i === 3 ? 'amt' : '' }, t)))), h('tbody', {}, rows))) : h('div', { class: 'empty' }, 'אין הוצאות חד-פעמיות בחודש הזה')))));
}
function oneTimeTrend(trend) {
  const box = h('div', { class: 'chart-box' });
  const W = 360, H = 200, T = 12, B = 26, L = 6, R = 6, iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(...trend.map((t) => t.total)));
  const slot = iw / trend.length, bw = Math.min(34, slot * 0.6);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'הוצאות חד-פעמיות לפי חודש' });
  svg.append(s('line', { x1: L, x2: W - R, y1: T + ih, y2: T + ih, stroke: 'var(--axis)' }));
  const tip = tooltip(box);
  trend.forEach((t, i) => {
    const cx = L + iw - slot * (i + 0.5), hh = (t.total / max) * ih;
    if (hh > 0.5) svg.append(s('path', { d: roundTop(cx - bw / 2, T + ih - hh, bw, hh, 5), fill: 'var(--s2)' }));
    svg.append(s('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: i === trend.length - 1 ? 't-ink' : '' }, monthShortLabel(t.month)));
    if (t.total > 0) svg.append(s('text', { x: cx, y: T + ih - hh - 5, 'text-anchor': 'middle', class: 't-ink' }, short(t.total)));
    const hit = s('rect', { x: cx - slot / 2, y: T, width: slot, height: ih + B, fill: 'transparent' });
    hit.addEventListener('pointerenter', () => tip.show(cx * (box.clientWidth / W), T, monthLabel(t.month), [['var(--s2)', 'חד-פעמיות', fmt(t.total)]]));
    hit.addEventListener('pointerleave', () => tip.hide());
    svg.append(hit);
  });
  box.prepend(svg);
  return box;
}

// ---------- עסקאות ----------
async function pageTransactions(view) {
  const f = { q: '', categoryId: '', type: '', all: false };
  const q = h('input', { type: 'search', placeholder: 'חיפוש בית עסק...', 'aria-label': 'חיפוש' });
  const cat = h('select', { 'aria-label': 'קטגוריה' }, h('option', { value: '' }, 'כל הקטגוריות'), catOptions(null));
  const type = h('select', { 'aria-label': 'סוג' }, h('option', { value: '' }, 'הכול'), h('option', { value: 'expense' }, 'הוצאות'), h('option', { value: 'income' }, 'הכנסות'));
  const allm = h('label', { class: 'field', style: { flexDirection: 'row', alignItems: 'center', gap: '8px' } }, h('input', { type: 'checkbox' }), 'כל החודשים');
  const list = h('div', {});
  const count = h('p', { class: 'sub' });
  let limit = 200;
  async function load() {
    const p = new URLSearchParams({ q: q.value, categoryId: cat.value, type: type.value, limit });
    if (!allm.querySelector('input').checked) p.set('month', state.month);
    const r = await api('GET', `/api/transactions?${p}`);
    count.textContent = `${r.total} עסקאות`;
    list.replaceChildren(r.items.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'stack' },
      h('thead', {}, h('tr', {}, ['תאריך', 'תיאור', 'קטגוריה', 'סכום', ''].map((t, i) => h('th', { class: i === 3 ? 'amt' : '' }, t)))),
      h('tbody', {}, r.items.map(txRow)))) : h('div', { class: 'empty' }, 'לא נמצאו עסקאות'),
      r.total > r.items.length ? h('div', { class: 'actions', style: { justifyContent: 'center', marginTop: '12px' } }, h('button', { class: 'btn', type: 'button', onclick: () => { limit += 200; load(); } }, 'טען עוד')) : null);
  }
  function txRow(t) {
    const sel = h('select', { class: 'cat-select', 'aria-label': 'קטגוריה', onchange: async () => {
      try { const res = await api('PATCH', `/api/transactions/${t.id}`, { categoryId: Number(sel.value) }); toast('הקטגוריה עודכנה'); if (res.suggestion) suggestRule(t, res.suggestion); else load(); } catch (e) { toast(e.message, true); }
    } }, catOptions(t.category_id));
    return h('tr', { style: t.ignored ? { opacity: .5 } : null },
      h('td', {}, dateLabel(t.date)), h('td', {}, h('div', { class: 'cell-desc', title: t.description }, t.description), t.source === 'manual' ? h('span', { class: 'chip' }, 'ידני') : null), h('td', {}, sel),
      h('td', { class: 'amt ' + (t.amount > 0 ? 'pos' : '') }, (t.amount > 0 ? '+' : '') + fmt2(t.amount)),
      h('td', {}, h('button', { class: 'btn sm', type: 'button', title: t.ignored ? 'החזרה לסיכומים' : 'הסתרה מהסיכומים', onclick: async () => { await api('PATCH', `/api/transactions/${t.id}`, { ignored: !t.ignored }); load(); } }, t.ignored ? 'החזר' : 'הסתר'),
        t.source === 'manual' ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { await api('DELETE', `/api/transactions/${t.id}`); load(); } }, 'מחק') : null));
  }
  [q, cat, type].forEach((el) => el.addEventListener(el === q ? 'input' : 'change', debounce(load, 250)));
  allm.querySelector('input').addEventListener('change', load);
  view.replaceChildren(h('div', { class: 'fade-in' },
    pageHead('עסקאות', `מוצגות עסקאות של ${monthLabel(state.month)}`, h('button', { class: 'btn primary', type: 'button', onclick: () => addTxDialog(load) }, icon('plus', 18), 'הוספה ידנית')),
    h('div', { class: 'grid' }, h('div', { class: 'card' }, h('div', { class: 'row' }, q, cat, type, allm), count, list))));
  await load();
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function suggestRule(t, sg) {
  const pat = h('input', { value: sg.pattern, 'aria-label': 'תבנית לחוק' });
  modal('ליצור חוק לסיווג אוטומטי?', h('div', {},
    h('p', {}, `כל עסקה שהשם שלה מכיל את התבנית תסווג כ-"${catName(sg.categoryId)}". ${sg.similar ? `זה יחול גם על ${sg.similar} עסקאות קיימות.` : 'זה יחול על עסקאות עתידיות.'}`), h('label', { class: 'field' }, 'תבנית', pat)),
    (close) => {
      const yes = h('button', { class: 'btn primary', type: 'button' }, 'צור חוק והחל');
      yes.addEventListener('click', busy(yes, async () => { const r = await api('POST', '/api/rules', { pattern: pat.value, categoryId: sg.categoryId }); toast(`החוק נוצר. עודכנו ${r.updated} עסקאות`); close(); render(); }));
      return [yes, h('button', { class: 'btn', type: 'button', onclick: () => { close(); render(); } }, 'רק העסקה הזו')];
    });
}

function addTxDialog(done) {
  const today = new Date().toISOString().slice(0, 10);
  const type = h('select', {}, h('option', { value: 'expense' }, 'הוצאה'), h('option', { value: 'income' }, 'הכנסה'));
  const amount = h('input', { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', placeholder: '0.00' });
  const date = h('input', { type: 'date', value: today });
  const desc = h('input', { placeholder: 'למשל: מזומן - ירקן' });
  const cat = h('select', {}, h('option', { value: '' }, 'סיווג אוטומטי'), catOptions(null, ['expense', 'income']));
  modal('הוספת עסקה ידנית', h('div', { style: { display: 'grid', gap: '12px' } },
    h('label', { class: 'field' }, 'סוג', type), h('label', { class: 'field' }, 'סכום (₪)', amount), h('label', { class: 'field' }, 'תאריך', date), h('label', { class: 'field' }, 'תיאור', desc), h('label', { class: 'field' }, 'קטגוריה', cat)),
    (close) => {
      const ok = h('button', { class: 'btn primary', type: 'button' }, 'שמירה');
      ok.addEventListener('click', busy(ok, async () => { await api('POST', '/api/transactions', { type: type.value, amount: amount.value, date: date.value, description: desc.value, categoryId: cat.value || null }); toast('נוסף'); close(); done(); }));
      return [ok, h('button', { class: 'btn', type: 'button', onclick: close }, 'ביטול')];
    });
}

// ---------- תקציב, קטגוריות וחוקים ----------
async function pageBudget(view) {
  const [sum, budgets, rules] = await Promise.all([api('GET', `/api/summary?month=${state.month}`), api('GET', '/api/budgets'), api('GET', '/api/rules')]);
  const bmap = new Map(budgets.map((b) => [b.category_id, b.amount]));
  const spent = new Map(sum.expenses.map((e) => [e.id, e.total]));
  const rows = state.cats.filter((c) => c.kind === 'expense').map((c) => {
    const inp = h('input', { type: 'number', min: '0', step: '10', inputMode: 'numeric', value: bmap.get(c.id) || '', placeholder: 'ללא', 'aria-label': `תקציב ל${c.name}`, style: { maxWidth: '120px' } });
    inp.addEventListener('change', async () => { try { await api('PUT', `/api/budgets/${c.id}`, { amount: inp.value || 0 }); toast('נשמר'); } catch (e) { toast(e.message, true); } });
    const sp = spent.get(c.id) || 0, b = bmap.get(c.id);
    return h('tr', {}, h('td', {}, h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: c.color } }), c.name)), h('td', { class: 'amt' }, fmt(sp)), h('td', {}, inp),
      h('td', {}, b ? h('span', { class: 'chip ' + (sp > b ? 'crit' : sp >= b * 0.85 ? 'warn' : 'good') }, sp > b ? '⚠ חריגה' : sp >= b * 0.85 ? '◔ קרוב לתקרה' : '✓ בתקציב') : null));
  });
  const name = h('input', { placeholder: 'שם קטגוריה חדשה', 'aria-label': 'שם קטגוריה' });
  const kind = h('select', { 'aria-label': 'סוג' }, h('option', { value: 'expense' }, 'הוצאה'), h('option', { value: 'income' }, 'הכנסה'), h('option', { value: 'transfer' }, 'העברה (לא נספרת)'));
  const color = h('input', { type: 'color', value: '#5c7cfa', 'aria-label': 'צבע' });
  const rec = h('label', { class: 'field', style: { flexDirection: 'row', alignItems: 'center', gap: '8px' } }, h('input', { type: 'checkbox' }), 'חוזרת מטבעה');
  const addCat = h('button', { class: 'btn primary', type: 'button' }, 'הוספת קטגוריה');
  addCat.addEventListener('click', busy(addCat, async () => { await api('POST', '/api/categories', { name: name.value, kind: kind.value, color: color.value, recurring: rec.querySelector('input').checked }); state.cats = await api('GET', '/api/categories'); toast('נוספה'); render(); }));
  const catList = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' } }, state.cats.map((c) => h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: c.color } }), c.name, c.recurring_default ? ' ↻' : '',
    !['אחר', 'הכנסה אחרת'].includes(c.name) ? h('button', { class: 'btn icon', style: { width: '22px', minHeight: '22px', fontSize: '.8rem' }, type: 'button', title: `מחיקת ${c.name}`, 'aria-label': `מחיקת ${c.name}`, onclick: async () => { if (!confirm(`למחוק את "${c.name}"? העסקאות יעברו ל"אחר".`)) return; await api('DELETE', `/api/categories/${c.id}`).catch((e) => toast(e.message, true)); state.cats = await api('GET', '/api/categories'); render(); } }, '×') : null)));

  const pat = h('input', { placeholder: 'שם בית עסק (חלק ממנו)', 'aria-label': 'תבנית' });
  const rcat = h('select', { 'aria-label': 'קטגוריה' }, catOptions(null));
  const addRule = h('button', { class: 'btn primary', type: 'button' }, 'הוספת חוק והחלה');
  addRule.addEventListener('click', busy(addRule, async () => { const r = await api('POST', '/api/rules', { pattern: pat.value, categoryId: Number(rcat.value) }); toast(`נוצר. עודכנו ${r.updated} עסקאות`); render(); }));
  const ruleRow = (r) => h('tr', {}, h('td', {}, r.pattern), h('td', {}, r.category), h('td', {}, r.sign === 'positive' ? 'הכנסה' : r.sign === 'negative' ? 'הוצאה' : ''),
    h('td', {}, h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { await api('DELETE', `/api/rules/${r.id}`); render(); } }, 'מחק')));
  const mine = rules.filter((r) => !r.builtin), builtin = rules.filter((r) => r.builtin);
  const recat = h('button', { class: 'btn', type: 'button' }, 'סיווג מחדש של הכול');
  recat.addEventListener('click', busy(recat, async () => { const r = await api('POST', '/api/rules/recategorize'); toast(`עודכנו ${r.updated} עסקאות`); }));
  view.replaceChildren(h('div', { class: 'fade-in' },
    pageHead('תקציב וקטגוריות', `ניצול ב${monthLabel(state.month)}`),
    h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, 'תקציב חודשי לכל קטגוריה'), h('p', { class: 'sub' }, 'הזן סכום; השאר ריק כדי לבטל. התקציב חל על כל חודש.'),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['קטגוריה', 'הוצא החודש', 'תקציב (₪)', ''].map((t, i) => h('th', { class: i === 1 ? 'amt' : '' }, t)))), h('tbody', {}, rows))))),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h2', {}, 'קטגוריות'), h('p', { class: 'sub' }, '↻ = חוזרת מטבעה (נספרת תמיד כהוצאה חוזרת)'), h('div', { class: 'row' }, name, kind, color, rec), h('div', { class: 'actions', style: { marginTop: '12px' } }, addCat), catList),
      h('div', { class: 'card' }, h('h2', {}, 'חוקי סיווג'), h('p', { class: 'sub' }, 'חוקים שלך קודמים לחוקים המובנים'), h('div', { class: 'row' }, pat, rcat), h('div', { class: 'actions', style: { marginTop: '12px' } }, addRule, recat),
        mine.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, mine.map(ruleRow)))) : h('p', { class: 'hint' }, 'עוד אין חוקים אישיים. תיקון קטגוריה בעסקה יציע ליצור חוק.'),
        h('details', { style: { marginTop: '12px' } }, h('summary', {}, `חוקים מובנים (${builtin.length})`), h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, builtin.map(ruleRow)))))))));
}

// ---------- יבוא ----------
async function pageImport(view) {
  const file = h('input', { type: 'file', accept: '.csv,.xlsx,.txt', 'aria-label': 'בחירת קובץ' });
  const sign = h('select', { 'aria-label': 'סימן סכומים' }, h('option', { value: 'auto' }, 'זיהוי אוטומטי'), h('option', { value: 'expenses-positive' }, 'הוצאות מופיעות כמספר חיובי (כרטיס אשראי)'), h('option', { value: 'expenses-negative' }, 'הוצאות מופיעות כמספר שלילי (בנק)'));
  const out = h('div', {});
  const go = h('button', { class: 'btn primary', type: 'button' }, 'בדיקה מקדימה');
  const url = (kind) => `/api/import/${kind}?sign=${sign.value}`;
  const send = async (kind) => { const f = file.files[0]; if (!f) throw new Error('בחר קובץ'); return api('POST', url(kind), await f.arrayBuffer(), { 'X-Filename': encodeURIComponent(f.name) }); };
  go.addEventListener('click', busy(go, async () => {
    const p = await send('preview');
    const commit = h('button', { class: 'btn primary', type: 'button' }, `ייבוא ${p.new} עסקאות חדשות`);
    commit.addEventListener('click', busy(commit, async () => { const r = await send('commit'); toast(`נוספו ${r.added}, כפולות שדולגו ${r.duplicates}`); await loadMonths(); out.replaceChildren(h('div', { class: 'banner info' }, `✓ הושלם: נוספו ${r.added}, כפולות ${r.duplicates}`)); }));
    out.replaceChildren(h('div', { class: 'card', style: { marginTop: '16px' } }, h('h3', {}, 'מה זוהה'),
      h('p', {}, `${p.count} שורות. חדשות: ${p.new}, כפולות (כבר קיימות): ${p.duplicates}${p.invalid ? `, לא תקינות: ${p.invalid}` : ''}.`),
      h('p', { class: 'hint' }, 'עמודות שזוהו: ' + Object.entries(p.columns).map(([k, v]) => `${{ date: 'תאריך', charge: 'סכום חיוב', amount: 'סכום', debit: 'חובה', credit: 'זכות', description: 'תיאור', memo: 'הערות' }[k]} ← "${v}"`).join(' · ')),
      h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, p.sample.map((r) => h('tr', {}, h('td', {}, dateLabel(r.date)), h('td', {}, r.description), h('td', { class: 'amt' }, fmt2(r.amount))))))),
      h('div', { class: 'actions', style: { marginTop: '12px' } }, commit)));
  }));
  view.replaceChildren(h('div', { class: 'fade-in' }, pageHead('יבוא קובץ', 'גיבוי ידני מקובץ שהורדת מהבנק או מחברת האשראי'),
    h('div', { class: 'grid' }, h('div', { class: 'card' }, h('div', { class: 'row' }, h('label', { class: 'field' }, 'קובץ CSV או אקסל (xlsx)', file), h('label', { class: 'field' }, 'סימן הסכומים', sign), go),
      h('p', { class: 'hint' }, 'העמודות מזוהות לפי הכותרות בעברית (תאריך עסקה, שם בית עסק, סכום חיוב, חובה/זכות...). עסקאות שכבר קיימות לא יוכפלו.'), out))));
}

// ---------- חשבונות ומשיכות ----------
async function pageAccounts(view) {
  const [st, accounts, companies, log, settings] = await Promise.all([api('GET', '/api/status'), api('GET', '/api/accounts'), api('GET', '/api/companies'), api('GET', '/api/sync/log'), api('GET', '/api/settings')]);
  state.status = st;
  const frag = h('div', { class: 'fade-in' }, pageHead('חשבונות ומשיכות', 'פרטי הכניסה נשמרים מוצפנים (AES-256) ולעולם לא יוצאים מהמחשב. הגישה לקריאה בלבד.'));
  // כספת
  if (st.vault === 'missing') {
    const a = h('input', { type: 'password', autocomplete: 'new-password' }), b = h('input', { type: 'password', autocomplete: 'new-password' });
    const ok = h('button', { class: 'btn primary', type: 'button' }, 'יצירת כספת');
    const rem2 = window.desktop ? h('label', { class: 'field', style: { flexDirection: 'row', alignItems: 'center', gap: '6px' } }, h('input', { type: 'checkbox', checked: true }), 'זכור במחשב הזה (מוצפן ע״י מערכת ההפעלה, הכספת תיפתח לבד)') : null;
    ok.addEventListener('click', busy(ok, async () => { if (a.value !== b.value) throw new Error('הסיסמאות לא זהות'); await api('POST', '/api/vault/init', { password: a.value }); if (rem2 && rem2.querySelector('input').checked) await window.desktop.rememberPassword(a.value); toast('הכספת נוצרה'); await refreshStatus(); render(); }));
    frag.append(h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, 'שלב 1: יצירת כספת מוצפנת'), h('p', { class: 'sub' }, 'בחר סיסמת-על (8 תווים לפחות). אין דרך לשחזר אותה, ובלעדיה אי אפשר לפענח את פרטי הכניסה. תוכל תמיד להזין אותם מחדש.'),
      h('div', { class: 'row' }, h('label', { class: 'field' }, 'סיסמת-על', a), h('label', { class: 'field' }, 'שוב', b), rem2, ok))));
  } else if (st.vault === 'unlocked') {
    const company = h('select', { 'aria-label': 'בנק / חברת אשראי' }, h('option', { value: '' }, 'בחר בנק או חברת אשראי...'), companies.map((c) => h('option', { value: c.id }, c.name)));
    const label = h('input', { placeholder: 'שם לחשבון, למשל: ויזה - דנה', 'aria-label': 'שם החשבון' });
    const fields = h('div', { class: 'row', style: { marginTop: '12px' } });
    let cur = null; const inputs = {};
    company.addEventListener('change', () => {
      cur = companies.find((c) => c.id === company.value); fields.replaceChildren();
      if (!cur) return;
      if (cur.needsSms) { fields.append(h('p', { class: 'hint' }, 'חשבון זה דורש קוד SMS. הגדר אותו בטרמינל: npm run set-credentials')); cur = null; return; }
      for (const f of cur.fields) { inputs[f.key] = h('input', { type: 'password', autocomplete: 'off', 'aria-label': f.label }); fields.append(h('label', { class: 'field' }, f.label, inputs[f.key])); }
    });
    const save = h('button', { class: 'btn primary', type: 'button' }, 'שמירה מוצפנת');
    save.addEventListener('click', busy(save, async () => {
      if (!cur) throw new Error('בחר חברה');
      const credentials = Object.fromEntries(cur.fields.map((f) => [f.key, inputs[f.key].value]));
      await api('POST', '/api/accounts', { label: label.value || cur.name, company: cur.id, credentials });
      Object.values(inputs).forEach((i) => (i.value = '')); toast('החשבון נשמר. אפשר ללחוץ "משוך עכשיו"'); await refreshStatus(); render();
    }));
    frag.append(h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, 'הוספת חשבון'), h('p', { class: 'sub' }, 'הפרטים מוצפנים מיד בשרת המקומי. לא נשמרים מספרי כרטיס.'), h('div', { class: 'row' }, company, label), fields, h('div', { class: 'actions', style: { marginTop: '12px' } }, save))));
  }
  frag.append(h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, `חשבונות (${accounts.length})`),
    accounts.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['שם', 'חברה', 'משיכה אחרונה', 'מצב', ''].map((t) => h('th', {}, t)))), h('tbody', {}, accounts.map((a) => h('tr', {},
      h('td', {}, a.label), h('td', {}, companies.find((c) => c.id === a.company)?.name || a.company), h('td', {}, a.last_sync ? new Date(a.last_sync).toLocaleString('he-IL') : 'טרם'),
      h('td', {}, a.last_status && a.last_status !== 'ok' ? h('span', { class: 'chip crit' }, '✘ ' + a.last_status.slice(0, 80)) : a.last_sync ? h('span', { class: 'chip good' }, '✓ תקין') : h('span', { class: 'chip' }, 'ממתין')),
      h('td', {}, h('button', { class: 'btn sm danger', type: 'button', onclick: async () => { if (!confirm(`להסיר את "${a.label}"? העסקאות הקיימות יישארו.`)) return; await api('DELETE', `/api/accounts/${a.id}`).catch((e) => toast(e.message, true)); await refreshStatus(); render(); } }, 'הסרה'))))))) : h('div', { class: 'empty' }, 'עוד לא הוגדרו חשבונות'))));
  // הגדרות
  const topic = h('input', { value: settings.ntfy_topic, placeholder: 'למשל: family-budget-x7k29q (ארוך וקשה לניחוש)', dir: 'ltr' });
  const server = h('input', { value: settings.ntfy_server, placeholder: 'https://ntfy.sh (ברירת מחדל)', dir: 'ltr' });
  const auto = h('input', { type: 'checkbox', checked: settings.auto_sync === '1' });
  const hour = h('input', { type: 'number', min: '0', max: '23', value: settings.sync_hour });
  const saveS = h('button', { class: 'btn primary', type: 'button' }, 'שמירת הגדרות');
  saveS.addEventListener('click', busy(saveS, async () => { await api('PUT', '/api/settings', { ntfy_topic: topic.value, ntfy_server: server.value, auto_sync: auto.checked ? '1' : '0', sync_hour: hour.value }); toast('נשמר'); }));
  const test = h('button', { class: 'btn', type: 'button' }, 'שליחת התראת בדיקה');
  test.addEventListener('click', busy(test, async () => { await api('POST', '/api/settings/test-notify'); toast('נשלחה'); }));
  frag.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h2', {}, 'משיכה אוטומטית והתראות'), h('div', { style: { display: 'grid', gap: '12px', marginTop: '10px' } },
      h('label', { class: 'field', style: { flexDirection: 'row', alignItems: 'center', gap: '8px' } }, auto, 'משיכה יומית בזמן שהאפליקציה פתוחה'), h('label', { class: 'field' }, 'משעה (0-23)', hour),
      h('label', { class: 'field' }, 'נושא ntfy.sh להתראת כשל (אופציונלי)', topic), h('label', { class: 'field' }, 'שרת ntfy (אופציונלי)', server),
      h('p', { class: 'hint' }, 'ההתראה כוללת רק הודעה כללית על כשל, בלי סכומים או פרטים. בלי נושא - שום בקשה לא יוצאת לאינטרנט.'), h('div', { class: 'actions' }, saveS, test))),
    h('div', { class: 'card' }, h('h2', {}, 'יומן משיכות'), log.length ? h('div', { class: 'table-wrap', style: { maxHeight: '360px', overflowY: 'auto' } }, h('table', {}, h('thead', {}, h('tr', {}, ['זמן', 'חשבון', 'תוצאה'].map((t) => h('th', {}, t)))),
      h('tbody', {}, log.map((l) => h('tr', {}, h('td', {}, new Date(l.started_at).toLocaleString('he-IL')), h('td', {}, l.account_label || ''),
        h('td', {}, l.status === 'ok' ? `✓ נוספו ${l.added}, כפולות ${l.duplicates}` : l.status === 'running' ? '… רצה' : h('span', { class: 'neg' }, '✘ ' + (l.error || '').slice(0, 140)))))))) : h('div', { class: 'empty' }, 'עדיין לא בוצעו משיכות'))));
  view.replaceChildren(frag);
}

const PAGES = { home: pageHome, recurring: pageRecurring, onetime: pageOneTime, transactions: pageTransactions, budget: pageBudget, import: pageImport, accounts: pageAccounts };

// ---------- אתחול ----------
(async function init() {
  document.getElementById('brand-mark').append(icon('coin', 20));
  document.getElementById('m-prev').append(icon('prev', 18));
  document.getElementById('m-next').append(icon('next', 18));
  document.getElementById('theme-btn').append(icon('moon', 18));
  document.getElementById('tabs').append(...ROUTES.map(([id, label, ic]) => h('a', { href: `#/${id}`, 'data-route': id }, icon(ic, 18), label)));
  document.getElementById('m-prev').addEventListener('click', () => setMonth(addMonths(state.month, -1)));
  document.getElementById('m-next').addEventListener('click', () => setMonth(addMonths(state.month, 1)));
  document.getElementById('sync-btn').addEventListener('click', doSync);
  document.getElementById('theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme; const next = !cur ? 'dark' : cur === 'dark' ? 'light' : '';
    if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
    safeStore('theme', next || 'auto'); toast(next === 'dark' ? 'מצב כהה' : next === 'light' ? 'מצב בהיר' : 'מצב אוטומטי');
  });
  window.addEventListener('hashchange', render);
  try {
    state.cats = await api('GET', '/api/categories');
    await loadMonths();
    await refreshStatus();
  } catch (e) { document.getElementById('view').replaceChildren(h('div', { class: 'card empty' }, h('h3', {}, 'לא ניתן להתחבר לשרת'), e.message)); return; }
  state.month = state.months[0] && state.months[0] <= currentMonth() ? (state.months.includes(currentMonth()) ? currentMonth() : state.months[0]) : currentMonth();
  document.getElementById('m-label').textContent = monthLabel(state.month);
  render();
  setInterval(() => { if (state.status && state.status.syncing) refreshStatus().catch(() => {}); }, 5000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
