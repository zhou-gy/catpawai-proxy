@echo off
setlocal
cd /d "%~dp0"

echo.
echo CatPawAI local state importer
echo =============================
echo.
echo This reads CatPawAI's local logged-in state and writes .env.
echo It will NOT print the token.
echo.
pause

node "%~dp0scripts\import-from-catpaw-state.js"

echo.
echo Done. Restart the proxy with start-proxy.cmd.
echo.
pause
