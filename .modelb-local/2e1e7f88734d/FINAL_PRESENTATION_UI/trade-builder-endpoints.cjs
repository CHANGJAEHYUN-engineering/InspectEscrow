"use strict";

const fs=require("node:fs"),path=require("node:path");
const {Contract,getAddress,parseEther,formatEther,formatUnits,ZeroHash}=require("ethers");
const {hashObject,reference,commitment}=require("./evidence-bridge.cjs");

const CANDIDATE_DIR=path.resolve(__dirname,"..","..","REVIEW_TRADE_CANDIDATE_49bf5596");
const POLICY_TEMPLATE=JSON.parse(fs.readFileSync(path.join(CANDIDATE_DIR,"REVIEW_POLICY_PREIMAGE.jcs.json"),"utf8"));
const TEMPLATE_TERMS=JSON.parse(fs.readFileSync(path.join(CANDIDATE_DIR,"REVIEW_TRADE_TERMS.json"),"utf8"));
const ABI=JSON.parse(fs.readFileSync(path.resolve(__dirname,"..","..","..",".patch3-build","InspectEscrowPatch3.sol_InspectEscrowPatch3.abi"),"utf8"));
const PROPOSE_ABI=ABI.filter(x=>x.type==="function"&&x.name==="proposeTrade");
const PROTECTED=new Set([reference.tradeId.toLowerCase(),commitment.sourceOldFundedTradeId.toLowerCase(),TEMPLATE_TERMS.tradeId.toLowerCase()]);
const ACTORS=["supplier","buyer","primaryInspector","backupInspector","externalArbitrator"];
const STATIONS=["supplierStation","buyerStation","primaryInspectorStation","backupInspectorStation","externalArbitratorStation"];
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const assert=(v,code)=>{if(!v)throw Error(code);};
const clone=value=>structuredClone(value);
const bytes32=value=>/^0x[0-9a-fA-F]{64}$/.test(String(value||""))&&String(value).toLowerCase()!==ZeroHash;

function readBody(req,max=1024*1024){return new Promise((resolve,reject)=>{const chunks=[];let size=0,done=false;req.on("data",c=>{if(done)return;size+=c.length;if(size>max){done=true;reject(Error("REQUEST_TOO_LARGE"));req.destroy();return;}chunks.push(c);});req.on("error",reject);req.on("end",()=>{if(done)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(Error("INVALID_JSON"));}});});}
function cleanText(value,min,max,code){const v=String(value||"").trim();assert(v.length>=min&&v.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v),code);return v;}
function seconds(value,min,max,code){const v=Number(value);assert(Number.isSafeInteger(v)&&v>=min&&v<=max,code);return v;}
function addressMap(body){const source=body.roles&&typeof body.roles==="object"?body.roles:body;const out={};for(const key of [...ACTORS,...STATIONS]){try{out[key]=getAddress(String(source[key]||""));}catch{throw Error("INVALID_ADDRESS_"+key);}}const all=Object.values(out).map(x=>x.toLowerCase());assert(new Set(all).size===all.length,"ACTOR_STATION_ADDRESSES_MUST_ALL_BE_DISTINCT");return out;}

function normalize(body){
  assert(body&&typeof body==="object"&&!Array.isArray(body),"REQUEST_OBJECT_REQUIRED");
  const tradeId=String(body.tradeId||"");assert(bytes32(tradeId),"TRADE_ID_INVALID");assert(!PROTECTED.has(tradeId.toLowerCase()),"PROTECTED_OR_EXISTING_PROJECT_TRADE_ID_FORBIDDEN");
  const roles=addressMap(body);
  const escrowEth=String(body.escrowEth||"").trim();let escrowAmount;try{escrowAmount=parseEther(escrowEth);}catch{throw Error("ESCROW_AMOUNT_INVALID");}
  assert(escrowAmount>=100000000000000n&&escrowAmount<=100000000000000000n,"ESCROW_OUTSIDE_PILOT_RANGE_0_0001_TO_0_1_ETH");
  const w=body.windows&&typeof body.windows==="object"?body.windows:body;
  const windows={supplierInspection:seconds(w.supplierInspection,300,604800,"SUPPLIER_WINDOW_INVALID"),buyerInspection:seconds(w.buyerInspection,300,604800,"BUYER_WINDOW_INVALID"),buyerAcceptance:seconds(w.buyerAcceptance,300,604800,"ACCEPTANCE_WINDOW_INVALID"),primaryInspector:seconds(w.primaryInspector,300,604800,"PRIMARY_WINDOW_INVALID"),backupInspector:seconds(w.backupInspector,300,604800,"BACKUP_WINDOW_INVALID"),mutualResolution:seconds(w.mutualResolution,300,604800,"MUTUAL_WINDOW_INVALID"),externalArbitration:seconds(w.externalArbitration,300,604800,"ARBITRATION_WINDOW_INVALID")};
  const business={productName:cleanText(body.productName,2,100,"PRODUCT_NAME_INVALID"),productSku:cleanText(body.productSku,1,80,"PRODUCT_SKU_INVALID"),inspectionSubject:cleanText(body.inspectionSubject,5,500,"INSPECTION_SUBJECT_INVALID"),operatorReference:cleanText(body.operatorReference||"NO_EXTERNAL_REFERENCE",2,120,"OPERATOR_REFERENCE_INVALID")};
  const policyRiskAccepted=body.policyRiskAccepted===true;
  const approvalTimestamp=policyRiskAccepted?String(body.approvalTimestamp||""):null;
  if(policyRiskAccepted)assert(approvalTimestamp&&!Number.isNaN(Date.parse(approvalTimestamp)),"POLICY_APPROVAL_TIMESTAMP_INVALID");
  return {tradeId,roles,escrowEth,escrowAmount,windows,business,policyRiskAccepted,approvalTimestamp};
}

function buildDraft(input){
  const policy=clone(POLICY_TEMPLATE);
  policy.status=input.policyRiskAccepted?"PILOT_POLICY_OPERATOR_APPROVED_FOR_THIS_TRADE":"DRAFT_MODEL_B_NOT_APPROVED_FOR_ONCHAIN";
  policy.trade.tradeId=input.tradeId;policy.trade.escrowAmountBaseUnits=input.escrowAmount.toString();policy.trade.escrowAmountWei=input.escrowAmount.toString();policy.trade.roles=clone(input.roles);
  policy.settlement.escrowAmountBaseUnits=input.escrowAmount.toString();policy.settlement.escrowAmountWei=input.escrowAmount.toString();
  policy.procedure.windowsSeconds=clone(input.windows);
  policy.business={...input.business,termsAuthoredBy:"OPERATOR_INPUT",physicalSpecimenIdentityEstablished:false};
  policy.governance=input.policyRiskAccepted?{decision:"EXPLICIT_OPERATOR_UI_ACCEPTANCE",acceptedAtUtc:input.approvalTimestamp,scope:"MODEL_B_PILOT_POLICY_RISK_FOR_THIS_TRADE",cryptographicSigner:null,limitation:"Local approval record; the subsequent MetaMask proposeTrade transaction is a separate approval."}:{decision:"USER_REVIEW_REQUIRED",acceptedAtUtc:null,scope:"MODEL_B_PILOT_POLICY_RISK_FOR_THIS_TRADE"};
  policy.hashing.policyHash=ZeroHash;
  const policyHash=hashObject(policy);
  const terms={tradeId:input.tradeId,...input.roles,escrowAmount:input.escrowAmount.toString(),policyVersion:2,policyHash,
    modelBundleHash:TEMPLATE_TERMS.modelBundleHash,captureProfileHash:TEMPLATE_TERMS.captureProfileHash,productSpecHash:TEMPLATE_TERMS.productSpecHash,
    requiredViewSetHash:TEMPLATE_TERMS.requiredViewSetHash,scoreSchemaId:TEMPLATE_TERMS.scoreSchemaId,thresholdScaled:String(TEMPLATE_TERMS.thresholdScaled),
    scoreScaleExponent:Number(TEMPLATE_TERMS.scoreScaleExponent),scoreMinScaled:String(TEMPLATE_TERMS.scoreMinScaled),scoreMaxScaled:String(TEMPLATE_TERMS.scoreMaxScaled),
    maxSupplierRetries:Number(TEMPLATE_TERMS.maxSupplierRetries),maxBuyerRetries:Number(TEMPLATE_TERMS.maxBuyerRetries),fallbackPolicy:clone(TEMPLATE_TERMS.fallbackPolicy),windows:clone(input.windows)};
  return {policy,policyHash,terms};
}

async function prepare(ctx,body){
  const input=normalize(body),{policy,policyHash,terms}=buildDraft(input);
  const [network,block,code,registryAddress,fee]=await Promise.all([ctx.provider.getNetwork(),ctx.provider.getBlock("latest"),ctx.provider.getCode(String(ctx.contract.target)),ctx.contract.credentialRegistry(),ctx.provider.getFeeData()]);
  const chainId=Number(network.chainId),registryReader=new Contract(registryAddress,["function authority() view returns(address)"],ctx.provider),authority=await registryReader.authority();
  assert(code!=="0x","PATCH3_RUNTIME_MISSING");
  assert(!Object.values(input.roles).some(x=>eq(x,authority)),"CREDENTIAL_AUTHORITY_ROLE_COLLISION");
  const registry=new Contract(registryAddress,["function status(address) view returns(uint8)"],ctx.provider);
  const credentialResults=await Promise.all(STATIONS.map(async key=>{const status=Number(await registry.status(input.roles[key]));return{role:key,address:input.roles[key],status,active:status===1};}));
  const allStationsActive=credentialResults.every(x=>x.active);
  let existing=false,existingState=0;try{existingState=Number(await ctx.contract.getTradeState(input.tradeId));existing=existingState!==0;}catch{}
  const supplierBalance=await ctx.provider.getBalance(input.roles.supplier);
  let staticCall="BLOCKED",gasEstimate=null,staticError=null;
  if(!existing&&allStationsActive){try{await ctx.contract.proposeTrade.staticCall(terms,{from:input.roles.supplier});staticCall="PASS";gasEstimate=String(await ctx.contract.proposeTrade.estimateGas(terms,{from:input.roles.supplier}));}catch(error){staticError=String(error.shortMessage||error.message||error).slice(0,260);}}
  const governanceStatus=input.policyRiskAccepted?"OPERATOR_ACCEPTED_PILOT_POLICY_RISK":"DRAFT_USER_REVIEW_REQUIRED";
  const technicalReady=!existing&&allStationsActive&&staticCall==="PASS"&&gasEstimate!==null;
  const broadcastReady=technicalReady&&input.policyRiskAccepted;
  const approvalRecord=input.policyRiskAccepted?{schema:"inspectescrow.policy-operator-approval/1",tradeId:input.tradeId,policyHash,decision:"ACCEPTED_FOR_MODEL_B_PILOT",acceptedAtUtc:input.approvalTimestamp,signerAddress:null,signature:null}:null;
  const approvalRecordHash=approvalRecord?hashObject(approvalRecord):null;
  return {ok:true,schema:"inspectescrow.dynamic-trade-preparation/1",source:chainId===11155111?"SEPOLIA_READ_ONLY_STATICCALL":"LOCAL_ANVIL_STATICCALL",chainId,contract:String(ctx.contract.target),credentialRegistry:registryAddress,blockNumber:block.number,
    tradeId:input.tradeId,governanceStatus,technicalReady,broadcastReady,staticCall,gasEstimate,staticError,existing,existingState,
    policyHash,policyDocument:policy,tradeTerms:terms,approvalRecord,approvalRecordHash,credentials:credentialResults,allStationsActive,
    supplier:{address:input.roles.supplier,balanceWei:supplierBalance.toString(),balanceEth:formatEther(supplierBalance)},escrowEth:input.escrowEth,
    estimatedFee:{maxFeeGwei:fee.maxFeePerGas?formatUnits(fee.maxFeePerGas,"gwei"):null,estimatedMaxGasCostWei:fee.maxFeePerGas&&gasEstimate?(fee.maxFeePerGas*BigInt(gasEstimate)).toString():null},
    fixedCommitments:{modelBundleHash:terms.modelBundleHash,captureProfileHash:terms.captureProfileHash,productSpecHash:terms.productSpecHash,requiredViewSetHash:terms.requiredViewSetHash,scoreSchemaId:terms.scoreSchemaId,thresholdScaled:terms.thresholdScaled},
    blockers:[...(existing?["TRADE_ID_ALREADY_EXISTS"]:[]),...(!allStationsActive?["STATION_CREDENTIAL_NOT_ACTIVE"]:[]),...(staticCall!=="PASS"?["PROPOSE_STATICCALL_FAILED"]:[]),...(!input.policyRiskAccepted?["EXPLICIT_POLICY_RISK_ACCEPTANCE_REQUIRED"]:[])],
    proposeABI:PROPOSE_ABI,transactionsSent:0,serverStoresDraft:false};
}

async function defaults(ctx){const network=await ctx.provider.getNetwork(),registry=await ctx.contract.credentialRegistry(),chainId=Number(network.chainId);let roles=Object.fromEntries([...ACTORS,...STATIONS].map(k=>[k,TEMPLATE_TERMS[k]]));if(chainId!==11155111){const accounts=await ctx.provider.send("eth_accounts",[]);assert(accounts.length>=11,"LOCAL_ANVIL_REQUIRES_11_ACCOUNTS");roles={supplier:accounts[1],buyer:accounts[2],primaryInspector:accounts[3],backupInspector:accounts[4],externalArbitrator:accounts[5],supplierStation:accounts[6],buyerStation:accounts[7],primaryInspectorStation:accounts[8],backupInspectorStation:accounts[9],externalArbitratorStation:accounts[10]};}return {ok:true,chainId,contract:String(ctx.contract.target),credentialRegistry:registry,roles,escrowEth:"0.001",windows:clone(TEMPLATE_TERMS.windows),fixedCommitments:{modelBundleHash:TEMPLATE_TERMS.modelBundleHash,captureProfileHash:TEMPLATE_TERMS.captureProfileHash,productSpecHash:TEMPLATE_TERMS.productSpecHash,requiredViewSetHash:TEMPLATE_TERMS.requiredViewSetHash,scoreSchemaId:TEMPLATE_TERMS.scoreSchemaId,thresholdScaled:String(TEMPLATE_TERMS.thresholdScaled)},policyTemplateStatus:"DRAFT_MODEL_B_NOT_APPROVED_FOR_ONCHAIN",limits:{escrowEthMin:"0.0001",escrowEthMax:"0.1",windowSecondsMin:300,windowSecondsMax:604800},transactionsSent:0};}
const send=(res,status,value)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));};
async function handle(req,res,ctx,url){
 if(url.pathname==="/api/trade-builder/defaults"&&req.method==="GET")return send(res,200,await defaults(ctx));
 if(url.pathname==="/api/trade-builder/prepare"&&req.method==="POST"){
  if(req.headers.origin&&req.headers.origin!=="http://"+req.headers.host)return send(res,403,{ok:false,error:"ORIGIN_REJECTED"});
  if(req.headers["x-inspectescrow-local"]!=="1"||!String(req.headers["content-type"]||"").startsWith("application/json"))return send(res,403,{ok:false,error:"LOCAL_JSON_HEADER_REQUIRED"});
  try{return send(res,200,await prepare(ctx,await readBody(req)));}catch(error){return send(res,422,{ok:false,error:String(error.shortMessage||error.message||error).slice(0,300),transactionsSent:0});}
 }
 return send(res,405,{error:"METHOD_OR_ROUTE_NOT_ALLOWED"});
}
module.exports={handle,prepare,defaults,normalize,buildDraft,PROTECTED};
