"use strict";
const $=id=>document.getElementById(id);
const CANDIDATE="0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff";
let current=0;
const slides=["CAPTURE · 실물 제품 촬영","INFERENCE · PatchCore 이상 점수","EVIDENCE · 원본·정책·서명 상태","SETTLEMENT · Replay·판단·정산"];
function activeTrade(){
  const q=new URLSearchParams(location.search).get("tradeId");let saved="";
  try{const raw=localStorage.getItem("inspectescrow.activeTrade.v1")||"";saved=raw.startsWith("{")?JSON.parse(raw).tradeId:raw;}catch{}
  return /^0x[0-9a-fA-F]{64}$/.test(q||"")?q:(/^0x[0-9a-fA-F]{64}$/.test(saved||"")?saved:CANDIDATE);
}
function short(v,n=10){return v&&v.length>20?v.slice(0,n)+"…"+v.slice(-6):String(v||"—");}
function syncTradeLinks(tradeId){
  localStorage.setItem("inspectescrow.activeTrade.v1",tradeId);
  const routes={"/live":"/live?tradeId=","/evidence":"/evidence?tradeId=","/resolution":"/resolution?tradeId=","/journey":"/journey?tradeId="};
  for(const [from,to] of Object.entries(routes))document.querySelectorAll(`a[href="${from}"]`).forEach(a=>a.href=to+encodeURIComponent(tradeId));
  document.querySelectorAll('a[href^="/replay"]').forEach(a=>a.href="/replay?mode=offchain&tradeId="+encodeURIComponent(tradeId));
}
function show(n){
  current=Math.max(0,Math.min(3,n));
  document.querySelectorAll(".slide").forEach((el,i)=>el.classList.toggle("active",i===current));
  document.querySelectorAll(".step-rail li").forEach((el,i)=>el.classList.toggle("active",i===current));
  $("slide-title").textContent=slides[current];$("position").textContent=`${current+1} / 4`;$("prev").disabled=current===0;
  $("next").textContent=current===3?"증빙 대시보드 보기":"다음 단계";
}
async function json(url){const r=await fetch(url,{cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.detail||d.error||`HTTP ${r.status}`);return d;}
async function health(){
  const tradeId=activeTrade();syncTradeLinks(tradeId);$("trade-short").textContent="Trade "+short(tradeId);
  try{
    const p=await json("/api/ping");
    await json("/api/release/status?tradeId="+encodeURIComponent(tradeId));
    $("rpc-health").className="badge ok";$("rpc-health").textContent=(p.networkMode==="SEPOLIA"?"SEPOLIA RPC":"LOCAL EVM")+" ONLINE";
    $("network").textContent=p.networkMode==="SEPOLIA"?"SEPOLIA READ-ONLY":"LOCAL / CONFIGURED EVM";
  }catch{$("rpc-health").className="badge bad";$("rpc-health").textContent="RPC BLOCKED";$("network").textContent="ONCHAIN READBACK BLOCKED";}
  try{await json("/api/modelb/status");$("ai-health").className="badge ok";$("ai-health").textContent="MODEL B ONLINE";}
  catch{$("ai-health").className="badge bad";$("ai-health").textContent="MODEL B BLOCKED";$("inference-status").className="status blocked";$("inference-status").textContent="BLOCKED";}
  const saved=JSON.parse(localStorage.getItem("inspectescrow.live-session.v1")||"{}");
  if(saved.tradeId===tradeId&&saved.lastInference){$("live-score").textContent=saved.lastInference.scoreRaw??"—";$("live-decision").textContent=saved.lastInference.decision||"검사 완료";$("inference-status").className="status complete";$("inference-status").textContent="COMPLETE";}
  if(saved.tradeId===tradeId&&saved.hasBundle){$("bundle-status").className="status complete";$("bundle-status").textContent="COMPLETE";}
}
$("start").addEventListener("click",()=>{$("intro").hidden=true;$("deck").hidden=false;show(0);window.scrollTo({top:0,behavior:"smooth"});});
$("prev").addEventListener("click",()=>show(current-1));
$("next").addEventListener("click",()=>{if(current===3){document.querySelector(".proofs").scrollIntoView({behavior:"smooth"});return;}show(current+1);});
$("fullscreen").addEventListener("click",async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{}});
$("capture-png").addEventListener("click",async()=>{
  const button=$("capture-png"),before=button.textContent;button.disabled=true;button.textContent="PNG 생성 중…";
  try{
    if(typeof html2canvas!=="function")throw Error("PNG renderer unavailable");
    const canvas=await html2canvas(document.documentElement,{backgroundColor:"#f3fbf8",useCORS:true,scale:1,width:innerWidth,height:innerHeight,windowWidth:innerWidth,windowHeight:innerHeight,scrollX:0,scrollY:-scrollY});
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw Error("PNG encoding failed");
    const url=URL.createObjectURL(blob),a=document.createElement("a"),date=new Date().toISOString().slice(0,10).replaceAll("-","");a.href=url;a.download=`InspectEscrow-Presentation-${innerWidth}x${innerHeight}-step${current+1}-${date}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(e){alert("PNG 저장 실패 · "+e.message);}finally{button.disabled=false;button.textContent=before;}
});
document.addEventListener("keydown",e=>{if($("deck").hidden)return;if(e.key==="ArrowRight")show(current+1);if(e.key==="ArrowLeft")show(current-1);if(e.key.toLowerCase()==="f")$("fullscreen").click();});
document.querySelectorAll("[data-step]").forEach(el=>el.addEventListener("click",()=>show(Number(el.dataset.step))));
document.querySelectorAll("[data-proof]").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll("[data-proof]").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".proof").forEach(x=>x.classList.remove("active"));btn.classList.add("active");$(btn.dataset.proof).classList.add("active");}));
document.querySelectorAll("[data-copy]").forEach(btn=>btn.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(btn.dataset.copy);const before=btn.textContent;btn.textContent="복사됨";setTimeout(()=>btn.textContent=before,1200);}catch{btn.textContent="복사 실패";}}));
show(0);health();
