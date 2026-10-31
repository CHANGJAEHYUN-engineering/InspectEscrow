$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true
$root = $PSScriptRoot
$project = Join-Path $root "InspectEscrow_PATCH3_DEPLOY"
$model = Join-Path $root "InspectEscrow_Live_Demo_v1_FULL\InspectEscrow_Live_Demo_v1"
$lock = Join-Path $model "requirements-lock-windows.txt"
if ($model.Length -gt 120) { throw "INSTALL_PATH_TOO_LONG ($($model.Length) chars). Extract the release to a short local path such as C:\InspectEscrow and retry." }
if (-not (Test-Path -LiteralPath (Join-Path $project "package-lock.json"))) { throw "package-lock.json missing" }
if (-not (Test-Path -LiteralPath (Join-Path $model "requirements.txt"))) { throw "Model B requirements.txt missing" }
if (-not (Test-Path -LiteralPath $lock)) { throw "Model B requirements-lock-windows.txt missing" }
Push-Location $project
try { npm ci --ignore-scripts } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
$python = Get-Command py -ErrorAction SilentlyContinue
if ($python) { & py -3.12 -m venv (Join-Path $model ".venv") } else { & python -m venv (Join-Path $model ".venv") }
if ($LASTEXITCODE -ne 0) { throw "Python venv creation failed with exit code $LASTEXITCODE" }
$venvPython = Join-Path $model ".venv\Scripts\python.exe"
& $venvPython -m pip --version
if ($LASTEXITCODE -ne 0) { throw "venv pip is unavailable (exit code $LASTEXITCODE)" }
& $venvPython -m pip install -r $lock
if ($LASTEXITCODE -ne 0) { throw "Python dependency install failed with exit code $LASTEXITCODE" }
& $venvPython -c "import anomalib, fastapi, uvicorn, torch; print('Python dependencies PASS', torch.__version__)"
if ($LASTEXITCODE -ne 0) { throw "Python dependency import check failed with exit code $LASTEXITCODE" }
$archive = Join-Path $model "model\InspectEscrow_ModelB_BACKUP.zip"
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = "8102cedf082c0d8553ad03372d6dd125daab895ed56d2cad77c4ac0342b0206d"
if ($actual -ne $expected) { throw "Model B archive SHA-256 mismatch" }
Write-Host "INSTALL PASS · locked dependencies and Model archive SHA-256 verified"

