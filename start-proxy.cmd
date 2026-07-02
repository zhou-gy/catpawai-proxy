@echo off
setlocal
cd /d "%~dp0"
echo Starting CatPawAI Proxy...
if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b %errorlevel%
)
call npm.cmd start
endlocal
