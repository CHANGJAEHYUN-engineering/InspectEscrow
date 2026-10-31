"use strict";

const {randomBytes,hexlify,ZeroHash}=require("ethers");
const {hashObject,policyForTrade,sha256,reference,commitment}=require("./evidence-bridge.cjs");
const {stationTypes}=require("./e2e-endpoints.cjs");
const {verifyStaticEvidence}=require("./evidence-import-endpoints.cjs");
const {readTrade,requireTradeId}=require("./dynamic-trade-context.cjs");
const {candidateTerms}=require("./new-trade-endpoints.cjs");

const MODEL_URL="http://127.0.0.1:8766";
const CHECKPOINT_SHA256="8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854";
const MAX_IMAGE_BYTES=20*1024*1024;
const MAX_BODY_BYTES=86*1024*1024;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const assert=(v,code)=>{if(!v)throw Error(code);};

function readBody(req,max=MAX_BODY_BYTES){
  return new Promise((resolve,reject)=>{const chunks=[];let size=0,ended=false;
    req.on("data",chunk=>{if(ended)return;size+=chunk.length;if(size>max){ended=true;reject(Error("UPLOAD_TOO_LARGE"));req.destroy();return;}chunks.push(chunk);});
    req.on("error",reject);req.on("end",()=>{if(ended)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(Error("INVALID_JSON"));}});
  });
}

function decodeImage(item,view){
  assert(item&&typeof item.name==="string"&&typeof item.data==="string","MISSING_IMAGE_"+view);
  assert(item.name.length>3&&item.name.length<=160&&!/[\\/\x00-\x1f]/.test(item.name),"INVALID_IMAGE_FILENAME_"+view);
  assert(/\.(?:jpe?g|png)$/i.test(item.name),"INVALID_IMAGE_EXTENSION_"+view);
  assert(item.data.length>100&&item.data.length<=Math.ceil(MAX_IMAGE_BYTES*4/3)+4&&item.data.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(item.data),"INVALID_BASE64_"+view);
  const bytes=Buffer.from(item.data,"base64");
  assert(bytes.length>=500&&bytes.length<=MAX_IMAGE_BYTES,"IMAGE_SIZE_INVALID_"+view);
  const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  assert(jpeg||png,"IMAGE_MAGIC_INVALID_"+view);
  return {name:item.name,bytes,mime:png?"image/png":"image/jpeg",sha256:sha256(bytes)};
}

function validateMetadata(body){
  const role=String(body.role||"").toLowerCase();
  assert(role==="supplier"||role==="buyer","ROLE_MUST_BE_SUPPLIER_OR_BUYER");
  const operatorSpecimenId=String(body.operatorSpecimenId||"").trim();
  assert(operatorSpecimenId.length>=2&&operatorSpecimenId.length<=100&&!/[\x00-\x1f]/.test(operatorSpecimenId),"OPERATOR_SPECIMEN_ID_INVALID");
  const sessionId=String(body.sessionId||"").trim();
  assert(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(sessionId),"SESSION_ID_INVALID");
  const capturedAtUtc=String(body.sessionCreatedAtUtc||"");
  assert(capturedAtUtc&&!Number.isNaN(Date.parse(capturedAtUtc)),"SESSION_CREATED_AT_INVALID");
  const tradeId=requireTradeId(body.tradeId);
  const sourceClassification=String(body.sourceClassification||"OPERATOR_PROVIDED_LIVE_OR_UPLOAD_NOT_VERIFIED").slice(0,120);
  return {role,roleValue:role==="supplier"?0:1,operatorSpecimenId,sessionId,capturedAtUtc,sourceClassification,tradeId};
}

async function modelStatus(){
  const response=await fetch(MODEL_URL+"/api/status",{signal:AbortSignal.timeout(15000)});
  const value=await response.json();
  assert(response.ok,"MODEL_B_STATUS_UNAVAILABLE");
  assert(value.mode==="OFFCHAIN_INFERENCE_ONLY"&&value.artifact_commitment?.verified===true,"MODEL_B_ARTIFACT_COMMITMENT_UNVERIFIED");
  assert(value.checkpoint_sha256===CHECKPOINT_SHA256,"MODEL_B_CHECKPOINT_MISMATCH");
  return value;
}

async function inferTop(image,operatorSpecimenId){
  const form=new FormData();
  form.append("image",new Blob([image.bytes],{type:image.mime}),image.name);
  form.append("expected_sha256",image.sha256);
  // The frozen runtime accepts this compatibility ID only. It is not used as the operator specimen identity.
  form.append("specimen_id","IE-DEMO-001");
  const response=await fetch(MODEL_URL+"/api/infer",{method:"POST",body:form,signal:AbortSignal.timeout(240000)});
  const runtimeReport=await response.json();
  assert(response.ok,"MODEL_B_INFERENCE_FAILED_"+String(runtimeReport.detail||response.status));
  assert(runtimeReport.original_image_sha256===image.sha256,"MODEL_B_TOP_SHA256_MISMATCH");
  assert(Number(runtimeReport.original_image_bytes)===image.bytes.length,"MODEL_B_TOP_BYTES_MISMATCH");
  assert(runtimeReport.model_checkpoint_sha256===CHECKPOINT_SHA256,"MODEL_B_INFERENCE_CHECKPOINT_MISMATCH");
  assert(Number.isSafeInteger(runtimeReport.score_scaled)&&runtimeReport.score_scaled===Math.round(Number(runtimeReport.score_raw)*1e6),"MODEL_B_SCORE_SCALING_INVALID");
  return {...runtimeReport,
    schema:"InspectEscrow.ModelB.DynamicEvidenceInference.v1",
    status:"OFFCHAIN_EVIDENCE_PREPARATION_NOT_SUBMITTED",
    specimen_id:operatorSpecimenId,specimen_code:"OPERATOR_PROVIDED",
    specimen_label_source:"OPERATOR_ENTERED_NOT_PHYSICALLY_VERIFIED",
    runtime_api_specimen_id:runtimeReport.specimen_id,
    runtime_api_specimen_code:runtimeReport.specimen_code,
    runtime_source_unchanged:true,
    station_signed_in_this_app:false,sent_to_blockchain:false
  };
}

async function config(ctx,tradeId){
  const [runtime,trade]=await Promise.all([modelStatus(),readTrade(ctx,tradeId)]),terms=trade.terms;
  const isDraftCandidate=eq(trade.tradeId,candidateTerms.tradeId);
  return {ok:true,source:trade.source+"_AND_LOCAL_MODEL_B",tradeId:trade.tradeId,state:trade.state,blockNumber:trade.blockNumber,chainId:trade.chainId,contract:trade.contract,
    governanceStatus:isDraftCandidate?"DRAFT_MODEL_B_NOT_APPROVED_FOR_ONCHAIN":"ONCHAIN_TRADE_EXISTS_LOCAL_POLICY_APPROVAL_RECORD_NOT_LOADED",
    offchainEvidencePreparationAllowed:true,onchainSubmissionAllowed:false,
    policyHash:terms.policyHash,modelBundleHash:terms.modelBundleHash,captureProfileHash:terms.captureProfileHash,
    productSpecHash:terms.productSpecHash,requiredViewSetHash:terms.requiredViewSetHash,scoreSchemaId:terms.scoreSchemaId,
    thresholdScaled:String(terms.thresholdScaled),stations:{supplier:trade.roles.supplierStation,buyer:trade.roles.buyerStation},domain:trade.domain,
    runtime:{app:runtime.app,mode:runtime.mode,checkpointSha256:runtime.checkpoint_sha256,artifactCommitmentVerified:runtime.artifact_commitment.verified,
      compatibilitySpecimenId:"IE-DEMO-001",compatibilitySpecimenCode:"S05",dynamicOperatorIdentityHandledOutsideFrozenRuntime:true},
    serverStoresOriginals:false,serverTransactionsSent:0};
}

async function preview(ctx,body){
  const meta=validateMetadata(body),top=decodeImage(body.images?.TOP,"TOP"),bindings=await config(ctx,meta.tradeId);
  const report=await inferTop(top,meta.operatorSpecimenId);
  return {ok:true,status:"TOP_ONLY_AI_COMPLETE_EVIDENCE_INCOMPLETE",tradeId:bindings.tradeId,role:meta.role,
    operatorSpecimenId:meta.operatorSpecimenId,sessionId:meta.sessionId,sessionCreatedAtUtc:meta.capturedAtUtc,
    originalTopSha256:top.sha256,originalTopBytes:top.bytes.length,inferenceReport:report,
    scoreRaw:report.score_raw,scoreScaled:String(report.score_scaled),thresholdScaled:bindings.thresholdScaled,decision:report.decision,
    modelBundleHash:bindings.modelBundleHash,policyHash:bindings.policyHash,missingViews:["FRONT","SIDE"],
    evidenceBundleComplete:false,stationSignatureComplete:false,onchainSubmitted:false,transactionsSent:0,
    limitation:"Session creation time is not camera EXIF time. TOP inference does not complete the required three-view evidence."};
}

async function build(ctx,body){
  const meta=validateMetadata(body),bindings=await config(ctx,meta.tradeId);
  const images=Object.fromEntries(["TOP","FRONT","SIDE"].map(view=>[view,decodeImage(body.images?.[view],view)]));
  assert(new Set(Object.values(images).map(x=>x.sha256)).size===3,"DUPLICATE_VIEW_IMAGE_BYTES");
  const report=await inferTop(images.TOP,meta.operatorSpecimenId);
  const nonce=hexlify(randomBytes(32));
  const station=bindings.stations[meta.role];
  const captureFiles=Object.fromEntries(["TOP","FRONT","SIDE"].map(view=>[view,{fileName:images[view].name,sha256:images[view].sha256,bytes:images[view].bytes.length}]));
  const manifest={schema:"inspectescrow.modelb-specimen-manifest/2",tradeId:bindings.tradeId,policyHash:bindings.policyHash,
    specimenId:meta.operatorSpecimenId,specimenCode:"OPERATOR_PROVIDED",specimenIdentitySource:"OPERATOR_ENTERED_NOT_PHYSICALLY_VERIFIED",
    operatorSpecimenLabel:meta.operatorSpecimenId,capturedAtUtc:meta.capturedAtUtc,capturedAtMeaning:"INSPECTION_SESSION_CREATED_AT_NOT_CAMERA_EXIF",sourceClassification:meta.sourceClassification,
    sessionId:meta.sessionId,sessionNonce:nonce,role:meta.roleValue,station,attempt:1,
    requiredCaptureViews:["TOP","FRONT","SIDE"],providedCaptureViews:["TOP","FRONT","SIDE"],captureFiles,
    aiInputView:"TOP",completeThreeViewCapture:true,physicalCustodyProven:false,
    frozenRuntimeCompatibilityId:"IE-DEMO-001",frozenRuntimeCompatibilityCode:"S05",runtimeIdentityIsNotSpecimenIdentity:true};
  const specimenManifestHash=hashObject(manifest);
  const evidencePackage={schema:"inspectescrow.modelb-trade-evidence/2",tradeId:bindings.tradeId,policyHash:bindings.policyHash,
    role:meta.roleValue,station,attempt:1,sessionNonce:nonce,capturedAtUtc:meta.capturedAtUtc,operatorSpecimenLabel:meta.operatorSpecimenId,
    specimenManifestHash,inferenceReportSha256:sha256(Buffer.from(JSON.stringify(report,null,2)+"\n")),
    modelCheckpointSha256:CHECKPOINT_SHA256,modelBundleHash:bindings.modelBundleHash,artifactCommitmentHash:commitment.artifactCommitmentHash,
    captureProfileHash:bindings.captureProfileHash,productSpecHash:bindings.productSpecHash,requiredViewSetHash:bindings.requiredViewSetHash,
    scoreSchemaId:bindings.scoreSchemaId,scoreScaled:String(report.score_scaled),contractThresholdScaled:bindings.thresholdScaled,
    replayToleranceScaled:String(commitment.replayToleranceScaled),offchainDecision:report.decision,completeThreeViewCapture:true,
    originalFilesRetainedByOperator:true,aiExecutionTrustedToLocalBackend:true,stationAttestationDigest:ZeroHash,
    onchainSubmissionStatus:"NOT_SUBMITTED"};
  const evidencePackageHash=hashObject(evidencePackage);
  const message={tradeId:bindings.tradeId,role:meta.roleValue,station,attempt:1,sessionNonce:nonce,policyHash:bindings.policyHash,
    modelBundleHash:bindings.modelBundleHash,captureProfileHash:bindings.captureProfileHash,specimenManifestHash,evidencePackageHash,
    aggregateScoreScaled:String(report.score_scaled),scoreSchemaId:bindings.scoreSchemaId,inspectionValidity:0,invalidReason:0,issuedAt:null,validUntil:null};
  const unsigned={schema:"inspectescrow.patch3.modelb-unsigned-station-template/2",status:"FRESH_STATION_SIGNATURE_REQUIRED_AT_SUBMISSION_TIME",
    domain:bindings.domain,types:stationTypes,message,signature:null,transactionsSent:0};
  const bundle={schema:"inspectescrow.modelb-browser-evidence-bundle/1",status:"OFFCHAIN_EVIDENCE_PREPARED_UNSIGNED_NOT_SUBMITTED",
    roleName:meta.role,manifest,specimenManifestHash,evidencePackage,evidencePackageHash,inferenceReport:report,unsigned,
    signature:null,transactionsSent:0};
  return {ok:true,status:bundle.status,bundle,hashes:{images:Object.fromEntries(Object.entries(images).map(([view,x])=>[view,x.sha256])),specimenManifestHash,evidencePackageHash},
    scoreRaw:report.score_raw,scoreScaled:String(report.score_scaled),thresholdScaled:bindings.thresholdScaled,decision:report.decision,
    stationSignatureComplete:false,onchainSubmitted:false,serverStoredOriginals:false,serverStoredBundle:false,transactionsSent:0};
}

async function replayOffchain(body){
  const staticResult=verifyStaticEvidence(body);
  const runtime=await modelStatus();
  const replay=await inferTop(staticResult.images.TOP,staticResult.normalized.manifest.specimenId||staticResult.normalized.manifest.operatorSpecimenLabel);
  const submitted=BigInt(staticResult.normalized.message.aggregateScoreScaled),rerun=BigInt(replay.score_scaled),error=submitted>rerun?submitted-rerun:rerun-submitted;
  const threshold=BigInt(staticResult.threshold),submittedDecision=submitted>=threshold?"REVIEW_REQUIRED":"PASS",replayDecision=rerun>=threshold?"REVIEW_REQUIRED":"PASS";
  const consistent=error===0n&&submittedDecision===replayDecision;
  const report={schema:"inspectescrow.modelb-offchain-single-replay-report/1",mode:"OFFCHAIN_PRE_SUBMISSION_INDEPENDENT_MODEL_B_REPLAY",
    status:consistent?"CONSISTENT":"INCONSISTENT",consistent,independentAiReplayExecuted:true,tradeId:staticResult.tradeId,role:staticResult.roleName,
    evidencePackageHash:staticResult.evidenceHash,specimenManifestHash:staticResult.manifestHash,topInputSha256:staticResult.images.TOP.sha256,
    checkpointSha256:CHECKPOINT_SHA256,submittedScoreScaled:String(submitted),replayScoreScaled:String(rerun),absoluteErrorScaled:String(error),
    toleranceScaled:"0",submittedDecision,replayDecision,policyHash:staticResult.expectedPolicy,modelBundleHash:staticResult.normalized.message.modelBundleHash,
    runtimeProvenance:{app:runtime.app,mode:runtime.mode,checkpointSha256:runtime.checkpoint_sha256,artifactCommitmentVerified:runtime.artifact_commitment.verified},
    onchainEvidenceSubmitted:false,submissionGate:"BLOCKED_OFFCHAIN_EVIDENCE_NOT_SUBMITTED",
    limitations:["This proves same-runtime reproducibility only, not physical specimen identity or custody.","FRONT and SIDE are integrity evidence; Model B input is TOP only."],
    generatedAtUtc:new Date().toISOString(),transactionsSent:0};
  return {ok:true,status:report.status,actualAiReplayExecuted:true,report,replayReportHash:hashObject(report),submissionGate:report.submissionGate,transactionsSent:0};
}

const send=(res,code,value)=>{res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));};
async function handle(req,res,ctx,url){
  if(url.pathname==="/api/live/config"&&req.method==="GET"){
    try{return send(res,200,await config(ctx,url.searchParams.get("tradeId")));}catch(error){return send(res,422,{ok:false,error:String(error.shortMessage||error.message||error).slice(0,280),transactionsSent:0});}
  }
  if(["/api/live/infer","/api/live/build","/api/live/replay"].includes(url.pathname)&&req.method==="POST"){
    if(req.headers.origin&&req.headers.origin!=="http://"+req.headers.host)return send(res,403,{ok:false,error:"ORIGIN_REJECTED"});
    if(req.headers["x-inspectescrow-local"]!=="1"||!String(req.headers["content-type"]||"").startsWith("application/json"))return send(res,403,{ok:false,error:"LOCAL_JSON_HEADER_REQUIRED"});
    try{const body=await readBody(req);const value=url.pathname.endsWith("/infer")?await preview(ctx,body):url.pathname.endsWith("/build")?await build(ctx,body):await replayOffchain(body);return send(res,200,value);}
    catch(error){return send(res,422,{ok:false,status:"UNVERIFIABLE",actualAiReplayExecuted:false,error:String(error.shortMessage||error.message||error).slice(0,300),transactionsSent:0});}
  }
  return send(res,405,{error:"METHOD_OR_ROUTE_NOT_ALLOWED"});
}

module.exports={handle,config,preview,build,replayOffchain,decodeImage,inferTop};
