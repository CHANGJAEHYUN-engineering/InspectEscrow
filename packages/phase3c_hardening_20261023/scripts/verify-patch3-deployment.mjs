import fs from 'node:fs';
import {
  Contract,
  JsonRpcProvider,
  getAddress
} from 'ethers';

const pkg = 'packages/phase3c_hardening_20261023';
const manifestPath = process.env.PATCH3_DEPLOYMENT_MANIFEST ?? `${pkg}/results/PATCH3_SEPOLIA_DEPLOYMENT.json`;
const rpcUrl = process.env.PATCH3_RPC_URL;

if (!rpcUrl) throw new Error('PATCH3_RPC_URL is required');
if (!fs.existsSync(manifestPath)) throw new Error(`Deployment manifest not found: ${manifestPath}`);

function readAbi(source, contract) {
  const p = `.patch3-build/${source}_${contract}.abi`;
  if (!fs.existsSync(p)) throw new Error(`Missing build ABI: ${p}. Run compile-patch3.mjs first.`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== 11155111n) throw new Error(`Expected Sepolia, got ${network.chainId}`);

const registryAddress = getAddress(manifest.contracts.CredentialRegistryPatch3.address);
const escrowAddress = getAddress(manifest.contracts.InspectEscrowPatch3.address);
const registry = new Contract(registryAddress, readAbi('CredentialRegistryPatch3.sol', 'CredentialRegistryPatch3'), provider);
const escrow = new Contract(escrowAddress, readAbi('InspectEscrowPatch3.sol', 'InspectEscrowPatch3'), provider);

const checks = [];
function check(name, ok, detail = null) {
  if (!ok) throw new Error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
  checks.push({name, status: 'PASS', detail});
}

check('chainId', network.chainId === 11155111n);
check('registry code present', (await provider.getCode(registryAddress)) !== '0x');
check('escrow code present', (await provider.getCode(escrowAddress)) !== '0x');
check('contract version', (await escrow.CONTRACT_VERSION()) === 'PHASE2-PATCH3-CANDIDATE');
check('registry pointer', getAddress(await escrow.credentialRegistry()) === registryAddress);
check('authority readback', getAddress(await registry.authority()) === getAddress(manifest.credentialRegistryAuthority));

for (const key of ['supplierStation','buyerStation','primaryInspectorStation','backupInspectorStation','externalArbitratorStation']) {
  const status = Number(await registry.status(manifest.roles[key]));
  check(`${key} ACTIVE`, status === 1, `status=${status}`);
}

check('accountingConserved initial', await escrow.accountingConserved() === true);
check('balanceCoversLiabilities initial', await escrow.balanceCoversLiabilities() === true);

const proof = {
  schema: 'inspectescrow.patch3-deployment-readback/1.0.0',
  verifiedAt: new Date().toISOString(),
  chainId: Number(network.chainId),
  registry: registryAddress,
  escrow: escrowAddress,
  checks
};
console.log(JSON.stringify(proof, null, 2));
