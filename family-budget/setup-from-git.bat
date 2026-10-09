@echo off
rem Installs Family Budget with git (so update.bat can update it later).
where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Install it from https://git-scm.com and run this file again.
  pause
  exit /b 1
)
set TARGET=%USERPROFILE%\FamilyBudget
if exist "%TARGET%" (
  echo The folder %TARGET% already exists. Use update.bat inside it to update.
  pause
  exit /b 1
)
echo Downloading... a GitHub login window may open - sign in with your account.
git clone -b claude/adoring-planck-5kbmev https://github.com/itailod777-crypto/irregular-verbs.git "%TARGET%"
if errorlevel 1 (
  echo Download failed. Make sure you are signed in to GitHub with the right account.
  pause
  exit /b 1
)
call "%TARGET%\family-budget\install-windows.bat"
