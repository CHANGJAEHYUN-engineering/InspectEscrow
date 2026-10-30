// InspectEscrow PATCH3: exact 0.005 Sepolia ETH Buyer funding.
// DEFAULT IS READ-ONLY. --broadcast requires the frozen Buyer key and explicit confirmation.
// This script deliberately NEVER calls activate(): FUNDED is separate from AWAIT_SUPPLIER.
import fs from 'node:fs';
import {
  Contract, JsonRpcProvider, Wallet, getAddress,
  keccak256, toUtf8Bytes, formatEther
} from 'ethers';

const pkg='packages/phase3c_hardening_20261023';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const must=(test,msg)=>{if(!test)throw Error(msg);};
const args=process.argv.slice(2);
must(args.length===0||(args.length===1&&args[0]==='--broadcast'),
  'Only optional --broadcast is supported');
const broadcast=args.length===1;
const rpc=process.env.PATCH3_RPC_URL;
must(typeof rpc==='string'&&/^https:\/\//.test(rpc),
  'PATCH3_RPC_URL must be set to an HTTPS Sepolia RPC');
const manifest=read(`${pkg}/results/PATCH3_SEPOLIA_DEPLOYMENT.json`);
const input=read(`${pkg}/policy/PATCH3_POLICY_INPUT.json`);
const policy=read(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_FINAL.json`);
const commitment=read(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json`);
const preimage=fs.readFileSync(`${pkg}/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json`,'utf8').trimEnd();
const escrowAbi=read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const registryAbi=read('.patch3-build/CredentialRegistryPatch3.sol_CredentialRegistryPatch3.abi');
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const registryAddr=getAddress(manifest.contracts.CredentialRegistryPatch3.address);
const tradeId=input.tradeId;
const buyer=getAddress(input.roles.buyer);
const escrowAmount=BigInt(input.escrowAmountWei);
must(manifest.status==='DEPLOYED_AND_READBACK_VERIFIED'&&manifest.chainId===11155111&&input.chainId===11155111,
  'Frozen Sepolia deployment manifest mismatch');
must(addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905'),
  'Escrow address differs from verified PATCH3 deployment');
must(policy.policyVersion===2&&commitment.policyVersion===2 &&
  policy.trade.tradeId===tradeId&&commitment.tradeId===tradeId,
  'Policy or Trade ID mismatch');
must(commitment.selfHashRecomputation===true &&
  keccak256(toUtf8Bytes(preimage))===commitment.policyHash &&
  policy.hashing.policyHash===commitment.policyHash,
  'Frozen canonical policy JCS hash mismatch');
must(escrowAmount===5000000000000000n&&policy.trade.escrowAmountWei===input.escrowAmountWei,
  'Exact demo escrow amount must be 0.005 ETH');
must(getAddress(input.verifyingContract)===addr &&
  getAddress(policy.trade.verifyingContract)===addr &&
  getAddress(input.credentialRegistry)===registryAddr,
  'Contract and policy pointers mismatch');
must(getAddress(policy.trade.roles.buyer)===buyer,'Frozen Buyer mismatch');

const provider=new JsonRpcProvider(rpc);
must((await provider.getNetwork()).chainId===11155111n,'RPC network is not Sepolia');
for(const [name,address,hash] of [
  ['Escrow',addr,manifest.contracts.InspectEscrowPatch3.runtimeCodeHash],
  ['Registry',registryAddr,manifest.contracts.CredentialRegistryPatch3.runtimeCodeHash]
]){
  const code=await provider.getCode(address);
  must(code!=='0x'&&keccak256(code)===hash,name+' bytecode hash differs from deployment manifest');
}
const escrow=new Contract(addr,escrowAbi,provider);
const registry=new Contract(registryAddr,registryAbi,provider);
const terms=await escrow.getTradeTerms(tradeId);
const state=Number(await escrow.getTradeState(tradeId));
must(state===3,'Trade state must be INSPECTORS_ACCEPTED (3); got '+state+
  '. Do not attempt to fund again if already funded.');
must(getAddress(terms.buyer)===buyer,'On-chain Buyer address mismatch');
must(Number(terms.policyVersion)===2&&terms.policyHash===commitment.policyHash,
  'On-chain policy mismatch');
must(terms.escrowAmount===escrowAmount,'On-chain funded amount mismatch');
for(const role of ['supplierStation','buyerStation','primaryInspectorStation','backupInspectorStation','externalArbitratorStation']){
  must(getAddress(terms[role])===getAddress(input.roles[role]),'Frozen '+role+' mismatch');
  must(Number(await registry.status(input.roles[role]))===1,role+' credential not ACTIVE');
}
const before={
  totalFunded:await escrow.totalFunded(),
  unsettledEscrow:await escrow.unsettledEscrow(),
  outstandingClaimable:await escrow.outstandingClaimable(),
  totalWithdrawn:await escrow.totalWithdrawn(),
  escrowBalance:await provider.getBalance(addr)
};
must(await escrow.accountingConserved(),'Accounting invariant failed before funding');
must(await escrow.balanceCoversLiabilities(),'Liability coverage failed before funding');
await escrow.fund.staticCall(tradeId,{from:buyer,value:escrowAmount});
const estimatedGas=await escrow.fund.estimateGas(tradeId,{from:buyer,value:escrowAmount});
const gasLimit=estimatedGas*125n/100n+1n;
must(gasLimit<=500000n,'Gas estimate > 500000; investigate before sending');
const fee=await provider.getFeeData();
const feeCeiling=fee.maxFeePerGas??fee.gasPrice;
must(feeCeiling!=null&&feeCeiling>0n,'Gas fee ceiling is unavailable');
const gasBudget=gasLimit*feeCeiling;
const balance=await provider.getBalance(buyer);
must(balance>=escrowAmount+gasBudget,
  'Buyer balance cannot cover 0.005 ETH plus fee budget');
console.log(JSON.stringify({
  status:'PASS_READ_ONLY_FUND_PRECHECK',
  chainId:11155111,
  escrow:addr,
  tradeId,
  policyHash:commitment.policyHash,
  onchainStateBefore:state,
  buyer,
  buyerBalanceEth:formatEther(balance),
  exactValueWei:escrowAmount.toString(),
  exactValueEth:formatEther(escrowAmount),
  estimatedGas:estimatedGas.toString(),
  proposedGasLimit:gasLimit.toString(),
  maxFeePerGasWei:feeCeiling.toString(),
  conservativeFeeBudgetEth:formatEther(gasBudget),
  stationCredentials:'5_ACTIVE',
  accountingBefore:'PASS',
  broadcastRequested:broadcast,
  transactionsSent:0,
  activateCalled:false,
  caution:'After funding, anyone can call activate; fund only when ready to proceed soon.'
},null,2));
if(!broadcast){
  console.log('READ-ONLY FUND PRECHECK COMPLETE. No transaction sent; no ETH deposited.');
  process.exit(0);
}
must(process.env.PATCH3_FUND_CONFIRM==='FUND_PATCH3_0_005_SEPOLIA_ETH',
  'Exact confirmation FUND_PATCH3_0_005_SEPOLIA_ETH is required');
const key=process.env.PATCH3_BUYER_PRIVATE_KEY;
must(typeof key==='string'&&/^0x[0-9a-fA-F]{64}$/.test(key),
  'PATCH3_BUYER_PRIVATE_KEY must be a local 0x-prefixed 32-byte key (not printed)');
let signer;
try{signer=new Wallet(key,provider);}catch{throw Error('Buyer wallet key invalid (key not printed)');}
must(getAddress(signer.address)===buyer,'Provided key does not derive frozen Buyer address');
must((await provider.getNetwork()).chainId===11155111n,'Network changed from Sepolia');
must(Number(await escrow.getTradeState(tradeId))===3,'Trade state changed; no transaction sent');
await escrow.fund.staticCall(tradeId,{from:buyer,value:escrowAmount});
const writer=new Contract(addr,escrowAbi,signer);
const tx=await writer.fund(tradeId,{value:escrowAmount,gasLimit});
console.log(JSON.stringify({
  status:'FUND_TRANSACTION_SENT',
  transactionHash:tx.hash,
  explorer:'https://sepolia.etherscan.io/tx/'+tx.hash,
  caution:'Do not rerun --broadcast on pending/unknown receipt. Check tx hash first.'
},null,2));
const receipt=await tx.wait(1);
must(receipt&&Number(receipt.status)===1,
  'Funding receipt failed/unavailable; inspect hash before retrying');
const fundedEvent=receipt.logs.some(log=>{
  try{
    const parsed=writer.interface.parseLog(log);
    return parsed?.name==='TradeFunded' &&
      parsed.args?.tradeId===tradeId &&
      getAddress(parsed.args?.buyer)===buyer &&
      parsed.args?.amount===escrowAmount;
  }catch{return false;}
});
must(fundedEvent,'TradeFunded event not found; inspect receipt before retry');
const afterState=Number(await escrow.getTradeState(tradeId));
const afterDeadline=await escrow.getActionDeadline(tradeId);
const afterTotalFunded=await escrow.totalFunded();
const afterUnsettled=await escrow.unsettledEscrow();
const afterEscrowBalance=await provider.getBalance(addr);
must(afterState===4,'Expected FUNDED(4), got '+afterState);
must(afterDeadline===0n,'Expected no inspection deadline before activate');
must(afterTotalFunded-before.totalFunded===escrowAmount,
  'totalFunded increment is not exact escrow amount');
must(afterUnsettled-before.unsettledEscrow===escrowAmount,
  'unsettledEscrow increment is not exact escrow amount');
must(afterEscrowBalance-before.escrowBalance===escrowAmount,
  'Contract native balance increment not exact escrow amount');
must(await escrow.accountingConserved(),'Accounting invariant failed after funding');
must(await escrow.balanceCoversLiabilities(),'Liability coverage failed after funding');
console.log(JSON.stringify({
  status:'PATCH3_FUND_CONFIRMED',
  transactionHash:tx.hash,
  blockNumber:receipt.blockNumber,
  tradeId,
  newState:afterState,
  newStateLabel:'FUNDED',
  depositedWei:escrowAmount.toString(),
  inspectionDeadline:afterDeadline.toString(),
  accountingConserved:true,
  balanceCoversLiabilities:true,
  activateCalled:false
},null,2));
