// InspectEscrow PATCH3 — prepare a HUMAN/A.I. replay handoff template.
// READ ONLY by default; --write creates a local template (never a replay result).
// No key access, no EIP-712 signing, no tx, no settlement verdict selection.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  Contract,JsonRpcProvider,getAddress,keccak256,toUtf8Bytes,
  TypedDataEncoder,verifyTypedData
} from 'ethers';
const args=process.argv.slice(2);
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
assert(args.length===0||(args.length===1&&args[0]==='--write'),
  'Usage: node .../prepare-patch3-inspector-handoff.mjs [--write]');
const write=args.includes('--write');
const rpc=process.env.PATCH3_RPC_URL;
assert(typeof rpc==='string'&&/^https:\/\//.test(rpc),'HTTPS PATCH3_RPC_URL required');
const base='packages/phase3c_hardening_20261023';
const ai='packages/ai_20261010/ai';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sha256=p=>'0x'+createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const input=read(base+'/policy/PATCH3_POLICY_INPUT.json');
const commitment=read(base+'/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json');
const policy=read(base+'/policy/generated/PATCH3_POLICY_V1_2_FINAL.json');
const manifest=read(base+'/results/PATCH3_SEPOLIA_DEPLOYMENT.json');
const abi=read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const regAbi=read('.patch3-build/CredentialRegistryPatch3.sol_CredentialRegistryPatch3.abi');
const frozenAi=read(ai+'/evidence/canonical/demo__scratch__022__ai_evidence.json');
const supersession=read(ai+'/model_bundle/FINAL_MODEL_BUNDLE_SEMANTIC_PATCH1_COMMITMENT.json');
const replayHistory=read(ai+'/replay/DISPUTE_022_REPLAY_RESULT.json');
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const tradeId=input.tradeId;
assert(manifest.chainId===11155111&&input.chainId===11155111&&
  addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905'),
  'Only frozen Sepolia PATCH3 trade is supported');
assert(policy.policyVersion===2&&commitment.policyVersion===2&&
  policy.hashing.policyHash===commitment.policyHash &&
  commitment.tradeId===tradeId&&policy.trade.tradeId===tradeId,
  'Policy preflight failed');
const p=new JsonRpcProvider(rpc);
assert((await p.getNetwork()).chainId===11155111n,'RPC not Sepolia');
const runtime=await p.getCode(addr);
assert(runtime!=='0x'&&keccak256(runtime)===manifest.contracts.InspectEscrowPatch3.runtimeCodeHash,
  'Deployed bytecode does not match locally frozen manifest');
const c=new Contract(addr,abi,p);
const reg=new Contract(manifest.contracts.CredentialRegistryPatch3.address,regAbi,p);
const terms=await c.getTradeTerms(tradeId);
assert(terms.policyHash===commitment.policyHash&&
  Number(terms.policyVersion)===2&&terms.escrowAmount===5000000000000000n,
  'Live trade policy mismatch');
assert(Number(await c.getTradeState(tradeId))===4 &&
  await c.getActionDeadline(tradeId)===0n,
  'The trade has advanced; template creation is intentionally pre-activation only');
assert(await c.accountingConserved()&&await c.balanceCoversLiabilities(),
  'Accounting invariant failed');
const dom=await c.eip712Domain();
assert(dom.name==='InspectEscrow'&&dom.version==='1'&&
  dom.chainId===11155111n&&getAddress(dom.verifyingContract)===addr,
  'Deployed EIP-712 domain mismatch');
const domain={name:dom.name,version:dom.version,chainId:11155111,verifyingContract:addr};
assert(terms.modelBundleHash===supersession.newModelBundleHash &&
  terms.modelBundleHash===policy.ai.modelBundleHash &&
  supersession.status==='FINAL_SUPERSEDING_MODEL_BUNDLE'&&
  supersession.supersessionType==='SEMANTIC_CLARIFICATION_ONLY',
  'Historical model bundle has not been explicitly superseded');
assert(replayHistory.reference.canonical_evidence_sha256===frozenAi.evidence_sha256 &&
  replayHistory.replay_target.input_image_sha256===frozenAi.inspection.input_image_sha256 &&
  replayHistory.model.model_core_sha256===frozenAi.model.model_core_sha256,
  'Historical Replay does not tie to the frozen canonical Buyer AI source');
const fieldList=name=>{
 const f=abi.find(x=>x.type==='function'&&x.name===name);
 assert(f?.inputs?.[0]?.components,'Missing EIP712 ABI for '+name);
 return f.inputs[0].components.map(x=>({name:x.name,type:x.type}));
};
const replayFields=fieldList('hashReplayAttestation');
const decisionFields=fieldList('hashInspectorDecision');
assert(replayFields.length===11&&decisionFields.length===13&&
  decisionFields.some(x=>x.name==='decisionEvidenceHash'&&x.type==='bytes32'),
  'PATCH3 Inspector schema no longer matches expected types');
const dir='.patch3-local/'+tradeId.slice(2,14);
const signed={};
for(const [role,i] of [['supplier',0],['buyer',1]]){
 const packet=read(path.join(dir,role+'.signed.json'));
 const prepared=read(path.join(dir,role+'.prepared.json'));
 const station=getAddress(terms[role+'Station']);
 assert(packet.tradeId===tradeId&&packet.roleName===role&&
   packet.message.role===i&&packet.message.policyHash===commitment.policyHash &&
   packet.message.evidencePackageHash===prepared.evidencePackageHash,
   role+' prepared evidence does not match signed evidence');
 const digest=TypedDataEncoder.hash(domain,packet.types,packet.message);
 assert(packet.digest===digest&&digest===await c.hashStationAttestation(packet.message)&&
   getAddress(verifyTypedData(domain,packet.types,packet.message,packet.signature))===station,
   role+' EIP-712 Station signature invalid');
 assert(!(await c.consumedDigest(digest)),role+' Station signature already consumed');
 signed[role]=packet.message.evidencePackageHash;
}
assert(signed.buyer!=='0x'+'00'.repeat(32)&&signed.supplier!=='0x'+'00'.repeat(32),
  'Evidence anchors must be nonzero');
const insp={};
for(const [stage,actorName,stationName] of [
 ['primary','primaryInspector','primaryInspectorStation'],
 ['backup','backupInspector','backupInspectorStation']
]){
 const station=getAddress(terms[stationName]);
 assert(Number(await reg.status(station))===1,stage+' Station not ACTIVE');
 insp[stage]={
   actor:getAddress(terms[actorName]),station,
   replayAndDecisionSignedBy:station,
   bothOnchainTransactionsSentBy:getAddress(terms[actorName]),
   privateKeyVerified:false,stationPrivateKeyVerified:false
 };
}
const template={
  schema:'inspectescrow.patch3.inspector-handoff-template/1',
  status:'TEMPLATE_ONLY_UNVERIFIED_FRESH_RUN',
  project:'InspectEscrow',tradeId,
  policyVersion:2,policyHash:commitment.policyHash,
  modelBundleHash:terms.modelBundleHash,
  domain,
  currentStateAtCreation:'FUNDED(4)',
  historicalReplay:{
    file:ai+'/replay/DISPUTE_022_REPLAY_RESULT.json',
    sha256:sha256(ai+'/replay/DISPUTE_022_REPLAY_RESULT.json'),
    status:'PAST_ARTIFACT_RELOAD_PROVENANCE_ONLY',
    notEvidenceOfNewInference:true,
    oldBundleHash:supersession.oldModelBundleHash,
    semanticallySupersededBy:terms.modelBundleHash
  },
  frozenInputs:{
    supplierEvidencePackageHash:signed.supplier,
    buyerEvidencePackageHash:signed.buyer,
    datasetRelativePath:frozenAi.inspection.dataset_relative_path,
    sourceImageSha256FromFrozenMetadata:frozenAi.inspection.input_image_sha256,
    modelCoreSha256FromFrozenMetadata:frozenAi.model.model_core_sha256,
    buyerReferenceRawScore:frozenAi.inspection.anomaly_score,
    buyerReferenceScaled:'60138172',
    replayToleranceScaled:222,
    thresholdScaled:String(terms.thresholdScaled),
    scoreSchemaId:terms.scoreSchemaId
  },
  requiredFreshReplay:{
    status:'MISSING',
    actualInferenceExecutedAtUtc:null,
    modelCoreFileSha256RecomputedFromBytes:null,
    originalImageSha256RecomputedFromBytes:null,
    inferenceCodeOrNotebookSha256:null,
    runtimeAndDevice:null,
    executionLogFileSha256:null,
    rawReplayScoreDecimal:null,
    replayScaledScore:null,
    replayClassification:null,
    absoluteScaledDifference:null,
    verifiedWithinTolerance:null,
    independentOperatorOrInspectorVerification:null,
    originalFileRetentionLocation:null,
    warning:'Do not fill these from old JSON; run frozen PatchCore model anew on original image and retain execution logs/artifact digests.'
  },
  inspectorStagePlans:{
    primary:{stage:0,...insp.primary},
    backup:{stage:1,...insp.backup}
  },
  replayAttestation:{
    types:{ReplayAttestation:replayFields},
    requiredActualEvidenceHash:null,
    message:null,
    signature:null,
    status:'NOT_SIGNABLE_UNTIL_FRESH_REPLAY_VERIFIED'
  },
  decisionReview:{
    requiredHumanChoice:['RELEASE_TO_SUPPLIER','REFUND_TO_BUYER'],
    decision:null,
    reasonCode:null,
    decisionEvidenceHash:null,
    inspectorReviewNotes:null,
    signedBy:null,
    warning:'PatchCore REVIEW and replay consistency do NOT decide money. Inspector must independently review evidence and choose a business settlement.',
    types:{InspectorDecisionAttestation:decisionFields},
    message:null,signature:null,
    status:'NO_HUMAN_DECISION_AND_NO_SIGNATURE'
  },
  activationGate:{
    freshInferenceVerified:false,
    inspectorActorKeysVerified:false,
    inspectorStationKeysVerified:false,
    humanDecisionApproved:false,
    onchainInspectionRecordsAvailable:false,
    readyForActivation:false
  }
};
const outPath=path.join(dir,'inspector-handoff.TEMPLATE.json');
if(write){
 assert(!fs.existsSync(outPath),'Template already exists; refusing accidental overwrite');
 fs.writeFileSync(outPath,JSON.stringify(template,null,2)+'\n',
   {flag:'wx',mode:0o600});
}
console.log(JSON.stringify({
 status:write?'PATCH3_INSPECTOR_HANDOFF_TEMPLATE_WRITTEN':'PASS_PATCH3_INSPECTOR_HANDOFF_PREVIEW',
 tradeId,chainId:11155111,state:'FUNDED(4)',
 supplierEvidenceHash:signed.supplier,buyerEvidenceHash:signed.buyer,
 inspectorReplaySchema:'PATCH3_11_FIELDS',
 inspectorDecisionSchema:'PATCH3_13_FIELDS_WITH_DECISION_EVIDENCE_HASH',
 inspectorAddresses:insp,
 frozenModelCoreSha256:frozenAi.model.model_core_sha256,
 sourceImageSha256:frozenAi.inspection.input_image_sha256,
 historicalReplayOnly:true,freshReplayPerformed:false,
 humanSettlementDecisionApproved:false,
 readyForActivation:false,
 outputFile:write?outPath:null,
 localFilesWritten:write?1:0,
 signaturesCreated:0,transactionsSent:0,activateCalled:false
},null,2));
