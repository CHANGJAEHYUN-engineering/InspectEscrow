"use strict";
// No wallet provider, signing method or blockchain write exists in this stage application.
// The only POST calls are to the user's loopback PatchCore inference proxy.
(()=>{
 const $=id=>document.getElementById(id);
 const pinned="8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854";
 const sample={normal:null,scratch:null},reports={normal:null,scratch:null};
 const chunks={normal:null,scratch:null},urls={normal:null,scratch:null};
 const state={data:null,redTeam:null,policy:null,scene:"a"};
 const tf=(id,message,mode)=>{const el=$(id);el.textContent=message;if(mode)el.className="check "+mode;};
 const msg=e=>String(e?.message||e||"UNKNOWN_ERROR").slice(0,270);
 async function json(url,options={}){
  const res=await fetch(url,{cache:"no-store",...options});
  const d=await res.json();if(!res.ok)throw Error(d.detail||d.error||"HTTP "+res.status);return d;
 }
 function scene(name){
  if(!["a","b","c"].includes(name))return;
  state.scene=name;
  document.querySelectorAll(".scene").forEach(e=>e.classList.toggle("active",e.id==="scene-"+name));
  document.querySelectorAll(".scene-tab").forEach(e=>{e.classList.toggle("active",e.dataset.scene===name);e.setAttribute("aria-selected",String(e.dataset.scene===name));});
  window.history.replaceState(null,"","#"+name);
  window.scrollTo({top:0,behavior:"smooth"});
 }
 document.querySelectorAll(".scene-tab").forEach(e=>e.addEventListener("click",()=>scene(e.dataset.scene)));
 document.querySelectorAll("[data-go]").forEach(e=>e.addEventListener("click",()=>scene(e.dataset.go)));
 function fullScreen(){
  if(document.fullscreenElement){document.exitFullscreen?.();return;}
  document.documentElement.requestFullscreen?.().catch(()=>{});
 }
 $("full-screen").addEventListener("click",fullScreen);
 document.addEventListener("keydown",e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
  if(e.key==="1")scene("a");if(e.key==="2")scene("b");if(e.key==="3")scene("c");
  if(e.key.toLowerCase()==="f")fullScreen();
 });
 async function refreshStatus(){
  try{
   const d=await json("/api/stage/status");state.data=d;
   const okAI=d.model.available&&d.model.commitmentVerified&&d.model.checkpointSha256===pinned;
   tf("check-ai",okAI?"실제 Model B · CHECKPOINT VERIFIED":"모델 서버 / 검증 필요",okAI?"good":"bad");
   tf("check-chain",d.chain?("Sepolia #"+Number(d.chain.blockNumber).toLocaleString("en-US")+" · NEW "+d.chain.candidate.state):"Sepolia RPC 확인 필요",d.chain?"good":"bad");
   tf("check-redteam",d.redTeam.checks===36?"Red-Team "+d.redTeam.checks+" PASS / 0 FAIL":"Red-Team 기록 확인 필요",d.redTeam.checks===36?"good":"bad");
   $("connect-status").innerHTML="<i></i>"+(okAI&&d.chain?"DEMO READY":"PARTIAL READY");
   $("connect-status").classList.toggle("ready",okAI&&!!d.chain);
   if(d.model.thresholdRaw!==null)$("threshold-display").textContent=Number(d.model.thresholdRaw).toFixed(6);
  }catch(e){
   tf("check-ai","서비스 조회 실패","bad");tf("check-chain","Sepolia 상태 확인 필요","bad");
   $("connect-status").innerHTML="<i></i>PRECHECK REQUIRED";
  }
 }
 const hex=buffer=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,"0")).join("");
 const hash=async file=>hex(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
 function setPhoto(kind,file,origin){
  if(!file||!["image/png","image/jpeg"].includes(file.type)||file.size<100||file.size>20*1024*1024)throw Error("20MB 이하 PNG/JPEG 사진만 사용하세요.");
  if(urls[kind])URL.revokeObjectURL(urls[kind]);
  urls[kind]=URL.createObjectURL(file);sample[kind]={file,origin};reports[kind]=null;
  const el=$(kind+"-image");el.textContent="";
  const img=document.createElement("img");img.src=urls[kind];img.alt=kind==="normal"?"Supplier normal photo":"Buyer scratched photo";el.append(img);
  $(kind+"-score").textContent="—";$(kind+"-decision").textContent="검사 전";$(kind+"-decision").className="decision neutral";
  $(kind+"-provenance").textContent=(origin==="archived"?"사전 보관 샘플 · 현장 촬영 아님":"사용자가 이번 세션에 선택한 이미지")+" · "+file.name+" · "+(file.size/1024/1024).toFixed(2)+" MB";
  $("run-"+kind).disabled=false;
  updateComparison();
 }
 async function getSample(kind){
  const res=await fetch("/api/stage/sample?kind="+kind,{cache:"no-store"});
  if(!res.ok){const d=await res.json();throw Error(d.detail||d.error||"보관 샘플을 열 수 없습니다.");}
  const blob=await res.blob();
  const filename=kind==="normal"?"S05_SUPPLIER_TOP_20261029_01.jpg.jpg":"S03_deep_scratch1.jpg.jpg";
  setPhoto(kind,new File([blob],filename,{type:"image/jpeg"}),"archived");
 }
 document.querySelectorAll("[data-sample]").forEach(el=>el.addEventListener("click",async()=>{
  const kind=el.dataset.sample;
  try{el.disabled=true;await getSample(kind);}catch(e){$(kind+"-provenance").textContent="보관 샘플 오류: "+msg(e);}finally{el.disabled=false;}
 }));
 for(const kind of ["normal","scratch"]){
  $("file-"+kind).addEventListener("change",e=>{
   try{if(e.target.files?.[0])setPhoto(kind,e.target.files[0],"user-selected");}
   catch(err){$(kind+"-provenance").textContent=msg(err);}
  });
  $("run-"+kind).addEventListener("click",()=>runInfer(kind));
 }
 async function runInfer(kind){
  const source=sample[kind];if(!source)return;
  const b=$("run-"+kind);b.disabled=true;b.textContent="실제 PatchCore 추론 중…";
  try{
   const digest=await hash(source.file);
   const form=new FormData();form.append("image",source.file,source.file.name);
   form.append("expected_sha256",digest);form.append("specimen_id","IE-DEMO-001");
   const data=await json("/api/modelb/infer",{method:"POST",body:form,signal:AbortSignal.timeout(180000)});
   if(data.original_image_sha256!==digest||data.model_checkpoint_sha256!==pinned)throw Error("원본 SHA-256 또는 모델 체크포인트가 일치하지 않습니다.");
   if(!["PASS","REVIEW_REQUIRED"].includes(data.decision)||!Number.isFinite(Number(data.score_raw)))throw Error("모델 출력 스키마 검증 실패");
   const threshold=Number(state.data?.model.thresholdRaw??data.threshold_raw);
   if(data.decision!==(Number(data.score_scaled)>Number(data.threshold_scaled)?"REVIEW_REQUIRED":"PASS"))throw Error("판정과 임계값 불일치");
   reports[kind]={...data,provenance:source.origin,verifiedOriginalSHA256:digest};
   $(kind+"-score").textContent=Number(data.score_raw).toFixed(3);
   $(kind+"-decision").textContent=data.decision;
   $(kind+"-decision").className="decision "+(data.decision==="PASS"?"pass":"review");
   $(kind+"-provenance").textContent=(source.origin==="archived"?"보관 사진 재추론":"이번 세션 입력 이미지 실제 추론")+" · SHA256 "+digest.slice(0,15)+"… · "+Number(data.inference_elapsed_ms).toLocaleString("en-US")+"ms · Station 서명/온체인 제출 없음";
   updateComparison();
  }catch(e){$(kind+"-provenance").textContent="추론 검증 실패: "+msg(e);}
  finally{b.disabled=false;b.textContent=kind==="normal"?"Supplier 실제 AI 검사 실행":"Buyer 실제 AI 검사 실행";}
 }
 function updateComparison(){
  const a=reports.normal,b=reports.scratch;
  const h=$("comparison-title"),d=$("comparison-detail");
  if(a&&b){
   const conflict=a.decision==="PASS"&&b.decision==="REVIEW_REQUIRED";
   h.textContent=conflict?(a.provenance==="archived"&&b.provenance==="archived"?"PASS ↔ REVIEW_REQUIRED · 보관 이미지 2건(동일 실물 아님)":"PASS ↔ REVIEW_REQUIRED · 검사 결과 차이 확인"):"두 검사 결과 확인 · 목표 충돌 조건은 미충족";
   d.textContent="Supplier "+Number(a.score_raw).toFixed(3)+" / Buyer "+Number(b.score_raw).toFixed(3)+
     " · 원본 SHA-256 검증 PASS · 각각 "+(a.provenance==="archived"?"사전 보관":"신규 입력")+", "+(b.provenance==="archived"?"사전 보관":"신규 입력")+
     " · Model B 오프체인 추론 결과이며, 동일 제품/온체인 분쟁으로 자동 간주하지 않습니다.";
  }else{h.textContent=a||b?"다른 역할의 사진도 실제 추론하면 비교할 수 있습니다.":"두 결과를 확인하면 충돌을 비교합니다.";d.textContent="원본 파일 SHA-256과 모델 체크포인트가 일치할 때만 검사 결과를 표시합니다.";}
 }
 async function verifyReplay(){
  const btn=$("verify-replay");btn.disabled=true;btn.textContent="Red-Team 검증 자료 확인 중…";
  try{
   const r=await json("/api/stage/replay");state.redTeam=r;
   if(r.checks!==36||r.localRedTeam?.passed!==true)throw Error("검증되지 않은 Red-Team 결과");
   $("replay-badge").textContent=r.liveSepoliaExecutionHoldProven?"LIVE SEPOLIA HOLD CONFIRMED":"LOCAL RED-TEAM PASS";$("replay-badge").className="status-pill good";
   $("replay-environment").textContent=r.liveSepoliaExecutionHoldProven?"Sepolia · chain "+r.chainId:"Anvil 31338 · Sepolia state "+r.currentTradeState;
   $("replay-count").textContent=r.checks+" PASS / "+r.failures+" FAIL";
   $("replay-proof").textContent=[
    "> CHECK: recordReplayResult(attestation, signature)",
    "> signed ReplayAttestation.consistent = false",
    "> transition: DISPUTED_PRIMARY(12) → EXECUTION_HOLD(14)",
    "> test: "+r.localRedTeam.assertion,
    "> evidence SHA-256: "+r.recordSha256.slice(0,28)+"…",
    r.liveSepoliaExecutionHoldProven?"> Sepolia TX: "+r.liveReplayTx:"> scope: LOCAL SYNTHETIC ANVIL (new Sepolia HOLD not yet proven)"
   ].join("\n");
  }catch(e){$("replay-proof").textContent="Red-Team 증거 확인 실패: "+msg(e);}
  finally{btn.disabled=false;btn.textContent="실제 Red-Team 검증 근거 확인";}
 }
 $("verify-replay").addEventListener("click",verifyReplay);
 async function verifyPolicy(){
  const btn=$("verify-policy");btn.disabled=true;btn.textContent="온체인 정책 조회 중…";
  try{
   const r=await json("/api/stage/policy");state.policy=r;
   $("policy-original").textContent=r.onchainFixedHash;
   $("policy-tampered").textContent=r.attackerProposedHash;
   const real=r.actualSepoliaRevertExecuted;
   const checked=r.localAnvilRevertVerified&&r.hashesDiffer&&r.policyUnchangedVerified&&r.stateUnchangedVerified&&!r.onchainPolicyChanged;
   if(!checked)throw Error("변조 거절 검증 근거가 불충분합니다.");
   const result=$("policy-result");result.classList.add("proven");
   result.querySelector(".large-symbol").textContent="✕";
   result.querySelector("strong").textContent=real?"SEPOLIA STATICCALL · PolicyHashMismatch":"고정된 정책과 불일치 · 로컬 컨트랙트 거절 검증 PASS";
   result.querySelector("p").textContent=real?
      "현재 Sepolia AWAIT_SUPPLIER 거래에서 실제 eth_call이 PolicyHashMismatch로 거절되었습니다. 가스비와 상태 변경은 발생하지 않았습니다.":
      "실제 Sepolia 거래에서 정책 해시를 읽어 불일치를 확인했습니다. 다만 현재 거래 상태가 "+r.candidacyState+
      "이므로 동일 거래에 대한 PolicyHashMismatch eth_call은 실행하지 않았습니다. 거절 동작은 Anvil Red-Team 36건 중 해당 테스트로 검증됐습니다.";
  }catch(e){
   const result=$("policy-result");result.querySelector("strong").textContent="검증 불가";
   result.querySelector("p").textContent=msg(e);
  }finally{btn.disabled=false;btn.textContent="정책 변조 검증 실행 (가스 0)";}
 }
 $("verify-policy").addEventListener("click",verifyPolicy);
 refreshStatus();
 if(["a","b","c"].includes(location.hash.slice(1)))scene(location.hash.slice(1));
})();
