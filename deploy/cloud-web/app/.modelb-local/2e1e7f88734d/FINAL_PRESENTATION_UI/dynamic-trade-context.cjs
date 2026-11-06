"use strict";

const {formatEther}=require("ethers");

const STATE_NAMES=["NONE","PROPOSED","PARTIES_ACCEPTED","INSPECTORS_ACCEPTED","FUNDED","AWAIT_SUPPLIER","SUPPLIER_REINSPECTION","SUPPLIER_HOLD","AWAIT_BUYER","BUYER_REINSPECTION","BUYER_INSPECTION_TIMEOUT","ACCEPTANCE_PENDING","DISPUTED_PRIMARY","DISPUTED_BACKUP","EXECUTION_HOLD","EVIDENCE_HOLD","ESCALATED","RELEASED","REFUNDED","CANCELLED","ARBITRATION_PENDING"];
const BYTES32=/^0x[0-9a-fA-F]{64}$/;
const ZERO32="0x"+"00".repeat(32);

function requireTradeId(value){
  const tradeId=String(value||"").trim();
  if(!BYTES32.test(tradeId))throw Error("TRADE_ID_REQUIRED_OR_INVALID");
  return tradeId;
}
function text(value){return typeof value==="bigint"?value.toString():String(value);}
function plainTerms(t){
  const keys=["tradeId","supplier","buyer","primaryInspector","backupInspector","externalArbitrator","supplierStation","buyerStation","primaryInspectorStation","backupInspectorStation","externalArbitratorStation","escrowAmount","policyVersion","policyHash","modelBundleHash","captureProfileHash","productSpecHash","requiredViewSetHash","scoreSchemaId","thresholdScaled","scoreScaleExponent","scoreMinScaled","scoreMaxScaled","maxSupplierRetries","maxBuyerRetries"];
  return Object.fromEntries(keys.map(k=>[k,text(t[k])]));
}
function inspection(i){return {attempt:Number(i.attempt),outcome:Number(i.outcome),scoreScaled:text(i.aggregateScoreScaled),evidencePackageHash:i.evidencePackageHash,submittedAt:Number(i.submittedAt||0)};}
function sourceFor(chainId){return chainId===11155111?"SEPOLIA_READ_ONLY":chainId===31337||chainId===31338||chainId===31339?"LOCAL_ANVIL_READ_ONLY":"CONFIGURED_EVM_READ_ONLY";}
async function readTrade(ctx,value){
  const tradeId=requireTradeId(value);
  const [network,block,code,state,terms,deadline,supplier,buyer,replay,settled,conserved,covered]=await Promise.all([
    ctx.provider.getNetwork(),ctx.provider.getBlock("latest"),ctx.provider.getCode(String(ctx.contract.target)),ctx.contract.getTradeState(tradeId),
    ctx.contract.getTradeTerms(tradeId),ctx.contract.getActionDeadline(tradeId),ctx.contract.getInspection(tradeId,0),ctx.contract.getInspection(tradeId,1),
    ctx.contract.getReplay(tradeId),ctx.contract.isSettled(tradeId),ctx.contract.accountingConserved(),ctx.contract.balanceCoversLiabilities()
  ]);
  const chainId=Number(network.chainId),stateNumber=Number(state);
  if(code==="0x")throw Error("CONTRACT_RUNTIME_MISSING");
  if(stateNumber===0||String(terms.tradeId).toLowerCase()===ZERO32)throw Error("TRADE_NOT_PROPOSED");
  if(String(terms.tradeId).toLowerCase()!==tradeId.toLowerCase())throw Error("ONCHAIN_TRADE_ID_MISMATCH");
  const deadlineNumber=Number(deadline),remainingSeconds=deadlineNumber===0?null:Math.max(0,deadlineNumber-Number(block.timestamp));
  return {source:sourceFor(chainId),readOnly:true,transactionsSent:0,chainId,contract:String(ctx.contract.target),tradeId,
    blockNumber:Number(block.number),blockTimestamp:Number(block.timestamp),state:stateNumber,stateName:STATE_NAMES[stateNumber]||"UNKNOWN",
    deadline:deadlineNumber,remainingSeconds,settled:Boolean(settled),accountingConserved:Boolean(conserved),balanceCoversLiabilities:Boolean(covered),
    terms:plainTerms(terms),escrowAmountWei:text(terms.escrowAmount),escrowEth:formatEther(terms.escrowAmount),
    roles:{supplier:terms.supplier,buyer:terms.buyer,primaryInspector:terms.primaryInspector,backupInspector:terms.backupInspector,externalArbitrator:terms.externalArbitrator,
      supplierStation:terms.supplierStation,buyerStation:terms.buyerStation,primaryInspectorStation:terms.primaryInspectorStation,backupInspectorStation:terms.backupInspectorStation,externalArbitratorStation:terms.externalArbitratorStation},
    inspections:{supplier:inspection(supplier),buyer:inspection(buyer)},replay:{status:Number(replay[0]),reportHash:replay[1]},
    domain:{name:"InspectEscrow",version:"1",chainId,verifyingContract:String(ctx.contract.target)}};
}

module.exports={STATE_NAMES,BYTES32,requireTradeId,plainTerms,readTrade,sourceFor};
