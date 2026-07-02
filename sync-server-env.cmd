@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-server-env.ps1" %*
if errorlevel 1 (
  echo.
  echo Sync failed.
  pause
  exit /b %errorlevel%
)
echo.
echo Sync complete.
pause
endlocal
