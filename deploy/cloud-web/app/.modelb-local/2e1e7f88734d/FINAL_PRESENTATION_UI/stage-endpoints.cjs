"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {keccak256,toUtf8Bytes,formatEther}=require("ethers");
const {candidateTerms,staticCandidateChecks}=require("./new-trade-endpoints.cjs");
const root=path.resolve(__dirname,"..","..","..");
const refBase=path.resolve(__dirname,"..");
const sampleRoot=path.join(__dirname,"STAGE_ASSETS");
const smokeNormal=JSON.parse(fs.readFileSync(path.join(__dirname,"SMOKE_TEST_MODEL_B.json"),"utf8"));
const smokeScratch=JSON.parse(fs.readFileSync(path.join(__dirname,"SMOKE_TEST_REVIEW_MODEL_B.json"),"utf8"));
const redTeamPath=path.join(sampleRoot,"PATCH3_RED_TEAM_RESULTS.json");
const testSourcePath=path.join(sampleRoot,"red-team-smoke.mjs");
const sourcePath=path.join(sampleRoot,"InspectEscrowPatch3.sol");
const reference=JSON.parse(fs.readFileSync(path.join(refBase,"MODEL_B_PATCH3_TRADE_TERMS.json"),"utf8"));
const pinnedCheckpoint="8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854";
const normalPhoto=path.join(sampleRoot,"S05_SUPPLIER_TOP_20261029_01.jpg.jpg");
const scratchPhoto=path.join(sampleRoot,"S03_deep_scratch1.jpg.jpg");
const formatHash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const eql=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const failureCases=[
 {id:"replay",needle:"Replay mismatch enters EXECUTION_HOLD with finite mutual-resolution deadline",
  sourceNeedle:"replayMessage(t,false,'HOLD')",state:"EXECUTION_HOLD",stateNumber:14},
 {id:"policy",needle:"funded trade rejects policyHash tampering",
  sourceNeedle:"policyHash:h('OTHER_POLICY')",error:"PolicyHashMismatch"}
];
function verifiedRedTeam(){
 const bytes=fs.readFileSync(redTeamPath),report=JSON.parse(bytes.toString("utf8"));
 const source=fs.readFileSync(testSourcePath,"utf8"),solidity=fs.readFileSync(sourcePath,"utf8");
 if(report.scope!=="PATCH3_LOCAL_SYNTHETIC_RED_TEAM"||report.chainId!==31338||report.checks!==36||report.results.length!==36)throw Error("RED_TEAM_REPORT_NOT_VERIFIED");
 for(const c of failureCases)if(!report.results.includes(c.needle)||!source.includes(c.sourceNeedle))throw Error("TEST_PROVENANCE_MISSING_"+c.id);
 if(!solidity.includes("TradeState.EXECUTION_HOLD")||!solidity.includes("PolicyHashMismatch()"))throw Error("SOLIDITY_BRANCH_NOT_FOUND");
 return{scope:report.scope,chainId:report.chainId,checks:report.checks,failures:0,recordSha256:formatHash(bytes),
  testSourceSha256:formatHash(Buffer.from(source)),soliditySha256:formatHash(Buffer.from(solidity)),
  examples:failureCases.map(c=>({id:c.id,assertion:c.needle,passed:true,kind:"LOCAL_ANVIL_TEST_NOT_LIVE_SEPOLIA"})),
  trustNote:"These are locally executed synthetic Anvil tests and are not a record of the new Model B dispute completing on Sepolia."};
}
const send=(res,status,value)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));};
async function getChainSnapshot(ctx){
 staticCandidateChecks();
 const [net,block,newState,refState,originalTerms,conserved,coverage]=await Promise.all([
 ctx.provider.getNetwork(),ctx.provider.getBlock("latest"),ctx.contract.getTradeState(candidateTerms.tradeId),
 ctx.contract.getTradeState(reference.tradeId),ctx.contract.getTradeTerms(candidateTerms.tradeId),
 ctx.contract.accountingConserved(),ctx.contract.balanceCoversLiabilities()
 ]);
 if(Number(net.chainId)!==11155111||!eql(originalTerms.policyHash,candidateTerms.policyHash)||!eql(originalTerms.tradeId,candidateTerms.tradeId))throw Error("SEPOLIA_BINDING_FAILED");
 return{chainId:11155111,blockNumber:block.number,blockUnix:block.timestamp,
 contract:String(ctx.contract.target),candidate:{tradeId:candidateTerms.tradeId,state:Number(newState),policyHash:originalTerms.policyHash},
 reference:{tradeId:reference.tradeId,state:Number(refState)},accountingConserved:conserved,balanceCoversLiabilities:coverage};
}
async function status(ctx){
 const [chainRes,modelRes]=await Promise.allSettled([
 getChainSnapshot(ctx),fetch("http://127.0.0.1:8766/api/status",{signal:AbortSignal.timeout(8000)}).then(r=>{if(!r.ok)throw Error("MODEL_HTTP_"+r.status);return r.json();})
 ]);
 const chain=chainRes.status==="fulfilled"?chainRes.value:null;
 const model=modelRes.status==="fulfilled"?modelRes.value:null;
 return{
  checkedAtUtc:new Date().toISOString(),readOnly:true,
  chain,chainError:chainRes.status==="rejected"?String(chainRes.reason.message||chainRes.reason).slice(0,150):null,
  model:{available:!!model?.model_loaded,commitmentVerified:model?.artifact_commitment?.verified===true,
   checkpointSha256:model?.checkpoint_sha256??null,
   thresholdRaw:model?.threshold_raw??null},
  normalArchived:{result:smokeNormal.result.decision,score:smokeNormal.result.score_raw,sha256:smokeNormal.result.original_image_sha256},
  scratchArchived:{result:smokeScratch.result.decision,score:smokeScratch.result.score_raw,sha256:smokeScratch.result.original_image_sha256},
  redTeam:verifiedRedTeam(),
  warning:"New REVIEW onchain submission and real independent Replay INCONSISTENT -> EXECUTION_HOLD for Model B on Sepolia are not verified by this dashboard. No transactions are triggered here."
 };
}
async function replayProof(ctx){
 const chain=await getChainSnapshot(ctx);
 const local=verifiedRedTeam();
 const [replayStatus,replayHash]=await ctx.contract.getReplay(candidateTerms.tradeId);
 const status=Number(replayStatus);
 const evidence={
  scope:"LOCAL_ANVIL_PROOF_WITH_LIVE_SEPOLIA_STATUS",
  tradeId:candidateTerms.tradeId,chainId:11155111,blockNumber:chain.blockNumber,
  currentTradeState:chain.candidate.state,recordedReplayStatus:status,recordedReplayHash:replayHash,
  liveSepoliaExecutionHoldProven:false,liveReplayTx:null,
  localRedTeam:local.examples.find(x=>x.id==="replay"),
  recordSha256:local.recordSha256,checks:local.checks,failures:local.failures
 };
 if(status===2){
  const ev=ctx.contract.interface.getEvent("ReplayResultRecorded");
  try{
   const logs=await ctx.provider.getLogs({address:String(ctx.contract.target),
    topics:[ev.topicHash,candidateTerms.tradeId],fromBlock:12020557,toBlock:chain.blockNumber});
   for(const log of logs){
    const parsed=ctx.contract.interface.parseLog(log);
    if(parsed?.name==="ReplayResultRecorded"&&parsed.args.consistent===false&&eql(parsed.args.replayReportHash,replayHash)){
     evidence.liveReplayTx=log.transactionHash;
     evidence.liveSepoliaExecutionHoldProven=chain.candidate.state===14;
     evidence.scope=evidence.liveSepoliaExecutionHoldProven?"LIVE_SEPOLIA_EXECUTION_HOLD_CONFIRMED":"SEPOLIA_REPLAY_INCONSISTENT_RECORDED_STATE_ADVANCED";
     break;
    }
   }
  }catch(e){evidence.eventLookupWarning=String(e.shortMessage||e.message).slice(0,150);}
 }
 return evidence;
}
async function policyProof(ctx){
 const chain=await getChainSnapshot(ctx),proof=verifiedRedTeam();
 const fromChain=chain.candidate.policyHash;
 const proposed=keccak256(toUtf8Bytes("INSPECTESCROW_STAGE_ATTACK_DIFFERENT_POLICY_V1"));
 if(eql(fromChain,proposed))throw Error("MUTATED_POLICY_COLLISION");
 const state=chain.candidate.state;
 const output={
  checkedAtUtc:new Date().toISOString(),scope:"LIVE_SEPOLIA_POLICY_READ_PLUS_LOCAL_ANVIL_REVERT_PROOF",
  tradeId:chain.candidate.tradeId,chainId:chain.chainId,blockNumber:chain.blockNumber,
  onchainFixedHash:fromChain,attackerProposedHash:proposed,hashesDiffer:!eql(fromChain,proposed),
  onchainPolicyChanged:null,policyUnchangedVerified:false,actualSepoliaRevertExecuted:false,
  localAnvilRevertVerified:proof.examples.find(x=>x.id==="policy")?.passed===true,
  localAnvilTestSourceSha256:proof.testSourceSha256,
  candidacyState:state,
  context:"To specifically demonstrate PolicyHashMismatch on Sepolia, the chosen trade must be AWAIT_SUPPLIER(5). The currently PROPOSED/FUNDED trade may not accept a Supplier inspection and would return an unrelated InvalidState."
 };
 if(state===5){
  const block=await ctx.provider.getBlock("latest");
  const att={
   tradeId:candidateTerms.tradeId,role:0,station:candidateTerms.supplierStation,attempt:1,
   sessionNonce:keccak256(toUtf8Bytes("DEMO_READ_ONLY_POLICY_ATTEMPT_"+String(block.number))),
   policyHash:proposed,modelBundleHash:candidateTerms.modelBundleHash,
   captureProfileHash:candidateTerms.captureProfileHash,
   specimenManifestHash:keccak256(toUtf8Bytes("DEMO_SPECIMEN")),
   evidencePackageHash:keccak256(toUtf8Bytes("DEMO_EVIDENCE")),
   aggregateScoreScaled:BigInt(candidateTerms.scoreMinScaled),
   scoreSchemaId:candidateTerms.scoreSchemaId,inspectionValidity:0,invalidReason:0,
   issuedAt:block.timestamp,validUntil:block.timestamp+300
  };
  try{
   await ctx.contract.submitInspection.staticCall(att,"0x",{from:candidateTerms.supplier});
   output.staticCallStatus="UNEXPECTEDLY_ALLOWED";output.context="Safety gate: unexpected result. This read-only call did not submit anything.";
  }catch(e){
   const data=e.data||e.info?.error?.data||e.error?.data;
   let parsed=null;try{if(typeof data==="string")parsed=ctx.contract.interface.parseError(data)?.name||null;}catch{}
   output.staticCallStatus=parsed==="PolicyHashMismatch"?"LIVE_SEPOLIA_POLICY_HASH_REJECTION":"REVERT_OTHER_REASON";
   output.decodedRevert=parsed;
   output.actualSepoliaRevertExecuted=parsed==="PolicyHashMismatch";
   output.rpcError=String(e.shortMessage||e.message).slice(0,150);
  }
 }else output.staticCallStatus="NOT_RUN_WRONG_STATE";
 const [confirmedTerms,confirmedState]=await Promise.all([
   ctx.contract.getTradeTerms(candidateTerms.tradeId),ctx.contract.getTradeState(candidateTerms.tradeId)
 ]);
 output.onchainPolicyChanged=!eql(confirmedTerms.policyHash,fromChain);
 output.policyUnchangedVerified=!output.onchainPolicyChanged;
 output.stateUnchangedVerified=Number(confirmedState)===state;
 if(!output.policyUnchangedVerified||!output.stateUnchangedVerified)throw Error("ONCHAIN_STATE_CHANGED_DURING_PROOF");
 return output;
}
function serveSample(req,res,url){
 const sample=url.searchParams.get("kind");
 const filename=sample==="normal"?normalPhoto:sample==="scratch"?scratchPhoto:null;
 const expected=sample==="normal"?smokeNormal.result.original_image_sha256:sample==="scratch"?smokeScratch.result.original_image_sha256:null;
 if(!filename||!expected)return send(res,400,{error:"INVALID_SAMPLE"});
 const bytes=fs.readFileSync(filename);
 if(formatHash(bytes)!==expected)throw Error("ARCHIVED_SAMPLE_SHA_MISMATCH");
 res.writeHead(200,{"Content-Type":"image/jpeg","Content-Length":bytes.length,"Cache-Control":"no-store",
  "X-InspectEscrow-Sample-Provenance":"ARCHIVED_SOURCE_PHOTO_NOT_LIVE_CAPTURE","X-Content-Type-Options":"nosniff"});
 if(req.method==="HEAD")return res.end();res.end(bytes);
}
async function handle(req,res,ctx,url){
 if(req.method!=="GET"&&req.method!=="HEAD")return send(res,405,{error:"STAGE_API_READ_ONLY"});
 try{
  if(url.pathname==="/api/stage/status")return send(res,200,await status(ctx));
  if(url.pathname==="/api/stage/redteam")return send(res,200,verifiedRedTeam());
  if(url.pathname==="/api/stage/replay")return send(res,200,await replayProof(ctx));
  if(url.pathname==="/api/stage/policy")return send(res,200,await policyProof(ctx));
  if(url.pathname==="/api/stage/sample")return serveSample(req,res,url);
  return send(res,404,{error:"UNKNOWN_STAGE_ROUTE"});
 }catch(e){return send(res,503,{error:"STAGE_VALIDATION_UNAVAILABLE",detail:String(e.shortMessage||e.message).slice(0,260)});}
}
module.exports={handle,status,policyProof,replayProof,verifiedRedTeam};
