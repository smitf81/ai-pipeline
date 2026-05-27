@echo off
setlocal EnableExtensions

rem ---- config ----
set "PORT=3000"
set "UI_DIR=%~dp0ui"
set "URL=http://localhost:%PORT%"

rem ---- sanity ----
if not exist "%UI_DIR%\server.js" (
  echo [ACE] Cannot find "%UI_DIR%\server.js"
  exit /b 1
)

rem ---- check if already running ----
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%URL%'; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  rem Already running: just open browser
  start "" "%URL%"
  exit /b 0
)

rem ---- start server detached ----
rem Use 'start' to detach so this script can exit while node keeps running
pushd "%UI_DIR%"
start "" /b node server.js
popd

rem ---- wait briefly for it to come up (max ~5s) ----
for /L %%i in (1,1,10) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%URL%'; exit 0 } catch { exit 1 }"
  if %errorlevel%==0 goto :open
  timeout /t 1 /nobreak >nul
)

:open
start "" "%URL%"
exit /b 0