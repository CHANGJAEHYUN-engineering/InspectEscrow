"use strict";
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"roles.js"),"utf8");
const expected="0xaE7B8A9B15534829492F9449a67e83aAbd82E7BE",buyer="0x5B52D3B71dD5B4637B828Fd2a0e8bC78346709eE";
const TRADE="0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff";
const base={source:"LIVE_SEPOLIA_READ_ONLY",verifiedAt:new Date().toISOString(),blockNumber:12020599,chainId:11155111,contract:"0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905",tradeId:TRADE,state:1,stateName:"PROPOSED",policyHash:"0x"+"a".repeat(64),escrowAmountWei:"1000000000000000",escrowEth:"0.001",accountConserved:true,balanceCoversLiabilities:true,roles:[{id:"supplier",label:"Supplier",actor:expected},{id:"buyer",label:"Buyer",actor:buyer},{id:"primaryInspector",label:"Primary Inspector",actor:"0xb60F55bC142a078781199C6a1689Bd7a86d4f6a8"},{id:"backupInspector",label:"Backup Inspector",actor:"0xeE9652D5F77ffee10aFeb7854E88f7B83bDAF7dd"},{id:"externalArbitrator",label:"External Arbitrator",actor:"0x9E3bA22795068b82B3D7C2A998cd40294520c8Ce"}],actions:[{id:"supplier-policy",role:"supplier",label:"Supplier 정책 수락",func:"acceptPolicy",status:"READY",estimatedGas:"35136"},{id:"buyer-policy",role:"buyer",label:"Buyer 정책 수락",func:"acceptPolicy",status:"READY",estimatedGas:"37165"},{id:"primary-accept",role:"primaryInspector",func:"acceptInspectorAssignment",status:"WAITING"},{id:"backup-accept",role:"backupInspector",func:"acceptInspectorAssignment",status:"WAITING"},{id:"external-accept",role:"externalArbitrator",func:"acceptInspectorAssignment",status:"WAITING"},{id:"buyer-fund",role:"buyer",func:"fund",status:"WAITING"},{id:"supplier-activate",role:"supplier",func:"activate",status:"WAITING"}]};
const ids=["roles-output","roles-actions","roles-trade-state","roles-trade-short","roles-policy-status","roles-accounting-status","roles-last-block","roles-wallet-address","roles-wallet-role","roles-selected-hint","roles-ack","roles-execute","roles-connect","roles-reload","roles-rescan"];
function mk(tag="div"){return{tag,children:[],listeners:{},style:{},disabled:false,checked:false,className:"",_text:"",
 set textContent(s){this._text=String(s);this.children=[];},
 get textContent(){return this._text;},
 append(...nodes){this.children.push(...nodes);},
 addEventListener(n,cb){this.listeners[n]=cb;},
 scrollIntoView(){}};}
async function runCase(name,opts){
 const dom=Object.fromEntries(ids.map(id=>[id,mk()]));let contracts=0,requests=0;const wallet=opts.noWallet?null:{isMetaMask:true,async request({method}){requests++;if(method==="eth_requestAccounts"||method==="eth_accounts")return [opts.address||expected];if(method==="eth_chainId")return opts.chain||"0xaa36a7";throw Error("Unexpected "+method);},on(){}};
 const w={ethereum:wallet,ethers:{getAddress:s=>s,BrowserProvider:class{constructor(){}},Contract:class{constructor(){contracts++;throw Error("EXPLICIT_TX_NOT_EXPECTED")}}},confirm(){return false;}};
 const storage=new Map([["inspectescrow.activeTrade.v1",TRADE]]);w.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};w.location={search:"?tradeId="+TRADE,hash:"#roles"};
 const ctx={window:w,localStorage:w.localStorage,location:w.location,URL,URLSearchParams,document:{getElementById:id=>{if(!dom[id])throw Error("missing "+id);return dom[id];},createElement:mk,querySelector:()=>null},fetch:async()=>({ok:true,json:async()=>JSON.parse(JSON.stringify(base))}),AbortSignal:{timeout:()=>null},console,Date,Number,String,BigInt,Object,Array,Error,Promise};
 vm.runInNewContext(code,ctx,{filename:"roles.js"});
 await new Promise(resolve=>setTimeout(resolve,7));
 if(!dom["roles-execute"].disabled)throw Error(name+" unexpected unlocked submit without wallet");
 if(dom["roles-actions"].children.length!==7)throw Error(name+" cards missing");
 await dom["roles-connect"].listeners.click();
 const enabled=dom["roles-actions"].children.map(x=>({name:x.children.find(y=>y.tag==="h4").textContent,button:x.children.find(y=>y.className==="role-task-footer").children.find(z=>z.tag==="button").disabled}));
 const mine=enabled.filter(x=>!x.button).map(x=>x.name);
 const want=opts.noWallet||opts.address==="0x0000000000000000000000000000000000000001"||opts.chain==="0x1"?0:1;
 if(mine.length!==want)throw Error(name+" wrong action count "+JSON.stringify(mine));
 if(contracts!==0)throw Error(name+" unexpectedly constructed transaction contract");
 if(want){
  const card=dom["roles-actions"].children.find(x=>x.children.find(y=>y.className==="role-task-footer").children.find(z=>z.tag==="button").disabled===false);
  card.children.find(y=>y.className==="role-task-footer").children.find(z=>z.tag==="button").listeners.click();
  if(!dom["roles-execute"].disabled)throw Error(name+" transaction button enabled without explicit checkbox");
  dom["roles-ack"].checked=true;dom["roles-ack"].listeners.change();
  if(dom["roles-execute"].disabled)throw Error(name+" transaction button not enabled after role + consent");
 }
 return{name,unlockedSteps:mine,connectOutput:dom["roles-output"].textContent.slice(0,180),contractsConstructed:contracts};
}
(async()=>{
 const out=[];
 out.push(await runCase("SUPPLIER_ROLE",{address:expected}));
 out.push(await runCase("BUYER_ROLE",{address:buyer}));
 out.push(await runCase("UNKNOWN_ROLE",{address:"0x0000000000000000000000000000000000000001"}));
 out.push(await runCase("WRONG_CHAIN",{address:expected,chain:"0x1"}));
 out.push(await runCase("NO_EXTENSION",{noWallet:true}));
 console.log(JSON.stringify({scenarios:out,allPass:true,actualTransactionsSent:0},null,2));
})().catch(err=>{console.error(err.stack||err.message);process.exitCode=1});
