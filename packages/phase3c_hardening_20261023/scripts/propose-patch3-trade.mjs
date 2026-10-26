// PATCH3 exact-policy trade proposal. READ-ONLY by default.
// --broadcast additionally requires Supplier key + explicit phrase.
// Run ONLY from repo root. Do not retry broadcast automatically after errors.
import fs from 'node:fs';
import {
  Contract, JsonRpcProvider, Wallet, getAddress, keccak256, toUtf8Bytes,
  id, formatEther
} from 'ethers';

const pkg='packages/phase3c_hardening_20261023';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const requireTrue=(condition,message)=>{if(!condition)throw new Error(message);};
const broadcast=process.argv.slice(2).includes('--broadcast');
requireTrue(process.argv.slice(2).every(x=>x==='--broadcast'),'Unrecognized option');
const rpc=process.env.PATCH3_RPC_URL;
requireTrue(typeof rpc==='string' && /^https:\/\//.test(rpc),'PATCH3_RPC_URL must be HTTPS');
const manifest=read(`${pkg}/results/PATCH3_SEPOLIA_DEPLOYMENT.json`);
const input=read(`${pkg}/policy/PATCH3_POLICY_INPUT.json`);
const policy=read(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_FINAL.json`);
const commitment=read(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json`);
const preimage=fs.readFileSync(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json`,'utf8').trimEnd();
const abi=read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const r=policy.trade.roles;
requireTrue(manifest.status==='DEPLOYED_AND_READBACK_VERIFIED' && manifest.chainId===11155111,'Deployment manifest not verified Sepolia');
requireTrue(addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905'),'Escrow address differs from verified PATCH3 deployment');
requireTrue(input.tradeId===policy.trade.tradeId && input.tradeId===commitment.tradeId,'TradeId mismatch');
requireTrue(policy.policyVersion===2 && commitment.policyVersion===2 && input.escrowAmountWei==='5000000000000000','Frozen trade settings mismatch');
requireTrue(commitment.selfHashRecomputation===true && commitment.policyHash===policy.hashing.policyHash,'Policy commitment invalid');
requireTrue(keccak256(toUtf8Bytes(preimage))===commitment.policyHash,'Policy JCS hash mismatch');
requireTrue(getAddress(policy.trade.verifyingContract)===addr && getAddress(input.verifyingContract)===addr,'Escrow pointer mismatch');
requireTrue(getAddress(input.credentialRegistry)===getAddress(manifest.contracts.CredentialRegistryPatch3.address),'Registry pointer mismatch');
for(const role of Object.keys(r)){
  requireTrue(getAddress(r[role])===getAddress(input.roles[role]),'Role mismatch '+role);
}
const outcomes={RELEASE_TO_SUPPLIER:1,REFUND_TO_BUYER:2};
const convertOutcome=v=>{
  requireTrue(Object.hasOwn(outcomes,v),'Unexpected settlement fallback '+v);
  return outcomes[v];
};
const ai=policy.ai,capture=policy.capture,prod=policy.product,win=input.windowsSeconds,fp=input.fallbackPolicy;
const terms={
  tradeId:input.tradeId,
  supplier:r.supplier,
  buyer:r.buyer,
  primaryInspector:r.primaryInspector,
  backupInspector:r.backupInspector,
  externalArbitrator:r.externalArbitrator,
  supplierStation:r.supplierStation,
  buyerStation:r.buyerStation,
  primaryInspectorStation:r.primaryInspectorStation,
  backupInspectorStation:r.backupInspectorStation,
  externalArbitratorStation:r.externalArbitratorStation,
  escrowAmount:BigInt(input.escrowAmountWei),
  policyVersion:2,
  policyHash:commitment.policyHash,
  modelBundleHash:ai.modelBundleHash,
  captureProfileHash:capture.captureProfileHash,
  productSpecHash:prod.productSpecificationHash,
  requiredViewSetHash:capture.requiredViewSetHash,
  scoreSchemaId:ai.scoreSchemaId,
  thresholdScaled:BigInt(ai.thresholdScaled),
  scoreScaleExponent:Number(ai.scoreScaleExponent),
  scoreMinScaled:BigInt(ai.scoreMinimumScaled),
  scoreMaxScaled:BigInt(ai.scoreMaximumScaled),
  maxSupplierRetries:Number(policy.procedure.maxSupplierRetries),
  maxBuyerRetries:Number(policy.procedure.maxBuyerRetries),
  fallbackPolicy:{
    buyerInspectionTimeout:convertOutcome(fp.buyerInspectionTimeout),
    executionHold:convertOutcome(fp.executionHold),
    evidenceHold:convertOutcome(fp.evidenceHold),
    inspectorEscalated:convertOutcome(fp.inspectorEscalated)
  },
  windows:{
    supplierInspection:win.supplierInspection,
    buyerInspection:win.buyerInspection,
    buyerAcceptance:win.buyerAcceptance,
    primaryInspector:win.primaryInspector,
    backupInspector:win.backupInspector,
    mutualResolution:win.mutualResolution,
    externalArbitration:win.externalArbitration
  }
};
const provider=new JsonRpcProvider(rpc);
requireTrue((await provider.getNetwork()).chainId===11155111n,'RPC not on Sepolia');
const onchainCode=await provider.getCode(addr);
requireTrue(onchainCode!=='0x' && keccak256(onchainCode)===manifest.contracts.InspectEscrowPatch3.runtimeCodeHash,'Escrow bytecode hash mismatch');
const escrow=new Contract(addr,abi,provider);
let notFound=false;
try{const state=await escrow.getTradeState(input.tradeId); throw Error('Trade already exists at state '+String(state));}
catch(e){
  if(e.message?.startsWith('Trade already exists'))throw e;
  const data=e?.data??e?.error?.data??e?.info?.error?.data;
  notFound=e?.revert?.name==='TradeNotFound'||(typeof data==='string' && data.slice(0,10).toLowerCase()===id('TradeNotFound()').slice(0,10).toLowerCase());
  requireTrue(notFound,'Unable to prove unused tradeId (fail-closed): '+(e?.shortMessage??e?.message));
}
requireTrue(await escrow.accountingConserved(),'Accounting invariant failed');
requireTrue(await escrow.balanceCoversLiabilities(),'Liability coverage failed');
await escrow.proposeTrade.staticCall(terms,{from:r.supplier});
const estimatedGas=await escrow.proposeTrade.estimateGas(terms,{from:r.supplier});
const gasLimit=estimatedGas*125n/100n+1n;
const fee=await provider.getFeeData();
const feeCeiling=fee.maxFeePerGas??fee.gasPrice;
requireTrue(feeCeiling!=null && feeCeiling>0n,'Cannot estimate gas fee ceiling');
const supplierBalance=await provider.getBalance(r.supplier);
const maximumFeeBudget=gasLimit*feeCeiling;
requireTrue(supplierBalance>=maximumFeeBudget,'Insufficient Supplier Sepolia ETH for conservative proposal gas budget');
console.log(JSON.stringify({
  status:'PASS_READ_ONLY_PROPOSE_PRECHECK',
  chainId:11155111,
  escrow:addr,
  tradeId:input.tradeId,
  policyHash:terms.policyHash,
  policyVersion:terms.policyVersion,
  escrowAmountWei:terms.escrowAmount.toString(),
  supplier:r.supplier,
  supplierBalanceEth:formatEther(supplierBalance),
  estimatedGas:estimatedGas.toString(),
  proposedGasLimit:gasLimit.toString(),
  currentMaxFeePerGasWei:feeCeiling.toString(),
  conservativeMaxFeeEth:formatEther(maximumFeeBudget),
  broadcastRequested:broadcast,
  transactionsSent:0
},null,2));
if(!broadcast){
  console.log('READ-ONLY PROPOSE CHECK COMPLETE. No transaction was sent.');
  process.exit(0);
}
requireTrue(process.env.PATCH3_PROPOSE_CONFIRM==='PROPOSE_PATCH3_TRADE','Explicit proposal confirmation missing (no tx sent)');
const key=process.env.PATCH3_SUPPLIER_PRIVATE_KEY;
requireTrue(typeof key==='string' && /^0x[0-9a-fA-F]{64}$/.test(key),'Supplier private key must be a 0x-prefixed 32-byte hex string (not logged)');
let signer;
try{signer=new Wallet(key,provider);}catch{throw Error('Cannot derive Supplier signer (secret not printed)');}
requireTrue(getAddress(signer.address)===getAddress(r.supplier),'Signer is not frozen Supplier address');
requireTrue((await provider.getNetwork()).chainId===11155111n,'Sepolia chain changed');
await escrow.proposeTrade.staticCall(terms,{from:r.supplier});
const writer=new Contract(addr,abi,signer);
const tx=await writer.proposeTrade(terms,{gasLimit});
console.log(JSON.stringify({
  status:'PROPOSE_TRANSACTION_SENT',
  transactionHash:tx.hash,
  explorer:'https://sepolia.etherscan.io/tx/'+tx.hash,
  note:'Do not retry if receipt query errors; inspect hash and getTradeState first.'
},null,2));
const receipt=await tx.wait(1);
requireTrue(receipt && Number(receipt.status)===1,'Proposal transaction failed; inspect tx hash; do not retry');
const state=await escrow.getTradeState(input.tradeId);
requireTrue(Number(state)===1,'Post-proposal readback is not PROPOSED, got '+String(state));
console.log(JSON.stringify({
  status:'PATCH3_PROPOSE_CONFIRMED',
  transactionHash:tx.hash,
  blockNumber:receipt.blockNumber,
  tradeId:input.tradeId,
  tradeState:'PROPOSED',
  policyHash:terms.policyHash
},null,2));
