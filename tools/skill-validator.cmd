@echo off
setlocal EnableExtensions

if "%~1"=="" (
  echo Usage: tools\skill-validator.cmd ^<path-to-skill-folder^>
  exit /b 2
)

set "REPO_ROOT=%~dp0.."
set "PYTHONPATH=%REPO_ROOT%\.python-tools\skill-validator;%PYTHONPATH%"
set "VALIDATOR=%USERPROFILE%\.codex\skills\.system\skill-creator\scripts\quick_validate.py"

if not exist "%VALIDATOR%" (
  echo [skill-validator] Cannot find "%VALIDATOR%"
  exit /b 1
)

python "%VALIDATOR%" "%~1"
