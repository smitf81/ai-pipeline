@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node.js or open this folder in a terminal where node is available.
  pause
  exit /b 1
)

echo Launching Black Sky Bound v2 Demo...
node tools\launch.mjs %*

echo.
echo Launcher closed.
pause
