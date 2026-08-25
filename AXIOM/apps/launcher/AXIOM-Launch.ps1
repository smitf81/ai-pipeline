# AXIOM Launcher - Windows 11 friendly boot script v1.4
# Main change: exact runtime identity + Map Intent preflight asset detection.
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
$ExpectedBridgeVersion = "axiom-file-manager-bridge.v0.5-project-roots"
$ExpectedRuntimeContract = "axiom.launcher-runtime.v7-capability-acquisition-r7"
$ExpectedAgentIntentContract = "axiom.agent-intent.v1"
$ExpectedCapabilityAcquisitionContract = "axiom.capability-acquisition.v1"
$ExpectedMapIntentPreflightContract = "axiom.map-intent-preflight.v1"
$ExpectedBlackSkySelector = "_A_Projects/BLACK_SKY_BOUND_FFP"
$ExpectedBlackSkyV2Selector = "_A_Projects/BLACK_SKY_BOUND_V2"
$RequiredBridgeTools = @("project_list", "project_open", "project_runtime_probe", "project_runtime_bootstrap", "fs_ls", "fs_cat", "safe_write_project_file")


$PluginBuilderDir = Join-Path (Split-Path $Root -Parent) "plugin-builder"
$PluginBuilderPort = 4242
$PluginBuilderUrl = "http://127.0.0.1:$PluginBuilderPort"
$PluginBuilderLog = Join-Path $LogsDir "plugin-builder.out.log"
$PluginBuilderErr = Join-Path $LogsDir "plugin-builder.err.log"
$ExpectedPluginBuilderContract = "axiom.plugin-builder-runtime.v2-bounded-acquisition-r6"

function Ensure-PluginBuilderRunning {
  Write-Step "Checking AXIOM Plugin Builder MCP service"
  $serverPath = Join-Path $PluginBuilderDir "src\mcp\server.js"
  if (-not (Test-Path $serverPath)) {
    Write-Warn "Plugin Builder server.js not found at $serverPath"
    throw "Plugin Builder source missing"
  }

  $expectedRoot = [IO.Path]::GetFullPath($PluginBuilderDir).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $existing = $null
  try { $existing = Invoke-RestMethod -Uri "$PluginBuilderUrl/health" -Method GET -TimeoutSec 2 } catch {}
  if ($existing -and $existing.ok) {
    $actualRoot = ""
    try { $actualRoot = [IO.Path]::GetFullPath([string]$existing.builderRoot).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) } catch {}
    $identityMatches = $existing.runtimeContract -eq $ExpectedPluginBuilderContract -and [string]::Equals($expectedRoot, $actualRoot, [StringComparison]::OrdinalIgnoreCase)
    if ($identityMatches) {
      Write-Ok "Plugin Builder current on port ${PluginBuilderPort}: $($existing.runtimeContract), pid=$($existing.processId)"
      return
    }
    Write-Warn "Plugin Builder is stale or from another checkout: contract=$($existing.runtimeContract), root=$actualRoot"
    try {
      $owner = Get-NetTCPConnection -State Listen -LocalPort $PluginBuilderPort -ErrorAction Stop | Select-Object -First 1
      if ($owner -and $owner.OwningProcess) {
        Stop-Process -Id $owner.OwningProcess -Force -ErrorAction Stop
        Write-Ok "Stopped stale Plugin Builder pid $($owner.OwningProcess)"
        Start-Sleep -Milliseconds 700
      }
    } catch {
      throw "Could not stop stale Plugin Builder on port ${PluginBuilderPort}: $($_.Exception.Message)"
    }
  }

  Write-Step "Launching Plugin Builder MCP service"

  Start-Process `
    -FilePath "node" `
    -ArgumentList @("src/mcp/server.js", "--http") `
    -WorkingDirectory $PluginBuilderDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $PluginBuilderLog `
    -RedirectStandardError $PluginBuilderErr

  $health = $null
  for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $health = Invoke-RestMethod -Uri "$PluginBuilderUrl/health" -Method GET -TimeoutSec 2
      if ($health.ok -and $health.runtimeContract -eq $ExpectedPluginBuilderContract) {
        $actualRoot = [IO.Path]::GetFullPath([string]$health.builderRoot).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
        if ([string]::Equals($expectedRoot, $actualRoot, [StringComparison]::OrdinalIgnoreCase)) {
          Write-Ok "Plugin Builder ready: $($health.runtimeContract), pid=$($health.processId)"
          return
        }
      }
    } catch {}
  }

  Write-Warn "Plugin Builder failed current-source health verification"
  Write-Warn "Expected contract: $ExpectedPluginBuilderContract"
  Write-Warn "Expected root: $expectedRoot"
  if ($health) {
    Write-Warn "Actual contract/root: $($health.runtimeContract) / $($health.builderRoot)"
  }
  Write-Warn "Check logs:"
  Write-Warn $PluginBuilderLog
  Write-Warn $PluginBuilderErr
  throw "Plugin Builder failed current-source health check"
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

function Get-BridgeProject($Health, $Id) {
  if (-not $Health -or -not $Health.projects) { return $null }
  return @($Health.projects) | Where-Object { $_.id -eq $Id } | Select-Object -First 1
}

function Test-AxiomBridgeCurrent($Health) {
  $missing = @()
  if (-not ($Health -and $Health.ok)) {
    return [pscustomobject]@{ Ok = $false; Reason = "bridge_health_missing"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
  }
  if ($Health.bridgeVersion -ne $ExpectedBridgeVersion) {
    return [pscustomobject]@{ Ok = $false; Reason = "bridge_version_stale:$($Health.bridgeVersion)"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
  }
  if ($Health.runtimeContract -ne $ExpectedRuntimeContract) {
    return [pscustomobject]@{ Ok = $false; Reason = "runtime_identity_missing_or_stale:$($Health.runtimeContract)"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
  }
  if ($Health.mapIntentPreflightContract -ne $ExpectedMapIntentPreflightContract) {
    return [pscustomobject]@{ Ok = $false; Reason = "map_intent_preflight_missing_or_stale:$($Health.mapIntentPreflightContract)"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
  }
  if ($Health.agentIntentContract -ne $ExpectedAgentIntentContract) {
    return [pscustomobject]@{ Ok = $false; Reason = "agent_intent_contract_missing_or_stale:$($Health.agentIntentContract)"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
  }
  if ($Health.capabilityAcquisitionContract -ne $ExpectedCapabilityAcquisitionContract) {
    return [pscustomobject]@{ Ok = $false; Reason = "capability_acquisition_contract_missing_or_stale:$($Health.capabilityAcquisitionContract)"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
  }
  try {
    $expectedRoot = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $actualRoot = [IO.Path]::GetFullPath([string]$Health.launcherRoot).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    if (-not [string]::Equals($expectedRoot, $actualRoot, [StringComparison]::OrdinalIgnoreCase)) {
      return [pscustomobject]@{ Ok = $false; Reason = "runtime_root_mismatch:$actualRoot"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
    }
  } catch {
    return [pscustomobject]@{ Ok = $false; Reason = "runtime_root_invalid:$($Health.launcherRoot)"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
  }
  foreach ($tool in $RequiredBridgeTools) {
    if (-not (@($Health.mcpTools) -contains $tool)) { $missing += $tool }
  }
  if ($missing.Count -gt 0) {
    return [pscustomobject]@{ Ok = $false; Reason = "bridge_tools_missing:$($missing -join ',')"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
  }
  $blackSky = Get-BridgeProject $Health "black-sky-bound"
  if (-not $blackSky) {
    return [pscustomobject]@{ Ok = $false; Reason = "black_sky_bound_project_missing"; MissingTools = $missing; BlackSky = $null; BlackSkyV2 = $null }
  }
  if ($blackSky.selector -ne $ExpectedBlackSkySelector) {
    return [pscustomobject]@{ Ok = $false; Reason = "black_sky_bound_selector_stale:$($blackSky.selector)"; MissingTools = $missing; BlackSky = $blackSky; BlackSkyV2 = $null }
  }
  if ($blackSky.status -and $blackSky.status -ne "ready") {
    return [pscustomobject]@{ Ok = $false; Reason = "black_sky_bound_not_ready:$($blackSky.status)"; MissingTools = $missing; BlackSky = $blackSky; BlackSkyV2 = $null }
  }
  $blackSkyV2 = Get-BridgeProject $Health "black-sky-bound-v2-demo"
  if (-not $blackSkyV2) {
    return [pscustomobject]@{ Ok = $false; Reason = "black_sky_bound_v2_project_missing"; MissingTools = $missing; BlackSky = $blackSky; BlackSkyV2 = $null }
  }
  if ($blackSkyV2.selector -ne $ExpectedBlackSkyV2Selector) {
    return [pscustomobject]@{ Ok = $false; Reason = "black_sky_bound_v2_selector_stale:$($blackSkyV2.selector)"; MissingTools = $missing; BlackSky = $blackSky; BlackSkyV2 = $blackSkyV2 }
  }
  if ($blackSkyV2.status -and $blackSkyV2.status -ne "ready") {
    return [pscustomobject]@{ Ok = $false; Reason = "black_sky_bound_v2_not_ready:$($blackSkyV2.status)"; MissingTools = $missing; BlackSky = $blackSky; BlackSkyV2 = $blackSkyV2 }
  }
  return [pscustomobject]@{ Ok = $true; Reason = "current"; MissingTools = $missing; BlackSky = $blackSky; BlackSkyV2 = $blackSkyV2 }
}

function Stop-AxiomBridgeProcess {
  param([string]$Reason)
  $stopped = $false
  Write-Warn "AXIOM SSE Bridge is stale ($Reason). Restarting the local bridge from current source."

  if (Test-Path $PidFile) {
    try {
      $pidValue = [int](Get-Content -Path $PidFile -ErrorAction Stop | Select-Object -First 1)
      $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
      if ($proc) {
        Stop-Process -Id $pidValue -Force -ErrorAction Stop
        Write-Ok "Stopped stale AXIOM bridge process from pid file: $pidValue"
        $stopped = $true
      }
    } catch {
      Write-Warn "Could not stop bridge from pid file: $($_.Exception.Message)"
    }
  }

  if (-not $stopped) {
    try {
      $portOwners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
      foreach ($owner in $portOwners) {
        if (-not $owner) { continue }
        $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -match "^node") {
          Stop-Process -Id $owner -Force -ErrorAction Stop
          Write-Ok "Stopped stale node process listening on port ${Port}: $owner"
          $stopped = $true
        }
      }
    } catch {
      Write-Warn "Could not inspect/stop port $Port owner: $($_.Exception.Message)"
    }
  }

  Start-Sleep -Milliseconds 700
  Remove-Item -Path $PidFile -ErrorAction SilentlyContinue
  return $stopped
}

function Test-EditorAssetFresh($Url) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    $text = [string]$r.Content
    $hasEditorShell = $text -match "AXIOM" -and $text -match "AI Native Game Editor"
    $hasFileBridge = $text -match "AXIOM_FILE_MANAGER" -or $text -match "FileManagerPathAwarenessCapability" -or $text -match "FileManagerRuntime"
    $hasAgentActivity = $text -match "agent-activity.js" -and $text -match "agent-activity-surface"
    $hasMapForgeAgentProposal = $text -match "axiom.mapforge-agent-proposal.v1" -and $text -match "Apply to Map Forge"
    $hasLevelDesignSession = $text -match "level-design-session.js" -and $text -match "LevelDesignSessionRuntime"
    $preflight = Invoke-WebRequest -Uri "$BaseUrl/map-intent-preflight.js" -UseBasicParsing -TimeoutSec 5
    $preflightText = [string]$preflight.Content
    $hasMapIntentPreflight = $preflight.StatusCode -ge 200 -and $preflight.StatusCode -lt 300 -and $preflightText -match "axiom.map-intent-preflight.v1" -and $preflightText -match "createMapIntentPreflight"
    $agentIntent = Invoke-WebRequest -Uri "$BaseUrl/natural-language-agent.js" -UseBasicParsing -TimeoutSec 5
    $agentIntentText = [string]$agentIntent.Content
    $hasAgentIntentKernel = $agentIntent.StatusCode -ge 200 -and $agentIntent.StatusCode -lt 300 -and $agentIntentText -match "axiom.agent-intent.v1" -and $agentIntentText -match "interpretAxiomNaturalLanguage"
    $capabilityAcquisition = Invoke-WebRequest -Uri "$BaseUrl/capability-acquisition.js" -UseBasicParsing -TimeoutSec 5
    $capabilityAcquisitionText = [string]$capabilityAcquisition.Content
    $hasCapabilityAcquisition = $capabilityAcquisition.StatusCode -ge 200 -and $capabilityAcquisition.StatusCode -lt 300 -and $capabilityAcquisitionText -match "axiom.capability-acquisition.v1" -and $capabilityAcquisitionText -match "activateAndVerifyCapability"
    return [pscustomobject]@{
      Ok = ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300)
      StatusCode = $r.StatusCode
      HasEditorShell = $hasEditorShell
      HasFileBridge = $hasFileBridge
      HasAgentActivity = $hasAgentActivity
      HasMapForgeAgentProposal = $hasMapForgeAgentProposal
      HasLevelDesignSession = $hasLevelDesignSession
      HasMapIntentPreflight = $hasMapIntentPreflight
      HasAgentIntentKernel = $hasAgentIntentKernel
      HasCapabilityAcquisition = $hasCapabilityAcquisition
      Length = $text.Length
    }
  } catch {
    return [pscustomobject]@{ Ok = $false; StatusCode = 0; HasEditorShell = $false; HasFileBridge = $false; HasAgentActivity = $false; HasMapForgeAgentProposal = $false; HasLevelDesignSession = $false; HasMapIntentPreflight = $false; HasAgentIntentKernel = $false; HasCapabilityAcquisition = $false; Length = 0; Error = $_.Exception.Message }
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
  $bridgeCurrent = Test-AxiomBridgeCurrent $health
  if ($health -and -not $bridgeCurrent.Ok) {
    Stop-AxiomBridgeProcess $bridgeCurrent.Reason | Out-Null
    $health = $null
  }
  if (-not $health) {
    Write-Step "Starting AXIOM SSE Bridge on port $Port"
    $proc = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $Root -WindowStyle Hidden -PassThru -RedirectStandardOutput $ServerLog -RedirectStandardError $ServerErr
    Set-Content -Path $PidFile -Value $proc.Id

    for ($i=0; $i -lt 20; $i++) {
      $health = Test-HttpJson "$BaseUrl/health"
      $bridgeCurrent = Test-AxiomBridgeCurrent $health
      if ($bridgeCurrent.Ok) { break }
      Start-Sleep -Milliseconds 750
    }
  }

  $bridgeCurrent = Test-AxiomBridgeCurrent $health
  if (-not $bridgeCurrent.Ok) {
    Write-Bad "AXIOM SSE Bridge did not pass health check."
    Write-Warn "Bridge readiness reason: $($bridgeCurrent.Reason)"
    Write-Host "Check logs:" -ForegroundColor Yellow
    Write-Host "  $ServerLog"
    Write-Host "  $ServerErr"
    throw "Bridge failed current-source health check"
  }
  Write-Ok "AXIOM SSE Bridge live: $($health.service), version=$($health.bridgeVersion), clients=$($health.clients)"
  Write-Ok "Runtime identity: $($health.runtimeContract), pid=$($health.processId), started=$($health.startedAt)"
  Write-Ok "Runtime source: $($health.launcherRoot)"
  Write-Ok "Black Sky Bound project root: $($bridgeCurrent.BlackSky.selector), status=$($bridgeCurrent.BlackSky.status)"
  Write-Ok "Black Sky Bound v2 project root: $($bridgeCurrent.BlackSkyV2.selector), status=$($bridgeCurrent.BlackSkyV2.status)"

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
  if (-not $editorFresh.HasAgentActivity) {
    throw "Editor asset is stale: Co-Pilot Activity surface is missing (agent-activity.js / agent-activity-surface)"
  }
  if (-not $editorFresh.HasMapForgeAgentProposal) {
    throw "Editor asset is stale: Map Forge agent proposal contract is missing"
  }
  if (-not $editorFresh.HasLevelDesignSession) {
    throw "Editor asset is stale: live level-design session runtime is missing"
  }
  if (-not $editorFresh.HasMapIntentPreflight) {
    throw "Editor asset is stale: Map Intent + Playable-Space Preflight v1 is missing"
  }
  if (-not $editorFresh.HasAgentIntentKernel) {
    throw "Editor asset is stale: natural-language agent intent kernel is missing"
  }
  if (-not $editorFresh.HasCapabilityAcquisition) {
    throw "Editor asset is stale: bounded capability acquisition runtime is missing"
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
