"use strict";
(()=>{
const $=id=>document.getElementById(id),MAX=20*1024*1024,SESSION_KEY="inspectescrow.live-session.v1";
const state={config:null,files:{},urls:[],stream:null,cameraView:null,bundle:null,busy:false,sessionCreatedAtUtc:null,currentRole:"supplier",xai:null};
// Same-tab UI handoff only. No File, Evidence JSON, wallet key or signature is persisted.
const HANDOFF_KEY="__inspectEscrowEvidenceHandoff";

function sameTrade(a,b){return /^0x[0-9a-fA-F]{64}$/.test(a||"")&&String(a).toLowerCase()===String(b).toLowerCase();}
function roleStore(tradeId){
 if(!/^0x[0-9a-fA-F]{64}$/.test(tradeId||""))return null;
 const previous=window.__inspectEscrowRoleInspections;
 if(previous&&sameTrade(previous.tradeId,tradeId)){
   if(!previous.clearOnVisit)previous.clearOnVisit={supplier:false,buyer:false};
   return previous;
 }
 const fresh={tradeId,activeRole:null,roles:{supplier:null,buyer:null},clearOnVisit:{supplier:false,buyer:false}};
 const prior=window[HANDOFF_KEY];
 if(prior&&sameTrade(prior.tradeId,tradeId)&&["supplier","buyer"].includes(prior.role))
   fresh.roles[prior.role]=prior;
 window.__inspectEscrowRoleInspections=fresh;
 return fresh;
}
function roleRecord(store,role){
 const h=store?.roles?.[role];
 return h&&sameTrade(h.tradeId,store.tradeId)&&h.role===role?h:null;
}
function forgetHandoff(role=state.currentRole){
 const h=window[HANDOFF_KEY];
 if(h?.role===role)delete window[HANDOFF_KEY];
 const store=roleStore($("trade-id")?.value);
 if(store)store.roles[role]=null;
}
function saveHandoff(role=state.currentRole){
 const tradeId=$("trade-id")?.value;
 if(!sameTrade(tradeId,tradeId)||!["supplier","buyer"].includes(role))return;
 const snapshot={tradeId,role,files:{...state.files},bundle:state.bundle,inference:state.lastInference,xai:state.xai,
   specimenId:$("specimen-id").value,sessionId:$("session-id").value,
   sessionCreatedAtUtc:state.sessionCreatedAtUtc};
 const store=roleStore(tradeId);
 store.roles[role]=snapshot;
 store.clearOnVisit[role]=false;
 store.activeRole=role;
 window[HANDOFF_KEY]=snapshot;
 renderRoleComparison();
}
function restoreFiles(h){
 for(const view of ["TOP","FRONT","SIDE"]){
   const id=view.toLowerCase(),picker=$(id),preview=$(id+"-preview"),hash=$(id+"-hash");
   picker.value="";
   preview.removeAttribute("src");preview.style.display="none";
   hash.textContent="SHA-256 대기";
   const f=h?.files?.[view];
   if(!(f instanceof File))continue;
   const dt=new DataTransfer();dt.items.add(f);picker.files=dt.files;
   const url=URL.createObjectURL(f);state.urls.push(url);
   preview.src=url;preview.style.display="block";
   hash.textContent="파일 복원 · "+f.name+" · "+f.size+" bytes";
 }
}
function applyRoleSnapshot(h){
 for(const url of state.urls)URL.revokeObjectURL(url);
 state.urls=[];
 state.files=h?{...h.files}:{};
 state.bundle=h?.bundle||null;state.lastInference=h?.inference||null;state.xai=h?.xai||null;renderXai();
 $("specimen-id").value=h?.specimenId||"";
 state.sessionCreatedAtUtc=h?.sessionCreatedAtUtc||new Date().toISOString();
 $("session-id").value=h?.sessionId||"LIVE-"+crypto.randomUUID();
 restoreFiles(h);
 const d=state.lastInference;
 const inference=$("inference"),evidence=$("evidence-result");
 inference.className="result "+(d?(String(d.decision).includes("REVIEW")?"review":"pass"):"empty");
 inference.textContent=d?"이전 AI 검사 결과 복원 · "+d.decision+" · 점수 "+d.scoreRaw+" (재추론 없음)":
   "검사 전 · 현재 역할의 TOP 원본을 업로드하세요.";
 evidence.className="result "+(state.bundle?"pass":"empty");
 evidence.textContent=state.bundle?
   "현재 역할의 Evidence Bundle 복원 · UNSIGNED · NOT SUBMITTED":
   "현재 역할의 새로운 원본으로 Evidence Bundle을 생성하세요.";
 $("download").disabled=!state.bundle;
 setFlow();
}
async function hydrateHandoff(tradeId){
 const store=roleStore(tradeId);
 if(!store)return;
 const desired=store.activeRole||$("role").value||"supplier";
 const role=["supplier","buyer"].includes(desired)?desired:"supplier";
 state.currentRole=role;$("role").value=role;
 const h=store.clearOnVisit?.[role]?null:roleRecord(store,role);
 applyRoleSnapshot(h);
 if(h)window[HANDOFF_KEY]=h;else delete window[HANDOFF_KEY];
 renderRoleComparison();
}
function renderRoleComparison(){
 const store=window.__inspectEscrowRoleInspections;
 if(!store||!sameTrade(store.tradeId,$("trade-id")?.value))return;
 const s=roleRecord(store,"supplier"),b=roleRecord(store,"buyer");
 for(const role of ["supplier","buyer"]){
  const h=role==="supplier"?s:b;
  const prefix=role==="supplier"?"supplier":"buyer";
  const record=h?.bundle;
  const decision=String(record?.decision||h?.inference?.decision||"검사 대기");
  const result=$(prefix+"-summary-decision");
  result.textContent=decision;
  result.className="role-summary-decision "+(decision.includes("REVIEW")?"review":decision.includes("PASS")?"pass":"idle");
  const count=["TOP","FRONT","SIDE"].filter(v=>h?.files?.[v] instanceof File).length;
  $(prefix+"-summary-detail").textContent=count+"/3뷰 확보 · "+(h?.inference?.scoreRaw===undefined?"AI 미실행":"AI 점수 "+h.inference.scoreRaw)+
     " · "+(record?"Evidence 준비됨":"Evidence 미완성")+(h?.xai?" · XAI 근거 확보":"");
  $(prefix+"-summary-hash").textContent=record?
     ("Evidence "+String(record.hashes?.evidencePackageHash||record.evidencePackageHash||record.manifest?.sessionId||"생성됨")):
     "Evidence 생성 전 · 오프체인";
  $(prefix+"-summary-download").disabled=!record;
  $(prefix+"-summary-card").classList.toggle("active",state.currentRole===role);
  $(prefix+"-summary-switch").textContent=state.currentRole===role?"현재 검사 역할":"이 역할로 검사";
 }
 const a=String(s?.bundle?.decision||s?.inference?.decision||"");
 const c=String(b?.bundle?.decision||b?.inference?.decision||"");
 const complete=!!s?.bundle&&!!b?.bundle;
 const collision=complete&&a.includes("PASS")&&c.includes("REVIEW");
 const summary=$("inspection-contrast");
 summary.classList.toggle("contrast",collision);
 summary.textContent=collision?
  "검사 결과 충돌 시나리오 · 공급사 PASS / 구매사 REVIEW · 미서명 Evidence 2건 생성 · 온체인 거래 자동 제출 없음":
  complete?
   "양측 Evidence 생성 완료 · 서로 다른 판정인지 비교하세요. 실제 분쟁 상태는 별도 온체인 확인 필요":
   "각 기업은 별도의 3뷰와 검사 세션을 사용합니다. 두 Evidence가 모두 준비되면 결과를 비교합니다.";
 $("role-guide").textContent=state.currentRole==="supplier"?
  "공급사 출하 검사: 정상 너트 3뷰 → AI PASS → Evidence A 저장 후 구매사로 전환":
  "구매사 입고 검사: 공급사 사진은 사용하지 않고 구매사 3뷰 → AI REVIEW → Evidence B 저장";
}
function switchRole(role){
 if(!["supplier","buyer"].includes(role))return;
 if(state.busy){$("role").value=state.currentRole;alert("현재 AI 추론 또는 증거 생성이 끝난 뒤 역할을 바꾸세요.");return;}
 if(role===state.currentRole){$("role").value=role;renderRoleComparison();return;}
 const store=roleStore($("trade-id").value);
 stopCamera();
 if(Object.keys(state.files).length||state.bundle||state.lastInference)saveHandoff(state.currentRole);
 state.currentRole=role;$("role").value=role;
 if(store){store.activeRole=role;store.clearOnVisit[role]=true;}
 // Every role transition is a fresh upload station. Only the already-created
 // Evidence/score remains archived in the separate comparison/history store.
 // Nothing is silently pre-filled, including on switching BACK to a role.
 applyRoleSnapshot(null);
 delete window[HANDOFF_KEY];
 updatePresetControls();
 persist();renderRoleComparison();
}

const PRESET_BASE="/demo-presets/nut5/";
let presetManifest=null;
const PRESET_VIEWS=["TOP","FRONT","SIDE"];
function updatePresetControls(){
 const ready=Boolean(presetManifest?.roles?.[state.currentRole]&&!state.busy);
 for(const view of PRESET_VIEWS){
   const button=document.querySelector('[data-preset-view="'+view+'"]');
   if(!button)continue;
   button.disabled=!ready;
   const roleLabel=state.currentRole==="supplier"?"정상":"불량";
   button.textContent="보관된 "+roleLabel+" "+view+" 불러오기";
   button.title=ready?"등록된 5번 너트 "+roleLabel+" "+view+" 원본을 그대로 불러옵니다. 실제 AI 추론은 별도 버튼으로 실행됩니다.":"5번 너트 원본 사진 6장 등록 후 활성화";
 }
 const all=$("preset-all"),status=$("preset-status");
 if(all)all.disabled=!ready;
 if(status)status.textContent=ready?
   "5번 너트 "+(state.currentRole==="supplier"?"정상 3장":"불량 3장")+" 보관됨 · 실제 AI·XAI는 별도 실행":
   (presetManifest?"현재 역할의 보관 사진은 아직 등록되지 않았습니다.":"시연용 5번 너트 정상·불량 원본 등록 대기");
}
async function loadPresetManifest(){
 try{
   const response=await fetch(PRESET_BASE+"manifest.json",{cache:"no-store"});
   if(!response.ok)throw Error("아직 등록되지 않음");
   const manifest=await response.json();
   if(manifest.schema!=="InspectEscrow.Nut5PhotoPresets.v1")throw Error("보관 사진 목록 규격 불일치");
   let registeredRoleCount=0;
   for(const role of ["supplier","buyer"]){
    if(!manifest.roles?.[role])continue;
    registeredRoleCount++;
    for(const view of PRESET_VIEWS){
     const entry=manifest.roles[role][view];
     if(!entry||!/^nut5_(normal|defect)_(TOP|FRONT|SIDE)\.(jpg|jpeg|png)$/i.test(entry.filename)||
        !/^[a-f0-9]{64}$/i.test(entry.sha256))throw Error("보관 사진 6개 정보가 미완성입니다.");
     const expected="nut5_"+(role==="supplier"?"normal":"defect")+"_"+view+".";
     if(!entry.filename.startsWith(expected))throw Error("역할별 사진 매핑이 잘못됐습니다.");
    }
   }
   if(registeredRoleCount===0)throw Error("등록된 역할의 사진이 없습니다.");
   presetManifest=manifest;
 }catch(e){
   presetManifest=null;
 }finally{updatePresetControls();}
}
async function loadPresetView(view){
 if(state.busy)return false;
 if(!presetManifest||!PRESET_VIEWS.includes(view)){
   $("preset-status").textContent="보관된 사진 6장 등록 후 사용 가능합니다.";
   return false;
 }
 const role=state.currentRole;
 const entry=presetManifest.roles?.[role]?.[view];
 if(!entry)throw Error("선택한 역할의 "+view+" 사진이 등록되지 않았습니다.");
 state.busy=true;setFlow();
 try{
   const response=await fetch(PRESET_BASE+entry.filename,{cache:"no-store"});
   if(!response.ok)throw Error("서버 보관 원본 다운로드 실패 · "+response.status);
   const blob=await response.blob();
   const type=/\.png$/i.test(entry.filename)?"image/png":"image/jpeg";
   if(blob.size<500||blob.size>8*1024*1024)throw Error("원본 크기는 500B~8MiB여야 합니다.");
   const file=new File([blob],entry.filename,{type,lastModified:Date.now()});
   if((await digest(file)).toLowerCase()!==entry.sha256.toLowerCase())
      throw Error("보관 원본 SHA-256 불일치 · 보안상 업로드가 차단됐습니다.");
   if(!$("specimen-id").value.trim())$("specimen-id").value="NUT05-"+(role==="supplier"?"SUPPLIER-NORMAL":"BUYER-DEFECT");
   const input=$(view.toLowerCase()),data=new DataTransfer();
   data.items.add(file);input.files=data.files;
   await select(view,file);
   $("preset-status").textContent=(role==="supplier"?"공급사 정상":"구매사 불량")+" "+view+
     " 원본 불러오기 완료 · SHA-256 검증 PASS · AI 추론은 아직 실행하지 않았습니다.";
   return true;
 }catch(e){
   $("preset-status").textContent="원본 불러오기 실패 · "+err(e);
   return false;
 }finally{
   state.busy=false;setFlow();
 }
}
async function loadAllPresetViews(){
 if(state.busy||!presetManifest)return;
 for(const view of PRESET_VIEWS)if(!await loadPresetView(view))break;
}

function activeTrade(){const q=new URLSearchParams(location.search).get("tradeId"),saved=window.InspectEscrowContext?.read()||"",id=q||saved;if(!/^0x[0-9a-fA-F]{64}$/.test(id||""))throw Error("선택된 Trade ID가 없습니다. 거래 목록에서 거래를 선택하세요.");window.InspectEscrowContext?.write(id);return id;}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const err=e=>String(e?.message||e).slice(0,360);
async function api(url,options={}){const r=await fetch(url,{cache:"no-store",...options}),d=await r.json();if(!r.ok)throw Error(d.detail||d.error||"HTTP_"+r.status);return d;}
async function digest(file){const bytes=await file.arrayBuffer(),hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function b64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]||"");r.onerror=reject;r.readAsDataURL(file);});}
function short(v){const s=String(v||"");return s.length>23?s.slice(0,13)+"…"+s.slice(-8):s;}
function mark(id,status,text=status){const el=$(id);if(!el)return;el.className="flow-status "+status;el.textContent=text;}
function setFlow(){updatePresetControls();const xaiButton=$("explain");if(xaiButton)xaiButton.disabled=state.config?.runtimeAvailable===false||state.busy||!state.lastInference;const top=!!state.files.TOP,three=top&&!!state.files.FRONT&&!!state.files.SIDE,offline=state.config?.runtimeAvailable===false;mark("flow-capture",top?"complete":"ready",top?"COMPLETE":"READY");mark("flow-inference",offline?"blocked":state.busy?"running":state.lastInference?"complete":top?"ready":"blocked",offline?"AI OFFLINE":state.busy?"RUNNING":state.lastInference?"COMPLETE":top?"READY":"BLOCKED");mark("flow-evidence",offline?"blocked":state.bundle?"complete":three&&state.lastInference?"ready":"blocked",offline?"AI OFFLINE":state.bundle?"COMPLETE":three&&state.lastInference?"READY":"BLOCKED");mark("flow-station","blocked","BLOCKED · UNSIGNED");mark("flow-onchain","blocked","BLOCKED · NOT SUBMITTED");$("infer").disabled=offline||state.busy||!top;$("infer").title=offline?"AI 검사 서버가 오프라인이라 새 추론을 실행할 수 없습니다.":top?"선택한 TOP 원본으로 실제 Model B 추론":"TOP 원본을 먼저 선택하세요";$("build").disabled=offline||state.busy||!three;$("build").title=offline?"AI 검사 서버 오프라인 · 보관 기록만 조회 가능":three?"서로 다른 3뷰 원본으로 Evidence 생성":"TOP·FRONT·SIDE 원본이 모두 필요합니다";}
function newSession(){
  forgetHandoff(state.currentRole);
  for(const url of state.urls)URL.revokeObjectURL(url);state.urls=[];
  state.files={};state.bundle=null;state.lastInference=null;state.xai=null;renderXai();
  for(const view of ["TOP","FRONT","SIDE"]){
    const id=view.toLowerCase(),picker=$(id),img=$(id+"-preview");
    if(picker)picker.value="";if(img){img.removeAttribute("src");img.style.display="none";}
    if($(id+"-hash"))$(id+"-hash").textContent="SHA-256 대기";
  }
  state.sessionCreatedAtUtc=new Date().toISOString();
  $("session-id").value="LIVE-"+crypto.randomUUID();
  $("download").disabled=true;
  $("inference").className="result empty";$("inference").textContent="검사 전 · TOP 원본을 선택하세요.";
  $("evidence-result").className="result empty";$("evidence-result").textContent="새 세션 · Evidence 재생성이 필요합니다.";
  setFlow();persist();renderRoleComparison();
}
function persist(){localStorage.setItem(SESSION_KEY,JSON.stringify({tradeId:$("trade-id").value,role:$("role").value,specimenId:$("specimen-id").value,sessionId:$("session-id").value,sessionCreatedAtUtc:state.sessionCreatedAtUtc,restoredAt:new Date().toISOString(),originalsStored:false,lastInference:state.lastInference?{scoreRaw:state.lastInference.scoreRaw,scoreScaled:state.lastInference.scoreScaled,thresholdScaled:state.lastInference.thresholdScaled,decision:state.lastInference.decision}:null,hasBundle:!!state.bundle}));}
function restore(){try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");if(!s){state.currentRole=$("role").value;newSession();return;}
  const selected=new URLSearchParams(location.search).get("tradeId")||window.InspectEscrowContext?.read()||"";
  if(s.tradeId&&/^0x[0-9a-fA-F]{64}$/.test(selected)&&s.tradeId.toLowerCase()!==selected.toLowerCase()){newSession();return;}
  $("role").value=s.role||"supplier";state.currentRole=$("role").value;$("specimen-id").value=s.specimenId||"";$("session-id").value=s.sessionId||"";state.sessionCreatedAtUtc=s.sessionCreatedAtUtc||new Date().toISOString();if(!$("session-id").value)newSession();}catch{newSession();}}
async function select(view,file){if(!file)return;if(file.size<500||file.size>MAX)throw Error(view+" 파일은 500 bytes~20 MiB여야 합니다.");if(!["image/jpeg","image/png"].includes(file.type))throw Error(view+"은 JPEG/PNG만 허용됩니다.");state.files[view]=file;state.bundle=null;$("download").disabled=true;
  $("evidence-result").className="result empty";
  $("evidence-result").textContent="원본이 변경되었습니다. Evidence를 다시 생성하세요.";
  if(view==="TOP"){
    state.lastInference=null;state.xai=null;renderXai();$("inference").className="result empty";
    $("inference").textContent="TOP 원본 변경 · AI 재추론 필요";
  }const id=view.toLowerCase(),url=URL.createObjectURL(file);state.urls.push(url);$(id+"-preview").src=url;$(id+"-preview").style.display="block";$(id+"-hash").textContent="SHA-256 계산 중…";$(id+"-hash").textContent=await digest(file)+" · "+file.size+" bytes";$("build").disabled=!(state.files.TOP&&state.files.FRONT&&state.files.SIDE);saveHandoff();setFlow();}
function validateMeta(){const specimen=$("specimen-id").value.trim();if(specimen.length<2)throw Error("사용자 시편 ID를 입력하세요.");if(!$("session-id").value)throw Error("새 검사 세션을 생성하세요.");return{tradeId:$("trade-id").value,role:$("role").value,operatorSpecimenId:specimen,sessionId:$("session-id").value,sessionCreatedAtUtc:state.sessionCreatedAtUtc};}
async function images(views){const out={};for(const view of views){const f=state.files[view];if(!f)throw Error(view+" 원본이 필요합니다.");out[view]={name:f.name,data:await b64(f)};}return out;}
async function infer(){if(state.busy)return;state.xai=null;renderXai();state.busy=true;setFlow();$("infer").disabled=true;try{const body={...validateMeta(),images:await images(["TOP"])};$("inference").className="result";$("inference").innerHTML="<strong>실제 Model B 추론 중…</strong><p>선택한 TOP 원본 바이트를 CPU 런타임에 전달했습니다.</p>";const d=await api("/api/live/infer",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(body)});state.lastInference=d;saveHandoff();const review=String(d.decision).includes("REVIEW");$("inference").className="result "+(review?"review":"pass");$("inference").innerHTML=`<div class="score-line"><div><span class="decision">${esc(d.decision)}</span><div class="score-value">${esc(d.scoreRaw)}</div></div><b>${review?"주의 · 재검토":"정상 범위"}</b></div><div class="metrics"><span>scoreScaled <b>${esc(d.scoreScaled)}</b></span><span>thresholdScaled <b>${esc(d.thresholdScaled)}</b></span></div><code>TOP SHA-256 ${esc(d.originalTopSha256)}</code><p>${esc(d.status)} · FRONT/SIDE 미입력 시 정식 증거 미완성 · Station UNSIGNED · 온체인 NOT SUBMITTED</p>`;persist();}catch(e){state.lastInference=null;$("inference").className="result fail";$("inference").innerHTML="<strong>추론 실패</strong><p>"+esc(err(e))+"</p>";}finally{state.busy=false;$("infer").disabled=false;setFlow();}}
function renderXai(){
 const root=$("xai-output"),status=$("xai-progress");
 if(!root||!status)return;
 const d=state.xai;
 $("xai-download").disabled=!d;
 $("xai-sidecar-download").disabled=!(d&&state.bundle&&window.InspectEscrowXAI?.xaiChecks(d,state.bundle).ok);
 if(!d||d.method!=="PATCHCORE_NATIVE_ANOMALY_MAP"){
   root.hidden=true;
   $("xai-overlay").removeAttribute("src");
   status.textContent="TOP의 실제 AI 추론을 실행한 후 XAI 근거 보기를 누르세요.";
   return;
 }
 const b64=String(d.overlayPngBase64||"");
 if(b64.length<100||b64.length>2000000||!/^[A-Za-z0-9+/=]+$/.test(b64)){
   root.hidden=true;status.textContent="XAI 이미지가 잘못되어 표시하지 않았습니다.";return;
 }
 root.hidden=false;
 $("xai-overlay").src="data:image/png;base64,"+b64;
 $("xai-heading").textContent="실제 PatchCore 위치별 이상도 · "+d.decision;
 $("xai-score").textContent="이상 점수 "+d.scoreRaw+" / 임계값 "+(Number(d.thresholdScaled)/1000000).toFixed(6)+
   " · 이 점수는 불량 확률(%)이 아닙니다.";
 const bars=Array.isArray(d.quadrants)?d.quadrants:[];
 $("xai-bars").innerHTML=bars.map(item=>{
   const x=Math.max(0,Math.min(100,Number(item.relativeAnomalyIndex)||0));
   return '<div class="xai-bar"><span>'+esc(item.label)+'</span>'+
     '<div class="xai-bar-track"><div class="xai-bar-fill" style="width:'+x.toFixed(1)+'%"></div></div>'+
     '<span>'+x.toFixed(1)+'</span></div>';
 }).join("");
 $("xai-provenance").textContent="CNN WideResNet50-2 layer2/layer3 · TOP SHA-256 "+
   short(d.originalTopSha256)+" · 모델 "+short(d.modelCheckpointSha256)+
   " · 각 막대는 너트 영역에서 고정 표시 기준을 넘는 이상도의 시각화 지수(0–100)이며 확률이 아닙니다. 정상 사진은 빨간색이 없을 수 있습니다. 서명·온체인 제출 없음.";
 status.textContent="실제 PatchCore anomaly_map 재추론 완료 · 원본 해시·모델 해시·점수 확인";
}
async function explainXai(){
 if(state.busy||!state.lastInference||!state.files.TOP)return;
 state.busy=true;setFlow();
 $("xai-progress").textContent="고정 Model B로 원본 TOP의 위치별 이상도를 계산하고 있습니다…";
 try{
   const body={...validateMeta(),images:await images(["TOP"])};
   const expected=await digest(state.files.TOP);
   const value=await api("/api/live/explain",{
     method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},
     body:JSON.stringify(body)
   });
   if(!value.ok||value.originalTopSha256!==expected||
      value.modelCheckpointSha256!==state.config?.runtime?.checkpointSha256||
      String(value.scoreScaled)!==String(state.lastInference.scoreScaled)||
      value.decision!==state.lastInference.decision)
      throw Error("XAI 원본·모델·AI 점수 결합 검증 실패");
   state.xai=value;saveHandoff();renderXai();
 }catch(e){
   state.xai=null;saveHandoff();renderXai();
   $("xai-progress").textContent="XAI 실행 실패 · "+err(e)+
     " · 기존 AI 판정과 Evidence에는 영향을 주지 않았습니다.";
 }finally{state.busy=false;setFlow();}
}
async function downloadXaiSidecar(){
 const h=roleRecord(roleStore($("trade-id").value),state.currentRole);
 if(!h?.xai||!h.bundle)throw Error("현재 역할의 XAI와 Evidence가 모두 필요합니다.");
 const wrapped=await window.InspectEscrowXAI.wrap(h.xai,h.bundle);
 const blob=new Blob([JSON.stringify(wrapped,null,2)+"\n"],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="InspectEscrow_XAI_"+state.currentRole+"_"+(h.sessionId||"session")+".sidecar.json";
 a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function downloadXai(){
 const x=state.xai;if(!x?.overlayPngBase64)return;
 const a=document.createElement("a");
 a.href="data:image/png;base64,"+x.overlayPngBase64;
 a.download="InspectEscrow_PatchCore_XAI_"+state.currentRole+".png";
 a.click();
}

async function build(){if(state.busy)return;state.busy=true;setFlow();$("build").disabled=true;try{const body={...validateMeta(),images:await images(["TOP","FRONT","SIDE"])};$("evidence-result").className="result";$("evidence-result").innerHTML="<strong>원본 재검증·증거 해시 생성 중…</strong>";const d=await api("/api/live/build",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(body)});state.bundle=d.bundle;if(state.xai&&!window.InspectEscrowXAI?.xaiChecks(state.xai,state.bundle).ok){state.xai=null;renderXai();}saveHandoff();renderXai();$("evidence-result").className="result pass";$("evidence-result").innerHTML=`<div class="score-line"><div><span class="decision">${esc(d.status)}</span><div class="score-value">${esc(d.scoreScaled)}</div></div><b>OFFCHAIN EVIDENCE COMPLETE</b></div><div class="metrics"><span>판정 <b>${esc(d.decision)}</b></span><span>Station <b>UNSIGNED</b></span></div><code>Manifest ${esc(d.hashes.specimenManifestHash)}</code><code>Evidence ${esc(d.hashes.evidencePackageHash)}</code><p>Canonical unsigned template 생성 완료 · fresh Station 서명 필요 · Actor 온체인 미제출 · TX 0</p>`;$("download").disabled=false;persist();}catch(e){state.bundle=null;saveHandoff();$("download").disabled=true;$("evidence-result").className="result fail";$("evidence-result").innerHTML="<strong>증거 생성 실패</strong><p>"+esc(err(e))+"</p>";}finally{state.busy=false;$("build").disabled=!(state.files.TOP&&state.files.FRONT&&state.files.SIDE);saveHandoff();setFlow();}}
function downloadRole(role){
 const h=roleRecord(roleStore($("trade-id").value),role),pkg=h?.bundle;
 if(!pkg)return;
 const blob=new Blob([JSON.stringify(pkg,null,2)+"\n"],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="inspectescrow-"+role+"-"+(pkg.manifest?.sessionId||h.sessionId||"evidence")+".evidence.json";
 a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function download(){downloadRole(state.currentRole);}

function cameraError(e){const n=e?.name||"";if(n==="NotAllowedError")return "브라우저 또는 Windows 카메라 권한이 거부됐습니다.";if(n==="NotFoundError")return "연결된 카메라 장치를 찾지 못했습니다.";if(n==="NotReadableError")return "다른 앱이 카메라를 사용 중이거나 장치를 열 수 없습니다.";if(n==="OverconstrainedError")return "선택한 카메라 조건을 지원하지 않습니다.";return err(e);}
async function cameraDiagnostics(){const out=$("camera-diagnostic-status"),sel=$("camera-device");if(!out||!sel)return 0;try{if(!window.isSecureContext)throw Error("localhost 또는 HTTPS 보안 컨텍스트가 아닙니다.");if(!navigator.mediaDevices?.enumerateDevices)throw Error("이 브라우저는 장치 열거 API를 지원하지 않습니다.");const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput");if(!document.contains(out)||!document.contains(sel))return 0;sel.innerHTML='<option value="">기본 카메라</option>'+devices.map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||`카메라 ${i+1} · 권한 허용 후 이름 표시`)}</option>`).join("");out.textContent=devices.length?`카메라 ${devices.length}개 감지 · 촬영 버튼에서 권한 확인`:`카메라 0개 감지 · 연결·Windows 권한을 확인하세요.`;return devices.length;}catch(e){if(document.contains(out))out.textContent="진단 실패 · "+cameraError(e);return 0;}}
async function startCamera(view){try{if(!window.isSecureContext)throw Error("카메라는 localhost 또는 HTTPS 보안 컨텍스트가 필요합니다.");if(!navigator.mediaDevices?.getUserMedia)throw Error("이 브라우저에서 카메라 API를 사용할 수 없습니다.");stopCamera();state.cameraView=view;$("camera-box").classList.remove("hidden");$("camera-target").textContent=view+" 촬영";$("camera-status").textContent="카메라 권한 및 장치 확인 중…";const deviceId=$("camera-device").value;state.stream=await navigator.mediaDevices.getUserMedia({video:deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:"environment"}},audio:false});$("camera-video").srcObject=state.stream;$("camera-status").textContent="라이브 프레임 준비 · 원본은 캡처 전까지 저장하지 않음";await cameraDiagnostics();}catch(e){$("camera-box").classList.remove("hidden");$("camera-status").textContent="카메라 사용 불가 · "+cameraError(e)+" 파일 업로드를 사용하세요.";}}
function stopCamera(){if(state.stream)state.stream.getTracks().forEach(t=>t.stop());state.stream=null;const video=$("camera-video"),box=$("camera-box");if(video)video.srcObject=null;if(box)box.classList.add("hidden");}
async function capture(){try{if(!state.stream||!state.cameraView)throw Error("활성 카메라가 없습니다.");const v=$("camera-video"),canvas=document.createElement("canvas");canvas.width=v.videoWidth;canvas.height=v.videoHeight;if(!canvas.width)throw Error("카메라 프레임이 아직 준비되지 않았습니다.");canvas.getContext("2d").drawImage(v,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.95));const file=new File([blob],`${state.cameraView.toLowerCase()}-${Date.now()}.jpg`,{type:"image/jpeg",lastModified:Date.now()});await select(state.cameraView,file);stopCamera();}catch(e){$("camera-status").textContent="촬영 실패 · "+err(e)+" · 다시 시도하거나 파일 업로드를 사용하세요.";}}
async function load(){restore();setFlow();try{const tradeId=activeTrade();$("trade-id").value=tradeId;for(const a of document.querySelectorAll('a[href="/evidence"]'))a.href="/evidence?tradeId="+encodeURIComponent(tradeId);for(const a of document.querySelectorAll('a[href^="/replay"]'))a.href="/replay?mode=offchain&tradeId="+encodeURIComponent(tradeId);for(const a of document.querySelectorAll('a[href="/e2e"]'))a.href="/e2e?tradeId="+encodeURIComponent(tradeId);state.config=await api("/api/live/config?tradeId="+encodeURIComponent(tradeId));$("trade-id").value=state.config.tradeId;await hydrateHandoff(state.config.tradeId);await loadPresetManifest();const completed=[17,18,19].includes(Number(state.config.state));$("runtime").textContent=state.config.runtimeAvailable?"MODEL B ONLINE · "+short(state.config.runtime.checkpointSha256):"MODEL B 오프라인 · 보관 기록 조회 가능";$("truth").textContent=completed?"완료된 S05 거래 기록 · 새 실시간 검사 세션이 아니며 이번 화면에서 AI 재추론을 수행하지 않았습니다. · chain "+state.config.chainId:state.config.runtimeAvailable?state.config.governanceStatus+" · OFFCHAIN 증거 준비만 허용 · Station UNSIGNED · 온체인 NOT SUBMITTED · chain "+state.config.chainId:state.config.runtimeMessage+" · 실제 AI 추론 미실행 · chain "+state.config.chainId;$("bindings").innerHTML=[["Policy",state.config.policyHash],["Model Bundle",state.config.modelBundleHash],["Capture",state.config.captureProfileHash],["Threshold",state.config.thresholdScaled]].map(x=>`<div><small>${esc(x[0])}</small><code>${esc(x[1])}</code></div>`).join("");setFlow();}catch(e){state.config={runtimeAvailable:false};$("runtime").textContent="거래 컨텍스트 확인 실패";$("truth").textContent="잘못된 요청 또는 거래 컨텍스트로 검사 구성을 불러오지 못했습니다. · 실제 AI 추론 미실행 · "+err(e);setFlow();}}
for(const view of ["TOP","FRONT","SIDE"]){$(view.toLowerCase()).addEventListener("change",e=>select(view,e.target.files?.[0]).catch(x=>alert(err(x))));}
document.querySelectorAll("[data-preset-view]").forEach(b=>b.addEventListener("click",()=>loadPresetView(b.dataset.presetView)));$("preset-all").addEventListener("click",loadAllPresetViews);
document.querySelectorAll(".camera").forEach(b=>b.addEventListener("click",()=>startCamera(b.dataset.view)));$("diagnose-camera").addEventListener("click",cameraDiagnostics);$("capture").addEventListener("click",capture);$("stop-camera").addEventListener("click",stopCamera);$("new-session").addEventListener("click",newSession);$("infer").addEventListener("click",infer);$("explain").addEventListener("click",explainXai);$("xai-download").addEventListener("click",downloadXai);$("xai-sidecar-download").addEventListener("click",()=>downloadXaiSidecar().catch(e=>$("xai-progress").textContent="XAI 연결 보고서 저장 실패 · "+err(e)));$("build").addEventListener("click",build);$("download").addEventListener("click",download);$("role").addEventListener("change",event=>switchRole(event.target.value));
for(const role of ["supplier","buyer"]){
 $(role+"-summary-switch").addEventListener("click",()=>switchRole(role));
 $(role+"-summary-download").addEventListener("click",()=>downloadRole(role));
}

$("specimen-id").addEventListener("change",()=>{
  state.xai=null;renderXai();state.bundle=null;$("download").disabled=true;
  $("evidence-result").className="result empty";$("evidence-result").textContent="시편 ID 변경 · Evidence 재생성 필요";
  saveHandoff();persist();setFlow();
});window.addEventListener("beforeunload",()=>{stopCamera();state.urls.forEach(URL.revokeObjectURL);});load();cameraDiagnostics();
})();
