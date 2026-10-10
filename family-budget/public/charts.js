'use strict';
// גרפים ב-SVG נקי (בלי ספריות). כל גרף נצייר לפי הרוחב האמיתי של המסך, כך שהטקסט תמיד קריא.
// צבעים: כחול = קבועות, כתום = חד-פעמיות, טורקיז = הכנסות (פלטה שנבדקה ל-CVD ולניגודיות).

// עוטף גרף: מצייר מחדש כשהרוחב משתנה (חלון, סיבוב טלפון)
function mountChart(draw) {
  const box = h('div', { class: 'chart-box' });
  let last = 0;
  const run = () => { const w = Math.floor(box.clientWidth); if (w > 0 && w !== last) { last = w; box.replaceChildren(draw(Math.max(w, 260), box)); } };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(run).observe(box); else requestAnimationFrame(run);
  return box;
}

function tooltip(box) {
  const tip = h('div', { class: 'tip', role: 'presentation' });
  box.append(tip);
  return {
    show(x, y, title, rows) {
      tip.replaceChildren(h('b', {}, title), ...rows.map(([c, k, v]) => h('div', {}, h('span', {}, c ? h('span', { class: 'dot', style: { background: c, marginInlineEnd: '6px' } }) : null, k), h('span', { class: 'num' }, v))));
      const w = box.clientWidth;
      tip.style.top = Math.max(0, y - 6) + 'px';
      tip.style.left = Math.min(Math.max(0, x - 85), Math.max(0, w - 180)) + 'px';
      tip.classList.add('on');
    },
    hide() { tip.classList.remove('on'); },
  };
}
function niceMax(v) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const short = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}K`.replace('.0K', 'K') : String(Math.round(n)));
function legend(items) { return h('div', { class: 'legend' }, items.map(([c, t, dashed]) => h('span', {}, h('span', { class: dashed ? 'dot dash' : 'dot', style: { background: dashed ? 'transparent' : c, borderColor: c } }), t))); }
function roundTop(x, y, w, hgt, r) {
  r = Math.min(r, hgt, w / 2);
  if (r <= 0) return `M${x},${y} h${w} v${hgt} h${-w} z`;
  return `M${x},${y + hgt} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + hgt} z`;
}
function axisY(svg, W, L, R, T, ih, max, ticks = 4) {
  for (let k = 0; k <= ticks; k++) {
    const v = (max / ticks) * k, y = T + ih - (v / max) * ih;
    svg.append(s('line', { x1: L, x2: W - R + 4, y1: y, y2: y, stroke: k === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
    svg.append(s('text', { x: W - R + 10, y: y + 4, 'text-anchor': 'start' }, short(v)));
  }
}

// 6 חודשים: עמודות מוערמות (קבועות + חד-פעמיות) וקו הכנסות. החודש הישן ביותר מימין, כמו כיוון הקריאה.
function trendChart(trend) {
  const wrap = h('div', {}, mountChart((W, box) => {
    const H = 270, L = 6, R = 44, T = 18, B = 32, iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(...trend.map((t) => Math.max(t.income, t.expense))));
    const y = (v) => T + ih - (v / max) * ih;
    const n = trend.length, slot = iw / n, bw = Math.min(46, slot * 0.56), cx = (i) => L + iw - slot * (i + 0.5);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'הכנסות מול הוצאות קבועות וחד-פעמיות ב-6 חודשים' });
    axisY(svg, W, L, R, T, ih, max);
    const tip = tooltip(box), pts = [];
    trend.forEach((t, i) => {
      const x = cx(i) - bw / 2, hr = (t.recurring / max) * ih, ho = (t.oneTime / max) * ih, gap = hr > 3 && ho > 3 ? 2 : 0;
      if (hr > 0.5) svg.append(s('path', { d: roundTop(x, y(0) - hr, bw, hr, ho > 0.5 ? 0 : 5), fill: 'var(--s1)' }));
      if (ho > 0.5) svg.append(s('path', { d: roundTop(x, y(0) - hr - ho - gap, bw, ho, 5), fill: 'var(--s2)' }));
      svg.append(s('text', { x: cx(i), y: H - 9, 'text-anchor': 'middle', class: i === n - 1 ? 't-ink' : '' }, monthShortLabel(t.month)));
      pts.push([cx(i), y(t.income)]);
    });
    svg.append(s('path', { d: pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' '), fill: 'none', stroke: 'var(--s3)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    pts.forEach(([px, py]) => svg.append(s('circle', { cx: px, cy: py, r: 5, fill: 'var(--s3)', stroke: 'var(--surface)', 'stroke-width': 2 })));
    trend.forEach((t, i) => {
      const hit = s('rect', { x: cx(i) - slot / 2, y: T, width: slot, height: ih + B, fill: 'transparent', tabindex: 0, role: 'img', 'aria-label': `${monthLabel(t.month)}: נכנס ${fmt(t.income)}, קבועות ${fmt(t.recurring)}, חד-פעמיות ${fmt(t.oneTime)}` });
      const open = () => tip.show(cx(i), T, monthLabel(t.month), [['var(--s3)', 'נכנס', fmt(t.income)], ['var(--s1)', 'הוצאות קבועות', fmt(t.recurring)], ['var(--s2)', 'חד-פעמיות', fmt(t.oneTime)], [null, 'נשאר', fmt(t.income - t.expense)]]);
      hit.addEventListener('pointerenter', open); hit.addEventListener('focus', open);
      hit.addEventListener('pointerleave', () => tip.hide()); hit.addEventListener('blur', () => tip.hide());
      svg.append(hit);
    });
    const frag = document.createDocumentFragment(); frag.append(svg); return frag;
  }));
  return h('div', {}, wrap, legend([['var(--s3)', 'נכנס'], ['var(--s1)', 'הוצאות קבועות'], ['var(--s2)', 'הוצאות חד-פעמיות']]));
}

function trendTable(trend) {
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['חודש', 'נכנס', 'קבועות', 'חד-פעמיות', 'נשאר'].map((t, i) => h('th', { class: i ? 'amt' : '' }, t)))),
    h('tbody', {}, trend.map((t) => h('tr', {}, h('td', {}, monthLabel(t.month)), h('td', { class: 'amt' }, fmt(t.income)), h('td', { class: 'amt' }, fmt(t.recurring)), h('td', { class: 'amt' }, fmt(t.oneTime)), h('td', { class: 'amt ' + (t.income - t.expense >= 0 ? 'pos' : 'neg') }, fmt(t.income - t.expense)))))));
}

// קצב ההוצאה: הסכום המצטבר החודש מול החודש הקודם, יום אחרי יום
function paceChart(ins) {
  const box = mountChart((W, bx) => {
    const H = 250, L = 6, R = 44, T = 18, B = 30, iw = W - L - R, ih = H - T - B, D = Math.max(ins.daysInMonth, ins.previous.length);
    const max = niceMax(Math.max(...ins.current, ...ins.previous, 1));
    const x = (d) => L + iw - (iw * (d - 1)) / (D - 1), y = (v) => T + ih - (v / max) * ih;
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'הוצאה מצטברת החודש מול החודש הקודם' });
    axisY(svg, W, L, R, T, ih, max);
    for (const d of [1, 5, 10, 15, 20, 25, 30]) if (d <= D) svg.append(s('text', { x: x(d), y: H - 9, 'text-anchor': 'middle' }, String(d)));
    const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1)},${y(v)}`).join(' ');
    svg.append(s('path', { d: path(ins.previous), fill: 'none', stroke: 'var(--muted)', 'stroke-width': 2, 'stroke-dasharray': '5 5', 'stroke-linecap': 'round' }));
    if (ins.current.length) {
      const area = `${path(ins.current)} L${x(ins.current.length)},${y(0)} L${x(1)},${y(0)} Z`;
      svg.append(s('path', { d: area, fill: 'var(--s1)', opacity: 0.12 }));
      svg.append(s('path', { d: path(ins.current), fill: 'none', stroke: 'var(--s1)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      const last = ins.current.length;
      svg.append(s('circle', { cx: x(last), cy: y(ins.current[last - 1]), r: 6, fill: 'var(--s1)', stroke: 'var(--surface)', 'stroke-width': 2.5 }));
    }
    const tip = tooltip(bx);
    const hit = s('rect', { x: L, y: T, width: iw, height: ih + B, fill: 'transparent' });
    hit.addEventListener('pointermove', (e) => {
      const r = hit.getBoundingClientRect(), d = Math.min(D, Math.max(1, Math.round(1 + ((r.right - e.clientX) / r.width) * (D - 1))));
      tip.show(x(d), y(ins.current[d - 1] ?? ins.previous[d - 1] ?? 0), `יום ${d} בחודש`, [
        ['var(--s1)', 'החודש', ins.current[d - 1] !== undefined ? fmt(ins.current[d - 1]) : '—'], ['var(--muted)', 'חודש קודם', ins.previous[d - 1] !== undefined ? fmt(ins.previous[d - 1]) : '—']]);
    });
    hit.addEventListener('pointerleave', () => tip.hide());
    svg.append(hit);
    const frag = document.createDocumentFragment(); frag.append(svg); return frag;
  });
  return h('div', {}, box, legend([['var(--s1)', 'החודש הזה'], ['var(--muted)', 'החודש הקודם', true]]));
}

// עמודות פשוטות לפי חודש (לסכום קבוע/חד-פעמי)
function barTrend(items, color) {
  return mountChart((W, box) => {
    const H = 210, L = 6, R = 6, T = 22, B = 28, iw = W - L - R, ih = H - T - B, max = niceMax(Math.max(...items.map((t) => t.total)));
    const slot = iw / items.length, bw = Math.min(40, slot * 0.6), tip = tooltip(box);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'סכום לפי חודש' });
    svg.append(s('line', { x1: L, x2: W - R, y1: T + ih, y2: T + ih, stroke: 'var(--axis)' }));
    items.forEach((t, i) => {
      const cx = L + iw - slot * (i + 0.5), hh = (t.total / max) * ih;
      if (hh > 0.5) svg.append(s('path', { d: roundTop(cx - bw / 2, T + ih - hh, bw, hh, 5), fill: color, opacity: i === items.length - 1 ? 1 : 0.75 }));
      svg.append(s('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: i === items.length - 1 ? 't-ink' : '' }, monthShortLabel(t.month)));
      if (t.total > 0) svg.append(s('text', { x: cx, y: T + ih - hh - 6, 'text-anchor': 'middle', class: 't-ink' }, short(t.total)));
      const hit = s('rect', { x: cx - slot / 2, y: T, width: slot, height: ih + B, fill: 'transparent' });
      hit.addEventListener('pointerenter', () => tip.show(cx, T, monthLabel(t.month), [[color, 'סה״כ', fmt(t.total)]]));
      hit.addEventListener('pointerleave', () => tip.hide());
      svg.append(hit);
    });
    const frag = document.createDocumentFragment(); frag.append(svg); return frag;
  });
}

function splitDonut(recurring, oneTime) {
  const total = recurring + oneTime, box = h('div', { class: 'chart-box', style: { width: '190px', flex: 'none' } });
  const S = 190, c = S / 2, r = 72, sw = 26, C = 2 * Math.PI * r;
  const svg = s('svg', { viewBox: `0 0 ${S} ${S}`, width: S, height: S, role: 'img', 'aria-label': `קבועות ${fmt(recurring)} מול חד-פעמיות ${fmt(oneTime)}` });
  svg.append(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': sw }));
  if (total > 0) {
    const a = (recurring / total) * C, gap = recurring > 0 && oneTime > 0 ? 3 : 0;
    const seg = (len, off, color) => s('circle', { cx: c, cy: c, r, fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-dasharray': `${Math.max(0, len - gap)} ${C}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${c} ${c})` });
    if (recurring > 0) svg.append(seg(a, 0, 'var(--s1)'));
    if (oneTime > 0) svg.append(seg(C - a, a, 'var(--s2)'));
  }
  svg.append(s('text', { x: c, y: c - 2, 'text-anchor': 'middle', class: 't-ink' }, 'סה״כ יצא'));
  svg.append(s('text', { x: c, y: c + 22, 'text-anchor': 'middle', style: 'font-size:22px;font-weight:800;fill:var(--ink)' }, fmt(total)));
  box.append(svg);
  return box;
}
function splitBar(recurring, oneTime) {
  const total = recurring + oneTime || 1;
  return h('div', { class: 'splitbar', role: 'img', 'aria-label': `קבועות ${pct(recurring / total)}, חד-פעמיות ${pct(oneTime / total)}` },
    h('i', { style: { flex: `${recurring} 1 0`, background: 'var(--s1)' } }), h('i', { style: { flex: `${oneTime} 1 0`, background: 'var(--s2)' } }));
}
function sparkline(values, color = 'var(--s1)', ring = 'var(--surface)', w = 84, hgt = 26) {
  const W = w, H = hgt, max = Math.max(...values, 1), n = values.length;
  const pts = values.map((v, i) => [W - 3 - (i * (W - 6)) / (n - 1), H - 3 - (Math.max(v, 0) / max) * (H - 8)]);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'מגמה 6 חודשים' });
  svg.append(s('path', { d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  svg.append(s('circle', { cx: pts[0][0], cy: pts[0][1], r: 3.5, fill: color, stroke: ring, 'stroke-width': 2 }));
  return svg;
}

// עמודות אופקיות לפי קטגוריה; אם יש תקציב, הצבע לפי הניצול
function categoryBars(items, { onlyTop = 8, total } = {}) {
  const list = items.filter((i) => i.total > 0 || i.budget).slice(0, onlyTop);
  const max = Math.max(...list.map((i) => Math.max(i.total, i.budget || 0)), 1);
  const sum = total ?? items.reduce((a, b) => a + b.total, 0);
  if (!list.length) return h('div', { class: 'empty' }, 'עדיין אין הוצאות בחודש הזה');
  return h('div', { class: 'bars' }, list.map((i) => {
    const hasB = !!i.budget, state = hasB ? (i.pct > 1 ? 'crit' : i.pct >= 0.85 ? 'warn' : 'good') : '';
    const label = hasB ? (i.pct > 1 ? `חרגתם ב-${fmt(i.total - i.budget)}` : `נשארו ${fmt(i.budget - i.total)}`) : `${pct(i.total / (sum || 1))} מכלל ההוצאות`;
    return h('div', { class: 'bar-row' },
      h('div', { class: 'name' }, h('span', { class: 'dot', style: { background: i.color } }), h('span', {}, i.name)),
      h('div', { class: 'val num' }, fmt(i.total), hasB ? h('span', { class: 'of' }, ` מתוך ${fmt(i.budget)}`) : null),
      h('div', { class: 'track', role: 'progressbar', 'aria-valuenow': Math.round(i.total), 'aria-valuemin': 0, 'aria-valuemax': Math.round(hasB ? i.budget : max), 'aria-label': i.name },
        h('div', { class: 'fill ' + state, style: { width: `${Math.min(100, (i.total / (hasB ? Math.max(i.budget, i.total) : max)) * 100)}%` } })),
      h('div', { class: 'bar-meta' }, h('span', {}, state === 'crit' ? '⚠ ' + label : label), hasB ? h('span', {}, pct(i.pct)) : h('span', {}, i.count != null ? `${i.count} עסקאות` : '')));
  }));
}

// רשימת דירוג פשוטה (בתי עסק / כרטיסים)
function rankBars(items, unitLabel = 'עסקאות') {
  const max = Math.max(...items.map((i) => i.total), 1);
  if (!items.length) return h('div', { class: 'empty' }, 'עדיין אין נתונים');
  return h('div', { class: 'bars' }, items.map((i, idx) => h('div', { class: 'bar-row' },
    h('div', { class: 'name' }, h('span', { class: 'rank' }, idx + 1), h('span', {}, i.name || i.label)),
    h('div', { class: 'val num' }, fmt(i.total)),
    h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${(i.total / max) * 100}%` } })),
    i.count ? h('div', { class: 'bar-meta' }, h('span', {}, `${i.count} ${unitLabel}`)) : null)));
}

// מפת חום של החודש: כל ריבוע הוא יום, וככל שהצבע כהה יותר יצא יותר כסף באותו יום
function heatmapCalendar(ins) {
  const max = Math.max(...ins.daily, 1), names = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  const grid = h('div', { class: 'heat', role: 'img', 'aria-label': 'הוצאה לפי יום בחודש' }, names.map((n) => h('div', { class: 'heat-h' }, n)));
  for (let i = 0; i < ins.firstWeekday; i++) grid.append(h('div', { class: 'heat-cell empty' }));
  ins.daily.forEach((v, i) => {
    const day = i + 1, future = ins.todayDay && day > ins.todayDay;
    const pctv = v > 0 ? Math.round(16 + 84 * Math.sqrt(v / max)) : 0;
    const cell = h('div', { class: 'heat-cell' + (future ? ' future' : '') + (ins.todayDay === day ? ' today' : ''), title: `${day} בחודש: ${v > 0 ? fmt(v) : 'לא יצא כסף'}`,
      style: { background: pctv ? `color-mix(in srgb, var(--s1) ${pctv}%, var(--surface-2))` : 'var(--surface-2)', color: pctv > 55 ? '#fff' : 'var(--ink)' } },
    h('b', {}, day), v > 0 ? h('small', {}, short(v)) : null);
    grid.append(cell);
  });
  return h('div', {}, grid, h('div', { class: 'heat-legend' }, h('span', {}, 'פחות'), h('i', {}), h('span', {}, 'יותר')));
}

// ממוצע הוצאה לפי יום בשבוע
function weekdayChart(weekday) {
  const names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return mountChart((W, box) => {
    const H = 210, L = 6, R = 6, T = 24, B = 28, iw = W - L - R, ih = H - T - B, max = niceMax(Math.max(...weekday, 1)), slot = iw / 7, bw = Math.min(34, slot * 0.62);
    const top = weekday.indexOf(Math.max(...weekday)), tip = tooltip(box);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'ממוצע הוצאה לפי יום בשבוע' });
    svg.append(s('line', { x1: L, x2: W - R, y1: T + ih, y2: T + ih, stroke: 'var(--axis)' }));
    weekday.forEach((v, i) => {
      const cx = L + iw - slot * (i + 0.5), hh = (v / max) * ih;
      if (hh > 0.5) svg.append(s('path', { d: roundTop(cx - bw / 2, T + ih - hh, bw, hh, 5), fill: 'var(--s1)', opacity: i === top ? 1 : 0.55 }));
      svg.append(s('text', { x: cx, y: H - 9, 'text-anchor': 'middle', class: i === top ? 't-ink' : '' }, W > 420 ? names[i] : names[i].slice(0, 2)));
      if (i === top && v > 0) svg.append(s('text', { x: cx, y: T + ih - hh - 6, 'text-anchor': 'middle', class: 't-ink' }, short(v)));
      const hit = s('rect', { x: cx - slot / 2, y: T, width: slot, height: ih + B, fill: 'transparent' });
      hit.addEventListener('pointerenter', () => tip.show(cx, T, `יום ${names[i]}`, [['var(--s1)', 'ממוצע ליום', fmt(v)]]));
      hit.addEventListener('pointerleave', () => tip.hide());
      svg.append(hit);
    });
    const frag = document.createDocumentFragment(); frag.append(svg); return frag;
  });
}

// 12 חודשים: עמודות הוצאה וקו הכנסה
function yearChart(months) {
  const wrap = mountChart((W, box) => {
    const H = 270, L = 6, R = 44, T = 18, B = 32, iw = W - L - R, ih = H - T - B, max = niceMax(Math.max(...months.map((m) => Math.max(m.income, m.expense)), 1));
    const y = (v) => T + ih - (v / max) * ih, slot = iw / 12, bw = Math.min(30, slot * 0.62), cx = (i) => L + iw - slot * (i + 0.5), tip = tooltip(box);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'הכנסות והוצאות ב-12 חודשים' });
    axisY(svg, W, L, R, T, ih, max);
    const pts = [];
    months.forEach((m, i) => {
      const hh = (m.expense / max) * ih;
      if (hh > 0.5) svg.append(s('path', { d: roundTop(cx(i) - bw / 2, y(0) - hh, bw, hh, 4), fill: 'var(--exp)', opacity: m.hasData ? 1 : 0.3 }));
      svg.append(s('text', { x: cx(i), y: H - 9, 'text-anchor': 'middle' }, monthShortLabel(m.month)));
      if (m.income > 0) pts.push([cx(i), y(m.income)]);
      const hit = s('rect', { x: cx(i) - slot / 2, y: T, width: slot, height: ih + B, fill: 'transparent' });
      hit.addEventListener('pointerenter', () => tip.show(cx(i), T, monthLabel(m.month), [['var(--s3)', 'נכנס', fmt(m.income)], ['var(--exp)', 'יצא', fmt(m.expense)], [null, 'נשאר', fmt(m.balance)]]));
      hit.addEventListener('pointerleave', () => tip.hide());
      svg.append(hit);
    });
    if (pts.length) {
      svg.append(s('path', { d: pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' '), fill: 'none', stroke: 'var(--s3)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      pts.forEach(([px, py]) => svg.append(s('circle', { cx: px, cy: py, r: 4.5, fill: 'var(--s3)', stroke: 'var(--surface)', 'stroke-width': 2 })));
    }
    const frag = document.createDocumentFragment(); frag.append(svg); return frag;
  });
  return h('div', {}, wrap, legend([['var(--s3)', 'נכנס'], ['var(--exp)', 'יצא']]));
}

// טבלת 6 החודשים במספרים
function monthsTable(trend) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'dense' },
    h('thead', {}, h('tr', {}, ['חודש', 'נכנס', 'יצא', 'נשאר', 'חיסכון'].map((t, i) => h('th', { class: i ? 'amt' : '' }, t)))),
    h('tbody', {}, [...trend].reverse().map((t, idx) => {
      const left = t.income - t.expense, rate = t.income > 0 ? left / t.income : null;
      return h('tr', { class: idx === 0 ? 'cur-row' : '' }, h('td', { class: 'nowrap', title: monthLabel(t.month) }, `${monthShortLabel(t.month)} ${t.month.slice(2, 4)}`), h('td', { class: 'amt' }, t.income ? fmt(t.income) : '—'), h('td', { class: 'amt' }, fmt(t.expense)),
        h('td', { class: 'amt ' + (t.income ? (left >= 0 ? 'pos' : 'neg') : '') }, t.income ? fmt(left) : '—'), h('td', { class: 'amt' }, rate === null ? '—' : h('span', { class: 'chip ' + (rate >= 0.1 ? 'good' : rate >= 0 ? 'warn' : 'crit') }, pct(rate))));
    }))));
}

// טבלת "מה השתנה" לכל קטגוריה מול החודש הקודם
function deltaTable(items) {
  if (!items.length) return h('div', { class: 'empty small' }, 'עדיין אין נתונים להשוואה');
  return h('div', { class: 'table-wrap' }, h('table', { class: 'dense' },
    h('thead', {}, h('tr', {}, ['קטגוריה', 'החודש', 'חודש קודם', 'שינוי'].map((t, i) => h('th', { class: i ? 'amt' : '' }, t)))),
    h('tbody', {}, items.map((c) => {
      const up = c.delta > 0.5, down = c.delta < -0.5;
      return h('tr', {}, h('td', {}, h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: c.color } }), c.name)), h('td', { class: 'amt' }, fmt(c.cur)), h('td', { class: 'amt muted' }, c.prev ? fmt(c.prev) : '—'),
        h('td', { class: 'amt ' + (up ? 'neg' : down ? 'pos' : '') }, up ? `▲ ${fmt(c.delta)}` : down ? `▼ ${fmt(-c.delta)}` : '='));
    }))));
}
