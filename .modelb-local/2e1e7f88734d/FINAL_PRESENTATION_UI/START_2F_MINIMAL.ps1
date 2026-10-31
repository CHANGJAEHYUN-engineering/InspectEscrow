param([switch]$OpenBrowser)
$ErrorActionPreference = "Stop"
$uiRoot = $PSScriptRoot
$workspaceRoot = (Resolve-Path (Join-Path $uiRoot "..\..\..\..")).Path
$modelRoot = Join-Path $workspaceRoot "InspectEscrow_Live_Demo_v1_FULL\InspectEscrow_Live_Demo_v1"
$modelPython = Join-Path $modelRoot ".venv\Scripts\python.exe"

$drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$freeGiB = [Math]::Round($drive.FreeSpace / 1GB, 2)
Write-Host "C: free space: $freeGiB GiB"
if ($freeGiB -lt 10) {
  throw "10 GiB 미만입니다. 대형 Model B 프로세스를 시작하지 않습니다."
}
if (-not (Test-Path -LiteralPath $modelPython)) { throw "Model B Python not found: $modelPython" }

function Test-LocalPort([int]$Port) {
  return $null -ne (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-LocalPort 8766)) {
  Start-Process -FilePath $modelPython -ArgumentList @("-m","uvicorn","server:app","--host","127.0.0.1","--port","8766","--log-level","warning") -WorkingDirectory $modelRoot -WindowStyle Hidden
}
if (-not (Test-LocalPort 8770)) {
  Start-Process -FilePath "node" -ArgumentList @("server.cjs") -WorkingDirectory $uiRoot -WindowStyle Hidden
}

$deadline = (Get-Date).AddSeconds(90)
do {
  Start-Sleep -Milliseconds 750
  $uiOk = Test-LocalPort 8770
  $modelOk = Test-LocalPort 8766
} until (($uiOk -and $modelOk) -or (Get-Date) -gt $deadline)
if (-not ($uiOk -and $modelOk)) { throw "서버가 제한 시간 안에 준비되지 않았습니다. CHECK_2F_HEALTH.ps1을 실행하세요." }

& (Join-Path $uiRoot "CHECK_2F_HEALTH.ps1")
if ($OpenBrowser) { Start-Process "http://127.0.0.1:8770/journey" }
