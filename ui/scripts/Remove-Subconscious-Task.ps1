$ErrorActionPreference = "Stop"

$TaskName = "AI Pipeline Subconscious Observer"
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($null -eq $Task) {
  Write-Output "Scheduled task is not installed: $TaskName"
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Output "Removed scheduled task: $TaskName"
