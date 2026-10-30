import fs from 'node:fs';
import {
  JsonRpcProvider,
  Wallet,
  formatEther,
  getAddress
} from 'ethers';

const pkg = 'packages/phase3c_hardening_20261023';
const rolePlanPath = process.env.PATCH3_ROLE_PLAN ?? `${pkg}/PATCH3_ROLE_PLAN.json`;
const rpcUrl = process.env.PATCH3_RPC_URL;
const privateKey = process.env.PATCH3_DEPLOYER_PRIVATE_KEY;

if (!rpcUrl) throw new Error('PATCH3_RPC_URL is required');
if (!privateKey) throw new Error('PATCH3_DEPLOYER_PRIVATE_KEY is required');
if (!fs.existsSync(rolePlanPath)) throw new Error(`Role plan not found: ${rolePlanPath}`);

const plan = JSON.parse(fs.readFileSync(rolePlanPath, 'utf8'));
const expectedAuthority = getAddress(plan.newRequired?.credentialRegistryAuthority);
const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== 11155111n) {
  throw new Error(`Refusing preflight: expected Sepolia chainId 11155111, got ${network.chainId}`);
}

const wallet = new Wallet(privateKey, provider);
const actual = getAddress(wallet.address);
if (actual !== expectedAuthority) {
  throw new Error(`Deployer/Authority address mismatch: private key resolves to ${actual}, frozen authority is ${expectedAuthority}`);
}

const [balance, nonce, feeData] = await Promise.all([
  provider.getBalance(actual),
  provider.getTransactionCount(actual, 'pending'),
  provider.getFeeData()
]);

if (balance === 0n) {
  throw new Error(`Authority/deployer ${actual} has zero Sepolia ETH`);
}

const feeCeiling = feeData.maxFeePerGas ?? feeData.gasPrice;
if (feeCeiling == null || feeCeiling <= 0n) {
  throw new Error('Could not obtain a usable Sepolia fee ceiling from RPC');
}

// Conservative envelope for:
// Registry deploy + 5 credential registrations + large Escrow deploy + safety margin.
// This is a preflight budget, not a claim about exact gas consumption.
const estimatedTransactionGasEnvelope = 8_000_000n;
const safetyNumerator = 125n;
const safetyDenominator = 100n;
const recommendedBudgetWei =
  estimatedTransactionGasEnvelope * feeCeiling * safetyNumerator / safetyDenominator;

if (balance < recommendedBudgetWei) {
  throw new Error(
    `Insufficient conservative Sepolia deployment budget: balance=${formatEther(balance)} ETH, ` +
    `recommended>=${formatEther(recommendedBudgetWei)} ETH at current fee ceiling`
  );
}

const result = {
  schema: 'inspectescrow.patch3-wallet-preflight/1.1.0',
  status: 'PASS',
  chainId: Number(network.chainId),
  authorityAndDeployer: actual,
  balanceWei: balance.toString(),
  balanceEth: formatEther(balance),
  pendingNonce: nonce,
  feeData: {
    gasPriceWei: feeData.gasPrice?.toString() ?? null,
    maxFeePerGasWei: feeData.maxFeePerGas?.toString() ?? null,
    maxPriorityFeePerGasWei: feeData.maxPriorityFeePerGas?.toString() ?? null
  },
  deploymentBudget: {
    gasEnvelope: estimatedTransactionGasEnvelope.toString(),
    safetyPercent: 125,
    feeCeilingWei: feeCeiling.toString(),
    recommendedBudgetWei: recommendedBudgetWei.toString(),
    recommendedBudgetEth: formatEther(recommendedBudgetWei),
    balanceCoversRecommendedBudget: true,
    note: 'Conservative preflight envelope only; actual gas can differ.'
  },
  assertions: {
    sepoliaChain: true,
    privateKeyMatchesFrozenAuthority: true,
    nonzeroSepoliaBalance: true,
    balanceCoversConservativeDeploymentBudget: true
  },
  secretBoundary: 'PRIVATE_KEY_NOT_PRINTED_OR_WRITTEN'
};

console.log(JSON.stringify(result, null, 2));
