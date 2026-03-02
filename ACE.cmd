@echo off
setlocal

set "ROOT=C:\Users\felix\Desktop\Automated_AI_Pipeline\dev\ai-pipeline\ai-pipeline-updated\ai-pipeline"

cd /d "%ROOT%\ui"

echo Starting ACE from:
echo %ROOT%
echo.

node server.js

pause