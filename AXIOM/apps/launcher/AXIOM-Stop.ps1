$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Root "runtime\axiom-sse-bridge.pid"
if (Test-Path $PidFile) {
  $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
  if ($pidValue) {
    try {
      Stop-Process -Id ([int]$pidValue) -Force -ErrorAction Stop
      Write-Host "Stopped AXIOM SSE Bridge process $pidValue" -ForegroundColor Green
    } catch {
      Write-Host "Could not stop stored process id $pidValue. It may already be closed." -ForegroundColor Yellow
    }
  }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
} else {
  Write-Host "No AXIOM pid file found. If the server is still running, close node.exe from Task Manager." -ForegroundColor Yellow
}
