"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {formatEther}=require("ethers");
const {hashObject,reference,commitment}=require("./evidence-bridge.cjs");
const {candidateTerms,staticCandidateChecks}=require("./new-trade-endpoints.cjs");
const {readTrade,requireTradeId}=require("./dynamic-trade-context.cjs");

const BASE=path.resolve(__dirname,"..");
const CANDIDATE_DIR=path.resolve(__dirname,"..","..","REVIEW_TRADE_CANDIDATE_49bf5596");
const STATE_NAMES=["NONE","PROPOSED","PARTIES_ACCEPTED","INSPECTORS_ACCEPTED","FUNDED","AWAIT_SUPPLIER","SUPPLIER_REINSPECTION","SUPPLIER_HOLD","AWAIT_BUYER","BUYER_REINSPECTION","BUYER_INSPECTION_TIMEOUT","ACCEPTANCE_PENDING","DISPUTED_PRIMARY","DISPUTED_BACKUP","EXECUTION_HOLD","EVIDENCE_HOLD","ESCALATED","RELEASED","REFUNDED","CANCELLED","ARBITRATION_PENDING"];
const TERMINAL_STATES=new Set([17,18,19]);
const FROM_BLOCK=12020557;
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const readJSON=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const candidatePolicy=readJSON(path.join(CANDIDATE_DIR,"REVIEW_POLICY_PREIMAGE.jcs.json"));
const referencePolicy=readJSON(path.join(BASE,"POLICY_HASH_PREIMAGE.jcs.json"));
const send=(res,status,value)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));};

const KNOWN_TRADES=[
 {id:candidateTerms.tradeId,kind:"MODEL_B_REVIEW_CANDIDATE",title:"Model B · REVIEW 실증 후보",terms:candidateTerms,policy:candidatePolicy,preferred:true},
 {id:reference.tradeId,kind:"MODEL_B_S05_NORMAL_REFERENCE",title:"Model B · S05 정상 완료 거래",terms:reference,policy:referencePolicy,preferred:false}
];
const EVENT_LABELS={
 TradeProposed:"거래 생성",PolicyAccepted:"정책 수락",InspectorAssignmentAccepted:"Inspector 배정 수락",
 TradeFunded:"Buyer 예치",TradeActivated:"거래 활성화",InspectionOutcomeDerived:"검사 결과 기록",
 ReplayResultRecorded:"Inspector Replay 기록",TradeSettled:"정산",Withdrawal:"Withdraw",
 BackupInspectorActivated:"Backup Inspector 활성화",ExternalArbitrationOpened:"External Arbitration 개시"
};

function stateName(value){return STATE_NAMES[Number(value)]||"UNKNOWN";}
function documentApproval(policy){
 const status=String(policy?.status||"UNSPECIFIED");
 return {status,approved:/^(?:APPROVED|ACTIVE|RATIFIED)/i.test(status),decisionOwner:"USER_POLICY_OWNER",sourceImmutable:true};
}
function policyVerification(def,onchainTerms,state){
 const preimageHash=hashObject(def.policy);
 const expectedHash=String(def.terms.policyHash);
 const onchainHash=String(onchainTerms.policyHash);
 const approval=documentApproval(def.policy);
 const hashMatchesTerms=eq(preimageHash,expectedHash);
 const hashMatchesOnchain=eq(preimageHash,onchainHash);
 return {documentApproval:approval,onchainLifecycle:{state:Number(state),stateName:stateName(state),exists:Number(state)>0},
  immutableHash:{algorithm:"keccak256(RFC8785-style canonical JSON)",computed:preimageHash,tradeTerms:expectedHash,onchain:onchainHash,
   hashMatchesTerms,hashMatchesOnchain,verified:hashMatchesTerms&&hashMatchesOnchain},
  statusConflict:!approval.approved&&Number(state)>0,
  interpretation:!approval.approved&&Number(state)>0
   ?"정책 문서는 미승인 상태지만 거래는 온체인에 존재합니다. 과거 승인으로 소급 표시하지 말고 추가 실행 전 사용자 정책 결정을 받으세요."
   :"문서 승인 상태와 온체인 생명주기를 독립적으로 표시합니다."};
}
function plainTerms(t){
 const keys=["tradeId","supplier","buyer","primaryInspector","backupInspector","externalArbitrator","supplierStation","buyerStation","primaryInspectorStation","backupInspectorStation","externalArbitratorStation","escrowAmount","policyVersion","policyHash","modelBundleHash","captureProfileHash","productSpecHash","requiredViewSetHash","scoreSchemaId","thresholdScaled","scoreScaleExponent","scoreMinScaled","scoreMaxScaled","maxSupplierRetries","maxBuyerRetries"];
 return Object.fromEntries(keys.map(k=>[k,typeof t[k]==="bigint"?t[k].toString():String(t[k])]));
}
function nextActions(state,supplier,buyer,replay,settled){
 if(settled||TERMINAL_STATES.has(state))return [{label:"최종 회계·수령권 확인",route:"/resolution",mode:"READ_ONLY"}];
 const map={
  1:["Supplier 정책 수락","Buyer 정책 수락"],2:["Primary Inspector 배정 수락","Backup Inspector 배정 수락","External Arbitrator 배정 수락"],
  3:["Buyer 0.001 Sepolia ETH 예치"],4:["Supplier 거래 활성화"],5:["Supplier Station 서명 및 Actor 검사 제출"],
  6:["Supplier 재검사"],7:["Supplier 재검사 요청 또는 hold 종료"],8:["Buyer Station 서명 및 Actor 검사 제출"],
  9:["Buyer 재검사"],10:["상호 해결 또는 timeout 경로"],11:["Buyer acceptAndRelease"],
  12:[Number(replay?.[0]||0)===0?"Primary Inspector 실제 Replay":"Primary Inspector 명시 Decision"],
  13:[Number(replay?.[0]||0)===0?"Backup Inspector 실제 Replay":"Backup Inspector 명시 Decision"],
  14:["EXECUTION_HOLD 상호 해결"],15:["EVIDENCE_HOLD 상호 해결"],16:["External Arbitration 또는 timeout"],20:["External Arbitrator Decision"]
 };
 const route=state<=4?"/#roles":[5,6,7,8,9].includes(state)?"/e2e":[12,13].includes(state)&&Number(replay?.[0]||0)===0?"/replay":"/resolution";
 return (map[state]||["현재 상태의 계약 조건 확인"]).map(label=>({label,route,mode:"REQUIRES_EXPLICIT_USER_APPROVAL"}));
}
function milestones(state,supplier,buyer,settled){
 const item=(id,label,done,evidence)=>({id,label,status:done?"DONE":"PENDING",evidence});
 return [item("proposal","거래 생성",state>0,"getTradeState="+stateName(state)),
  item("policy","Supplier·Buyer 정책 수락",state>=2,"state >= PARTIES_ACCEPTED"),
  item("inspectors","Inspector 3역할 배정 수락",state>=3,"state >= INSPECTORS_ACCEPTED"),
  item("funding","Buyer 예치",state>=4,"state >= FUNDED"),item("activation","거래 활성화",state>=5,"state >= AWAIT_SUPPLIER"),
  item("supplierInspection","Supplier 검사",Number(supplier.attempt)>0,"attempt="+Number(supplier.attempt)),
  item("buyerInspection","Buyer 검사",Number(buyer.attempt)>0,"attempt="+Number(buyer.attempt)),
  item("settlement","정산",Boolean(settled),"isSettled="+Boolean(settled))];
}
async function eventTimeline(provider,contract,tradeId,head){
 let logs=[];
 const network=await provider.getNetwork();const start=Number(network.chainId)===11155111?FROM_BLOCK:0;
 try{logs=await provider.getLogs({address:String(contract.target),fromBlock:start,toBlock:head,topics:[null,tradeId]});}catch{}
 const rows=[];
 for(const log of logs){
  let parsed=null;try{parsed=contract.interface.parseLog(log);}catch{}
  if(!parsed)continue;
  rows.push({event:parsed.name,label:EVENT_LABELS[parsed.name]||parsed.name,transactionHash:log.transactionHash,blockNumber:log.blockNumber,
   url:Number(network.chainId)===11155111?"https://sepolia.etherscan.io/tx/"+log.transactionHash:null,source:Number(network.chainId)===11155111?"LIVE_SEPOLIA_LOG":"LOCAL_EVM_LOG"});
 }
 return rows.sort((a,b)=>a.blockNumber-b.blockNumber);
}
async function getDetail({provider,contract},tradeId){
 requireTradeId(tradeId);
 let def=KNOWN_TRADES.find(x=>eq(x.id,tradeId));
 if(!def){
  const dynamic=await readTrade({provider,contract},tradeId);
  def={id:dynamic.tradeId,kind:"DYNAMIC_ONCHAIN_TRADE",title:"사용자 선택 온체인 거래",terms:dynamic.terms,policy:null,preferred:false,dynamic:true};
 }
 if(def.preferred)staticCandidateChecks();
 const [network,head,state,terms,deadline,supplier,buyer,replay,settled,conserved,covered]=await Promise.all([
  provider.getNetwork(),provider.getBlock("latest"),contract.getTradeState(def.id),contract.getTradeTerms(def.id),contract.getActionDeadline(def.id),
  contract.getInspection(def.id,0),contract.getInspection(def.id,1),contract.getReplay(def.id),contract.isSettled(def.id),
  contract.accountingConserved(),contract.balanceCoversLiabilities()]);
 const chainId=Number(network.chainId),s=Number(state);
 const policy=def.dynamic?{documentApproval:{status:"LOCAL_POLICY_DOCUMENT_NOT_LOADED",approved:false,decisionOwner:"USER_POLICY_OWNER",sourceImmutable:false},
  onchainLifecycle:{state:s,stateName:stateName(s),exists:s>0},immutableHash:{algorithm:"on-chain bytes32",computed:null,tradeTerms:String(terms.policyHash),onchain:String(terms.policyHash),hashMatchesTerms:true,hashMatchesOnchain:true,verified:true},
  statusConflict:false,interpretation:"거래는 온체인에 존재합니다. 이 브라우저에는 정책 원문이 없으므로 Hash 결합만 확인되며, 원문 검토는 별도로 필요합니다."}:policyVerification(def,terms,s);
 if(!policy.immutableHash.verified)throw Error("POLICY_HASH_BINDING_FAILED");
 const liveEvents=await eventTimeline(provider,contract,def.id,head.number);
 const recorded=def.kind==="MODEL_B_S05_NORMAL_REFERENCE"?[
  ["거래 생성","0xcd11eb9e114e131fc3c084ef6fccc185b0541e60ba08d3e62fa03962270d0858"],["Supplier 정책 수락","0x82f2e7224404f27e74da1377cdaf72c6899673cae52e66de2ca0395cc8395e07"],["Buyer 정책 수락","0xe969562723ff4873414668cc49b397f7580ae6ce621a07d3ec3f0495a0b1e39e"],["Primary Inspector 배정 수락","0x3dd84f690cb6d8b51daf7ff25aba9ad06736e4b9dbdba31d6679ef02d57e015c"],["Backup Inspector 배정 수락","0x3e7cccf78aaf23f68c12434fa35f5480bb0638d7a5025a5ea90e8cbe4b8586ff"],["External Arbitrator 배정 수락","0x9438bcdf26e0f41b686c355249e2eceeed86bdb0ba494b6bed09b2741f87f5d0"],["Buyer 예치","0x7354cc72c6051a1d3a73ac4c777a4a2ad5bf6afb1ac2f784b4d1a2ce7b7ee306"],["거래 활성화","0xf0deb71af81b29e294b6706b561a6b0839a0b5426db925788f8d8a2de3cfb740"],["Supplier 검사 PASS","0xadfa9d91b3b7f916feb9898aca3c6fa88e0b9b09c40ca25e78492636cdfad2c6"],["Buyer 검사 PASS","0xa50a8617f3e68a7952f80d62349c2418d089b422d5e49aa1b03d8dbabfe5e20c"],["Buyer 정산","0x3645c16dc4896a885b247cd554e5c3a897adc2968d82d90bb8e4857ec94f64a0"],["Supplier Withdraw","0x989997b75eda73fd315a9ad72cc2787378cea3eb0bb5a16fafd4fceebabc6ddb"]
 ].map(([label,transactionHash],i)=>({event:"RECORDED_TX",label,transactionHash,step:i+1,url:"https://sepolia.etherscan.io/tx/"+transactionHash,source:"VERIFIED_RECEIPT_MANIFEST"})):liveEvents;
 return {source:chainId===11155111?"LIVE_SEPOLIA_READ_ONLY":"LOCAL_ANVIL_READ_ONLY",readOnly:true,serverTransactionsSent:0,verifiedAt:new Date().toISOString(),blockNumber:head.number,
  chainId,contract:String(contract.target),id:def.id,kind:def.kind,title:def.title,state:s,stateName:stateName(s),settled:Boolean(settled),
  deadline:Number(deadline),escrowEth:formatEther(terms.escrowAmount),policy,terms:plainTerms(terms),
  roles:{supplier:terms.supplier,buyer:terms.buyer,primaryInspector:terms.primaryInspector,backupInspector:terms.backupInspector,externalArbitrator:terms.externalArbitrator,
   supplierStation:terms.supplierStation,buyerStation:terms.buyerStation,primaryInspectorStation:terms.primaryInspectorStation,backupInspectorStation:terms.backupInspectorStation,externalArbitratorStation:terms.externalArbitratorStation},
  inspections:{supplier:{attempt:Number(supplier.attempt),outcome:Number(supplier.outcome),scoreScaled:String(supplier.aggregateScoreScaled),evidencePackageHash:supplier.evidencePackageHash},buyer:{attempt:Number(buyer.attempt),outcome:Number(buyer.outcome),scoreScaled:String(buyer.aggregateScoreScaled),evidencePackageHash:buyer.evidencePackageHash}},
  replay:{status:Number(replay[0]),reportHash:replay[1]},accounting:{conserved:Boolean(conserved),balanceCoversLiabilities:Boolean(covered)},
  milestones:milestones(s,supplier,buyer,settled),nextActions:nextActions(s,supplier,buyer,replay,settled),transactions:recorded,
  policyDocument:def.policy,claimBoundary:"온체인은 고정된 조건·서명·상태 전이를 검증하며 AI 정확성이나 실물 동일성을 자동 증명하지 않습니다."};
}
async function getList(ctx,includeTradeId){
 const network=await ctx.provider.getNetwork(),isSepolia=Number(network.chainId)===11155111;
 const items=[];if(isSepolia)for(const def of KNOWN_TRADES){const d=await getDetail(ctx,def.id);items.push({id:d.id,kind:d.kind,title:d.title,state:d.state,stateName:d.stateName,settled:d.settled,policyDocumentStatus:d.policy.documentApproval.status,policyHashVerified:d.policy.immutableHash.verified,statusConflict:d.policy.statusConflict,nextActions:d.nextActions,transactionCount:d.transactions.length});}
 if(includeTradeId&&!items.some(x=>eq(x.id,includeTradeId))){const d=await getDetail(ctx,includeTradeId);items.unshift({id:d.id,kind:d.kind,title:d.title,state:d.state,stateName:d.stateName,settled:d.settled,policyDocumentStatus:d.policy.documentApproval.status,policyHashVerified:true,statusConflict:false,nextActions:d.nextActions,transactionCount:d.transactions.length});}
 return {source:isSepolia?"LIVE_SEPOLIA_READ_ONLY":"LOCAL_ANVIL_READ_ONLY",readOnly:true,chainId:Number(network.chainId),contract:String(ctx.contract.target),items};
}
async function handle(req,res,ctx,url){
 if(req.method!=="GET")return send(res,405,{error:"GET_READ_ONLY_ONLY"});
 try{
  if(url.pathname==="/api/trades")return send(res,200,await getList(ctx,url.searchParams.get("tradeId")));
  const match=url.pathname.match(/^\/api\/trades\/(0x[a-fA-F0-9]{64})$/);
  if(match)return send(res,200,await getDetail(ctx,match[1]));
  return send(res,404,{error:"TRADE_NOT_FOUND"});
 }catch(e){return send(res,503,{error:"TRADE_WORKSPACE_UNAVAILABLE",detail:String(e.shortMessage||e.message).slice(0,260)});}
}
module.exports={KNOWN_TRADES,STATE_NAMES,documentApproval,policyVerification,nextActions,milestones,getDetail,getList,handle};
