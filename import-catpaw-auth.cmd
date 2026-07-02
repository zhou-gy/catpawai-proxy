@echo off
setlocal
cd /d "%~dp0"

echo.
echo CatPawAI auth importer
echo ======================
echo.
echo Step 1: Copy CatPawAI request headers to your clipboard.
echo Step 2: Run this file again, or press any key now if headers are already copied.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure-auth.ps1" -FromClipboard

echo.
echo Done. If import succeeded, restart the proxy with start-proxy.cmd.
echo.
pause
