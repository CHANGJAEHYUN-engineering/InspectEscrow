"use strict";
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"proposal.js"),"utf8");
const expected="0xaE7B8A9B15534829492F9449a67e83aAbd82E7BE";
const candidate={
  ready:true,chainId:11155111,
  contract:"0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905",
  supplier:expected,policyHash:"0x"+"1".repeat(64),tradeId:"0x"+"2".repeat(64),
  roles:[],actorBalances:[],escrowETH:"0.001",proposalCall:"PASS",allStationsActive:true,
  gasEstimate:"2957891",currentState:null,latestBlock:12020462,
  verifiedAt:new Date().toISOString()
};
const observed=[];
function mockElements(){
  const els={};const add=id=>{els[id]={id,textContent:"",innerHTML:"",disabled:false,checked:false,
    className:"",style:{},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}};};
  for(const id of ["proposal-output","proposal-wallet-hint","proposal-send","proposal-connect","proposal-verify","proposal-refresh","proposal-roles","proposal-id","proposal-policy","proposal-contract","proposal-deposit","proposal-expected-actor","proposal-eligibility","proposal-static","proposal-stations","proposal-gas","proposal-state","proposal-block","proposal-wallet-account","proposal-ack-roles","proposal-ack-separate","proposal-ack-testnet"])add(id);
  return els;
}
async function scenario(name,options){
 const els=mockElements();
 const eth=options.noMetaMask?undefined:{
   isMetaMask:true,
   async request({method}){
     if(method==="eth_requestAccounts"||method==="eth_accounts"){
       if(options.reject)return Promise.reject({code:4001,message:"User rejected"});
       return [options.account||expected];
     }
     if(method==="eth_chainId")return options.chain||"0xaa36a7";
     throw Error("Unexpected method "+method);
   },
   on(){}
 };
 const w={ethereum:eth,ethers:{BrowserProvider:class{},getAddress:s=>s,
   Contract:class{constructor(){throw Error("This must not create or send a tx during connection");}}},confirm:()=>false};
 const ctx={window:w,document:{getElementById:id=>{if(!els[id])throw Error("Missing "+id);return els[id];}},
  fetch:async()=>options.preflightError?{ok:false,status:503,json:async()=>({error:"RPC fail"})}:{ok:true,json:async()=>candidate},
  console,Date,BigInt,Number,Error,String,Object,Array};
 vm.runInNewContext(source,ctx,{filename:"proposal.js"});
 await new Promise(res=>setTimeout(res,1));
 await els["proposal-connect"].listeners.click();
 const result={name,hint:els["proposal-wallet-hint"].textContent,
    account:els["proposal-wallet-account"].textContent,
    output:els["proposal-output"].textContent,
    sendDisabled:els["proposal-send"].disabled};
 observed.push(result);
 if(!result.sendDisabled)throw Error(name+" exposed send button");
 if(!options.expected || !result.hint.includes(options.expected))throw Error(name+" diagnostic mismatch "+JSON.stringify(result));
}
(async()=>{
 await scenario("CORRECT_METAMASK_SUPPLIER",{expected:"확인 완료"});
 await scenario("WRONG_ACCOUNT",{account:"0x5B52D3B71dD5B4637B828Fd2a0e8bC78346709eE",expected:"Supplier Actor"});
 await scenario("WRONG_NETWORK",{chain:"0x1",expected:"Sepolia"});
 await scenario("USER_REJECTED",{reject:true,expected:"거절했습니다"});
 await scenario("MISSING_EXTENSION",{noMetaMask:true,expected:"MetaMask가 감지되지"});
 await scenario("PREFLIGHT_FAILED_NOT_WALLET",{preflightError:true,expected:"사전검증"});
 console.log(JSON.stringify({cases:observed.map(x=>({name:x.name,hint:x.hint,account:x.account,sendDisabled:x.sendDisabled})),all:true,txSent:0},null,2));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
