"use strict";
const $=id=>document.getElementById(id);
const sections={
  overview:["PROJECT OVERVIEW","AI 검사를, 거래의 근거로.","AI 결과가 충돌할 때도 검증 가능한 증거와 정산 절차를 유지합니다.","대시보드"],
  inspection:["MODEL B / LIVE INSPECTION","실물 너트, 지금 직접 검사합니다.","AI 이상 점수의 생성 과정을 실제 실물 사진으로 보여줍니다.","실시간 AI 검사"],
  evidence:["EVIDENCE / CRYPTOGRAPHIC TRUST","검사 결과에 검증 가능한 근거를.","원본 해시·모델·정책·서명과 물리적 신뢰의 경계를 구분합니다.","검사 증거"],
  proposal:["NEW TRADE / EXPLICIT WALLET APPROVAL","검증된 새 거래를 개설합니다.","신규 정책·자격·지갑·상태를 확인하고 MetaMask에서 직접 승인합니다.","신규 거래 개설"],
  roles:["ROLE-BASED / EXPLICIT METAMASK","각자 자신의 권한으로 거래를 실행합니다.","Supplier·Buyer·Inspector의 지갑을 구분하고 허용된 단계만 실행합니다.","역할별 거래 실행"],
  review:["BUYER REVIEW / NEW TRADE","REVIEW 검사에서 분쟁 증거로.","새로운 거래의 상태를 검증하고 서명 전 Evidence Package를 안전하게 준비합니다.","REVIEW 거래 준비"],
  settlement:["SETTLEMENT / SEPOLIA","온체인에서 정산 결과를 확인합니다.","12건의 실제 거래 기록과 최종 인출 상태를 읽기 전용으로 검증합니다.","온체인 정산·감사"],
  dispute:["DISPUTE / INSPECTOR","AI 검사 결과가 다르면 어떻게 될까?","Replay와 Inspector 판단을 거쳐 자금의 수령권을 정하는 설계입니다.","분쟁 처리 구조"],
  execution:["ADVANCED / EXPLICIT SIGNATURE","서명과 거래는 사용자 승인으로.","기존 실행 엔진은 건드리지 않고 전문가용 기능으로 보존합니다.","거래 실행 콘솔"]
};
const chosen={top:null,front:null,side:null};
const urls={top:null,front:null,side:null};
let result=null,sessionReport=null,modelStatus=null,chainStatus=null,toastTimeout=null;
const errText=e=>typeof e==="string"?e:(e?.message||"원인을 확인할 수 없는 오류");
function toast(message,danger=false){const t=$("toast");t.textContent=message;t.classList.toggle("danger",danger);t.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{t.hidden=true;},4800);}
function navTo(key){
  if(!sections[key])key="overview";
  document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+key));
  document.querySelectorAll(".nav-item").forEach(x=>{const active=x.dataset.nav===key;x.classList.toggle("active",active);if(active)x.setAttribute("aria-current","page");else x.removeAttribute("aria-current");});
  const [kick,title,description,crumb]=sections[key];$("page-kicker").textContent=kick;$("page-title").textContent=title;$("page-description").textContent=description;$("page-crumb").textContent=crumb;
  if(location.hash!=="#"+key)history.replaceState(null,"","#"+key);
  window.scrollTo({top:0,behavior:"smooth"});
  if(key==="settlement")loadTrade();
}
document.querySelectorAll("[data-nav]").forEach(el=>el.addEventListener("click",()=>navTo(el.dataset.nav)));
window.addEventListener("hashchange",()=>navTo(location.hash.slice(1)));
async function readJSON(url,options){
  const response=await fetch(url,{cache:"no-store",...options});
  let body;try{body=await response.json();}catch{throw Error("서버 응답을 해석할 수 없습니다. HTTP "+response.status);}
  if(!response.ok)throw Error(String(body?.detail||body?.error||"요청 실패")+" (HTTP "+response.status+")");
  return body;
}
async function healthCheck(){
  try{modelStatus=await readJSON("/api/modelb/status");const ok=modelStatus?.artifact_commitment?.verified===true;
    $("side-ai").textContent=ok?"검증된 모델":"점검 필요";$("side-ai").style.color=ok?"#70dfcb":"#e9b46f";
    if(modelStatus.threshold_raw)$("live-threshold").textContent=Number(modelStatus.threshold_raw).toFixed(6);
    if(!ok)toast("Model B 아티팩트 무결성 점검이 필요합니다.",true);
  }catch(e){$("side-ai").textContent="연결 확인 필요";toast("Model B 서버 연결 오류: "+errText(e),true);}
}
function escapeShort(x,n=22){const v=String(x||"");return v.length>n?v.slice(0,10)+"…"+v.slice(-8):v;}
function notifyChanged(){
  if(result){result=null;sessionReport=null;$("inference-result").hidden=true;$("inference-placeholder").hidden=false;$("local-evidence-content").textContent="사진이 변경되었습니다. 다시 추론을 실행해야 유효한 로컬 검사 기록이 생성됩니다.";$("local-evidence-state").textContent="재검사 필요";}
  const count=Object.values(chosen).filter(Boolean).length;
  $("image-counter").textContent=count+" / 3 등록";
  $("run-infer").disabled=!chosen.top;
  if(typeof updateReviewState==="function")updateReviewState();
}
for(const role of ["top","front","side"]){
 $("file-"+role).addEventListener("change",e=>{
   const f=e.target.files?.[0]||null;
   if(f&&(!["image/png","image/jpeg"].includes(f.type)||f.size>20*1024*1024)){toast("JPG/PNG, 20MB 이하 이미지가 필요합니다.",true);e.target.value="";return;}
   if(urls[role])URL.revokeObjectURL(urls[role]);
   chosen[role]=f;
   const img=$("preview-"+role),placeholder=$("placeholder-"+role),name=$("filename-"+role);
   if(f){urls[role]=URL.createObjectURL(f);img.src=urls[role];img.hidden=false;placeholder.hidden=true;name.textContent=f.name;$("file-"+role).closest(".upload-card").classList.add("selected");}
   else{urls[role]=null;img.hidden=true;img.removeAttribute("src");placeholder.hidden=false;name.textContent="파일을 선택해 주세요";$("file-"+role).closest(".upload-card").classList.remove("selected");}
   notifyChanged();
 });
}
async function sha256(f){const bytes=await f.arrayBuffer();const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");}
async function runInference(){
 if(!chosen.top||!crypto?.subtle){toast("TOP 이미지 또는 로컬 보안 컨텍스트가 없습니다.",true);return;}
 const btn=$("run-infer");btn.disabled=true;btn.textContent="원본 확인 및 Model B 추론 중…";
 try{
  const sha=await sha256(chosen.top),data=new FormData();data.append("image",chosen.top,chosen.top.name);data.append("expected_sha256",sha);data.append("specimen_id","IE-DEMO-001");
  const reply=await readJSON("/api/modelb/infer",{method:"POST",body:data});
  if(reply.original_image_sha256!==sha)throw Error("원본 이미지 SHA-256이 서버 응답과 일치하지 않습니다.");
  if(!["PASS","REVIEW_REQUIRED"].includes(reply.decision))throw Error("예상하지 못한 검사 결과입니다.");
  result=reply;
  const images={};for(const role of ["top","front","side"]){const f=chosen[role];if(f)images[role.toUpperCase()]={fileName:f.name,bytes:f.size,sha256:role==="top"?sha:await sha256(f),type:f.type};}
  sessionReport={schema:"InspectEscrow.LocalDemoInspectionReport.v1",createdAt:new Date().toISOString(),status:"OFFCHAIN_LOCAL_INFERENCE_ONLY",onchainReady:false,stationSignature:null,tradeId:null,notes:"Captured files are user-selected. The following are image hashes and local Model B results, not a formal EvidencePackage, not an attested chain submission, and not proof of specimen custody.",images,inference:reply};
  renderResult(reply);renderEvidence(sessionReport);toast("Model B 실제 추론 완료 · "+reply.decision);
 }catch(e){toast("검사를 완료하지 못했습니다: "+errText(e),true);}
 finally{btn.disabled=!chosen.top;btn.innerHTML='<svg class="ico"><use href="#i-scan"/></svg> 실시간 AI 검사 실행';}
}
$("run-infer").addEventListener("click",runInference);
function renderResult(r){
 $("inference-placeholder").hidden=true;$("inference-result").hidden=false;
 const review=r.decision==="REVIEW_REQUIRED";
 $("infer-pill").textContent=review?"REVIEW_REQUIRED · 추가 검토":"PASS · 검사 통과";$("infer-pill").className="result-status "+(review?"review":"pass");
 $("infer-score").textContent=Number(r.score_raw).toFixed(6);$("infer-threshold").textContent=Number(r.threshold_raw).toFixed(6);$("infer-device").textContent=String(r.device||"로컬 장치").toUpperCase();$("infer-hash").textContent=r.original_image_sha256;
 $("score-thumb").style.width=Math.max(0,Math.min(100,Number(r.score_raw)/60*100))+"%";$("score-thumb").style.background=review?"linear-gradient(90deg,#eca442,#d97f43)":"linear-gradient(90deg,#3cbdb8,#368bdc)";
 updateReviewState();
 $("inference-result").scrollIntoView({behavior:"smooth",block:"start"});
}
function addEvidenceLine(parent,key,value,code=false){const d=document.createElement("div");d.className="evidence-line";const k=document.createElement("span");k.textContent=key;const v=document.createElement(code?"code":"strong");v.textContent=value;v.title=value;d.append(k,v);parent.append(d);}
function renderEvidence(report){
 const cont=$("local-evidence-content");cont.textContent="";cont.classList.remove("empty-inline");
 $("local-evidence-state").textContent="로컬 검사 완료";
 addEvidenceLine(cont,"판정",report.inference.decision);addEvidenceLine(cont,"이상 점수",Number(report.inference.score_raw).toFixed(6));addEvidenceLine(cont,"모델 임계값",Number(report.inference.threshold_raw).toFixed(6));
 for(const [role,f] of Object.entries(report.images))addEvidenceLine(cont,role+" 원본 SHA-256",f.sha256,true);
 addEvidenceLine(cont,"Station 전자서명","아직 없음");addEvidenceLine(cont,"온체인 제출","수행되지 않음");
}
$("download-report").addEventListener("click",()=>{
 if(!sessionReport){toast("저장할 검사 리포트가 없습니다.",true);return;}
 const bytes=new Blob([JSON.stringify(sessionReport,null,2)],{type:"application/json;charset=utf-8"});
 const link=document.createElement("a"),url=URL.createObjectURL(bytes);link.href=url;link.download="InspectEscrow_ModelB_Local_Inspection_"+new Date().toISOString().replace(/[:.]/g,"-")+".json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("로컬 검사 리포트를 저장했습니다. (온체인 증거 아님)");
});
function chainMark(id,valid){const el=$(id);el.textContent=valid?"PASS":"FAIL";el.style.color=valid?"#0c8c67":"#c95655";}
async function loadTrade(){
 $("chain-alert").className="notice notice-blue";$("chain-alert").querySelector("strong").textContent="Sepolia 컨트랙트 실시간 조회 중";
 $("chain-alert").querySelector("p").textContent="현재 상태와 회계 불변식을 읽고 있습니다. 새 트랜잭션은 보내지 않습니다.";
 try{
 const t=await readJSON("/api/trade");chainStatus=t;
 const done=t.state===17&&t.settled&&t.recordedWithdrawSuccess&&t.supplier.claimableEth==="0.0";
 $("chain-state").textContent=t.stateName+" ("+t.state+")";$("chain-state").style.color=done?"#128562":"#9b7c42";
 $("chain-withdraw").textContent=done?"0.001 ETH · 인출 완료":"현재 인출 내역 확인 필요";
 chainMark("acct-conserved",t.accounting.conserved);chainMark("acct-covered",t.accounting.covered);
 $("acct-claimable").textContent=t.supplier.claimableEth+" ETH";$("acct-claimable").style.color=t.supplier.claimableEth==="0.0"?"#0c8c67":"#ac751f";
 $("chain-alert").className=done?"notice notice-slate":"notice notice-amber";
 $("chain-alert").querySelector("strong").textContent=done?"실제 Sepolia 조회 · S05 정상 경로 검증":"실제 Sepolia 조회 · 상태 재확인 필요";
 $("chain-alert").querySelector("p").textContent=done?"Buyer 최종 수락 이후 Supplier가 0.001 Sepolia ETH를 인출했습니다. 이 거래는 보관된 촬영/추론 결과를 바탕으로 완료된 별도 기록입니다.":"컨트랙트가 반환한 최신 상태를 확인하세요. 이 화면은 상태를 추정하거나 거래를 실행하지 않습니다.";
 $("chain-block").textContent="읽기 전용 조회: 블록 #"+Number(t.blockNumber).toLocaleString("en-US")+" · "+new Date(t.verifiedAt).toLocaleString("ko-KR");
 const table=$("tx-body");table.textContent="";
 for(const x of t.txs){const tr=document.createElement("tr");const a=document.createElement("td");a.textContent=x.step;const b=document.createElement("td");b.textContent=x.label;const c=document.createElement("td");const link=document.createElement("a");link.href=x.url;link.textContent=escapeShort(x.hash,28)+" ↗";link.target="_blank";link.rel="noopener noreferrer";c.append(link);const d=document.createElement("td");const ok=document.createElement("span");ok.className="tx-success";ok.textContent="VERIFIED*";ok.title="이 거래는 검증된 아카이브 목록에 포함되어 있습니다. 현재 블록 상태는 별도 실시간 조회입니다.";d.append(ok);tr.append(a,b,c,d);table.append(tr);}
 }catch(e){
 $("chain-alert").className="notice notice-red";$("chain-alert").querySelector("strong").textContent="현재 Sepolia 조회에 실패했습니다";$("chain-alert").querySelector("p").textContent="이전 거래 성공 기록은 보존되어 있지만, 지금 최신 온체인 상태는 검증하지 못했습니다. "+errText(e);
 $("chain-state").textContent="조회 실패";$("chain-withdraw").textContent="실시간 확인 불가";for(const x of ["acct-conserved","acct-covered","acct-claimable"])$(x).textContent="확인 불가";
 $("chain-block").textContent="마지막 조회 실패 · Sepolia 네트워크 연결 확인";
 if(location.hash!=="#roles")toast("Sepolia 최신 상태를 불러오지 못했습니다.",true);
 }
}
$("reload-chain").addEventListener("click",loadTrade);
$("top-refresh").addEventListener("click",async()=>{await Promise.all([healthCheck(),loadTrade()]);toast("모델·온체인 상태를 다시 조회했습니다.");});
$("load-execution").addEventListener("click",()=>{
 const wrap=$("execution-frame-wrap"),frame=$("execution-frame"),btn=$("load-execution");
 if(wrap.hidden){wrap.hidden=false;frame.src="http://127.0.0.1:8768/";btn.textContent="고급 실행 화면 접기";toast("기존 실행 화면을 열었습니다. MetaMask 승인은 별도 창에서 권장합니다.");}
 else{wrap.hidden=true;frame.src="about:blank";btn.innerHTML='고급 실행 화면 열기 <svg class="ico"><use href="#i-arrow"/></svg>';}
});
navTo(location.hash.slice(1)||"overview");
healthCheck();loadTrade();


// PATCH3 NEW BUYER REVIEW: explicitly read-only gates + unsigned evidence packaging.
// No EIP-712 signing or wallet transaction is invoked from this section.
let reviewEligibleTrade=null;
let preparedReviewBundle=null;
function updateReviewState(){
 const ready=result?.decision==="REVIEW_REQUIRED";
 const allFiles=["top","front","side"].every(view=>chosen[view]);
 $("prepare-review-open").hidden=!ready;
 reviewEligibleTrade=null;preparedReviewBundle=null;
 $("review-prepare").disabled=true;$("review-download").hidden=true;
 if(ready){
   $("review-capture-status").className="review-result "+(allFiles?"valid":"invalid");
   $("review-capture-status").textContent="Model B 판정: REVIEW_REQUIRED · score "+Number(result.score_raw).toFixed(6)+"\nTOP·FRONT·SIDE: "+(allFiles?"3장 등록 완료":"추가 촬영 필요 (3장 필수)")+"\n해시/AI 리포트: 로컬 추론 완료";
 }else{$("review-capture-status").className="review-result neutral";$("review-capture-status").textContent="이번 세션의 REVIEW_REQUIRED 판정이 없습니다. 먼저 실시간 AI 검사를 실행하세요.";}
 $("review-preflight-status").className="review-result neutral";
 $("review-preflight-status").textContent="새 거래의 상태와 서명 권한을 다시 검증해야 합니다.";
 $("review-result").textContent="사전검증이 통과해야 증거 생성을 시작할 수 있습니다.";
}
function reasonKR(reason){
 const labels={
  "REFERENCE_TRADE_ALREADY_SETTLED":"완료된 S05 예시 거래는 재사용할 수 없습니다.",
  "INVALID_TRADE_ID":"새로운 bytes32 Trade ID를 입력하세요.",
  "TRADE_NOT_FOUND_OR_RPC_ERROR":"신규 거래가 Sepolia에 존재하지 않거나 RPC가 응답하지 않았습니다.",
  "REQUIRES_AWAIT_BUYER_STATE_8":"거래 상태가 AWAIT_BUYER(8)가 아닙니다. Supplier PASS 제출 및 활성화를 먼저 완료하세요.",
  "INSUFFICIENT_BUYER_DEADLINE":"Buyer 검사 마감시간이 지났거나 안전 여유가 150초 이하입니다.",
  "SUPPLIER_PASS_MISSING":"Supplier PASS가 기록되지 않았습니다.",
  "BUYER_ALREADY_SUBMITTED":"Buyer 검사 결과가 이미 온체인에 기록됐습니다.",
  "BUYER_STATION_NOT_ACTIVE":"Buyer Station 자격이 활성 상태가 아닙니다.",
  "ACCOUNTING_INVARIANT_FAILED":"컨트랙트 회계 불변식이 충족되지 않습니다."
 };
 if(String(reason).startsWith("TERMS_MISMATCH_"))return "기존 정책과 신규 거래의 "+reason.slice(15)+" 조건이 일치하지 않습니다.";
 return labels[reason]||("검증 통과 실패: "+reason);
}
$("review-trade-id").addEventListener("input",()=>{
 reviewEligibleTrade=null;preparedReviewBundle=null;$("review-prepare").disabled=true;$("review-download").hidden=true;
 $("review-preflight-status").className="review-result neutral";
 $("review-preflight-status").textContent="새 Trade ID 변경됨 · 사전검증이 필요합니다.";
 $("review-result").textContent="이전 검증 결과는 무효화했습니다.";
});
$("review-preflight").addEventListener("click",async()=>{
 const id=$("review-trade-id").value.trim();
 reviewEligibleTrade=null;preparedReviewBundle=null;
 $("review-prepare").disabled=true;$("review-download").hidden=true;
 const output=$("review-preflight-status");output.className="review-result neutral";output.textContent="실제 Sepolia 상태 읽기 전용 조회 중...";
 try{
   const p=await readJSON("/api/review/preflight?tradeId="+encodeURIComponent(id));
   if(!p.ok){output.className="review-result invalid";output.textContent=reasonKR(p.reason)+"\n"+(p.state!==undefined?"현재 상태 번호: "+p.state+"\n":"")+(p.detail||"");return;}
   reviewEligibleTrade=id;
   const eligible=result?.decision==="REVIEW_REQUIRED"&&["top","front","side"].every(x=>chosen[x]);
   output.className="review-result valid";
   output.textContent="Sepolia 사전검증 PASS\n"+"거래 상태: AWAIT_BUYER (8)\nSupplier PASS 기록: 확인\nBuyer 미제출 · 정책/Station ACTIVE 확인\n남은 마감 시간: "+p.remainingSeconds+"초 · 블록 #"+p.blockNumber;
   $("review-prepare").disabled=!eligible;
   $("review-result").className="review-result "+(eligible?"valid":"invalid");
   $("review-result").textContent=eligible?"검증 조건을 충족했습니다. 증거 생성 버튼을 누르면 모델을 다시 추론해 바이트·점수를 교차검증합니다.":"거래 상태는 적합하지만 REVIEW 결과와 TOP·FRONT·SIDE 3장이 필요합니다.";
 }catch(e){output.className="review-result invalid";output.textContent="현재 Sepolia 상태 조회 실패: "+errText(e);}
});
function toBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const text=String(r.result);resolve(text.slice(text.indexOf(",")+1));};r.onerror=()=>reject(Error("FILE_READ_FAILED"));r.readAsDataURL(file);});}
$("review-prepare").addEventListener("click",async()=>{
 if(!reviewEligibleTrade||result?.decision!=="REVIEW_REQUIRED"||!["top","front","side"].every(x=>chosen[x])){
   toast("신규 거래 사전검증과 REVIEW 이미지 3장을 먼저 확인하세요.",true);return;
 }
 const btn=$("review-prepare"),out=$("review-result");btn.disabled=true;$("review-download").hidden=true;
 out.className="review-result neutral";out.textContent="TOP·FRONT·SIDE 원본을 확인하고 Model B를 다시 추론하여 새 증거 해시를 계산하고 있습니다...";
 try{
   const images={};for(const role of ["top","front","side"]){const file=chosen[role];images[role.toUpperCase()]={name:file.name,data:await toBase64(file)};}
   const payload={tradeId:reviewEligibleTrade,images,report:result,capturedAtUtc:sessionReport?.createdAt||new Date().toISOString(),label:"BUYER-LIVE-REVIEW"};
   const x=await readJSON("/api/review/prepare",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(payload)});
   if(!x.ok||x.stage!=="UNSIGNED_EVIDENCE_PREPARED_ONLY")throw Error(x.reason||"증거 패키지 응답 오류");
   preparedReviewBundle=x.bundle;
   out.className="review-result valid";
   out.textContent="새 거래용 증거 해시 준비 완료 · 거래 전송 0건\n"+
    "Trade ID: "+x.bundle.manifest.tradeId+"\n"+
    "Specimen Manifest Hash: "+x.bundle.specimenManifestHash+"\n"+
    "Evidence Package Hash: "+x.bundle.evidencePackageHash+"\n"+
    "AI: "+x.decision+" / "+Number(x.scoreScaled/1e6).toFixed(6)+"\n"+
    "EIP-712: 서명 전 · Station 서명 / Actor 제출은 별도\n"+
    "주의: 원본 사진 3장을 JSON과 함께 보관해야 합니다.";
   $("review-download").hidden=false;
   toast("신규 Buyer REVIEW 증거 묶음이 생성됐습니다. (서명·TX 없음)");
 }catch(e){
   out.className="review-result invalid";out.textContent="증거 생성 차단: "+errText(e)+"\n현재 단계에서 블록체인 트랜잭션은 전송되지 않았습니다.";
   toast("REVIEW 증거 생성이 차단됐습니다.",true);
 }finally{btn.disabled=!reviewEligibleTrade||result?.decision!=="REVIEW_REQUIRED";}
});
$("review-download").addEventListener("click",()=>{
 if(!preparedReviewBundle){toast("생성된 증거 묶음이 없습니다.",true);return;}
 const name="InspectEscrow_BUYER_REVIEW_UNSIGNED_"+preparedReviewBundle.manifest.tradeId.slice(2,10)+".json";
 const blob=new Blob([JSON.stringify(preparedReviewBundle,null,2)+"\n"],{type:"application/json;charset=utf-8"});
 const link=document.createElement("a"),url=URL.createObjectURL(blob);
 link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
 toast("서명 전 증거 JSON을 저장했습니다. TOP·FRONT·SIDE 원본 3장도 별도 보관하세요.");
});
