'use strict';
// כלים משותפים. אין innerHTML בשום מקום: כל טקסט (כולל שמות בתי עסק) נכנס כ-text בלבד.
const NS = 'http://www.w3.org/2000/svg';

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'for') el.htmlFor = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}
function s(tag, props, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(props || {})) { if (v == null) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'style') el.style.cssText = v; else el.setAttribute(k, v); }
  for (const kid of kids.flat(Infinity)) { if (kid == null) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}

async function api(method, url, body, headers) {
  const isRaw = body instanceof ArrayBuffer || body instanceof Blob;
  const res = await fetch(url, {
    method, headers: { 'X-Requested-With': 'budget', ...(body && !isRaw ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) },
    body: body === undefined ? undefined : isRaw ? body : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error((data && data.error) || `שגיאה ${res.status}`);
  return data;
}

const money0 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2 });
const fmt = (n) => money0.format(Math.round(n || 0) === 0 ? 0 : n);
const fmt2 = (n) => money2.format(n || 0);
const pct = (n) => `${Math.round((n || 0) * 100)}%`;

const monthFmt = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' });
const monthLabel = (m) => monthFmt.format(new Date(`${m}-01T00:00:00Z`));
const monthShortLabel = (m) => monthShort.format(new Date(`${m}-01T00:00:00Z`));
function addMonths(m, d) { const [y, mo] = m.split('-').map(Number); const x = new Date(Date.UTC(y, mo - 1 + d, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
const dateLabel = (iso) => iso.split('-').reverse().join('/');

function toast(msg, isErr) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = h('div', { class: 'toast' + (isErr ? ' err' : ''), role: isErr ? 'alert' : 'status' }, msg);
  box.append(t);
  setTimeout(() => t.remove(), isErr ? 7000 : 3500);
}

function safeStore(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch { return null; }
  return null;
}
function applyTheme() {
  const t = safeStore('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
}
applyTheme();
