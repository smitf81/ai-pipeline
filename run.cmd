@echo off
setlocal EnableExtensions
node "%~dp0tools\run-cli.mjs" %*
exit /b %ERRORLEVEL%
