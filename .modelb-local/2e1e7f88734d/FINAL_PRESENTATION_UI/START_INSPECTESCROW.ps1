param([switch]$OpenBrowser)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$project = Join-Path $root "InspectEscrow_PATCH3_DEPLOY"
$ui = Join-Path $project ".modelb-local\2e1e7f88734d\FINAL_PRESENTATION_UI"
$model = Join-Path $root "InspectEscrow_Live_Demo_v1_FULL\InspectEscrow_Live_Demo_v1"
$python = Join-Path $model ".venv\Scripts\python.exe"
$drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$freeGiB = [Math]::Round($drive.FreeSpace / 1GB, 2)
if ($freeGiB -lt 10) { throw "C: free space $freeGiB GiB < 10 GiB safety gate" }
if (-not (Test-Path -LiteralPath (Join-Path $project "node_modules\ethers"))) { throw "Run INSTALL_DEPENDENCIES.ps1 first (ethers missing)" }
if (-not (Test-Path -LiteralPath $python)) { throw "Run INSTALL_DEPENDENCIES.ps1 first (Python venv missing)" }
$archive = Join-Path $model "model\InspectEscrow_ModelB_BACKUP.zip"
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne "8102cedf082c0d8553ad03372d6dd125daab895ed56d2cad77c4ac0342b0206d") { throw "Model B archive SHA mismatch" }
function Test-Port([int]$Port) { return $null -ne (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }
$runtime = Join-Path $root ".runtime"
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$pids = [ordered]@{ generatedAt=(Get-Date -Format o); model=$null; web=$null }
if (-not (Test-Port 8766)) {
  $p = Start-Process -FilePath $python -ArgumentList @("-m","uvicorn","server:app","--host","127.0.0.1","--port","8766","--log-level","warning") -WorkingDirectory $model -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime "modelb.stdout.log") -RedirectStandardError (Join-Path $runtime "modelb.stderr.log") -PassThru
  $pids.model = $p.Id
}
if (-not (Test-Port 8770)) {
  $p = Start-Process -FilePath "node" -ArgumentList @("server.cjs") -WorkingDirectory $ui -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime "web.stdout.log") -RedirectStandardError (Join-Path $runtime "web.stderr.log") -PassThru
  $pids.web = $p.Id
}
$pids | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime "pids.json") -Encoding UTF8
$deadline = (Get-Date).AddSeconds(120)
do { Start-Sleep -Milliseconds 750; $ready=(Test-Port 8766) -and (Test-Port 8770) } until ($ready -or (Get-Date) -gt $deadline)
if (-not $ready) { throw "Startup timeout; inspect .runtime logs" }
& (Join-Path $root "CHECK_INSPECTESCROW.ps1")
if ($OpenBrowser) { Start-Process "http://127.0.0.1:8770/journey" }

