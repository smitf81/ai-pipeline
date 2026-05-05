param(
    [string]$Model = "qwen2.5-coder:1.5b",
    [string]$HostUrl = "http://127.0.0.1:11434",
    [switch]$SkipPull
)

$ErrorActionPreference = "Stop"

Write-Host "ACE Local Ollama dependency check" -ForegroundColor Cyan
Write-Host "Model: $Model"
Write-Host "Host:  $HostUrl"

function Test-OllamaHttp {
    try {
        $tags = Invoke-RestMethod -Uri "$HostUrl/api/tags" -Method Get -TimeoutSec 3
        return $true
    } catch {
        return $false
    }
}

$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaCmd) {
    Write-Host "Ollama is not installed or not on PATH." -ForegroundColor Red
    Write-Host "Install Ollama for Windows, then reopen PowerShell and rerun this script."
    exit 1
}

Write-Host "Ollama CLI found: $($ollamaCmd.Source)" -ForegroundColor Green

if (-not (Test-OllamaHttp)) {
    Write-Host "Ollama HTTP server is not responding. Attempting to start 'ollama serve' in a hidden window..." -ForegroundColor Yellow
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 3
}

if (-not (Test-OllamaHttp)) {
    Write-Host "Ollama HTTP server is still not responding at $HostUrl." -ForegroundColor Red
    Write-Host "Try manually running: ollama serve"
    exit 1
}

Write-Host "Ollama HTTP server is live." -ForegroundColor Green

$models = (& ollama list) | Out-String
if ($models -notmatch [regex]::Escape($Model)) {
    if ($SkipPull) {
        Write-Host "Model '$Model' is not installed, and -SkipPull was set." -ForegroundColor Red
        exit 1
    }

    Write-Host "Model '$Model' not found locally. Pulling it now..." -ForegroundColor Yellow
    & ollama pull $Model
} else {
    Write-Host "Model '$Model' is installed." -ForegroundColor Green
}

$body = @{
    model = $Model
    prompt = "Reply with exactly: local ollama live"
    stream = $false
} | ConvertTo-Json

$start = Get-Date
try {
    $result = Invoke-RestMethod -Uri "$HostUrl/api/generate" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 60
    $elapsed = ((Get-Date) - $start).TotalSeconds
    Write-Host "Live generate check passed in $([math]::Round($elapsed, 2))s." -ForegroundColor Green
    Write-Host "Returned model: $($result.model)"
    Write-Host "Response: $($result.response)"
    exit 0
} catch {
    Write-Host "Live generate check failed." -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
