$ErrorActionPreference = "Stop"

$UiRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProjectRoot = (Resolve-Path (Join-Path $UiRoot "..")).Path
$Daemon = Join-Path $UiRoot "subconsciousDaemon.js"
$Node = (Get-Command node -ErrorAction Stop).Source

Start-Process -FilePath $Node `
  -ArgumentList @($Daemon) `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden
