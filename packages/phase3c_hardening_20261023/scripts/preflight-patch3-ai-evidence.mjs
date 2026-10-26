// READ-ONLY PATCH3 EIP-712 and demo-AI evidence pre-activation gate.
// This does not prepare live evidence/signatures, call activate(), or send tx.
import fs from 'node:fs';
import {Contract,JsonRpcProvider,getAddress,keccak256,toUtf8Bytes} from 'ethers';
const base='packages/phase3c_hardening_20261023';
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const assert=(v,m)=>{if(!v)throw Error(m);};
const rpc=process.env.PATCH3_RPC_URL;
assert(rpc?.startsWith('https://'),'Set HTTPS PATCH3_RPC_URL for Sepolia');
const manifest=load(base+'/results/PATCH3_SEPOLIA_DEPLOYMENT.json');
const inp=load(base+'/policy/PATCH3_POLICY_INPUT.json');
const pol=load(base+'/policy/generated/PATCH3_POLICY_V1_2_FINAL.json');
const commit=load(base+'/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json');
const preimage=fs.readFileSync(base+'/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json','utf8').trimEnd();
const abi=load('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const regAbi=load('.patch3-build/CredentialRegistryPatch3.sol_CredentialRegistryPatch3.abi');
const oldSchema=load('packages/phase3b_20261010/baseline/EIP712_TYPED_DATA_SCHEMA.json');
const bridge=load('packages/ai_20261010/ai/contract_bridge/AI_TO_CONTRACT_BRIDGE_SPEC.json');
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const regAddr=getAddress(manifest.contracts.CredentialRegistryPatch3.address);
const tradeId=inp.tradeId;
assert(addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905'),'Wrong escrow');
assert(tradeId===pol.trade.tradeId&&tradeId===commit.tradeId,'TradeId mismatch');
assert(pol.policyVersion===2&&commit.policyVersion===2,'Policy version mismatch');
assert(keccak256(toUtf8Bytes(preimage))===commit.policyHash &&
  commit.policyHash===pol.hashing.policyHash,'Policy hash mismatch');
const p=new JsonRpcProvider(rpc);
assert((await p.getNetwork()).chainId===11155111n,'Not Sepolia');
for(const [n,a,hash] of [
  ['Escrow',addr,manifest.contracts.InspectEscrowPatch3.runtimeCodeHash],
  ['Registry',regAddr,manifest.contracts.CredentialRegistryPatch3.runtimeCodeHash]
]){const actual=await p.getCode(a);
  assert(actual!=='0x'&&keccak256(actual)===hash,n+' runtime hash mismatch');}
const c=new Contract(addr,abi,p);
const reg=new Contract(regAddr,regAbi,p);
const state=Number(await c.getTradeState(tradeId));
const deadline=await c.getActionDeadline(tradeId);
assert(state===4&&deadline===0n,'Must remain FUNDED(4) with deadline 0');
const t=await c.getTradeTerms(tradeId);
assert(t.policyHash===commit.policyHash&&Number(t.policyVersion)===2,'On-chain policy differs');
assert(t.escrowAmount===5000000000000000n,'Escrow amount changed');
assert(t.modelBundleHash===pol.ai.modelBundleHash,'AI modelBundleHash mismatch');
assert(t.captureProfileHash===pol.capture.captureProfileHash,'Capture hash mismatch');
assert(t.scoreSchemaId===pol.ai.scoreSchemaId,'Score schema mismatch');
for(const [key,value] of Object.entries(inp.roles)){
  assert(getAddress(t[key])===getAddress(value),key+' role mismatch');}
for(const name of ['supplierStation','buyerStation','primaryInspectorStation',
  'backupInspectorStation','externalArbitratorStation']){
  assert(Number(await reg.status(inp.roles[name]))===1,name+' credential not ACTIVE');}
assert(await c.accountingConserved()&&await c.balanceCoversLiabilities(),
  'Escrow accounting failed');
const domain=await c.eip712Domain();
assert(domain.name==='InspectEscrow'&&domain.version==='1'&&
  domain.chainId===11155111n&&getAddress(domain.verifyingContract)===addr,
  'PATCH3 typed-data EIP-712 domain mismatch');
const stationAbi=abi.find(x=>x.type==='function'&&x.name==='hashStationAttestation');
const expected=oldSchema.types.StationAttestation;
assert(stationAbi,'StationAttestation ABI missing');
const actual=stationAbi.inputs[0].components.map(x=>({name:x.name,type:x.type}));
assert(JSON.stringify(actual)===JSON.stringify(expected),
  'StationAttestation schema differs from PATCH2; needs fresh bridge');
const decisionAbi=abi.find(x=>x.type==='function'&&x.name==='hashInspectorDecision');
assert(decisionAbi?.inputs[0].components.some(x=>x.name==='decisionEvidenceHash'),
  'PATCH3 InspectorDecision decisionEvidenceHash missing');
assert(!oldSchema.types.InspectorDecisionAttestation.some(x=>x.name==='decisionEvidenceHash'),
  'Baseline InspectorDecision extension unexpectedly present');
assert(t.scoreScaleExponent===6n||Number(t.scoreScaleExponent)===6,
  'Unexpected score scale exponent');
assert(t.thresholdScaled===BigInt(bridge.score_encoding.thresholdScaled),
  'PATCH3 threshold differs from frozen AI bridge');
assert(t.scoreSchemaId===bridge.score_encoding.scoreSchemaId,
  'AI bridge schema mismatch');
const source={
  supplier:'packages/ai_20261010/ai/evidence/canonical/demo__good__000__ai_evidence.json',
  buyer:'packages/ai_20261010/ai/evidence/canonical/demo__scratch__022__ai_evidence.json'
};
const audit={};
for(const [role,file] of Object.entries(source)){
  const entry=load(file);
  assert(entry.model.name==='PatchCore'&&entry.model.version==='V2','AI model mismatch');
  const score=BigInt(Math.floor(Number(entry.inspection.anomaly_score)*1e6+0.5));
  assert(score>=t.scoreMinScaled&&score<=t.scoreMaxScaled,role+' score out of range');
  const outcome=score<t.thresholdScaled?'PASS':'REVIEW';
  assert(outcome===(role==='supplier'?'PASS':'REVIEW'),role+' score scenario mismatch');
  audit[role]={source:entry.inspection.dataset_relative_path,
    scoreScaled:score.toString(),outcome,offchainAiEvidenceSha256:entry.evidence_sha256};
}
console.log(JSON.stringify({
  status:'PASS_PATCH3_PRE_ACTIVATION_ANCHORS',
  state:'FUNDED(4)',actionDeadline:deadline.toString(),
  tradeId,policyHash:commit.policyHash,
  stationCredentials:'5_ACTIVE',
  domain:{name:domain.name,version:domain.version,
    verifyingContract:domain.verifyingContract},
  stationSchema:'MATCH_PATCH2_FIELD_TYPES',
  inspectorDecisionSchema:'PATCH3_EXTRA_FIELD_REQUIRES_NEW_BRIDGE',
  supplierInspectionSeconds:Number(t.windows.supplierInspection),
  buyerInspectionSeconds:Number(t.windows.buyerInspection),
  aiDemo:audit,
  liveTradeSpecificEvidenceReady:false,
  liveStationSignaturesReady:false,
  activateCalled:false,transactionsSent:0,
  warning:'This audit does NOT make the E2E activation-ready; prepare live trade-specific evidence and Station signatures first.'
},null,2));
