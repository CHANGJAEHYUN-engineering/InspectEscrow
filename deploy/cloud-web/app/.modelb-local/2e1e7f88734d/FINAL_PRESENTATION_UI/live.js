"use strict";
(()=>{
const $=id=>document.getElementById(id),MAX=20*1024*1024,SESSION_KEY="inspectescrow.live-session.v1";
const state={config:null,files:{},urls:[],stream:null,cameraView:null,bundle:null,busy:false,sessionCreatedAtUtc:null};
function activeTrade(){const q=new URLSearchParams(location.search).get("tradeId"),saved=window.InspectEscrowContext?.read()||"",id=q||saved;if(!/^0x[0-9a-fA-F]{64}$/.test(id||""))throw Error("선택된 Trade ID가 없습니다. 거래 목록에서 거래를 선택하세요.");window.InspectEscrowContext?.write(id);return id;}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const err=e=>String(e?.message||e).slice(0,360);
async function api(url,options={}){const r=await fetch(url,{cache:"no-store",...options}),d=await r.json();if(!r.ok)throw Error(d.detail||d.error||"HTTP_"+r.status);return d;}
async function digest(file){const bytes=await file.arrayBuffer(),hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function b64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]||"");r.onerror=reject;r.readAsDataURL(file);});}
function short(v){const s=String(v||"");return s.length>23?s.slice(0,13)+"…"+s.slice(-8):s;}
function mark(id,status,text=status){const el=$(id);if(!el)return;el.className="flow-status "+status;el.textContent=text;}
function setFlow(){const top=!!state.files.TOP,three=top&&!!state.files.FRONT&&!!state.files.SIDE,offline=state.config?.runtimeAvailable===false;mark("flow-capture",top?"complete":"ready",top?"COMPLETE":"READY");mark("flow-inference",offline?"blocked":state.busy?"running":state.lastInference?"complete":top?"ready":"blocked",offline?"AI OFFLINE":state.busy?"RUNNING":state.lastInference?"COMPLETE":top?"READY":"BLOCKED");mark("flow-evidence",offline?"blocked":state.bundle?"complete":three&&state.lastInference?"ready":"blocked",offline?"AI OFFLINE":state.bundle?"COMPLETE":three&&state.lastInference?"READY":"BLOCKED");mark("flow-station","blocked","BLOCKED · UNSIGNED");mark("flow-onchain","blocked","BLOCKED · NOT SUBMITTED");$("infer").disabled=offline||state.busy||!top;$("infer").title=offline?"AI 검사 서버가 오프라인이라 새 추론을 실행할 수 없습니다.":top?"선택한 TOP 원본으로 실제 Model B 추론":"TOP 원본을 먼저 선택하세요";$("build").disabled=offline||state.busy||!three||!state.lastInference?.xaiHeatmap?.sha256;$("build").title=offline?"AI 검사 서버 오프라인 · 보관 기록만 조회 가능":three?"서로 다른 3뷰 원본으로 Evidence 생성":"TOP·FRONT·SIDE 원본이 모두 필요합니다";}
function renderXaiQuadrants(asset){
  const chart=$("xai-quadrant-chart"),host=$("xai-quadrant-bars");
  if(!chart||!host)return;
  host.replaceChildren();chart.hidden=true;
  if(!asset)return;
  const quadrants=asset.quadrants;
  if(!Array.isArray(quadrants)||quadrants.length!==4||
     quadrants.some(q=>typeof q.label!=="string"||
        !Number.isFinite(q.relativeAnomalyIndex)||q.relativeAnomalyIndex<0||q.relativeAnomalyIndex>100)){
    const warning=document.createElement("p");
    warning.className="xai-chart-warning";
    warning.textContent="영역별 그래프 데이터가 누락되었습니다. 검사 결과를 다시 확인해 주세요.";
    host.append(warning);
    chart.hidden=false;return;
  }
  for(const q of quadrants){
    const row=document.createElement("div");
    row.className="xai-bar";
    const heading=document.createElement("div");
    heading.className="xai-bar-heading";
    const name=document.createElement("span");
    name.textContent=q.label;
    const value=document.createElement("strong");
    value.textContent=q.relativeAnomalyIndex.toFixed(1)+" / 100";
    heading.append(name,value);
    const track=document.createElement("div");
    track.className="xai-bar-track";
    const fill=document.createElement("div");
    fill.className="xai-bar-fill";
    fill.style.width=q.relativeAnomalyIndex+"%";
    fill.setAttribute("role","img");
    fill.setAttribute("aria-label",q.label+" 상대 이상도 "+q.relativeAnomalyIndex.toFixed(1)+" / 100");
    track.append(fill);row.append(heading,track);host.append(row);
  }
  chart.hidden=false;
}
function renderXai(asset){
  const el=$("xai-state"),img=$("xai-preview"),hash=$("xai-hash");
  renderXaiQuadrants(asset);
  if(!asset||!asset.data||!/^[a-f0-9]{64}$/.test(String(asset.sha256||""))){
    img.removeAttribute("src");img.style.display="none";el.className="result empty";el.textContent="AI 추론 후 표시됩니다.";
    hash.textContent="XAI SHA-256 · 추론 전";return;
  }
  img.src="data:image/png;base64,"+asset.data;img.style.display="block";
  el.className="result pass";el.textContent="실제 PatchCore 이상 맵으로 히트맵 자동 생성 · 원본 TOP과 모델에 연결 · 불량 확률이 아닌 이상 위치 설명";
  hash.textContent="XAI SHA-256 "+asset.sha256;
}
function newSession(){window.InspectEscrowEvidenceSession?.invalidate();renderXai(null);state.sessionCreatedAtUtc=new Date().toISOString();$("session-id").value="LIVE-"+crypto.randomUUID();state.bundle=null;state.lastInference=null;$("download").disabled=true;setFlow();persist();}
function persist(){localStorage.setItem(SESSION_KEY,JSON.stringify({tradeId:$("trade-id").value,role:$("role").value,specimenId:$("specimen-id").value,sessionId:$("session-id").value,sessionCreatedAtUtc:state.sessionCreatedAtUtc,restoredAt:new Date().toISOString(),originalsStored:false,lastInference:state.lastInference?{scoreRaw:state.lastInference.scoreRaw,scoreScaled:state.lastInference.scoreScaled,thresholdScaled:state.lastInference.thresholdScaled,decision:state.lastInference.decision}:null,hasBundle:!!state.bundle}));}
function restore(){try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||"null");if(!s){newSession();return;}$("role").value=s.role||"supplier";$("specimen-id").value=s.specimenId||"";$("session-id").value=s.sessionId||"";state.sessionCreatedAtUtc=s.sessionCreatedAtUtc||new Date().toISOString();if(!$("session-id").value)newSession();}catch{newSession();}}
async function select(view,file){if(!file)return;window.InspectEscrowEvidenceSession?.invalidate();if(file.size<500||file.size>MAX)throw Error(view+" 파일은 500 bytes~20 MiB여야 합니다.");if(!["image/jpeg","image/png"].includes(file.type))throw Error(view+"은 JPEG/PNG만 허용됩니다.");state.files[view]=file;if(view==="TOP"){state.lastInference=null;renderXai(null);}state.bundle=null;$("download").disabled=true;const id=view.toLowerCase(),url=URL.createObjectURL(file);state.urls.push(url);$(id+"-preview").src=url;$(id+"-preview").style.display="block";$(id+"-hash").textContent="SHA-256 계산 중…";$(id+"-hash").textContent=await digest(file)+" · "+file.size+" bytes";$("build").disabled=!(state.files.TOP&&state.files.FRONT&&state.files.SIDE);setFlow();}
const SUPPLIER_PRESET_HASHES={
 TOP:"0609922596edc39c6f8db095d7a820d36f87c9492e1f6ffd28936e4d9b888991",
 FRONT:"2aca0b3ae7c8caf65783d48da8e921b1c152fff9f6db7f5840f38f2e37e40bf1",
 SIDE:"8ea3490e7fec718fe291780626ca0c6dd12dcc33ca580916d096d4734a0508fe"
};
function syncPresetControls(){
 const supplier=$("role").value==="supplier";
 for(const el of document.querySelectorAll(".supplier-only"))el.style.display=supplier?"":"none";
}
async function loadSupplierPreset(view){
 if($("role").value!=="supplier")throw Error("SUPPLIER_ROLE_REQUIRED_FOR_PRESET");
 const response=await fetch("/demo-presets/s05-supplier-"+view.toLowerCase()+".jpg",{cache:"no-store"});
 if(!response.ok)throw Error("보관된 "+view+" 사진을 불러올 수 없습니다. HTTP "+response.status);
 const bytes=await response.arrayBuffer();
 const file=new File([bytes],"S05_SUPPLIER_"+view+"_20261029_01.jpg.jpg",{type:"image/jpeg"});
 const hash=await digest(file);
 if(hash!==SUPPLIER_PRESET_HASHES[view])throw Error("보관된 "+view+" 원본 SHA-256 불일치");
 const dt=new DataTransfer();dt.items.add(file);
 $(view.toLowerCase()).files=dt.files;
 await select(view,file);
 return file;
}
async function loadAllSupplierPresets(){
 const button=$("presets-all"),status=$("presets-status");
 if(state.busy)return;
 button.disabled=true;status.textContent="원본 3장 무결성 검증 및 불러오기 중…";
 try{
  if($("role").value!=="supplier")throw Error("SUPPLIER_ROLE_REQUIRED_FOR_PRESET");
  for(const view of ["TOP","FRONT","SIDE"])await loadSupplierPreset(view);
  status.textContent="정상 3장 업로드 완료 · 각 SHA-256 일치";
 }catch(e){status.textContent="불러오기 실패: "+err(e);}
 finally{button.disabled=false;setFlow();}
}
function clearRoleUploads(){
  window.InspectEscrowEvidenceSession?.invalidate();
  syncPresetControls();$("presets-status").textContent="";
  state.files={};state.lastInference=null;state.bundle=null;
  for(const view of ["TOP","FRONT","SIDE"]){
    const key=view.toLowerCase();$(key).value="";$(key+"-preview").removeAttribute("src");
    $(key+"-preview").style.display="none";$(key+"-hash").textContent="SHA-256 대기";
  }
  renderXai(null);$("download").disabled=true;
  $("inference").className="result empty";$("inference").textContent="새 역할 · 새 검사 준비";
  $("evidence-result").className="result empty";$("evidence-result").textContent="새 역할의 원본을 다시 선택하세요.";
  newSession();
}
function validateMeta(){const specimen=$("specimen-id").value.trim();if(specimen.length<2)throw Error("사용자 시편 ID를 입력하세요.");if(!$("session-id").value)throw Error("새 검사 세션을 생성하세요.");return{tradeId:$("trade-id").value,role:$("role").value,operatorSpecimenId:specimen,sessionId:$("session-id").value,sessionCreatedAtUtc:state.sessionCreatedAtUtc};}
async function images(views){const out={};for(const view of views){const f=state.files[view];if(!f)throw Error(view+" 원본이 필요합니다.");out[view]={name:f.name,data:await b64(f)};}return out;}
async function infer(){if(state.busy)return;window.InspectEscrowEvidenceSession?.invalidate();state.busy=true;setFlow();$("infer").disabled=true;try{const body={...validateMeta(),images:await images(["TOP"])};$("inference").className="result";$("inference").innerHTML="<strong>실제 Model B 추론 중…</strong><p>선택한 TOP 원본 바이트를 CPU 런타임에 전달했습니다.</p>";const d=await api("/api/live/infer",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(body)});state.lastInference=d;if(!d.xaiHeatmap?.data)throw Error("XAI_HEATMAP_NOT_GENERATED");renderXai(d.xaiHeatmap);const review=String(d.decision).includes("REVIEW");$("inference").className="result "+(review?"review":"pass");$("inference").innerHTML=`<div class="score-line"><div><span class="decision">${esc(d.decision)}</span><div class="score-value">${esc(d.scoreRaw)}</div></div><b>${review?"주의 · 재검토":"정상 범위"}</b></div><div class="metrics"><span>scoreScaled <b>${esc(d.scoreScaled)}</b></span><span>thresholdScaled <b>${esc(d.thresholdScaled)}</b></span></div><code>TOP SHA-256 ${esc(d.originalTopSha256)}</code><p>${esc(d.status)} · FRONT/SIDE 미입력 시 정식 증거 미완성 · Station UNSIGNED · 온체인 NOT SUBMITTED</p>`;persist();}catch(e){state.lastInference=null;renderXai(null);$("inference").className="result fail";$("inference").innerHTML="<strong>추론 실패</strong><p>"+esc(err(e))+"</p>";}finally{state.busy=false;$("infer").disabled=false;setFlow();}}
async function build(){if(state.busy)return;state.busy=true;setFlow();$("build").disabled=true;try{const body={...validateMeta(),images:await images(["TOP","FRONT","SIDE"]),expectedXaiHeatmapSha256:state.lastInference?.xaiHeatmap?.sha256};$("evidence-result").className="result";$("evidence-result").innerHTML="<strong>원본 재검증·증거 해시 생성 중…</strong>";const d=await api("/api/live/build",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(body)});if(!d.hashes.xaiHeatmapSha256||d.hashes.xaiHeatmapSha256!==state.lastInference?.xaiHeatmap?.sha256)throw Error("XAI_EVIDENCE_HASH_MISMATCH");state.bundle=d.bundle;
    window.InspectEscrowEvidenceSession?.save({
      tradeId:state.config.tradeId,role:$("role").value,chainId:state.config.chainId,
      contract:state.config.contract,files:state.files,bundle:d.bundle
    });
    $("evidence-result").className="result pass";$("evidence-result").innerHTML=`<div class="score-line"><div><span class="decision">${esc(d.status)}</span><div class="score-value">${esc(d.scoreScaled)}</div></div><b>OFFCHAIN EVIDENCE COMPLETE</b></div><div class="metrics"><span>판정 <b>${esc(d.decision)}</b></span><span>Station <b>UNSIGNED</b></span></div><code>Manifest ${esc(d.hashes.specimenManifestHash)}</code><code>Evidence ${esc(d.hashes.evidencePackageHash)}</code><code>Model XAI SHA-256 ${esc(d.hashes.xaiHeatmapSha256)}</code><p>동일 원본·Evidence·XAI가 다음 탭에 자동 연결됩니다. Evidence 검증 후 Station 서명이 가능합니다. · Actor 온체인 미제출 · TX 0</p>`;$("download").disabled=false;persist();}catch(e){state.bundle=null;$("download").disabled=true;$("evidence-result").className="result fail";$("evidence-result").innerHTML="<strong>증거 생성 실패</strong><p>"+esc(err(e))+"</p>";}finally{state.busy=false;$("build").disabled=!(state.files.TOP&&state.files.FRONT&&state.files.SIDE);setFlow();}}
function download(){if(!state.bundle)return;const blob=new Blob([JSON.stringify(state.bundle,null,2)+"\n"],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`inspectescrow-${state.bundle.roleName}-${state.bundle.manifest.sessionId}.evidence.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function cameraError(e){const n=e?.name||"";if(n==="NotAllowedError")return "브라우저 또는 Windows 카메라 권한이 거부됐습니다.";if(n==="NotFoundError")return "연결된 카메라 장치를 찾지 못했습니다.";if(n==="NotReadableError")return "다른 앱이 카메라를 사용 중이거나 장치를 열 수 없습니다.";if(n==="OverconstrainedError")return "선택한 카메라 조건을 지원하지 않습니다.";return err(e);}
async function cameraDiagnostics(){const out=$("camera-diagnostic-status"),sel=$("camera-device");if(!out||!sel)return 0;try{if(!window.isSecureContext)throw Error("localhost 또는 HTTPS 보안 컨텍스트가 아닙니다.");if(!navigator.mediaDevices?.enumerateDevices)throw Error("이 브라우저는 장치 열거 API를 지원하지 않습니다.");const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput");if(!document.contains(out)||!document.contains(sel))return 0;sel.innerHTML='<option value="">기본 카메라</option>'+devices.map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||`카메라 ${i+1} · 권한 허용 후 이름 표시`)}</option>`).join("");out.textContent=devices.length?`카메라 ${devices.length}개 감지 · 촬영 버튼에서 권한 확인`:`카메라 0개 감지 · 연결·Windows 권한을 확인하세요.`;return devices.length;}catch(e){if(document.contains(out))out.textContent="진단 실패 · "+cameraError(e);return 0;}}
async function startCamera(view){try{if(!window.isSecureContext)throw Error("카메라는 localhost 또는 HTTPS 보안 컨텍스트가 필요합니다.");if(!navigator.mediaDevices?.getUserMedia)throw Error("이 브라우저에서 카메라 API를 사용할 수 없습니다.");stopCamera();state.cameraView=view;$("camera-box").classList.remove("hidden");$("camera-target").textContent=view+" 촬영";$("camera-status").textContent="카메라 권한 및 장치 확인 중…";const deviceId=$("camera-device").value;state.stream=await navigator.mediaDevices.getUserMedia({video:deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:"environment"}},audio:false});$("camera-video").srcObject=state.stream;$("camera-status").textContent="라이브 프레임 준비 · 원본은 캡처 전까지 저장하지 않음";await cameraDiagnostics();}catch(e){$("camera-box").classList.remove("hidden");$("camera-status").textContent="카메라 사용 불가 · "+cameraError(e)+" 파일 업로드를 사용하세요.";}}
function stopCamera(){if(state.stream)state.stream.getTracks().forEach(t=>t.stop());state.stream=null;const video=$("camera-video"),box=$("camera-box");if(video)video.srcObject=null;if(box)box.classList.add("hidden");}
async function capture(){try{if(!state.stream||!state.cameraView)throw Error("활성 카메라가 없습니다.");const v=$("camera-video"),canvas=document.createElement("canvas");canvas.width=v.videoWidth;canvas.height=v.videoHeight;if(!canvas.width)throw Error("카메라 프레임이 아직 준비되지 않았습니다.");canvas.getContext("2d").drawImage(v,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.95));const file=new File([blob],`${state.cameraView.toLowerCase()}-${Date.now()}.jpg`,{type:"image/jpeg",lastModified:Date.now()});await select(state.cameraView,file);stopCamera();}catch(e){$("camera-status").textContent="촬영 실패 · "+err(e)+" · 다시 시도하거나 파일 업로드를 사용하세요.";}}
async function load(){restore();setFlow();try{const tradeId=activeTrade();$("trade-id").value=tradeId;for(const a of document.querySelectorAll('a[href="/evidence"]'))a.href="/evidence?tradeId="+encodeURIComponent(tradeId);for(const a of document.querySelectorAll('a[href^="/replay"]'))a.href="/replay?mode=offchain&tradeId="+encodeURIComponent(tradeId);for(const a of document.querySelectorAll('a[href="/e2e"]'))a.href="/e2e?tradeId="+encodeURIComponent(tradeId);state.config=await api("/api/live/config?tradeId="+encodeURIComponent(tradeId));$("trade-id").value=state.config.tradeId;const completed=[17,18,19].includes(Number(state.config.state));$("runtime").textContent=state.config.runtimeAvailable?"MODEL B ONLINE · "+short(state.config.runtime.checkpointSha256):"MODEL B 오프라인 · 보관 기록 조회 가능";$("truth").textContent=completed?"완료된 S05 거래 기록 · 새 실시간 검사 세션이 아니며 이번 화면에서 AI 재추론을 수행하지 않았습니다. · chain "+state.config.chainId:state.config.runtimeAvailable?state.config.governanceStatus+" · OFFCHAIN 증거 준비만 허용 · Station UNSIGNED · 온체인 NOT SUBMITTED · chain "+state.config.chainId:state.config.runtimeMessage+" · 실제 AI 추론 미실행 · chain "+state.config.chainId;$("bindings").innerHTML=[["Policy",state.config.policyHash],["Model Bundle",state.config.modelBundleHash],["Capture",state.config.captureProfileHash],["Threshold",state.config.thresholdScaled]].map(x=>`<div><small>${esc(x[0])}</small><code>${esc(x[1])}</code></div>`).join("");setFlow();}catch(e){state.config={runtimeAvailable:false};$("runtime").textContent="거래 컨텍스트 확인 실패";$("truth").textContent="잘못된 요청 또는 거래 컨텍스트로 검사 구성을 불러오지 못했습니다. · 실제 AI 추론 미실행 · "+err(e);setFlow();}}
syncPresetControls();$("presets-all").addEventListener("click",loadAllSupplierPresets);
for(const button of document.querySelectorAll(".preset-view"))button.addEventListener("click",async()=>{try{await loadSupplierPreset(button.dataset.view);$("presets-status").textContent=button.dataset.view+" 보관 사진 업로드 완료";}catch(e){$("presets-status").textContent="업로드 실패: "+err(e);}});
for(const view of ["TOP","FRONT","SIDE"]){$(view.toLowerCase()).addEventListener("change",e=>select(view,e.target.files?.[0]).catch(x=>alert(err(x))));}
document.querySelectorAll(".camera").forEach(b=>b.addEventListener("click",()=>startCamera(b.dataset.view)));$("diagnose-camera").addEventListener("click",cameraDiagnostics);$("capture").addEventListener("click",capture);$("stop-camera").addEventListener("click",stopCamera);$("new-session").addEventListener("click",newSession);$("infer").addEventListener("click",infer);$("build").addEventListener("click",build);$("download").addEventListener("click",download);$("role").addEventListener("change",clearRoleUploads);$("specimen-id").addEventListener("change",persist);window.addEventListener("beforeunload",()=>{stopCamera();state.urls.forEach(URL.revokeObjectURL);});load();cameraDiagnostics();
})();
