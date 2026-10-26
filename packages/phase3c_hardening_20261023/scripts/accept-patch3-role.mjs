// PATCH3 Sepolia policy/inspector acceptance. Safe-by-default, one role per invocation.
// Examples:
// node .../accept-patch3-role.mjs supplier
// node .../accept-patch3-role.mjs supplier --broadcast
// No private key is needed for read-only checks; never log/store secrets.
import fs from 'node:fs';
import {
  Contract, JsonRpcProvider, Wallet, getAddress,
  keccak256, toUtf8Bytes, formatEther
} from 'ethers';

const pkg='packages/phase3c_hardening_20261023';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const requireTrue=(ok,msg)=>{if(!ok)throw new Error(msg);};
const role=process.argv[2];
const extra=process.argv.slice(3);
const roles=['supplier','buyer','primaryInspector','backupInspector','externalArbitrator'];
requireTrue(roles.includes(role),'Expected role: '+roles.join(' | '));
requireTrue(extra.length===0||(extra.length===1&&extra[0]==='--broadcast'),
  'Only --broadcast option is supported');
const broadcast=extra.includes('--broadcast');
const rpc=process.env.PATCH3_RPC_URL;
requireTrue(typeof rpc==='string'&&/^https:\/\//.test(rpc),
  'PATCH3_RPC_URL must be HTTPS Sepolia RPC');

const manifest=read(`${pkg}/results/PATCH3_SEPOLIA_DEPLOYMENT.json`);
const input=read(`${pkg}/policy/PATCH3_POLICY_INPUT.json`);
const policy=read(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_FINAL.json`);
const commitment=read(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json`);
const canonicalPreimage=fs.readFileSync(
  `${pkg}/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json`,'utf8'
).trimEnd();
const abi=read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const escrowAddress=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const tradeId=input.tradeId;
const roleAddress=getAddress(input.roles[role]);
const functionName=(role==='supplier'||role==='buyer')?'acceptPolicy':'acceptInspectorAssignment';
const eventName=functionName==='acceptPolicy'?'PolicyAccepted':'InspectorAssignmentAccepted';
const expectedStateBefore=functionName==='acceptPolicy'?1:2;
const stateAfterAll=functionName==='acceptPolicy'?2:3;

requireTrue(manifest.chainId===11155111 &&
  escrowAddress===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905'),
  'Sepolia PATCH3 escrow deployment mismatch');
requireTrue(policy.policyVersion===2 && commitment.policyVersion===2 &&
  policy.trade.tradeId===tradeId && commitment.tradeId===tradeId,
  'Trade ID / policy version mismatch');
requireTrue(keccak256(toUtf8Bytes(canonicalPreimage))===commitment.policyHash &&
  policy.hashing.policyHash===commitment.policyHash &&
  commitment.selfHashRecomputation===true,'Canonical policy commitment mismatch');
requireTrue(getAddress(policy.trade.verifyingContract)===escrowAddress &&
  getAddress(input.verifyingContract)===escrowAddress,'VerifyingContract mismatch');
requireTrue(getAddress(policy.trade.roles[role])===roleAddress,'Local frozen role mismatch');
requireTrue(policy.trade.escrowAmountWei==='5000000000000000',
  'Frozen escrow terms amount changed');

const provider=new JsonRpcProvider(rpc);
requireTrue((await provider.getNetwork()).chainId===11155111n,'Not Sepolia');
const code=await provider.getCode(escrowAddress);
requireTrue(code!=='0x'&&
  keccak256(code)===manifest.contracts.InspectEscrowPatch3.runtimeCodeHash,
  'Deployed escrow bytecode hash mismatch');
const escrow=new Contract(escrowAddress,abi,provider);
const terms=await escrow.getTradeTerms(tradeId);
requireTrue(terms.policyVersion===2n||Number(terms.policyVersion)===2,
  'Onchain policyVersion is not 2');
requireTrue(terms.policyHash===commitment.policyHash,'Onchain policyHash mismatch');
requireTrue(getAddress(terms[role])===roleAddress,'Onchain '+role+' is not frozen actor');
requireTrue(terms.escrowAmount===5000000000000000n,
  'Onchain amount does not match 0.005 Sepolia ETH');
requireTrue(await escrow.accountingConserved(),'Accounting invariant failed');
requireTrue(await escrow.balanceCoversLiabilities(),'Liability coverage failed');
const state=Number(await escrow.getTradeState(tradeId));
requireTrue(state===expectedStateBefore,
  `Invalid stage: expected ${expectedStateBefore} before ${role} acceptance, got ${state}. Do not repeat acceptance.`);

await escrow[functionName].staticCall(tradeId,{from:roleAddress});
const estimatedGas=await escrow[functionName].estimateGas(tradeId,{from:roleAddress});
const gasLimit=estimatedGas*125n/100n+1n;
requireTrue(gasLimit<=500000n,'Acceptance gas limit exceeds 500,000; manual review required');
const fee=await provider.getFeeData();
const feeCeiling=fee.maxFeePerGas??fee.gasPrice;
requireTrue(feeCeiling!=null&&feeCeiling>0n,'Fee quote missing');
const gasBudget=gasLimit*feeCeiling;
const balance=await provider.getBalance(roleAddress);
requireTrue(balance>=gasBudget,'Role actor does not have enough Sepolia ETH for conservative gas estimate');

console.log(JSON.stringify({
  status:'PASS_READ_ONLY_ROLE_ACCEPTANCE_PRECHECK',
  chainId:11155111,
  role,
  actorAddress:roleAddress,
  functionName,
  tradeId,
  policyHash:commitment.policyHash,
  onchainStateBefore:state,
  balanceEth:formatEther(balance),
  estimatedGas:estimatedGas.toString(),
  gasLimit:gasLimit.toString(),
  gasCeilingWei:feeCeiling.toString(),
  maximumGasBudgetEth:formatEther(gasBudget),
  broadcastRequested:broadcast,
  transactionsSent:0
},null,2));
if(!broadcast){
  console.log('READ-ONLY ACCEPTANCE PRECHECK PASS. No transaction sent.');
  process.exit(0);
}

// The user must intentionally approve this exact role's one transaction.
requireTrue(process.env.PATCH3_ACCEPT_CONFIRM===`ACCEPT_PATCH3_${role}`,
  `Missing exact confirmation: ACCEPT_PATCH3_${role}`);
const privateKey=process.env.PATCH3_ACTOR_PRIVATE_KEY;
requireTrue(typeof privateKey==='string'&&/^0x[0-9a-fA-F]{64}$/.test(privateKey),
  'PATCH3_ACTOR_PRIVATE_KEY is not a valid 0x-prefixed 32-byte key (input not printed)');
let signer;
try { signer=new Wallet(privateKey,provider); }
catch { throw Error('Actor wallet derivation failed (input not printed)'); }
requireTrue(getAddress(signer.address)===roleAddress,
  'Private key does not derive frozen '+role+' actor address');

// Re-check onchain stage and user permissions just before sending.
requireTrue((await provider.getNetwork()).chainId===11155111n,'Network changed');
requireTrue(Number(await escrow.getTradeState(tradeId))===expectedStateBefore,
  'Onchain state changed after preflight; no transaction sent');
await escrow[functionName].staticCall(tradeId,{from:roleAddress});
const writer=new Contract(escrowAddress,abi,signer);
const tx=await writer[functionName](tradeId,{gasLimit});
console.log(JSON.stringify({
  status:'ROLE_ACCEPTANCE_TRANSACTION_SENT',
  role,
  transactionHash:tx.hash,
  explorer:'https://sepolia.etherscan.io/tx/'+tx.hash,
  caution:'Do not rerun --broadcast if confirmation is delayed. Check tx hash first.'
},null,2));
const receipt=await tx.wait(1);
requireTrue(receipt&&Number(receipt.status)===1,
  'Acceptance receipt failed or unavailable; inspect the tx hash before any retry.');
const eventFound=receipt.logs.some(log=>{
  try {
    const decoded=writer.interface.parseLog(log);
    return decoded?.name===eventName &&
      decoded.args?.tradeId===tradeId &&
      getAddress(decoded.args?.[1])===roleAddress;
  } catch { return false; }
});
requireTrue(eventFound,'Expected acceptance event missing; do not retry without investigation.');
const newState=Number(await escrow.getTradeState(tradeId));
requireTrue(newState===expectedStateBefore||newState===stateAfterAll,
  'Unexpected post-acceptance state '+newState);
console.log(JSON.stringify({
  status:'PATCH3_ROLE_ACCEPTANCE_CONFIRMED',
  role,
  transactionHash:tx.hash,
  blockNumber:receipt.blockNumber,
  tradeId,
  newState,
  expectedFinalStage:stateAfterAll,
  event:eventName
},null,2));
