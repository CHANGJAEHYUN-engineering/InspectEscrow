// READ-ONLY safety gate before using the generated PATCH3 tradeId in a live proposal.
// No wallet or private key is requested; no transaction can be broadcast by this script.
import fs from 'node:fs';
import {
  Contract, JsonRpcProvider, getAddress, id, keccak256, toUtf8Bytes
} from 'ethers';

const pkg = 'packages/phase3c_hardening_20261023';
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const sameAddr = (a, b) => getAddress(a) === getAddress(b);

const rpc = process.env.PATCH3_RPC_URL;
expect(rpc, 'PATCH3_RPC_URL is required (read-only provider; never enter a private key)');
const manifest = readJson(`${pkg}/results/PATCH3_SEPOLIA_DEPLOYMENT.json`);
const input = readJson(`${pkg}/policy/PATCH3_POLICY_INPUT.json`);
const commitment = readJson(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json`);
const finalPolicy = readJson(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_FINAL.json`);
const preimage = fs.readFileSync(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json`, 'utf8').trimEnd();
const escrowAddr = getAddress(manifest.contracts.InspectEscrowPatch3.address);
const registryAddr = getAddress(manifest.contracts.CredentialRegistryPatch3.address);

expect(manifest.status === 'DEPLOYED_AND_READBACK_VERIFIED', 'Deployment manifest is not verified');
expect(manifest.chainId === 11155111 && input.chainId === 11155111, 'Unexpected chain ID in local artifacts');
expect(sameAddr(input.verifyingContract, escrowAddr), 'Policy input escrow mismatch');
expect(sameAddr(input.credentialRegistry, registryAddr), 'Policy input registry mismatch');
expect(sameAddr(input.credentialAuthority, manifest.credentialRegistryAuthority), 'Authority mismatch');
expect(input.tradeId === commitment.tradeId && input.tradeId === finalPolicy.trade.tradeId, 'TradeId differs across files');
expect(commitment.policyHash === finalPolicy.hashing.policyHash, 'Policy hash differs across files');
expect(commitment.policyVersion === 2 && finalPolicy.policyVersion === 2, 'Expected PATCH3 policyVersion 2');
expect(commitment.selfHashRecomputation === true, 'Generated policy self hash check failed');
expect(keccak256(toUtf8Bytes(preimage)) === commitment.policyHash, 'Canonical preimage does not match generated policy hash');
expect(sameAddr(commitment.verifyingContract, escrowAddr), 'Commitment verifying contract mismatch');
expect(sameAddr(commitment.credentialRegistry, registryAddr), 'Commitment registry mismatch');

const provider = new JsonRpcProvider(rpc);
const network = await provider.getNetwork();
expect(network.chainId === 11155111n, 'RPC is not connected to Sepolia');
for (const [name, address, runtimeHash] of [
  ['Escrow', escrowAddr, manifest.contracts.InspectEscrowPatch3.runtimeCodeHash],
  ['Registry', registryAddr, manifest.contracts.CredentialRegistryPatch3.runtimeCodeHash]
]) {
  const code = await provider.getCode(address);
  expect(code !== '0x', `${name} is missing on-chain code`);
  expect(keccak256(code) === runtimeHash, `${name} runtime code hash differs from deployment manifest`);
}

const escrowAbi = readJson('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const registryAbi = readJson('.patch3-build/CredentialRegistryPatch3.sol_CredentialRegistryPatch3.abi');
const escrow = new Contract(escrowAddr, escrowAbi, provider);
const registry = new Contract(registryAddr, registryAbi, provider);

expect((await escrow.CONTRACT_VERSION()) === 'PHASE2-PATCH3-CANDIDATE', 'Unexpected contract version');
expect(sameAddr(await escrow.credentialRegistry(), registryAddr), 'On-chain registry pointer mismatch');
expect(sameAddr(await registry.authority(), input.credentialAuthority), 'On-chain authority mismatch');
for (const role of ['supplierStation','buyerStation','primaryInspectorStation','backupInspectorStation','externalArbitratorStation']) {
  expect(Number(await registry.status(input.roles[role])) === 1, `${role} is not ACTIVE`);
}
expect(await escrow.accountingConserved(), 'Accounting invariant is not conserved');
expect(await escrow.balanceCoversLiabilities(), 'Escrow balance does not cover liabilities');

// This contract deliberately reverts with TradeNotFound() when a trade is unused.
// Other reverts/RPC failures must NOT be interpreted as evidence of unused status.
let state = null;
try {
  state = await escrow.getTradeState(input.tradeId);
} catch (err) {
  const data = err?.data ?? err?.error?.data ?? err?.info?.error?.data;
  const isNotFound = err?.revert?.name === 'TradeNotFound' ||
    (typeof data === 'string' && data.slice(0, 10).toLowerCase() === id('TradeNotFound()').slice(0, 10).toLowerCase());
  if (!isNotFound) throw new Error('TradeId usage check is INCONCLUSIVE (RPC/revert not recognized): ' + (err?.shortMessage ?? err?.message));
}
expect(state === null, `TradeId already exists on-chain (state ${state}); refuse reuse`);

console.log(JSON.stringify({
  status: 'PASS_READ_ONLY_TRADE_PREFLIGHT',
  chainId: Number(network.chainId),
  registry: registryAddr,
  escrow: escrowAddr,
  tradeId: input.tradeId,
  tradeIdUnused: true,
  policyVersion: commitment.policyVersion,
  policyHash: commitment.policyHash,
  runtimeHashes: 'MATCH_DEPLOYMENT_MANIFEST',
  stationCredentials: '5_ACTIVE',
  accountingConserved: true,
  balanceCoversLiabilities: true,
  broadcastTransactions: 0
}, null, 2));
