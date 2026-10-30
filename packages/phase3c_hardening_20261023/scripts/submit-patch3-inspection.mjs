// PATCH3 Supplier/Buyer trade-bound inspection relayer. SAFE BY DEFAULT.
// node .../submit-patch3-inspection.mjs supplier|buyer                 -> READ ONLY
// node .../submit-patch3-inspection.mjs supplier|buyer --broadcast     -> transaction
// --broadcast is forbidden before exact respective inspection stage.
// Private key is read only for explicit --broadcast from local environment.
// Original AI evidence is public-demo material, NOT physical same-specimen proof.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  AbiCoder,Contract,JsonRpcProvider,Wallet,TypedDataEncoder,verifyTypedData,
  formatEther,getAddress,id,keccak256,toUtf8Bytes
} from 'ethers';

const base='packages/phase3c_hardening_20261023';
const role=process.argv[2];
const args=process.argv.slice(3);
function demand(ok,message){if(!ok)throw Error(message);}
demand(['supplier','buyer'].includes(role),
  'Usage: node .../submit-patch3-inspection.mjs supplier|buyer [--broadcast]');
demand(args.length===0||(args.length===1&&args[0]==='--broadcast'),
  'Only optional --broadcast is supported');
const broadcast=args[0]==='--broadcast';
const rpc=process.env.PATCH3_RPC_URL;
demand(typeof rpc==='string'&&/^https:\/\//.test(rpc),'PATCH3_RPC_URL must be an HTTPS Sepolia RPC');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const jcs=value=>{
  if(value===null)return 'null';
  if(typeof value==='string')return JSON.stringify(value);
  if(typeof value==='boolean')return value?'true':'false';
  if(typeof value==='number'){
    demand(Number.isSafeInteger(value),'Evidence has an unsafe JSON number');
    return String(value);
  }
  if(Array.isArray(value))return '['+value.map(jcs).join(',')+']';
  if(typeof value==='object'&&value)
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+jcs(value[k])).join(',')+'}';
  throw Error('Unsupported JSON evidence value');
};
const jsonKeccak=v=>keccak256(toUtf8Bytes(jcs(v)));
const fileSha256=p=>'0x'+createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const input=read(base+'/policy/PATCH3_POLICY_INPUT.json');
const policy=read(base+'/policy/generated/PATCH3_POLICY_V1_2_FINAL.json');
const commitment=read(base+'/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json');
const manifest=read(base+'/results/PATCH3_SEPOLIA_DEPLOYMENT.json');
const abi=read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const regAbi=read('.patch3-build/CredentialRegistryPatch3.sol_CredentialRegistryPatch3.abi');
const tradeId=input.tradeId;
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const stationRole=role+'Station';
const actor=getAddress(input.roles[role]);
const station=getAddress(input.roles[stationRole]);
const roleIndex=role==='supplier'?0:1;
const stage=role==='supplier'?5:8;
const nextStage=role==='supplier'?8:12;
const expectedOutcome=role==='supplier'?2:3; // InspectionOutcome enum, ADMISSIBLE_PASS / REVIEW.
const dir='.patch3-local/'+tradeId.slice(2,14);
const preparedPath=path.join(dir,role+'.prepared.json');
const signedPath=path.join(dir,role+'.signed.json');
demand(fs.existsSync(preparedPath)&&fs.existsSync(signedPath),
  'Missing prepared/signed '+role+' evidence. DO NOT ACTIVATE.');
const prepared=read(preparedPath);
const signed=read(signedPath);
demand(addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905')&&
  manifest.chainId===11155111&&input.chainId===11155111,
  'Incorrect PATCH3 deployment/network');
demand(policy.policyVersion===2&&commitment.policyVersion===2&&
  policy.hashing.policyHash===commitment.policyHash&&
  policy.trade.tradeId===tradeId&&commitment.tradeId===tradeId,
  'Policy commitment / trade mismatch');
const policyPreimage=fs.readFileSync(base+'/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json','utf8').trimEnd();
demand(keccak256(toUtf8Bytes(policyPreimage))===commitment.policyHash &&
  commitment.selfHashRecomputation===true,'Policy preimage hash mismatch');
demand(prepared.schema==='inspectescrow.patch3.staged-demo-evidence/1'&&
  prepared.roleName===role&&prepared.roleIndex===roleIndex &&
  prepared.tradeId===tradeId&&
  getAddress(prepared.actor)===actor&&getAddress(prepared.station)===station,
  'Prepared envelope is wrong role, actor or trade');
demand(signed.schema==='inspectescrow.patch3.station-signed-demo/1'&&
  signed.roleName===role&&signed.tradeId===tradeId&&
  getAddress(signed.actor)===actor&&getAddress(signed.station)===station,
  'Signed envelope is wrong role/actor/station/trade');
demand(prepared.specimenManifestHash===jsonKeccak(prepared.specimenManifest)&&
  prepared.evidencePackageHash===jsonKeccak(prepared.evidencePackage)&&
  prepared.evidencePackage.specimenManifestHash===prepared.specimenManifestHash,
  'Prepared specimen/evidence hash fails integrity');
const aiPath='packages/ai_20261010/ai/evidence/canonical/'+
  (role==='supplier'?'demo__good__000__ai_evidence.json':'demo__scratch__022__ai_evidence.json');
demand(prepared.sourceAiFile===aiPath &&
  prepared.evidencePackage.sourceAi.sourceFileSha256===fileSha256(aiPath),
  'Frozen AI source has changed');
demand(prepared.evidencePackage.sourceAi.declaredAiEvidenceSha256===read(aiPath).evidence_sha256,
  'Declared frozen AI SHA256 mismatch');
demand(prepared.specimenManifest.binding.tradeId===tradeId&&
  prepared.evidencePackage.binding.tradeId===tradeId&&
  prepared.evidencePackage.binding.policyHash===commitment.policyHash&&
  prepared.evidencePackage.binding.role===roleIndex&&
  getAddress(prepared.evidencePackage.binding.station)===station,
  'Role- and trade-specific evidence binding mismatch');
demand(signed.specimenManifestHash===prepared.specimenManifestHash&&
  signed.evidencePackageHash===prepared.evidencePackageHash,
  'Signed envelope evidence anchor mismatch');
const provider=new JsonRpcProvider(rpc);
demand((await provider.getNetwork()).chainId===11155111n,'RPC is not Sepolia');
const runtime=await provider.getCode(addr);
demand(runtime!=='0x'&&
  keccak256(runtime)===manifest.contracts.InspectEscrowPatch3.runtimeCodeHash,
  'PATCH3 deployed runtime code hash mismatch');
const escrow=new Contract(addr,abi,provider);
const registry=new Contract(manifest.contracts.CredentialRegistryPatch3.address,regAbi,provider);
const onchainTerms=await escrow.getTradeTerms(tradeId);
demand(onchainTerms.policyHash===commitment.policyHash &&
  Number(onchainTerms.policyVersion)===2 &&
  onchainTerms.escrowAmount===5000000000000000n &&
  getAddress(onchainTerms[role])===actor &&
  getAddress(onchainTerms[stationRole])===station,
  'Onchain frozen terms mismatch');
demand(await escrow.accountingConserved()&&await escrow.balanceCoversLiabilities(),
  'Escrow accounting invariant failed');
demand(Number(await registry.status(station))===1,'Station credential is not ACTIVE');
const onchainDomain=await escrow.eip712Domain();
const domain=signed.domain;
demand(onchainDomain.name===domain.name && domain.name==='InspectEscrow' &&
  onchainDomain.version===domain.version && domain.version==='1' &&
  onchainDomain.chainId===BigInt(domain.chainId)&&BigInt(domain.chainId)===11155111n &&
  getAddress(onchainDomain.verifyingContract)===addr&&
  getAddress(domain.verifyingContract)===addr,
  'EIP712 domain mismatch');
const fields=abi.find(x=>x.type==='function'&&x.name==='hashStationAttestation')
  ?.inputs[0].components.map(x=>({name:x.name,type:x.type}));
demand(fields?.length===16 &&
  JSON.stringify(fields)===JSON.stringify(signed.types.StationAttestation)&&
  JSON.stringify(fields)===JSON.stringify(prepared.types.StationAttestation),
  'Typed data StationAttestation field/types mismatch');
const typehash=id('StationAttestation('+fields.map(x=>x.type+' '+x.name).join(',')+')');
demand(typehash===await escrow.STATION_ATTESTATION_TYPEHASH(),'Station typehash mismatch');
const message=signed.message;
for(const field of fields.map(x=>x.name).filter(k=>!['sessionNonce','issuedAt','validUntil'].includes(k))){
  demand(String(message[field]).toLowerCase()===String(prepared.messageBase[field]).toLowerCase(),
    'Signed field differs from prepared: '+field);
}
demand(message.tradeId===tradeId&&message.role===roleIndex&&message.attempt===1 &&
  getAddress(message.station)===station&&message.policyHash===commitment.policyHash &&
  message.modelBundleHash===onchainTerms.modelBundleHash &&
  message.captureProfileHash===onchainTerms.captureProfileHash &&
  message.scoreSchemaId===onchainTerms.scoreSchemaId &&
  message.inspectionValidity===0&&message.invalidReason===0,
  'Onchain policy/inspection commitments mismatch');
const score=BigInt(message.aggregateScoreScaled);
demand(score>=onchainTerms.scoreMinScaled&&score<=onchainTerms.scoreMaxScaled &&
  (score<onchainTerms.thresholdScaled)===(role==='supplier'),
  'Scoring result invalid for frozen PASS/REVIEW scenario');
const computedDigest=TypedDataEncoder.hash(domain,signed.types,message);
demand(signed.digest===computedDigest &&
  await escrow.hashStationAttestation(message)===computedDigest,
  'EIP712 digest does not match contract');
demand(getAddress(verifyTypedData(domain,signed.types,message,signed.signature))===station,
  'Signature NOT from correct Station');
const nonceKey=keccak256(AbiCoder.defaultAbiCoder().encode(
  ['bytes32','address','bytes32','uint8','bytes32'],
  [typehash,station,tradeId,roleIndex,message.sessionNonce]
));
demand(signed.nonceKey===nonceKey &&
  !(await escrow.consumedNonce(nonceKey)) &&
  !(await escrow.consumedDigest(computedDigest)),
  'Station signature/nonce already consumed');
const currentBlock=await provider.getBlock('latest');
demand(currentBlock && Number.isSafeInteger(currentBlock.timestamp),
  'Failed to read latest block timestamp');
demand(Number.isSafeInteger(message.issuedAt)&&
  Number.isSafeInteger(message.validUntil)&&message.issuedAt<=currentBlock.timestamp&&
  message.validUntil>=currentBlock.timestamp,
  'Station signature is future-dated or expired');
const state=Number(await escrow.getTradeState(tradeId));
const deadline=await escrow.getActionDeadline(tradeId);
const fee=await provider.getFeeData();
const rpcFeeQuote=fee.maxFeePerGas??fee.gasPrice;
demand(rpcFeeQuote!=null&&rpcFeeQuote>0n,'Sepolia gas fee quote unavailable');
// Some Sepolia public RPCs return tiny wei-denominated quotes (e.g. 35 wei).
// Such numbers must never be presented as a credible *gas budget ceiling*.
// Use a deliberately conservative 2 gwei max-fee minimum; this is not a
// prediction of the eventual amount the user will pay.
const MIN_GAS_FEE_BUDGET_WEI=2_000_000_000n;
const MIN_PRIORITY_FEE_WEI=100_000_000n;
const feeCap=rpcFeeQuote>MIN_GAS_FEE_BUDGET_WEI?rpcFeeQuote:MIN_GAS_FEE_BUDGET_WEI;
const rpcPriority=fee.maxPriorityFeePerGas??0n;
const priority=rpcPriority>MIN_PRIORITY_FEE_WEI?rpcPriority:MIN_PRIORITY_FEE_WEI;
demand(priority<=feeCap,'Priority fee exceeds maximum gas fee cap');
const actorBalance=await provider.getBalance(actor);
const MIN_SIMULATION_BUDGET_GAS=650000n;
let estimatedGas=null;
let gasLimit=null;
let gasBudget=MIN_SIMULATION_BUDGET_GAS*feeCap;
let resultStatus='';
if(state===4){
  demand(deadline===0n,'FUNDED with unexpected active deadline');
  demand(!broadcast,
    'BLOCKED: Trade is still FUNDED(4). Never broadcast a role inspection before activate.');
  demand(message.validUntil-currentBlock.timestamp>=2*3600+300,
    'Signed evidence is too close to expiry for two 1-hour sequential inspection windows. Stop.');
  resultStatus='PASS_READ_ONLY_PREACTIVATION_RELAY_PRECHECK';
}else{
  demand(state===stage,
    'Wrong inspection stage: expected '+stage+', got '+state+'. Do not submit this role.');
  demand(deadline>BigInt(currentBlock.timestamp+60),
    'Onchain role inspection deadline is too close. Do not submit.');
  demand(message.validUntil>=currentBlock.timestamp+180,
    'Station signature expires too soon for transaction confirmation');
  await escrow.submitInspection.staticCall(message,signed.signature,{from:actor});
  estimatedGas=await escrow.submitInspection.estimateGas(message,signed.signature,{from:actor});
  gasLimit=estimatedGas*125n/100n+1n;
  demand(gasLimit<=650000n,
    'Inspection estimate exceeds 650000 gas safety ceiling. Review manually.');
  gasBudget=gasLimit*feeCap;
  resultStatus='PASS_LIVE_INSPECTION_STATIC_SIMULATION';
}
demand(actorBalance>=gasBudget,
  'Actor lacks Sepolia ETH for conservative role inspection gas budget');

console.log(JSON.stringify({
  status:resultStatus,role,roleActor:actor,station,tradeId,
  state,expectedStage:stage,expectedPostSubmissionStage:nextStage,
  actionDeadline:deadline.toString(),
  stationSignatureDigest:computedDigest,
  stationSignatureValidUntil:message.validUntil,
  signatureSecondsRemaining:message.validUntil-currentBlock.timestamp,
  stationSignatureValid:true,nonceUnused:true,
  evidencePackageHash:message.evidencePackageHash,
  specimenManifestHash:message.specimenManifestHash,
  expectedOutcome:role==='supplier'?'ADMISSIBLE_PASS':'ADMISSIBLE_REVIEW',
  actorBalanceEth:formatEther(actorBalance),
  rpcFeeQuoteWei:rpcFeeQuote.toString(),
  gasFeeBudgetFloorWei:MIN_GAS_FEE_BUDGET_WEI.toString(),
  gasCeilingWei:feeCap.toString(),
  gasCeilingBasis:'MAX_OF_RPC_QUOTE_AND_2_GWEI_FLOOR',
  priorityFeeWei:priority.toString(),
  gasBudgetMode:state===4?'CONSERVATIVE_UPPER_BOUND_NOT_AN_ESTIMATE':'ONCHAIN_ESTIMATE_PADDED_25_PERCENT',
  gasLimit:gasLimit?.toString()??null,
  estimatedGas:estimatedGas?.toString()??null,
  maximumGasBudgetEth:formatEther(gasBudget),
  staticSimulation:state===stage?'PASS':'NOT_POSSIBLE_BEFORE_ACTIVATE',
  actorPrivateKeyVerified:false,
  broadcastRequested:broadcast,transactionsSent:0,activateCalled:false,
  warning:'Demo public-dataset AI results do not prove the same physical product was inspected.'
},null,2));

if(!broadcast){
  console.log('READ ONLY: No private key accessed, no transaction sent, no activate.');
  process.exit(0);
}
// All preflight conditions above must pass BEFORE loading any actor key.
demand(state===stage,'Broadcast requires active inspection state');
demand(process.env.PATCH3_INSPECTION_CONFIRM==='SUBMIT_PATCH3_'+role,
  'Explicit consent PATCH3_INSPECTION_CONFIRM=SUBMIT_PATCH3_'+role+' missing');
const key=process.env.PATCH3_ACTOR_PRIVATE_KEY;
demand(typeof key==='string'&&/^0x[0-9a-fA-F]{64}$/.test(key),
  'PATCH3_ACTOR_PRIVATE_KEY missing or malformed (not printed)');
let actorSigner;
try{actorSigner=new Wallet(key,provider);}catch{throw Error('Invalid actor key (secret not printed)');}
demand(getAddress(actorSigner.address)===actor,'Actor private key derives the WRONG frozen address');
demand((await provider.getNetwork()).chainId===11155111n,'Chain ID changed');
demand(Number(await escrow.getTradeState(tradeId))===stage,
  'Trade stage changed before broadcast');
const latest=await provider.getBlock('latest');
demand(latest&&BigInt(latest.timestamp)+60n<await escrow.getActionDeadline(tradeId) &&
  message.validUntil>=latest.timestamp+180,
  'Role deadline or Station signature too close before transaction');
demand(!(await escrow.consumedNonce(nonceKey))&&
  !(await escrow.consumedDigest(computedDigest)), 'Station signature consumed before sending');
demand(Number(await registry.status(station))===1,'Station credential changed to non-ACTIVE');
await escrow.submitInspection.staticCall(message,signed.signature,{from:actor});
demand(await provider.getBalance(actor)>=gasBudget,'Actor balance fell below budget');
const writer=new Contract(addr,abi,actorSigner);
// Fee cap is explicitly set on broadcast, so the read-only maximumGasBudgetEth
// corresponds to this tx envelope and never to an implausibly tiny RPC quote.
const tx=await writer.submitInspection(message,signed.signature,{
  gasLimit,maxFeePerGas:feeCap,maxPriorityFeePerGas:priority
});
console.log(JSON.stringify({
  status:'PATCH3_INSPECTION_TRANSACTION_SENT',role,tradeId,
  txHash:tx.hash,explorer:'https://sepolia.etherscan.io/tx/'+tx.hash,
  warning:'DO NOT REBROADCAST if confirmation is delayed; inspect this exact tx hash first.'
},null,2));
const receipt=await tx.wait(1);
demand(receipt&&Number(receipt.status)===1,'Transaction receipt failed/unavailable; inspect hash before retry');
const event=receipt.logs.map(log=>{
  try{return writer.interface.parseLog(log);}catch{return null;}
}).find(e=>e?.name==='InspectionOutcomeDerived' &&
  e.args.tradeId===tradeId&&Number(e.args.role)===roleIndex);
demand(event&&Number(event.args.outcome)===expectedOutcome &&
  BigInt(event.args.aggregateScoreScaled)===score&&
  event.args.evidencePackageHash===message.evidencePackageHash &&
  event.args.specimenManifestHash===message.specimenManifestHash&&
  getAddress(event.args.station)===station,
  'Receipt event differs from frozen inspection evidence; investigate before further action.');
const finalState=Number(await escrow.getTradeState(tradeId));
demand(finalState===nextStage,
  'Unexpected state after inspection (expected '+nextStage+', got '+finalState+')');
const record=await escrow.getInspection(tradeId,roleIndex);
demand(Number(record.outcome)===expectedOutcome&&
  BigInt(record.aggregateScoreScaled)===score&&
  record.evidencePackageHash===message.evidencePackageHash &&
  record.specimenManifestHash===message.specimenManifestHash &&
  getAddress(record.station)===station,
  'Onchain inspection record mismatch. Do not advance.');
demand(await escrow.accountingConserved()&&await escrow.balanceCoversLiabilities(),
  'Post-inspection accounting invariants failed');
console.log(JSON.stringify({
  status:'PATCH3_INSPECTION_ONCHAIN_CONFIRMED',role,tradeId,
  txHash:tx.hash,blockNumber:receipt.blockNumber,
  inspectionOutcome:role==='supplier'?'ADMISSIBLE_PASS':'ADMISSIBLE_REVIEW',
  newTradeState:finalState,expectedState:nextStage,
  evidencePackageHash:record.evidencePackageHash,
  eventVerified:true,recordVerified:true,accountingVerified:true
},null,2));
