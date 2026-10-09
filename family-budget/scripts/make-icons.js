'use strict';
// מרנדר את icon.svg לקבצי PNG להתקנה כאפליקציה (דורש Playwright/Chromium; נוצרים פעם אחת ונשמרים ב-git).
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');
(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const svg = fs.readFileSync(path.join(pub, 'icon.svg'), 'utf8');
  const maskable = svg.replace('rx="112"', 'rx="0"').replace(/<g /, '<g transform="translate(76 76) scale(.703)" ');
  for (const [name, size, src] of [['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['icon-maskable-512.png', 512, maskable]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<body style="margin:0">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await p.screenshot({ path: path.join(pub, name), omitBackground: true });
  }
  await b.close();
})();
