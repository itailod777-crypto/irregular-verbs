'use strict';
// גרפים ב-SVG נקי (בלי ספריות). צבעים מגיעים ממשתני CSS, כך שמצב כהה עובד אוטומטית.
// כחול = הוצאות חוזרות, כתום = חד-פעמיות, טורקיז = הכנסות (פלטה שנבדקה ל-CVD ולניגודיות).

function tooltip(box) {
  const tip = h('div', { class: 'tip', role: 'presentation' });
  box.append(tip);
  return {
    show(x, y, title, rows) {
      tip.replaceChildren(h('b', {}, title), ...rows.map(([c, k, v]) => h('div', {}, h('span', {}, c ? h('span', { class: 'dot', style: { background: c, marginInlineEnd: '6px' } }) : null, k), h('span', { class: 'num' }, v))));
      const w = box.clientWidth;
      tip.style.top = Math.max(0, y - 10) + 'px';
      tip.style.left = Math.min(Math.max(0, x - 80), Math.max(0, w - 170)) + 'px';
      tip.classList.add('on');
    },
    hide() { tip.classList.remove('on'); },
  };
}

function niceMax(v) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const short = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}K`.replace('.0K', 'K') : String(Math.round(n)));

// עמודות מוערמות (חוזרות + חד-פעמיות) לכל חודש, וקו הכנסות. ציר זמן מימין לשמאל כמו כיוון הקריאה.
function trendChart(trend) {
  const box = h('div', { class: 'chart-box' });
  const W = 640, H = 250, L = 8, R = 44, T = 14, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(...trend.map((t) => Math.max(t.income, t.expense))));
  const y = (v) => T + ih - (v / max) * ih;
  const n = trend.length, slot = iw / n, bw = Math.min(46, slot * 0.52);
  const cx = (i) => L + iw - slot * (i + 0.5); // i=0 הישן ביותר => הכי ימני
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'מגמת 6 חודשים: הוצאות חוזרות, חד-פעמיות והכנסות' });
  for (let k = 0; k <= 4; k++) {
    const v = (max / 4) * k;
    svg.append(s('line', { x1: L, x2: W - R + 6, y1: y(v), y2: y(v), stroke: k === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
    svg.append(s('text', { x: W - R + 12, y: y(v) + 4, 'text-anchor': 'start' }, short(v)));
  }
  const tip = tooltip(box);
  const pts = [];
  trend.forEach((t, i) => {
    const x = cx(i) - bw / 2;
    const hr = (t.recurring / max) * ih, ho = (t.oneTime / max) * ih;
    const g = s('g');
    const gap = hr > 3 && ho > 3 ? 2 : 0;
    if (hr > 0.5) g.append(s('path', { d: roundTop(x, y(0) - hr, bw, hr, ho > 0.5 ? 0 : 5), fill: 'var(--s1)' }));
    if (ho > 0.5) g.append(s('path', { d: roundTop(x, y(0) - hr - ho - gap, bw, ho, 5), fill: 'var(--s2)', stroke: 'var(--surface)', 'stroke-width': 0 }));
    svg.append(g);
    svg.append(s('text', { x: cx(i), y: H - 8, 'text-anchor': 'middle', class: i === n - 1 ? 't-ink' : '' }, monthShortLabel(t.month)));
    pts.push([cx(i), y(t.income)]);
  });
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
  svg.append(s('path', { d: line, fill: 'none', stroke: 'var(--s3)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  pts.forEach(([px, py]) => svg.append(s('circle', { cx: px, cy: py, r: 5, fill: 'var(--s3)', stroke: 'var(--surface)', 'stroke-width': 2 })));
  trend.forEach((t, i) => {
    const hit = s('rect', { x: cx(i) - slot / 2, y: T, width: slot, height: ih + B, fill: 'transparent', tabindex: 0, role: 'img',
      'aria-label': `${monthLabel(t.month)}: הכנסות ${fmt(t.income)}, חוזרות ${fmt(t.recurring)}, חד-פעמיות ${fmt(t.oneTime)}` });
    const open = () => tip.show(cx(i) * (box.clientWidth / W), T, monthLabel(t.month), [
      ['var(--s3)', 'הכנסות', fmt(t.income)], ['var(--s1)', 'הוצאות חוזרות', fmt(t.recurring)], ['var(--s2)', 'חד-פעמיות', fmt(t.oneTime)], [null, 'יתרה', fmt(t.income - t.expense)]]);
    hit.addEventListener('pointerenter', open); hit.addEventListener('focus', open);
    hit.addEventListener('pointerleave', () => tip.hide()); hit.addEventListener('blur', () => tip.hide());
    svg.append(hit);
  });
  box.prepend(svg);
  box.append(legend([['var(--s1)', 'הוצאות חוזרות'], ['var(--s2)', 'הוצאות חד-פעמיות'], ['var(--s3)', 'הכנסות']]));
  return box;
}

function roundTop(x, y, w, hgt, r) {
  r = Math.min(r, hgt, w / 2);
  if (r <= 0) return `M${x},${y} h${w} v${hgt} h${-w} z`;
  return `M${x},${y + hgt} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + hgt} z`;
}

function legend(items) {
  return h('div', { class: 'legend' }, items.map(([c, t]) => h('span', {}, h('span', { class: 'dot', style: { background: c } }), t)));
}

// טבלה חלופית לגרף (נגישות)
function trendTable(trend) {
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['חודש', 'הכנסות', 'חוזרות', 'חד-פעמיות', 'יתרה'].map((t, i) => h('th', { class: i ? 'amt' : '' }, t)))),
    h('tbody', {}, trend.map((t) => h('tr', {}, h('td', {}, monthLabel(t.month)), h('td', { class: 'amt' }, fmt(t.income)), h('td', { class: 'amt' }, fmt(t.recurring)), h('td', { class: 'amt' }, fmt(t.oneTime)), h('td', { class: 'amt ' + (t.income - t.expense >= 0 ? 'pos' : 'neg') }, fmt(t.income - t.expense)))))));
}

// טבעת: חוזר מול חד-פעמי
function splitDonut(recurring, oneTime) {
  const total = recurring + oneTime;
  const box = h('div', { class: 'chart-box', style: { width: '190px', flex: 'none' } });
  const S = 190, c = S / 2, r = 72, sw = 26, C = 2 * Math.PI * r;
  const svg = s('svg', { viewBox: `0 0 ${S} ${S}`, role: 'img', 'aria-label': `חוזרות ${fmt(recurring)} מול חד-פעמיות ${fmt(oneTime)}` });
  svg.append(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': sw }));
  if (total > 0) {
    const a = (recurring / total) * C, gap = recurring > 0 && oneTime > 0 ? 3 : 0;
    const seg = (len, off, color) => s('circle', { cx: c, cy: c, r, fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-dasharray': `${Math.max(0, len - gap)} ${C}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${c} ${c})`, 'stroke-linecap': 'butt' });
    if (recurring > 0) svg.append(seg(a, 0, 'var(--s1)'));
    if (oneTime > 0) svg.append(seg(C - a, a, 'var(--s2)'));
  }
  svg.append(s('text', { x: c, y: c - 2, 'text-anchor': 'middle', class: 't-ink', style: 'font-size:12px' }, 'סה״כ הוצאות'));
  svg.append(s('text', { x: c, y: c + 22, 'text-anchor': 'middle', style: 'font-size:22px;font-weight:800;fill:var(--ink)' }, fmt(total)));
  box.append(svg);
  return box;
}

function splitBar(recurring, oneTime) {
  const total = recurring + oneTime || 1;
  return h('div', {}, h('div', { class: 'splitbar', role: 'img', 'aria-label': `חוזרות ${pct(recurring / total)}, חד-פעמיות ${pct(oneTime / total)}` },
    h('i', { style: { flex: `${recurring} 1 0`, background: 'var(--s1)' } }), h('i', { style: { flex: `${oneTime} 1 0`, background: 'var(--s2)' } })));
}

function sparkline(values, color = 'var(--s1)') {
  const W = 84, H = 26, max = Math.max(...values, 1);
  const n = values.length;
  const pts = values.map((v, i) => [W - 3 - (i * (W - 6)) / (n - 1), H - 3 - (v / max) * (H - 8)]);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'מגמה 6 חודשים' });
  svg.append(s('path', { d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  const [lx, ly] = pts[0];
  svg.append(s('circle', { cx: lx, cy: ly, r: 3.5, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }));
  return svg;
}

// עמודות אופקיות: שם, סכום, פס; אם יש תקציב - צבע לפי ניצול
function categoryBars(items, { onlyTop = 8, total } = {}) {
  const list = items.filter((i) => i.total > 0 || i.budget).slice(0, onlyTop);
  const max = Math.max(...list.map((i) => Math.max(i.total, i.budget || 0)), 1);
  const sum = total ?? items.reduce((a, b) => a + b.total, 0);
  if (!list.length) return h('div', { class: 'empty' }, 'אין עדיין הוצאות בחודש הזה');
  return h('div', { class: 'bars' }, list.map((i) => {
    const hasB = !!i.budget;
    const state = hasB ? (i.pct > 1 ? 'crit' : i.pct >= 0.85 ? 'warn' : 'good') : '';
    const label = hasB ? (i.pct > 1 ? `חריגה של ${fmt(i.total - i.budget)}` : `נותרו ${fmt(i.budget - i.total)}`) : `${pct(i.total / (sum || 1))} מההוצאות`;
    return h('div', { class: 'bar-row' },
      h('div', { class: 'name' }, h('span', { class: 'dot', style: { background: i.color } }), h('span', {}, i.name)),
      h('div', { class: 'val num' }, fmt(i.total), hasB ? h('span', { style: { color: 'var(--ink-2)', fontWeight: 500 } }, ` / ${fmt(i.budget)}`) : null),
      h('div', { class: 'track', role: 'progressbar', 'aria-valuenow': Math.round(i.total), 'aria-valuemin': 0, 'aria-valuemax': Math.round(hasB ? i.budget : max), 'aria-label': i.name },
        h('div', { class: 'fill ' + state, style: { width: `${Math.min(100, (i.total / (hasB ? Math.max(i.budget, i.total) : max)) * 100)}%` } })),
      h('div', { class: 'bar-meta' }, h('span', {}, state === 'crit' ? '⚠ ' + label : label), hasB ? h('span', {}, pct(i.pct)) : h('span', {}, `${i.count} עסקאות`)));
  }));
}
