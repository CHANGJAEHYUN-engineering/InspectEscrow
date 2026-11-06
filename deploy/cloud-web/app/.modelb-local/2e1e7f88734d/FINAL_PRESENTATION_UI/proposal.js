"use strict";
(()=>{
const $=id=>document.getElementById(id),e=window.ethers,checks=["proposal-ack-roles","proposal-ack-separate","proposal-ack-testnet"];
let snap=null,actor=null,busy=false,sentHash=null;
const show=(s,kind="neutral")=>{$("proposal-output").textContent=s;$("proposal-output").className="review-result "+kind;};
const field=(id,text,good)=>{let a=$(id);a.textContent=text;a.style.color=good===true?"#13845f":good===false?"#b36738":"#435c77";};
const acknowledged=()=>checks.every(id=>$(id).checked);
const eligible=()=>!busy&&snap?.ready&&actor?.toLowerCase()===snap.supplier?.toLowerCase()&&acknowledged()&&Date.now()-Date.parse(snap.verifiedAt)<60000;
function refreshButton(){$("proposal-send").disabled=!eligible();for(let k of ["proposal-connect","proposal-verify","proposal-refresh"])$(k).disabled=busy;}
async function status(){
const res=await fetch("/api/newtrade/candidate",{cache:"no-store"}),data=await res.json();
if(!res.ok||data.chainId!==11155111||data.contract!=="0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905")throw Error(data.detail||"거래 검증 서비스 오류");
snap=data;$("proposal-roles").textContent=[...(data.actorBalances||[]).map(x=>x.role+" · "+x.address+" · balance "+x.balanceEth+" ETH"),...(data.roles||[]).map(x=>x.role+" · "+x.address+" · "+(x.active?"ACTIVE":"NOT ACTIVE"))].join("\n");$("proposal-id").textContent=data.tradeId;$("proposal-policy").textContent=data.policyHash;$("proposal-contract").textContent=data.contract;$("proposal-deposit").textContent=data.escrowETH+" Sepolia ETH";$("proposal-expected-actor").textContent=data.supplier;
const alreadyCreated=data.currentState!==null&&data.currentState!==undefined&&Number(data.currentState)>=1;
field("proposal-eligibility",alreadyCreated?"개설 완료":data.ready?"개설 가능":"차단됨",alreadyCreated||data.ready);field("proposal-static",alreadyCreated?"개설 완료 (중복 방지)":data.proposalCall,alreadyCreated||data.proposalCall==="PASS");field("proposal-stations",data.allStationsActive?"5개 ACTIVE":"미충족",data.allStationsActive);
field("proposal-gas",data.gasEstimate?Number(data.gasEstimate).toLocaleString():"현재 단계에서 불필요");field("proposal-state",data.currentState===null?"미생성":Number(data.currentState)===1?"PROPOSED (1)":"상태 "+data.currentState);field("proposal-block","#"+data.latestBlock);
if(alreadyCreated)show("새 REVIEW 거래가 이미 생성됐습니다.\n상태: "+(Number(data.currentState)===1?"PROPOSED (1)":"상태 "+data.currentState)+"\nTrade ID: "+data.tradeId+"\n추가 개설은 필요하지 않습니다.\n좌측 [역할별 거래 실행]에서 Supplier/Buyer의 정책 수락을 진행하세요.","valid");
else if(data.ready)show("신규 거래의 온체인 사전검증을 통과했습니다.\nSupplier: "+data.supplier+"\nPolicy Hash: "+data.policyHash+"\n가스 추정: "+data.gasEstimate+" units\n\n이제 Supplier 지갑을 연결하고 아래 세 가지 조건을 확인하세요.","valid");
else show("개설 차단: "+(data.staticError||"이미 사용된 거래 또는 Station/계약 조건 불일치")+"\n계정/거래 상태를 재확인해야 합니다.","invalid");
refreshButton();return data;
}
function walletHint(message,kind="neutral"){
 const node=$("proposal-wallet-hint");
 node.textContent=message;
 node.className="proposal-wallet-hint "+kind;
}
function walletError(err){
 const code=err?.code??err?.info?.error?.code;
 if(code===4001||code==="ACTION_REJECTED")return "MetaMask 연결 요청을 거절했습니다. 확장 프로그램에서 연결을 승인한 뒤 다시 시도하세요.";
 if(code===4100)return "이 사이트의 MetaMask 계정 접근 권한이 없습니다. MetaMask의 연결된 사이트에서 127.0.0.1:8770 계정을 허용하세요.";
 if(code===-32002)return "MetaMask에 이미 연결 요청이 열려 있습니다. 확장 프로그램 팝업을 먼저 확인하세요.";
 return String(err?.shortMessage||err?.message||err).slice(0,360);
}
function selectedProvider(){
 const injected=window.ethereum;
 if(!injected)throw Error("이 브라우저에서 MetaMask가 감지되지 않습니다. MetaMask가 설치·활성화된 브라우저 탭에서 열어주세요.");
 const choices=Array.isArray(injected.providers)?injected.providers:[injected];
 return choices.find(p=>p?.isMetaMask)||injected;
}
async function wallet(ask=false){
 if(!e?.BrowserProvider)throw Error("서명 라이브러리가 아직 준비되지 않았습니다. 새로고침 후 다시 시도하세요.");
 const selected=selectedProvider();
 const a=await selected.request({method:ask?"eth_requestAccounts":"eth_accounts"});
 if(!a?.length)throw Error("MetaMask에서 이 사이트에 사용할 계정을 연결해 주세요.");
 actor=e.getAddress(a[0]);
 $("proposal-wallet-account").textContent=actor;
 const chain=await selected.request({method:"eth_chainId"});
 if(BigInt(chain)!==11155111n)throw Error("선택된 지갑 네트워크가 Sepolia가 아닙니다 (chainId "+BigInt(chain).toString()+"). MetaMask에서 Sepolia 테스트넷으로 전환하세요.");
 if(snap&&actor.toLowerCase()!==snap.supplier.toLowerCase())throw Error("현재 선택한 계정 "+actor+"은 Supplier Actor가 아닙니다. MetaMask에서 Supplier 계정 "+snap.supplier+"을 선택하세요.");
 return new e.BrowserProvider(selected);
}
async function connect(){
 busy=true;refreshButton();
 let phase="preflight";
 try{
  walletHint("먼저 거래 사전검증을 확인하는 중입니다.");
  await status();
  phase="wallet";
  walletHint("MetaMask 계정 연결 요청 중입니다. 브라우저 확장 프로그램 창도 확인하세요.");
  await wallet(true);
  walletHint("Supplier Actor 계정과 Sepolia 네트워크 확인 완료.","valid");
  show("Supplier MetaMask 연결 PASS · Sepolia(11155111)\n이제 승인 전 확인사항 3개를 검토하세요.","valid");
 }catch(err){
  const msg=walletError(err);
  const found=actor;
  actor=null;
  if(phase==="preflight"){
   $("proposal-wallet-account").textContent="사전검증 실패 · 지갑 연결 미시작";
   walletHint("Sepolia 사전검증을 불러오지 못했습니다: "+msg,"invalid");
   show("지갑 요청 전 Sepolia 조회 단계에서 차단됨: "+msg,"invalid");
  }else{
   $("proposal-wallet-account").textContent=found?(found+" · 검증 실패"):"계정 연결/확인 실패";
   walletHint(msg,"invalid");
   show("MetaMask 연결 단계에서 차단됨: "+msg+"\n실제 트랜잭션은 전송되지 않았습니다.","invalid");
  }
 }finally{busy=false;refreshButton();}
}
async function check(){
 busy=true;refreshButton();
 try{await status();if(actor){await wallet();walletHint("Supplier 지갑·Sepolia 확인 완료.","valid");}}
 catch(err){walletHint(walletError(err),"invalid");show("실시간 사전검증 실패: "+walletError(err),"invalid");}
 finally{busy=false;refreshButton();}
}
async function send(){
if(busy)return;busy=true;refreshButton();sentHash=null;
try{
const p0=await status();
if(!p0.ready||!acknowledged())throw Error("거래 개설 준비 또는 동의 조건 불충족");
const provider=await wallet(),signer=await provider.getSigner();
if((await signer.getAddress()).toLowerCase()!==p0.supplier.toLowerCase())throw Error("잘못된 Supplier 계정");
const ctr=new e.Contract(p0.contract,p0.proposeABI,signer);
await ctr.proposeTrade.staticCall(p0.terms);
const gas=await ctr.proposeTrade.estimateGas(p0.terms);
if(gas<=0n)throw Error("MetaMask 가스 추정 실패");
const msg="Sepolia 테스트넷에 신규 거래를 개설하시겠습니까?\n\n"+
"함수: proposeTrade(TradeTerms)\nTrade ID: "+p0.tradeId+
"\nSupplier Actor: "+p0.supplier+"\n예치금 전송: 0 ETH (가스비 별도)\n가스 추정: "+gas.toString()+
"\n\n전송은 이 확인과 MetaMask의 추가 승인을 모두 마친 뒤에만 발생합니다.";
if(!window.confirm(msg)){show("사용자가 개설을 취소했습니다. 거래는 전송되지 않았습니다.");return;}
show("MetaMask 승인 요청 중 · 계정/가스비 확인 후 직접 승인해 주세요.\n현재 트랜잭션 확정 전입니다.");
const tx=await ctr.proposeTrade(p0.terms);sentHash=tx.hash;
show("TX 전파 확인 · 채굴 완료 대기\n"+sentHash+"\n아직 성공으로 확정하지 않았습니다.");
const receipt=await tx.wait(1);
if(!receipt||Number(receipt.status)!==1)throw Error("receipt status가 SUCCESS가 아닙니다.");
const s=await status();
if(s.currentState!==1)throw Error("receipt 성공, 최신 상태 PROPOSED(1) 조회 불일치");
show("개설 성공 · PROPOSED(1)\nTX: "+sentHash+"\n블록: #"+receipt.blockNumber+
"\n이후 Supplier·Buyer 정책 수락 및 Inspector 3명 배정 수락이 필요합니다.\n예치금은 아직 전송되지 않았습니다.","valid");
}catch(err){show("거래 개설 미확정/차단: "+String(err.shortMessage||err.message).slice(0,380)+(sentHash?"\n이미 전송된 TX: "+sentHash+"\nEtherscan에서 확인하십시오.":""),"invalid");}
finally{busy=false;refreshButton();}
}
$("proposal-refresh").addEventListener("click",check);
$("proposal-verify").addEventListener("click",check);
$("proposal-connect").addEventListener("click",connect);
$("proposal-send").addEventListener("click",send);
checks.forEach(id=>$(id).addEventListener("change",refreshButton));
window.ethereum?.on?.("accountsChanged",()=>{actor=null;$("proposal-wallet-account").textContent="계정 변경 · 다시 연결 필요";refreshButton();});
window.ethereum?.on?.("chainChanged",()=>{actor=null;snap=null;$("proposal-wallet-account").textContent="네트워크 변경 · 다시 연결 필요";refreshButton();});
status().catch(err=>{show("후보 거래 초기 조회 실패: "+String(err.shortMessage||err.message),"invalid");refreshButton();});
})();