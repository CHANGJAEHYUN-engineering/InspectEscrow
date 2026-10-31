"use strict";
// Role-based UI only. Every permission and state transition is ultimately checked by the deployed Solidity contract.
(()=>{
const $=id=>document.getElementById(id);
const E=window.ethers;
let snapshot=null,connected=null,selected=null,busy=false,pendingTx=null,selectedProvider=null;
const tradeFromContext=()=>{const q=new URLSearchParams(location.search).get("tradeId");let saved="";try{const raw=localStorage.getItem("inspectescrow.activeTrade.v1")||"";saved=raw.startsWith("{")?JSON.parse(raw).tradeId:raw;}catch{}const id=q||saved;if(!/^0x[0-9a-fA-F]{64}$/.test(id||""))throw Error("선택된 Trade ID가 없습니다. 거래 목록 또는 새 거래 화면에서 거래를 선택하세요.");localStorage.setItem("inspectescrow.activeTrade.v1",id);return id;};
const eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const short=a=>a?String(a).slice(0,10)+"…"+String(a).slice(-8):"";
const actionNames={
 "supplier-policy":"공급자 정책 수락","buyer-policy":"구매자 정책 수락","primary-accept":"1차 Inspector 배정 수락",
 "backup-accept":"대체 Inspector 배정 수락","external-accept":"외부 중재자 배정 수락",
 "buyer-fund":"Buyer 예치금 납입","supplier-activate":"거래 활성화"
};
const statusNames={READY:"실행 가능",DONE:"완료",WAITING:"이전 단계 대기",BLOCKED:"시뮬레이션 차단"};
const events=[
 "event PolicyAccepted(bytes32 indexed tradeId,address indexed party,bytes32 policyHash)",
 "event InspectorAssignmentAccepted(bytes32 indexed tradeId,address indexed inspector,bytes32 policyHash)",
 "event TradeFunded(bytes32 indexed tradeId,address indexed buyer,uint256 amount)",
 "event TradeActivated(bytes32 indexed tradeId,uint64 supplierDeadline)"
];
const write=(str,kind="neutral")=>{const el=$("roles-output");el.textContent=str;el.className="review-result "+kind;};
const connectError=err=>{
 const code=err?.code??err?.info?.error?.code;
 if(code===4001||code==="ACTION_REJECTED")return"MetaMask 요청을 거절했습니다.";
 if(code===-32002)return"MetaMask에 이미 요청 창이 열려 있습니다. 해당 창을 먼저 확인하세요.";
 if(code===4100)return"이 사이트의 지갑 접근이 차단됐습니다. MetaMask 연결된 사이트에서 권한을 확인하세요.";
 return String(err?.shortMessage||err?.message||err||"UNKNOWN_ERROR").slice(0,260);
};
function currentRole(){
 if(!connected||!snapshot)return null;
 return snapshot.roles.find(r=>eq(r.actor,connected))||null;
}
function canExecute(){
 if(busy||!snapshot||!selected||!$("roles-ack").checked||!connected)return false;
 if(Date.now()-Date.parse(snapshot.verifiedAt)>60000)return false;
 const a=snapshot.actions.find(x=>x.id===selected);
 return !!a&&a.status==="READY"&&eq(snapshot.roles.find(r=>r.id===a.role)?.actor,connected)&&snapshot.accountConserved&&snapshot.balanceCoversLiabilities;
}
function toggles(){
 $("roles-execute").disabled=!canExecute();
 $("roles-connect").disabled=busy;
 $("roles-reload").disabled=busy;
 $("roles-rescan").disabled=busy;
}
function render(){
 if(!snapshot)return;
 const networkLabel=snapshot.chainId===11155111?"ETHEREUM SEPOLIA · TESTNET":"LOCAL ANVIL · TEST ONLY";
 const networkChip=document.querySelector(".network-chip");if(networkChip)networkChip.textContent=networkLabel;
 const executionPill=document.querySelector("#view-roles .pill-blue");if(executionPill)executionPill.textContent="ROLE-BASED EXECUTION · "+networkLabel;
 $("roles-trade-state").textContent=snapshot.stateName+" ("+snapshot.state+")";
 $("roles-trade-short").textContent=(snapshot.chainId===11155111?"Sepolia":"LOCAL ANVIL")+" 블록 #"+snapshot.blockNumber.toLocaleString("en-US");
 $("roles-policy-status").textContent=snapshot.policyHash===undefined?"오류":"해시 일치";
 $("roles-accounting-status").textContent=snapshot.accountConserved&&snapshot.balanceCoversLiabilities?"검증 PASS":"검증 실패";
 $("roles-last-block").textContent="BLOCK #"+Number(snapshot.blockNumber).toLocaleString("en-US");
 $("roles-wallet-address").textContent=connected||"연결되지 않음";
 const role=currentRole();
 $("roles-wallet-role").textContent=role?.label|| (connected?"등록되지 않은 계정":"지갑 연결 후 확인");
 const holder=$("roles-actions");holder.textContent="";
 for(const a of snapshot.actions){
   const card=document.createElement("article");
   const mine=!!role&&a.role===role.id;
   const stateClass=a.status==="DONE"?"done":a.status==="READY"?"ready":a.status==="BLOCKED"?"blocked":"waiting";
   card.className="panel role-task-card "+stateClass+(mine?" role-mine":"")+(selected===a.id?" selected":"");
   const top=document.createElement("div");top.className="role-task-top";
   const label=document.createElement("span");label.className="role-task-state";label.textContent=statusNames[a.status]||a.status;
   const roleTag=document.createElement("span");roleTag.className="role-task-role";roleTag.textContent=snapshot.roles.find(r=>r.id===a.role)?.label||a.role;
   top.append(label,roleTag);
   const h=document.createElement("h4");h.textContent=actionNames[a.id]||a.label;
   const technical=document.createElement("p");technical.className="role-task-function";
   technical.textContent=a.func+"() · "+(a.func==="fund"?snapshot.escrowEth+" 테스트 ETH 예치":"전송 ETH 0");
   const foot=document.createElement("div");foot.className="role-task-footer";
   const fee=document.createElement("small");fee.textContent=a.estimatedGas?Number(a.estimatedGas).toLocaleString("en-US")+" gas units":a.status==="DONE"?"온체인 완료":"실행 조건 검증 필요";
   const button=document.createElement("button");button.type="button";button.className="btn btn-outline role-task-button";
   button.textContent=a.status==="DONE"?"완료":mine&&a.status==="READY"?"이 단계 선택":"권한·상태 대기";
   button.disabled=!mine||a.status!=="READY"||busy;
   button.addEventListener("click",()=>{
      if(!mine||a.status!=="READY"||busy)return;
      selected=a.id;$("roles-ack").checked=false;render();
      $("roles-selected-hint").textContent=(actionNames[a.id]||a.label)+" · "+role.label+" · "+(a.func==="fund"?"Buyer 예치금 "+snapshot.escrowEth+" 테스트 ETH":"전송 ETH 0")+" · 예상 가스 "+a.estimatedGas+" units";
      write("역할·정책·전송 금액을 검토하고 아래 확인란에 동의하면 MetaMask 거래 요청이 활성화됩니다.","neutral");
      toggles();$("roles-execute").scrollIntoView({block:"center",behavior:"smooth"});
   });
   foot.append(fee,button);card.append(top,h,technical,foot);
   if(a.txHash&&snapshot.chainId===11155111){const l=document.createElement("a");l.className="role-tx-link";l.href="https://sepolia.etherscan.io/tx/"+a.txHash;l.target="_blank";l.rel="noopener noreferrer";l.textContent="완료 TX 보기 ↗";card.append(l);}
   holder.append(card);
 }
 toggles();
}
async function fetchSnapshot(){
 const tradeId=tradeFromContext();
 const res=await fetch("/api/roles/status?tradeId="+encodeURIComponent(tradeId),{cache:"no-store",signal:AbortSignal.timeout(45000)});
 const data=await res.json();
 if(!res.ok)throw Error(data.detail||data.error||"Sepolia 역할 조회 실패");
 if(!eq(data.tradeId,tradeId)||!/^0x[0-9a-fA-F]{40}$/.test(data.contract)||!Number.isSafeInteger(data.chainId))throw Error("차단: 선택 거래·체인·배포 주소 불일치");
 if(!data.accountConserved||!data.balanceCoversLiabilities)throw Error("차단: 회계 불변식 점검 실패");
 snapshot=data;
 if(selected&&!snapshot.actions.some(x=>x.id===selected&&x.status==="READY"))selected=null;
 render();return data;
}
function inject(){
 if(!window.ethereum)throw Error("MetaMask가 감지되지 않습니다. 확장 프로그램이 활성화된 브라우저를 사용하세요.");
 const e=window.ethereum;
 return (Array.isArray(e.providers)?e.providers.find(p=>p?.isMetaMask):null)||e;
}
async function getWallet(prompt){
 if(!E?.BrowserProvider)throw Error("ethers 지갑 연결 라이브러리 로딩 실패");
 const injection=inject();
 const accounts=await injection.request({method:prompt?"eth_requestAccounts":"eth_accounts"});
 if(!accounts?.length)throw Error("MetaMask에서 이 사이트에 연결할 지갑을 허용하세요.");
 const chain=await injection.request({method:"eth_chainId"});
 if(!snapshot||BigInt(chain)!==BigInt(snapshot.chainId))throw Error("선택 거래의 네트워크("+(snapshot?.chainId||"?")+")를 지갑에서 선택해 주세요.");
 const address=E.getAddress(accounts[0]);
 const matches=snapshot?.roles.find(r=>eq(r.actor,address));
 if(!matches)throw Error("이 거래에 등록된 Actor 지갑이 아닙니다: "+address);
 connected=address;selectedProvider=injection;
 return new E.BrowserProvider(injection);
}
async function connect(){
 if(busy)return;busy=true;toggles();
 try{
   await fetchSnapshot();
   await getWallet(true);
   selected=null;$("roles-ack").checked=false;render();
   const r=currentRole();write("연결 완료 · "+r.label+" Actor\n"+connected+"\n현재 상태 "+snapshot.stateName+" ("+snapshot.state+")\n이제 해당 역할의 실행 가능한 단계만 선택할 수 있습니다.","valid");
 }catch(err){connected=null;selected=null;render();write("지갑 연결 차단: "+connectError(err)+"\n거래는 전송되지 않았습니다.","invalid");}
 finally{busy=false;render();toggles();}
}
async function refresh(){
 if(busy)return;busy=true;toggles();
 try{
  await fetchSnapshot();
  if(connected)await getWallet(false);
  render();write("Sepolia 상태·계정·권한을 다시 조회했습니다. 블록 #"+snapshot.blockNumber,"valid");
 }catch(err){snapshot=null;connected=null;selected=null; $("roles-actions").textContent="현재 역할별 온체인 상태를 확인하지 못했습니다.";write("사전검증 실패: "+connectError(err),"invalid");}
 finally{busy=false;render();toggles();}
}
async function execute(){
 if(busy||!canExecute())return;
 busy=true;toggles();pendingTx=null;
 try{
   const data=await fetchSnapshot(),a=data.actions.find(x=>x.id===selected);
   if(!a||a.status!=="READY")throw Error("이미 실행되었거나 현재 상태에서 허용되지 않습니다.");
   const provider=await getWallet(false),role=data.roles.find(r=>r.id===a.role);
   if(!role||!eq(role.actor,connected))throw Error("이 지갑의 역할이 실행 주체와 다릅니다.");
   if(!$("roles-ack").checked)throw Error("명시적 승인 확인란을 체크해 주세요.");
   const signer=await provider.getSigner();
   if(!eq(await signer.getAddress(),role.actor))throw Error("MetaMask 서명 계정이 역할 주소와 다릅니다.");
   const value=a.func==="fund"?BigInt(data.escrowAmountWei):0n;
   const abi=["function acceptPolicy(bytes32)","function acceptInspectorAssignment(bytes32)","function fund(bytes32) payable","function activate(bytes32)",...events];
   const ctr=new E.Contract(data.contract,abi,signer);
   const overrides=value>0n?{value}:{};
   await ctr[a.func].staticCall(data.tradeId,overrides);
   const gas=await ctr[a.func].estimateGas(data.tradeId,overrides);
   if(gas<=0n)throw Error("가스 추정 실패");
   const balance=await provider.getBalance(role.actor),fees=await provider.getFeeData();
   const unitFee=fees.maxFeePerGas??fees.gasPrice??0n;
   if(unitFee<=0n)throw Error("가스 가격 확인 실패");
   if(balance<value+gas*unitFee)throw Error("거래 실행에 필요한 테스트 ETH 잔액이 부족합니다.");
   const confirmText=[
      (data.chainId===11155111?"Sepolia 테스트넷":"LOCAL ANVIL 테스트 체인")+" 트랜잭션을 전송하시겠습니까?",
      "단계: "+(actionNames[a.id]||a.label),
      "함수: "+a.func+"(tradeId)",
      "역할: "+role.label,
      "지갑: "+role.actor,
      "Trade ID: "+data.tradeId,
      "정책 해시: "+data.policyHash,
      "예치/전송 금액: "+E.formatEther(value)+" 테스트 ETH",
      "예상 가스: "+gas.toString()+" units",
      "거래 후 MetaMask 확인 창에서도 승인해야 전송됩니다."
   ].join("\n");
   if(!window.confirm(confirmText)){write("사용자가 실행을 취소했습니다. 전송된 트랜잭션은 없습니다.");return;}
   // Recheck wallet state after confirmation; chain contract remains final permission gate.
   const verifyAccounts=await selectedProvider.request({method:"eth_accounts"});
   const verifyChain=await selectedProvider.request({method:"eth_chainId"});
   if(!verifyAccounts?.length||!eq(verifyAccounts[0],role.actor)||BigInt(verifyChain)!==BigInt(data.chainId))throw Error("확인 직후 MetaMask 계정 또는 체인이 변경됐습니다.");
   write("MetaMask에서 거래를 확인해 주세요. 아직 성공으로 확정되지 않았습니다.");
   const tx=await ctr[a.func](data.tradeId,overrides);
   pendingTx=tx.hash;
   write("트랜잭션 전파 확인 · 채굴 및 영수증 확인 중\nTX "+tx.hash);
   const receipt=await tx.wait(1);
   if(!receipt||Number(receipt.status)!==1)throw Error("실행 영수증이 성공이 아닙니다.");
   const decoder=new E.Interface(events);
   let found=false;
   for(const log of receipt.logs){
     if(!eq(log.address,data.contract))continue;
     try{
       const parsed=decoder.parseLog(log);
       if(!parsed||parsed.name!==a.event||!eq(parsed.args.tradeId,data.tradeId))continue;
       if(a.func==="acceptPolicy"&&(!eq(parsed.args.party,role.actor)||!eq(parsed.args.policyHash,data.policyHash)))continue;
       if(a.func==="acceptInspectorAssignment"&&(!eq(parsed.args.inspector,role.actor)||!eq(parsed.args.policyHash,data.policyHash)))continue;
       if(a.func==="fund"&&(!eq(parsed.args.buyer,role.actor)||parsed.args.amount!==value))continue;
       found=true;break;
     }catch(_){}
   }
   if(!found)throw Error("Receipt는 성공했지만 예상 이벤트 확인에 실패했습니다. 직접 TX 내역을 점검하세요.");
   const doneId=a.id,doneName=actionNames[doneId]||a.label;
   selected=null;$("roles-ack").checked=false;
   write((data.chainId===11155111?"SEPOLIA_CONFIRMED_TX":"LOCAL_ANVIL")+" 실행 성공 · "+doneName+"\nTX: "+tx.hash+"\n블록: #"+receipt.blockNumber+"\n컨트랙트 이벤트: "+a.event+" 확인\n추가 역할이 완료해야 하는 다음 단계를 확인하세요.","valid");
   try{await fetchSnapshot();}catch(e){write("거래 이벤트 성공 확인, 하지만 최신 상태 재조회는 실패했습니다.\nTX: "+tx.hash+"\n"+connectError(e),"invalid");}
 }catch(err){
   write("거래 실행 불가 또는 확정되지 않음: "+connectError(err)+(pendingTx?"\n전파된 TX: "+pendingTx+"\nEtherscan에서 영수증을 확인하세요.":"\nTX 전송이 확인되지 않았습니다."),"invalid");
 }finally{busy=false;render();toggles();}
}
$("roles-connect").addEventListener("click",connect);
$("roles-reload").addEventListener("click",refresh);
$("roles-rescan").addEventListener("click",refresh);
$("roles-execute").addEventListener("click",execute);
$("roles-ack").addEventListener("change",toggles);
window.ethereum?.on?.("accountsChanged",()=>{connected=null;selected=null;$("roles-ack").checked=false;render();write("MetaMask 계정이 변경됐습니다. 다시 연결해야 합니다.","invalid");});
window.ethereum?.on?.("chainChanged",()=>{connected=null;selected=null;snapshot=null;$("roles-ack").checked=false;write("네트워크가 변경됐습니다. Sepolia로 돌아온 뒤 재검증하세요.","invalid");toggles();});
fetchSnapshot().catch(err=>write("Sepolia 상태 초기 조회 실패: "+connectError(err),"invalid"));
})();
