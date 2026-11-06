"use strict";
(()=>{
const $=id=>document.getElementById(id),SESSION_KEY="inspectescrow.evidence-session.v1",MAX_JSON=512*1024,MAX_IMAGE=20*1024*1024;
let bundle=null,bundleText="",bundleName="",lastResult=null,previewUrls=[];

let xaiCandidate=null,xaiSidecar=null,xaiVerified=false;
function resetXaiVerification(message="XAI 근거가 연결되지 않았습니다."){
  xaiVerified=false;
  $("xai-sidecar-export").disabled=true;
  $("xai-evidence-view").hidden=true;
  $("xai-evidence-overlay").removeAttribute("src");
  $("xai-validation-state").textContent=message;
}
async function verifyLinkedXai(result){
  resetXaiVerification("XAI 근거의 현재 Evidence 바인딩을 확인하고 있습니다…");
  if(!result||!bundle){resetXaiVerification("먼저 원본 3뷰·Evidence 검증을 완료하세요.");return;}
  if(!xaiCandidate&&!xaiSidecar){
    resetXaiVerification("현재 Evidence에 연결된 XAI 근거가 없습니다. AI 품질검사 화면에서 '실제 AI 근거 보기'를 실행하거나 .sidecar.json을 불러오세요.");
    return;
  }
  try{
    const lib=window.InspectEscrowXAI;
    if(!lib)throw Error("XAI_HELPER_NOT_LOADED");
    const candidate=xaiSidecar||await lib.wrap(xaiCandidate,bundle);
    const check=await lib.checkSidecar(candidate,bundle,result);
    if(!check.ok)throw Error(check.errors.join(", "));
    const xai=candidate.payload.xai;
    xaiSidecar=candidate;
    xaiVerified=true;
    $("xai-sidecar-export").disabled=false;
    $("xai-evidence-overlay").src="data:image/png;base64,"+xai.overlayPngBase64;
    $("xai-evidence-view").hidden=false;
    $("xai-evidence-title").textContent="실제 PatchCore XAI · "+xai.decision;
    $("xai-evidence-score").textContent="이상 점수 "+xai.scoreRaw+" / 임계값 "+(Number(xai.thresholdScaled)/1e6).toFixed(6)+" · 불량 확률(%) 아님";
    $("xai-evidence-bars").innerHTML=(xai.quadrants||[]).map(item=>{
      const relative=Math.max(0,Math.min(100,Number(item.relativeAnomalyIndex)||0));
      return '<div class="xai-evidence-bar"><span>'+escape(item.label)+'</span><span class="xai-evidence-track"><span class="xai-evidence-fill" style="width:'+relative.toFixed(1)+'%"></span></span><span>'+relative.toFixed(1)+'</span></div>';
    }).join("");
    $("xai-evidence-binding").textContent="TOP "+short(xai.originalTopSha256)+" · 모델 "+short(xai.modelCheckpointSha256)+
      " · Evidence "+short(candidate.payload.evidencePackageHash)+" · XAI 파일 내용 SHA-256 "+short(check.sha256);
    $("xai-validation-state").textContent="XAI 연결 검증 PASS · 이미 서버에서 검증한 Evidence 원본/점수/모델/해시에 일치 · 오프체인 미서명 참고자료 · TX 0";
  }catch(error){
    xaiSidecar=null;
    resetXaiVerification("XAI 연결 검증 불일치 · "+errorText(error)+" · 본 Evidence의 서버 검증 결과에는 영향을 주지 않았습니다.");
  }
}
function downloadXaiSidecar(){
  if(!xaiVerified||!xaiSidecar)return;
  const blob=new Blob([JSON.stringify(xaiSidecar,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;
  a.download="InspectEscrow_XAI_"+xaiSidecar.payload.roleName+"_"+(xaiSidecar.payload.sessionId||"session")+".sidecar.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}

function prefillLiveEvidence(){
  const h=window.__inspectEscrowEvidenceHandoff;
  const trade=$("expected-trade")?.value;
  if(!h||!h.bundle||!/^0x[0-9a-fA-F]{64}$/.test(trade||"")||
     h.tradeId.toLowerCase()!==trade.toLowerCase())return;
  if(!["supplier","buyer"].includes(h.role)||!["TOP","FRONT","SIDE"].every(v=>h.files?.[v] instanceof File))return;
  const text=JSON.stringify(h.bundle,null,2)+"\n";
  bundleText=text;bundle=JSON.parse(text);
  bundleName="inspectescrow-"+h.role+"-"+(h.sessionId||"session")+".evidence.json";
  const jsonFile=new File([text],bundleName,{type:"application/json"});
  const list=new DataTransfer();list.items.add(jsonFile);$("bundle-file").files=list.files;
  $("bundle-name").textContent=bundleName+" · 동일 브라우저 탭에서 연결";
  $("expected-role").value=h.role;
  for(const view of ["TOP","FRONT","SIDE"]){
    const file=h.files[view],input=$("image-"+view.toLowerCase()),dt=new DataTransfer();
    dt.items.add(file);input.files=dt.files;
    input.dispatchEvent(new Event("change",{bubbles:true}));
  }
  if(h.xai){xaiCandidate=h.xai;xaiSidecar=null;resetXaiVerification("AI 검사 화면의 XAI 히트맵이 자동 연결됐습니다. Evidence 서버 검증 후 원본·모델·점수·Evidence 해시를 함께 확인합니다.");$("xai-sidecar-name").textContent="XAI 원본 근거가 같은 탭에서 연결됨 · 서명/온체인 미제출";}
  const notice=$("auto-handoff-note");if(notice){notice.hidden=false;notice.textContent="✓ 이전 AI 검사 원본 3뷰 + Evidence JSON 자동 연결됨 · 아래 재검증 버튼을 눌러 실제 서버 검증 실행 · TX 0";}
  $("progress").textContent="원본과 증거가 연결됐습니다. 검증은 아직 실행되지 않았습니다.";
}

const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const short=s=>{s=String(s||"");return s.length>28?s.slice(0,12)+"…"+s.slice(-10):s;};
const errorText=e=>String(e?.message||e).slice(0,300);
async function asBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=reject;reader.readAsDataURL(file);});}
async function asText(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(file);});}
function selectedFile(id,label,max,type){const f=$(id).files?.[0];if(!f)throw Error(label+" 파일을 선택하세요.");if(f.size<1||f.size>max)throw Error(label+" 파일 크기가 허용 범위를 벗어났습니다.");if(type&&!["image/jpeg","image/png"].includes(f.type))throw Error(label+"은 JPEG/PNG만 허용됩니다.");return f;}
function dl(term,value){return `<dt>${escape(term)}</dt><dd>${escape(value)}</dd>`;}
function setPreview(view,file){const id=view.toLowerCase();$("name-"+id).textContent=file?.name||"재선택 필요";const img=$("preview-"+id);if(!file){img.style.display="none";img.removeAttribute("src");return;}const url=URL.createObjectURL(file);previewUrls.push(url);img.src=url;img.style.display="block";}
function clearPreviews(){previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];}
function session(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'{"history":[]}');}catch{return {history:[]};}}
function writeSession(result){if(!$("remember").checked)return;const previous=session(),item={tradeId:result.tradeId,roleName:result.roleName,verificationLevel:result.verificationLevel,evidencePackageHash:result.hashes.evidencePackageHash,verifiedAt:result.verifiedAt,onchainSubmitted:result.onchain.submitted,replayInputStatus:result.replayInputStatus,bundleFileName:bundleName};const history=[item,...(previous.history||[]).filter(x=>!(x.tradeId===item.tradeId&&x.roleName===item.roleName&&x.evidencePackageHash===item.evidencePackageHash))].slice(0,8);window.InspectEscrowContext?.write(result.tradeId);localStorage.setItem(SESSION_KEY,JSON.stringify({version:1,active:item,history}));renderHistory();}
function saveDraftSession(){try{if(!$("remember").checked)throw Error("최소 세션 메타데이터 기억을 먼저 선택하세요.");const tradeId=$("expected-trade").value.trim(),roleName=$("expected-role").value;if(!/^0x[0-9a-fA-F]{64}$/.test(tradeId))throw Error("32바이트 Trade ID를 입력하세요.");const previous=session(),item={tradeId,roleName,verificationLevel:"PENDING_FILES_REQUIRED",evidencePackageHash:null,verifiedAt:new Date().toISOString(),onchainSubmitted:false,replayInputStatus:"REPLAY_INPUT_BLOCKED",bundleFileName:bundleName||null};localStorage.setItem(SESSION_KEY,JSON.stringify({version:1,active:item,history:previous.history||[]}));$("progress").classList.remove("error");$("progress").textContent="현재 Trade ID와 역할만 기억했습니다. 원본 이미지·JSON·서명은 저장하지 않았습니다.";refreshChain(item).catch(e=>$("progress").textContent+="\nSepolia 재조회 실패: "+errorText(e));}catch(e){$("progress").classList.add("error");$("progress").textContent="작업 기억 실패: "+errorText(e);}}
function selectedTrade(){const query=new URLSearchParams(location.search).get("tradeId"),saved=window.InspectEscrowContext?.read()||"";return /^0x[0-9a-fA-F]{64}$/.test(query||"")?query:/^0x[0-9a-fA-F]{64}$/.test(saved||"")?saved:"";}
function syncLinks(tradeId){if(!tradeId)return;window.InspectEscrowContext?.write(tradeId);for(const a of document.querySelectorAll('a[href="/trades"]'))a.href="/trades?tradeId="+encodeURIComponent(tradeId);for(const a of document.querySelectorAll('a[href="/replay"]'))a.href="/replay?tradeId="+encodeURIComponent(tradeId);}
function restoreSession(){const s=session(),selected=selectedTrade();if(selected){syncLinks(selected);$("expected-trade").value=selected;if(s.active&&String(s.active.tradeId).toLowerCase()===selected.toLowerCase()){$("expected-role").value=s.active.roleName||"supplier";$("progress").textContent="선택 거래의 이전 메타데이터를 복구했습니다. 원본 JSON과 TOP·FRONT·SIDE는 저장하지 않았으므로 다시 선택하세요.\n마지막 결과: "+s.active.verificationLevel+" · "+s.active.verifiedAt;refreshChain(s.active).catch(()=>{});}else{$("expected-role").value="supplier";$("progress").textContent="활성 Trade ID를 복구했습니다. 다른 거래의 과거 증거는 자동 선택하지 않습니다. JSON과 원본 3뷰를 다시 선택하세요.";refreshChain({tradeId:selected,roleName:"supplier",evidencePackageHash:null}).catch(()=>{});}}else if(s.active){$("expected-trade").value=s.active.tradeId||"";$("expected-role").value=s.active.roleName||"supplier";syncLinks(s.active.tradeId);$("progress").textContent="이전 작업 메타데이터를 복구했습니다. 원본 JSON과 TOP·FRONT·SIDE는 저장하지 않았으므로 다시 선택하세요.\n마지막 결과: "+s.active.verificationLevel+" · "+s.active.verifiedAt;refreshChain(s.active).catch(()=>{});}renderHistory();}
function renderHistory(){const h=session().history||[];$("history").innerHTML=h.length?h.map((x,i)=>`<div class="history-item"><div><strong>${escape(x.roleName.toUpperCase())} · ${escape(x.verificationLevel)}</strong><code>${escape(x.tradeId)}</code><small>${escape(x.verifiedAt)} · ${escape(short(x.evidencePackageHash))} · ${x.onchainSubmitted?"온체인 제출 확인":"미제출/미확인"}</small></div><button data-history="${i}">이어보기</button></div>`).join(""):"<p>저장된 기록이 없습니다.</p>";$("history").querySelectorAll("button[data-history]").forEach(btn=>btn.addEventListener("click",()=>{const x=h[Number(btn.dataset.history)];$("expected-trade").value=x.tradeId;$("expected-role").value=x.roleName;syncLinks(x.tradeId);$("progress").textContent="기록을 선택했습니다. 현재 온체인 상태를 다시 조회하고, 재검증하려면 JSON과 원본 3뷰를 다시 선택하세요.";refreshChain(x).catch(e=>$("progress").textContent="온체인 재조회 실패: "+errorText(e));}));}
async function api(url,options={}){const r=await fetch(url,{cache:"no-store",...options});const data=await r.json();if(!r.ok)throw Error(data.error||data.detail||"HTTP_"+r.status);return data;}
async function verify(){try{$("verify").disabled=true;$("progress").classList.remove("error");$("progress").textContent="원본 바이트 SHA-256, canonical hash, EIP-712, Sepolia 상태를 검증 중입니다…";const jsonFile=selectedFile("bundle-file","증거 JSON",MAX_JSON);if(!bundle||jsonFile.name!==bundleName)throw Error("증거 JSON을 다시 불러오세요.");const images={};for(const view of ["TOP","FRONT","SIDE"]){const f=selectedFile("image-"+view.toLowerCase(),view,MAX_IMAGE,true);images[view]={name:f.name,data:await asBase64(f)};}const expectedTradeId=$("expected-trade").value.trim();if(!/^0x[0-9a-fA-F]{64}$/.test(expectedTradeId))throw Error("32바이트 Trade ID를 입력하세요.");const result=await api("/api/evidence/verify",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify({expectedTradeId,expectedRole:$("expected-role").value,bundle,images})});lastResult=result;renderResult(result);writeSession(result);await verifyLinkedXai(result);$("download").disabled=false;$("refresh-chain").disabled=false;$("progress").textContent="검증 완료 · 서버는 원본 이미지와 bundle 본문을 저장하지 않았습니다. 실제 TX 전송 0건.";}catch(e){lastResult=null;resetXaiVerification("본 Evidence 서버 검증이 실패하여 XAI 연결 검증도 중단했습니다.");$("download").disabled=true;$("refresh-chain").disabled=true;$("result").classList.add("hidden");$("progress").classList.add("error");$("progress").textContent="검증 실패: "+errorText(e)+"\nReplay 입력으로 사용할 수 없습니다.";}finally{$("verify").disabled=false;}}
function renderResult(r){$("result").classList.remove("hidden");$("level").textContent=r.verificationLevel;$("level").className="badge "+(r.verificationLevel==="FULL_VERIFICATION"?"":"partial");$("fact-role").textContent=r.roleName.toUpperCase();$("fact-decision").textContent=r.inference.decision+" · "+r.inference.scoreScaled;$("fact-signature").textContent=r.signature.status;$("fact-onchain").textContent=r.onchain.submitted&&r.onchain.evidenceMatches?"SUBMITTED · HASH MATCH":"NOT SUBMITTED";$("fact-replay").textContent=r.replayInputStatus;$("binding").innerHTML=dl("Trade ID",r.tradeId)+dl("Station",r.station)+dl("Policy Hash",r.hashes.policyHash)+dl("Model Bundle Hash",r.hashes.modelBundleHash)+dl("Capture Profile Hash",r.hashes.captureProfileHash)+dl("Evidence Package Hash",r.hashes.evidencePackageHash)+dl("Specimen Manifest Hash",r.hashes.specimenManifestHash);$("inference").innerHTML=dl("Raw score",r.inference.scoreRaw)+dl("Scaled score",r.inference.scoreScaled)+dl("Threshold",r.inference.thresholdScaled)+dl("Decision",r.inference.decision)+dl("Checkpoint SHA-256",r.inference.checkpointSha256)+dl("Operator specimen label",r.operatorSpecimenLabel)+dl("Capture session UTC",r.capturedAtUtc||"미기록");$("image-hashes").innerHTML=Object.entries(r.images).map(([v,x])=>dl(v+" · "+x.fileName,x.sha256+" · "+x.bytes+" bytes")).join("");$("chain").innerHTML=dl("Source",r.onchain.source||"ONCHAIN_READ_ONLY")+dl("Block",r.onchain.blockNumber||"—")+dl("State",r.onchain.stateName+"("+r.onchain.state+")")+dl("Submitted",String(r.onchain.submitted))+dl("Evidence hash match",String(r.onchain.evidenceMatches))+dl("Manifest hash match",String(r.onchain.manifestMatches))+dl("Outcome / attempt",(r.onchain.outcome??"—")+" / "+(r.onchain.attempt??"—"));$("checks").innerHTML=Object.entries(r.integrityChecks).map(([k,v])=>`<div class="check-row"><span>${escape(k)}</span><strong class="${v?"pass":"fail"}">${v?"PASS":"FAIL"}</strong></div>`).join("");$("limitations").innerHTML=r.limitations.map(x=>`<li>${escape(x)}</li>`).join("");}
async function refreshChain(record=lastResult){if(!record)throw Error("복구하거나 검증한 기록이 없습니다.");const tradeId=record.tradeId,role=record.roleName,evidencePackageHash=record.hashes?.evidencePackageHash||record.evidencePackageHash;const q=new URLSearchParams({tradeId,role,evidencePackageHash:evidencePackageHash||""});const d=await api("/api/evidence/status?"+q);$("progress").textContent=d.source+" 현재 상태 재조회 완료 · 블록 #"+d.blockNumber+" · "+d.stateName+"("+d.state+") · evidence hash "+(d.evidenceMatches?"MATCH":"NOT MATCH/NOT SUBMITTED")+" · TX 0";return d;}
function download(){if(!lastResult||!bundleText)return;const blob=new Blob([bundleText],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=bundleName.replace(/\.json$/i,"")+".verified-copy.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$("bundle-file").addEventListener("change",async()=>{try{lastResult=null;resetXaiVerification("새 Evidence JSON이 선택됐습니다. 재검증 후 XAI 연결을 다시 확인합니다.");const f=selectedFile("bundle-file","증거 JSON",MAX_JSON);bundleText=await asText(f);bundle=JSON.parse(bundleText);bundleName=f.name;$("bundle-name").textContent=f.name+" · "+f.size+" bytes";const message=bundle?.unsigned?.message||bundle?.message;if(message?.tradeId)$("expected-trade").value=message.tradeId;const role=bundle?.roleName||bundle?.role;if(["supplier","buyer"].includes(String(role).toLowerCase()))$("expected-role").value=String(role).toLowerCase();$("progress").textContent="JSON을 읽었습니다. 아직 PASS가 아닙니다. 원본 3뷰를 선택하고 재검증하세요.";}catch(e){bundle=null;bundleText="";bundleName="";$("bundle-name").textContent="잘못된 JSON: "+errorText(e);}});
for(const view of ["TOP","FRONT","SIDE"]){$("image-"+view.toLowerCase()).addEventListener("change",()=>setPreview(view,$("image-"+view.toLowerCase()).files?.[0]));}
$("verify").addEventListener("click",verify);$("save-session").addEventListener("click",saveDraftSession);$("download").addEventListener("click",download);$("refresh-chain").addEventListener("click",()=>refreshChain().catch(e=>$("progress").textContent="Sepolia 재조회 실패: "+errorText(e)));$("clear-session").addEventListener("click",()=>{localStorage.removeItem(SESSION_KEY);renderHistory();$("progress").textContent="브라우저의 최소 복구 메타데이터를 삭제했습니다. 원본 파일과 JSON은 애초에 저장되지 않았습니다.";});window.addEventListener("beforeunload",clearPreviews);
$("xai-sidecar-file").addEventListener("change",async()=>{
 try{
   const file=selectedFile("xai-sidecar-file","XAI 연결 보고서",4*1024*1024);
   const data=JSON.parse(await asText(file));
   if(data?.schema!==window.InspectEscrowXAI?.WRAPPER)throw Error("지원하지 않는 XAI 연결 보고서입니다.");
   xaiSidecar=data;xaiCandidate=null;xaiVerified=false;
   $("xai-sidecar-name").textContent=file.name+" · 선택됨";
   resetXaiVerification("XAI 연결 파일을 선택했습니다. 서버에서 Evidence 검증 후 연결 여부를 확인합니다.");
   if(lastResult)await verifyLinkedXai(lastResult);
 }catch(e){xaiSidecar=null;resetXaiVerification("XAI 보고서를 불러올 수 없습니다 · "+errorText(e));}
});
$("xai-sidecar-export").addEventListener("click",downloadXaiSidecar);
window.__evidence2b={sessionKey:SESSION_KEY,session,restoreSession,refreshChain};restoreSession();prefillLiveEvidence();
})();
