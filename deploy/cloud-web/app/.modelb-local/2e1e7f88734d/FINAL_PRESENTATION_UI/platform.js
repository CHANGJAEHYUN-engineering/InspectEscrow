"use strict";
(()=>{
const $=id=>document.getElementById(id);
const LEGACY_TRADE_KEY="inspectescrow.activeTrade.v1";
const TradeContext=window.InspectEscrowContext=window.InspectEscrowContext||(()=>{
  let scope=null;
  const validId=value=>/^0x[0-9a-fA-F]{64}$/.test(String(value||""));
  const validAddress=value=>/^0x[0-9a-fA-F]{40}$/.test(String(value||""));
  const key=()=>scope?`inspectescrow.activeTrade.v2:${scope.chainId}:${scope.contract.toLowerCase()}`:null;
  return{
    configure(value){const chainId=Number(value?.chainId),contract=String(value?.contract||"");if(!Number.isInteger(chainId)||!validAddress(contract))throw Error("NETWORK_CONTEXT_INVALID");scope={chainId,contract};return this.current();},
    current(){return scope?{...scope,key:key()}:null;},
    read(){try{const storageKey=key();if(!storageKey)return"";const value=localStorage.getItem(storageKey)||"";return validId(value)?value:"";}catch{return"";}},
    write(value){if(!validId(value)||!key())return false;localStorage.setItem(key(),String(value));return true;},
    clear(){try{if(key())localStorage.removeItem(key());}catch{}},
    matches(value){return !!scope&&Number(value?.chainId)===scope.chainId&&String(value?.contract||"").toLowerCase()===scope.contract.toLowerCase();},
    legacyKey:LEGACY_TRADE_KEY
  };
})();
const ROLE_KEY="inspectescrow.previewRole.v1";
const TOOL_SCRIPTS={trades:"/trades.js","new-trade":"/new-trade.js",live:"/live.js",evidence:"/evidence.js",e2e:"/e2e.js",replay:"/replay.js",resolution:"/resolution.js",stage:"/stage.js"};
const TOOL_STYLES={trades:["/trades.css","/trades-2b.css"],"new-trade":["/new-trade.css"],live:["/live.css","/live-camera.css"],evidence:["/evidence.css"],e2e:["/e2e.css"],replay:["/replay.css"],resolution:["/resolution.css"],stage:["/stage.css"]};
const ROUTES={
  "/":{view:"dashboard"},
  "/trades":{view:"trades",tool:"trades"},
  "/new-trade":{view:"trades",tool:"new-trade"},
  "/live":{view:"inspection",tool:"live"},
  "/evidence":{view:"inspection",tool:"evidence"},
  "/e2e":{view:"inspection",tool:"e2e"},
  "/replay":{view:"disputes",tool:"replay"},
  "/stage":{view:"disputes",tool:"stage"},
  "/resolution":{view:"settlement",tool:"resolution"},
  "/settlement":{view:"settlement",tool:"resolution"},
  "/audit":{view:"audit"}
};
const CATEGORY_PATH={dashboard:"/",trades:"/trades",inspection:"/live",disputes:"/replay",settlement:"/resolution",audit:"/audit"};
const TOOL_PATH={trades:"/trades","new-trade":"/new-trade",live:"/live",evidence:"/evidence",e2e:"/e2e",replay:"/replay",stage:"/stage",resolution:"/resolution"};
const ROLE_LABELS={buyer:"구매·발주사",supplier:"공급·납품사",station:"현장 검사 담당자",primaryInspector:"1차 독립 검증자",backupInspector:"예비 독립 검증자",externalArbitrator:"외부 분쟁 중재자",operator:"플랫폼 운영자"};
const ROLE_TASKS={
  buyer:{mission:"예치부터 입고 수락까지",description:"Buyer 지갑으로 정책 승인·예치·입고 검사·최종 수락 또는 환급 상태를 확인합니다.",tasks:[["정책·예치","/trades"],["입고 검사","/e2e"],["정산·환급","/resolution"]]},
  supplier:{mission:"거래 생성과 출하 검사",description:"Supplier 지갑으로 거래를 제안하고 Supplier Station의 출하 Evidence 이후 Actor TX를 제출합니다.",tasks:[["거래 생성","/new-trade"],["출하 검사","/live"],["대금 수령","/resolution"]]},
  station:{mission:"검사 Evidence와 EIP-712 서명",description:"Station Operator는 업무 분류입니다. 실제 서명은 거래에 고정된 Supplier·Buyer·Inspector Station 지갑별로 분리됩니다.",tasks:[["AI 품질검사","/live"],["Evidence 검증","/evidence"],["Station 서명","/e2e"]]},
  primaryInspector:{mission:"1차 분쟁 Replay와 별도 Decision",description:"DISPUTED_PRIMARY에서만 Primary Actor와 Primary Station 조합으로 Replay 및 판단을 수행합니다.",tasks:[["Inspector Replay","/replay"],["Decision","/resolution"],["감사 근거","/audit"]]},
  backupInspector:{mission:"예비 검증 전환 대기",description:"배정 수락 후 Primary timeout과 적법한 전환을 확인하며, DISPUTED_BACKUP에서만 대체 Replay·Decision이 활성화됩니다.",tasks:[["배정 상태","/trades"],["전환 조건","/stage"],["Backup Replay","/replay"]]},
  externalArbitrator:{mission:"외부 중재 개시 조건 확인",description:"일반 Inspector 경로와 분리되며 ARBITRATION_PENDING에서만 외부 중재 Actor·Station이 판단을 제출합니다.",tasks:[["중재 상태","/stage"],["중재 판단","/resolution"],["감사 기록","/audit"]]},
  operator:{mission:"운영 현황·Station 자격·감사",description:"현황은 조회 가능하지만 Credential 변경은 온체인 Authority와 일치한 지갑만 실행할 수 있습니다.",tasks:[["운영 현황","/"],["자격 관리","/#credentials"],["시스템 감사","/audit"]]}
};
const OUTCOME={0:"미제출",1:"INVALID",2:"PASS",3:"REVIEW"};
const state={ping:null,detail:null,preflight:null,registry:null,resolutionContext:null,wallet:null,walletChainId:null,registrySimulation:null,selectedStation:null,activeTool:null,activeView:"dashboard",role:localStorage.getItem(ROLE_KEY)||"buyer",auditPayload:null};

const short=(value,head=10,tail=8)=>{const s=String(value||"");return s.length>head+tail+3?s.slice(0,head)+"…"+s.slice(-tail):s;};
const esc=value=>String(value??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m]);
const validTrade=value=>/^0x[0-9a-fA-F]{64}$/.test(String(value||""));
function readSavedTrade(){return TradeContext.read();}
function activeTrade(){const query=new URLSearchParams(location.search).get("tradeId");return validTrade(query)?query:readSavedTrade();}
function saveTrade(id){return TradeContext.write(id);}
function toast(message,danger=false){const el=$("platform-toast");el.textContent=message;el.classList.toggle("danger",danger);el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,4200);}
function friendlyError(error){const raw=String(error?.shortMessage||error?.reason||error?.message||error||"");const map=[["NETWORK_TRADE_NOT_FOUND","선택한 네트워크에 존재하지 않는 거래입니다."],["TRADE_NOT_FOUND_ON_ACTIVE_NETWORK","선택한 네트워크에 존재하지 않는 거래입니다."],["DeadlinePassed","거래 실행 기한이 지났습니다. 새로운 거래를 준비해 주세요."],["0x70f65caa","거래 실행 기한이 지났습니다. 새로운 거래를 준비해 주세요."],["DEADLINE_EXPIRED_BY_WALL_CLOCK","다음 블록 예상 시각 기준으로 거래 기한이 이미 만료됐습니다. 새로운 거래를 준비해 주세요."],["UnauthorizedAuthority","자격 관리 권한이 없어 조회만 가능합니다."],["UnauthorizedCaller","현재 선택된 지갑은 이 작업의 담당 계정이 아닙니다."],["UnauthorizedStation","현재 서명 지갑은 이 거래에 지정된 검사 장비 계정이 아닙니다."],["InvalidCredentialState","현재 자격 상태에서는 선택한 변경을 실행할 수 없습니다."],["WRONG_CHAIN","MetaMask 네트워크가 현재 InspectEscrow 네트워크와 다릅니다."],["chain mismatch","MetaMask 네트워크가 현재 InspectEscrow 네트워크와 다릅니다."],["AI server","AI 검사 서버에 연결할 수 없습니다. 검사 기능이 일시적으로 제한됩니다."],["unknown custom error","현재 네트워크에서 선택한 거래 상태를 확인할 수 없습니다. Trade ID와 네트워크를 확인해 주세요."],["user rejected","사용자가 MetaMask 요청을 취소했습니다."],["ACTION_REJECTED","사용자가 MetaMask 요청을 취소했습니다."]];return map.find(([token])=>raw.toLowerCase().includes(token.toLowerCase()))?.[1]||raw;}
async function json(url,options={}){const response=await fetch(url,{cache:"no-store",...options});let body;try{body=await response.json();}catch{throw Error("서버 응답을 해석할 수 없습니다. HTTP "+response.status);}if(!response.ok){const raw=String(body.detail||body.error||"요청 실패"),error=Error(friendlyError(raw));error.technicalDetail=raw;error.httpStatus=response.status;throw error;}return body;}
function withTrade(path){const url=new URL(path,location.origin),selected=new URLSearchParams(location.search).get("tradeId"),id=validTrade(selected)?selected:state.detail?.id||readSavedTrade();if(validTrade(id)&&!url.searchParams.has("tradeId"))url.searchParams.set("tradeId",id);return url.pathname+url.search+url.hash;}
function navigate(path,replace=false){const target=withTrade(path);history[replace?"replaceState":"pushState"]({},"",target);renderRoute({scrollToTop:true});}

function route(){return ROUTES[location.pathname]||ROUTES["/"];}
function renderRoute({scrollToTop=false}={}){
  const current=route();state.activeView=current.view;
  document.querySelectorAll(".platform-view").forEach(view=>{const hidden=view.dataset.view!==current.view;if(view.hidden!==hidden)view.hidden=hidden;});
  document.querySelectorAll(".platform-nav [data-route]").forEach(link=>link.classList.toggle("active",link.dataset.route===current.view));
  document.querySelectorAll(".task-tabs button").forEach(button=>button.classList.toggle("active",button.dataset.tool===current.tool||(button.dataset.native==="roles"&&current.view==="trades"&&!current.tool)));
  if(current.tool)showTool(current.view,current.tool);
  else hideToolHosts();
  if(scrollToTop)window.scrollTo({top:0,behavior:"instant"});
}
function setToolStyles(){
  // Legacy modules use document-wide selectors. The integrated shell mounts one
  // scoped enterprise component system instead of leaking those selectors globally.
  $("tool-style-base").href="data:text/css,";
  $("tool-style-extra").href="data:text/css,";
}
function hideToolHosts(){document.querySelectorAll(".tool-host").forEach(host=>{host.hidden=true;});if($("roles-native"))$("roles-native").hidden=true;setToolStyles(null);state.activeTool=null;}
function hostFor(view){return $("tool-host-"+view);}
function normalizeToolMessages(surface){
  const replacements=[["execution reverted (unknown custom error)","현재 네트워크에서 선택한 거래를 확인할 수 없습니다. Trade ID와 네트워크를 확인해 주세요."],["fetch failed","AI 검사 서버에 연결할 수 없습니다. 검사 기능이 일시적으로 제한됩니다."]];
  const apply=()=>{const walker=document.createTreeWalker(surface,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){let value=node.nodeValue;for(const [raw,message] of replacements)value=value.replaceAll(raw,message);if(value!==node.nodeValue)node.nodeValue=value;}};
  apply();new MutationObserver(apply).observe(surface,{subtree:true,childList:true,characterData:true});
}
function normalizeButtons(surface){const apply=root=>{if(root.matches?.("button:not([type])"))root.type="button";root.querySelectorAll?.("button:not([type])").forEach(button=>{button.type="button";});};apply(surface);new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE)apply(node);}))).observe(surface,{subtree:true,childList:true});}
async function showTool(view,tool){
  const host=hostFor(view);if(!host)return;
  if(state.activeTool===tool&&host.dataset.tool===tool&&!host.hidden)return;
  setToolStyles(tool);
  document.querySelectorAll(".tool-host").forEach(x=>x.hidden=x!==host);if($("roles-native"))$("roles-native").hidden=true;
  document.querySelectorAll(".task-tabs button").forEach(button=>button.classList.toggle("active",button.dataset.tool===tool));
  state.activeTool=tool;host.dataset.tool=tool;host.hidden=false;host.innerHTML='<div class="tool-loading">업무 화면과 최신 거래 컨텍스트를 불러오는 중입니다…</div>';
  try{
    const response=await fetch("/tools/"+tool+location.search,{cache:"no-store"});if(!response.ok)throw Error("업무 화면 HTTP "+response.status);
    const source=await response.text();
    if(state.activeTool!==tool||host.dataset.tool!==tool||host.hidden)return;
    const doc=new DOMParser().parseFromString(source,"text/html");
    doc.querySelectorAll("script,link,style").forEach(node=>node.remove());
    const surface=document.createElement("div");surface.className="tool-surface tool-"+tool;surface.innerHTML=doc.body.innerHTML;normalizeButtons(surface);
    if(tool==="e2e"){const overline=surface.querySelector(".overline"),title=surface.querySelector(".hero h1");if(overline)overline.textContent="선택 네트워크 · 사용자 승인 전용";if(title)title.textContent="검사 Evidence 온체인 제출";}
    host.replaceChildren(surface);normalizeToolMessages(surface);
    const scriptResponse=await fetch(TOOL_SCRIPTS[tool],{cache:"no-store"});if(!scriptResponse.ok)throw Error("업무 로직 HTTP "+scriptResponse.status);
    const script=await scriptResponse.text();
    if(state.activeTool!==tool||host.dataset.tool!==tool||host.hidden)return;
    Function(script+"\n//# sourceURL="+TOOL_SCRIPTS[tool])();
  }catch(error){host.innerHTML='<div class="platform-alert danger">업무 화면을 열지 못했습니다: '+esc(error.message||error)+'</div>';toast("업무 화면 로드 실패",true);}
}

function showRoles(){
  hideToolHosts();const roles=$("roles-native");roles.hidden=false;document.querySelectorAll(".task-tabs button").forEach(button=>button.classList.toggle("active",button.dataset.native==="roles"));
  const target=withTrade("/trades");history.pushState({},"",target+location.hash.replace(location.hash,""));
  state.activeView="trades";
}

function setText(id,value){const el=$(id);if(el)el.textContent=value;}
function renderNetwork(){const p=state.ping;if(!p)return;const local=Number(p.chainId)!==11155111,label=local?"LOCAL ANVIL · "+p.chainId:"SEPOLIA · "+p.chainId;setText("side-network",label);setText("side-contract",p.contract);setText("network-badge",label+(local?" · TEST ONLY":" · TESTNET"));$("network-badge").className="network-badge "+(local?"local":"sepolia");$("side-env-dot").classList.add("ok");}
function injectedProvider(){if(!window.ethereum)return null;return Array.isArray(window.ethereum.providers)?window.ethereum.providers.find(item=>item?.isMetaMask)||window.ethereum:window.ethereum;}
const sameAddress=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
function roleRequirement(){
  const roles=state.detail?.roles||{},registry=state.registry||{},tradeState=Number(state.detail?.state);
  const stationByState=tradeState<=7?"supplierStation":tradeState<=11?"buyerStation":tradeState===12?"primaryInspectorStation":tradeState===13?"backupInspectorStation":tradeState===20?"externalArbitratorStation":null;
  if(state.role==="buyer")return{actor:roles.buyer,station:roles.buyerStation,label:"Buyer Actor / Buyer Station"};
  if(state.role==="supplier")return{actor:roles.supplier,station:roles.supplierStation,label:"Supplier Actor / Supplier Station"};
  if(state.role==="station"){const keys=stationByState?[stationByState]:["supplierStation","buyerStation","primaryInspectorStation","backupInspectorStation","externalArbitratorStation"];return{addresses:keys.map(key=>roles[key]).filter(Boolean),station:roles[stationByState],label:stationByState||"거래에 고정된 Station 중 해당 업무 주소"};}
  if(state.role==="primaryInspector")return{actor:roles.primaryInspector,station:roles.primaryInspectorStation,label:"Primary Inspector Actor / Station"};
  if(state.role==="backupInspector")return{actor:roles.backupInspector,station:roles.backupInspectorStation,label:"Backup Inspector Actor / Station"};
  if(state.role==="externalArbitrator")return{actor:roles.externalArbitrator,station:roles.externalArbitratorStation,label:"External Arbitrator Actor / Station"};
  return{actor:registry.authority,label:"Credential Registry Authority"};
}
function roleGate(){
  const req=roleRequirement(),wallet=state.wallet,chainOk=state.walletChainId==null||Number(state.walletChainId)===Number(state.ping?.chainId),expired=state.preflight?.deadlineExpiredByWallClock===true,tradeState=Number(state.detail?.state),stateName=state.detail?.stateName||"UNKNOWN";
  const expected=[req.actor,req.station,...(req.addresses||[])].filter(Boolean),walletMatch=!!wallet&&expected.some(value=>sameAddress(value,wallet));
  let available="조회 전용",reason="현재 상태와 권한을 확인하세요.",active=false;
  if(state.role!=="operator"&&[17,18,19].includes(tradeState)){available="완료된 거래 기록 조회";reason="종료된 거래입니다. 추가 검사·재제출·정산 실행은 차단되고 기존 증거와 receipt만 조회합니다.";}
  else if(!wallet)reason="MetaMask 계정을 연결하면 기대 지갑과 비교합니다.";
  else if(!chainOk)reason=`잘못된 체인입니다. MetaMask를 Chain ID ${state.ping?.chainId}로 전환하세요.`;
  else if(state.role==="operator"){active=walletMatch;available=active?"Registry 관리 사전검증":"운영 현황·감사 조회";reason=active?"Authority 일치 · 관리 TX는 MetaMask 승인 필요":"Authority 불일치 · 자격 변경은 차단되고 조회만 가능합니다.";}
  else if(expired){available="기존 기록 조회";reason="업무 기한이 지나 새 서명·제출이 차단됐습니다. 기존 서명을 재사용하지 마세요.";}
  else if(!walletMatch){reason="현재 계정이 이 역할의 Actor 또는 Station 주소와 일치하지 않습니다.";}
  else if(state.role==="primaryInspector"){active=tradeState===12;available=active?"Replay·별도 Decision":"분쟁 상태 대기";reason=active?"DISPUTED_PRIMARY · Primary Actor/Station 확인":"DISPUTED_PRIMARY에서만 1차 검증 업무가 활성화됩니다.";}
  else if(state.role==="backupInspector"){active=tradeState===13;available=active?"Backup Replay·Decision":"Backup 전환 대기";reason=active?"DISPUTED_BACKUP · Backup Actor/Station 확인":tradeState===12?"Primary timeout 후 activateBackupInspector가 온체인 실행되어야 합니다.":"DISPUTED_BACKUP에서만 대체 검증 업무가 활성화됩니다.";}
  else if(state.role==="externalArbitrator"){active=tradeState===20;available=active?"외부 중재 판단":"중재 개시 대기";reason=active?"ARBITRATION_PENDING · External Actor/Station 확인":"HOLD/ESCALATED 경로의 deadline 이후 온체인 중재가 개시되어야 합니다.";}
  else if(state.role==="station"){active=walletMatch;available="Evidence·EIP-712 서명";reason=`${req.label} · Actor TX와 Station 서명 권한은 서로 분리됩니다.`;}
  else{active=walletMatch;available=state.role==="buyer"?"예치·검사·수락":"거래 생성·출하 검사·수령";reason=`${ROLE_LABELS[state.role]} 기대 지갑과 일치합니다. 실제 실행은 ${stateName} 상태를 다시 검증합니다.`;}
  return{req,walletMatch,chainOk,active,available,reason};
}
function renderRoleDashboard(){
  const config=ROLE_TASKS[state.role]||ROLE_TASKS.buyer,gate=roleGate(),req=gate.req,d=state.detail,p=state.preflight,terminal=[17,18,19].includes(Number(d?.state));
  setText("role-current-label",ROLE_LABELS[state.role]);setText("role-wallet-address",state.wallet?short(state.wallet,12,10):"연결되지 않음");if($("role-wallet-address"))$("role-wallet-address").title=state.wallet||"";
  const required=req.addresses?.length?req.addresses.map(value=>short(value)).join(" · "):[req.actor,req.station].filter(Boolean).map(value=>short(value)).join(" / ")||req.label;setText("role-required-wallet",required);if($("role-required-wallet"))$("role-required-wallet").title=[req.actor,req.station,...(req.addresses||[])].filter(Boolean).join(" / ");
  setText("role-trade-state",d?.stateName||"거래 미선택");setText("role-available-action",gate.available);setText("role-block-reason",gate.reason);setText("role-mission-title",terminal?"완료된 거래 상세 보기":config.mission);setText("role-mission-description",terminal?"신규 실행 대신 정산·출금 receipt와 Evidence·감사 기록을 읽기 전용으로 확인합니다.":config.description);
  const tasks=terminal?[["완료 거래 상세","/trades"],["정산·출금 기록","/resolution"],["증거·감사 기록","/audit"]]:config.tasks;$("role-task-list").innerHTML=tasks.map(([label,path],index)=>`<a href="${esc(withTrade(path))}" class="${index===0?"primary":""} ${!terminal&&!gate.active&&index>0?"disabled":""}">${esc(label)}</a>`).join("");
  const tech=[["Actor",req.actor],["Station",req.station||req.addresses?.join(" / ")],["Registry",state.registry?.registry],["Registry Authority",state.registry?.authority],["Action deadline",p?.deadline||d?.actionDeadline],["실효 잔여시간",p?.effectiveRemainingSeconds!=null?p.effectiveRemainingSeconds+"초":null],["정책 해시",d?.terms?.policyHash],["Chain ID",state.ping?.chainId]];
  $("role-technical-list").innerHTML=tech.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd><code title="${esc(value)}">${esc(short(value,16,12)||"—")}</code></dd></div>`).join("");
  $("operator-dashboard").hidden=state.role!=="operator";if(state.role==="operator")renderRegistry();
}
function statusClass(name){return String(name||"unknown").toLowerCase();}
function renderRegistry(){
  const data=state.registry;if(!data){setText("operator-access-badge","Registry 조회 중");return;}const authorized=data.isAuthority&&Number(state.walletChainId)===Number(data.chainId);
  const badge=$("operator-access-badge");badge.textContent=authorized?"Authority 확인 · 관리 가능":"조회 전용 · Authority 필요";badge.className="access-badge "+(authorized?"authority":"readonly");
  setText("registry-address",short(data.registry,14,10));$("registry-address").title=data.registry||"";setText("registry-authority",short(data.authority,14,10));$("registry-authority").title=data.authority||"";setText("registry-active-count",data.stations.filter(item=>item.statusName==="ACTIVE").length+" / "+data.stations.length);setText("registry-block","#"+Number(data.blockNumber).toLocaleString());
  $("registry-security-boundary").innerHTML=(data.securityBoundary||[]).map(item=>`<span>✓ ${esc(item)}</span>`).join("");
  $("credential-rows").innerHTML=data.stations.map(item=>`<tr><td><b>${esc(item.stationType)}</b><small>${esc(item.purpose)}</small></td><td><code title="${esc(item.address)}">${esc(short(item.address,12,10))}</code></td><td><span class="credential-status ${statusClass(item.statusName)}">${esc(item.statusName)}</span></td><td>${item.changedAt?new Date(item.changedAt*1000).toLocaleString("ko-KR"):"기록 없음"}</td><td><button type="button" class="credential-manage" data-station="${esc(item.key)}">${authorized?"관리 열기":"상태 보기"}</button></td></tr>`).join("");
  $("registry-history").innerHTML=data.history?.length?data.history.map(item=>`<div class="registry-history-row"><span>Block #${esc(item.blockNumber)}</span><div><b>${esc(item.previousStatusName)} → ${esc(item.newStatusName)}</b><code title="${esc(item.credential)}">${esc(short(item.credential,13,10))} · ${esc(short(item.reasonCode,12,8))}</code></div><small>${new Date(item.changedAt*1000).toLocaleString("ko-KR")}</small></div>`).join(""):`<p>${esc(data.historyNotice||"변경 이력이 없습니다.")}</p>`;
}
async function loadRegistry(){
  const id=activeTrade();if(!validTrade(id))return;try{const account=state.wallet?"&account="+encodeURIComponent(state.wallet):"";state.registry=await json("/api/registry/overview?tradeId="+encodeURIComponent(id)+account);renderRoleDashboard();}catch(error){state.registry=null;if(state.role==="operator")toast(friendlyError(error),true);renderRoleDashboard();}
}
async function refreshWallet(prompt=false){
  const provider=injectedProvider();if(!provider){state.wallet=null;state.walletChainId=null;await loadRegistry();renderRoleDashboard();if(prompt)throw Error("MetaMask를 찾을 수 없습니다.");return;}
  const accounts=await provider.request({method:prompt?"eth_requestAccounts":"eth_accounts"});const chainHex=await provider.request({method:"eth_chainId"});state.wallet=accounts?.[0]||null;state.walletChainId=Number.parseInt(chainHex,16);const button=$("wallet-check");button.classList.toggle("connected",!!state.wallet);button.querySelector("b").textContent=state.wallet?short(state.wallet):"지갑 역할 확인";await loadRegistry();renderRoleDashboard();
}
function selectStation(key){
  const item=state.registry?.stations?.find(station=>station.key===key);if(!item)return;state.selectedStation=item;state.registrySimulation=null;const authorized=state.registry.isAuthority&&Number(state.walletChainId)===Number(state.registry.chainId),form=$("registry-action-form");form.hidden=false;setText("registry-selected-type",item.stationType+" · "+item.statusName);setText("registry-selected-address",item.address);$("registry-selected-address").title=item.address;
  const actions=(state.registry.supportedAdminActions||[]).filter(action=>item.allowedActions.includes(action.action));$("registry-action-select").innerHTML=actions.map(action=>`<option value="${esc(action.action)}">${esc(action.label)}</option>`).join("")||'<option value="">현재 상태에서 허용된 변경 없음</option>';
  $("registry-action-select").disabled=!authorized||!actions.length;$("registry-reason").disabled=!authorized;$("registry-ack").disabled=!authorized;$("registry-simulate").disabled=!authorized||!actions.length;$("registry-submit").disabled=true;$("registry-action-output").className="registry-output";$("registry-action-output").textContent=authorized?"변경 사유를 입력하고 읽기 전용 시뮬레이션을 먼저 실행하세요.":"현재 지갑은 Authority가 아니므로 온체인 조회만 가능합니다.";
}
async function simulateRegistryAction(){
  try{if(!state.selectedStation)throw Error("Station을 선택하세요.");await refreshWallet(false);if(!state.registry?.isAuthority)throw Error("UnauthorizedAuthority");if(Number(state.walletChainId)!==Number(state.registry.chainId))throw Error("WRONG_CHAIN");const action=$("registry-action-select").value,reasonLabel=$("registry-reason").value.trim();const result=await json("/api/registry/simulate-action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,credential:state.selectedStation.address,reasonLabel,from:state.wallet})});state.registrySimulation=result;const output=$("registry-action-output");output.className="registry-output success";output.textContent=`시뮬레이션 통과: ${result.currentStatusName} → ${result.expectedStatusName}. 실제 TX는 아직 전송되지 않았습니다.`;$("registry-submit").disabled=!$("registry-ack").checked;}
  catch(error){state.registrySimulation=null;$("registry-submit").disabled=true;const output=$("registry-action-output");output.className="registry-output danger";output.textContent=friendlyError(error);}
}
async function submitRegistryAction(){
  const output=$("registry-action-output");try{if(!$("registry-ack").checked)throw Error("MetaMask 승인 확인 항목을 선택하세요.");await simulateRegistryAction();const prepared=state.registrySimulation;if(!prepared)throw Error("사전 시뮬레이션이 필요합니다.");await refreshWallet(false);if(!sameAddress(state.wallet,prepared.from)||!state.registry?.isAuthority)throw Error("UnauthorizedAuthority");if(Number(state.walletChainId)!==Number(prepared.chainId))throw Error("WRONG_CHAIN");const provider=injectedProvider();output.className="registry-output";output.textContent="MetaMask에서 Registry 변경 TX를 직접 확인하고 승인하세요.";const hash=await provider.request({method:"eth_sendTransaction",params:[{from:state.wallet,to:prepared.target,data:prepared.calldata}]});output.textContent="TX 제출됨 · receipt 확인 중: "+short(hash,14,10);const browserProvider=new ethers.BrowserProvider(provider);const receipt=await browserProvider.waitForTransaction(hash);if(Number(receipt.status)!==1)throw Error("Registry TX receipt status가 실패입니다.");output.className="registry-output success";output.textContent="Registry 변경 완료 · Block #"+receipt.blockNumber+" · "+short(hash,14,10);state.registrySimulation=null;$("registry-submit").disabled=true;await loadRegistry();}
  catch(error){output.className="registry-output danger";output.textContent=friendlyError(error);}
}
function renderContext(){
  const d=state.detail,p=state.preflight,id=d?.id||activeTrade();
  if(validTrade(id)){saveTrade(id);setText("current-trade",short(id));$("current-trade").title=id;}else setText("current-trade","거래를 선택해 주세요");
  setText("current-state",d?.stateName||"거래 미선택");setText("kpi-state",d?.stateName||"—");setText("kpi-state-note",p?.effectiveRemainingSeconds!=null?"실효 기한 "+Math.max(0,p.effectiveRemainingSeconds)+"초":"온체인 조회");setText("kpi-escrow",d?.escrowEth?d.escrowEth+" ETH":"—");
  const supplier=Number(d?.inspections?.supplier?.outcome||0);setText("kpi-supplier",OUTCOME[supplier]||"—");setText("kpi-supplier-note",supplier?"시도 "+d.inspections.supplier.attempt:"Station 제출 대기");setText("kpi-accounting",d?.accounting?.conserved&&d?.accounting?.balanceCoversLiabilities?"PASS":"확인 필요");
  const expired=p?.deadlineExpiredByWallClock===true,terminal=[17,18,19].includes(Number(d?.state));setText("status-summary",expired?"업무 기한 만료 · 새 fixture 거래 필요":terminal?"완료된 거래 · 정산·출금·감사 기록 확인":d?"현재 "+d.stateName+" · "+(d.nextActions?.[0]?.label||"다음 상태 확인 필요"):"거래 상태를 확인하지 못했습니다.");setText("status-detail",expired?"기존 체인과 증거는 보존하며, 만료된 서명·TX는 안전하게 차단합니다.":d?.source||"체인 연결 확인 필요");document.querySelector(".status-strip")?.classList.toggle("danger",expired);
  const milestones=d?.milestones||[],done=milestones.filter(x=>x.status==="DONE").length;setText("progress-count",done+" / "+milestones.length);$("trade-progress").innerHTML=milestones.length?milestones.map((m,i)=>`<div class="progress-step ${m.status==="DONE"?"done":m.status==="PENDING"&&i===done?"current":""}"><i>${m.status==="DONE"?"✓":String(i+1).padStart(2,"0")}</i><b>${esc(m.label)}</b><small>${m.status==="DONE"?"완료":m.status==="PENDING"?"대기":"확인"}</small></div>`).join(""):'<p>거래 진행 정보를 불러오지 못했습니다.</p>';
  const next=d?.nextActions?.[0],nextRoute=next?.route||"/trades";setText("next-kicker",terminal?"완료된 거래에서 확인할 기록":"지금 해야 할 작업");setText("next-title",expired?"만료 원인 확인 및 새 거래 준비":terminal?"정산·출금 증거 확인":next?.label||"거래 상태 확인");setText("next-description",expired?"Local Anvil 블록 시간과 실제 시간이 벌어져 계약 기한을 넘었습니다. 기존 서명은 재사용할 수 없으며, 새 fixture 실행 시 24시간 업무 기한이 적용됩니다.":terminal?"종료된 거래에는 신규 검사·재제출·정산 작업을 제안하지 않습니다. 성공 receipt와 감사 기록을 확인하세요.":next?"현재 상태에서 계약이 허용하는 다음 업무입니다. 실행 직전 권한·기한·해시를 다시 검증합니다.":"거래를 선택하면 다음 업무가 표시됩니다.");
  const wallet=terminal?d?.withdrawal?.recipient:nextRoute.includes("e2e")?d?.roles?.supplier:nextRoute.includes("resolution")?d?.roles?.primaryInspector:d?.roles?.buyer;setText("next-wallet",wallet?short(wallet):terminal?"실행 불필요":"역할 지갑 확인");if($("next-wallet"))$("next-wallet").title=wallet||"";setText("next-effect",terminal?"읽기 전용 기록 확인":next?.mode==="REQUIRES_EXPLICIT_USER_APPROVAL"?"MetaMask 명시적 승인":"읽기 전용 조회");setText("next-action-label",terminal?"완료 거래 기록 보기":"업무 화면 열기");$("next-action").dataset.path=nextRoute;
  setText("policy-status",d?.policy?.immutableHash?.verified?"해시 일치":"원문 확인 필요");setText("policy-hash",short(d?.terms?.policyHash));if($("policy-hash"))$("policy-hash").title=d?.terms?.policyHash||"";setText("contract-address",short(d?.contract));if($("contract-address"))$("contract-address").title=d?.contract||"";setText("replay-status",Number(d?.replay?.status)?"기록됨 · "+d.replay.status:terminal?"정상 거래 · 불필요":"아직 기록 없음");setText("block-number",d?.blockNumber?"#"+Number(d.blockNumber).toLocaleString():"—");
  const events=(d?.transactions||[]).slice(-4).reverse();$("recent-events").innerHTML=events.length?events.map((x,i)=>eventRow(x,events.length-i)).join(""):'<p>기록된 이벤트가 없습니다.</p>';
  renderAudit();renderClockWarning();renderRoleDashboard();renderSettlementSummary();
}
function eventRow(x,index){const hash=x.transactionHash||x.hash||"",block=x.blockNumber!=null?Number(x.blockNumber).toLocaleString():x.verificationStatus==="UNAVAILABLE"?"조회 불가":"—",proof=x.verificationStatus==="VERIFIED"?`저장 기록 → 성공 Receipt → ${(x.parsedEvents||[]).join(", ")}`:x.verificationStatus?`저장 기록 · ${x.verificationLabel||"검증 불가"}`:x.event||x.source||"";return `<div class="event-row"><span>${String(index).padStart(2,"0")}</span><div><b>${esc(x.label||x.event||"거래 이벤트")}</b><small>Block #${esc(block)} · ${esc(proof)}</small></div><code title="${esc(hash)}">${esc(short(hash))}</code></div>`;}
function renderClockWarning(){const p=state.preflight,el=$("inspection-clock-warning");if(!el)return;if(p?.deadlineExpiredByWallClock){el.hidden=false;el.textContent=`제출 차단: Local Anvil 블록 시간이 ${Math.max(0,p.clockDriftSeconds)}초 멈춰 있어 실제 다음 블록 기준 업무 기한이 이미 만료됐습니다. 기존 서명은 사용하지 말고 새 fixture 거래에서 Evidence를 다시 준비하세요. 기존 체인은 자동 초기화하지 않습니다.`;}else if(p?.chainClockStale){el.hidden=false;el.textContent=`Local Anvil 블록 시간이 ${p.clockDriftSeconds}초 지연되어 있습니다. 서명 메시지는 실제 다음 블록 시간을 기준으로 준비하며, 제출 직전 pending 상태로 다시 검증합니다.`;}else el.hidden=true;}
function renderAudit(){const d=state.detail;if(!d)return;const values=[["Trade ID",d.id],["정책 해시",d.terms?.policyHash],["Model Bundle",d.terms?.modelBundleHash],["Capture Profile",d.terms?.captureProfileHash],["Score Schema",d.terms?.scoreSchemaId],["계약 주소",d.contract]];$("audit-hashes").innerHTML=values.map(([k,v])=>`<div><dt>${k}</dt><dd><code title="${esc(v)}">${esc(short(v,12,10))}</code></dd></div>`).join("");const items=[["Supplier Evidence",d.inspections?.supplier],["Buyer Evidence",d.inspections?.buyer]],terminal=[17,18,19].includes(Number(d.state));$("audit-evidence").innerHTML=items.map(([label,x])=>`<div class="evidence-item ${Number(x?.outcome)>0?"done":""}"><div><b>${label}</b><small>${esc(short(x?.evidencePackageHash))} · 시도 ${esc(x?.attempt||0)}</small></div><span>${esc(OUTCOME[Number(x?.outcome||0)])}</span></div>`).join("")+`<div class="evidence-item ${Number(d.replay?.status)>0||terminal?"done":""}"><div><b>Inspector Replay</b><small>${Number(d.replay?.status)>0?esc(short(d.replay?.reportHash)):terminal?"정상 합의 정산 경로":"분쟁 발생 시 별도 수행"}</small></div><span>${Number(d.replay?.status)>0?"기록됨":terminal?"불필요":"대기"}</span></div>`;const tx=d.transactions||[];setText("audit-count",tx.length+"건");$("audit-timeline").innerHTML=tx.length?tx.slice().reverse().map((x,i)=>eventRow(x,tx.length-i)).join(""):'<p>감사 이벤트가 없습니다.</p>';state.auditPayload={exportedAt:new Date().toISOString(),network:{chainId:d.chainId,contract:d.contract,source:d.source},trade:d,preflight:state.preflight};}

function wei(value){try{return BigInt(value||0);}catch{return 0n;}}
function eth(value){try{return ethers.formatEther(value||0)+" ETH";}catch{return "—";}}
function renderSettlementSummary(){
  const d=state.detail,c=state.resolutionContext;if(!$("settlement-state"))return;
  const stateName=c?.stateName||d?.stateName||"거래 상태 확인 필요";
  const supplierClaim=wei(c?.claimable?.supplier?.wei),buyerClaim=wei(c?.claimable?.buyer?.wei),totalClaim=supplierClaim+buyerClaim;
  const withdrawal=c?.withdrawal||d?.withdrawal||null,recipientAddress=withdrawal?.recipient||(stateName==="RELEASED"?(c?.roles?.supplier||d?.roles?.supplier):stateName==="REFUNDED"?(c?.roles?.buyer||d?.roles?.buyer):null),recipient=recipientAddress?{label:stateName==="REFUNDED"?"Buyer":"Supplier",address:recipientAddress}:null;
  const withdrawalStatus=withdrawal?.status||(!d?"CHECKING":"PENDING"),withdrawalComplete=withdrawalStatus==="COMPLETED"&&withdrawal?.verified===true;
  const settled=Boolean(c?.settled||d?.settled||["RELEASED","REFUNDED","SETTLED"].some(token=>stateName.includes(token)));
  setText("settlement-state",settled?"정산 결정 완료":stateName);setText("settlement-state-note",settled?"claimable과 출금 여부를 별도로 확인합니다.":"현재 계약 상태 기준");
  setText("settlement-recipient",recipient?.label||"미결정");setText("settlement-recipient-note",recipient?short(recipient.address):"계약 결정 이후 표시");
  setText("settlement-claimable",c?eth(totalClaim):"조회 대기");setText("settlement-withdrawn",withdrawalComplete?"출금 완료":withdrawalStatus==="UNVERIFIABLE"?"검증 불가":withdrawalStatus==="CHECKING"?"확인 중":"출금 대기");setText("settlement-withdrawn-note",withdrawalComplete?`성공 Receipt · Block #${Number(withdrawal.blockNumber).toLocaleString()}`:withdrawalStatus==="UNVERIFIABLE"?"Receipt 또는 거래 연결을 검증하지 못했습니다.":withdrawalStatus==="CHECKING"?"현재 거래의 Receipt를 확인하고 있습니다.":"검증된 Withdrawal Receipt가 없습니다.");
  setText("settlement-wallet",state.wallet?short(state.wallet):"연결되지 않음");if($("settlement-wallet"))$("settlement-wallet").title=state.wallet||"";
  setText("settlement-required-wallet",recipient?short(recipient.address):"정산 결과 확인 후 표시");if($("settlement-required-wallet"))$("settlement-required-wallet").title=recipient?.address||"";
  setText("settlement-action-claimable",c?eth(totalClaim):"조회 대기");
  setText("settlement-action-message",!c?"정산 모듈의 최신 온체인 readback을 기다리고 있습니다.":withdrawalComplete?"현재 거래의 수령자·계약·체인과 성공 Receipt를 확인했습니다. 추가 Withdraw 작업은 없습니다.":withdrawalStatus==="UNVERIFIABLE"?"Receipt를 검증하지 못해 출금 완료로 표시하지 않습니다.":!recipient?"현재 선택 거래의 수령자를 확인할 수 없습니다.":totalClaim===0n?"claimable 잔액은 0이지만 검증된 Withdraw Receipt가 없어 완료로 간주하지 않습니다.":state.wallet&&!sameAddress(state.wallet,recipient.address)?"현재 지갑은 수령자 계정이 아니므로 Withdraw가 차단됩니다.":"수령자 지갑과 잔액을 확인한 뒤 MetaMask에서 직접 승인하세요.");
  setText("settlement-open-actions",withdrawalComplete?"검증된 Receipt 기록 보기":"허용된 출금 작업 확인");
  const completed={decision:settled,claimable:totalClaim>0n||withdrawalComplete,withdraw:withdrawalComplete,receipt:withdrawalComplete};
  document.querySelectorAll("[data-settlement-step]").forEach((item,index)=>{const done=completed[item.dataset.settlementStep];item.classList.toggle("done",done);item.classList.toggle("current",!done&&Object.values(completed).slice(0,index).every(Boolean));});
}

async function loadContext(showToast=false){
  const alert=$("platform-alert");alert.hidden=true;
  try{state.ping=await json("/api/ping");TradeContext.configure(state.ping);renderNetwork();let id=activeTrade(),detail=null,contextNotice="";
    if(validTrade(id)){try{detail=await json("/api/trades/"+encodeURIComponent(id));if(!TradeContext.matches(detail))throw Error("NETWORK_CONTEXT_MISMATCH");}catch(error){TradeContext.clear();contextNotice="이전에 선택한 거래는 선택한 네트워크에 존재하지 않는 거래입니다. 현재 네트워크에서 검증된 거래로 전환했습니다.";id="";}}
    if(!detail){const list=await json("/api/trades");if(!TradeContext.matches(list))throw Error("NETWORK_CONTEXT_MISMATCH");const selected=list.items?.find(item=>item.settled)||list.items?.[0];id=selected?.id||"";if(!validTrade(id))throw Error("현재 네트워크에서 검증된 거래가 없습니다.");detail=await json("/api/trades/"+encodeURIComponent(id));if(!TradeContext.matches(detail))throw Error("NETWORK_CONTEXT_MISMATCH");}
    saveTrade(id);const currentUrl=new URL(location.href);if(currentUrl.searchParams.get("tradeId")!==id){currentUrl.searchParams.set("tradeId",id);history.replaceState(null,"",currentUrl.pathname+currentUrl.search+currentUrl.hash);}const preflight=await json("/api/e2e/preflight?tradeId="+encodeURIComponent(id)).catch(()=>null);state.detail=detail;state.preflight=preflight;renderContext();const currentRoute=route(),routeIsMounted=state.activeView===currentRoute.view&&(!currentRoute.tool||state.activeTool===currentRoute.tool);if(!routeIsMounted)renderRoute();await refreshWallet(false);
    if(contextNotice){alert.innerHTML=`<strong>${esc(contextNotice)}</strong><span>Chain ID ${esc(detail.chainId)} · Contract ${esc(short(detail.contract,14,10))} · 실행 요청이나 트랜잭션은 발생하지 않았습니다.</span>`;alert.className="platform-alert warning error-message";alert.hidden=false;}if(showToast)toast("거래·지갑·Registry 상태를 갱신했습니다.");}
  catch(error){const message=error.message||String(error),technical=error.technicalDetail||String(error);alert.innerHTML=`<strong>${esc(message)}</strong><span>읽기 전용 사전 조회에서 중단됐으며 트랜잭션은 전송되지 않았습니다.</span><details><summary>기술 상세 보기</summary><code>HTTP ${esc(error.httpStatus||"—")} · ${esc(technical)}</code></details>`;alert.className="platform-alert danger error-message";alert.hidden=false;if(showToast)toast("상태 갱신 실패",true);}
}
async function checkWallet(){
  try{await refreshWallet(true);const gate=roleGate();toast(gate.walletMatch||state.role==="operator"&&state.registry?.isAuthority?ROLE_LABELS[state.role]+" 권한 주소와 일치합니다.":gate.reason,!gate.walletMatch&&!(state.role==="operator"&&state.registry?.isAuthority));}
  catch(error){toast(friendlyError(error),true);}
}
function exportAudit(){if(!state.auditPayload){toast("저장할 감사 데이터가 없습니다.",true);return;}const blob=new Blob([JSON.stringify(state.auditPayload,null,2)+"\n"],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="InspectEscrow_Audit_"+(state.detail?.id||"trade").slice(2,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("감사 JSON을 저장했습니다.");}

document.addEventListener("click",event=>{
  const routeLink=event.target.closest("a[data-route]");if(routeLink){event.preventDefault();navigate(CATEGORY_PATH[routeLink.dataset.route]);return;}
  const sameLink=event.target.closest("a[href]");if(sameLink&&!sameLink.target){const url=new URL(sameLink.href,location.href);if(url.origin===location.origin&&ROUTES[url.pathname]){event.preventDefault();navigate(url.pathname+url.search+url.hash);return;}}
  const go=event.target.closest("[data-go]");if(go){const path=go.dataset.path||CATEGORY_PATH[go.dataset.go];if(path)navigate(path);return;}
  const tool=event.target.closest(".task-tabs [data-tool]");if(tool){navigate(TOOL_PATH[tool.dataset.tool]);return;}
  const native=event.target.closest("[data-native]");if(native?.dataset.native==="roles")showRoles();
});
window.addEventListener("popstate",()=>renderRoute({scrollToTop:true}));
$("trade-context-button").addEventListener("click",()=>navigate("/trades"));
$("global-refresh").addEventListener("click",()=>loadContext(true));
$("wallet-check").addEventListener("click",checkWallet);
$("role-wallet-connect").addEventListener("click",checkWallet);
if(!ROLE_LABELS[state.role])state.role="buyer";$("role-preview").value=state.role;$("role-preview").addEventListener("change",event=>{state.role=event.target.value;localStorage.setItem(ROLE_KEY,state.role);renderRoleDashboard();toast(ROLE_LABELS[state.role]+" 업무 미리보기로 변경했습니다. 실제 권한은 지갑과 계약이 검증합니다.");});
$("next-action").addEventListener("click",event=>navigate(event.currentTarget.dataset.path||"/trades"));
$("export-audit").addEventListener("click",exportAudit);
$("settlement-refresh").addEventListener("click",()=>loadContext(true));
$("settlement-open-actions").addEventListener("click",()=>$("tool-host-settlement").scrollIntoView({behavior:"smooth",block:"start"}));
window.addEventListener("inspectescrow:resolution-context",event=>{state.resolutionContext=event.detail;if(validTrade(event.detail?.tradeId)&&TradeContext.matches(event.detail)){state.detail={...state.detail,...event.detail,id:event.detail.tradeId};renderContext();}renderSettlementSummary();});
document.querySelectorAll("[data-operator-tab]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("[data-operator-tab]").forEach(item=>item.classList.toggle("active",item===button));document.querySelectorAll("[data-operator-panel]").forEach(panel=>panel.hidden=panel.dataset.operatorPanel!==button.dataset.operatorTab);}));
$("registry-refresh").addEventListener("click",async()=>{await loadRegistry();toast("Registry 온체인 상태를 갱신했습니다.");});
$("credential-rows").addEventListener("click",event=>{const button=event.target.closest("[data-station]");if(button)selectStation(button.dataset.station);});
$("registry-simulate").addEventListener("click",simulateRegistryAction);$("registry-submit").addEventListener("click",submitRegistryAction);$("registry-ack").addEventListener("change",event=>{$("registry-submit").disabled=!(event.target.checked&&state.registrySimulation);});$("registry-action-select").addEventListener("change",()=>{state.registrySimulation=null;$("registry-submit").disabled=true;});$("registry-reason").addEventListener("input",()=>{state.registrySimulation=null;$("registry-submit").disabled=true;});
const injected=injectedProvider();if(injected?.on){injected.on("accountsChanged",accounts=>{state.wallet=accounts?.[0]||null;loadRegistry().then(renderRoleDashboard);});injected.on("chainChanged",chain=>{state.walletChainId=Number.parseInt(chain,16);loadRegistry().then(renderRoleDashboard);});}

normalizeButtons(document);renderRoleDashboard();renderSettlementSummary();loadContext().finally(()=>renderRoute());
})();
