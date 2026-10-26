// PATCH3 read-only historical replay evidence reconciliation.
// This is a *dossier draft*, NOT a new replay run or signed Inspector attestation.
// --write writes ONLY a local draft to .patch3-local/; never signs/broadcasts.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Contract,JsonRpcProvider,getAddress,keccak256,toUtf8Bytes,TypedDataEncoder,verifyTypedData} from 'ethers';

const args=process.argv.slice(2);
const ck=(ok,msg)=>{if(!ok)throw Error(msg)};
ck(args.length===0||(args.length===1&&args[0]==='--write'),
  'Usage: node .../prepare-patch3-replay-dossier.mjs [--write] (no blockchain broadcast)');
const write=args.includes('--write');
const rpc=process.env.PATCH3_RPC_URL;
ck(typeof rpc==='string'&&/^https:\/\//.test(rpc),'PATCH3_RPC_URL must be an HTTPS Sepolia RPC URL');
const base='packages/phase3c_hardening_20261023';
const ai='packages/ai_20261010/ai';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha256=file=>'0x'+createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function jcs(o){
  if(o===null)return 'null';
  if(typeof o==='boolean')return o?'true':'false';
  if(typeof o==='string')return JSON.stringify(o);
  if(typeof o==='number'){ck(Number.isSafeInteger(o),'Noninteger evidence number');return String(o);}
  if(Array.isArray(o))return '['+o.map(jcs).join(',')+']';
  if(o&&typeof o==='object')return '{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+jcs(o[k])).join(',')+'}';
  throw Error('Unsupported JSON evidence value');
}
const canonicalKeccak=o=>keccak256(toUtf8Bytes(jcs(o)));
const input=read(base+'/policy/PATCH3_POLICY_INPUT.json');
const policy=read(base+'/policy/generated/PATCH3_POLICY_V1_2_FINAL.json');
const commitment=read(base+'/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json');
const manifest=read(base+'/results/PATCH3_SEPOLIA_DEPLOYMENT.json');
const abi=read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const frozenReplayFile=ai+'/replay/DISPUTE_022_REPLAY_RESULT.json';
const toleranceFile=ai+'/policy/AI_REPLAY_TOLERANCE_POLICY_V1.json';
const supersessionFile=ai+'/model_bundle/FINAL_MODEL_BUNDLE_SEMANTIC_PATCH1_COMMITMENT.json';
const reauditFile=ai+'/model_bundle/FINAL_MODEL_BUNDLE_SEMANTIC_REAUDIT_V2.json';
const sourceFile=ai+'/evidence/canonical/demo__scratch__022__ai_evidence.json';
const [oldReplay,tolerance,supersession,reaudit,buyerAi]=
  [frozenReplayFile,toleranceFile,supersessionFile,reauditFile,sourceFile].map(read);
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
ck(addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905')&&
  input.chainId===11155111&&manifest.chainId===11155111,'Wrong Sepolia PATCH3 deployment');
ck(policy.policyVersion===2&&commitment.policyVersion===2&&
  policy.hashing.policyHash===commitment.policyHash&&
  policy.trade.tradeId===input.tradeId,'Frozen Trade Policy mismatch');
const preimage=fs.readFileSync(base+'/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json','utf8').trimEnd();
ck(keccak256(toUtf8Bytes(preimage))===commitment.policyHash,'Policy preimage mismatch');
const provider=new JsonRpcProvider(rpc);
ck((await provider.getNetwork()).chainId===11155111n,'RPC not Sepolia');
const deployedCode=await provider.getCode(addr);
ck(deployedCode!=='0x'&&keccak256(deployedCode)===manifest.contracts.InspectEscrowPatch3.runtimeCodeHash,
  'Deployed escrow runtime code mismatch');
const c=new Contract(addr,abi,provider);
const terms=await c.getTradeTerms(input.tradeId);
ck(Number(await c.getTradeState(input.tradeId))===4&&
  await c.getActionDeadline(input.tradeId)===0n,'Trade no longer in FUNDED(4); stop');
ck(terms.policyHash===commitment.policyHash &&
  terms.escrowAmount===5000000000000000n &&
  terms.modelBundleHash===policy.ai.modelBundleHash,
  'Onchain fixed policy/model commitment mismatch');
ck(await c.accountingConserved()&&await c.balanceCoversLiabilities(),
  'Accounting invariant failed');
// Resolve supersession explicitly; never silently accept a bundle-hash mismatch.
ck(tolerance.modelBundleHash===supersession.oldModelBundleHash,
  'Historical tolerance policy uses an unrecognized model bundle hash');
ck(terms.modelBundleHash===supersession.newModelBundleHash &&
  reaudit.modelBundleHash===terms.modelBundleHash &&
  supersession.status==='FINAL_SUPERSEDING_MODEL_BUNDLE' &&
  supersession.supersessionType==='SEMANTIC_CLARIFICATION_ONLY',
  'Current model bundle not connected by documented supersession');
for(const [key,value] of Object.entries(supersession.unchanged)){
  ck(value===true||key==='replayToleranceScaled'||key==='scoreSchemaId'||key==='thresholdRaw'||key==='thresholdScaled',
    'Supersession change requires review: '+key);
}
ck(supersession.unchanged.replayToleranceScaled===222 &&
  supersession.unchanged.thresholdScaled===57904037 &&
  supersession.unchanged.scoreSchemaId===terms.scoreSchemaId &&
  tolerance.scoreSchemaId===terms.scoreSchemaId &&
  Number(tolerance.thresholdScaled)===Number(terms.thresholdScaled) &&
  Number(policy.ai.replayToleranceScaled)===222 &&
  Number(tolerance.replayToleranceScaled)===222 &&
  Number(terms.scoreScaleExponent)===6,
  'Supersession altered replay numeric tolerance or score schema');
ck(oldReplay.schema==='InspectEscrow.ReplayResult.v1'&&
  oldReplay.execution_scope.type==='ARTIFACT_RELOAD_REPLAY' &&
  oldReplay.execution_scope.separate_machine_verified===false,
  'Historical Replay is not a known artifact-reload record');
ck(oldReplay.replay_target.dataset_relative_path===buyerAi.inspection.dataset_relative_path &&
  oldReplay.replay_target.input_image_sha256===buyerAi.inspection.input_image_sha256 &&
  oldReplay.reference.canonical_evidence_sha256===buyerAi.evidence_sha256 &&
  oldReplay.model.model_core_sha256===buyerAi.model.model_core_sha256,
  'Historical Replay does not reference Buyer canonical source and model core');
ck(oldReplay.verification.overall_replay_match===true &&
  oldReplay.verification.score_match===true &&
  oldReplay.verification.decision_match===true &&
  oldReplay.verification.input_image_integrity===true &&
  oldReplay.verification.model_state_loaded_strictly===true,
  'Historical replay flags do not report success');
ck(oldReplay.model_changed===false&&oldReplay.threshold_changed===false,
  'Old replay indicates changed model or threshold');
const threshold=BigInt(terms.thresholdScaled);
const scale=1_000_000;
const scaleScore=v=>BigInt(Math.round(Number(v)*scale)).toString();
const referenceScaled=BigInt(scaleScore(oldReplay.reference.anomaly_score));
const replayScaled=BigInt(scaleScore(oldReplay.replay.anomaly_score));
const buyerScore=BigInt(scaleScore(buyerAi.inspection.anomaly_score));
const delta=referenceScaled>replayScaled?referenceScaled-replayScaled:replayScaled-referenceScaled;
const historicalConsistent=delta<=222n &&
  (referenceScaled<threshold)===(replayScaled<threshold) &&
  replayScaled===buyerScore;
ck(historicalConsistent&&buyerAi.inspection.decision==='REVIEW_REQUIRED',
  'Historical replay failed score/tolerance/decision checks');
const tradeId=input.tradeId;
const dir='.patch3-local/'+tradeId.slice(2,14);
const signed=read(path.join(dir,'buyer.signed.json'));
const staged=read(path.join(dir,'buyer.prepared.json'));
ck(signed.tradeId===tradeId&&signed.roleName==='buyer'&&
  signed.message.evidencePackageHash===staged.evidencePackageHash&&
  signed.message.aggregateScoreScaled===buyerScore.toString() &&
  signed.message.modelBundleHash===terms.modelBundleHash,
  'Current staged Buyer evidence does not match historical replay source');
ck(signed.message.tradeId===tradeId &&
  signed.message.policyHash===commitment.policyHash &&
  getAddress(signed.station)===getAddress(terms.buyerStation),
  'Buyer EIP712 evidence binding mismatch');
const onDomain=await c.eip712Domain();
const domain=signed.domain;
ck(onDomain.name===domain.name&&onDomain.version===domain.version&&
  Number(onDomain.chainId)===Number(domain.chainId)&&
  getAddress(onDomain.verifyingContract)===getAddress(domain.verifyingContract),
  'Signed Station EIP712 domain mismatch');
const signedDigest=TypedDataEncoder.hash(domain,signed.types,signed.message);
ck(signedDigest===signed.digest &&
  await c.hashStationAttestation(signed.message)===signed.digest &&
  getAddress(verifyTypedData(domain,signed.types,signed.message,signed.signature))===
    getAddress(terms.buyerStation),'Buyer Station signed digest invalid');
ck(!(await c.consumedDigest(signed.digest)),'Buyer evidence already submitted/consumed');
// Draft is a provenance/integrity record for the operator.
// It is NOT a fresh replay and its hash MUST NOT be signed as though it were.
const draft={
  schema:'inspectescrow.patch3.historical-replay-provenance-draft/1',
  tradeId,policyHash:terms.policyHash,modelBundleHash:terms.modelBundleHash,
  buyerEvidencePackageHash:signed.message.evidencePackageHash,
  buyerStationAttestationDigest:signed.digest,
  publicDatasetImagePath:buyerAi.inspection.dataset_relative_path,
  publicDatasetImageSha256Declared:buyerAi.inspection.input_image_sha256,
  physicalSameSpecimenProven:false,
  actualNewReplayPerformed:false,
  crossMachineReproducibilityProven:false,
  historicalSource:{
    replayFile:frozenReplayFile,replayFileSha256:sha256(frozenReplayFile),
    originalAiFile:sourceFile,originalAiFileSha256:sha256(sourceFile),
    originalModelCoreSha256:buyerAi.model.model_core_sha256,
    originalReferenceScaled:referenceScaled.toString(),
    historicalReplayScaled:replayScaled.toString(),
    historicalAbsoluteDifferenceScaled:delta.toString(),
    toleranceScaled:222,
    historicalNumericallyConsistent:true
  },
  documentedBundleSupersession:{
    sourceFile:supersessionFile,sourceFileSha256:sha256(supersessionFile),
    historicalBundleHash:supersession.oldModelBundleHash,
    activeTradeBundleHash:supersession.newModelBundleHash,
    reason:supersession.reason,
    weightsAndScoresUnchangedPerRecord:true
  },
  newReplayArtifactRequired:true,
  humanInspectorAttestationRequired:true,
  inspectorSettlementDecisionRequired:true,
  inspectorDecisionEvidenceHashRequired:true,
  explicitlyNotAReplayAttestation:true,
  explicitlyNotAnInspectorDecision:true
};
const draftHash=canonicalKeccak(draft);
const outPath=path.join(dir,'historical-replay-provenance.draft.json');
if(write){
  ck(!fs.existsSync(outPath),'Draft file already exists; no overwrite by default');
  fs.writeFileSync(outPath,JSON.stringify({draft,draftHash},null,2)+'\n',
    {flag:'wx',mode:0o600});
}
console.log(JSON.stringify({
  status:'PASS_HISTORICAL_REPLAY_PROVENANCE_ONLY',
  tradeId,modelBundleHash:terms.modelBundleHash,
  historicalModelBundleHash:supersession.oldModelBundleHash,
  supersessionEvidenceVerified:true,
  historicalScoreDifferenceScaled:delta.toString(),
  replayToleranceScaled:222,
  historicalReplayClassification:'REVIEW',
  originalAiSourceFileIntegrity:'MATCHES_RECORDED_FROZEN_METADATA',
  freshReplayPerformed:false,
  tradeSpecificReplayReportCreated:false,
  inspectorStationSignaturesCreated:0,
  decisionEvidenceHashCreated:false,
  activationReady:false,
  draftHash,draftFileWritten:write?outPath:null,
  transactionsSent:0,activateCalled:false,
  critical:'Use the historical document ONLY as prior-model provenance. Fresh replay and an independently justified Inspector decision are still required.'
},null,2));
