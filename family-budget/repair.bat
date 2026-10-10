@echo off
chcp 65001 >nul
title Family Budget - Repair
echo ============================================
echo   Family Budget - automatic repair
echo   Please wait. Do not close this window.
echo ============================================
set "APP=%USERPROFILE%\FamilyBudget\family-budget"
if not exist "%APP%\server.js" (
  echo The app folder was not found: %APP%
  echo Please send a screenshot of this window.
  pause
  exit /b 1
)
cd /d "%APP%"
echo.
echo [1/5] Stopping the old server...
taskkill /f /im node.exe >nul 2>&1
echo [2/5] Last lines of the server log, if any:
if exist data\server.log powershell -NoProfile -Command "Get-Content 'data\server.log' -Tail 20"
echo.
echo [3/5] Downloading the latest version...
git fetch origin claude/adoring-planck-5kbmev
if errorlevel 1 (
  echo Download failed. Check the internet connection and send a screenshot of this window.
  pause
  exit /b 1
)
git reset --hard origin/claude/adoring-planck-5kbmev
echo.
echo [4/5] Installing...
set "PUPPETEER_SKIP_DOWNLOAD=1"
call npm install --omit=dev --no-audit --no-fund
echo.
echo [5/5] Starting. KEEP THIS WINDOW OPEN. The app will open in your browser in a few seconds.
start "" /min cmd /c "ping -n 6 127.0.0.1 >nul & start http://127.0.0.1:3000"
node server.js
echo.
echo The server stopped. If there is a red error above, please send a screenshot of this window.
pause
