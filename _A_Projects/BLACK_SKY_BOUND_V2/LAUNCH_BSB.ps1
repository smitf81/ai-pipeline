Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js was not found on PATH." -ForegroundColor Red
    Write-Host "Install Node.js or open this folder in a terminal where node is available."
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host "Launching Black Sky Bound v2 Demo..." -ForegroundColor Cyan
node .\tools\launch.mjs @args

Write-Host ""
Write-Host "Launcher closed."
Read-Host "Press Enter to close"
