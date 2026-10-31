"use strict";

const crypto=require("node:crypto");
const {
  AbiCoder,TypedDataEncoder,verifyTypedData,getAddress,keccak256,ZeroHash
}=require("ethers");
const {hashObject,sha256,reference}=require("./evidence-bridge.cjs");
const {domain:contractDomain,stationTypes}=require("./e2e-endpoints.cjs");

const ROLE_NAMES=["supplier","buyer"];
const STATE_NAMES=["NONE","PROPOSED","PARTIES_ACCEPTED","INSPECTORS_ACCEPTED","FUNDED","AWAIT_SUPPLIER","SUPPLIER_REINSPECTION","SUPPLIER_HOLD","AWAIT_BUYER","BUYER_REINSPECTION","BUYER_INSPECTION_TIMEOUT","ACCEPTANCE_PENDING","DISPUTED_PRIMARY","DISPUTED_BACKUP","EXECUTION_HOLD","EVIDENCE_HOLD","ESCALATED","RELEASED","REFUNDED","CANCELLED","ARBITRATION_PENDING"];
const CHECKPOINT_SHA256="8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854";
const MAX_JSON_BYTES=512*1024;
const MAX_IMAGE_BYTES=20*1024*1024;
const MAX_REQUEST_BYTES=84*1024*1024;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const fail=code=>{throw Error(code);};
const assert=(v,code)=>{if(!v)fail(code);};
const isBytes32=v=>/^0x[0-9a-fA-F]{64}$/.test(String(v||""));

function readBody(req,max=MAX_REQUEST_BYTES){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,ended=false;
    req.on("data",chunk=>{
      if(ended)return;size+=chunk.length;
      if(size>max){ended=true;reject(Error("UPLOAD_TOO_LARGE"));req.destroy();return;}
      chunks.push(chunk);
    });
    req.on("error",reject);
    req.on("end",()=>{
      if(ended)return;
      try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}
      catch{reject(Error("INVALID_JSON"));}
    });
  });
}

function decodeImage(item,view){
  assert(item&&typeof item.name==="string"&&typeof item.data==="string","MISSING_IMAGE_"+view);
  assert(item.name.length>3&&item.name.length<=160&&!/[\\/\x00-\x1f]/.test(item.name),"INVALID_IMAGE_FILENAME_"+view);
  assert(/\.(?:jpe?g|png)$/i.test(item.name),"INVALID_IMAGE_EXTENSION_"+view);
  assert(item.data.length>100&&item.data.length<=Math.ceil(MAX_IMAGE_BYTES*4/3)+4,"IMAGE_TOO_LARGE_"+view);
  assert(item.data.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(item.data),"INVALID_BASE64_"+view);
  const bytes=Buffer.from(item.data,"base64");
  assert(bytes.length>=500&&bytes.length<=MAX_IMAGE_BYTES,"IMAGE_SIZE_INVALID_"+view);
  const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  assert(jpeg||png,"IMAGE_MAGIC_INVALID_"+view);
  return {view,name:item.name,bytes,sha256:sha256(bytes),size:bytes.length,mime:png?"image/png":"image/jpeg"};
}

function normalizeBundle(bundle){
  assert(bundle&&typeof bundle==="object"&&!Array.isArray(bundle),"BUNDLE_OBJECT_REQUIRED");
  const serialized=Buffer.byteLength(JSON.stringify(bundle));
  assert(serialized<=MAX_JSON_BYTES,"BUNDLE_JSON_TOO_LARGE");
  if(bundle.schema==="inspectescrow.modelb-browser-evidence-bundle/1"){
    assert(bundle.manifest&&bundle.evidencePackage&&bundle.unsigned,"BUNDLE_REQUIRED_SECTIONS_MISSING");
    return {
      format:"MODEL_B_BROWSER_EVIDENCE_V1",raw:bundle,roleName:bundle.roleName,
      manifest:bundle.manifest,evidence:bundle.evidencePackage,inferenceReport:bundle.inferenceReport,
      manifestHash:bundle.specimenManifestHash,evidenceHash:bundle.evidencePackageHash,
      domain:bundle.unsigned.domain,types:bundle.unsigned.types,message:bundle.unsigned.message,
      signature:bundle.signature||bundle.unsigned.signature||null,
      declaredTransactions:Number(bundle.transactionsSent||bundle.unsigned.transactionsSent||0)
    };
  }
  if(bundle.manifest&&bundle.evidence&&bundle.domain&&bundle.types&&bundle.message){
    return {
      format:"MODEL_B_STAGE_EVIDENCE_V1",raw:bundle,roleName:bundle.role,
      manifest:bundle.manifest,evidence:bundle.evidence,inferenceReport:bundle.inferenceReport||bundle.liveModelResult||null,
      manifestHash:bundle.message.specimenManifestHash,evidenceHash:bundle.message.evidencePackageHash,
      domain:bundle.domain,types:bundle.types,message:bundle.message,
      signature:bundle.signature||null,declaredTransactions:Number(bundle.transactionsSent||0)
    };
  }
  fail("UNSUPPORTED_EVIDENCE_SCHEMA");
}

function verifyTypeSchema(types){
  assert(types&&Array.isArray(types.StationAttestation),"STATION_ATTESTATION_TYPES_MISSING");
  const expected=stationTypes.StationAttestation;
  assert(types.StationAttestation.length===expected.length,"STATION_ATTESTATION_TYPE_LENGTH_MISMATCH");
  for(let i=0;i<expected.length;i++){
    assert(types.StationAttestation[i]?.name===expected[i].name&&types.StationAttestation[i]?.type===expected[i].type,"STATION_ATTESTATION_TYPE_MISMATCH_"+i);
  }
}

function verifyDomain(domain,strictKnownDeployment=false){
  assert(domain&&domain.name===contractDomain.name&&domain.version===contractDomain.version,"EIP712_DOMAIN_NAME_VERSION_MISMATCH");
  assert(Number.isSafeInteger(Number(domain.chainId))&&Number(domain.chainId)>0,"EIP712_DOMAIN_CHAIN_INVALID");
  assert(/^0x[0-9a-fA-F]{40}$/.test(String(domain.verifyingContract||"")),"EIP712_DOMAIN_CONTRACT_INVALID");
  if(strictKnownDeployment){assert(Number(domain.chainId)===Number(contractDomain.chainId),"EIP712_DOMAIN_CHAIN_MISMATCH");assert(eq(domain.verifyingContract,contractDomain.verifyingContract),"EIP712_DOMAIN_CONTRACT_MISMATCH");}
}

function checkInferenceReport(normalized,images,expectedThreshold){
  const r=normalized.inferenceReport;
  assert(r&&typeof r==="object","INFERENCE_REPORT_MISSING");
  const rawScore=Number(r.score_raw??r.scoreRaw);
  const scaled=Number(r.score_scaled??r.scoreScaled);
  const decision=String(r.decision||"");
  const checkpoint=String(r.model_checkpoint_sha256||r.checkpointSha256||normalized.evidence.checkpointSha256||normalized.evidence.modelCheckpointSha256||"");
  const topHash=String(r.original_image_sha256||normalized.evidence.rawTopSHA256||"");
  assert(topHash===images.TOP.sha256,"INFERENCE_TOP_IMAGE_MISMATCH");
  if(r.original_image_bytes!==undefined)assert(Number(r.original_image_bytes)===images.TOP.size,"INFERENCE_TOP_BYTES_MISMATCH");
  assert(checkpoint===CHECKPOINT_SHA256,"MODEL_CHECKPOINT_MISMATCH");
  assert(Number.isSafeInteger(scaled)&&scaled>=0,"INFERENCE_SCORE_INVALID");
  if(Number.isFinite(rawScore))assert(Math.round(rawScore*1e6)===scaled,"SCORE_ROUND_HALF_UP_MISMATCH");
  const threshold=BigInt(expectedThreshold);
  const expectedDecision=BigInt(scaled)>=threshold?"REVIEW_REQUIRED":"PASS";
  assert(decision===expectedDecision,"INFERENCE_DECISION_THRESHOLD_MISMATCH");
  return {scoreRaw:Number.isFinite(rawScore)?rawScore:null,scoreScaled:String(scaled),decision,checkpointSha256:checkpoint,topSha256:topHash};
}

function verifyStaticEvidence(body){
  assert(body&&typeof body==="object","REQUEST_OBJECT_REQUIRED");
  const normalized=normalizeBundle(body.bundle);
  const expectedRole=String(body.expectedRole||normalized.roleName||"").toLowerCase();
  assert(ROLE_NAMES.includes(expectedRole),"EXPECTED_ROLE_INVALID");
  const role=Number(normalized.message?.role);
  assert(role===0||role===1,"MESSAGE_ROLE_INVALID");
  const roleName=ROLE_NAMES[role];
  assert(expectedRole===roleName,"ROLE_MISMATCH_EXPECTED_VS_BUNDLE");
  assert(String(normalized.roleName).toLowerCase()===roleName,"ROLE_NAME_MISMATCH");

  const tradeId=String(normalized.message?.tradeId||"");
  assert(isBytes32(tradeId),"TRADE_ID_INVALID");
  if(body.expectedTradeId)assert(eq(body.expectedTradeId,tradeId),"TRADE_ID_MISMATCH_EXPECTED_VS_BUNDLE");
  const allTradeIds=[normalized.manifest.tradeId,normalized.evidence.tradeId,normalized.message.tradeId];
  assert(allTradeIds.every(v=>eq(v,tradeId)),"TRADE_ID_CROSS_SECTION_MISMATCH");

  assert(body.images&&typeof body.images==="object","THREE_ORIGINAL_IMAGES_REQUIRED");
  const keys=Object.keys(body.images).sort();
  assert(keys.length===3&&keys.join(",")==="FRONT,SIDE,TOP","EXACT_TOP_FRONT_SIDE_REQUIRED");
  const images=Object.fromEntries(["TOP","FRONT","SIDE"].map(view=>[view,decodeImage(body.images[view],view)]));
  assert(new Set(Object.values(images).map(v=>v.sha256)).size===3,"DUPLICATE_VIEW_IMAGE_BYTES");

  const captureFiles=normalized.manifest.captureFiles||normalized.manifest.views;
  assert(captureFiles&&typeof captureFiles==="object","MANIFEST_CAPTURE_FILES_MISSING");
  for(const view of ["TOP","FRONT","SIDE"]){
    assert(captureFiles[view],"MANIFEST_VIEW_MISSING_"+view);
    assert(String(captureFiles[view].sha256).toLowerCase()===images[view].sha256,"ORIGINAL_IMAGE_HASH_MISMATCH_"+view);
    if(captureFiles[view].bytes!==undefined)assert(Number(captureFiles[view].bytes)===images[view].size,"ORIGINAL_IMAGE_SIZE_MISMATCH_"+view);
  }
  if(normalized.manifest.requiredCaptureViews)assert(JSON.stringify(normalized.manifest.requiredCaptureViews)==='["TOP","FRONT","SIDE"]',"REQUIRED_VIEW_SET_INVALID");
  if(normalized.manifest.providedCaptureViews)assert(JSON.stringify(normalized.manifest.providedCaptureViews)==='["TOP","FRONT","SIDE"]',"PROVIDED_VIEW_SET_INVALID");
  if(normalized.manifest.completeThreeViewCapture!==undefined)assert(normalized.manifest.completeThreeViewCapture===true,"THREE_VIEW_COMPLETENESS_FALSE");

  const manifestHash=hashObject(normalized.manifest);
  const evidenceHash=hashObject(normalized.evidence);
  assert(eq(manifestHash,normalized.manifestHash),"SPECIMEN_MANIFEST_HASH_MISMATCH");
  assert(eq(evidenceHash,normalized.evidenceHash),"EVIDENCE_PACKAGE_HASH_MISMATCH");
  assert(eq(normalized.message.specimenManifestHash,manifestHash),"MESSAGE_MANIFEST_HASH_MISMATCH");
  assert(eq(normalized.message.evidencePackageHash,evidenceHash),"MESSAGE_EVIDENCE_HASH_MISMATCH");

  const expectedPolicy=String(normalized.message.policyHash||"");
  assert(isBytes32(expectedPolicy),"POLICY_HASH_INVALID");
  for(const value of [normalized.manifest.policyHash,normalized.evidence.policyHash,normalized.message.policyHash])assert(eq(value,expectedPolicy),"POLICY_HASH_MISMATCH");
  assert(eq(normalized.manifest.station,normalized.evidence.station)&&eq(normalized.evidence.station,normalized.message.station),"STATION_CROSS_SECTION_MISMATCH");
  assert(getAddress(normalized.message.station)===getAddress(normalized.message.station),"STATION_ADDRESS_INVALID");
  assert(Number(normalized.manifest.role)===role&&Number(normalized.evidence.role)===role,"ROLE_CROSS_SECTION_MISMATCH");
  assert(Number(normalized.manifest.attempt)===Number(normalized.message.attempt)&&Number(normalized.evidence.attempt)===Number(normalized.message.attempt),"ATTEMPT_CROSS_SECTION_MISMATCH");
  const manifestNonce=normalized.manifest.sessionNonce||normalized.manifest.nonce;
  assert(isBytes32(manifestNonce)&&!eq(manifestNonce,ZeroHash),"SESSION_NONCE_INVALID");
  assert(eq(manifestNonce,normalized.evidence.sessionNonce)&&eq(normalized.evidence.sessionNonce,normalized.message.sessionNonce),"SESSION_NONCE_CROSS_SECTION_MISMATCH");

  for(const field of ["modelBundleHash","captureProfileHash","scoreSchemaId"]){
    assert(eq(normalized.evidence[field],normalized.message[field]),field.toUpperCase()+"_CROSS_SECTION_MISMATCH");
  }
  for(const field of ["modelBundleHash","captureProfileHash","scoreSchemaId"])assert(isBytes32(normalized.message[field]),field.toUpperCase()+"_INVALID");
  if(normalized.evidence.productSpecHash)assert(isBytes32(normalized.evidence.productSpecHash),"PRODUCT_SPEC_HASH_INVALID");
  if(normalized.evidence.requiredViewSetHash)assert(isBytes32(normalized.evidence.requiredViewSetHash),"REQUIRED_VIEW_SET_HASH_INVALID");

  const threshold=String(normalized.evidence.contractThresholdScaled||normalized.evidence.thresholdScaled||"");
  assert(/^\d+$/.test(threshold)&&BigInt(threshold)>0n,"THRESHOLD_INVALID");
  const inference=checkInferenceReport(normalized,images,threshold);
  assert(BigInt(normalized.message.aggregateScoreScaled)===BigInt(inference.scoreScaled),"MESSAGE_SCORE_MISMATCH");
  const evidenceScore=normalized.evidence.scoreScaled;
  assert(BigInt(evidenceScore)===BigInt(inference.scoreScaled),"EVIDENCE_SCORE_MISMATCH");

  if(normalized.evidence.inferenceReportSha256){
    const digest=sha256(Buffer.from(JSON.stringify(normalized.inferenceReport,null,2)+"\n"));
    assert(digest===normalized.evidence.inferenceReportSha256,"INFERENCE_REPORT_HASH_MISMATCH");
  }else if(normalized.evidence.inferenceReportSHA256){
    const digest=sha256(Buffer.from(JSON.stringify(normalized.inferenceReport)));
    assert(digest===normalized.evidence.inferenceReportSHA256,"INFERENCE_REPORT_HASH_MISMATCH");
  }

  verifyDomain(normalized.domain,eq(tradeId,reference.tradeId)||eq(tradeId,"0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff"));
  verifyTypeSchema(normalized.types);
  assert(normalized.declaredTransactions===0||normalized.declaredTransactions===1,"DECLARED_TRANSACTION_COUNT_INVALID");
  return {normalized,tradeId,role,roleName,images,manifestHash,evidenceHash,expectedPolicy,inference,threshold};
}

function verifySignatureLocally(staticResult,nowUnix){
  const {normalized}=staticResult;
  if(!normalized.signature){
    return {status:"UNSIGNED",present:false,valid:false,recoveredSigner:null,digest:null,usableNow:false,reason:"STATION_SIGNATURE_NOT_INCLUDED"};
  }
  assert(/^0x[0-9a-fA-F]{130}$/.test(normalized.signature),"STATION_SIGNATURE_FORMAT_INVALID");
  const issued=Number(normalized.message.issuedAt),validUntil=Number(normalized.message.validUntil);
  assert(Number.isSafeInteger(issued)&&Number.isSafeInteger(validUntil)&&issued>0&&validUntil>=issued,"STATION_SIGNATURE_WINDOW_INVALID");
  const digest=TypedDataEncoder.hash(normalized.domain,normalized.types,normalized.message);
  let recovered;
  try{recovered=verifyTypedData(normalized.domain,normalized.types,normalized.message,normalized.signature);}catch{fail("STATION_SIGNATURE_INVALID");}
  assert(eq(recovered,normalized.message.station),"STATION_SIGNATURE_SIGNER_MISMATCH");
  const usableNow=nowUnix>=issued&&nowUnix<=validUntil;
  return {status:usableNow?"VALID_NOW":"VALID_BUT_EXPIRED",present:true,valid:true,recoveredSigner:getAddress(recovered),digest,usableNow,issuedAt:issued,validUntil};
}

async function readOnchain(ctx,staticResult){
  const {tradeId,role,evidenceHash,manifestHash,normalized}=staticResult;
  try{
    const [net,block,terms,state,deadline,inspection]=await Promise.all([
      ctx.provider.getNetwork(),ctx.provider.getBlock("latest"),ctx.contract.getTradeTerms(tradeId),
      ctx.contract.getTradeState(tradeId),ctx.contract.getActionDeadline(tradeId),ctx.contract.getInspection(tradeId,role)
    ]);
    assert(Number(net.chainId)===Number(normalized.domain.chainId),"EIP712_DOMAIN_CHAIN_MISMATCH");
    assert(eq(String(ctx.contract.target),normalized.domain.verifyingContract),"EIP712_DOMAIN_CONTRACT_MISMATCH");
    const expectedStation=role===0?terms.supplierStation:terms.buyerStation;
    assert(eq(expectedStation,normalized.message.station),"ONCHAIN_STATION_ROLE_MISMATCH");
    assert(eq(terms.policyHash,staticResult.expectedPolicy),"ONCHAIN_POLICY_HASH_MISMATCH");
    assert(eq(terms.modelBundleHash,normalized.message.modelBundleHash),"ONCHAIN_MODEL_BUNDLE_HASH_MISMATCH");
    assert(eq(terms.captureProfileHash,normalized.message.captureProfileHash),"ONCHAIN_CAPTURE_PROFILE_HASH_MISMATCH");
    assert(eq(terms.scoreSchemaId,normalized.message.scoreSchemaId),"ONCHAIN_SCORE_SCHEMA_MISMATCH");
    if(normalized.evidence.productSpecHash)assert(eq(terms.productSpecHash,normalized.evidence.productSpecHash),"ONCHAIN_PRODUCT_SPEC_HASH_MISMATCH");
    if(normalized.evidence.requiredViewSetHash)assert(eq(terms.requiredViewSetHash,normalized.evidence.requiredViewSetHash),"ONCHAIN_REQUIRED_VIEW_SET_HASH_MISMATCH");
    assert(BigInt(terms.thresholdScaled)===BigInt(staticResult.threshold),"ONCHAIN_THRESHOLD_MISMATCH");
    const submitted=Number(inspection.submittedAt)!==0;
    const evidenceMatches=submitted&&eq(inspection.evidencePackageHash,evidenceHash);
    const manifestMatches=submitted&&eq(inspection.specimenManifestHash,manifestHash);
    if(submitted)assert(evidenceMatches,"ONCHAIN_EVIDENCE_HASH_MISMATCH");
    if(submitted)assert(manifestMatches,"ONCHAIN_MANIFEST_HASH_MISMATCH");
    if(submitted)assert(Number(inspection.attempt)===Number(normalized.message.attempt),"ONCHAIN_ATTEMPT_MISMATCH");
    if(submitted)assert(eq(inspection.station,normalized.message.station),"ONCHAIN_STATION_MISMATCH");
    return {source:Number(net.chainId)===11155111?"LIVE_SEPOLIA_READ_ONLY":"LOCAL_ANVIL_READ_ONLY",exists:true,chainId:Number(net.chainId),blockNumber:block.number,blockTimestamp:Number(block.timestamp),state:Number(state),stateName:STATE_NAMES[Number(state)]||"UNKNOWN",deadline:Number(deadline),submitted,evidenceMatches,manifestMatches,outcome:Number(inspection.outcome),scoreScaled:String(inspection.aggregateScoreScaled),station:inspection.station,attempt:Number(inspection.attempt)};
  }catch(error){
    const code=String(error.shortMessage||error.message||error);
    if(/TradeNotFound|execution reverted|could not decode result data/i.test(code)){
      return {exists:false,chainId:Number(normalized.domain.chainId),state:0,stateName:"NONE",submitted:false,evidenceMatches:false,manifestMatches:false,detail:"TRADE_NOT_FOUND_ON_CONFIGURED_CHAIN"};
    }
    throw error;
  }
}

async function validateEvidencePayload(ctx,body){
  const staticResult=verifyStaticEvidence(body);
  const onchain=await readOnchain(ctx,staticResult);
  const nowUnix=onchain.blockTimestamp||Math.floor(Date.now()/1000);
  const signature=verifySignatureLocally(staticResult,nowUnix);
  if(signature.present&&signature.digest){
    const contractDigest=await ctx.contract.hashStationAttestation(staticResult.normalized.message);
    assert(eq(contractDigest,signature.digest),"CONTRACT_EIP712_DIGEST_MISMATCH");
    const consumed=await ctx.contract.consumedDigest(signature.digest);
    signature.consumedOnchain=Boolean(consumed);
    if(!signature.usableNow&&!consumed)fail("STATION_SIGNATURE_EXPIRED_AND_NOT_CONSUMED");
  }
  const replayEligible=Boolean(onchain.submitted&&onchain.evidenceMatches&&onchain.manifestMatches);
  const level=replayEligible&&signature.valid?"FULL_VERIFICATION":replayEligible||signature.valid?"PARTIAL_VERIFICATION":"PARTIAL_VERIFICATION";
  const limitations=[];
  if(!signature.present)limitations.push("Station signature bytes are not included in this bundle; on-chain acceptance is checked separately.");
  if(!onchain.exists)limitations.push("Trade does not currently exist on the configured chain.");
  else if(!onchain.submitted)limitations.push("Evidence hash has not been submitted for this role on the configured chain.");
  limitations.push("Image hashes do not prove physical specimen identity or custody.");
  return {
    ok:true,verificationLevel:level,replayInputStatus:replayEligible?"REPLAY_INPUT_ELIGIBLE":"REPLAY_INPUT_BLOCKED",
    verifiedAt:new Date().toISOString(),format:staticResult.normalized.format,
    tradeId:staticResult.tradeId,role:staticResult.role,roleName:staticResult.roleName,
    station:getAddress(staticResult.normalized.message.station),operatorSpecimenLabel:staticResult.normalized.manifest.operatorSpecimenLabel||staticResult.normalized.manifest.operatorLabel||"UNSPECIFIED",
    capturedAtUtc:staticResult.normalized.manifest.capturedAtUtc||null,
    hashes:{policyHash:staticResult.expectedPolicy,modelBundleHash:staticResult.normalized.message.modelBundleHash,captureProfileHash:staticResult.normalized.message.captureProfileHash,scoreSchemaId:staticResult.normalized.message.scoreSchemaId,specimenManifestHash:staticResult.manifestHash,evidencePackageHash:staticResult.evidenceHash,checkpointSha256:staticResult.inference.checkpointSha256},
    images:Object.fromEntries(Object.entries(staticResult.images).map(([view,v])=>[view,{fileName:v.name,sha256:v.sha256,bytes:v.size,mime:v.mime}])),
    inference:{...staticResult.inference,thresholdScaled:staticResult.threshold},signature,onchain,
    integrityChecks:{schema:true,threeDistinctOriginals:true,originalSha256:true,manifestHash:true,evidencePackageHash:true,policyHash:true,modelBundleHash:true,captureProfileHash:true,checkpointSha256:true,scoreAndThreshold:true,eip712Schema:true,eip712Domain:true,roleBinding:true,tradeBinding:true},
    limitations,serverStoredOriginals:false,serverStoredBundle:false,transactionsSent:0
  };
}

async function contractStatus(ctx,tradeId,roleName,evidencePackageHash){
  assert(isBytes32(tradeId),"TRADE_ID_INVALID");
  assert(ROLE_NAMES.includes(roleName),"ROLE_INVALID");
  const role=ROLE_NAMES.indexOf(roleName);
  const [net,block,state,inspection]=await Promise.all([ctx.provider.getNetwork(),ctx.provider.getBlock("latest"),ctx.contract.getTradeState(tradeId),ctx.contract.getInspection(tradeId,role)]);
  assert(Number(net.chainId)>0,"CHAIN_ID_INVALID");
  const submitted=Number(inspection.submittedAt)!==0;
  const evidenceMatches=submitted&&isBytes32(evidencePackageHash)&&eq(inspection.evidencePackageHash,evidencePackageHash);
  return {source:Number(net.chainId)===11155111?"LIVE_SEPOLIA_READ_ONLY":"LOCAL_ANVIL_READ_ONLY",tradeId,roleName,blockNumber:block.number,blockTimestamp:Number(block.timestamp),state:Number(state),stateName:STATE_NAMES[Number(state)]||"UNKNOWN",submitted,evidencePackageHash:inspection.evidencePackageHash,evidenceMatches,attempt:Number(inspection.attempt),outcome:Number(inspection.outcome),scoreScaled:String(inspection.aggregateScoreScaled),transactionsSent:0};
}

const send=(res,code,value)=>{res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));};
async function handle(req,res,ctx,url){
  if(url.pathname==="/api/evidence/verify"&&req.method==="POST"){
  if(req.headers.origin&&req.headers.origin!=="http://"+req.headers.host)return send(res,403,{ok:false,error:"ORIGIN_REJECTED"});
    if(req.headers["x-inspectescrow-local"]!=="1"||!String(req.headers["content-type"]||"").startsWith("application/json"))return send(res,403,{ok:false,error:"LOCAL_JSON_HEADER_REQUIRED"});
    try{return send(res,200,await validateEvidencePayload(ctx,await readBody(req)));}
    catch(error){return send(res,422,{ok:false,verificationLevel:"INVALID",replayInputStatus:"REPLAY_INPUT_BLOCKED",error:String(error.shortMessage||error.message||error).slice(0,260),transactionsSent:0});}
  }
  if(url.pathname==="/api/evidence/status"&&req.method==="GET"){
    try{return send(res,200,await contractStatus(ctx,String(url.searchParams.get("tradeId")||""),String(url.searchParams.get("role")||"").toLowerCase(),String(url.searchParams.get("evidencePackageHash")||"")));}
    catch(error){return send(res,422,{ok:false,error:String(error.shortMessage||error.message||error).slice(0,220),transactionsSent:0});}
  }
  return send(res,405,{error:"METHOD_OR_ROUTE_NOT_ALLOWED"});
}

module.exports={handle,validateEvidencePayload,verifyStaticEvidence,verifySignatureLocally,contractStatus,normalizeBundle,decodeImage,readOnchain,MAX_JSON_BYTES,MAX_IMAGE_BYTES};
