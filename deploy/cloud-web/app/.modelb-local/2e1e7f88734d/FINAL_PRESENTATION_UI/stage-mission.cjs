"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {candidateTerms}=require("./new-trade-endpoints.cjs");
const {getSnapshot}=require("./role-action-endpoints.cjs");
const stage=require("./stage-endpoints.cjs");
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const steps=[
 {id:"supplier-policy",phase:"ACTOR_POLICY",owner:"Supplier",required:1},
 {id:"buyer-policy",phase:"ACTOR_POLICY",owner:"Buyer",required:1},
 {id:"primary-accept",phase:"INSPECTOR_ASSIGNMENT",owner:"Primary Inspector",required:2},
 {id:"backup-accept",phase:"INSPECTOR_ASSIGNMENT",owner:"Backup Inspector",required:2},
 {id:"external-accept",phase:"INSPECTOR_ASSIGNMENT",owner:"External Arbitrator",required:2},
 {id:"buyer-fund",phase:"ESCROW_DEPOSIT",owner:"Buyer",required:3},
 {id:"supplier-activate",phase:"ACTIVATION",owner:"Supplier",required:4}
];
function policyReadiness(status,role){
 const actions=steps.map(s=>{
  const a=role.actions.find(x=>x.id===s.id);
  return {step:s.id,owner:s.owner,phase:s.phase,status:a?.status||"UNKNOWN",
   estimatedGas:a?.estimatedGas||null,txHash:a?.txHash||null,
   requiredState:s.required,reason:a?.reason||null,
   done:a?.status==="DONE"};
 });
 const done=actions.filter(a=>a.done);
 return{
  readOnly:true,checkedAtUtc:new Date().toISOString(),tradeId:candidateTerms.tradeId,
  chainId:status.chain?.chainId||11155111,
  onchainState:role.state,onchainStateName:role.stateName,
  policyHash:candidateTerms.policyHash,
  actionDeadlineNotStarted:role.state<5,
  actions,
  completedCount:done.length,
  remainingCount:actions.length-done.length,
  stage1Ready:status.model.available&&status.model.commitmentVerified,
  replay: {
    localAnvilPassed:status.redTeam.examples.some(x=>x.id==="replay"&&x.passed),
    liveSepoliaNotYetDemonstrated:true,
    missing:["Supplier original 3-view evidence + distinct Station signature","Buyer original 3-view evidence + distinct Station signature","Buyer Actor onchain submission in AWAIT_BUYER(8)","Inspector Station signed Replay + Inspector Actor onchain submission in DISPUTED_PRIMARY(12)"]
  },
  tamper:{
   localAnvilPassed:status.redTeam.examples.some(x=>x.id==="policy"&&x.passed),
   livePolicyHash:candidateTerms.policyHash,
   state5Required:role.state===5,
   actualSepoliaPolicyMismatchNotYetDemonstrated:role.state!==5
  },
  verified:status.chain!==null&&role.accountConserved&&role.balanceCoversLiabilities,
  blockers:role.state===1?
    ["Supplier와 Buyer 정책 수락 2건 필요","Inspector 3명 배정 수락 필요","Buyer 예치 0.001 Sepolia ETH + 거래 활성화 필요","그 후 독립 Station 서명·검사 제출·Replay 증거 필요"]:
    actions.filter(a=>!a.done).map(a=>"미완료: "+a.step),
  txSentByThisEndpoint:0
 };
}
async function snapshot(ctx){
 const [s,r]=await Promise.all([stage.status(ctx),getSnapshot(ctx.provider,ctx.contract)]);
 if(!s.chain)throw Error("CHAIN_PROOF_UNAVAILABLE");
 if(!eq(s.chain.candidate.policyHash,candidateTerms.policyHash))throw Error("POLICY_BINDING_FAILURE");
 return policyReadiness(s,r);
}
async function handle(req,res,ctx,url){
 if(url.pathname!=="/api/stage/mission")return false;
 if(req.method!=="GET"){res.writeHead(405,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"GET_ONLY"}));return true;}
 try{const data=await snapshot(ctx);res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));}
 catch(e){res.writeHead(503,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify({error:"MISSION_PREFLIGHT_FAILED",detail:String(e.shortMessage||e.message).slice(0,230)}));}
 return true;
}
module.exports={handle,snapshot,policyReadiness};
