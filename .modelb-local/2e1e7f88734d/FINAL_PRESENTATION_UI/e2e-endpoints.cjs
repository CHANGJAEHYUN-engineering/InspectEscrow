"use strict";
const crypto=require("node:crypto");
const {randomBytes,hexlify,keccak256,toUtf8Bytes,Contract,formatEther}=require("ethers");
const {hashObject,sha256}=require("./evidence-bridge.cjs");
const {readTrade,requireTradeId}=require("./dynamic-trade-context.cjs");
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const srcHash="8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854";
const domain={name:"InspectEscrow",version:"1",chainId:11155111,verifyingContract:"0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905"};
const stationTypes={StationAttestation:[
 ["tradeId","bytes32"],["role","uint8"],["station","address"],["attempt","uint32"],["sessionNonce","bytes32"],
 ["policyHash","bytes32"],["modelBundleHash","bytes32"],["captureProfileHash","bytes32"],
 ["specimenManifestHash","bytes32"],["evidencePackageHash","bytes32"],["aggregateScoreScaled","uint128"],
 ["scoreSchemaId","bytes32"],["inspectionValidity","uint8"],["invalidReason","uint8"],
 ["issuedAt","uint64"],["validUntil","uint64"]
].map(([name,type])=>({name,type}))};
const replayTypes={ReplayAttestation:[
 ["tradeId","bytes32"],["stage","uint8"],["inspectorActor","address"],["policyHash","bytes32"],
 ["supplierEvidenceHash","bytes32"],["buyerEvidenceHash","bytes32"],["replayReportHash","bytes32"],
 ["consistent","bool"],["nonce","bytes32"],["issuedAt","uint64"],["validUntil","uint64"]
].map(([name,type])=>({name,type}))};
const send=(res,code,v)=>{res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(v));};
function readBody(req,max=76*1024*1024){return new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on("data",b=>{size+=b.length;if(size>max){reject(Error("UPLOAD_TOO_LARGE"));req.destroy();return;}chunks.push(b);});req.on("error",reject);req.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch(e){reject(Error("INVALID_JSON"));}});});}
async function context(ctx,tradeId){
 const trade=await readTrade(ctx,requireTradeId(tradeId));
 const remaining=trade.remainingSeconds,stateNum=trade.state;
 return{...trade,policyHash:trade.terms.policyHash,thresholdScaled:trade.terms.thresholdScaled,modelBundleHash:trade.terms.modelBundleHash,captureProfileHash:trade.terms.captureProfileHash,scoreSchemaId:trade.terms.scoreSchemaId,
  supplier:{outcome:trade.inspections.supplier.outcome,scoreScaled:trade.inspections.supplier.scoreScaled,evidencePackageHash:trade.inspections.supplier.evidencePackageHash,attempt:trade.inspections.supplier.attempt},
  buyer:{outcome:trade.inspections.buyer.outcome,scoreScaled:trade.inspections.buyer.scoreScaled,evidencePackageHash:trade.inspections.buyer.evidencePackageHash,attempt:trade.inspections.buyer.attempt},
  replay:{status:trade.replay.status,hash:trade.replay.reportHash},
  safeToPrepareSupplier:stateNum===5&&remaining>240,
  safeToPrepareBuyer:stateNum===8&&remaining>240&&trade.inspections.supplier.outcome===2,
  safeToPrepareReplay:stateNum===12&&remaining>240&&trade.inspections.supplier.outcome===2&&trade.inspections.buyer.outcome===3,
  readOnly:true};
}
function decodeImage(obj,label){
 if(!obj||typeof obj.name!=="string"||typeof obj.data!=="string"||obj.name.length>120||obj.name.length<5||/[\\/\x00-\x1f]/.test(obj.name)||!/\.(?:jpg|jpeg|png)$/i.test(obj.name))throw Error("INVALID_IMAGE_FILENAME_"+label);
 if(obj.data.length>28*1024*1024||obj.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(obj.data))throw Error("INVALID_BASE64_"+label);
 const data=Buffer.from(obj.data,"base64");
 if(data.length<500||data.length>20*1024*1024)throw Error("IMAGE_BYTES_INVALID_"+label);
 const jpeg=data[0]===0xff&&data[1]===0xd8&&data[2]===0xff;
 const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(!jpeg&&!png)throw Error("FILE_CONTENT_NOT_IMAGE_"+label);
 return{name:obj.name,bytes:data,mime:png?"image/png":"image/jpeg",sha256:sha256(data)};
}
async function inferTop(img){
 const form=new FormData();
 form.append("image",new Blob([img.bytes],{type:img.mime}),img.name);
 form.append("expected_sha256",img.sha256);form.append("specimen_id","IE-DEMO-001");
 const resp=await fetch("http://127.0.0.1:8766/api/infer",{method:"POST",body:form,signal:AbortSignal.timeout(180000)});
 const data=await resp.json();
 if(!resp.ok||data.original_image_sha256!==img.sha256||data.model_checkpoint_sha256!==srcHash)throw Error("ACTUAL_MODEL_INFERENCE_OR_SHA_FAILED");
 if(!Number.isSafeInteger(data.score_scaled)||data.score_scaled<0||data.score_scaled!==Math.round(data.score_raw*1e6))throw Error("SCORE_SCALING_INVALID");
 return data;
}
async function prepareInspection(ctx,body){
 const role=body.role;
 if(role!=="supplier"&&role!=="buyer")throw Error("INVALID_ROLE");
 if(body.confirmedDistinctViews!==true)throw Error("OPERATOR_MUST_CONFIRM_THREE_VIEWS");
 const current=await context(ctx,body.tradeId);
 if(!current.accountingConserved||!current.balanceCoversLiabilities)throw Error("ACCOUNTING_FAILED");
 const allowed=role==="supplier"?current.safeToPrepareSupplier:current.safeToPrepareBuyer;
 if(!allowed)throw Error("WRONG_TRADE_STATE_OR_DEADLINE_FOR_"+role+"_"+current.state);
 const raw=Object.fromEntries(["TOP","FRONT","SIDE"].map(view=>[view,decodeImage(body.images?.[view],view)]));
 const hashes=Object.values(raw).map(x=>x.sha256);
 if(new Set(hashes).size!==3)throw Error("DUPLICATED_VIEW_IMAGES");
 const data=await inferTop(raw.TOP);
 const onchainReview=BigInt(data.score_scaled)>=BigInt(current.thresholdScaled);
 if((data.decision==="REVIEW_REQUIRED")!==onchainReview)throw Error("MODEL_THRESHOLD_AND_CONTRACT_THRESHOLD_DISAGREE");
 const latest=await context(ctx,body.tradeId);
 if(latest.state!==current.state||latest.remainingSeconds<120)throw Error("STATE_CHANGED_OR_INSUFFICIENT_DEADLINE");
 const viewSummary=Object.fromEntries(["TOP","FRONT","SIDE"].map(view=>[view,{fileName:raw[view].name,sha256:raw[view].sha256,bytes:raw[view].bytes.length}]));
 const nonce=hexlify(randomBytes(32));
 const label=String(body.operatorLabel||"UNVERIFIED_SPECIMEN").slice(0,100);
 const station=role==="supplier"?current.roles.supplierStation:current.roles.buyerStation;
 const manifest={schema:"InspectEscrow.Stage.ModelB.ThreeView/1",tradeId:current.tradeId,
  policyHash:current.policyHash,role:role==="supplier"?0:1,station,attempt:1,
  nonce,operatorLabel:label,sourceDescription:String(body.sourceDescription||"OPERATOR_PROVIDED").slice(0,120),
  views:viewSummary,viewMappingConfirmedByOperator:true,actualAIInput:"TOP",
  checkpointSha256:srcHash,modelDecision:data.decision,modelScoreScaled:String(data.score_scaled),
  physicalSpecimenIdentityCryptographicallyVerified:false};
 const manifestHash=hashObject(manifest);
 const evidence={
  schema:"InspectEscrow.Stage.ModelB.Evidence/1",tradeId:current.tradeId,policyHash:current.policyHash,
  manifestHash,role:manifest.role,station,sessionNonce:nonce,modelBundleHash:current.modelBundleHash,
  captureProfileHash:current.captureProfileHash,scoreSchemaId:current.scoreSchemaId,
  rawTopSHA256:raw.TOP.sha256,checkpointSha256:srcHash,scoreScaled:String(data.score_scaled),
  thresholdScaled:current.thresholdScaled,decision:data.decision,
  inferenceReportSHA256:sha256(Buffer.from(JSON.stringify(data))),
  captureIsOperatorReported:true,independentPhysicalCustodyVerified:false};
 const message={
  tradeId:current.tradeId,role:manifest.role,station,attempt:1,sessionNonce:nonce,policyHash:current.policyHash,
  modelBundleHash:current.modelBundleHash,captureProfileHash:current.captureProfileHash,
  specimenManifestHash:manifestHash,evidencePackageHash:hashObject(evidence),aggregateScoreScaled:String(data.score_scaled),
  scoreSchemaId:current.scoreSchemaId,inspectionValidity:0,invalidReason:0,
  issuedAt:latest.blockTimestamp,validUntil:latest.blockTimestamp+600
 };
 return{stage:"UNSIGNED_EIP712_PACKAGE_NOT_ONCHAIN",role,actor:role==="supplier"?current.roles.supplier:current.roles.buyer,
  station,tradeId:current.tradeId,domain:current.domain,types:stationTypes,message,manifest,evidence,
  inferenceReport:data,
  liveModelResult:{decision:data.decision,scoreScaled:String(data.score_scaled),scoreRaw:data.score_raw,checkpointSha256:srcHash},
  issuedAtUtc:new Date(latest.blockTimestamp*1000).toISOString(),
  warning:"Station signing and Actor transaction NOT performed. Images stored only in this browser upload; this server returns hashes and does not keep the image bytes."};
}
async function prepareReplay(ctx,body){
 if(body.controlledNegativeTest!==true)throw Error("NEGATIVE_TEST_NOT_CONSENTED");
 const current=await context(ctx,body.tradeId);
 if(!current.safeToPrepareReplay)throw Error("REQUIRES_DISPUTED_PRIMARY_WITH_VALID_DEADLINE");
 if(!current.accountingConserved||!current.balanceCoversLiabilities)throw Error("ACCOUNTING_FAILED");
 // Explicitly a synthetic, controlled inconsistent assertion. NOT an independent rerun of the AI.
 const reason=String(body.reason||"").trim();
 if(reason.length<25||reason.length>1500)throw Error("DESCRIBE_CONTROLLED_MISMATCH_EVIDENCE");
 const timestamp=current.blockTimestamp;
 const report={schema:"InspectEscrow.Stage.ReplayNegativeTest/1",
  mode:"CONTROLLED_SYNTHETIC_INCONSISTENT_INSPECTOR_ATTESTATION",
  independentAIReplayActuallyExecutedByThisEndpoint:false,
  tradeId:current.tradeId,policyHash:current.policyHash,
  supplierEvidenceHash:current.supplier.evidencePackageHash,
  buyerEvidenceHash:current.buyer.evidencePackageHash,
  operatorWrittenReason:reason,consistent:false,verifiedFromSepoliaBlock:current.blockNumber,
  generatedAtUnix:timestamp};
 const attestation={
  tradeId:current.tradeId,stage:0,inspectorActor:current.roles.primaryInspector,policyHash:current.policyHash,
  supplierEvidenceHash:current.supplier.evidencePackageHash,buyerEvidenceHash:current.buyer.evidencePackageHash,
  replayReportHash:hashObject(report),consistent:false,nonce:hexlify(randomBytes(32)),
  issuedAt:timestamp,validUntil:timestamp+600
 };
 return{stage:"CONTROLLED_NEGATIVE_TEST_UNSIGNED_NOT_ONCHAIN",domain:current.domain,types:replayTypes,
  station:current.roles.primaryInspectorStation,actor:current.roles.primaryInspector,
  function:"recordReplayResult",message:attestation,report,
  warning:"Test only: consistent=false is an operator-authored synthetic negative case; it does not prove a genuine independent PatchCore mismatch. A station signature plus actor transaction is required."};
}
async function handle(req,res,ctx,url){
 if(url.pathname==="/api/e2e/preflight"&&req.method==="GET"){
  try{return send(res,200,await context(ctx,url.searchParams.get("tradeId")));}catch(e){return send(res,422,{error:"PREFLIGHT_FAILED",detail:String(e.shortMessage||e.message).slice(0,220)});}
 }
 if(["/api/e2e/prepare-inspection","/api/e2e/prepare-replay"].includes(url.pathname)&&req.method==="POST"){
  if(req.headers.origin&&req.headers.origin!=="http://"+req.headers.host)return send(res,403,{error:"ORIGIN_REJECTED"});
  if(req.headers["x-inspectescrow-local"]!=="1"||!String(req.headers["content-type"]).startsWith("application/json"))return send(res,403,{error:"REQUIRED_LOCAL_HEADER_MISSING"});
  try{const body=await readBody(req);
   const result=url.pathname.includes("inspection")?await prepareInspection(ctx,body):await prepareReplay(ctx,body);
   return send(res,200,result);
  }catch(e){return send(res,422,{error:"VALIDATION_FAILED",detail:String(e.shortMessage||e.message).slice(0,260)});}
 }
 return send(res,405,{error:"METHOD_OR_ROUTE_NOT_ALLOWED"});
}
module.exports={context,prepareInspection,prepareReplay,handle,domain,stationTypes,replayTypes};
