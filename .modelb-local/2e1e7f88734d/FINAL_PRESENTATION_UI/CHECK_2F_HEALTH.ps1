$ErrorActionPreference = "Stop"
$checks = @(
  @{ Name="Unified UI"; Url="http://127.0.0.1:8770/api/ping" },
  @{ Name="Model B"; Url="http://127.0.0.1:8766/api/status" },
  @{ Name="New trade"; Url="http://127.0.0.1:8770/new-trade" },
  @{ Name="Live inspection"; Url="http://127.0.0.1:8770/live" },
  @{ Name="Journey"; Url="http://127.0.0.1:8770/journey" }
)
$results = foreach ($check in $checks) {
  try {
    $response = Invoke-WebRequest -Uri $check.Url -Method Get -TimeoutSec 12 -UseBasicParsing
    [pscustomobject]@{ Service=$check.Name; Status="PASS"; Http=$response.StatusCode; Url=$check.Url }
  } catch {
    [pscustomobject]@{ Service=$check.Name; Status="FAIL"; Http="-"; Url=$check.Url; Detail=$_.Exception.Message }
  }
}
$results | Format-Table -AutoSize
if ($results.Status -contains "FAIL") { exit 1 }
