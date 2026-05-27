@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0AXIOM-Launch.ps1"
if errorlevel 1 (
  echo.
  echo AXIOM failed to launch. Read the message above, then press any key.
  pause >nul
)
endlocal
