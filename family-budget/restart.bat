@echo off
rem Restarts the Family Budget server after an in-app update (called by the server itself).
ping -n 4 127.0.0.1 >nul
echo %date% %time% restart>> "%~dp0data\restart.log"
wscript "%~dp0app.vbs" hidden
