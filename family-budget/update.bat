@echo off
cd /d "%~dp0"
(
  where git >nul 2>nul
  if errorlevel 1 (
    echo Git is not installed. Install it from https://git-scm.com
    pause
    exit /b 1
  )
  git -C "%~dp0.." rev-parse --is-inside-work-tree >nul 2>nul
  if errorlevel 1 (
    echo This copy was not installed with git. Use setup-from-git.bat first.
    pause
    exit /b 1
  )
  echo Stopping the app server...
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /f /pid %%p >nul 2>nul
  echo Downloading the latest version...
  git -C "%~dp0.." pull origin claude/adoring-planck-5kbmev
  if errorlevel 1 (
    echo Update failed. Your data is safe. Send the message above to Claude.
    pause
    exit /b 1
  )
  call npm install --omit=dev --no-audit --no-fund
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-shortcuts.ps1" >nul 2>nul
  wscript "%~dp0app.vbs" hidden
  echo.
  echo Updated. Your data was not touched. Open the Family Budget icon.
  pause
  exit /b 0
)
