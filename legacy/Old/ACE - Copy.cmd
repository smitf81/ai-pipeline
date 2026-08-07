\
@echo off
setlocal enabledelayedexpansion

REM ACE launcher (Windows CMD) — avoids PowerShell execution policy issues by using npm.cmd
REM Place this file in the repo root (next to /ui and /runner)

cd /d "%~dp0"

if not exist "ui\server.js" (
  echo [ACE] Could not find ui\server.js. Are you running this from the repo root?
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ACE] Node.js not found on PATH. Install Node 18+ and try again.
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo [ACE] Python not found on PATH. Install Python 3.10+ and try again.
  pause
  exit /b 1
)

REM Make sure UI deps are installed (first run only)
pushd "ui"
if not exist "node_modules" (
  echo [ACE] Installing UI dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo [ACE] npm install failed.
    popd
    pause
    exit /b 1
  )
)

echo [ACE] Starting UI server...
start "" http://localhost:3000
node server.js

popd
endlocal
