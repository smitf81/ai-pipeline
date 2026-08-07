@echo off
setlocal
set AXIOM_REPAIR_DEPS=1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0AXIOM-Launch.ps1"
