#!/bin/bash
cd "$(dirname "$0")"
(sleep 2; if command -v open >/dev/null; then open http://127.0.0.1:3000; else xdg-open http://127.0.0.1:3000; fi) &
node server.js
