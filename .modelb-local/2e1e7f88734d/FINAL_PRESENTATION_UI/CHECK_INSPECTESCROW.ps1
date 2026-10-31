$ErrorActionPreference = "Stop"
$checks = @(
  @{ Name="Unified UI"; Url="http://127.0.0.1:8770/api/ping" },
  @{ Name="Model B"; Url="http://127.0.0.1:8766/api/status" },
  @{ Name="Journey"; Url="http://127.0.0.1:8770/journey" },
  @{ Name="New trade"; Url="http://127.0.0.1:8770/new-trade" },
  @{ Name="Evidence"; Url="http://127.0.0.1:8770/evidence" },
  @{ Name="Replay"; Url="http://127.0.0.1:8770/replay" },
  @{ Name="Resolution"; Url="http://127.0.0.1:8770/resolution" }
)
$results = foreach ($check in $checks) {
  try { $r=Invoke-WebRequest -Uri $check.Url -TimeoutSec 15 -UseBasicParsing; [pscustomobject]@{Service=$check.Name;Status="PASS";Http=$r.StatusCode;Url=$check.Url} }
  catch { [pscustomobject]@{Service=$check.Name;Status="FAIL";Http="-";Url=$check.Url;Detail=$_.Exception.Message} }
}
$results | Format-Table -AutoSize
$status=Invoke-RestMethod -Uri "http://127.0.0.1:8766/api/status" -TimeoutSec 15
if (-not $status.artifact_commitment.verified) { throw "Model B artifact commitment failed" }
if ($status.checkpoint_sha256 -ne "8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854") { throw "Checkpoint hash mismatch" }
if ($results.Status -contains "FAIL") { exit 1 }
Write-Host "HEALTH PASS · no wallet signature or transaction requested"

