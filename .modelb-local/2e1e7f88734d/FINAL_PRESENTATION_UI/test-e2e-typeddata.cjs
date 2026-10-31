"use strict";
const fs=require("node:fs"),path=require("node:path");
const {JsonRpcProvider,Contract,TypedDataEncoder,ZeroHash}=require("ethers");
const {prepareInspection,prepareReplay}=require("./e2e-endpoints.cjs");
const ROOT=path.resolve(__dirname,"..","..","..");
const t=JSON.parse(fs.readFileSync(path.join(ROOT,".modelb-local","REVIEW_TRADE_CANDIDATE_49bf5596","REVIEW_TRADE_TERMS.json"),"utf8"));
const abi=JSON.parse(fs.readFileSync(path.join(ROOT,".patch3-build","InspectEscrowPatch3.sol_InspectEscrowPatch3.abi"),"utf8"));
const provider=new JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com",11155111);
const contract=new Contract("0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905",abi,provider);
const sampleRoot=path.join(__dirname,"STAGE_ASSETS");
const s05=path.join(__dirname,"..","NEW_S05_PREP_HANDOFF_NO_TX");
const projectDir=path.resolve(ROOT,"..");
const paths={
 supplier:{TOP:path.join(s05,"S05_SUPPLIER_TOP_20261029_01.jpg.jpg"),FRONT:path.join(s05,"S05_SUPPLIER_FRONT_20261029_01.jpg.jpg"),SIDE:path.join(s05,"S05_SUPPLIER_SIDE_20261029_01.jpg.jpg")},
 buyer:{TOP:path.join(projectDir,"S03_deep_scratch1.jpg.jpg"),FRONT:path.join(projectDir,"S03_deep_scratch2.jpg.jpg"),SIDE:path.join(projectDir,"S03_deep_scratch3.jpg.jpg")}
};
(async()=>{
const block=await provider.getBlock("latest");
const tuple=await contract.getTradeTerms(t.tradeId);
const fake=(stage)=>{
 const s1={outcome:2,aggregateScoreScaled:36302902n,evidencePackageHash:"0x"+"1".repeat(64),attempt:1};
 const s2={outcome:3,aggregateScoreScaled:52572132n,evidencePackageHash:"0x"+"2".repeat(64),attempt:1};
 return {provider:{getNetwork:async()=>({chainId:11155111}),getBlock:async()=>({number:block.number,timestamp:block.timestamp}),getCode:async()=>"0x01"},
  contract:{
   target:"0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905",
   getTradeTerms:async()=>tuple,getTradeState:async()=>BigInt(stage),
   getActionDeadline:async()=>BigInt(block.timestamp+3400),
   getInspection:async(id,role)=>role===0?(stage>=8?s1:{outcome:0,aggregateScoreScaled:0n,evidencePackageHash:ZeroHash,attempt:0}):stage>=12?s2:{outcome:0,aggregateScoreScaled:0n,evidencePackageHash:ZeroHash,attempt:0},
   getReplay:async()=>[0,ZeroHash],isSettled:async()=>false,accountingConserved:async()=>true,balanceCoversLiabilities:async()=>true
  }};
};
const encode=images=>Object.fromEntries(Object.entries(images).map(([view,p])=>[view,{name:path.basename(p),data:fs.readFileSync(p).toString("base64")}]));
const results=[];
for(const role of ["supplier","buyer"]){
 const d=await prepareInspection(fake(role==="supplier"?5:8),{
  tradeId:t.tradeId,role,confirmedDistinctViews:true,operatorLabel:role==="supplier"?"S05 TEST (three view mapped)":"S03 TEST VIEW MAPPING NOT INDEPENDENTLY VERIFIED",
  images:encode(paths[role]),sourceDescription:"CONTROLLED_DRY_RUN_TEST"});
 const digest=TypedDataEncoder.hash(d.domain,d.types,d.message);
 const onchainDigest=await contract.hashStationAttestation(d.message);
 const equal=digest.toLowerCase()===onchainDigest.toLowerCase();
 const good=(role==="supplier"?d.liveModelResult.decision==="PASS":d.liveModelResult.decision==="REVIEW_REQUIRED");
 results.push({role,kind:d.stage,decision:d.liveModelResult.decision,score:d.liveModelResult.scoreRaw,hashMatchesContract:equal,digest,validitySeconds:d.message.validUntil-d.message.issuedAt,source:"MOCKED_STATE_REAL_MODEL_AND_REAL_SEPOLIA_HASH_VIEW"});
 if(!equal||!good)throw Error("E2E_"+role+"_EIP712_DR YRUN_FAILED");
}
const r=await prepareReplay(fake(12),{tradeId:t.tradeId,controlledNegativeTest:true,reason:"CONTROLLED_TEST_ONLY: intentionally inject an inconsistent replay assertion to verify that the state transition sends the test escrow into EXECUTION_HOLD. This is not proof of actual independent AI replay variance."});
const replayDigest=TypedDataEncoder.hash(r.domain,r.types,r.message),chainReplayDigest=await contract.hashReplayAttestation(r.message);
results.push({role:"replay",stage:r.stage,synthetic:true,hashMatchesContract:replayDigest.toLowerCase()===chainReplayDigest.toLowerCase(),digest:replayDigest});
if(replayDigest.toLowerCase()!==chainReplayDigest.toLowerCase())throw Error("REPLAY_DIGEST_MISMATCH");
console.log(JSON.stringify({allPass:true,readOnly:true,actorTransactionCount:0,modelReruns:2,cryptographicContractHashesChecked:3,results},null,2));provider.destroy();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;provider.destroy();});
