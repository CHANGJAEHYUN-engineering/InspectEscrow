param(
    [string] $Rpc = "https://ethereum-sepolia-rpc.publicnode.com",
    [string] $Escrow = "0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905",
    [string] $Account = "inspectescrow-sepolia",
    [switch] $Broadcast
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command forge -ErrorAction SilentlyContinue)) { throw "forge CLI is required." }
if (-not (Get-Command cast -ErrorAction SilentlyContinue)) { throw "cast CLI is required." }
$chain = & cast chain-id --rpc-url $Rpc
if ($LASTEXITCODE -ne 0 -or $chain.Trim() -ne "11155111") { throw "Sepolia chain ID 11155111 is mandatory." }
if ($Escrow -notmatch "^0x[0-9a-fA-F]{40}$") { throw "Invalid escrow address." }
$escrowCode = & cast code $Escrow --rpc-url $Rpc
if ($LASTEXITCODE -ne 0 -or $escrowCode.Length -lt 100) { throw "Escrow contract not found." }
if (Test-Path ".\deployment.sepolia.json") {
    throw "Deployment record exists. Do not deploy duplicates without reviewing it."
}
& forge build
if ($LASTEXITCODE -ne 0) { throw "Contract compilation failed." }
& forge test -q
if ($LASTEXITCODE -ne 0) { throw "Contract tests failed." }

Write-Host "PRECHECK PASSED: Sepolia, known escrow, contract compilation and local tests." -ForegroundColor Green
Write-Host "Escrow: $Escrow"
Write-Host "Encrypted local Foundry wallet account: $Account"
Write-Host "Existing InspectEscrow contract and all of its funds will be untouched."

if (-not $Broadcast) {
    Write-Host "READ-ONLY PREFLIGHT COMPLETE. No transaction sent." -ForegroundColor Cyan
    Write-Host 'Run the same command with -Broadcast on YOUR PC when ready to enter the encrypted wallet password locally.'
    exit 0
}

Write-Host "BROADCASTING NEW XAI ANCHOR CONTRACT ON SEPOLIA" -ForegroundColor Yellow
Write-Host "You may be prompted for your local encrypted Foundry account password."
$stdout = & forge create src/InspectEscrowXAIAnchor.sol:InspectEscrowXAIAnchor --rpc-url $Rpc --account $Account --constructor-args $Escrow --broadcast --json
if ($LASTEXITCODE -ne 0) { throw "Forge deployment failed; no successful deployment has been confirmed." }
try {
    $result = ($stdout | Out-String) | ConvertFrom-Json
    $contract = $result.deployedTo
    if (-not $contract) { $contract = $result.contractAddress }
    if ($contract -notmatch "^0x[0-9a-fA-F]{40}$") { throw "Cannot parse deployed contract address." }
    $code = & cast code $contract --rpc-url $Rpc
    if ($LASTEXITCODE -ne 0 -or $code.Length -lt 100) { throw "Deployed contract code not verified." }
    $readEscrow = & cast call $contract "escrow()(address)" --rpc-url $Rpc
    if ($LASTEXITCODE -ne 0 -or $readEscrow.Trim().ToLowerInvariant() -ne $Escrow.ToLowerInvariant()) {
        throw "Deployed escrow binding mismatch."
    }
    $manifest = [ordered]@{
        schema = "InspectEscrow.XAIAnchor.Deployment.v1"
        network = "sepolia"
        chainId = 11155111
        address = $contract
        escrow = $Escrow
        transactionHash = $result.transactionHash
        createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        status = "DEPLOYED_ONCHAIN_CODE_VERIFIED"
        notes = "Supplemental XAI SHA-256 anchor only. Does not alter escrow or adjudicate product quality."
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ".\deployment.sepolia.json" -Encoding UTF8
    Write-Host "SUCCESS. XAI Anchor deployed and escrow readback verified." -ForegroundColor Green
    Write-Host "Contract: $contract"
    Write-Host "Etherscan: https://sepolia.etherscan.io/address/$contract"
} catch {
    Write-Warning "Broadcast returned but post-deployment verification or manifest parsing failed."
    Write-Warning "Inspect the preceding Forge output / wallet TX before sending another deployment."
    throw
}
