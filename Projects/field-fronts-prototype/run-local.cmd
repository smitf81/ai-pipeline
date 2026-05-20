@echo off
setlocal
cd /d "%~dp0"
node tools\static-server.mjs 4184
