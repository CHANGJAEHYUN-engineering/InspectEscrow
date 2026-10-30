import fs from 'node:fs';
import path from 'node:path';
import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  getAddress,
  keccak256
} from 'ethers';

const pkg = 'packages/phase3c_hardening_20261023';
const rolePlanPath = process.env.PATCH3_ROLE_PLAN ?? `${pkg}/PATCH3_ROLE_PLAN.json`;
const outPath = process.env.PATCH3_DEPLOYMENT_OUT ?? `${pkg}/results/PATCH3_SEPOLIA_DEPLOYMENT.json`;
const rpcUrl = process.env.PATCH3_RPC_URL;
const deployerKey = process.env.PATCH3_DEPLOYER_PRIVATE_KEY;
const authorityKey = process.env.PATCH3_AUTHORITY_PRIVATE_KEY || deployerKey;

if (!rpcUrl) throw new Error('PATCH3_RPC_URL is required');
if (!deployerKey) throw new Error('PATCH3_DEPLOYER_PRIVATE_KEY is required');
if (!fs.existsSync(rolePlanPath)) throw new Error(`Role plan not found: ${rolePlanPath}`);
if (!fs.existsSync('.patch3-build/PATCH3_COMPILE_MANIFEST.json')) {
  throw new Error('Missing .patch3-build. Run compile-patch3.mjs first.');
}

function resolvePlan(plan) {
  const reuse = plan.reuseFromPatch2 ?? {};
  const fresh = plan.newRequired ?? {};
  const roles = {
    supplier: reuse.supplier?.address,
    buyer: reuse.buyer?.address,
    primaryInspector: reuse.primaryInspector?.address,
    backupInspector: reuse.backupInspector?.address,
    externalArbitrator: fresh.externalArbitrator,
    supplierStation: reuse.supplierStation?.address,
    buyerStation: reuse.buyerStation?.address,
    primaryInspectorStation: reuse.primaryInspectorStation?.address,
    backupInspectorStation: fresh.backupInspectorStation,
    externalArbitratorStation: fresh.externalArbitratorStation
  };
  const credentialRegistryAuthority = fresh.credentialRegistryAuthority;
  for (const [key, value] of Object.entries({...roles, credentialRegistryAuthority})) {
    if (!value) throw new Error(`Missing role address: ${key}`);
  }
  const normalized = Object.fromEntries(
    Object.entries(roles).map(([key, value]) => [key, getAddress(value)])
  );
  const authority = getAddress(credentialRegistryAuthority);
  const entries = [...Object.entries(normalized), ['credentialRegistryAuthority', authority]];
  const seen = new Map();
  for (const [key, value] of entries) {
    const lower = value.toLowerCase();
    if (seen.has(lower)) throw new Error(`Address collision: ${key} == ${seen.get(lower)} (${value})`);
    seen.set(lower, key);
  }
  return {roles: normalized, credentialRegistryAuthority: authority};
}

function readArtifact(source, contract) {
  const prefix = `.patch3-build/${source}_${contract}`;
  return {
    abi: JSON.parse(fs.readFileSync(`${prefix}.abi`, 'utf8')),
    bytecode: `0x${fs.readFileSync(`${prefix}.bin`, 'utf8').trim()}`,
    runtime: `0x${fs.readFileSync(`${prefix}.runtime.bin`, 'utf8').trim()}`
  };
}

const plan = resolvePlan(JSON.parse(fs.readFileSync(rolePlanPath, 'utf8')));
const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== 11155111n) {
  throw new Error(`Refusing deployment: expected Sepolia 11155111, got ${network.chainId}`);
}

const deployer = new Wallet(deployerKey, provider);
const authorityWallet = new Wallet(authorityKey, provider);
if (getAddress(authorityWallet.address) !== plan.credentialRegistryAuthority) {
  throw new Error(`Authority private key resolves to ${authorityWallet.address}, expected ${plan.credentialRegistryAuthority}`);
}

const deployerBalance = await provider.getBalance(deployer.address);
if (deployerBalance === 0n) throw new Error(`Deployer ${deployer.address} has zero Sepolia ETH`);

const registryArtifact = readArtifact('CredentialRegistryPatch3.sol', 'CredentialRegistryPatch3');
const escrowArtifact = readArtifact('InspectEscrowPatch3.sol', 'InspectEscrowPatch3');

const registryFactory = new ContractFactory(registryArtifact.abi, registryArtifact.bytecode, deployer);
const registry = await registryFactory.deploy(plan.credentialRegistryAuthority);
const registryDeployTx = registry.deploymentTransaction();
if (!registryDeployTx) throw new Error('Registry deployment transaction missing');
const registryReceipt = await registryDeployTx.wait();
await registry.waitForDeployment();
const registryAddress = getAddress(await registry.getAddress());

const registryAsAuthority = new Contract(registryAddress, registryArtifact.abi, authorityWallet);
const stationKeys = [
  'supplierStation',
  'buyerStation',
  'primaryInspectorStation',
  'backupInspectorStation',
  'externalArbitratorStation'
];

const registrations = [];
for (const key of stationKeys) {
  const station = plan.roles[key];
  const reasonCode = keccak256(Buffer.from(`PATCH3_INITIAL_REGISTER_${key}`));
  const tx = await registryAsAuthority.registerCredential(station, reasonCode);
  const receipt = await tx.wait();
  registrations.push({key, station, txHash: tx.hash, blockNumber: receipt.blockNumber});
  const status = Number(await registryAsAuthority.status(station));
  if (status !== 1) throw new Error(`Credential not ACTIVE after registration: ${key}=${status}`);
}

const escrowFactory = new ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode, deployer);
const escrow = await escrowFactory.deploy(registryAddress);
const escrowDeployTx = escrow.deploymentTransaction();
if (!escrowDeployTx) throw new Error('Escrow deployment transaction missing');
const escrowReceipt = await escrowDeployTx.wait();
await escrow.waitForDeployment();
const escrowAddress = getAddress(await escrow.getAddress());

const readbackVersion = await escrow.CONTRACT_VERSION();
const readbackRegistry = getAddress(await escrow.credentialRegistry());
const readbackAuthority = getAddress(await registryAsAuthority.authority());
if (readbackVersion !== 'PHASE2-PATCH3-CANDIDATE') throw new Error(`Unexpected CONTRACT_VERSION: ${readbackVersion}`);
if (readbackRegistry !== registryAddress) throw new Error('Escrow registry read-back mismatch');
if (readbackAuthority !== plan.credentialRegistryAuthority) throw new Error('Registry authority read-back mismatch');

const registryCode = await provider.getCode(registryAddress);
const escrowCode = await provider.getCode(escrowAddress);
if (registryCode === '0x' || escrowCode === '0x') throw new Error('Deployment code missing on-chain');

const manifest = {
  schema: 'inspectescrow.patch3-sepolia-deployment/1.0.0',
  status: 'DEPLOYED_AND_READBACK_VERIFIED',
  chainId: Number(network.chainId),
  deployedAt: new Date().toISOString(),
  sourceBranch: 'patch3-mentor-hardening',
  contractVersion: readbackVersion,
  deployer: getAddress(deployer.address),
  credentialRegistryAuthority: plan.credentialRegistryAuthority,
  contracts: {
    CredentialRegistryPatch3: {
      address: registryAddress,
      deploymentTxHash: registryDeployTx.hash,
      deploymentBlock: registryReceipt.blockNumber,
      runtimeCodeHash: keccak256(registryCode)
    },
    InspectEscrowPatch3: {
      address: escrowAddress,
      deploymentTxHash: escrowDeployTx.hash,
      deploymentBlock: escrowReceipt.blockNumber,
      runtimeCodeHash: keccak256(escrowCode),
      credentialRegistryReadback: readbackRegistry
    }
  },
  roles: plan.roles,
  credentialRegistrations: registrations,
  assertions: {
    sepoliaChainId: true,
    fiveStationsActive: true,
    contractVersionReadback: true,
    registryPointerReadback: true,
    authorityReadback: true,
    onchainCodePresent: true
  },
  secretBoundary: 'NO_PRIVATE_KEY_OR_RPC_SECRET_WRITTEN'
};

fs.mkdirSync(path.dirname(outPath), {recursive: true});
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({
  status: manifest.status,
  registry: registryAddress,
  escrow: escrowAddress,
  registryTx: registryDeployTx.hash,
  escrowTx: escrowDeployTx.hash,
  output: outPath
}, null, 2));
