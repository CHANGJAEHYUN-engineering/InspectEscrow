"use strict";
(()=>{
const $=id=>document.getElementById(id);
if(!$("assist-top"))return;
const MAX=8*1024*1024;
const state={files:{},urls:{},report:null,xai:null,verified:false,busy:false,revision:0,originalLabel:""};
const names=["top","front","side"];
const sha256=async file=>{
  const buffer=await file.arrayBuffer();
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",buffer));
  return [...bytes].map(n=>n.toString(16).padStart(2,"0")).join("");
};
const clean=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const short=x=>String(x||"").length>28?String(x).slice(0,15)+"…"+String(x).slice(-10):String(x||"");
const setBusy=(value)=>{
  state.busy=value;
  $("assist-inspect").disabled=value;
  $("assist-reset").disabled=value;
  $("assist-explain").disabled=value||!state.report;
  $("assist-verify").disabled=value||!state.report;
  $("assist-export").disabled=value||!state.report;
  names.forEach(n=>$("assist-"+n).disabled=value);
  $("assist-label").disabled=value;
};
function discardResults(){
  state.revision++;
  state.report=null;state.xai=null;state.verified=false;
  $("assist-result").className="assist-result-empty";
  $("assist-result").textContent="실제 Model B 추론 결과가 여기에 표시됩니다.";
  $("assist-verify-status").className="assist-result-muted";
  $("assist-verify-status").textContent="Evidence 보고서를 생성하면 원본과 비교해 확인할 수 있습니다.";
  $("assist-xai").hidden=true;
  $("assist-heatmap-image").removeAttribute("src");
  $("assist-xai-progress").textContent="AI 검사가 완료되면 근거 시각화를 실행할 수 있습니다.";
  $("assist-explain").disabled=true;$("assist-verify").disabled=true;$("assist-export").disabled=true;
}
function reset(){
  for(const n of names){
    if(state.urls[n])URL.revokeObjectURL(state.urls[n]);
    delete state.urls[n];delete state.files[n];
    $("assist-"+n).value="";
    const image=$("assist-preview-"+n);image.removeAttribute("src");image.hidden=true;
    $("assist-"+n+"-status").textContent="사진 선택";
  }
  discardResults();
  $("assist-progress").textContent="이미지 3장을 선택하세요. 이전 검사의 원본과 결과는 탭 메모리에서 비워졌습니다.";
}
function choose(name,file){
  if(state.busy)return;
  if(state.urls[name])URL.revokeObjectURL(state.urls[name]);
  delete state.urls[name];delete state.files[name];
  const image=$("assist-preview-"+name);image.hidden=true;image.removeAttribute("src");
  if(file){
    if(file.size<500||file.size>MAX||!/image\/(jpeg|png)/.test(file.type))
      throw Error(name.toUpperCase()+"은 500B~8MB JPEG/PNG 원본만 허용합니다.");
    state.files[name]=file;
    state.urls[name]=URL.createObjectURL(file);
    image.src=state.urls[name];image.hidden=false;
    $("assist-"+name+"-status").textContent=file.name+" · "+(file.size/1024).toFixed(0)+" KB";
  }else $("assist-"+name+"-status").textContent="사진 선택";
  discardResults();
  $("assist-progress").textContent=names.filter(n=>state.files[n]).length+"/3 원본 사진 준비됨 · 원본이 바뀌어 이전 판정·XAI를 초기화했습니다.";
}
const request=async(endpoint,form)=>{
  const response=await fetch(endpoint,{method:"POST",body:form,cache:"no-store"});
  const data=await response.json().catch(()=>({error:"INVALID_RESPONSE"}));
  if(!response.ok)throw Error(data.detail||data.error||"HTTP_"+response.status);
  return data;
};
function validateLabel(){
 const label=$("assist-label").value.trim();
 if(label.length<2||label.length>100||/[\x00-\x1f]/.test(label))throw Error("상품 라벨은 2~100자로 입력하세요.");
 return label;
}
function formFor(views,label){
 const f=new FormData();
 f.append("specimen_label",label);
 for(const view of views){
   const file=state.files[view];if(!file)throw Error(view.toUpperCase()+" 원본을 선택하세요.");
   f.append(view,file,file.name);
 }
 return f;
}
async function inspect(){
 if(state.busy)return;
 const revision=state.revision;
 setBusy(true);
 $("assist-progress").textContent="고정된 Model B에서 TOP 실제 추론 및 원본 3뷰 해시 검증 중…";
 try{
   const label=validateLabel(),form=formFor(names,label);
   const hashes=Object.fromEntries(await Promise.all(names.map(async n=>[n.toUpperCase(),await sha256(state.files[n])])));
   if(new Set(Object.values(hashes)).size!==3)throw Error("TOP·FRONT·SIDE는 서로 다른 원본이어야 합니다.");
   const data=await request("/api/assist/inspect",form);
   if(revision!==state.revision)throw Error("입력이 변경되었습니다. 다시 검사하세요.");
   if(!data.ok||data.mode!=="OFFCHAIN_ADVISORY_NO_ESCROW"||
       !data.bundle?.manifest?.completeThreeViewCapture||
       !names.every(n=>data.originalSha256?.[n.toUpperCase()]===hashes[n.toUpperCase()]&&
             data.bundle.manifest.captureFiles[n.toUpperCase()]?.sha256===hashes[n.toUpperCase()])||
       data.bundle.inference?.inputImageSha256!==hashes.TOP||
       data.bundle.evidence?.onchainSubmitted!==false||
       data.bundle.evidence?.stationSigned!==false||
       Number(data.transactionsSent)!==0)
     throw Error("AI 증거와 실제 원본 바이트의 연결 검증 실패");
   state.report=data;state.originalLabel=label;state.verified=false;state.xai=null;
   const review=String(data.decision).includes("REVIEW");
   $("assist-result").className="assist-score";
   $("assist-result").innerHTML="<strong class='"+(review?"review":"")+"'>"+clean(data.decision)+"</strong>"+
      "<p>이상 점수 <b>"+clean(data.scoreRaw)+"</b> / 임계값 <b>"+clean((Number(data.thresholdScaled)/1e6).toFixed(6))+"</b></p>"+
      "<p>모델: CNN WideResNet50-2 특징을 사용하는 PatchCore · 불량 확률 %가 아닌 이상 점수</p>"+
      "<code>TOP 원본 SHA-256 "+clean(hashes.TOP)+"</code><p>미서명 오프체인 Evidence 생성 · 대금 예치·TX 0건</p>";
   $("assist-progress").textContent="실제 AI 검사 완료. XAI 근거를 보거나 원본 해시를 재검증할 수 있습니다.";
   $("assist-verify-status").textContent="검사 증거 생성 완료 · 원본 파일 3장을 다시 해시 계산해 일치 여부를 확인할 수 있습니다.";
 }catch(error){
   $("assist-progress").textContent="AI 검사 실패 · "+String(error.message||error).slice(0,260);
 }finally{setBusy(false);}
}
async function explain(){
 if(state.busy||!state.report)return;
 const revision=state.revision,report=state.report;
 setBusy(true);$("assist-xai-progress").textContent="고정된 PatchCore의 실제 위치별 이상도 지도 추론 중…";
 try{
   const data=await request("/api/assist/explain",formFor(["top"],state.originalLabel));
   if(revision!==state.revision||state.report!==report)throw Error("원본이 변경되었습니다.");
   const hash=await sha256(state.files.top);
   if(!data.ok||data.method!=="PATCHCORE_NATIVE_ANOMALY_MAP"||
      data.originalTopSha256!==hash||
      data.modelCheckpointSha256!==report.bundle.inference?.modelCheckpointSha256||
      String(data.scoreScaled)!==String(report.scoreScaled)||data.decision!==report.decision||
      typeof data.overlayPngBase64!=="string"||data.overlayPngBase64.length<100||
      data.overlayPngBase64.length>2000000||!/^[A-Za-z0-9+/=]+$/.test(data.overlayPngBase64))
     throw Error("XAI와 원본·모델·판정의 검증 값이 일치하지 않습니다.");
   state.xai=data;
   $("assist-heatmap-image").src="data:image/png;base64,"+data.overlayPngBase64;
   $("assist-xai").hidden=false;
   const quadrants=Array.isArray(data.quadrants)?data.quadrants:[];
   $("assist-heatmap-bars").innerHTML=quadrants.map(item=>{
     const value=Math.max(0,Math.min(100,Number(item.relativeAnomalyIndex)||0));
     return "<div class='assist-bar'><span>"+clean(item.label)+"</span>"+
       "<span class='assist-bar-track'><span class='assist-bar-fill' style='display:block;width:"+value.toFixed(1)+"%'></span></span>"+
       "<span>"+value.toFixed(1)+"</span></div>";
   }).join("");
   $("assist-heatmap-note").textContent="4개 영역 막대는 해당 이미지 내부에서 정규화된 상대 이상도입니다. 불량 확률이나 물리적 결함 확정이 아닙니다. XAI도 온체인에 등록되지 않습니다.";
   $("assist-xai-progress").textContent="실제 Model B anomaly_map 생성 완료 · TOP 원본·고정 모델 해시·판정 점수 일치";
 }catch(error){
   state.xai=null;$("assist-xai").hidden=true;
   $("assist-xai-progress").textContent="XAI 생성 실패 · "+String(error.message||error).slice(0,240);
 }finally{setBusy(false);}
}
async function verify(){
 if(state.busy||!state.report)return;
 const h=state.report.bundle?.manifest?.captureFiles;
 const input=state.report.originalSha256;
 const hashes=Object.fromEntries(await Promise.all(names.map(async n=>[n.toUpperCase(),await sha256(state.files[n])])));
 const ok=names.every(n=>hashes[n.toUpperCase()]===input?.[n.toUpperCase()]&&
   hashes[n.toUpperCase()]===h?.[n.toUpperCase()]?.sha256)&&
   state.report.bundle.inference?.inputImageSha256===hashes.TOP&&
   state.originalLabel===$("assist-label").value.trim();
 state.verified=ok;
 $("assist-verify-status").className="assist-result-muted "+(ok?"good":"bad");
 $("assist-verify-status").textContent=ok?
   "PASS · TOP/FRONT/SIDE 원본 SHA-256 3/3 일치 · AI 입력 원본 연결 확인 · 미서명 오프체인 기록":
   "불일치 · 검사 당시의 원본 또는 상품 라벨이 변경되었습니다. 새 검사가 필요합니다.";
}
async function exportReport(){
 if(!state.report||state.busy)return;
 if(!state.verified)await verify();
 if(!state.verified)throw Error("원본 해시 재검증을 먼저 통과해야 합니다.");
 const x=state.xai;
 const reportDoc={
   schema:"InspectEscrow.AdvisoryEvidence.v1",generatedAtUtc:new Date().toISOString(),
   mode:"OFFCHAIN_ADVISORY_NO_ESCROW",modelScope:"METAL_NUT_ONLY",
   operatorSpecimenLabel:state.originalLabel,
   inspection:state.report.bundle,
   originalSha256:state.report.originalSha256,
   anomalyScore:{scoreRaw:state.report.scoreRaw,scoreScaled:state.report.scoreScaled,
     thresholdScaled:state.report.thresholdScaled,decision:state.report.decision},
   xai:x?{...x}:null,
   verification:{originalsRehashed:true,originalsMatched:true,stationSigned:false,onchainSubmitted:false},
   escrow:{funded:false,settled:false,amountWei:"0",transactionsSent:0},
   disclaimer:"Unsigned offchain reference only. This document does not prove physical specimen identity, authentic goods, defect probability, legal responsibility or blockchain notarization."
 };
 const bytes=new TextEncoder().encode(JSON.stringify(reportDoc));
 reportDoc.localReportSha256=await sha256(new File([bytes],"report.json",{type:"application/json"}));
 const blob=new Blob([JSON.stringify(reportDoc,null,2)+"\n"],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="InspectEscrow_Advisory_"+state.originalLabel.replace(/[^A-Za-z0-9_-]/g,"_").slice(0,50)+".json";
 a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
 $("assist-verify-status").textContent="PASS · 원본 해시 3/3 일치 · 미서명 오프체인 증거 보고서 저장 요청 완료";
}
for(const n of names){
 $("assist-"+n).addEventListener("change",e=>{
   try{choose(n,e.target.files?.[0]);}
   catch(error){$("assist-"+n).value="";choose(n,null);$("assist-progress").textContent=error.message;}
 });
}
$("assist-label").addEventListener("input",()=>{if(!state.busy){discardResults();$("assist-progress").textContent="상품 라벨이 변경되었습니다. 새 검사를 실행하세요."; }});
$("assist-reset").addEventListener("click",reset);
$("assist-inspect").addEventListener("click",inspect);
$("assist-explain").addEventListener("click",explain);
$("assist-verify").addEventListener("click",()=>verify().catch(e=>$("assist-verify-status").textContent=e.message));
$("assist-export").addEventListener("click",()=>exportReport().catch(e=>$("assist-verify-status").textContent=e.message));
window.addEventListener("beforeunload",()=>Object.values(state.urls).forEach(u=>URL.revokeObjectURL(u)));
})();