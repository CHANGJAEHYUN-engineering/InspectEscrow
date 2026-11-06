"use strict";
const {formatUnits}=require("ethers");
const {readTrade,requireTradeId}=require("./dynamic-trade-context.cjs");

const ACTIONS=[
 {id:"supplier-policy",role:"supplier",label:"Supplier 거래 정책 수락",func:"acceptPolicy",states:[1],event:"PolicyAccepted"},
 {id:"buyer-policy",role:"buyer",label:"Buyer 거래 정책 수락",func:"acceptPolicy",states:[1],event:"PolicyAccepted"},
 {id:"primary-accept",role:"primaryInspector",label:"Primary Inspector 배정 수락",func:"acceptInspectorAssignment",states:[2],event:"InspectorAssignmentAccepted"},
 {id:"backup-accept",role:"backupInspector",label:"Backup Inspector 배정 수락",func:"acceptInspectorAssignment",states:[2],event:"InspectorAssignmentAccepted"},
 {id:"external-accept",role:"externalArbitrator",label:"External Arbitrator 배정 수락",func:"acceptInspectorAssignment",states:[2],event:"InspectorAssignmentAccepted"},
 {id:"buyer-fund",role:"buyer",label:"Buyer 에스크로 예치",func:"fund",states:[3],event:"TradeFunded"},
 {id:"supplier-activate",role:"supplier",label:"거래 활성화",func:"activate",states:[4],event:"TradeActivated"}
];
const ROLE_LABELS={supplier:"Supplier",buyer:"Buyer",primaryInspector:"Primary Inspector",backupInspector:"Backup Inspector",externalArbitrator:"External Arbitrator"};
const sendJSON=(res,code,data)=>{res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data));};

async function simulate(contract,trade,action){
 const actor=trade.roles[action.role],value=action.func==="fund"?BigInt(trade.escrowAmountWei):0n,overrides=value?{from:actor,value}:{from:actor};
 try{await contract[action.func].staticCall(trade.tradeId,overrides);const gas=await contract[action.func].estimateGas(trade.tradeId,overrides);return{allowed:true,estimatedGas:gas.toString(),reason:"SIMULATION_PASS"};}
 catch(error){return{allowed:false,estimatedGas:null,reason:String(error.shortMessage||error.message||"REVERT").slice(0,180)};}
}
function completed(action,state){
 if(action.func==="acceptPolicy")return state>=2;
 if(action.func==="acceptInspectorAssignment")return state>=3;
 if(action.func==="fund")return state>=4;
 if(action.func==="activate")return state>=5;
 return false;
}
async function getSnapshot(provider,contract,tradeId){
 const trade=await readTrade({provider,contract},requireTradeId(tradeId));
 if(!trade.accountingConserved||!trade.balanceCoversLiabilities)throw Error("ACCOUNTING_INVARIANT_FAILED");
 const fee=await provider.getFeeData();
 const roles=Object.entries(ROLE_LABELS).map(([id,label])=>({id,label,actor:trade.roles[id]}));
 const actions=await Promise.all(ACTIONS.map(async action=>{
   if(completed(action,trade.state))return{...action,status:"DONE",txHash:null,allowed:false,estimatedGas:null,reason:"ALREADY_COMPLETED"};
   if(!action.states.includes(trade.state))return{...action,status:"WAITING",txHash:null,allowed:false,estimatedGas:null,reason:"REQUIRES_STATE_"+action.states.join("_")};
   const result=await simulate(contract,trade,action);return{...action,status:result.allowed?"READY":"BLOCKED",txHash:null,...result};
 }));
 return {...trade,verifiedAt:new Date().toISOString(),policyHash:trade.terms.policyHash,modelBundleHash:trade.terms.modelBundleHash,
  captureProfileHash:trade.terms.captureProfileHash,scoreSchemaId:trade.terms.scoreSchemaId,thresholdScaled:trade.terms.thresholdScaled,
  roles,actions,accountConserved:trade.accountingConserved,gasPriceGwei:fee.maxFeePerGas?formatUnits(fee.maxFeePerGas,"gwei"):null,
  eventLogWarning:"거래 상태는 현재 계약에서 재조회했습니다. TX 해시는 거래 상세 감사 로그에서 확인하세요.",
  limitations:"브라우저의 선택 Trade ID는 편의 정보입니다. 역할·금액·정책은 이 응답의 온체인 TradeTerms를 기준으로 다시 검증됩니다."};
}
async function handle(req,res,{contract,provider},url){
 if(req.method!=="GET")return sendJSON(res,405,{error:"GET_ONLY"});
 if(url.pathname==="/api/roles/status"){
  try{return sendJSON(res,200,await getSnapshot(provider,contract,url.searchParams.get("tradeId")));}
  catch(error){const detail=String(error.shortMessage||error.message).slice(0,260);return sendJSON(res,/TRADE_ID_REQUIRED|TRADE_NOT_PROPOSED/.test(detail)?422:503,{error:"ROLE_PREFLIGHT_FAILED",detail});}
 }
 return sendJSON(res,404,{error:"UNKNOWN_ENDPOINT"});
}
module.exports={ACTIONS,getSnapshot,handle};
