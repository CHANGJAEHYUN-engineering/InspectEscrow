// InspectEscrow PATCH3: READ-ONLY proposal simulation. No signer, no broadcast.
// Run from the repository root after verify-patch3-unused-trade.mjs PASS.
import fs from 'node:fs';
import { Contract, JsonRpcProvider, getAddress, id, keccak256, toUtf8Bytes } from 'ethers';

const pkg = 'packages/phase3c_hardening_20261023';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const rpc = process.env.PATCH3_RPC_URL;
assert(rpc, 'PATCH3_RPC_URL missing; use a Sepolia RPC URL, not a private key');
const policy = read(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_FINAL.json`);
const commitment = read(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json`);
const input = read(`${pkg}/policy/PATCH3_POLICY_INPUT.json`);
const manifest = read(`${pkg}/results/PATCH3_SEPOLIA_DEPLOYMENT.json`);
const abi = read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const preimage = fs.readFileSync(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json`, 'utf8').trimEnd();
const escrowAddress = getAddress(manifest.contracts.InspectEscrowPatch3.address);
assert(keccak256(toUtf8Bytes(preimage)) === policy.hashing.policyHash, 'Policy JCS preimage hash mismatch');
assert(commitment.selfHashRecomputation === true, 'Policy self-hash gate false');
assert(commitment.policyHash === policy.hashing.policyHash, 'Policy commitment mismatch');
assert(policy.policyVersion === 2 && input.tradeId === policy.trade.tradeId, 'Policy version/trade mismatch');
assert(getAddress(policy.trade.verifyingContract) === escrowAddress, 'VerifyingContract mismatch');
assert(policy.trade.escrowAmountWei === input.escrowAmountWei, 'Escrow amount mismatch');
for (const role of Object.keys(input.roles)) {
  assert(getAddress(policy.trade.roles[role]) === getAddress(input.roles[role]), 'Role mismatch: ' + role);
}
const r=policy.trade.roles, ai=policy.ai, capture=policy.capture, product=policy.product;
const windows = input.windowsSeconds, fallback = input.fallbackPolicy;
const outcomes = { RELEASE_TO_SUPPLIER:1, REFUND_TO_BUYER:2 };
const toEnum = value => {assert(Object.hasOwn(outcomes,value),'Invalid fallback '+value);return outcomes[value];};
const terms = {
  tradeId: input.tradeId,
  supplier: r.supplier,
  buyer: r.buyer,
  primaryInspector: r.primaryInspector,
  backupInspector: r.backupInspector,
  externalArbitrator: r.externalArbitrator,
  supplierStation: r.supplierStation,
  buyerStation: r.buyerStation,
  primaryInspectorStation: r.primaryInspectorStation,
  backupInspectorStation: r.backupInspectorStation,
  externalArbitratorStation: r.externalArbitratorStation,
  escrowAmount: BigInt(input.escrowAmountWei),
  policyVersion: Number(policy.policyVersion),
  policyHash: policy.hashing.policyHash,
  modelBundleHash: ai.modelBundleHash,
  captureProfileHash: capture.captureProfileHash,
  productSpecHash: product.productSpecificationHash,
  requiredViewSetHash: capture.requiredViewSetHash,
  scoreSchemaId: ai.scoreSchemaId,
  thresholdScaled: BigInt(ai.thresholdScaled),
  scoreScaleExponent: Number(ai.scoreScaleExponent),
  scoreMinScaled: BigInt(ai.scoreMinimumScaled),
  scoreMaxScaled: BigInt(ai.scoreMaximumScaled),
  maxSupplierRetries: Number(policy.procedure.maxSupplierRetries),
  maxBuyerRetries: Number(policy.procedure.maxBuyerRetries),
  fallbackPolicy: {
    buyerInspectionTimeout: toEnum(fallback.buyerInspectionTimeout),
    executionHold: toEnum(fallback.executionHold),
    evidenceHold: toEnum(fallback.evidenceHold),
    inspectorEscalated: toEnum(fallback.inspectorEscalated)
  },
  windows: {
    supplierInspection: windows.supplierInspection,
    buyerInspection: windows.buyerInspection,
    buyerAcceptance: windows.buyerAcceptance,
    primaryInspector: windows.primaryInspector,
    backupInspector: windows.backupInspector,
    mutualResolution: windows.mutualResolution,
    externalArbitration: windows.externalArbitration
  }
};
assert(terms.escrowAmount===5000000000000000n,'Demo amount is not frozen 0.005 Sepolia ETH');
const provider = new JsonRpcProvider(rpc);
assert((await provider.getNetwork()).chainId===11155111n, 'Expected Sepolia');
const contract = new Contract(escrowAddress,abi,provider);
assert(await contract.accountingConserved(), 'Accounting invariant failed');
assert(await contract.balanceCoversLiabilities(), 'Liability coverage failed');
let unused=false;
try { await contract.getTradeState(input.tradeId); }
catch(e){
  const data=e?.data ?? e?.error?.data ?? e?.info?.error?.data;
  unused=e?.revert?.name==='TradeNotFound' ||
    (typeof data==='string' && data.slice(0,10).toLowerCase()===id('TradeNotFound()').slice(0,10).toLowerCase());
  if(!unused)throw new Error('Trade state check inconclusive: '+(e?.shortMessage??e?.message));
}
assert(unused, 'Trade ID is already on-chain; stop before proposal');
try {
  await contract.proposeTrade.staticCall(terms,{from:r.supplier});
} catch(e) {
  throw new Error('proposeTrade STATICCALL failed: '+(e?.shortMessage??e?.message));
}
const actors=['supplier','buyer','primaryInspector','backupInspector','externalArbitrator'];
const balances=await Promise.all(actors.map(async role=>({
  role,address:r[role],balanceWei:(await provider.getBalance(r[role])).toString()
})));
console.log(JSON.stringify({
 status:'PASS_READ_ONLY_PROPOSAL_SIMULATION',
 chainId:11155111,
 escrow:escrowAddress,
 tradeId:input.tradeId,
 policyHash:terms.policyHash,
 policyVersion:terms.policyVersion,
 escrowAmountWei:terms.escrowAmount.toString(),
 proposedBy:'supplier',
 proposeTradeStaticCall:'PASS',
 tradeIdUnused:true,
 assignedActors:balances,
 requiredNextOnchainActors:['supplier proposeTrade','supplier acceptPolicy','buyer acceptPolicy','primaryInspector acceptInspectorAssignment','backupInspector acceptInspectorAssignment','externalArbitrator acceptInspectorAssignment','buyer fund','anyone activate'],
 broadcastTransactions:0
},null,2));
