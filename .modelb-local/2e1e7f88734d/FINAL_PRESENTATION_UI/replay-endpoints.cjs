"use strict";

const {randomBytes,hexlify,TypedDataEncoder}=require("ethers");
const {hashObject,commitment}=require("./evidence-bridge.cjs");
const {verifyStaticEvidence,validateEvidencePayload}=require("./evidence-import-endpoints.cjs");
const {domain,replayTypes}=require("./e2e-endpoints.cjs");

const MODEL_URL="http://127.0.0.1:8766";
const CHECKPOINT_SHA256="8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854";
const MAX_REQUEST_BYTES=172*1024*1024;
const REPORT_SCHEMA="inspectescrow.modelb-inspector-replay-report/1";
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const fail=code=>{throw Error(code);};
const assert=(v,code)=>{if(!v)fail(code);};
const absBig=value=>value<0n?-value:value;

function readBody(req,max=MAX_REQUEST_BYTES){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,ended=false;
    req.on("data",chunk=>{if(ended)return;size+=chunk.length;if(size>max){ended=true;reject(Error("REPLAY_UPLOAD_TOO_LARGE"));req.destroy();return;}chunks.push(chunk);});
    req.on("error",reject);
    req.on("end",()=>{if(ended)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(Error("INVALID_JSON"));}});
  });
}

async function modelRuntimeStatus(){
  const response=await fetch(MODEL_URL+"/api/status",{signal:AbortSignal.timeout(15000)});
  const status=await response.json();
  assert(response.ok,"MODEL_B_STATUS_UNAVAILABLE");
  assert(status.mode==="OFFCHAIN_INFERENCE_ONLY","MODEL_B_RUNTIME_MODE_INVALID");
  assert(status.artifact_commitment?.verified===true,"MODEL_B_ARTIFACT_COMMITMENT_UNVERIFIED");
  assert(status.checkpoint_sha256===CHECKPOINT_SHA256,"MODEL_B_RUNTIME_CHECKPOINT_MISMATCH");
  assert(status.artifact_commitment.checkpoint_sha256===CHECKPOINT_SHA256,"MODEL_B_COMMITMENT_CHECKPOINT_MISMATCH");
  return status;
}

async function inferOriginalTop(staticResult){
  const image=staticResult.images.TOP;
  const form=new FormData();
  form.append("image",new Blob([image.bytes],{type:image.mime}),image.name);
  form.append("expected_sha256",image.sha256);
  // The frozen runtime's API compatibility ID is not the evidence's operator specimen identity.
  form.append("specimen_id","IE-DEMO-001");
  const started=Date.now();
  const response=await fetch(MODEL_URL+"/api/infer",{method:"POST",body:form,signal:AbortSignal.timeout(240000)});
  const result=await response.json();
  assert(response.ok,"MODEL_B_REPLAY_INFERENCE_FAILED");
  assert(result.original_image_sha256===image.sha256,"REPLAY_TOP_SHA256_MISMATCH");
  assert(Number(result.original_image_bytes)===image.size,"REPLAY_TOP_BYTES_MISMATCH");
  assert(result.model_checkpoint_sha256===CHECKPOINT_SHA256,"REPLAY_CHECKPOINT_MISMATCH");
  assert(Number.isSafeInteger(result.score_scaled)&&result.score_scaled>=0,"REPLAY_SCORE_INVALID");
  assert(result.score_scaled===Math.round(Number(result.score_raw)*1e6),"REPLAY_SCORE_ROUND_HALF_UP_MISMATCH");
  return {...result,inspectorReplayElapsedMs:Date.now()-started,independentAiReplayExecuted:true};
}

function compareRole({roleName,staticResult,verified,replayResult,toleranceScaled,controlledClaimScoreScaled=null}){
  assert(replayResult?.independentAiReplayExecuted===true,"ACTUAL_MODEL_REPLAY_REQUIRED_"+roleName.toUpperCase());
  const evidenceScore=BigInt(staticResult.normalized.message.aggregateScoreScaled);
  const submittedScore=controlledClaimScoreScaled===null?evidenceScore:BigInt(controlledClaimScoreScaled);
  const replayScore=BigInt(replayResult.score_scaled);
  const threshold=BigInt(staticResult.threshold);
  const tolerance=BigInt(toleranceScaled);
  assert(tolerance===0n,"UNVALIDATED_REPLAY_TOLERANCE_NOT_ALLOWED");
  const submittedDecision=submittedScore>=threshold?"REVIEW_REQUIRED":"PASS";
  const replayDecision=replayScore>=threshold?"REVIEW_REQUIRED":"PASS";
  const absoluteError=absBig(replayScore-submittedScore);
  const scoreConsistent=absoluteError<=tolerance;
  const decisionConsistent=submittedDecision===replayDecision;
  return {
    role:roleName,actualEvidenceSubmittedScoreScaled:String(evidenceScore),
    comparedSubmittedScoreScaled:String(submittedScore),controlledScoreOverride:controlledClaimScoreScaled!==null,
    replayScoreRawDecimal:String(replayResult.score_raw_decimal??replayResult.score_raw),replayScoreScaled:String(replayScore),absoluteErrorScaled:String(absoluteError),
    toleranceScaled:String(tolerance),thresholdScaled:String(threshold),submittedDecision,replayDecision,
    scoreConsistent,decisionConsistent,consistent:scoreConsistent&&decisionConsistent,
    evidencePackageHash:staticResult.evidenceHash,specimenManifestHash:staticResult.manifestHash,
    originals:Object.fromEntries(Object.entries(staticResult.images).map(([view,image])=>[view,{sha256:image.sha256,bytes:image.size,fileName:image.name}])),
    topInputSha256:staticResult.images.TOP.sha256,checkpointSha256:replayResult.model_checkpoint_sha256,
    preprocessing:replayResult.preprocessing,device:replayResult.device,inferredAtUtc:replayResult.inferred_at_utc,
    inspectorReplayElapsedMs:replayResult.inspectorReplayElapsedMs,onchainEvidenceHashMatched:verified.onchain.evidenceMatches,
    physicalSpecimenIdentityProven:false
  };
}

function assertPairBindings(supplier,buyer){
  assert(supplier.roleName==="supplier"&&buyer.roleName==="buyer","REPLAY_REQUIRES_SUPPLIER_AND_BUYER_ROLES");
  assert(eq(supplier.tradeId,buyer.tradeId),"PAIR_TRADE_ID_MISMATCH");
  for(const field of ["expectedPolicy"]){assert(eq(supplier[field],buyer[field]),"PAIR_POLICY_HASH_MISMATCH");}
  for(const field of ["modelBundleHash","captureProfileHash","scoreSchemaId"]){
    assert(eq(supplier.normalized.message[field],buyer.normalized.message[field]),"PAIR_"+field.toUpperCase()+"_MISMATCH");
  }
  assert(supplier.inference.checkpointSha256===buyer.inference.checkpointSha256,"PAIR_CHECKPOINT_MISMATCH");
  const supplierTolerance=String(supplier.normalized.evidence.replayToleranceScaled??commitment.replayToleranceScaled);
  const buyerTolerance=String(buyer.normalized.evidence.replayToleranceScaled??commitment.replayToleranceScaled);
  assert(supplierTolerance===buyerTolerance,"PAIR_REPLAY_TOLERANCE_MISMATCH");
  assert(BigInt(supplierTolerance)===0n,"UNVALIDATED_REPLAY_TOLERANCE_NOT_ALLOWED");
  return {tradeId:supplier.tradeId,policyHash:supplier.expectedPolicy,modelBundleHash:supplier.normalized.message.modelBundleHash,captureProfileHash:supplier.normalized.message.captureProfileHash,scoreSchemaId:supplier.normalized.message.scoreSchemaId,checkpointSha256:supplier.inference.checkpointSha256,replayToleranceScaled:supplierTolerance};
}

async function submissionContext(ctx,tradeId,body,controlled){
  const [network,block,terms,stateValue,deadlineValue,replay]=await Promise.all([
    ctx.provider.getNetwork(),ctx.provider.getBlock("latest"),ctx.contract.getTradeTerms(tradeId),ctx.contract.getTradeState(tradeId),ctx.contract.getActionDeadline(tradeId),ctx.contract.getReplay(tradeId)
  ]);
  const state=Number(stateValue),deadline=Number(deadlineValue),now=Number(block.timestamp),remaining=deadline?deadline-now:0;
  const stage=state===13?1:0;
  const actor=stage===0?terms.primaryInspector:terms.backupInspector;
  const station=stage===0?terms.primaryInspectorStation:terms.backupInspectorStation;
  let gate="BLOCKED_TRADE_STATE";
  if(controlled)gate="BLOCKED_CONTROLLED_RED_TEAM_TEST_ONLY";
  else if((state===12||state===13)&&remaining>120&&Number(replay[0])===0)gate="READY_FOR_FRESH_STATION_SIGNATURE";
  else if((state===12||state===13)&&remaining<=120)gate="BLOCKED_DEADLINE_INSUFFICIENT";
  else if(Number(replay[0])!==0)gate="BLOCKED_REPLAY_ALREADY_RECORDED";
  if(body.inspectorActor&& !eq(body.inspectorActor,actor))gate="BLOCKED_INSPECTOR_ACTOR_MISMATCH";
  const chainId=Number(network.chainId);return {chainId,contract:String(ctx.contract.target),domain:{name:"InspectEscrow",version:"1",chainId,verifyingContract:String(ctx.contract.target)},blockNumber:block.number,blockTimestamp:now,state,stateName:["NONE","PROPOSED","PARTIES_ACCEPTED","INSPECTORS_ACCEPTED","FUNDED","AWAIT_SUPPLIER","SUPPLIER_REINSPECTION","SUPPLIER_HOLD","AWAIT_BUYER","BUYER_REINSPECTION","BUYER_INSPECTION_TIMEOUT","ACCEPTANCE_PENDING","DISPUTED_PRIMARY","DISPUTED_BACKUP","EXECUTION_HOLD","EVIDENCE_HOLD","ESCALATED","RELEASED","REFUNDED","CANCELLED","ARBITRATION_PENDING"][state]||"UNKNOWN",deadline,remainingSeconds:remaining,stage,requiredActor:actor,requiredStation:station,replayStatus:Number(replay[0]),replayReportHash:replay[1],gate};
}

function buildReplayReport({bindings,supplier,buyer,runtime,contractSnapshot,controlled}){
  assert(supplier&&buyer,"BOTH_ROLE_REPLAY_RESULTS_REQUIRED");
  assert(supplier.checkpointSha256===CHECKPOINT_SHA256&&buyer.checkpointSha256===CHECKPOINT_SHA256,"REPORT_CHECKPOINT_MISMATCH");
  assert(supplier.replayScoreScaled!==undefined&&buyer.replayScoreScaled!==undefined,"ACTUAL_MODEL_REPLAY_REQUIRED");
  const consistent=supplier.consistent&&buyer.consistent;
  return {
    schema:REPORT_SCHEMA,mode:controlled?"CONTROLLED_RED_TEAM_TEST":"INDEPENDENT_MODEL_B_REPLAY",
    status:consistent?"CONSISTENT":"INCONSISTENT",consistent,independentAiReplayExecuted:true,
    tradeId:bindings.tradeId,policyHash:bindings.policyHash,modelBundleHash:bindings.modelBundleHash,
    captureProfileHash:bindings.captureProfileHash,scoreSchemaId:bindings.scoreSchemaId,
    checkpointSha256:bindings.checkpointSha256,replayToleranceScaled:bindings.replayToleranceScaled,
    toleranceBasis:"FROZEN_POLICY_EXACT_INTEGER_EQUALITY_SAME_ARTIFACT_AND_RUNTIME_ONLY",
    roles:{supplier,buyer},
    runtimeProvenance:{app:runtime.app,mode:runtime.mode,artifactCommitmentVerified:runtime.artifact_commitment.verified,checkpointSha256:runtime.checkpoint_sha256,serverSourceSha256:runtime.artifact_commitment.server_source_sha256,requirementsSha256:runtime.artifact_commitment.requirements_sha256,modelLoaded:runtime.model_loaded},
    contractSnapshot,
    controlledRedTeam:controlled?{label:"CONTROLLED RED-TEAM TEST",maliciousClaimIsActualModelOutput:false,onchainSubmissionAllowed:false}:null,
    limitations:["Replay consistency proves reproducibility in the recorded runtime, not physical specimen identity or product quality.","FRONT and SIDE are integrity evidence; Model B inference input is TOP only.","Cross-hardware reproducibility is not verified."],
    generatedAtUtc:new Date().toISOString(),transactionsSent:0
  };
}

async function executeIndependentReplay(ctx,body){
  assert(body&&body.supplier&&body.buyer,"SUPPLIER_AND_BUYER_EVIDENCE_REQUIRED");
  const controlled=body.controlledRedTeam===true;
  if(body.controlledRedTeam!==undefined)assert(typeof body.controlledRedTeam==="boolean","CONTROLLED_RED_TEAM_FLAG_INVALID");
  const supplierStatic=verifyStaticEvidence({...body.supplier,expectedRole:"supplier"});
  const buyerStatic=verifyStaticEvidence({...body.buyer,expectedRole:"buyer"});
  const bindings=assertPairBindings(supplierStatic,buyerStatic);
  const [supplierVerified,buyerVerified]=await Promise.all([validateEvidencePayload(ctx,{...body.supplier,expectedRole:"supplier"}),validateEvidencePayload(ctx,{...body.buyer,expectedRole:"buyer"})]);
  assert(supplierVerified.replayInputStatus==="REPLAY_INPUT_ELIGIBLE","SUPPLIER_REPLAY_INPUT_NOT_ELIGIBLE");
  assert(buyerVerified.replayInputStatus==="REPLAY_INPUT_ELIGIBLE","BUYER_REPLAY_INPUT_NOT_ELIGIBLE");
  assert(eq(supplierVerified.tradeId,buyerVerified.tradeId),"VERIFIED_PAIR_TRADE_MISMATCH");
  const runtime=await modelRuntimeStatus();
  const supplierInference=await inferOriginalTop(supplierStatic);
  const buyerInference=await inferOriginalTop(buyerStatic);
  const overrides=body.controlledScoreOverrides||{};
  if(!controlled)assert(Object.keys(overrides).length===0,"SCORE_OVERRIDE_REQUIRES_CONTROLLED_RED_TEAM_MODE");
  const supplier=compareRole({roleName:"supplier",staticResult:supplierStatic,verified:supplierVerified,replayResult:supplierInference,toleranceScaled:bindings.replayToleranceScaled,controlledClaimScoreScaled:controlled&&overrides.supplier!==undefined?String(overrides.supplier):null});
  const buyer=compareRole({roleName:"buyer",staticResult:buyerStatic,verified:buyerVerified,replayResult:buyerInference,toleranceScaled:bindings.replayToleranceScaled,controlledClaimScoreScaled:controlled&&overrides.buyer!==undefined?String(overrides.buyer):null});
  const contractSnapshot=await submissionContext(ctx,bindings.tradeId,body,controlled);
  const report=buildReplayReport({bindings,supplier,buyer,runtime,contractSnapshot,controlled});
  const replayReportHash=hashObject(report);
  let unsignedAttestation=null;
  if(contractSnapshot.gate==="READY_FOR_FRESH_STATION_SIGNATURE"){
    const validUntil=Math.min(contractSnapshot.deadline,contractSnapshot.blockTimestamp+600);
    assert(validUntil>contractSnapshot.blockTimestamp+60,"BLOCKED_DEADLINE_INSUFFICIENT");
    const message={tradeId:bindings.tradeId,stage:contractSnapshot.stage,inspectorActor:contractSnapshot.requiredActor,policyHash:bindings.policyHash,supplierEvidenceHash:supplier.evidencePackageHash,buyerEvidenceHash:buyer.evidencePackageHash,replayReportHash,consistent:report.consistent,nonce:hexlify(randomBytes(32)),issuedAt:contractSnapshot.blockTimestamp,validUntil};
    const digest=TypedDataEncoder.hash(contractSnapshot.domain,replayTypes,message);
    const contractDigest=await ctx.contract.hashReplayAttestation(message);
    assert(eq(digest,contractDigest),"REPLAY_EIP712_CONTRACT_DIGEST_MISMATCH");
    const consumed=await ctx.contract.consumedDigest(digest);
    assert(consumed===false,"REPLAY_DIGEST_ALREADY_CONSUMED");
    unsignedAttestation={stage:"UNSIGNED_REPLAY_ATTESTATION_NOT_ONCHAIN",function:"recordReplayResult",actor:contractSnapshot.requiredActor,station:contractSnapshot.requiredStation,domain:contractSnapshot.domain,types:replayTypes,message,digest,contractDigest,signature:null,transactionsSent:0};
  }
  return {ok:true,status:report.status,mode:report.mode,report,replayReportHash,unsignedAttestation,submissionGate:contractSnapshot.gate,actualAiReplayExecuted:true,transactionsSent:0};
}

function verifyReportEnvelope(body){
  assert(body&&body.report&&typeof body.report==="object","REPLAY_REPORT_REQUIRED");
  assert(body.report.schema===REPORT_SCHEMA,"REPLAY_REPORT_SCHEMA_INVALID");
  assert(["CONSISTENT","INCONSISTENT","UNVERIFIABLE","BLOCKED"].includes(body.report.status),"REPLAY_REPORT_STATUS_INVALID");
  if(body.report.status==="CONSISTENT"||body.report.status==="INCONSISTENT")assert(body.report.independentAiReplayExecuted===true,"ACTUAL_MODEL_REPLAY_REQUIRED");
  const computed=hashObject(body.report);
  assert(eq(computed,body.replayReportHash),"REPLAY_REPORT_HASH_MISMATCH");
  return {ok:true,status:"REPORT_HASH_VERIFIED",replayReportHash:computed,mode:body.report.mode,tradeId:body.report.tradeId,independentAiReplayExecuted:body.report.independentAiReplayExecuted,transactionsSent:0};
}

async function replayStatus(ctx,tradeId){
  assert(/^0x[0-9a-fA-F]{64}$/.test(tradeId),"TRADE_ID_INVALID");
  const snapshot=await submissionContext(ctx,tradeId,{},false);
  return {source:snapshot.chainId===11155111?"LIVE_SEPOLIA_READ_ONLY":"LOCAL_ANVIL_READ_ONLY",tradeId,...snapshot,transactionsSent:0};
}

const send=(res,code,value)=>{res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));};
async function handle(req,res,ctx,url){
  if(url.pathname==="/api/replay/execute"&&req.method==="POST"){
    if(req.headers.origin&&req.headers.origin!=="http://"+req.headers.host)return send(res,403,{ok:false,status:"UNVERIFIABLE",error:"ORIGIN_REJECTED",transactionsSent:0});
    if(req.headers["x-inspectescrow-local"]!=="1"||!String(req.headers["content-type"]||"").startsWith("application/json"))return send(res,403,{ok:false,status:"UNVERIFIABLE",error:"LOCAL_JSON_HEADER_REQUIRED",transactionsSent:0});
    try{return send(res,200,await executeIndependentReplay(ctx,await readBody(req)));}
    catch(error){const code=String(error.shortMessage||error.message||error).slice(0,280),blocked=/^BLOCKED_|DEADLINE|ACTOR_MISMATCH/.test(code);return send(res,blocked?409:422,{ok:false,status:blocked?"BLOCKED":"UNVERIFIABLE",actualAiReplayExecuted:false,error:code,replayReportHash:null,transactionsSent:0});}
  }
  if(url.pathname==="/api/replay/verify-report"&&req.method==="POST"){
    if(req.headers.origin&&req.headers.origin!=="http://"+req.headers.host)return send(res,403,{ok:false,error:"ORIGIN_REJECTED"});
    if(req.headers["x-inspectescrow-local"]!=="1")return send(res,403,{ok:false,error:"LOCAL_HEADER_REQUIRED"});
    try{return send(res,200,verifyReportEnvelope(await readBody(req,2*1024*1024)));}
    catch(error){return send(res,422,{ok:false,status:"UNVERIFIABLE",error:String(error.message).slice(0,240),transactionsSent:0});}
  }
  if(url.pathname==="/api/replay/status"&&req.method==="GET"){
    try{return send(res,200,await replayStatus(ctx,String(url.searchParams.get("tradeId")||"")));}
    catch(error){return send(res,422,{ok:false,status:"BLOCKED",error:String(error.shortMessage||error.message||error).slice(0,240),transactionsSent:0});}
  }
  return send(res,405,{error:"METHOD_OR_ROUTE_NOT_ALLOWED"});
}

module.exports={handle,executeIndependentReplay,verifyReportEnvelope,compareRole,assertPairBindings,buildReplayReport,inferOriginalTop,modelRuntimeStatus,submissionContext,REPORT_SCHEMA};
