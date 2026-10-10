'use strict';
// גישה מהרשת הביתית: מקשיבים רק על כתובות הרשת הפרטיות של המחשב (אף פעם לא על כל הממשקים),
// ורק אחרי שנוצרו משתמשים. האפליקציה עצמה דוחה כל חיבור שלא מגיע מכתובת פרטית.
const http = require('http');
const os = require('os');
const { isPrivateIp } = require('./auth');

function defaultAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && isPrivateIp(i.address) && !i.address.startsWith('169.254.')).map((i) => i.address);
}

function createLan({ app, port, addresses = defaultAddresses, onChange = () => {} }) {
  const servers = [];
  return {
    get() { const a = addresses(); return { enabled: servers.length > 0, port, addresses: a, urls: a.map((x) => `http://${x}:${port}`) }; },
    async set(on) {
      if (on && !servers.length) {
        const addrs = addresses();
        if (!addrs.length) throw new Error('לא נמצאה כתובת ברשת הביתית. ודאו שהמחשב מחובר ל-Wi-Fi או לכבל.');
        try {
          for (const a of addrs) { const srv = http.createServer(app); await new Promise((res, rej) => { srv.once('error', rej); srv.listen(port, a, res); }); servers.push(srv); }
        } catch (e) { for (const s of servers.splice(0)) s.close(); throw new Error(e.code === 'EADDRINUSE' ? 'הפורט תפוס ברשת הביתית' : e.message); }
      } else if (!on) { for (const s of servers.splice(0)) { s.close(); if (s.closeAllConnections) s.closeAllConnections(); } }
      onChange(!!on);
    },
  };
}

module.exports = { createLan, defaultAddresses };
