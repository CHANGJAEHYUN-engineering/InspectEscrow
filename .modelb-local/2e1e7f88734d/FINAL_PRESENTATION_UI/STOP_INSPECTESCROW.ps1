$ErrorActionPreference = "Stop"
$pidFile = Join-Path $PSScriptRoot ".runtime\pids.json"
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host "No package PID record; nothing stopped"; exit 0 }
$record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
foreach ($id in @($record.model,$record.web)) {
  if (-not $id) { continue }
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($p -and $p.ProcessName -in @("node","python","pythonw")) { Stop-Process -Id $id; Write-Host "Stopped recorded process $id ($($p.ProcessName))" }
}
[pscustomobject]@{stoppedAt=(Get-Date -Format o);model=$record.model;web=$record.web} | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8

