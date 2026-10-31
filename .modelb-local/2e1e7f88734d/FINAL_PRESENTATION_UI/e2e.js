"use strict";
(()=>{
const $=id=>document.getElementById(id),e=window.ethers;
const activeTrade=()=>{const q=new URLSearchParams(location.search).get("tradeId");let saved="";try{const raw=localStorage.getItem("inspectescrow.activeTrade.v1")||"";saved=raw.startsWith("{")?JSON.parse(raw).tradeId:raw;}catch{}const id=q||saved;if(!/^0x[0-9a-fA-F]{64}$/.test(id||""))throw Error("선택된 Trade ID가 없습니다. 거래 목록에서 거래를 선택하세요.");localStorage.setItem("inspectescrow.activeTrade.v1",id);return id;};
const state={snapshot:null,packages:{supplier:null,buyer:null,replay:null},signatures:{supplier:null,buyer:null,replay:null},busy:false};
const envErr=x=>String(x?.shortMessage||x?.message||x).slice(0,400),eq=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const out=(role,s)=>{$(role+"-output").textContent=s;};
function provider(){
 if(!window.ethereum)throw Error("MetaMask 확장 프로그램 없음");
 const list=window.ethereum.providers;return Array.isArray(list)?list.find(x=>x?.isMetaMask)||window.ethereum:window.ethereum;
}
async function wallet(expected){
 if(!e?.BrowserProvider)throw Error("ethers 브라우저 라이브러리 없음");
 const injected=provider();
 const addrs=await injected.request({method:"eth_requestAccounts"});
 const chain=await injected.request({method:"eth_chainId"});
 if(!state.snapshot||BigInt(chain)!==BigInt(state.snapshot.chainId))throw Error("선택 거래 체인("+(state.snapshot?.chainId||"?")+")으로 지갑 네트워크를 변경하세요.");
 if(!addrs?.length||!eq(addrs[0],expected))throw Error("현재 MetaMask 계정이 필요한 역할 지갑과 다릅니다.\n현재 "+(addrs?.[0]||"없음")+"\n필요 "+expected);
 return new e.BrowserProvider(injected);
}
async function json(url,opts={}){
 const res=await fetch(url,{cache:"no-store",...opts});
 const body=await res.json();if(!res.ok)throw Error(String(body.detail||body.error||"HTTP_"+res.status));return body;
}
async function snapshot(){
 const tradeId=activeTrade(),d=await json("/api/e2e/preflight?tradeId="+encodeURIComponent(tradeId));
 if(!eq(d.tradeId,tradeId)||!/^0x[0-9a-fA-F]{40}$/.test(d.contract)||!Number.isSafeInteger(d.chainId))throw Error("계약·체인·거래 ID 불일치");
 state.snapshot=d;
 $("trade-id").textContent=d.tradeId;
 const names={1:"PROPOSED",2:"PARTIES_ACCEPTED",3:"INSPECTORS_ACCEPTED",4:"FUNDED",5:"AWAIT_SUPPLIER",8:"AWAIT_BUYER",12:"DISPUTED_PRIMARY",14:"EXECUTION_HOLD",18:"REFUNDED",17:"RELEASED"};
 $("trade-state").textContent=(names[d.state]||"STATE")+"("+d.state+")";
 $("deadline").textContent=d.remainingSeconds===null?"0 · 활성화 전":Math.floor(d.remainingSeconds/60)+"m "+d.remainingSeconds%60+"s";
 $("accounting").textContent=d.accountingConserved&&d.balanceCoversLiabilities?"PASS":"FAILED";
 $("preflight").textContent=(d.chainId===11155111?"Sepolia":"LOCAL ANVIL")+" 블록 #"+d.blockNumber+" · 정책 "+d.policyHash+" · Supplier outcome="+d.supplier.outcome+" · Buyer outcome="+d.buyer.outcome+
 "\n현재 실행 가능: "+[d.safeToPrepareSupplier?"Supplier 검사":null,d.safeToPrepareBuyer?"Buyer 검사":null,d.safeToPrepareReplay?"Inspector Replay":null].filter(Boolean).join(" / ")+(d.state===1?"\n먼저 역할별 거래 콘솔에서 정책 수락·배정 수락·예치·활성화를 진행하세요.":"");
 for(const role of ["supplier","buyer","replay"]){
  const ready=role==="supplier"?d.safeToPrepareSupplier:role==="buyer"?d.safeToPrepareBuyer:d.safeToPrepareReplay;
  $(role+"-prepare").disabled=!ready||state.busy;
  const p=state.packages[role];$(role+"-sign").disabled=!ready||!p||state.busy;
  $(role+"-submit").disabled=!ready||!p||!state.signatures[role]||state.busy;
 }
 $("refresh").disabled=state.busy;return d;
}
async function b64(f){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const s=String(reader.result);resolve(s.slice(s.indexOf(",")+1));};reader.onerror=reject;reader.readAsDataURL(f);});}
async function selectedImages(role){
 const result={};
 for(const view of ["top","front","side"]){
  const f=$(role+"-"+view).files?.[0];
  if(!f)throw Error("원본 "+view.toUpperCase()+" 이미지가 없습니다.");
  if(f.size>20*1024*1024||f.size<500||!["image/jpeg","image/png"].includes(f.type))throw Error("지원하지 않는 이미지: "+f.name);
  result[view.toUpperCase()]={name:f.name,data:await b64(f)};
 }return result;
}
function clearRole(role){
 state.packages[role]=null;state.signatures[role]=null;
 $(role+"-sign").disabled=true;$(role+"-submit").disabled=true;
 if(role!=="replay")$(role+"-download").disabled=true;
}
function downloadPackage(role){
 const pkg=state.packages[role];if(!pkg)return;
 const exported={...pkg,signature:state.signatures[role]||null,signatureStatus:state.signatures[role]?"STATION_SIGNATURE_INCLUDED":"UNSIGNED",exportedAtUtc:new Date().toISOString(),transactionsSent:0};
 const blob=new Blob([JSON.stringify(exported,null,2)+"\n"],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="inspectescrow-"+role+"-evidence-"+activeTrade().slice(2,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function prepare(role){
 if(state.busy)return;state.busy=true;clearRole(role);
 try{
  const d=await snapshot();
  const allowed=role==="supplier"?d.safeToPrepareSupplier:role==="buyer"?d.safeToPrepareBuyer:d.safeToPrepareReplay;
  if(!allowed)throw Error("현재 계약 상태("+d.state+")에서 해당 단계 준비 불가");
  let data;
  if(role==="replay"){
   if(!$("replay-ack").checked)throw Error("통제된 음성 테스트임을 명시적으로 확인하세요.");
   data={tradeId:activeTrade(),controlledNegativeTest:true,reason:$("replay-reason").value};
  }else{
   if(!$(role+"-views").checked)throw Error("TOP·FRONT·SIDE 뷰를 직접 확인하세요.");
   out(role,"실제 TOP 이미지 모델 재추론 및 3개 원본 SHA-256 검증 중…");
   data={tradeId:activeTrade(),role,images:await selectedImages(role),operatorLabel:$(role+"-label").value,
    confirmedDistinctViews:true,sourceDescription:"OPERATOR_UPLOADED_3_VIEW_IMAGE_FILES"};
  }
  const endpoint=role==="replay"?"/api/e2e/prepare-replay":"/api/e2e/prepare-inspection";
  const pkg=await json(endpoint,{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(data)});
  if(!pkg.domain||!pkg.types||!pkg.message||!eq(pkg.domain.verifyingContract,d.contract)||Number(pkg.domain.chainId)!==d.chainId)throw Error("서명 스키마 검증 실패");
  state.packages[role]=pkg;
  state.signatures[role]=null;
  if(role!=="replay")$(role+"-download").disabled=false;
  out(role,"신규 거래 증거 패키지 생성 완료 (아직 서명·온체인 제출 없음)\n"+pkg.stage+
  "\nActor "+pkg.actor+"\nStation "+pkg.station+"\nEvidence/Replay hash "+
  (pkg.message.evidencePackageHash||pkg.message.replayReportHash)+
  (pkg.liveModelResult?"\nPatchCore score "+pkg.liveModelResult.scoreRaw+" · "+pkg.liveModelResult.decision:"\n통제된 테스트: 실제 독립 Replay 불일치 증명 아님")+
  "\nEIP-712 서명 유효기간: "+new Date(Number(pkg.message.validUntil)*1000).toLocaleTimeString());
 }catch(err){out(role,"증거 준비 실패: "+envErr(err));}
 finally{state.busy=false;try{await snapshot();}catch(e){out(role,"상태 재조회 실패: "+envErr(e));}}
}
async function sign(role){
 if(state.busy)return;const pkg=state.packages[role];if(!pkg)return;
 state.busy=true;try{
  await snapshot();const d=state.snapshot;
  if(!((role==="supplier"&&d.safeToPrepareSupplier)||(role==="buyer"&&d.safeToPrepareBuyer)||(role==="replay"&&d.safeToPrepareReplay)))throw Error("거래 상태/마감 변경");
  if(d.blockTimestamp>Number(pkg.message.validUntil)-30)throw Error("서명 유효기간이 짧습니다. 증거를 다시 생성하세요.");
  const provider=await wallet(pkg.station);
  const signer=await provider.getSigner();
  if(!eq(await signer.getAddress(),pkg.station))throw Error("Station 지갑이 아닙니다");
  out(role,"지갑 "+pkg.station+"에 EIP-712 서명을 요청했습니다.\n서명은 블록체인 TX가 아니지만 실제 Station 계정 승인입니다.");
  const signature=await signer.signTypedData(pkg.domain,pkg.types,pkg.message);
  const recovered=e.verifyTypedData(pkg.domain,pkg.types,pkg.message,signature);
  if(!eq(recovered,pkg.station))throw Error("EIP-712 서명자로부터 기대된 Station 주소를 복구하지 못함");
  state.signatures[role]=signature;
  out(role,"Station 서명 완료 · actor 제출 전\n회복한 서명자: "+recovered+"\n서명 digest: "+
   e.TypedDataEncoder.hash(pkg.domain,pkg.types,pkg.message)+"\n다음으로 MetaMask를 Actor "+pkg.actor+" 계정으로 전환하고 제출을 누르세요.");
 }catch(err){state.signatures[role]=null;out(role,"Station 서명 실패: "+envErr(err));}
 finally{state.busy=false;try{await snapshot();}catch(e){}}
}
async function submit(role){
 if(state.busy)return;const pkg=state.packages[role],signature=state.signatures[role];
 if(!pkg||!signature)return;state.busy=true;let pendingHash=null;
 try{
  const d=await snapshot();const expectedState=role==="supplier"?5:role==="buyer"?8:12;
  if(d.state!==expectedState||d.remainingSeconds<90)throw Error("거래 상태·마감조건이 변경되었습니다");
  if(!eq(d.tradeId,pkg.message.tradeId))throw Error("선택 거래와 준비된 증거의 Trade ID가 다릅니다.");
  if(!eq(d.policyHash,pkg.message.policyHash))throw Error("정책 해시 변경/불일치");
  const tNow=Number(d.blockTimestamp);
  if(tNow>Number(pkg.message.validUntil)-35||tNow<Number(pkg.message.issuedAt))throw Error("서명 만료·시간 오류: 다시 생성하세요.");
  if(!eq(e.verifyTypedData(pkg.domain,pkg.types,pkg.message,signature),pkg.station))throw Error("Station 서명 불일치");
  const walletProvider=await wallet(pkg.actor),signer=await walletProvider.getSigner();
  if(!eq(await signer.getAddress(),pkg.actor))throw Error("Actor 지갑 오류");
  const abi=role==="replay"?
   ["function recordReplayResult((bytes32 tradeId,uint8 stage,address inspectorActor,bytes32 policyHash,bytes32 supplierEvidenceHash,bytes32 buyerEvidenceHash,bytes32 replayReportHash,bool consistent,bytes32 nonce,uint64 issuedAt,uint64 validUntil) attestation,bytes signature)",
    "function hashReplayAttestation((bytes32 tradeId,uint8 stage,address inspectorActor,bytes32 policyHash,bytes32 supplierEvidenceHash,bytes32 buyerEvidenceHash,bytes32 replayReportHash,bool consistent,bytes32 nonce,uint64 issuedAt,uint64 validUntil) attestation) view returns(bytes32)",
    "event ReplayResultRecorded(bytes32 indexed tradeId,uint8 indexed stage,bytes32 replayReportHash,bool consistent)"]:
   ["function submitInspection((bytes32 tradeId,uint8 role,address station,uint32 attempt,bytes32 sessionNonce,bytes32 policyHash,bytes32 modelBundleHash,bytes32 captureProfileHash,bytes32 specimenManifestHash,bytes32 evidencePackageHash,uint128 aggregateScoreScaled,bytes32 scoreSchemaId,uint8 inspectionValidity,uint8 invalidReason,uint64 issuedAt,uint64 validUntil) attestation,bytes signature)",
    "function hashStationAttestation((bytes32 tradeId,uint8 role,address station,uint32 attempt,bytes32 sessionNonce,bytes32 policyHash,bytes32 modelBundleHash,bytes32 captureProfileHash,bytes32 specimenManifestHash,bytes32 evidencePackageHash,uint128 aggregateScoreScaled,bytes32 scoreSchemaId,uint8 inspectionValidity,uint8 invalidReason,uint64 issuedAt,uint64 validUntil) attestation) view returns(bytes32)",
    "event InspectionOutcomeDerived(bytes32 indexed tradeId,uint8 indexed role,uint32 attempt,uint128 aggregateScoreScaled,uint8 outcome,bytes32 specimenManifestHash,bytes32 evidencePackageHash,address station)"];
  const c=new e.Contract(d.contract,abi,signer);
  const fn=role==="replay"?"recordReplayResult":"submitInspection";
  const hashFN=role==="replay"?"hashReplayAttestation":"hashStationAttestation";
  const digest=e.TypedDataEncoder.hash(pkg.domain,pkg.types,pkg.message);
  const contractDigest=await c[hashFN](pkg.message);
  if(!eq(digest,contractDigest))throw Error("서명 digest와 배포 컨트랙트의 digest가 다릅니다");
  await c[fn].staticCall(pkg.message,signature);
  const gas=await c[fn].estimateGas(pkg.message,signature);
  const fee=await walletProvider.getFeeData();
  const balance=await walletProvider.getBalance(pkg.actor);
  const price=fee.maxFeePerGas||fee.gasPrice;
  if(!price||balance<gas*price)throw Error("선택 네트워크의 트랜잭션 가스비 부족");
  const msg=[
   (d.chainId===11155111?"Sepolia 테스트넷":"LOCAL ANVIL 테스트 체인")+" 트랜잭션을 보내시겠습니까?",
   "단계: "+role,"Actor: "+pkg.actor,"Station: "+pkg.station,
   "TradeId: "+d.tradeId,"EIP712: "+digest,"예상 Gas: "+gas.toString(),
   "총 송금 VALUE: 0 ETH + 가스비",
   role==="replay"?"주의: 독립 Replay 실증이 아니라 통제된 음성 테스트 서명입니다.":"",
   "MetaMask에서 최종적으로 직접 확인해야 제출됩니다."
  ].join("\n");
  if(!window.confirm(msg)){out(role,"사용자가 TX 실행을 취소했습니다. 전송 없음.");return;}
  const latest=await walletProvider.getBlock("latest");
  if(Number(latest.timestamp)>=Number(pkg.message.validUntil)-15)throw Error("지갑 승인 전 서명이 만료되어 차단");
  out(role,"MetaMask 거래 확인 요청 중 · TX 전송 성공 전까지 완료로 표시하지 않습니다.");
  const tx=await c[fn](pkg.message,signature);
  pendingHash=tx.hash;out(role,"전파된 TX: "+pendingHash+"\n영수증 채굴 및 이벤트 대조 중…");
  const receipt=await tx.wait(1);
  if(!receipt||Number(receipt.status)!==1)throw Error("거래 영수증 status != 1");
  const expectedEvent=role==="replay"?"ReplayResultRecorded":"InspectionOutcomeDerived";
  let matched=false;
  for(const log of receipt.logs){
   if(!eq(log.address,d.contract))continue;
   try{const parsed=c.interface.parseLog(log);
    if(!parsed||parsed.name!==expectedEvent||!eq(parsed.args.tradeId,d.tradeId))continue;
    if(role==="replay"){
      if(parsed.args.consistent!==false||!eq(parsed.args.replayReportHash,pkg.message.replayReportHash))continue;
    }else{
      if(Number(parsed.args.role)!==pkg.message.role||!eq(parsed.args.evidencePackageHash,pkg.message.evidencePackageHash))continue;
    }matched=true;break;
   }catch(ex){}
  }
  if(!matched)throw Error("트랜잭션은 성공했지만 예상 컨트랙트 이벤트를 확인하지 못했습니다");
  const current=await snapshot();
  const review=role!=="replay"&&BigInt(pkg.message.aggregateScoreScaled)>=BigInt(d.thresholdScaled);
  const nextState=role==="supplier"?(review?7:8):role==="buyer"?(review?12:11):14;
  const outcome=role==="replay"?null:(review?3:2);
  if(current.state!==nextState)throw Error("이벤트는 성공했지만 현재 상태가 예상과 다릅니다: "+current.state);
  if(role!=="replay"&&Number(current[role].outcome)!==outcome)throw Error("체인 검사 결과가 예상과 다릅니다");
  if(!current.accountingConserved||!current.balanceCoversLiabilities)throw Error("회계 보존 검증 실패");
  const desc=role==="replay"?"EXECUTION_HOLD(14) · CONTROLLED NEGATIVE TEST":"거래 상태 "+nextState;
  out(role,(d.chainId===11155111?"SEPOLIA_CONFIRMED_TX":"LOCAL_ANVIL")+" 실행 성공\n"+desc+"\nTX: "+pendingHash+
    "\nBlock: "+receipt.blockNumber+"\n"+expectedEvent+" 이벤트 일치\n회계 불변식 PASS");
  clearRole(role);
 }catch(err){out(role,"제출 미완료/추가 확인 필요: "+envErr(err)+(pendingHash?"\nTX: "+pendingHash+"\nEtherscan에서 영수증을 반드시 직접 확인하세요.":"\n전송된 TX는 확인되지 않았습니다."));}
 finally{state.busy=false;try{await snapshot();}catch(e){}}
}
$("refresh").addEventListener("click",()=>snapshot().catch(e=>$("preflight").textContent=envErr(e)));
for(const role of ["supplier","buyer","replay"]){
 $(role+"-prepare").addEventListener("click",()=>prepare(role));
 $(role+"-sign").addEventListener("click",()=>sign(role));
 $(role+"-submit").addEventListener("click",()=>submit(role));
 if(role!=="replay"){
  $(role+"-download").addEventListener("click",()=>downloadPackage(role));
  for(const view of ["top","front","side"])$(role+"-"+view).addEventListener("change",()=>clearRole(role));
 }else $("replay-reason").addEventListener("input",()=>clearRole(role));
}
snapshot().catch(err=>$("preflight").textContent="사전검증 실패: "+envErr(err));
})();
