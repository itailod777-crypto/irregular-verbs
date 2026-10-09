'use strict';
(async () => {
  document.getElementById('print').addEventListener('click', () => window.print());
  const month = new URLSearchParams(location.search).get('month') || currentMonth();
  const root = document.getElementById('report');
  try {
    const [sum, rec, one] = await Promise.all([api('GET', `/api/summary?month=${month}`), api('GET', `/api/recurring?month=${month}`), api('GET', `/api/onetime?month=${month}`)]);
    const pos = (n) => (n >= 0 ? 'pos' : 'neg');
    root.append(
      h('h1', { style: { margin: '0 0 4px' } }, `סיכום חודשי: ${monthLabel(month)}`),
      h('p', { class: 'sub' }, `הופק ב-${new Date().toLocaleDateString('he-IL')}`),
      h('div', { class: 'grid g3' },
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'הכנסות'), h('div', { class: 'value num' }, fmt(sum.income))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'הוצאות'), h('div', { class: 'value num' }, fmt(sum.expense))),
        h('div', { class: 'card stat' }, h('div', { class: 'label' }, 'יתרה'), h('div', { class: `value num ${pos(sum.balance)}` }, fmt(sum.balance)))),
      h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, 'חוזרות מול חד-פעמיות'), splitBar(sum.split.recurring, sum.split.oneTime),
        h('div', { class: 'legend' }, h('span', {}, h('span', { class: 'dot', style: { background: 'var(--s1)' } }), `חוזרות ${fmt(sum.split.recurring)}`), h('span', {}, h('span', { class: 'dot', style: { background: 'var(--s2)' } }), `חד-פעמיות ${fmt(sum.split.oneTime)}`)))),
      h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, 'מגמה של 6 חודשים'), trendChart(sum.trend), trendTable(sum.trend))),
      h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, 'הוצאות לפי קטגוריה'), categoryBars(sum.expenses, { onlyTop: 20, total: sum.expense }))),
      h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, 'הוצאות חוזרות'), rec.items.length ? h('table', {}, h('tbody', {}, rec.items.map((i) => h('tr', {}, h('td', {}, i.name), h('td', {}, i.category), h('td', { class: 'amt' }, fmt(i.thisMonth || i.average)))))) : 'אין')),
      h('div', { class: 'grid' }, h('div', { class: 'card' }, h('h2', {}, 'ההוצאות החד-פעמיות הגדולות'), one.items.length ? h('table', {}, h('tbody', {}, one.items.slice(0, 12).map((i) => h('tr', {}, h('td', {}, dateLabel(i.date)), h('td', {}, i.description), h('td', {}, i.category), h('td', { class: 'amt' }, fmt2(-i.amount)))))) : 'אין')));
  } catch (e) { root.append(h('div', { class: 'card empty' }, e.message)); }
})();
