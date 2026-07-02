@echo off
setlocal
cd /d "%~dp0"

echo.
echo CatPawAI config.toml importer
echo =============================
echo.
echo You do NOT need request headers.
echo.
echo In CatPawAI:
echo   1. Click the config.toml link shown in the chat answer.
echo   2. Press Ctrl+A, then Ctrl+C to copy the whole file.
echo   3. Come back here and press any key.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure-from-catpaw-config.ps1" -FromClipboard

echo.
echo Done. Restart the proxy with start-proxy.cmd, then use:
echo   http://127.0.0.1:13000/v1
echo.
pause
