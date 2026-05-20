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
start "" "http://127.0.0.1:4184/?seed=1"
node tools\static-server.mjs 4184
