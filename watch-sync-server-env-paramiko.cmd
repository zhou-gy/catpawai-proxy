@echo off
setlocal
cd /d "%~dp0"

rem Change this value if you want a different automatic sync interval.
rem The script refreshes local .env first and only connects to the server when .env changes.
set WATCH_INTERVAL_SECONDS=30

python "%~dp0scripts\sync_server_env_paramiko.py" --watch --interval %WATCH_INTERVAL_SECONDS%
if errorlevel 1 (
  echo.
  echo Watch sync stopped with an error.
  pause
  exit /b %errorlevel%
)
echo.
echo Watch sync stopped.
pause
endlocal
