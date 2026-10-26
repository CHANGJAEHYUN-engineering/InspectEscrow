param(
    [switch]$Broadcast
)

$ErrorActionPreference = "Stop"
$Pkg = "packages/phase3c_hardening_20261023"
$RolePlan = "$Pkg/PATCH3_ROLE_PLAN.json"

function Invoke-Checked {
    param(
        [Parameter(Mandatory=$true)][string]$Label,
        [Parameter(Mandatory=$true)][scriptblock]$Command
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

if (-not (Test-Path $RolePlan)) {
    throw "Missing $RolePlan. Run from the InspectEscrow repository root."
}

Write-Host "=== InspectEscrow PATCH3 Sepolia Finalization ==="
Write-Host "Default mode is READ-ONLY preflight. Use -Broadcast only when you intend to send Sepolia transactions."
Write-Host ""

$rpc = Read-Host "Sepolia RPC URL"
$secureKey = Read-Host "Credential Registry Authority / Deployer private key" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

    $env:PATCH3_RPC_URL = $rpc
    $env:PATCH3_DEPLOYER_PRIVATE_KEY = $plainKey
    $env:PATCH3_ROLE_PLAN = $RolePlan
    $env:PATCH3_DEPLOYMENT_OUT = "$Pkg/results/PATCH3_SEPOLIA_DEPLOYMENT.json"
    $env:PATCH3_DEPLOYMENT_MANIFEST = "$Pkg/results/PATCH3_SEPOLIA_DEPLOYMENT.json"
    $env:PATCH3_POLICY_INPUT_OUT = "$Pkg/policy/PATCH3_POLICY_INPUT.json"

    Write-Host ""
    Write-Host "[1/5] Installing pinned local dependencies..."
    Invoke-Checked "npm dependency installation" {
        npm install --no-save solc@0.8.26 @openzeppelin/contracts@5.5.0 ethers@6.15.0
    }

    Write-Host ""
    Write-Host "[2/5] Validating frozen public role plan..."
    Invoke-Checked "PATCH3 role-plan validation" {
        node "$Pkg/scripts/validate-patch3-role-plan.mjs" $RolePlan
    }

    Write-Host ""
    Write-Host "[3/5] Compiling frozen PATCH3 candidate..."
    Invoke-Checked "PATCH3 compilation" {
        node "$Pkg/scripts/compile-patch3.mjs"
    }

    Write-Host ""
    Write-Host "[4/5] Read-only wallet / chain / balance preflight..."
    Invoke-Checked "PATCH3 wallet preflight" {
        node "$Pkg/scripts/preflight-patch3-wallet.mjs"
    }

    if (-not $Broadcast) {
        Write-Host ""
        Write-Host "READ-ONLY PREFLIGHT COMPLETE — PASS."
        Write-Host "No transaction was sent."
        Write-Host "Re-run the same script with -Broadcast only after reviewing the preflight output."
        exit 0
    }

    Write-Host ""
    Write-Host "BROADCAST MODE ENABLED."
    $confirm = Read-Host "Type DEPLOY_PATCH3_SEPOLIA exactly to continue"
    if ($confirm -ne "DEPLOY_PATCH3_SEPOLIA") {
        throw "Broadcast cancelled: confirmation phrase did not match."
    }

    Write-Host ""
    Write-Host "[5/5] Deploying Registry + 5 credentials + Escrow..."
    Invoke-Checked "PATCH3 Sepolia deployment" {
        node "$Pkg/scripts/deploy-patch3-sepolia.mjs"
    }

    Write-Host ""
    Write-Host "Verifying deployed contracts by read-back..."
    Invoke-Checked "PATCH3 deployment read-back verification" {
        node "$Pkg/scripts/verify-patch3-deployment.mjs"
    }

    Write-Host ""
    Write-Host "Building policy v1.2 input from actual deployment..."
    Invoke-Checked "PATCH3 policy input build" {
        node "$Pkg/scripts/build-patch3-policy-input.mjs"
    }

    Write-Host ""
    Write-Host "Generating final PATCH3 policy commitment..."
    Invoke-Checked "PATCH3 policy commitment generation" {
        node "$Pkg/policy/generate-patch3-policy.mjs" "$Pkg/policy/PATCH3_POLICY_INPUT.json"
    }

    Write-Host ""
    Write-Host "PATCH3 DEPLOYMENT + READBACK + POLICY GENERATION COMPLETE."
    Write-Host "Do not call PATCH3 proven yet: funded E2E and mandatory negative proofs are still required."
}
finally {
    $env:PATCH3_DEPLOYER_PRIVATE_KEY = $null
    $env:PATCH3_AUTHORITY_PRIVATE_KEY = $null
    $env:PATCH3_RPC_URL = $null
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $plainKey = $null
    $secureKey = $null
}
