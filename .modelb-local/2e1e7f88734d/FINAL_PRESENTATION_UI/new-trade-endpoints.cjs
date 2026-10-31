"use strict";
const fs=require("node:fs"),path=require("node:path");
const {formatEther,formatUnits,Contract}=require("ethers");
const {hashObject,policyForTrade,reference,commitment}=require("./evidence-bridge.cjs");
const candidateDir=path.resolve(__dirname,"..","..","REVIEW_TRADE_CANDIDATE_49bf5596");
const candidateTerms=JSON.parse(fs.readFileSync(path.join(candidateDir,"REVIEW_TRADE_TERMS.json"),"utf8"));
const candidatePreimage=JSON.parse(fs.readFileSync(path.join(candidateDir,"REVIEW_POLICY_PREIMAGE.jcs.json"),"utf8"));
const candidateId=candidateTerms.tradeId;
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const functionABI=JSON.parse(fs.readFileSync(path.resolve(__dirname,"..","..","..",".patch3-build","InspectEscrowPatch3.sol_InspectEscrowPatch3.abi"),"utf8")).filter(x=>x.type==="function"&&x.name==="proposeTrade");
if(functionABI.length!==1)throw Error("PROPOSE_FUNCTION_ABI_MISSING");
const send=(res,status,value)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));};
function staticCandidateChecks(){
 if(candidateId===reference.tradeId||!/^0x[a-fA-F0-9]{64}$/.test(candidateId))throw Error("CANDIDATE_TRADE_ID");
 if(!eq(candidateTerms.policyHash,policyForTrade(candidateId).hash)||!eq(candidateTerms.policyHash,hashObject(candidatePreimage)))throw Error("POLICY_HASH_NOT_REPRODUCIBLE");
 if(!eq(candidatePreimage.trade.tradeId,candidateId))throw Error("CANDIDATE_POLICY_TRADE_MISMATCH");
 for(const k of ["supplier","buyer","primaryInspector","backupInspector","externalArbitrator","supplierStation","buyerStation","primaryInspectorStation","backupInspectorStation","externalArbitratorStation"]){
  if(!eq(candidateTerms[k],reference[k]))throw Error("ROLE_MISMATCH_"+k);
 }
 for(const k of ["modelBundleHash","captureProfileHash","productSpecHash","requiredViewSetHash","scoreSchemaId","thresholdScaled","escrowAmount","policyVersion"]){
  if(!eq(candidateTerms[k],reference[k]))throw Error("TEMPLATE_MISMATCH_"+k);
 }
 return true;
}
staticCandidateChecks();
const actorKeys=["supplier","buyer","primaryInspector","backupInspector","externalArbitrator"];
const stationKeys=["supplierStation","buyerStation","primaryInspectorStation","backupInspectorStation","externalArbitratorStation"];
async function getCandidateStatus({contract,provider}){
 const block=await provider.getBlock("latest"),network=await provider.getNetwork();
 if(Number(network.chainId)!==11155111)throw Error("NETWORK_NOT_SEPOLIA");
 const code=await provider.getCode(commitment.verifyingContract);
 if(code==="0x")throw Error("NO_CONTRACT_CODE");
 const [fee,credentials,bals] = await Promise.all([
 provider.getFeeData(),
 Promise.all(stationKeys.map(async k=>{
   const reg=new Contract(commitment.credentialRegistry,["function status(address) view returns (uint8)"],provider);
   const value=Number(await reg.status(candidateTerms[k]));
   return{role:k,address:candidateTerms[k],status:value,active:value===1};
 })),
 Promise.all(actorKeys.map(async k=>({role:k,address:candidateTerms[k],balanceEth:formatEther(await provider.getBalance(candidateTerms[k]))})))
 ]);
 let proposalCall="BLOCKED",gasEstimate=null,staticError=null;
 try{
  await contract.proposeTrade.staticCall(candidateTerms,{from:candidateTerms.supplier});
  proposalCall="PASS";
  gasEstimate=(await contract.proposeTrade.estimateGas(candidateTerms,{from:candidateTerms.supplier})).toString();
 }catch(e){staticError=String(e.shortMessage||e.message).slice(0,230);}
 let currentState=null;
 try{currentState=Number(await contract.getTradeState(candidateId));}catch{}
 const allStationsActive=credentials.every(x=>x.active);
 const ready=proposalCall==="PASS"&&gasEstimate!==null&&allStationsActive&&currentState===null;
 return{
   stage:"NEW_TRADE_PROPOSAL_PREFLIGHT",
   status:ready?"READY_FOR_EXPLICIT_METAMASK_APPROVAL":"BLOCKED",
   ready,proposalCall,gasEstimate,staticError,
   contract:commitment.verifyingContract,chainId:11155111,
   latestBlock:block.number,verifiedAt:new Date().toISOString(),blockTimeUnix:block.timestamp,
   currentState,chainLabel:"Sepolia testnet",escrowETH:formatEther(candidateTerms.escrowAmount),
   maxFeeGwei:fee.maxFeePerGas?formatUnits(fee.maxFeePerGas,"gwei"):null,
   policyHash:candidateTerms.policyHash,tradeId:candidateId,supplier:candidateTerms.supplier,
   roles:credentials,actorBalances:bals,allStationsActive,
   showConfirmation:"Transaction will be sent only after user clicks and confirms in MetaMask.",
   transactionsBroadcastByServer:0
 };
}
async function handle(req,res,{contract,provider},url){
 if(req.method!=="GET")return send(res,405,{error:"GET_READ_ONLY_ONLY"});
 if(url.pathname==="/api/newtrade/candidate"){
   try{
    staticCandidateChecks();
    const status=await getCandidateStatus({contract,provider});
    return send(res,200,{...status,terms:candidateTerms,proposeABI:functionABI});
   }catch(e){return send(res,503,{ready:false,error:"PREFLIGHT_FAILED",detail:String(e.shortMessage||e.message).slice(0,260)});}
 }
 return send(res,404,{error:"NOT_FOUND"});
}
module.exports={handle,getCandidateStatus,candidateTerms,staticCandidateChecks};
