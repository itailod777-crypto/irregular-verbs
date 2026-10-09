'use strict';
// Service worker מינימלי: שומר רק קבצי ממשק סטטיים (לא נתונים!) כדי שהאפליקציה תיפתח מהר ותהיה ניתנת להתקנה.
// בקשות /api/ אף פעם לא נשמרות במטמון.
const CACHE = 'fb-shell-v1';
const SHELL = ['/', '/styles.css', '/common.js', '/charts.js', '/app.js', '/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); return res; }).catch(() => caches.match(e.request)));
});
