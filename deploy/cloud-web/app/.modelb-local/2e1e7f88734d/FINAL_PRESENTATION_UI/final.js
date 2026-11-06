"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const shaPin = "8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854";
  const thresholdScaled = 38280373;
  const candidateTrade = "0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff";
  const refundTrade = "0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c";
  const refundTx = "0x5183318aafe01643879771af8d66820dc3e2bfeb206ec9881323d7735c168bd2";
  const demo = {
    active: "platform", scene: "refund", step: 0, source: {normal: null, scratch: null},
    inference: {normal: null, scratch: null}, evidence: {normal: null, scratch: null},
    replay: {normal: null, scratch: null}, sessions: {}, objectUrls: {normal: null, scratch: null},
    modelLoaded: false, busy: false, subpage: "e2e", activeFrameUrl: null, holdReportShown: false
  };
  const refund = [
    {short:"BUYER REVIEW",title:"Buyer가 AI 검사 결과에 이의를 제기합니다",description:"Supplier PASS 이후 Buyer REVIEW가 접수되면서 거래가 분쟁 경로로 진입했습니다.",metric:"DISPUTED",caption:"Supplier PASS → Buyer REVIEW",scope:"PATCH2 · MODEL A · SEPOLIA 기존 실거래",proof:"기존 PATCH2 Sepolia 거래 이력",note:"기존에 완료된 Sepolia 분쟁 거래의 단계별 사실을 보여줍니다. 지금 새 거래를 발생시키지 않습니다."},
    {short:"PRIMARY TIMEOUT",title:"Primary Inspector의 기한이 지나 Backup이 전환됩니다",description:"Primary Inspector의 처리 기한 이후 Backup Inspector가 이어받는 liveness 경로입니다.",metric:"BACKUP",caption:"기한 기반 Backup Inspector 전환",scope:"PATCH2 · MODEL A · SEPOLIA 기존 실거래",proof:"기존 PATCH2 Sepolia 거래 이력",note:"Primary timeout / Backup 전환을 검증한 기존 거래이며, 이 화면에서 시간을 임의로 가속하지 않습니다."},
    {short:"REPLAY CONSISTENT",title:"Backup Inspector의 Replay 결과는 CONSISTENT",description:"Replay가 원래 검사 점수의 재현성을 확인합니다. 결과가 일치한다고 대금이 자동 지급되지는 않습니다.",metric:"CONSISTENT",caption:"재현성 검증 ≠ 정산 결정",scope:"PATCH2 · MODEL A · SEPOLIA 기존 실거래",proof:"기존 PATCH2 Sepolia Replay 기록",note:"Replay의 일치는 정산 판단과 별개입니다."},
    {short:"INSPECTOR REFUND",title:"Inspector가 별도로 구매자 환급을 결정합니다",description:"정산 정책과 분쟁 증거에 따라 Inspector가 REFUND_TO_BUYER를 선택했습니다.",metric:"REFUND",caption:"REFUND_TO_BUYER · claimable",scope:"PATCH2 · MODEL A · SEPOLIA 기존 실거래",proof:"기존 PATCH2 Sepolia 정산 기록",note:"정산은 claimable 수령권 기록과 최종 withdraw로 구분됩니다."},
    {short:"BUYER WITHDRAW",title:"실제 Sepolia에서 구매자 환급·Withdraw까지 완료",description:"Buyer가 환급액 0.005 Sepolia ETH를 출금했습니다. 아래 Etherscan 영수증으로 확인할 수 있습니다.",metric:"0.005 ETH",caption:"BUYER WITHDRAW COMPLETED",scope:"PATCH2 · MODEL A · 실제 SEPOLIA 완료",proof:"Sepolia 실제 Withdraw TX",note:"이 TX는 PATCH2 Model A의 기존 완료 거래입니다. 이번 신규 라이브 사진의 거래가 아닙니다."}
  ];
  const tamper = [
    {short:"ORIGINAL EVIDENCE",title:"정상적인 원본 증거를 먼저 확인합니다",description:"원본 이미지·증거 해시와 원래 검증 근거는 그대로 둡니다. 공격은 별도의 통제된 점수 주장에 적용합니다.",metric:"HASH INTACT",caption:"원본 증거의 바이트·해시를 변경하지 않음",scope:"MODEL B · CONTROLLED RED-TEAM",proof:"Local Browser Test + Local Anvil",note:"통제 검증: 원본 증거의 무결성을 유지한 상태에서 별도 주장 점수를 바꿉니다."},
    {short:"SCORE +1",title:"공격자가 주장한 점수를 단 1만큼 바꿉니다",description:"실제 재추론 점수 37,078,381 (scaled) 대신 37,078,382를 주장하도록 테스트 입력을 만듭니다.",metric:"+1",caption:"37,078,381 → 37,078,382 (scaled)",scope:"MODEL B · CONTROLLED SCORE OVERRIDE",proof:"Local Red-Team 통제 주장 점수",note:"+1은 원시 점수 1점이 아니라 정수 스케일 점수 1단위(0.000001)입니다. 새로운 악성 서명을 실제로 발행한 것은 아닙니다."},
    {short:"REPLAY RERUN",title:"Inspector가 원본 이미지를 실제 Model B로 다시 검사합니다",description:"제출 주장만 비교하지 않고 고정된 체크포인트와 원본 TOP으로 AI 재실행합니다.",metric:"37,078,381",caption:"실제 AI Replay 점수 (scaled)",scope:"MODEL B · REAL INDEPENDENT RE-INFERENCE",proof:"기존 Local Model B 재추론 테스트",note:"이 수치는 검증된 테스트의 기록입니다. 이 녹화 화면에서 새 Model B 추론을 발생시키는 것은 아닙니다."},
    {short:"COMPARE",title:"서명·해시 검증만으로는 판단할 수 없는 점수 차이를 잡습니다",description:"통제 주장값과 AI 재추론값의 차이 1, 허용 오차 0. 기존 원본 증거 해시는 변경하지 않습니다.",metric:"1 > 0",caption:"차이 1 · tolerance 0 · 검출",scope:"MODEL B · CONTROLLED RED-TEAM",proof:"로컬 AI Replay 점수 비교",note:"현재 증빙은 원본의 정상 서명·해시와 별도 통제 주장 점수의 비교입니다. 조작 점수가 유효한 새 서명으로 온체인 제출됐다는 증거는 아닙니다."},
    {short:"INCONSISTENT",title:"AI 재실행 결과가 통제 주장 점수와 일치하지 않습니다",description:"독립 Replay가 INCONSISTENT를 산출합니다. 자동 정산으로 넘어가서는 안 됩니다.",metric:"INCONSISTENT",caption:"Replay 불일치 · 자동 지급 차단",scope:"MODEL B · LOCAL INDEPENDENT REPLAY",proof:"로컬 독립 재추론 검증 결과",note:"실제 Sepolia 신규 거래에서 이 불일치 값을 제출한 것은 아닙니다."},
    {short:"EXECUTION_HOLD",title:"스마트컨트랙트는 EXECUTION_HOLD로 정산을 보류합니다",description:"로컬 Anvil Red-Team에서 불일치 Replay 서명 시 상태 전이와 지급 차단을 검증했습니다.",metric:"EXECUTION_HOLD",caption:"Local Anvil contract test · 36/36 PASS",scope:"PATCH3 · LOCAL ANVIL SECURITY TEST",proof:"서버에서 Local Anvil Red-Team 출처 조회",note:"Local Anvil 증빙이며 신규 Sepolia HOLD TX는 없습니다. EXECUTION_HOLD는 환급 완료 상태가 아닙니다."}
  ];
  const msg = e => String(e?.message || e || "UNKNOWN_ERROR").slice(0,320);
  const short = (s,n=19) => String(s || "—").length>n?String(s).slice(0,12)+"…"+String(s).slice(-8):String(s||"—");
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url, options={}){
    const res = await fetch(url,{cache:"no-store",...options});
    const contentType = res.headers.get("content-type") || "";
    if(!contentType.includes("application/json"))throw Error("HTTP "+res.status+" · JSON 응답 없음");
    const value = await res.json();
    if(!res.ok)throw Error(value.detail||value.error||"HTTP_"+res.status);
    return value;
  }
  function setStateBadge(id,good,text){const e=$(id);e.textContent=text;e.className="led-tag "+(good?"ok":"bad");}
  async function refreshAll(){
    const checks=await Promise.allSettled([api("/api/ping"),api("/api/modelb/status"),api("/api/stage/status")]);
    setStateBadge("web-status",checks[0].status==="fulfilled",checks[0].status==="fulfilled"?"WEB · ONLINE":"WEB · OFFLINE");
    if(checks[1].status==="fulfilled"){
      const d=checks[1].value;demo.modelLoaded=Boolean(d.model_loaded);
      const valid=d.checkpoint_sha256===shaPin&&d.artifact_commitment?.verified===true;
      setStateBadge("ai-status",valid,valid?"MODEL B · "+(demo.modelLoaded?"WARM":"COLD"):"MODEL B · CHECKPOINT 확인");
      $("proof-model").textContent=valid?(demo.modelLoaded?"MODEL WARM":"MODEL COLD"):"검증 필요";
      $("proof-model-note").textContent=valid?"고정 체크포인트 검증 · "+(demo.modelLoaded?"첫 로딩 완료":"첫 추론 시 모델 로딩 필요"):"모델 또는 원본 검증 필요";
    }else{setStateBadge("ai-status",false,"MODEL B · OFFLINE");$("proof-model").textContent="AI SERVER OFFLINE";}
    if(checks[2].status==="fulfilled"){
      const d=checks[2].value;
      setStateBadge("chain-status",Boolean(d.chain),d.chain?"SEPOLIA · READ ONLY":"SEPOLIA · RPC 확인");
      $("proof-tests").textContent=(d.redTeam?.checks||0)+"/36 PASS";
    }else setStateBadge("chain-status",false,"SEPOLIA · RPC 확인");
    if(!demo.holdReportShown)$("proof-diagnostics").textContent=checks.map((c,i)=>["웹 서버", "Model B", "Sepolia / Red-Team"][i]+": "+(c.status==="fulfilled"?"조회 PASS":msg(c.reason))).join("\n");
  }
  function switchTab(tab){
    if(!["platform","record","live","evidence","settlement","proof"].includes(tab))return;
    demo.active=tab;
    document.querySelectorAll(".tab").forEach(x=>{const on=x.dataset.tab===tab;x.classList.toggle("active",on);x.setAttribute("aria-selected",String(on));});
    document.querySelectorAll(".pane").forEach(x=>x.classList.toggle("active",x.dataset.pane===tab));
    if(tab==="settlement")showSubpage(demo.subpage);
    if(tab==="proof")refreshAll().catch(()=>{});
    window.scrollTo({top:0,behavior:"smooth"});
    history.replaceState(null,"","#"+tab);
  }
  function selectScene(scene){demo.scene=scene;demo.step=0;document.querySelectorAll(".scene-choice").forEach(x=>x.classList.toggle("selected",x.dataset.case===scene));renderRecorded();}
  function renderRecorded(){
    const list=demo.scene==="refund"?refund:tamper, item=list[demo.step];
    $("rec-scope").textContent=item.scope;
    $("rec-title").textContent=String(demo.step+1).padStart(2,"0")+" · "+item.title;
    $("rec-desc").textContent=item.description;
    $("rec-progress").textContent=String(demo.step+1).padStart(2,"0")+" / "+String(list.length).padStart(2,"0");
    $("rec-flow").replaceChildren();
    list.forEach((e,i)=>{const b=document.createElement("button");b.type="button";b.className="flow-step "+(i<demo.step?"done":i===demo.step?"current":"");b.textContent=e.short;b.addEventListener("click",()=>{demo.step=i;renderRecorded();});$("rec-flow").appendChild(b);});
    $("rec-metric-label").textContent=demo.scene==="refund"?"REAL SEPOLIA RECORD":"MODEL B · LOCAL RED-TEAM";
    $("rec-metric").textContent=item.metric;$("rec-metric-caption").textContent=item.caption;
    $("rec-proof-type").textContent=item.proof;
    $("rec-proof-id").textContent=demo.scene==="refund"?"Trade "+short(refundTrade,24):"Controlled score test · 37,078,381 vs 37,078,382";
    $("rec-proof-note").textContent=item.note;
    const link=$("rec-proof-link");
    if(demo.scene==="refund"){link.hidden=false;link.href="https://sepolia.etherscan.io/tx/"+refundTx;link.textContent="실제 Sepolia Withdraw 영수증 ↗";}
    else{link.hidden=false;link.href="/replay";link.textContent="실제 통제 Replay 실행 콘솔 ↗";}
    $("rec-guard").textContent=demo.scene==="refund"?"PATCH2 Model A · 기존 Sepolia 정산 영수증 / 실시간 새 TX 아님":"Model B 통제된 허위 주장값 + Local Anvil 실행 검증 / 신규 Sepolia TX 없음";
    $("rec-next").disabled=false;
    $("rec-next").textContent=demo.step===list.length-1?(demo.scene==="refund"?"두 번째 시나리오로 →":"시나리오 다시 시작 ↺"):"다음 검증 단계 →";
  }
  async function verifyRecorded(){
    const btn=$("rec-verify");btn.disabled=true;
    try{
      if(demo.scene==="refund"){
        $("rec-proof-note").textContent="PATCH2 Model A 기존 Sepolia Withdraw TX 영수증을 확인하세요. 이 UI에서 새로 환급 TX를 보내지 않습니다.";
      }else{
        const d=await api("/api/stage/replay");
        const pass=d.checks===36&&d.failures===0&&d.localRedTeam?.passed===true;
        $("rec-proof-note").textContent=pass?"실제 서버 검증 근거: Local Anvil 36 PASS / 0 FAIL · "+(d.localRedTeam?.assertion||"Replay mismatch HOLD")+" · 신규 Sepolia HOLD "+(d.liveSepoliaExecutionHoldProven?"확인됨":"미검증"):"Local Red-Team 검증 불충분. 기존 보고서와 현행 환경을 확인하세요.";
      }
    }catch(e){$("rec-proof-note").textContent="현재 서버에서 실증 근거를 조회하지 못했습니다: "+msg(e)+" · 보관 기록의 상태와 구분하세요.";}
    finally{btn.disabled=false;}
  }
  function nextRecorded(){
    const list=demo.scene==="refund"?refund:tamper;
    if(demo.step<list.length-1){demo.step++;renderRecorded();}
    else if(demo.scene==="refund")selectScene("tamper");
    else {demo.step=0;renderRecorded();}
  }
  function assertImage(file){
    if(!(file instanceof File))throw Error("이미지 파일을 선택하세요.");
    if(!["image/jpeg","image/png"].includes(file.type)||file.size<500||file.size>20*1024*1024)throw Error("500B~20MiB JPEG/PNG만 선택하세요.");
  }
  function sha256(file){return file.arrayBuffer().then(data=>crypto.subtle.digest("SHA-256",data)).then(buffer=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,"0")).join(""));}
  function fileBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=()=>reject(Error("파일 읽기 실패"));reader.readAsDataURL(file);});}
  function setPhoto(kind,file,source){
    assertImage(file);
    if(demo.objectUrls[kind])URL.revokeObjectURL(demo.objectUrls[kind]);
    const url=URL.createObjectURL(file);demo.objectUrls[kind]=url;
    demo.source[kind]={file,source};demo.inference[kind]=null;demo.evidence[kind]=null;demo.replay[kind]=null;
    const p=$(kind+"-preview");p.replaceChildren();const img=document.createElement("img");img.src=url;img.alt=kind==="normal"?"정상 이미지":"스크래치 이미지";p.appendChild(img);
    $(kind+"-score").textContent="—";
    const d=$(kind+"-decision");d.textContent="검사 전";d.className="decision pending";
    $(kind+"-detail").textContent=(source==="archived"?"사전 보관 원본":"이번 세션에서 업로드한 파일")+" · "+file.name+" · "+(file.size/1024/1024).toFixed(2)+" MiB";
    $("run-"+kind).disabled=false;
    $("top-name-"+kind).textContent=file.name;
    $("evidence-status-"+kind).textContent="새 TOP 원본을 선택했습니다. FRONT/SIDE를 입력하고 Evidence를 생성하세요.";
    $("replay-"+kind).disabled=true;$("download-"+kind).disabled=true;
    $("replay-status-"+kind).textContent="Replay 전";
    updateLiveVerdict();
  }
  async function sample(kind){
    const b=$("sample-"+kind);b.disabled=true;
    try{
      const r=await fetch("/api/stage/sample?kind="+kind,{cache:"no-store"});if(!r.ok)throw Error("샘플 서버 HTTP "+r.status);
      const blob=await r.blob(),filename=kind==="normal"?"S05_SUPPLIER_TOP_20261029_01.jpg.jpg":"S03_deep_scratch1.jpg.jpg";
      setPhoto(kind,new File([blob],filename,{type:"image/jpeg"}),"archived");
    }catch(e){$(kind+"-detail").textContent="보관 샘플 로딩 실패: "+msg(e);}
    finally{b.disabled=false;}
  }
  async function infer(kind){
    const source=demo.source[kind];if(!source)return;
    const button=$("run-"+kind);button.disabled=true;const original=button.textContent;
    button.textContent="실제 Model B 추론 중…";
    $(kind+"-detail").textContent="원본 SHA-256 계산·모델 체크포인트 검증 중… 첫 실행은 모델 로딩이 포함됩니다.";
    try{
      const digest=await sha256(source.file);
      const form=new FormData();form.append("image",source.file,source.file.name);form.append("expected_sha256",digest);form.append("specimen_id","IE-DEMO-001");
      const d=await api("/api/modelb/infer",{method:"POST",body:form,signal:AbortSignal.timeout(180000)});
      if(d.original_image_sha256!==digest)throw Error("원본 SHA-256 불일치");
      if(d.model_checkpoint_sha256!==shaPin)throw Error("고정 체크포인트 불일치");
      if(!Number.isSafeInteger(d.score_scaled)||!Number.isFinite(Number(d.score_raw)))throw Error("AI 점수 유효성 실패");
      if(d.decision!==(d.score_scaled>thresholdScaled?"REVIEW_REQUIRED":"PASS"))throw Error("임계값·AI 판정 불일치");
      demo.inference[kind]={...d,source:source.source,sha256:digest};
      $(kind+"-score").textContent=Number(d.score_raw).toFixed(6);
      const decision=$(kind+"-decision");decision.textContent=d.decision;decision.className="decision "+(d.decision==="PASS"?"pass":"review");
      $(kind+"-detail").textContent="실제 재추론 완료 · "+source.source+" · "+(d.inference_elapsed_ms||0)+" ms · TOP SHA-256 "+short(digest,25)+" · ONCHAIN TX 0";
      demo.modelLoaded=true;setStateBadge("ai-status",true,"MODEL B · WARM");
      updateLiveVerdict();
    }catch(e){
      $(kind+"-detail").textContent="AI 추론 실패: "+msg(e)+" · 8766 서버 및 메모리 상태 확인";
      const d=$(kind+"-decision");d.textContent="실패";d.className="decision fail";
      updateLiveVerdict();
    }finally{button.disabled=false;button.textContent=original;}
  }
  function updateLiveVerdict(){
    const a=demo.inference.normal,b=demo.inference.scratch;
    if(a&&b){const match=a.decision==="PASS"&&b.decision==="REVIEW_REQUIRED";
      $("live-verdict").textContent=match?"PASS ↔ REVIEW_REQUIRED · 두 실제 추론의 판정 차이 확인":"두 이미지 실제 추론 완료 · 판정 조합 확인";
      $("live-note").textContent="Supplier "+Number(a.score_raw).toFixed(6)+" / Buyer "+Number(b.score_raw).toFixed(6)+" · 양쪽 TOP SHA 검증 PASS · 각각 "+a.source+"/"+b.source+" · 온체인 분쟁 자동 생성 아님";
      $("go-evidence").disabled=false;
    }else {$("live-verdict").textContent=a||b?"한쪽 검사 완료 · 나머지 사진도 추론하세요.":"두 이미지를 검사하면 비교 결과가 나타납니다.";$("live-note").textContent="두 개의 점수는 동일한 고정 모델을 이용한 실제 API 결과만 표시합니다.";$("go-evidence").disabled=true;}
  }
  function tradeId(){const id=$("trade-id").value.trim();if(!/^0x[0-9a-fA-F]{64}$/.test(id))throw Error("유효한 32바이트 Trade ID를 입력하세요.");return id;}
  function selectedViewFiles(kind){
    const top=demo.source[kind]?.file||$("top-input-"+kind).files?.[0];
    const front=$("front-"+kind).files?.[0],side=$("side-"+kind).files?.[0];
    for(const file of [top,front,side])assertImage(file);
    return {TOP:top,FRONT:front,SIDE:side};
  }
  async function imagePayload(files){const result={};for(const view of ["TOP","FRONT","SIDE"]){const file=files[view];result[view]={name:file.name,data:await fileBase64(file)};}return result;}
  function currentSession(kind){const key=kind+"-"+tradeId();if(!demo.sessions[key])demo.sessions[key]={sessionId:"LIVE-"+crypto.randomUUID(),sessionCreatedAtUtc:new Date().toISOString()};return demo.sessions[key];}
  function jsonRequest(body){return {method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(body)};}
  async function buildEvidence(kind){
    const btn=$("build-"+kind);btn.disabled=true;
    const result=$("evidence-status-"+kind);result.textContent="실제 Model B 재추론 + 세 원본의 SHA-256/manifest/evidence hash 생성 중…";
    try{
      const files=selectedViewFiles(kind),id=tradeId(), session=currentSession(kind);
      const body={tradeId:id,role:kind==="normal"?"supplier":"buyer",operatorSpecimenId:$("label-"+kind).value.trim(),
        ...session,sourceClassification:demo.source[kind]?.source==="archived"?"ARCHIVED_PHOTO_REUSED_IN_LIVE_DEMO":"OPERATOR_UPLOADED_NOT_PHYSICALLY_VERIFIED",images:await imagePayload(files)};
      const value=await api("/api/live/build",jsonRequest(body));
      if(!value.ok||!value.bundle||value.onchainSubmitted!==false||value.stationSignatureComplete!==false)throw Error("Evidence 응답 상태 무결성 실패");
      demo.evidence[kind]={bundle:value.bundle,files,tradeId:id,hashes:value.hashes,decision:value.decision,score:value.scoreRaw};demo.replay[kind]=null;
      result.textContent="OFFCHAIN Evidence 생성 완료 · "+value.decision+" / "+Number(value.scoreRaw).toFixed(6)+"\nManifest "+value.hashes.specimenManifestHash+"\nEvidence "+value.hashes.evidencePackageHash+"\nUNSIGNED · NOT SUBMITTED · TX 0";
      $("replay-"+kind).disabled=false;$("download-"+kind).disabled=false;
      $("replay-status-"+kind).textContent="Evidence 준비 완료 · 서명 없는 오프체인 단일 역할 Replay 가능";
      $("evidence-verdict").textContent="실제 3뷰 Evidence 준비 완료 · 서명 없음 · 온체인 TX 0";
    }catch(e){demo.evidence[kind]=null;demo.replay[kind]=null;$("replay-"+kind).disabled=true;$("download-"+kind).disabled=true;result.textContent="Evidence 생성 실패 · "+msg(e);}
    finally{btn.disabled=false;}
  }
  async function runReplay(kind){
    const e=demo.evidence[kind];if(!e)return;
    const btn=$("replay-"+kind),output=$("replay-status-"+kind);btn.disabled=true;output.textContent="원본/해시 재검증 후 실제 TOP 이미지 독립 PatchCore 재추론 중…";
    try{
      // Evidence must remain tied to identical files and unchanged trade ID.
      if(e.tradeId!==tradeId())throw Error("Evidence 생성 당시 Trade ID와 현재 값이 다릅니다.");
      const files=selectedViewFiles(kind);
      for(const view of ["TOP","FRONT","SIDE"])if(files[view]!==e.files[view])throw Error(view+" 원본을 변경했습니다. Evidence를 다시 생성하세요.");
      const value=await api("/api/live/replay",jsonRequest({expectedRole:kind==="normal"?"supplier":"buyer",bundle:e.bundle,images:await imagePayload(files)}));
      if(value.actualAiReplayExecuted!==true)throw Error("독립 AI Replay 실행 증거 없음");
      demo.replay[kind]=value;
      output.textContent="독립 Replay "+value.status+" · 제출 "+value.report.submittedScoreScaled+" / 재추론 "+value.report.replayScoreScaled+" · 오차 "+value.report.absoluteErrorScaled+"\nReport "+value.replayReportHash+"\n"+value.submissionGate+" · 온체인 TX 0";
      $("evidence-verdict").textContent="독립 Model B Replay "+value.status+" · 검사와 정산을 분리";
    }catch(err){demo.replay[kind]=null;output.textContent="Replay 검증 실패 · "+msg(err);}
    finally{btn.disabled=false;}
  }
  function downloadJson(kind){const v=demo.evidence[kind];if(!v)return;const data=JSON.stringify(v.bundle,null,2)+"\n";const url=URL.createObjectURL(new Blob([data],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="InspectEscrow-"+(kind==="normal"?"Supplier":"Buyer")+"-Evidence-UNSIGNED.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  async function checkTrade(){
    let t;try{t=tradeId();}catch(e){$("trade-status").textContent=msg(e);return;}
    $("trade-status").textContent="온체인 조회 중…";
    localStorage.setItem("inspectescrow.activeTrade.v1",t);
    try{
      const d=await api("/api/e2e/preflight?tradeId="+encodeURIComponent(t));
      $("trade-status").textContent=(d.stateName||({1:"PROPOSED",5:"AWAIT_SUPPLIER",8:"AWAIT_BUYER",12:"DISPUTED_PRIMARY",17:"RELEASED",18:"REFUNDED"}[d.state]||"STATE"))+"("+d.state+")";
      $("settlement-gate").textContent="Supplier 준비 "+(d.safeToPrepareSupplier?"YES":"NO")+" · Buyer 준비 "+(d.safeToPrepareBuyer?"YES":"NO")+" · Inspector Replay 준비 "+(d.safeToPrepareReplay?"YES":"NO")+" · 정책·기한·역할 조건 충족 시에만 실행 가능";
      $("selected-trade").textContent=t;
    }catch(e){$("trade-status").textContent="GATE 확인 실패";$("settlement-gate").textContent="거래 상태 조회 실패: "+msg(e);}
  }
  function showSubpage(mode){
    if(!["e2e","resolution","trades"].includes(mode))return;
    demo.subpage=mode;document.querySelectorAll("[data-subpage]").forEach(x=>x.classList.toggle("active",x.dataset.subpage===mode));
    let id;try{id=tradeId();}catch{id=candidateTrade;}
    localStorage.setItem("inspectescrow.activeTrade.v1",id);
    const url="/"+mode+"?tradeId="+encodeURIComponent(id);
    if(demo.activeFrameUrl!==url){$("contract-frame").src=url;demo.activeFrameUrl=url;}
    $("selected-trade").textContent=id;
    if(mode==="e2e"||mode==="resolution")checkTrade().catch(()=>{});
  }
  async function verifyHold(){
    demo.holdReportShown=true;
    const out=$("proof-diagnostics");out.textContent="Red-Team 증거와 실제 Sepolia 현행 상태 조회 중…";
    try{const d=await api("/api/stage/replay");const ok=d.localRedTeam?.passed===true&&d.checks===36&&d.failures===0;
      out.textContent="Local Anvil Red-Team: "+(ok?"36 PASS / 0 FAIL":"검증되지 않음")+"\n현재 Sepolia 신규 HOLD: "+(d.liveSepoliaExecutionHoldProven?"온체인 검증됨":"미검증")+"\nReplay record SHA256: "+(d.recordSha256||"—")+"\nLOCAL evidence: "+(d.localRedTeam?.assertion||"—");
    }catch(e){out.textContent="실시간 검증 조회 실패: "+msg(e)+"\n기존 Local Anvil 36/36 PASS 기록은 검증 보고서의 보관 결과입니다.";}
  }
  function initialise(){
    document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
    document.querySelectorAll("[data-case]").forEach(b=>b.addEventListener("click",()=>selectScene(b.dataset.case)));
    $("rec-next").addEventListener("click",nextRecorded);$("rec-verify").addEventListener("click",verifyRecorded);$("rec-reset").addEventListener("click",()=>selectScene(demo.scene));
    $("refresh-all").addEventListener("click",refreshAll);$("reload-proof").addEventListener("click",refreshAll);$("verify-hold").addEventListener("click",verifyHold);
    $("fullscreen").addEventListener("click",()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});});
    for(const kind of ["normal","scratch"]){
      $("sample-"+kind).addEventListener("click",()=>sample(kind));
      $("file-"+kind).addEventListener("change",e=>{try{if(e.target.files?.[0])setPhoto(kind,e.target.files[0],"user-selected");}catch(err){$(kind+"-detail").textContent=msg(err);}});
      $("run-"+kind).addEventListener("click",()=>infer(kind));
      $("top-pick-"+kind).addEventListener("click",()=>$("top-input-"+kind).click());
      $("top-input-"+kind).addEventListener("change",e=>{try{if(e.target.files?.[0])setPhoto(kind,e.target.files[0],"user-selected");}catch(err){$("evidence-status-"+kind).textContent=msg(err);}});
      for(const view of ["front","side"]){$(view+"-"+kind).addEventListener("change",()=>{demo.evidence[kind]=null;demo.replay[kind]=null;$("replay-"+kind).disabled=true;$("download-"+kind).disabled=true;$("evidence-status-"+kind).textContent="원본 뷰가 변경됐습니다. Evidence를 새로 생성하세요.";});}
      $("build-"+kind).addEventListener("click",()=>buildEvidence(kind));
      $("replay-"+kind).addEventListener("click",()=>runReplay(kind));
      $("download-"+kind).addEventListener("click",()=>downloadJson(kind));
    }
    $("go-evidence").addEventListener("click",()=>switchTab("evidence"));
    $("go-settlement").addEventListener("click",()=>switchTab("settlement"));
    $("check-trade").addEventListener("click",checkTrade);
    $("trade-id").addEventListener("change",()=>{for(const kind of ["normal","scratch"]){demo.evidence[kind]=null;demo.replay[kind]=null;$("replay-"+kind).disabled=true;$("download-"+kind).disabled=true;}checkTrade().catch(()=>{});if(demo.active==="settlement")showSubpage(demo.subpage);});
    document.querySelectorAll("[data-subpage]").forEach(b=>b.addEventListener("click",()=>showSubpage(b.dataset.subpage)));
    $("open-subpage").addEventListener("click",()=>{const u=$("contract-frame").src;if(u&&u!=="about:blank")window.open(u,"_blank","noopener");});
    window.addEventListener("beforeunload",()=>Object.values(demo.objectUrls).forEach(x=>x&&URL.revokeObjectURL(x)));
    renderRecorded();const startup=location.hash.slice(1);switchTab(["platform","record","live","evidence","settlement","proof"].includes(startup)?startup:"platform");
    refreshAll().catch(()=>{});
  }
  document.addEventListener("DOMContentLoaded",initialise);
})();
