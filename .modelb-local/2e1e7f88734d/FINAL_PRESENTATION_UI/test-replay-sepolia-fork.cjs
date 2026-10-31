"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {Contract,JsonRpcProvider,keccak256}=require("ethers");

const project=path.resolve(__dirname,"..","..","..");
const abi=JSON.parse(fs.readFileSync(path.join(project,".patch3-build","InspectEscrowPatch3.sol_InspectEscrowPatch3.abi"),"utf8"));
const contractAddress="0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905";
const completed="0x2e1e7f88734dc4bf2b1fee924192a11311846a4351b86497d5c43670fa173d9e";
const reviewCandidate="0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff";
const protectedLegacy="0x8e07587390de665a8a3c0fe81e1e7298541847acd244db5ea98e5dc3acb3f9db";
const supplierEvidence="0x103703f43d657264d5d5d4f29d14b47a021f47fe3c80787b6e0a57764ead8c75";
const buyerEvidence="0x4e79ad908aa98cf4b3b44e255f733cdfe08db7de30d6af5ee3c087bb79fef555";
const provider=new JsonRpcProvider("http://127.0.0.1:18549",11155111,{staticNetwork:true,cacheTimeout:-1});
const contract=new Contract(contractAddress,abi,provider);
const checks=[];
const add=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),detail:String(detail)});

async function main(){
  const [network,block,code,completedState,candidateState,legacyState,supplier,buyer,replay,conserved,covered]=await Promise.all([
    provider.getNetwork(),provider.getBlock("latest"),provider.getCode(contractAddress),
    contract.getTradeState(completed),contract.getTradeState(reviewCandidate),contract.getTradeState(protectedLegacy),
    contract.getInspection(completed,0),contract.getInspection(completed,1),contract.getReplay(completed),
    contract.accountingConserved(),contract.balanceCoversLiabilities()
  ]);
  add("01_FORK_CHAIN_ID",Number(network.chainId)===11155111,network.chainId);
  add("02_PATCH3_RUNTIME_PRESENT",code.length>1000,keccak256(code));
  add("03_COMPLETED_S05_RELEASED",Number(completedState)===17,completedState);
  add("04_SUPPLIER_EVIDENCE_ANCHOR",String(supplier.evidencePackageHash).toLowerCase()===supplierEvidence,String(supplier.evidencePackageHash));
  add("05_BUYER_EVIDENCE_ANCHOR",String(buyer.evidencePackageHash).toLowerCase()===buyerEvidence,String(buyer.evidencePackageHash));
  add("06_COMPLETED_TRADE_REPLAY_UNUSED",Number(replay[0])===0,replay[0]);
  add("07_REVIEW_CANDIDATE_PROPOSED",Number(candidateState)===1,candidateState);
  add("08_PROTECTED_MODEL_A_STILL_FUNDED",Number(legacyState)===4,legacyState);
  add("09_ACCOUNTING_CONSERVED",conserved===true,conserved);
  add("10_BALANCE_COVERS_LIABILITIES",covered===true,covered);
  const result={suite:"INSPECTESCROW_2C_SEPOLIA_STATE_FORK_READ_ONLY",generatedAtUtc:new Date().toISOString(),scope:"LOCAL_ANVIL_FORK_OF_SEPOLIA_READ_ONLY_CALLS",forkBlockNumber:block.number,chainId:Number(network.chainId),contract:contractAddress,runtimeHash:keccak256(code),checksPassed:checks.filter(x=>x.pass).length,checksTotal:checks.length,allPass:checks.every(x=>x.pass),localForkTransactions:0,actualSepoliaTransactions:0,checks};
  fs.writeFileSync(path.join(__dirname,"INSPECTOR_REPLAY_SEPOLIA_FORK_RESULTS.json"),JSON.stringify(result,null,2)+"\n","utf8");
  console.log(JSON.stringify(result,null,2));
  if(!result.allPass)process.exitCode=1;
}

main().catch(error=>{console.error(error);process.exitCode=1;});
