@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\export-catpaw-extension.ps1"
if errorlevel 1 (
  echo.
  echo Failed to export CatPawAI extension.js.
  pause
  exit /b %errorlevel%
)
echo.
echo Done. You can now upload this folder to Ubuntu.
pause
endlocal
