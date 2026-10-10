@echo off
chcp 65001 >nul
title Family Budget - Diagnostic
set "APP=%USERPROFILE%\FamilyBudget\family-budget"
set "OUT=%USERPROFILE%\Desktop\family-budget-report.txt"
echo Family Budget diagnostic report > "%OUT%"
echo Time: %date% %time% >> "%OUT%"
echo. >> "%OUT%"
echo Collecting information, please wait...
echo --- tools --- >> "%OUT%"
node -v >> "%OUT%" 2>&1
npm -v >> "%OUT%" 2>&1
git --version >> "%OUT%" 2>&1
if not exist "%APP%\server.js" (
  echo APP FOLDER OR server.js NOT FOUND: %APP% >> "%OUT%"
  goto done
)
cd /d "%APP%"
echo. >> "%OUT%"
echo --- version of the app --- >> "%OUT%"
git log -1 --oneline >> "%OUT%" 2>&1
git status --short >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo --- key files --- >> "%OUT%"
for %%F in (server.js package.json app.vbs src\app.js src\sync.js src\updater.js public\app.js node_modules\express\package.json node_modules\israeli-bank-scrapers\package.json data\budget.db) do if exist "%%F" (echo OK      %%F >> "%OUT%") else (echo MISSING %%F >> "%OUT%")
echo. >> "%OUT%"
echo --- scraper library version --- >> "%OUT%"
node -p "require('israeli-bank-scrapers/package.json').version" >> "%OUT%" 2>&1
echo --- browser found for scraping --- >> "%OUT%"
node -e "console.log(require('./src/sync').findBrowser())" >> "%OUT%" 2>&1
echo --- does the app code load? --- >> "%OUT%"
node -e "require('./src/app'); console.log('app code loads OK')" >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo --- last lines of server.log --- >> "%OUT%"
if exist data\server.log powershell -NoProfile -Command "Get-Content 'data\server.log' -Tail 25" >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo --- is something listening on port 3000? --- >> "%OUT%"
netstat -ano | findstr ":3000" >> "%OUT%" 2>&1
echo --- node processes --- >> "%OUT%"
tasklist | findstr /i "node" >> "%OUT%" 2>&1
:done
echo. >> "%OUT%"
echo End of report. >> "%OUT%"
echo.
echo ================= REPORT =================
type "%OUT%"
echo ==========================================
echo.
echo Report also saved on your Desktop: family-budget-report.txt
start "" notepad "%OUT%"
echo.
echo Take a screenshot of this window and send it. Press any key to close.
pause >nul
