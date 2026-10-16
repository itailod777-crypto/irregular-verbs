// ---------- חשבונות ויתרות (עמוד נפרד, נטען אחרי app.js) ----------
// משתמש בעזרים של app.js: h, api, fmt, fmt2, card, pageHead.
(function () {
  const HE_MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'];
  const nextChargeDate = (day, now = new Date()) => {
    if (!day) return null;
    let d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return d;
  };
  const monthYear = (iso) => (iso ? `${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : '');
  const bar = (value, max, cls) => h('div', { class: 'goal-track ov-track', role: 'img', 'aria-label': `${Math.round((value / (max || 1)) * 100)}%` },
    h('div', { class: `goal-fill ${cls || ''}`, style: { width: `${Math.min(100, Math.max(0, (value / (max || 1)) * 100))}%` } }));

  async function pageOverview(view) {
    const ov = await api('GET', '/api/overview');
    const frag = h('div', { class: 'fade-in' });
    const updated = ov.updatedAt ? `עודכן ${new Date(ov.updatedAt).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
    frag.append(pageHead('חשבונות ויתרות', 'כל הכסף שלכם במקום אחד: יתרה, חיובי כרטיסים צפויים, משכנתאות והלוואות.', updated ? h('span', { class: 'chip' }, updated) : null));
    if (!ov.hasData) {
      frag.append(h('div', { class: 'card empty' }, h('h3', {}, 'עוד אין יתרות'), 'היתרות מגיעות מ-Financy. לחצו "עדכן עכשיו" אחרי שחיברתם את Financy בעמוד "כרטיסים וחשבונות".'));
      view.replaceChildren(frag);
      return;
    }
    const t = ov.totals;
    frag.append(h('div', { class: 'card status-card tone-ok' },
      h('div', { class: 'verdict' }, h('div', { class: 'verdict-ic' }, '₪'),
        h('div', {}, h('div', { class: 'verdict-title' }, `בעו"ש יש ${fmt(t.cash)}`),
          h('div', { class: 'verdict-text' }, t.cardsDue > 0 ? `אחרי חיובי הכרטיסים הקרובים (${fmt(t.cardsDue)}) יישארו ${fmt(t.afterCards)}.` : 'אין חיובי כרטיסים קרובים.'))),
      h('div', { class: 'trio' },
        h('div', { class: 'big' }, h('div', { class: 'big-label' }, 'יתרה בעו"ש'), h('div', { class: 'big-value num' }, fmt(t.cash)),
          h('div', { class: 'big-note' }, ov.checking[0] && ov.checking[0].creditLimit ? `מסגרת אשראי ${fmt(ov.checking[0].creditLimit)}` : '')),
        h('div', { class: 'big' }, h('div', { class: 'big-label' }, 'חיובי כרטיסים צפויים'), h('div', { class: 'big-value num' }, fmt(t.cardsDue)),
          h('div', { class: 'big-note' }, `${ov.cards.length} כרטיסים פעילים`)),
        h('div', { class: 'big' }, h('div', { class: 'big-label' }, 'חוב משכנתאות והלוואות'), h('div', { class: 'big-value num' }, fmt(t.debt)),
          h('div', { class: 'big-note' }, ov.debtPayments.amount ? `משלמים כ-${fmt(ov.debtPayments.amount)} בחודש` : '')))));

    const cardTiles = ov.cards.map((c) => {
      const d = nextChargeDate(c.chargeDay);
      const used = c.creditLimit && c.available != null ? c.creditLimit - c.available : 0;
      return h('div', { class: 'acct-card' },
        h('div', { class: 'acct-top' }, h('span', { class: 'acct-name' }, `${c.provider} ${c.product && !/חיוב נדחה/.test(c.product) ? c.product : 'כרטיס'} ·${c.last4}`)),
        h('div', { class: 'lc-value num' }, fmt(c.nextCharge)),
        h('div', { class: 'sc-meta' }, d ? `יורד מהעו"ש ב-${d.getDate()} ${HE_MONTHS[d.getMonth()]}` : 'החיוב הבא'),
        c.creditLimit ? bar(used, c.creditLimit, 'ov-fill-card') : null,
        c.creditLimit ? h('div', { class: 'sc-meta' }, `מסגרת ${fmt(c.creditLimit)}${c.available != null ? `, פנוי ${fmt(c.available)}` : ''}`) : null);
    });
    frag.append(h('div', { class: 'grid' }, card('כרטיסי אשראי', `החיוב הבא בכל כרטיס.${ov.blockedCards ? ` ${ov.blockedCards} כרטיסים חסומים לא מוצגים.` : ''}`, h('div', { class: 'acct-grid' }, ...cardTiles))));

    const mort = ov.mortgages.map((m) => h('details', { class: 'ov-mort' },
      h('summary', {}, h('span', { class: 'ov-sum-name' }, `משכנתא ·${m.last4}`), h('span', { class: 'spacer' }),
        m.endDate ? h('span', { class: 'chip' }, `עד ${monthYear(m.endDate)}`) : null, h('strong', { class: 'num' }, fmt(m.balance))),
      m.tracks.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'dense' },
          h('thead', {}, h('tr', {}, h('th', {}, 'מסלול'), h('th', {}, 'ריבית'), h('th', {}, 'עד'), h('th', { class: 'amt' }, 'יתרה'))),
          h('tbody', {}, m.tracks.map((tr, i) => h('tr', {}, h('td', {}, `מסלול ${i + 1}`), h('td', { class: 'num' }, tr.rate == null ? '-' : `${tr.rate}%`),
            h('td', { class: 'num' }, monthYear(tr.endDate)), h('td', { class: 'amt num' }, fmt(tr.balance)))))))
        : h('p', { class: 'sub' }, 'אין פירוט מסלולים.')));
    const loans = ov.retail.map((l) => h('div', { class: 'ov-loan' },
      h('div', {}, h('strong', {}, `הלוואה ·${l.last4 || String(l.name).slice(-4)}`),
        h('div', { class: 'sc-meta' }, [l.rate != null ? `ריבית ${l.rate}%` : null, l.endDate ? `עד ${monthYear(l.endDate)}` : null].filter(Boolean).join(', '))),
      h('span', { class: 'spacer' }), h('strong', { class: 'num' }, fmt(l.balance))));
    frag.append(h('div', { class: 'grid g2' },
      card('משכנתאות', `סך הכול ${fmt(t.mortgageDebt)}. לחצו על משכנתא כדי לראות מסלולים.`, ...(mort.length ? mort : [h('p', { class: 'sub' }, 'אין משכנתאות.')])),
      card('הלוואות', `סך הכול ${fmt(t.retailDebt)}.`, h('div', { class: 'ov-loans' }, ...(loans.length ? loans : [h('p', { class: 'sub' }, 'אין הלוואות.')])))));

    const pos = ov.securities.flatMap((s) => s.positions);
    if (pos.length) {
      frag.append(h('div', { class: 'grid' }, card('ניירות ערך', 'הנכסים בתיק. השווי העדכני מופיע באתר של הבנק.',
        h('div', { class: 'table-wrap' }, h('table', { class: 'dense' },
          h('thead', {}, h('tr', {}, h('th', {}, 'נייר'), h('th', {}, 'כמות'), h('th', { class: 'amt' }, 'מחיר קנייה ממוצע'))),
          h('tbody', {}, pos.map((p) => h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 }).format(p.units)),
            h('td', { class: 'amt num' }, p.avgPrice == null ? '-' : fmt2(p.avgPrice))))))))));
    }
    view.replaceChildren(frag);
  }
  window.__pageOverview = pageOverview;
})();
