"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { Contract, JsonRpcProvider, formatEther } = require("ethers");
const reviewEndpoints = require("./review-endpoints.cjs");
const newTradeEndpoints = require("./new-trade-endpoints.cjs");
const roleActionEndpoints = require("./role-action-endpoints.cjs");
const stageEndpoints = require("./stage-endpoints.cjs");
const stageMission=require("./stage-mission.cjs");
const e2eEndpoints = require("./e2e-endpoints.cjs");
const tradeWorkspaceEndpoints = require("./trade-workspace-endpoints.cjs");
const evidenceImportEndpoints = require("./evidence-import-endpoints.cjs");
const replayEndpoints = require("./replay-endpoints.cjs");
const resolutionEndpoints = require("./resolution-endpoints.cjs");
const releaseEndpoints = require("./release-endpoints.cjs");
const liveEvidenceEndpoints = require("./live-evidence-endpoints.cjs");
const tradeBuilderEndpoints = require("./trade-builder-endpoints.cjs");

const PORT = Number(process.env.INSPECTESCROW_PORT || 8770);
const HOST = "127.0.0.1";
const ROOT = __dirname;
const PROJECT = path.resolve(ROOT, "..", "..", "..");
const BASE = path.resolve(ROOT, "..");
const COMMITMENT = JSON.parse(fs.readFileSync(path.join(BASE,"MODEL_B_PATCH3_COMMITMENT_DRAFT.json"),"utf8"));
const TERMS = JSON.parse(fs.readFileSync(path.join(BASE,"MODEL_B_PATCH3_TRADE_TERMS.json"),"utf8"));
const ABI = JSON.parse(fs.readFileSync(path.join(PROJECT,".patch3-build","InspectEscrowPatch3.sol_InspectEscrowPatch3.abi"),"utf8"));
const CHAIN_ID = Number(process.env.INSPECTESCROW_CHAIN_ID || 11155111);
const CONTRACT_ADDRESS = process.env.INSPECTESCROW_CONTRACT_ADDRESS || COMMITMENT.verifyingContract;
const RPC_URL = process.env.INSPECTESCROW_RPC_URL || process.env.INSPECTESCROW_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";
const rpc = new JsonRpcProvider(RPC_URL,CHAIN_ID,{staticNetwork:true});
const ctr = new Contract(CONTRACT_ADDRESS,ABI,rpc);
const STATE_NAMES = ["NONE","PROPOSED","PARTIES_ACCEPTED","INSPECTORS_ACCEPTED","FUNDED","AWAIT_SUPPLIER","SUPPLIER_REINSPECTION","SUPPLIER_HOLD","AWAIT_BUYER","BUYER_REINSPECTION","BUYER_INSPECTION_TIMEOUT","ACCEPTANCE_PENDING","DISPUTED_PRIMARY","DISPUTED_BACKUP","EXECUTION_HOLD","EVIDENCE_HOLD","ESCALATED","RELEASED","REFUNDED","CANCELLED","ARBITRATION_PENDING"];
const EVENTS = [
["01","거래 생성","0xcd11eb9e114e131fc3c084ef6fccc185b0541e60ba08d3e62fa03962270d0858"],
["02","Supplier 정책 수락","0x82f2e7224404f27e74da1377cdaf72c6899673cae52e66de2ca0395cc8395e07"],
["03","Buyer 정책 수락","0xe969562723ff4873414668cc49b397f7580ae6ce621a07d3ec3f0495a0b1e39e"],
["04","Primary Inspector 배정 수락","0x3dd84f690cb6d8b51daf7ff25aba9ad06736e4b9dbdba31d6679ef02d57e015c"],
["05","Backup Inspector 배정 수락","0x3e7cccf78aaf23f68c12434fa35f5480bb0638d7a5025a5ea90e8cbe4b8586ff"],
["06","External Arbitrator 배정 수락","0x9438bcdf26e0f41b686c355249e2eceeed86bdb0ba494b6bed09b2741f87f5d0"],
["07","Buyer 예치금 납입","0x7354cc72c6051a1d3a73ac4c777a4a2ad5bf6afb1ac2f784b4d1a2ce7b7ee306"],
["08","거래 활성화","0xf0deb71af81b29e294b6706b561a6b0839a0b5426db925788f8d8a2de3cfb740"],
["09","Supplier 검사 PASS","0xadfa9d91b3b7f916feb9898aca3c6fa88e0b9b09c40ca25e78492636cdfad2c6"],
["10","Buyer 검사 PASS","0xa50a8617f3e68a7952f80d62349c2418d089b422d5e49aa1b03d8dbabfe5e20c"],
["11","Buyer 최종 수락 및 정산","0x3645c16dc4896a885b247cd554e5c3a897adc2968d82d90bb8e4857ec94f64a0"],
["12","Supplier 실제 Withdraw","0x989997b75eda73fd315a9ad72cc2787378cea3eb0bb5a16fafd4fceebabc6ddb"]
];
const ORIGIN="http://127.0.0.1:"+PORT;
const sendJSON=(res,status,value)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":ORIGIN});res.end(JSON.stringify(value));};
const stateText=(i)=>STATE_NAMES[i]||"UNKNOWN";
function serve(req,res,file,type){
  const p=path.join(ROOT,file);
  try{const stat=fs.statSync(p);if(!stat.isFile())throw Error("not file");
    res.writeHead(200,{"Content-Type":type+"; charset=utf-8","Content-Length":stat.size,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
    if(req.method==="HEAD")return res.end();
    fs.createReadStream(p).pipe(res);
  }catch{sendJSON(res,404,{error:"NOT_FOUND"});}
}
async function tradeSnapshot(){
  const [net,block,s,settled,supplier,buyer,sc,bc,conserved,covered,totFunded,totWithdrawn,outstanding,unsettled,escrowBalance,last]=await Promise.all([
    rpc.getNetwork(),rpc.getBlock("latest"),ctr.getTradeState(COMMITMENT.tradeId),ctr.isSettled(COMMITMENT.tradeId),
    ctr.getInspection(COMMITMENT.tradeId,0),ctr.getInspection(COMMITMENT.tradeId,1),
    ctr.claimable(TERMS.supplier),ctr.claimable(TERMS.buyer),ctr.accountingConserved(),
    ctr.balanceCoversLiabilities(),ctr.totalFunded(),ctr.totalWithdrawn(),ctr.outstandingClaimable(),
    ctr.unsettledEscrow(),rpc.getBalance(COMMITMENT.verifyingContract),rpc.getTransactionReceipt(EVENTS[11][2])
  ]);
  if(Number(net.chainId)!==11155111)throw Error("NETWORK_MISMATCH");
  const n=Number(s),ok=last?.status===1;
  return {source:"LIVE_SEPOLIA_READ_ONLY",verifiedAt:new Date().toISOString(),blockNumber:block.number,
    chainId:Number(net.chainId),contract:COMMITMENT.verifyingContract,tradeId:COMMITMENT.tradeId,
    state:n,stateName:stateText(n),settled,recordedWithdrawSuccess:ok,
    supplier:{actor:TERMS.supplier,score:Number(supplier.aggregateScoreScaled)/1e6,outcome:Number(supplier.outcome),evidenceHash:supplier.evidencePackageHash,claimableEth:formatEther(sc)},
    buyer:{actor:TERMS.buyer,score:Number(buyer.aggregateScoreScaled)/1e6,outcome:Number(buyer.outcome),evidenceHash:buyer.evidencePackageHash,claimableEth:formatEther(bc)},
    accounting:{conserved,covered,totalFundedEth:formatEther(totFunded),totalWithdrawnEth:formatEther(totWithdrawn),outstandingEth:formatEther(outstanding),unsettledEth:formatEther(unsettled),escrowBalanceEth:formatEther(escrowBalance)},
    txs:EVENTS.map(([step,label,hash])=>({step,label,hash,url:"https://sepolia.etherscan.io/tx/"+hash})),
    caveat:"Archived Model B inspection evidence rebound to new S05 trade; the new photo from this page is NOT attached to this settled trade."
  };
}
function proxyToAI(req,res,remotePath){
  const headers={};
  if(req.headers["content-type"])headers["content-type"]=req.headers["content-type"];
  if(req.headers["content-length"])headers["content-length"]=req.headers["content-length"];
  if(req.headers["accept"])headers["accept"]=req.headers["accept"];
  if(Number(req.headers["content-length"]||0)>25*1024*1024){sendJSON(res,413,{detail:"UPLOAD_TOO_LARGE"});return;}
  const up=http.request({hostname:"127.0.0.1",port:8766,path:remotePath,method:req.method,headers,timeout:180000},back=>{
    res.writeHead(back.statusCode||502,{"Content-Type":back.headers["content-type"]||"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
    back.pipe(res);
  });
  up.on("timeout",()=>up.destroy(Error("AI inference timed out")));
  up.on("error",e=>{if(!res.headersSent)sendJSON(res,502,{error:"LOCAL_MODEL_B_UNAVAILABLE",detail:e.message});else res.end();});
  req.pipe(up);
}
http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://127.0.0.1");
  const pathname=url.pathname;
  if(pathname.startsWith("/api/review/"))return reviewEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/newtrade/"))return newTradeEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/roles/"))return roleActionEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname==="/api/stage/mission")return stageMission.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/stage/"))return stageEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/e2e/"))return e2eEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/evidence/"))return evidenceImportEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/replay/"))return replayEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/resolution/"))return resolutionEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/release/"))return releaseEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/live/"))return liveEvidenceEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname.startsWith("/api/trade-builder/"))return tradeBuilderEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname==="/api/trades"||pathname.startsWith("/api/trades/"))return tradeWorkspaceEndpoints.handle(req,res,{contract:ctr,provider:rpc},url);
  if(pathname==="/"||pathname==="/index.html")return serve(req,res,"index.html","text/html");
  if(pathname==="/trades"||pathname==="/trades.html")return serve(req,res,"trades.html","text/html");
  if(pathname==="/evidence"||pathname==="/evidence.html")return serve(req,res,"evidence.html","text/html");
  if(pathname==="/replay"||pathname==="/replay.html")return serve(req,res,"replay.html","text/html");
  if(pathname==="/resolution"||pathname==="/resolution.html")return serve(req,res,"resolution.html","text/html");
  if(pathname==="/journey"||pathname==="/journey.html")return serve(req,res,"journey.html","text/html");
  if(pathname==="/live"||pathname==="/live.html")return serve(req,res,"live.html","text/html");
  if(pathname==="/new-trade"||pathname==="/new-trade.html")return serve(req,res,"new-trade.html","text/html");
  if(pathname==="/stage"||pathname==="/stage.html")return serve(req,res,"stage.html","text/html");
  if(pathname==="/e2e"||pathname==="/e2e.html")return serve(req,res,"e2e.html","text/html");
  if(pathname==="/e2e.css")return serve(req,res,"e2e.css","text/css");
  if(pathname==="/e2e.js")return serve(req,res,"e2e.js","application/javascript");
  if(pathname==="/trades.css")return serve(req,res,"trades.css","text/css");
  if(pathname==="/trades-2b.css")return serve(req,res,"trades-2b.css","text/css");
  if(pathname==="/trades.js")return serve(req,res,"trades.js","application/javascript");
  if(pathname==="/evidence.css")return serve(req,res,"evidence.css","text/css");
  if(pathname==="/evidence.js")return serve(req,res,"evidence.js","application/javascript");
  if(pathname==="/replay.css")return serve(req,res,"replay.css","text/css");
  if(pathname==="/replay.js")return serve(req,res,"replay.js","application/javascript");
  if(pathname==="/resolution.css")return serve(req,res,"resolution.css","text/css");
  if(pathname==="/resolution.js")return serve(req,res,"resolution.js","application/javascript");
  if(pathname==="/journey.css")return serve(req,res,"journey.css","text/css");
  if(pathname==="/journey.js")return serve(req,res,"journey.js","application/javascript");
  if(pathname==="/live.css")return serve(req,res,"live.css","text/css");
  if(pathname==="/live-camera.css")return serve(req,res,"live-camera.css","text/css");
  if(pathname==="/live.js")return serve(req,res,"live.js","application/javascript");
  if(pathname==="/new-trade.css")return serve(req,res,"new-trade.css","text/css");
  if(pathname==="/new-trade.js")return serve(req,res,"new-trade.js","application/javascript");
  if(pathname==="/stage.css")return serve(req,res,"stage.css","text/css");
  if(pathname==="/stage.js")return serve(req,res,"stage.js","application/javascript");
  if(pathname==="/styles.css")return serve(req,res,"styles.css","text/css");
  if(pathname==="/app.js")return serve(req,res,"app.js","application/javascript");
  if(pathname==="/proposal.js")return serve(req,res,"proposal.js","application/javascript");
  if(pathname==="/roles.js")return serve(req,res,"roles.js","application/javascript");
  if(pathname==="/vendor/ethers.umd.min.js"){
    const vendor=path.join(PROJECT,"node_modules","ethers","dist","ethers.umd.min.js");
    try{const s=fs.statSync(vendor);res.writeHead(200,{"Content-Type":"application/javascript; charset=utf-8","Content-Length":s.size,"Cache-Control":"public, max-age=3600","X-Content-Type-Options":"nosniff"});return fs.createReadStream(vendor).pipe(res);}
    catch(e){return sendJSON(res,503,{error:"ETHERS_BROWSER_BUNDLE_UNAVAILABLE"});}
  }
  if(pathname==="/api/modelb/status"&&req.method==="GET")return proxyToAI(req,res,"/api/status");
  if(pathname==="/api/modelb/infer"&&req.method==="POST")return proxyToAI(req,res,"/api/infer");
  if(pathname==="/api/trade"&&req.method==="GET"){
    try{return sendJSON(res,200,await tradeSnapshot());}
    catch(e){return sendJSON(res,502,{error:"SEPOLIA_READ_ONLY_UNAVAILABLE",detail:String(e.shortMessage||e.message).slice(0,240)});}
  }
  if(pathname==="/api/ping"&&req.method==="GET")return sendJSON(res,200,{status:"OK",role:"READ_ONLY_UNIFIED_FRONTEND",version:"2026-10-30-dynamic-trade",chainId:CHAIN_ID,contract:CONTRACT_ADDRESS,networkMode:CHAIN_ID===11155111?"SEPOLIA":"LOCAL_OR_CONFIGURED_EVM"});
  return sendJSON(res,404,{error:"ROUTE_NOT_FOUND"});
}).listen(PORT,HOST,()=>console.log("INSPECTESCROW_FINAL_DEMO_READY http://"+HOST+":"+PORT+"/"));
