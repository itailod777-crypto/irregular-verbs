@echo off
setlocal
title Family Budget - one click install
rem One file, one double click: installs Node.js and Git if missing (via winget), downloads the app,
rem installs it, and creates the desktop icon. Safe to run again: it updates an existing install.
rem Needs Windows 10/11 and an internet connection. No account or login is required.

set "REPO=https://github.com/itailod777-crypto/irregular-verbs.git"
set "BRANCH=claude/adoring-planck-5kbmev"
set "TARGET=%USERPROFILE%\FamilyBudget"

echo.
echo  Family Budget installer
echo  -----------------------

where winget >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Windows App Installer (winget) was not found.
  echo  Open the Microsoft Store, search for "App Installer", press Update, then run this file again.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo  Installing Node.js ... this can take a few minutes.
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
)
where git >nul 2>nul
if errorlevel 1 (
  echo  Installing Git ...
  winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements
)

rem winget updates PATH only for new windows, so add the usual locations for this one
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%LocalAppData%\Programs\Git\cmd"

where node >nul 2>nul
if errorlevel 1 goto :restart
where git >nul 2>nul
if errorlevel 1 goto :restart

if exist "%TARGET%\.git" (
  echo  Found an existing install. Updating ...
  git -C "%TARGET%" fetch origin %BRANCH%
  git -C "%TARGET%" reset --hard FETCH_HEAD
) else (
  if exist "%TARGET%" (
    echo.
    echo  The folder %TARGET% already exists but is not an install.
    echo  Rename or delete it, then run this file again.
    pause
    exit /b 1
  )
  echo  Downloading the app ...
  git clone -b %BRANCH% %REPO% "%TARGET%"
  if errorlevel 1 (
    echo.
    echo  Download failed. Check the internet connection and run this file again.
    pause
    exit /b 1
  )
)

cd /d "%TARGET%\family-budget"
echo  Installing ... this takes a few minutes the first time.
set "PUPPETEER_SKIP_DOWNLOAD=1"
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  Install failed. Run this file again; if it fails twice, send a photo of this window.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%TARGET%\family-budget\scripts\install-shortcuts.ps1"

echo.
echo  Done. Use the "Family Budget" icon on the Desktop.
echo  The first time, open "Cards and accounts", choose a password, and connect Financy.
timeout /t 8 >nul
exit /b 0

:restart
echo.
echo  Node.js or Git was just installed. Close this window and double click this file once more.
pause
exit /b 0
