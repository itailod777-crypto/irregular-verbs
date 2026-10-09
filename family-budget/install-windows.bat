@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies - this takes a few minutes...
  call npm install
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-shortcuts.ps1"
echo.
echo Finished. Use the "Family Budget" icon on your Desktop from now on.
pause
