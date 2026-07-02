@echo off
setlocal
cd /d "%~dp0"
python "%~dp0scripts\sync_server_env_paramiko.py" %*
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
