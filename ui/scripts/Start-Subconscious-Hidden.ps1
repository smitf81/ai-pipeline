$ErrorActionPreference = "Stop"

$UiRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Daemon = Join-Path $UiRoot "subconsciousDaemon.js"
$Node = (Get-Command node -ErrorAction Stop).Source

Start-Process -FilePath $Node `
  -ArgumentList @($Daemon) `
  -WorkingDirectory $UiRoot `
  -WindowStyle Hidden
