#!/bin/bash
cd "$(dirname "$0")"
[ -d node_modules ] || PUPPETEER_SKIP_DOWNLOAD=1 npm install --omit=dev --no-audit --no-fund
(sleep 2; if command -v open >/dev/null; then open http://127.0.0.1:3000; else xdg-open http://127.0.0.1:3000; fi) &
node server.js
