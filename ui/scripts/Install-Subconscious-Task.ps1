$ErrorActionPreference = "Stop"

$TaskName = "AI Pipeline Subconscious Observer"
$Launcher = (Resolve-Path (Join-Path $PSScriptRoot "Start-Subconscious-Hidden.ps1")).Path
$User = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Argument = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Launcher`""

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Argument
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -MultipleInstances IgnoreNew `
  -RestartCount 2 `
  -RestartInterval (New-TimeSpan -Minutes 2)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Description "Runs the local, load-aware AI Pipeline subconscious advisory observer after logon." `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -User $User `
  -RunLevel Limited `
  -Force | Out-Null

Write-Output "Installed scheduled task: $TaskName"
Write-Output "Launcher: $Launcher"
