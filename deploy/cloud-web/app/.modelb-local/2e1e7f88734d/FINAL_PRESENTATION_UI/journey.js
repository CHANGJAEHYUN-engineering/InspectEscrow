"use strict";
const $=id=>document.getElementById(id),esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let current=null;
function short(v){const s=String(v||"");return s.length>18?s.slice(0,10)+"…"+s.slice(-6):s;}
function tag(value,kind){return `<span class="tag ${kind}">${esc(value)}</span>`;}
function fact(k,v){return `<div class="fact"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;}
function check(k,ok,detail){return `<div class="check"><span>${esc(k)}</span><b class="${ok?'pass':'fail'}">${ok?'PASS':'BLOCKED'}</b><small>${esc(detail)}</small></div>`;}
async function api(url){const r=await fetch(url,{cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.detail||d.error||"REQUEST_FAILED");return d;}
function render(d){current=d;const p=d.preflight;localStorage.setItem("inspectescrow.activeTrade.v1",p.tradeId);
 const network=p.chainId===11155111?"SEPOLIA":"LOCAL ANVIL";document.querySelector("#trade-select").closest(".panel").querySelector(".mode").textContent=`${network} READ-ONLY`;
 $("truth").textContent=`${p.mode} · 서버 TX ${d.serverTransactionsSent} · 정책 승인 ${p.policyApproved} · 자동 Broadcast ${p.readyForAutomaticBroadcast}`;
 $("trade-summary").innerHTML=fact("상태",`${p.stateName} (${p.state})`)+fact("정책 문서",p.policyDocumentStatus)+fact("정책 해시",short(p.policyHash))+fact("Block",p.rpcBlock)+fact("실행 게이트",p.executionGate);
 $("journey").innerHTML=d.routes.map(x=>{const href=x.route.startsWith("/#")?`/?tradeId=${encodeURIComponent(p.tradeId)}${x.route.slice(1)}`:`${x.route}${x.route.includes("?")?'&':'?'}tradeId=${encodeURIComponent(p.tradeId)}`;return `<a class="step" href="${esc(href)}"><small>STEP ${String(x.index).padStart(2,"0")}</small><b>${esc(x.label)}</b><span>${esc(href)}</span></a>`}).join("");
 const activeCred=Object.values(p.credentials).every(x=>x.active);$("preflight").innerHTML=[
  [p.chainId===11155111?"Sepolia Chain":"LOCAL ANVIL Chain",p.chainOk,`chainId ${p.chainId}`],["PATCH3 runtime",p.runtimePresent,short(p.runtimeHash)],["정책 hash",p.policyHashVerified,short(p.policyHash)],
  ["정책 사용자 승인",p.policyApproved,p.policyDocumentStatus],["Station credentials",activeCred,`${Object.values(p.credentials).filter(x=>x.active).length}/5 ACTIVE`],
  ["Model B runtime",p.modelB.available,p.modelB.available?"ONLINE":"OFFLINE · 추론 전 시작 필요"],["Disk ≥ 10 GiB",p.disk.safeForHeavyTests,`${p.disk.freeGiB} GiB free`],
  ["회계 보존",p.accounting.conserved&&p.accounting.balanceCoversLiabilities,`unsettled ${p.accounting.unsettledEscrowWei} wei`]
 ].map(x=>check(...x)).join("");
 $("blockers").innerHTML=p.blockers.map(x=>`<span>${esc(x)}</span>`).join("");
 $("roles").innerHTML=Object.entries(p.roleBalances).map(([role,x])=>`<article class="card"><h3>${esc(role)}</h3>${tag("ACTOR",'source')}<code>${esc(x.address)}</code><p>가스 잔액 ${esc(x.eth)} ETH</p><small>Station은 별도 credential 표에서 검증됩니다.</small></article>`).join("");
 $("scenarios").innerHTML=d.scenarios.map(s=>`<article class="card"><div>${tag("Scenario "+s.id,'source')} ${tag(s.status,s.status==='PASS'?'pass':'blocked')}</div><h3>${esc(s.name)}</h3><p>${esc(s.transitions.join(" → "))}</p><small>출처 ${esc(s.source)} · ${esc(s.proof)}</small><code>${esc(s.tradeId)}</code><small>복구: ${esc(s.recovery)}</small></article>`).join("");
 $("artifacts").innerHTML=Object.entries(d.artifacts).map(([name,x])=>`<article class="card"><div>${tag(x.allPass?'PASS':'BLOCKED',x.allPass?'pass':'blocked')}</div><h3>${esc(name)}</h3><p>${esc(x.checksPassed)}/${esc(x.checksTotal)} · 실제 Sepolia TX ${esc(x.actualSepoliaTransactions)}</p><code>${esc(x.sha256||x.error||'missing')}</code></article>`).join("");
 const m=d.releaseManifest;$("release").innerHTML=`Release manifest ${m.complete?tag('COMPLETE','pass'):tag('INCOMPLETE','fail')} · ${m.files.filter(x=>x.exists).length}/${m.files.length} files · Git action: ${esc(m.gitAction)}<br>제외: ${esc(m.denyPatterns.join(', '))}`;
 $("download").disabled=false;
}
async function load(){try{$("refresh").disabled=true;const id=$("trade-select").value;render(await api("/api/release/status?tradeId="+encodeURIComponent(id)));}catch(e){$("truth").textContent="Preflight 조회 실패: "+e.message;}finally{$("refresh").disabled=false;}}
$("trade-select").addEventListener("change",load);$("refresh").addEventListener("click",load);$("download").addEventListener("click",()=>{if(!current)return;const blob=new Blob([JSON.stringify(current,null,2)+"\n"],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="inspectescrow-2e-preflight-"+current.preflight.tradeId.slice(2,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
let saved="";try{const raw=localStorage.getItem("inspectescrow.activeTrade.v1")||"";saved=raw.startsWith("{")?JSON.parse(raw).tradeId:raw;}catch{}const query=new URLSearchParams(location.search).get("tradeId");const active=/^0x[0-9a-fA-F]{64}$/.test(query||"")?query:saved;if(/^0x[0-9a-fA-F]{64}$/.test(active||"")&&![...$("trade-select").options].some(x=>x.value.toLowerCase()===active.toLowerCase())){const option=document.createElement("option");option.value=active;option.textContent="선택 거래 · "+short(active);$("trade-select").prepend(option);}if([...$("trade-select").options].some(x=>x.value.toLowerCase()===String(active).toLowerCase()))$("trade-select").value=active;load();
