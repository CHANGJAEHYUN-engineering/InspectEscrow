"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {keccak256,toUtf8Bytes,randomBytes,hexlify,ZeroHash,getAddress,Contract}=require("ethers");
const source=path.resolve(__dirname,"..","NEW_S05_PREP_HANDOFF_NO_TX");
const base=path.resolve(__dirname,"..");
const commitment=JSON.parse(fs.readFileSync(path.join(base,"MODEL_B_PATCH3_COMMITMENT_DRAFT.json"),"utf8"));
const reference=JSON.parse(fs.readFileSync(path.join(base,"MODEL_B_PATCH3_TRADE_TERMS.json"),"utf8"));
const unsignedRef=JSON.parse(fs.readFileSync(path.join(source,"buyer.station-attestation.UNSIGNED.json"),"utf8"));
const originalPolicy=JSON.parse(fs.readFileSync(path.join(source,"POLICY_HASH_PREIMAGE.jcs.json"),"utf8"));
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const assert=(value,message)=>{if(!value)throw Error(message);};
const sha256=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function canonical(value){
  if(value===null)return "null";
  if(typeof value==="string")return JSON.stringify(value);
  if(typeof value==="boolean")return String(value);
  if(typeof value==="number"){assert(Number.isSafeInteger(value),"CANONICAL_UNSAFE_NUMBER");return String(value);}
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  throw Error("CANONICAL_UNSUPPORTED_TYPE");
}
const hashObject=value=>keccak256(toUtf8Bytes(canonical(value)));
function policyForTrade(tradeId){
  assert(/^0x[a-fA-F0-9]{64}$/.test(tradeId),"INVALID_TRADE_ID");
  const preimage=structuredClone(originalPolicy);
  preimage.trade.tradeId=tradeId;
  return {hash:hashObject(preimage),preimage};
}
function validatePhotoInputs(images,report){
  assert(images&&typeof images==="object","THREE_VIEWS_REQUIRED");
  const results={};const hashes=[];
  for(const view of ["TOP","FRONT","SIDE"]){
    const f=images[view];assert(f&&typeof f.name==="string"&&f.name.length>0,"MISSING_IMAGE_"+view);
    assert(Buffer.isBuffer(f.bytes),"IMAGE_BYTES_REQUIRED_"+view);
    assert(f.bytes.length>=100&&f.bytes.length<=20*1024*1024,"IMAGE_SIZE_INVALID_"+view);
    assert(/\.(?:jpe?g|png)$/i.test(f.name),"IMAGE_EXTENSION_INVALID_"+view);
    const h=sha256(f.bytes);hashes.push(h);results[view]={sha256:h,bytes:f.bytes.length,fileName:path.basename(f.name)};
  }
  assert(new Set(hashes).size===3,"DUPLICATE_IMAGE_BYTES");
  assert(report&&typeof report==="object","MODEL_B_REPORT_REQUIRED");
  assert(report.original_image_sha256===results.TOP.sha256,"INFERENCE_TOP_IMAGE_MISMATCH");
  assert(report.original_image_bytes===results.TOP.bytes,"INFERENCE_TOP_BYTES_MISMATCH");
  assert(report.model_checkpoint_sha256===commitment.artifactCommitmentHash || report.model_checkpoint_sha256==="8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854","MODEL_CHECKPOINT_NOT_PINNED");
  assert(Number.isSafeInteger(report.score_scaled)&&report.score_scaled>=0,"INVALID_SCORE");
  const decision=report.score_scaled>=Number(reference.thresholdScaled)?"REVIEW_REQUIRED":"PASS";
  assert(report.decision===decision,"DECISION_SCORE_MISMATCH");
  assert(report.score_scaled===Math.round(Number(report.score_raw)*1e6),"SCORE_ROUNDING_MISMATCH");
  return results;
}
function makeBuyerBundle({tradeId,images,report,nonce,capturedAtUtc,label="BUYER-LIVE-REVIEW",attempt=1}){
  assert(/^0x[a-fA-F0-9]{64}$/.test(tradeId),"TRADE_ID_MUST_BE_32_BYTES");
  assert(tradeId.toLowerCase()!==reference.tradeId.toLowerCase(),"SETTLED_REFERENCE_TRADE_NOT_ALLOWED");
  assert(/^0x[a-fA-F0-9]{64}$/.test(nonce||"")&&nonce!==ZeroHash,"SESSION_NONCE_INVALID");
  assert(typeof capturedAtUtc==="string"&&!Number.isNaN(Date.parse(capturedAtUtc)),"SESSION_TIMESTAMP_INVALID");
  assert(typeof label==="string"&&label.length>0&&label.length<=120,"OPERATOR_LABEL_INVALID");
  assert(attempt===1,"ONLY_FIRST_BUYER_ATTEMPT_SUPPORTED");
  const captureFiles=validatePhotoInputs(images,report);
  const policyHash=policyForTrade(tradeId).hash;
  const station=getAddress(reference.buyerStation);
  const manifest={schema:"inspectescrow.modelb-specimen-manifest/2",
    tradeId,policyHash,
    specimenId:report.specimen_id,specimenCode:report.specimen_code,
    specimenIdentitySource:"USER_SELECTED_NOT_PHYSICALLY_VERIFIED",
    operatorSpecimenLabel:label,capturedAtUtc,sessionNonce:nonce,role:1,station,attempt,
    requiredCaptureViews:["TOP","FRONT","SIDE"],providedCaptureViews:["TOP","FRONT","SIDE"],captureFiles,
    aiInputView:"TOP",completeThreeViewCapture:true,physicalCustodyProven:false};
  const manifestHash=hashObject(manifest);
  const evidence={
    schema:"inspectescrow.modelb-trade-evidence/2",
    tradeId,policyHash,role:1,station,attempt,
    sessionNonce:nonce,capturedAtUtc,operatorSpecimenLabel:label,
    specimenManifestHash:manifestHash,
    inferenceReportSha256:sha256(Buffer.from(JSON.stringify(report,null,2)+"\n")),
    modelCheckpointSha256:report.model_checkpoint_sha256,
    modelBundleHash:reference.modelBundleHash,artifactCommitmentHash:commitment.artifactCommitmentHash,
    captureProfileHash:reference.captureProfileHash,productSpecHash:reference.productSpecHash,
    requiredViewSetHash:reference.requiredViewSetHash,scoreSchemaId:reference.scoreSchemaId,
    scoreScaled:String(report.score_scaled),contractThresholdScaled:String(reference.thresholdScaled),
    replayToleranceScaled:String(commitment.replayToleranceScaled),
    offchainDecision:report.decision,completeThreeViewCapture:true,originalFilesRetainedByOperator:true,
    aiExecutionTrustedToLocalBackend:true,stationAttestationDigest:ZeroHash};
  const evidenceHash=hashObject(evidence);
  const message={tradeId,role:1,station,attempt,sessionNonce:nonce,policyHash,modelBundleHash:reference.modelBundleHash,
    captureProfileHash:reference.captureProfileHash,specimenManifestHash:manifestHash,evidencePackageHash:evidenceHash,
    aggregateScoreScaled:String(report.score_scaled),scoreSchemaId:reference.scoreSchemaId,
    inspectionValidity:0,invalidReason:0,issuedAt:null,validUntil:null};
  const unsigned={schema:"inspectescrow.patch3.modelb-unsigned-station-template/2",status:"READY_FOR_STATION_PREPARATION",
    domain:unsignedRef.domain,types:unsignedRef.types,message,signature:null,transactionsSent:0};
  return {schema:"inspectescrow.modelb-browser-evidence-bundle/1",status:"READY_FOR_SEPARATE_STATION_SIGNATURE",
    roleName:"buyer",manifest,specimenManifestHash:manifestHash,evidencePackage:evidence,evidencePackageHash:evidenceHash,
    inferenceReport:report,unsigned,transactionsSent:0};
}
async function preflightBuyer({contract,provider,tradeId}){
  const fail=(reason,details={})=>({ok:false,reason,tradeId,...details});
  if(!/^0x[a-fA-F0-9]{64}$/.test(tradeId||""))return fail("INVALID_TRADE_ID");
  if(eq(tradeId,reference.tradeId))return fail("REFERENCE_TRADE_ALREADY_SETTLED");
  const net=await provider.getNetwork();if(Number(net.chainId)!==11155111)return fail("NOT_SEPOLIA");
  let terms,state,deadline,supplier,buyer,block,conserved,covered;
  try{[terms,state,deadline,supplier,buyer,block,conserved,covered]=await Promise.all([
      contract.getTradeTerms(tradeId),contract.getTradeState(tradeId),contract.getActionDeadline(tradeId),
      contract.getInspection(tradeId,0),contract.getInspection(tradeId,1),provider.getBlock("latest"),
      contract.accountingConserved(),contract.balanceCoversLiabilities()
  ]);}
  catch(e){return fail("TRADE_NOT_FOUND_OR_RPC_ERROR",{detail:String(e.shortMessage||e.message).slice(0,180)});}
  const now=Number(block.timestamp),due=Number(deadline),remaining=due-now,s=Number(state);
  const details={chainId:11155111,state:s,deadlineUnix:due,remainingSeconds:remaining,
    supplierOutcome:Number(supplier.outcome),supplierScoreScaled:supplier.aggregateScoreScaled.toString(),
    buyerSubmitted:Number(buyer.submittedAt)!==0,blockNumber:block.number,accountingConserved:conserved,balanceCoversLiabilities:covered};
  if(s!==8)return fail("REQUIRES_AWAIT_BUYER_STATE_8",details);
  if(!conserved||!covered)return fail("ACCOUNTING_INVARIANT_FAILED",details);
  if(remaining<=150)return fail("INSUFFICIENT_BUYER_DEADLINE",details);
  if(Number(supplier.outcome)!==2||Number(supplier.submittedAt)===0)return fail("SUPPLIER_PASS_MISSING",details);
  if(Number(buyer.submittedAt)!==0)return fail("BUYER_ALREADY_SUBMITTED",details);
  const expectedPolicyHash=policyForTrade(tradeId).hash;
  if(!eq(terms.policyHash,expectedPolicyHash))return fail("NEW_TRADE_POLICY_HASH_MISMATCH",{...details,expectedPolicyHash});
  for(const k of ["buyer","buyerStation","supplier","supplierStation","modelBundleHash","captureProfileHash","productSpecHash","requiredViewSetHash","scoreSchemaId"]){
    if(!eq(terms[k],reference[k]))return fail("TERMS_MISMATCH_"+k,details);
  }
  if(BigInt(terms.thresholdScaled)!==BigInt(reference.thresholdScaled))return fail("THRESHOLD_MISMATCH",details);
  if(BigInt(terms.escrowAmount)!==BigInt(reference.escrowAmount))return fail("ESCROW_MISMATCH",details);
  try{
    const registryAddress=await contract.credentialRegistry();if(!eq(registryAddress,commitment.credentialRegistry))return fail("CREDENTIAL_REGISTRY_MISMATCH",details);
    const registry=new Contract(registryAddress,["function status(address) view returns (uint8)"],provider);
    const status=Number(await registry.status(reference.buyerStation));
    if(status!==1)return fail("BUYER_STATION_NOT_ACTIVE",{...details,stationCredentialStatus:status});
  }catch(e){return fail("CREDENTIAL_CHECK_FAILED",{...details,detail:String(e.shortMessage||e.message).slice(0,160)});}
  return {ok:true,reason:"BUYER_REVIEW_PREPARATION_ELIGIBLE",tradeId,...details,buyerActor:reference.buyer,buyerStation:reference.buyerStation};
}
module.exports={canonical,hashObject,policyForTrade,sha256,validatePhotoInputs,makeBuyerBundle,preflightBuyer,reference,commitment};
