@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo מתקין תלויות בפעם הראשונה, זה ייקח כמה דקות...
  call npm install --omit=dev --no-audit --no-fund
)
echo מפעיל את תקציב המשפחה... (אל תסגור את החלון הזה)
start "" http://127.0.0.1:3000
node server.js
pause
