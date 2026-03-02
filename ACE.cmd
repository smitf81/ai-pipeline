@echo off
setlocal

rem Change into the updated ACE UI folder
cd /d "C:\Users\felix\Desktop\Automated_AI_Pipeline\dev\ai-pipeline\ai-pipeline-updated\ai-pipeline\ui"

rem OPTIONAL: uncomment the next line the first time to install deps
rem call npm install

rem Start the UI server
node server.js

endlocal