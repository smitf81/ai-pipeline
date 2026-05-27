# AXIOM Launcher - Windows 11 friendly boot script v1.3
# Main change: robust launcher logging + stale editor asset detection.
# The bundle ships with node_modules. npm 10 can fail with "Exit handler never called" on some Windows installs,
# so normal boot validates bundled dependencies and launches directly.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 3007
$BaseUrl = "http://localhost:$Port"
$RuntimeDir = Join-Path $Root "runtime"
$LogsDir = Join-Path $Root "logs"
$PidFile = Join-Path $RuntimeDir "axiom-sse-bridge.pid"
$LauncherLog = Join-Path $LogsDir "launcher.log"
$RunStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RunLog = Join-Path $LogsDir "launcher-$RunStamp.log"
$NpmLog = Join-Path $LogsDir "npm-install.log"
$ServerLog = Join-Path $LogsDir "axiom-sse-bridge.out.log"
$ServerErr = Join-Path $LogsDir "axiom-sse-bridge.err.log"
$OllamaLog = Join-Path $LogsDir "ollama.out.log"
$OllamaErr = Join-Path $LogsDir "ollama.err.log"


$PluginBuilderDir = Join-Path (Split-Path $Root -Parent) "plugin-builder"
$PluginBuilderPort = 4242
$PluginBuilderUrl = "http://localhost:$PluginBuilderPort"
$PluginBuilderLog = Join-Path $LogsDir "plugin-builder.out.log"
$PluginBuilderErr = Join-Path $LogsDir "plugin-builder.err.log"

function Ensure-PluginBuilderRunning {
  Write-Step "Checking AXIOM Plugin Builder MCP service"

  try {
    $probe = Invoke-RestMethod -Uri "$PluginBuilderUrl/mcp/tools" -Method GET -TimeoutSec 2
    if ($probe) {
      Write-Ok "Plugin Builder already running on port $PluginBuilderPort"
      return
    }
  } catch {}

  $serverPath = Join-Path $PluginBuilderDir "src\mcp\server.js"
  $npmCmd = Resolve-NpmCmd

  if (-not (Test-Path $serverPath)) {
    Write-Warn "Plugin Builder server.js not found at $serverPath"
    return
  }

  if (-not $npmCmd) {
    Write-Warn "npm.cmd not found. Cannot start Plugin Builder."
    return
  }

  Write-Step "Launching Plugin Builder MCP service"

  Start-Process `
    -FilePath "node" `
    -ArgumentList @("src/mcp/server.js", "--http") `
    -WorkingDirectory $PluginBuilderDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $PluginBuilderLog `
    -RedirectStandardError $PluginBuilderErr

  Start-Sleep -Seconds 5

try {
    $probe = Invoke-RestMethod `
        -Uri "$PluginBuilderUrl/mcp/tools" `
        -Method GET `
        -TimeoutSec 2

    if ($probe) {
        Write-Ok "Plugin Builder already running on port $PluginBuilderPort"
        return
    }
}
catch {
    Write-Warn "Initial MCP probe failed: $($_.Exception.Message)"

    $tcpProbe = Test-NetConnection `
        -ComputerName "127.0.0.1" `
        -Port $PluginBuilderPort `
        -InformationLevel Quiet

    if ($tcpProbe) {
        Write-Ok "Port $PluginBuilderPort already occupied/responding; treating Plugin Builder as running"
        return
    }
    Write-Warn "Plugin Builder launch attempted but MCP endpoint did not respond"
    Write-Warn "Check logs:" -ForegroundColor Yellow
  Write-Warn $PluginBuilderLog
  Write-Warn $PluginBuilderErr
  }
}

New-Item -ItemType Directory -Force -Path $RuntimeDir, $LogsDir | Out-Null

function Log-Line($Text) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Text

  # Never let logging kill the launcher. Windows can keep a previous launcher.log handle
  # around briefly after a failed boot, especially when launched through npm/Terminal.
  foreach ($target in @($RunLog, $LauncherLog)) {
    try {
      Add-Content -Path $target -Value $line -ErrorAction Stop
    } catch {
      try {
        $fallback = Join-Path $LogsDir ("launcher-fallback-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
        Add-Content -Path $fallback -Value $line -ErrorAction SilentlyContinue
      } catch {}
    }
  }
}
function Write-Step($Text) { Write-Host "[AXIOM] $Text" -ForegroundColor Cyan; Log-Line "[AXIOM] $Text" }
function Write-Ok($Text) { Write-Host "[OK] $Text" -ForegroundColor Green; Log-Line "[OK] $Text" }
function Write-Warn($Text) { Write-Host "[WARN] $Text" -ForegroundColor Yellow; Log-Line "[WARN] $Text" }
function Write-Bad($Text) { Write-Host "[FAIL] $Text" -ForegroundColor Red; Log-Line "[FAIL] $Text" }

function Test-HttpJson($Url) {
  try { return Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 3 }
  catch { return $null }
}

function Test-EditorAssetFresh($Url) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    $text = [string]$r.Content
    $hasEditorShell = $text -match "AXIOM" -and $text -match "AI Native Game Editor"
    $hasFileBridge = $text -match "AXIOM_FILE_MANAGER" -or $text -match "FileManagerPathAwarenessCapability" -or $text -match "FileManagerRuntime"
    return [pscustomobject]@{
      Ok = ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300)
      StatusCode = $r.StatusCode
      HasEditorShell = $hasEditorShell
      HasFileBridge = $hasFileBridge
      Length = $text.Length
    }
  } catch {
    return [pscustomobject]@{ Ok = $false; StatusCode = 0; HasEditorShell = $false; HasFileBridge = $false; Length = 0; Error = $_.Exception.Message }
  }
}

function Require-Command($Name, $InstallHint) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Bad "$Name was not found."
    Write-Host $InstallHint -ForegroundColor Yellow
    throw "Missing dependency: $Name"
  }
  return $cmd.Source
}

function Resolve-NpmCmd() {
  $cmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
  if ($nodeCmd) {
    $candidate = Join-Path (Split-Path -Parent $nodeCmd.Source) "npm.cmd"
    if (Test-Path $candidate) { return $candidate }
  }
  $plain = Get-Command "npm" -ErrorAction SilentlyContinue
  if ($plain) { return $plain.Source }
  return $null
}

function Test-ExpressDependency() {
  $expressPkg = Join-Path $Root "node_modules\express\package.json"
  if (-not (Test-Path $expressPkg)) { return $false }

  Push-Location $Root
  try {
    $check = & node -e "import('express').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})" 2>&1
    if ($LASTEXITCODE -eq 0) { return $true }
    $check | Add-Content -Path $LauncherLog
    return $false
  } finally {
    Pop-Location
  }
}

function Repair-NodeDependencies($npmCmd) {
  if (-not $npmCmd) { throw "npm.cmd missing; cannot repair dependencies" }
  Write-Warn "Running dependency repair. This is only used when bundled node_modules is missing/broken."
  "===== npm repair started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Set-Content -Path $NpmLog

  $env:npm_config_audit = "false"
  $env:npm_config_fund = "false"
  $env:npm_config_foreground_scripts = "true"

  $proc = Start-Process -FilePath $npmCmd -ArgumentList @("install", "--no-audit", "--no-fund", "--foreground-scripts") -WorkingDirectory $Root -NoNewWindow -Wait -PassThru -RedirectStandardOutput $NpmLog -RedirectStandardError $NpmLog
  if ($proc.ExitCode -ne 0) {
    throw "npm dependency repair failed with exit code $($proc.ExitCode). See $NpmLog"
  }
}

try {
  Set-Location $Root
  Log-Line "===== AXIOM launcher v1.3 started from $Root ====="

  Write-Step "Checking dependencies"
  $nodePath = Require-Command "node" "Install Node.js LTS from https://nodejs.org, then re-run this launcher."
  $npmCmd = Resolve-NpmCmd
  $nodeVersion = (& node --version)
  Write-Ok "Node $nodeVersion found at $nodePath"

  Ensure-PluginBuilderRunning
  if ($npmCmd) {
    try { $npmVersion = (& $npmCmd --version); Write-Ok "npm $npmVersion found at $npmCmd" }
    catch { Write-Warn "npm exists but version check failed. Normal launch does not need npm." }
  } else {
    Write-Warn "npm.cmd not found. Normal launch can still work because dependencies are bundled."
  }

  Write-Step "Validating bundled Node dependencies"
  if (Test-ExpressDependency) {
    Write-Ok "Bundled dependencies are present and load correctly; skipping npm install"
  } else {
    Write-Warn "Bundled dependencies are missing or broken."
    if ($env:AXIOM_REPAIR_DEPS -eq "1") {
      Repair-NodeDependencies $npmCmd
      if (-not (Test-ExpressDependency)) { throw "Express still cannot load after dependency repair" }
      Write-Ok "Dependencies repaired"
    } else {
      Write-Host "" -ForegroundColor Yellow
      Write-Host "This launcher bundle should include node_modules. Re-extract the FULL v1.2 bundle over this folder." -ForegroundColor Yellow
      Write-Host "If you intentionally want to force npm repair, run AXIOM-Repair-Dependencies.cmd." -ForegroundColor Yellow
      throw "Bundled dependencies missing; not running npm during normal launch"
    }
  }

  Write-Step "Checking optional Ollama model server"
  $ollamaCmd = Get-Command "ollama" -ErrorAction SilentlyContinue
  if ($ollamaCmd) {
    $ollamaHealth = Test-HttpJson "http://127.0.0.1:11434/api/tags"
    if (-not $ollamaHealth) {
      Write-Warn "Ollama is installed but not responding. Attempting to start it."
      try {
        Start-Process -FilePath $ollamaCmd.Source -ArgumentList "serve" -WindowStyle Hidden -RedirectStandardOutput $OllamaLog -RedirectStandardError $OllamaErr | Out-Null
        Start-Sleep -Seconds 2
      } catch {
        Write-Warn "Could not auto-start Ollama: $($_.Exception.Message)"
      }
      for ($i=0; $i -lt 10; $i++) {
        $ollamaHealth = Test-HttpJson "http://127.0.0.1:11434/api/tags"
        if ($ollamaHealth) { break }
        Start-Sleep -Seconds 1
      }
    }
    if ($ollamaHealth) {
      $modelCount = @($ollamaHealth.models).Count
      Write-Ok "Ollama live at http://127.0.0.1:11434 ($modelCount model(s) visible)"
    } else {
      Write-Warn "Ollama not live. AXIOM editor still launches; local AI chat may show offline until Ollama is started."
    }
  } else {
    Write-Warn "Ollama not installed/found. AXIOM editor still launches; local model features will be offline."
  }

  Write-Step "Checking AXIOM SSE Bridge"
  $health = Test-HttpJson "$BaseUrl/health"
  if (-not $health) {
    Write-Step "Starting AXIOM SSE Bridge on port $Port"
    $proc = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $ServerLog -RedirectStandardError $ServerErr
    Set-Content -Path $PidFile -Value $proc.Id

    for ($i=0; $i -lt 20; $i++) {
      $health = Test-HttpJson "$BaseUrl/health"
      if ($health -and $health.ok) { break }
      Start-Sleep -Milliseconds 750
    }
  }

  if (-not ($health -and $health.ok)) {
    Write-Bad "AXIOM SSE Bridge did not pass health check."
    Write-Host "Check logs:" -ForegroundColor Yellow
    Write-Host "  $ServerLog"
    Write-Host "  $ServerErr"
    throw "Bridge failed health check"
  }
  Write-Ok "AXIOM SSE Bridge live: $($health.service), clients=$($health.clients)"

  Write-Step "Verifying required web assets"
  $assetChecks = @(
    "$BaseUrl/axiom-sse-client.js",
    "$BaseUrl/sse-demo.html"
  )
  foreach ($url in $assetChecks) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { Write-Ok "$url" }
      else { throw "HTTP $($r.StatusCode)" }
    } catch {
      Write-Bad "Asset failed: $url"
      throw
    }
  }

  $editorUrl = "$BaseUrl/axiom-editor.html"
  $editorFresh = Test-EditorAssetFresh $editorUrl
  if (-not $editorFresh.Ok) {
    Write-Bad "Asset failed: $editorUrl"
    throw "Editor asset missing or unreachable: $($editorFresh.Error)"
  }
  Write-Ok "$editorUrl"
  if (-not $editorFresh.HasEditorShell) {
    Write-Warn "Editor asset responded but does not look like AXIOM editor HTML. Browser may open a shell/stale page. Length=$($editorFresh.Length)"
  }
  if (-not $editorFresh.HasFileBridge) {
    Write-Warn "Editor is missing File Manager / chat-file bridge markers. You may be launching an older axiom-editor.html or a server from the wrong folder."
    Write-Warn "Expected one of: AXIOM_FILE_MANAGER, FileManagerPathAwarenessCapability, FileManagerRuntime"
  }

  Write-Step "Opening AXIOM"
  Start-Process "$BaseUrl/axiom-editor.html"
  Write-Ok "AXIOM launched. You can close this window; the server keeps running in the background."
  Write-Host ""
  Write-Host "Health: $BaseUrl/health"
  Write-Host "Demo:   $BaseUrl/sse-demo.html"
  Write-Host "Editor: $BaseUrl/axiom-editor.html"
  Start-Sleep -Seconds 2
} catch {
  Write-Bad $_.Exception.Message
  Write-Host ""
  Write-Host "AXIOM failed to launch. Logs are here:" -ForegroundColor Yellow
  Write-Host "  $RunLog"
  Write-Host "  $LauncherLog"
  Write-Host "  $NpmLog"
  Write-Host "  $ServerLog"
  Write-Host "  $ServerErr"
  Write-Host ""
  Write-Host "Press any key to continue . . ."
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
  exit 1
}
