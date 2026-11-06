"use strict";
(()=>{
const $=id=>document.getElementById(id),MAX=20*1024*1024,SESSION_KEY="inspectescrow.live-session.v1";
const state={config:null,files:{},urls:[],stream:null,cameraView:null,bundle:null,busy:false,sessionCreatedAtUtc:null};
// Same-tab UI handoff only. No File, Evidence JSON, wallet key or signature is persisted.
const HANDOFF_KEY="__inspectEscrowEvidenceHandoff";
function forgetHandoff(){delete window[HANDOFF_KEY];}
function saveHandoff(){
  const tradeId=$("trade-id")?.value, role=$("role")?.value;
  if(!/^0x[0-9a-fA-F]{64}$/.test(tradeId||"")||!["supplier","buyer"].includes(role))return;
  const files={...state.files};
  window[HANDOFF_KEY]={tradeId,role,files,bundle:state.bundle,inference:state.lastInference,
    specimenId:$("specimen-id").value,sessionId:$("session-id").value,
    sessionCreatedAtUtc:state.sessionCreatedAtUtc};
}
function handoffForTrade(tradeId){
  const h=window[HANDOFF_KEY];
  return h&&h.tradeId?.toLowerCase()===tradeId?.toLowerCase()&&
    ["supplier","buyer"].includes(h.role)?h:null;
}
async function hydrateHandoff(tradeId){
  const h=handoffForTrade(tradeId);
  if(!h||!Object.values(h.files||{}).some(f=>f instanceof File))return;
  $("role").value=h.role;
  $("specimen-id").value=h.specimenId||"";
  $("session-id").value=h.sessionId||$("session-id").value;
  state.sessionCreatedAtUtc=h.sessionCreatedAtUtc||state.sessionCreatedAtUtc;
  state.files={...h.files};state.lastInference=h.inference||null;state.bundle=h.bundle||null;
  for(const view of ["TOP","FRONT","SIDE"]){
    const f=state.files[view];if(!(f instanceof File))continue;
    const url=URL.createObjectURL(f);state.urls.push(url);
    $(view.toLowerCase()+"-preview").src=url;
    $(view.toLowerCase()+"-preview").style.display="block";
    $(view.toLowerCase()+"-hash").textContent=await digest(f)+" · "+f.size+" bytes · 동일 탭에서 복원";
  }
  if(state.lastInference){
    const d=state.lastInference;
    $("inference").className="result "+(String(d.decision).includes("REVIEW")?"review":"pass");
    $("inference").textContent="이전 실제 AI 검사 결과 복원 · "+d.decision+" · score "+d.scoreRaw+" (재추론 없음)";
  }
  if(state.bundle){
    $("download").disabled=false;
    $("evidence-result").className="result pass";
    $("evidence-result").textContent="기존 3뷰 Evidence Bundle 복원 · UNSIGNED · NOT SUBMITTED · 자동 전달 가능";
  }
  setFlow();
}

function activeTrade(){const q=new URLSearchParams(location.search).get("tradeId"),saved=window.InspectEscrowContext?.read()||"",id=q||saved;if(!/^0x[0-9a-fA-F]{64}$/.test(id||""))throw Error("선택된 Trade ID가 없습니다. 거래 목록에서 거래를 선택하세요.");window.InspectEscrowContext?.write(id);return id;}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const err=e=>String(e?.message||e).slice(0,360);
async function api(url,options={}){const r=await fetch(url,{cache:"no-store",...options}),d=await r.json();if(!r.ok)throw Error(d.detail||d.error||"HTTP_"+r.status);return d;}
async function digest(file){const bytes=await file.arrayBuffer(),hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function b64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]||"");r.onerror=reject;r.readAsDataURL(file);});}
function short(v){const s=String(v||"");return s.length>23?s.slice(0,13)+"…"+s.slice(-8):s;}
function mark(id,status,text=status){const el=$(id);if(!el)return;el.className="flow-status "+status;el.textContent=text;}
function setFlow(){const top=!!state.files.TOP,three=top&&!!state.files.FRONT&&!!state.files.SIDE,offline=state.config?.runtimeAvailable===false;mark("flow-capture",top?"complete":"ready",top?"COMPLETE":"READY");mark("flow-inference",offline?"blocked":state.busy?"running":state.lastInference?"complete":top?"ready":"blocked",offline?"AI OFFLINE":state.busy?"RUNNING":state.lastInference?"COMPLETE":top?"READY":"BLOCKED");mark("flow-evidence",offline?"blocked":state.bundle?"complete":three&&state.lastInference?"ready":"blocked",offline?"AI OFFLINE":state.bundle?"COMPLETE":three&&state.lastInference?"READY":"BLOCKED");mark("flow-station","blocked","BLOCKED · UNSIGNED");mark("flow-onchain","blocked","BLOCKED · NOT SUBMITTED");$("infer").disabled=offline||state.busy||!top;$("infer").title=offline?"AI 검사 서버가 오프라인이라 새 추론을 실행할 수 없습니다.":top?"선택한 TOP 원본으로 실제 Model B 추론":"TOP 원본을 먼저 선택하세요";$("build").disabled=offline||state.busy||!three;$("build").title=offline?"AI 검사 서버 오프라인 · 보관 기록만 조회 가능":three?"서로 다른 3뷰 원본으로 Evidence 생성":"TOP·FRONT·SIDE 원본이 모두 필요합니다";}
function newSession(){
  forgetHandoff();
  state.files={};state.bundle=null;state.lastInference=null;
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
  setFlow();persist();
}
function persist(){localStorage.setItem(SESSION_KEY,JSON.stringify({tradeId:$("trade-id").value,role:$("role").value,specimenId:$("specimen-id").value,sessionId:$("session-id").value,sessionCreatedAtUtc:state.sessionCreatedAtUtc,restoredAt:new Date().toISOString(),originalsStored:false,lastInference:state.lastInference?{scoreRaw:state.lastInference.scoreRaw,scoreScaled:state.lastInference.scoreScaled,thresholdScaled:state.lastInference.thresholdScaled,decision:state.lastInference.decision}:null,hasBundle:!!state.bundle}));}
function restore(){try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");if(!s){newSession();return;}
  const selected=new URLSearchParams(location.search).get("tradeId")||window.InspectEscrowContext?.read()||"";
  if(s.tradeId&&/^0x[0-9a-fA-F]{64}$/.test(selected)&&s.tradeId.toLowerCase()!==selected.toLowerCase()){newSession();return;}
  $("role").value=s.role||"supplier";$("specimen-id").value=s.specimenId||"";$("session-id").value=s.sessionId||"";state.sessionCreatedAtUtc=s.sessionCreatedAtUtc||new Date().toISOString();if(!$("session-id").value)newSession();}catch{newSession();}}
async function select(view,file){if(!file)return;if(file.size<500||file.size>MAX)throw Error(view+" 파일은 500 bytes~20 MiB여야 합니다.");if(!["image/jpeg","image/png"].includes(file.type))throw Error(view+"은 JPEG/PNG만 허용됩니다.");state.files[view]=file;state.bundle=null;$("download").disabled=true;
  $("evidence-result").className="result empty";
  $("evidence-result").textContent="원본이 변경되었습니다. Evidence를 다시 생성하세요.";
  if(view==="TOP"){
    state.lastInference=null;$("inference").className="result empty";
    $("inference").textContent="TOP 원본 변경 · AI 재추론 필요";
  }const id=view.toLowerCase(),url=URL.createObjectURL(file);state.urls.push(url);$(id+"-preview").src=url;$(id+"-preview").style.display="block";$(id+"-hash").textContent="SHA-256 계산 중…";$(id+"-hash").textContent=await digest(file)+" · "+file.size+" bytes";$("build").disabled=!(state.files.TOP&&state.files.FRONT&&state.files.SIDE);saveHandoff();setFlow();}
function validateMeta(){const specimen=$("specimen-id").value.trim();if(specimen.length<2)throw Error("사용자 시편 ID를 입력하세요.");if(!$("session-id").value)throw Error("새 검사 세션을 생성하세요.");return{tradeId:$("trade-id").value,role:$("role").value,operatorSpecimenId:specimen,sessionId:$("session-id").value,sessionCreatedAtUtc:state.sessionCreatedAtUtc};}
async function images(views){const out={};for(const view of views){const f=state.files[view];if(!f)throw Error(view+" 원본이 필요합니다.");out[view]={name:f.name,data:await b64(f)};}return out;}
async function infer(){if(state.busy)return;state.busy=true;setFlow();$("infer").disabled=true;try{const body={...validateMeta(),images:await images(["TOP"])};$("inference").className="result";$("inference").innerHTML="<strong>실제 Model B 추론 중…</strong><p>선택한 TOP 원본 바이트를 CPU 런타임에 전달했습니다.</p>";const d=await api("/api/live/infer",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(body)});state.lastInference=d;saveHandoff();const review=String(d.decision).includes("REVIEW");$("inference").className="result "+(review?"review":"pass");$("inference").innerHTML=`<div class="score-line"><div><span class="decision">${esc(d.decision)}</span><div class="score-value">${esc(d.scoreRaw)}</div></div><b>${review?"주의 · 재검토":"정상 범위"}</b></div><div class="metrics"><span>scoreScaled <b>${esc(d.scoreScaled)}</b></span><span>thresholdScaled <b>${esc(d.thresholdScaled)}</b></span></div><code>TOP SHA-256 ${esc(d.originalTopSha256)}</code><p>${esc(d.status)} · FRONT/SIDE 미입력 시 정식 증거 미완성 · Station UNSIGNED · 온체인 NOT SUBMITTED</p>`;persist();}catch(e){state.lastInference=null;$("inference").className="result fail";$("inference").innerHTML="<strong>추론 실패</strong><p>"+esc(err(e))+"</p>";}finally{state.busy=false;$("infer").disabled=false;setFlow();}}
async function build(){if(state.busy)return;state.busy=true;setFlow();$("build").disabled=true;try{const body={...validateMeta(),images:await images(["TOP","FRONT","SIDE"])};$("evidence-result").className="result";$("evidence-result").innerHTML="<strong>원본 재검증·증거 해시 생성 중…</strong>";const d=await api("/api/live/build",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(body)});state.bundle=d.bundle;saveHandoff();$("evidence-result").className="result pass";$("evidence-result").innerHTML=`<div class="score-line"><div><span class="decision">${esc(d.status)}</span><div class="score-value">${esc(d.scoreScaled)}</div></div><b>OFFCHAIN EVIDENCE COMPLETE</b></div><div class="metrics"><span>판정 <b>${esc(d.decision)}</b></span><span>Station <b>UNSIGNED</b></span></div><code>Manifest ${esc(d.hashes.specimenManifestHash)}</code><code>Evidence ${esc(d.hashes.evidencePackageHash)}</code><p>Canonical unsigned template 생성 완료 · fresh Station 서명 필요 · Actor 온체인 미제출 · TX 0</p>`;$("download").disabled=false;persist();}catch(e){state.bundle=null;saveHandoff();$("download").disabled=true;$("evidence-result").className="result fail";$("evidence-result").innerHTML="<strong>증거 생성 실패</strong><p>"+esc(err(e))+"</p>";}finally{state.busy=false;$("build").disabled=!(state.files.TOP&&state.files.FRONT&&state.files.SIDE);saveHandoff();setFlow();}}
function download(){if(!state.bundle)return;const blob=new Blob([JSON.stringify(state.bundle,null,2)+"\n"],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`inspectescrow-${state.bundle.roleName}-${state.bundle.manifest.sessionId}.evidence.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function cameraError(e){const n=e?.name||"";if(n==="NotAllowedError")return "브라우저 또는 Windows 카메라 권한이 거부됐습니다.";if(n==="NotFoundError")return "연결된 카메라 장치를 찾지 못했습니다.";if(n==="NotReadableError")return "다른 앱이 카메라를 사용 중이거나 장치를 열 수 없습니다.";if(n==="OverconstrainedError")return "선택한 카메라 조건을 지원하지 않습니다.";return err(e);}
async function cameraDiagnostics(){const out=$("camera-diagnostic-status"),sel=$("camera-device");if(!out||!sel)return 0;try{if(!window.isSecureContext)throw Error("localhost 또는 HTTPS 보안 컨텍스트가 아닙니다.");if(!navigator.mediaDevices?.enumerateDevices)throw Error("이 브라우저는 장치 열거 API를 지원하지 않습니다.");const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput");if(!document.contains(out)||!document.contains(sel))return 0;sel.innerHTML='<option value="">기본 카메라</option>'+devices.map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||`카메라 ${i+1} · 권한 허용 후 이름 표시`)}</option>`).join("");out.textContent=devices.length?`카메라 ${devices.length}개 감지 · 촬영 버튼에서 권한 확인`:`카메라 0개 감지 · 연결·Windows 권한을 확인하세요.`;return devices.length;}catch(e){if(document.contains(out))out.textContent="진단 실패 · "+cameraError(e);return 0;}}
async function startCamera(view){try{if(!window.isSecureContext)throw Error("카메라는 localhost 또는 HTTPS 보안 컨텍스트가 필요합니다.");if(!navigator.mediaDevices?.getUserMedia)throw Error("이 브라우저에서 카메라 API를 사용할 수 없습니다.");stopCamera();state.cameraView=view;$("camera-box").classList.remove("hidden");$("camera-target").textContent=view+" 촬영";$("camera-status").textContent="카메라 권한 및 장치 확인 중…";const deviceId=$("camera-device").value;state.stream=await navigator.mediaDevices.getUserMedia({video:deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:"environment"}},audio:false});$("camera-video").srcObject=state.stream;$("camera-status").textContent="라이브 프레임 준비 · 원본은 캡처 전까지 저장하지 않음";await cameraDiagnostics();}catch(e){$("camera-box").classList.remove("hidden");$("camera-status").textContent="카메라 사용 불가 · "+cameraError(e)+" 파일 업로드를 사용하세요.";}}
function stopCamera(){if(state.stream)state.stream.getTracks().forEach(t=>t.stop());state.stream=null;const video=$("camera-video"),box=$("camera-box");if(video)video.srcObject=null;if(box)box.classList.add("hidden");}
async function capture(){try{if(!state.stream||!state.cameraView)throw Error("활성 카메라가 없습니다.");const v=$("camera-video"),canvas=document.createElement("canvas");canvas.width=v.videoWidth;canvas.height=v.videoHeight;if(!canvas.width)throw Error("카메라 프레임이 아직 준비되지 않았습니다.");canvas.getContext("2d").drawImage(v,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.95));const file=new File([blob],`${state.cameraView.toLowerCase()}-${Date.now()}.jpg`,{type:"image/jpeg",lastModified:Date.now()});await select(state.cameraView,file);stopCamera();}catch(e){$("camera-status").textContent="촬영 실패 · "+err(e)+" · 다시 시도하거나 파일 업로드를 사용하세요.";}}
async function load(){restore();setFlow();try{const tradeId=activeTrade();$("trade-id").value=tradeId;for(const a of document.querySelectorAll('a[href="/evidence"]'))a.href="/evidence?tradeId="+encodeURIComponent(tradeId);for(const a of document.querySelectorAll('a[href^="/replay"]'))a.href="/replay?mode=offchain&tradeId="+encodeURIComponent(tradeId);for(const a of document.querySelectorAll('a[href="/e2e"]'))a.href="/e2e?tradeId="+encodeURIComponent(tradeId);state.config=await api("/api/live/config?tradeId="+encodeURIComponent(tradeId));$("trade-id").value=state.config.tradeId;await hydrateHandoff(state.config.tradeId);const completed=[17,18,19].includes(Number(state.config.state));$("runtime").textContent=state.config.runtimeAvailable?"MODEL B ONLINE · "+short(state.config.runtime.checkpointSha256):"MODEL B 오프라인 · 보관 기록 조회 가능";$("truth").textContent=completed?"완료된 S05 거래 기록 · 새 실시간 검사 세션이 아니며 이번 화면에서 AI 재추론을 수행하지 않았습니다. · chain "+state.config.chainId:state.config.runtimeAvailable?state.config.governanceStatus+" · OFFCHAIN 증거 준비만 허용 · Station UNSIGNED · 온체인 NOT SUBMITTED · chain "+state.config.chainId:state.config.runtimeMessage+" · 실제 AI 추론 미실행 · chain "+state.config.chainId;$("bindings").innerHTML=[["Policy",state.config.policyHash],["Model Bundle",state.config.modelBundleHash],["Capture",state.config.captureProfileHash],["Threshold",state.config.thresholdScaled]].map(x=>`<div><small>${esc(x[0])}</small><code>${esc(x[1])}</code></div>`).join("");setFlow();}catch(e){state.config={runtimeAvailable:false};$("runtime").textContent="거래 컨텍스트 확인 실패";$("truth").textContent="잘못된 요청 또는 거래 컨텍스트로 검사 구성을 불러오지 못했습니다. · 실제 AI 추론 미실행 · "+err(e);setFlow();}}
for(const view of ["TOP","FRONT","SIDE"]){$(view.toLowerCase()).addEventListener("change",e=>select(view,e.target.files?.[0]).catch(x=>alert(err(x))));}
document.querySelectorAll(".camera").forEach(b=>b.addEventListener("click",()=>startCamera(b.dataset.view)));$("diagnose-camera").addEventListener("click",cameraDiagnostics);$("capture").addEventListener("click",capture);$("stop-camera").addEventListener("click",stopCamera);$("new-session").addEventListener("click",newSession);$("infer").addEventListener("click",infer);$("build").addEventListener("click",build);$("download").addEventListener("click",download);$("role").addEventListener("change",()=>{
  state.bundle=null;state.lastInference=null;$("download").disabled=true;forgetHandoff();
  $("inference").className="result empty";$("inference").textContent="검사 역할 변경 · AI 재추론 필요";
  $("evidence-result").className="result empty";$("evidence-result").textContent="역할이 변경되어 Evidence를 다시 생성해야 합니다.";
  persist();setFlow();
});
$("specimen-id").addEventListener("change",()=>{
  state.bundle=null;$("download").disabled=true;
  $("evidence-result").className="result empty";$("evidence-result").textContent="시편 ID 변경 · Evidence 재생성 필요";
  saveHandoff();persist();setFlow();
});window.addEventListener("beforeunload",()=>{stopCamera();state.urls.forEach(URL.revokeObjectURL);});load();cameraDiagnostics();
})();
