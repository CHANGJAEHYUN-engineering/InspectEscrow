// PATCH3 offline-demo evidence packager. READ-ONLY PREVIEW by default.
// --write writes only local non-secret prepared files to .patch3-local/.
// It does NOT sign, broadcast, or call activate. Original AI outputs are cited,
// NOT represented as proof that Supplier/Buyer inspected the same physical item.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Contract,JsonRpcProvider,getAddress,keccak256,toUtf8Bytes} from 'ethers';

const pkg='packages/phase3c_hardening_20261023';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const args=process.argv.slice(2);
assert(args.length===0||(args.length===1&&args[0]==='--write'),
  'Only optional --write is supported (never a blockchain broadcast)');
const write=args[0]==='--write';
const rpc=process.env.PATCH3_RPC_URL;
assert(typeof rpc==='string'&&/^https:\/\//.test(rpc),
  'PATCH3_RPC_URL must be an HTTPS Sepolia RPC URL');

// Stable, intentionally narrow JSON canonicalizer. All emitted payload numbers
// are JSON-safe integers or decimal strings; no floating-point canonicalization.
function jcs(value){
  if(value===null)return 'null';
  if(typeof value==='string')return JSON.stringify(value);
  if(typeof value==='boolean')return value?'true':'false';
  if(typeof value==='number'){
    assert(Number.isSafeInteger(value),'Unsafe number in canonical evidence');
    return String(value);
  }
  if(Array.isArray(value))return '['+value.map(jcs).join(',')+']';
  if(value&&typeof value==='object')
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+jcs(value[k])).join(',')+'}';
  throw Error('Unsupported evidence value');
}
const packageHash=v=>keccak256(toUtf8Bytes(jcs(v)));
const shaFile=file=>'0x'+createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const manifest=read(pkg+'/results/PATCH3_SEPOLIA_DEPLOYMENT.json');
const input=read(pkg+'/policy/PATCH3_POLICY_INPUT.json');
const policy=read(pkg+'/policy/generated/PATCH3_POLICY_V1_2_FINAL.json');
const commitment=read(pkg+'/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json');
const preimage=fs.readFileSync(pkg+'/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json','utf8').trimEnd();
const abi=read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const registryAbi=read('.patch3-build/CredentialRegistryPatch3.sol_CredentialRegistryPatch3.abi');
const schema=read('packages/phase3b_20261010/baseline/EIP712_TYPED_DATA_SCHEMA.json');
const frozenBridge=read('packages/ai_20261010/ai/contract_bridge/AI_TO_CONTRACT_BRIDGE_SPEC.json');
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const regAddr=getAddress(manifest.contracts.CredentialRegistryPatch3.address);
const tradeId=input.tradeId;

assert(addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905'),
  'Escrow is not PATCH3 frozen deployment');
assert(input.chainId===11155111&&manifest.chainId===11155111,
  'Expected frozen Sepolia chain');
assert(policy.policyVersion===2&&commitment.policyVersion===2&&
  tradeId===policy.trade.tradeId&&tradeId===commitment.tradeId,
  'Frozen policy and Trade ID mismatch');
assert(commitment.selfHashRecomputation===true &&
  keccak256(toUtf8Bytes(preimage))===commitment.policyHash &&
  commitment.policyHash===policy.hashing.policyHash,
  'Policy canonical hash mismatch');
assert(input.escrowAmountWei==='5000000000000000','Trade value mismatch');
assert(getAddress(input.verifyingContract)===addr,'VerifyingContract mismatch');
assert(getAddress(input.credentialRegistry)===regAddr,'Registry mismatch');
const provider=new JsonRpcProvider(rpc);
assert((await provider.getNetwork()).chainId===11155111n,'RPC is not Sepolia');
for(const [label,address,hash] of [
  ['Escrow',addr,manifest.contracts.InspectEscrowPatch3.runtimeCodeHash],
  ['Registry',regAddr,manifest.contracts.CredentialRegistryPatch3.runtimeCodeHash]
]){
  const code=await provider.getCode(address);
  assert(code!=='0x'&&keccak256(code)===hash,label+' deployed runtime code mismatch');
}
const escrow=new Contract(addr,abi,provider);
const registry=new Contract(regAddr,registryAbi,provider);
const state=Number(await escrow.getTradeState(tradeId));
const deadline=await escrow.getActionDeadline(tradeId);
assert(state===4&&deadline===0n,
  'Expected FUNDED(4) and inspection deadline 0. DO NOT ACTIVATE before staging.');
const terms=await escrow.getTradeTerms(tradeId);
assert(Number(terms.policyVersion)===2&&terms.policyHash===commitment.policyHash,
  'Onchain policy hash mismatch');
assert(terms.escrowAmount===5000000000000000n,'Onchain trade amount mismatch');
for(const role of Object.keys(input.roles))
  assert(getAddress(terms[role])===getAddress(input.roles[role]),role+' onchain address mismatch');
for(const role of ['supplierStation','buyerStation','primaryInspectorStation',
  'backupInspectorStation','externalArbitratorStation']){
  assert(Number(await registry.status(input.roles[role]))===1,
    role+' credential not ACTIVE');
}
assert(await escrow.accountingConserved()&&await escrow.balanceCoversLiabilities(),
  'Accounting invariant failure');
const liveDomain=await escrow.eip712Domain();
const domain={name:'InspectEscrow',version:'1',chainId:11155111,verifyingContract:addr};
assert(liveDomain.name===domain.name&&liveDomain.version===domain.version &&
  liveDomain.chainId===11155111n &&
  getAddress(liveDomain.verifyingContract)===addr,
  'Domain mismatch');
const stationType=abi.find(x=>x.type==='function'&&x.name==='hashStationAttestation');
assert(stationType,'StationAttestation ABI missing');
const fields=stationType.inputs[0].components.map(x=>({name:x.name,type:x.type}));
assert(JSON.stringify(fields)===JSON.stringify(schema.types.StationAttestation),
  'Station schema differs from validated frozen baseline');
assert(terms.thresholdScaled===BigInt(frozenBridge.score_encoding.thresholdScaled),
  'Threshold not frozen');
assert(terms.scoreSchemaId===frozenBridge.score_encoding.scoreSchemaId,
  'Score schema does not match AI bridge');
assert(Number(terms.scoreScaleExponent)===6,'Unexpected score scale');

const roles={
  supplier:{role:0,stationRole:'supplierStation',
    source:'packages/ai_20261010/ai/evidence/canonical/demo__good__000__ai_evidence.json',
    expectedImage:'demo/good/000.png',outcome:'PASS'},
  buyer:{role:1,stationRole:'buyerStation',
    source:'packages/ai_20261010/ai/evidence/canonical/demo__scratch__022__ai_evidence.json',
    expectedImage:'demo/scratch/022.png',outcome:'REVIEW'}
};
const prepared={};
for(const [role,cfg] of Object.entries(roles)){
  const ai=read(cfg.source);
  assert(ai.schema==='InspectEscrow.AIEvidence.v1'&&
    ai.model.name==='PatchCore'&&ai.model.version==='V2',
    role+' AI source schema/model mismatch');
  assert(ai.inspection.dataset_relative_path===cfg.expectedImage,
    role+' AI source file changed');
  assert(ai.inspection.decision===(role==='supplier'?'PASS':'REVIEW_REQUIRED'),
    role+' AI source decision mismatch');
  const score=BigInt(Math.floor(Number(ai.inspection.anomaly_score)*1e6+0.5));
  assert(score>=terms.scoreMinScaled&&score<=terms.scoreMaxScaled,
    role+' score is out of frozen policy bounds');
  assert((score<terms.thresholdScaled?'PASS':'REVIEW')===cfg.outcome,
    role+' score and intended outcome disagree');
  const station=getAddress(terms[cfg.stationRole]);
  const binding={chainId:11155111,verifyingContract:addr,
    tradeId,policyHash:commitment.policyHash,role:cfg.role,
    station,attempt:1};
  const specimenManifest={
    schema:'inspectescrow.patch3.demo-specimen-manifest/1',
    demoOnly:true,
    physicalSpecimenIdentityProven:false,
    binding,
    image:{
      publicDatasetRelativePath:ai.inspection.dataset_relative_path,
      imageSha256:ai.inspection.input_image_sha256,
      imageSha256Source:'Frozen AI evidence metadata (image file not rehashed by this script)'
    }
  };
  const specimenManifestHash=packageHash(specimenManifest);
  const evidencePackage={
    schema:'inspectescrow.patch3.demo-trade-evidence/1',
    demoOnly:true,
    samePhysicalSpecimenProven:false,
    chainCustodyProven:false,
    stationSignatureProvesAiExecution:false,
    binding,
    specimenManifestHash,
    sourceAi:{
      sourceFilePath:cfg.source,
      sourceFileSha256:shaFile(cfg.source),
      declaredAiEvidenceSha256:ai.evidence_sha256,
      modelName:ai.model.name,
      modelVersion:ai.model.version,
      scoreRawDecimal:ai.inspection.anomaly_score,
      scoreScaled:score.toString(),
      derivedInspectionOutcome:cfg.outcome,
      modelBundleHash:terms.modelBundleHash,
      captureProfileHash:terms.captureProfileHash,
      productSpecHash:terms.productSpecHash,
      requiredViewSetHash:terms.requiredViewSetHash,
      scoreSchemaId:terms.scoreSchemaId,
      thresholdScaled:terms.thresholdScaled.toString()
    }
  };
  const evidencePackageHash=packageHash(evidencePackage);
  const messageBase={
    tradeId,role:cfg.role,station,attempt:1,
    sessionNonce:null,policyHash:commitment.policyHash,
    modelBundleHash:terms.modelBundleHash,
    captureProfileHash:terms.captureProfileHash,
    specimenManifestHash,evidencePackageHash,
    aggregateScoreScaled:score.toString(),
    scoreSchemaId:terms.scoreSchemaId,
    inspectionValidity:0,
    invalidReason:0,
    issuedAt:null,
    validUntil:null
  };
  const payload={
    schema:'inspectescrow.patch3.staged-demo-evidence/1',
    tradeId,actor:getAddress(terms[role]),
    roleName:role,roleIndex:cfg.role,station,
    domain,
    types:{StationAttestation:fields},
    sourceAiFile:cfg.source,
    specimenManifest,
    specimenManifestHash,
    evidencePackage,
    evidencePackageHash,
    messageBase,
    signerInstruction:'Station signs after prep, role Actor sends onchain after activation.',
    caveat:'Demo from public AI samples, not a physically witnessed same-specimen inspection.'
  };
  prepared[role]=payload;
}
const outDir='.patch3-local/'+tradeId.slice(2,14);
if(write){
  assert(!fs.existsSync(outDir),
    'Local evidence folder already exists; refusing overwrite. Inspect before retrying.');
  fs.mkdirSync(outDir,{recursive:true});
  for(const [role,payload] of Object.entries(prepared)){
    fs.writeFileSync(path.join(outDir,role+'.prepared.json'),
      JSON.stringify(payload,null,2)+'\n',{flag:'wx',mode:0o600});
  }
}
console.log(JSON.stringify({
  status:write?'PATCH3_STAGED_DEMO_EVIDENCE_WRITTEN':'PASS_READ_ONLY_PATCH3_EVIDENCE_PREVIEW',
  tradeId,escrow:addr,state:'FUNDED(4)',actionDeadline:'0',
  policyHash:commitment.policyHash,
  domain,
  evidence:Object.fromEntries(Object.entries(prepared).map(([role,p])=>
    [role,{sourceAiFile:p.sourceAiFile,
      scoreScaled:p.messageBase.aggregateScoreScaled,
      outcome:p.evidencePackage.sourceAi.derivedInspectionOutcome,
      specimenManifestHash:p.specimenManifestHash,
      evidencePackageHash:p.evidencePackageHash,
      station:p.station}])),
  outputDirectory:write?outDir:null,
  localFilesWritten:write?2:0,
  stationSignaturesCreated:0,
  transactionsSent:0,
  activateCalled:false,
  nextGate:'Use local Station actor key to sign. Do not activate before signed Supplier and Buyer payloads are validated.'
},null,2));
