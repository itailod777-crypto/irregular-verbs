'use strict';
// התראה אופציונלית דרך ntfy.sh. לא נשלח שום מידע פיננסי, רק הודעה כללית על כשל.
// מופעל רק אם הוגדר נושא (topic) בהגדרות. ללא נושא - שום בקשת רשת לא יוצאת.
const { getSetting } = require('./db');

async function notifyFailure(db, text) {
  const topic = getSetting(db, 'ntfy_topic', '');
  if (!topic) return { sent: false };
  const server = (getSetting(db, 'ntfy_server', '') || 'https://ntfy.sh').replace(/\/+$/, '');
  try {
    const res = await fetch(`${server}/${encodeURIComponent(topic)}`, {
      method: 'POST', body: text, headers: { Title: 'Family Budget', Priority: 'high', Tags: 'warning' },
      signal: AbortSignal.timeout(10000),
    });
    return { sent: res.ok };
  } catch {
    return { sent: false };
  }
}

module.exports = { notifyFailure };
