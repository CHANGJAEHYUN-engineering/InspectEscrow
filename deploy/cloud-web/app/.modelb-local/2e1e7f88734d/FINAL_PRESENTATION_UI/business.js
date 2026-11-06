"use strict";
// Enterprise role workspace over existing audited InspectEscrow endpoints.
// It does NOT invent login sessions, permit signing by role-selector choice, or dispatch transactions.
(() => {
  const $ = (id) => document.getElementById(id);
  const ROLE = {
    buyer: {title:"구매·발주사 대시보드",label:"BUYER · PROCUREMENT & QUALITY",desc:"거래 정책과 예치금을 확인하고 입고 검사를 진행합니다. 불일치가 발생하면 독립 검수 경로로 넘깁니다.", fields:["buyer"]},
    supplier: {title:"공급·납품사 대시보드",label:"SUPPLIER · MANUFACTURING DELIVERY",desc:"거래 조건을 수락하고 출하 전 검사·납품 증거를 제출합니다. 검증 후 정산 내역을 확인합니다.", fields:["supplier"]},
    station: {title:"현장 검사 담당자 업무",label:"FIELD STATION · ORIGINAL EVIDENCE",desc:"공급사·구매사 검사 스테이션에서 제품 3면 원본을 확보하고, 실제 모델 추론·증거 서명을 준비합니다.",fields:["supplierStation","buyerStation"]},
    inspector: {title:"독립 품질 Inspector 업무",label:"INDEPENDENT INSPECTOR · DISPUTE",desc:"양측 검사 결과가 충돌할 때 원본과 독립 AI Replay를 검증하고, 정산 결정은 별도로 승인합니다.", fields:["primaryInspector","backupInspector","primaryInspectorStation","backupInspectorStation"]},
    arbitrator: {title:"외부 중재 담당자 업무",label:"EXTERNAL ARBITRATOR · ESCALATION",desc:"약정 기한과 계약 상태가 허용하는 사건을 검토합니다. 일반 분쟁이나 정상 거래를 임의로 정산할 권한은 없습니다.",fields:["externalArbitrator","externalArbitratorStation"]},
    broker: {title:"중개 플랫폼·운영자 현황",label:"MARKETPLACE OPERATOR · AUDIT VIEW",desc:"외주 발주·납품의 진행률, 검사 증빙, 온체인 기록을 열람합니다. 중개자는 스마트컨트랙트의 임의 정산 권한자가 아닙니다.",fields:[]}
  };
  const S = {role:"buyer", trades:[],detail:null,resolution:null,actor:null,account:null,frame:"",busy:false,lastTrade:"",network:null};
  const isId=x=>/^0x[a-fA-F0-9]{64}$/.test(String(x||""));
  const short=(v,a=10,b=7)=>{const s=String(v||"—");return s.length>a+b+2?s.slice(0,a)+"…"+s.slice(-b):s;};
  const error=e=>String(e?.message||e||"알 수 없는 오류").slice(0,200);
  const set=(id,value)=>{const e=$(id);if(e)e.textContent=String(value??"—");};
  const append=(parent,type,cl,text)=>{const n=document.createElement(type);if(cl)n.className=cl;if(text!==undefined)n.textContent=String(text);parent.append(n);return n;};
  const clear=(id)=>{const el=$(id);el.replaceChildren();return el;};
  const tip=(message,bad=false)=>{set("biz-notice",message);$("biz-notice").classList.toggle("error",bad);};
  const activeUrl=(url)=>{if(!url.startsWith("/"))throw Error("LOCAL_PATH_REQUIRED");return url;};
  async function get(url){const r=await fetch(url,{cache:"no-store",headers:{"Accept":"application/json"},signal:AbortSignal.timeout(35000)});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.detail||j.error||"HTTP_"+r.status);return j;}
  function roleAccess(){
    if(S.role==="broker")return "중개·운영 조회 화면 · 온체인 정산 권한 없음";
    if(!S.account)return "지갑 미연결 · 역할 조회 모드";
    const roles=S.detail?.roles||{};
    const own=ROLE[S.role].fields.filter(k=>String(roles[k]||"").toLowerCase()===S.account.toLowerCase());
    if(!own.length)return "연결 지갑이 이 거래의 선택 역할로 등록되지 않음";
    return "거래 등록 지갑 일치: "+own.join(" / ")+" · 실행 시 별도 서명 필요";
  }
  function assignRole(role){
    if(!ROLE[role])return;
    S.role=role;
    document.querySelectorAll("[data-biz-role]").forEach(b=>{b.classList.toggle("active",b.dataset.bizRole===role);b.setAttribute("aria-pressed",String(b.dataset.bizRole===role));});
    set("biz-role-title",ROLE[role].title);set("biz-role-label",ROLE[role].label);set("biz-role-explainer",ROLE[role].desc);
    set("biz-role-access",roleAccess());
    set("product-role",ROLE[role].title+(S.account?" · 지갑 확인 중":" · 미인증 미리보기"));
    renderTasks();
    if(S.detail)refreshReadiness();
  }
  function indexOfMilestone(d,id){return (d.milestones||[]).findIndex(x=>x.id===id);}
  function renderProgress(){
    const d=S.detail,root=clear("biz-progress");
    if(!d){append(root,"p","","온체인 기록을 선택하세요.");return;}
    const rows=Array.isArray(d.milestones)?d.milestones:[];
    rows.forEach((m,i)=>{
      const cell=append(root,"div","biz-step"+(m.status==="DONE"?" done":""));
      append(cell,"i","",m.status==="DONE"?"✓":String(i+1));
      append(cell,"span","",m.label);
    });
    if(!rows.length)append(root,"p","","진행 상태 데이터 없음");
  }
  const task=(title,note,action,mode="secondary",cta="업무 화면 열기")=>({title,note,action,mode,cta});
  function tasksFor(d,role){
    const s=Number(d.state), arr=[];
    if(role==="buyer"){
      if(s===1)arr.push(task("공급·구매사 거래 정책 수락","Buyer 지갑으로 고정 정책을 검토하고 수락합니다.","roles","main"));
      if(s===3)arr.push(task("거래 대금 예치","Buyer 지갑으로 약정 금액을 예치합니다. 가스와 예치 금액은 별도입니다.","roles","main"));
      if(s===8||s===9)arr.push(task("입고 품질검사·증거 제출","Buyer Station의 3뷰 서명 후 Buyer Actor가 검사를 제출합니다.","e2e","main"));
      if(s===11)arr.push(task("검수 수락 및 대금 정산","정책과 Buyer PASS 확인 후 Buyer Actor가 지급을 승인합니다.","resolution","main"));
      if([12,13,14,15,16,20].includes(s))arr.push(task("진행 중인 분쟁 검토","독립 Inspector의 Replay·정산 절차를 모니터링합니다.","resolution","main"));
      if(s===18||s===17)arr.push(task("정산 및 출금가능 잔액 확인","환급이나 지급이 기록됐어도 수령자가 Withdraw 해야 합니다.","resolution","main"));
      arr.push(task("거래 조건 및 정책 원문 검토","예치 전 정책·역할·임계값·기한을 확인합니다.","trades"));
    }else if(role==="supplier"){
      if(s===1)arr.push(task("공급사 정책 수락","계약의 고정 조건을 검토하고 Supplier 지갑으로 수락합니다.","roles","main"));
      if(s===4)arr.push(task("거래 활성화","예치 및 역할 배정 완료 후 Supplier가 계약을 활성화합니다.","roles","main"));
      if([5,6,7].includes(s))arr.push(task("출하 전 AI 검사·증거 제출","Supplier Station 서명과 Supplier Actor 제출을 구분합니다.","e2e","main"));
      if([17,18].includes(s))arr.push(task("정산 수령권 및 Withdraw","정산 결과에 따른 실제 출금 가능 잔액을 확인합니다.","resolution","main"));
      arr.push(task("현장 실물 검사·3면 증거 확보","실제 현장 시편의 TOP/FRONT/SIDE 촬영 후 Model B 추론과 증거를 준비합니다.","field-capture"));
      arr.push(task("거래 정책 및 진행 내역","Buyer 예치·검사·분쟁 상태를 확인합니다.","trades"));
    }else if(role==="station"){
      if([5,6,7,8,9].includes(s))arr.push(task("현장 검사 자료 준비","실물 사진 TOP·FRONT·SIDE를 확보해 Evidence 및 서명 증거를 준비합니다.","field-capture","main"));
      arr.push(task("3면 원본·Evidence Bundle 생성","TOP은 AI 입력, FRONT·SIDE는 원본 무결성 증거입니다.","evidence-console"));
      arr.push(task("Station 서명 및 검사 제출","실제 Station과 Actor의 서로 다른 자격을 확인합니다.","e2e"));
    }else if(role==="inspector"){
      if(s===12||s===13){arr.push(task("실제 독립 AI Replay","양측 Evidence 원본을 검증하고 모델을 재실행합니다.","replay","main"));arr.push(task("검증 결과 기록 및 별도 정산 판단","Replay 일치 시에도 Inspector의 명시적 Decision이 필요합니다.","resolution","main"));}
      if([14,15,16].includes(s))arr.push(task("HOLD·에스컬레이션 상태 확인","불일치 Replay의 EXECUTION_HOLD는 자동 환급이 아닙니다.","resolution","main"));
      arr.push(task("Inspector 역할·기한 확인","Primary와 Backup의 전환은 고정된 계약 deadline에 따릅니다.","resolution"));
      arr.push(task("Evidence 원본 검증","양측 Station 서명·Trade ID·Hash 바인딩을 확인합니다.","evidence-console"));
    }else if(role==="arbitrator"){
      if(s===20)arr.push(task("중재 판정 검토","계약이 ARBITRATION_PENDING 상태일 때 지정된 Arbitrator만 판단합니다.","resolution","main"));
      arr.push(task("중재 개시 요건·기한 확인","Escalation 및 계약 상태를 실시간으로 조회합니다.","resolution"));
    }else if(role==="broker"){
      arr.push(task("납품 거래 및 계약 감사 이력","중개 운영자는 임의로 대금을 귀속시키지 않습니다.","trades","main","조회 열기"));
      arr.push(task("원본 검사·분쟁 검증 상태 확인","Inspector와 검사 Station의 증거 및 Replay를 확인합니다.","replay","secondary","조회 화면 열기"));
    }
    if(!arr.length)arr.push(task("계약 상태 확인","현재 상태에서는 이 역할의 신규 실행 업무가 열리지 않았습니다.","trades","main","거래 조회"));
    return arr;
  }
  function renderTasks(){
    const root=clear("biz-tasks"),d=S.detail;
    if(!d){append(root,"p","","거래 조회 후 담당 업무가 표시됩니다.");set("biz-assigned","조회 대기");return;}
    const items=tasksFor(d,S.role);
    items.forEach(x=>{
      const div=append(root,"div","biz-task"+(x.mode==="secondary"?" secondary":""));
      const body=append(div,"div");append(body,"strong","",x.title);append(body,"small","",x.note);
      const b=append(div,"button","",x.cta);b.type="button";b.addEventListener("click",()=>launch(x.action));
    });
    set("biz-assigned",S.role==="broker"?"감사·조회 전용":items.length+"개 업무 경로");
    set("biz-role-access",roleAccess());
  }
  function renderAudit(){
    const d=S.detail,root=clear("biz-timeline");
    if(!d){append(root,"p","","선택 거래가 없습니다.");set("biz-count","—");return;}
    const txs=Array.isArray(d.transactions)?d.transactions:[];set("biz-count",txs.length+"개 기록 · "+(d.source||"SOURCE_UNKNOWN"));
    if(!txs.length){append(root,"p","","조회된 거래 이벤트가 없습니다. 거래 상태와 로그 조회 범위를 별도로 확인하세요.");return;}
    txs.slice(-16).forEach((x,i)=>{
      const el=append(root,"div","biz-event"),n=append(el,"span","biz-num",String(x.step||i+1).padStart(2,"0"));
      const body=append(el,"div");append(body,"b","",x.label||x.event||"Transaction");append(body,"small","",short(x.transactionHash,9,8)+" · "+(x.source||"VERIFIED_RECEIPT"));
      if(x.url&&/^https:\/\/sepolia\.etherscan\.io\/tx\/0x[a-fA-F0-9]{64}$/.test(x.url)){const a=append(el,"a","","영수증 ↗");a.href=x.url;a.target="_blank";a.rel="noopener noreferrer";}
    });
  }
  function flowState(id,text,kind=""){
    const label=$(id),button=label?.closest("button");if(label)label.textContent=text;
    if(button)button.className=kind;
  }
  function renderExecutionFlow(){
    const d=S.detail,r=S.resolution,state=Number(d?.state),supplierAttempt=Number(d?.inspections?.supplier?.attempt||0),buyerAttempt=Number(d?.inspections?.buyer?.attempt||0),replay=Number(d?.replay?.status||0);
    if(!d){for(const id of ["setup","capture","evidence","submit","replay","resolution"])flowState("biz-flow-"+id,"거래 선택 필요","blocked");return;}
    set("biz-flow-source",d.chainId===11155111?"SEPOLIA · 실제 조회":"LOCAL ANVIL · 테스트 체인");
    flowState("biz-flow-setup",state>=5?"계약 실행 준비 완료":"현재 "+d.stateName,state>=5?"done":"current");
    flowState("biz-flow-capture",supplierAttempt&&buyerAttempt?"양측 검사 기록 존재":supplierAttempt?"Buyer 검사 대기":"원본·AI 검사 필요",supplierAttempt&&buyerAttempt?"done":([5,6,7,8,9].includes(state)?"current":"blocked"));
    flowState("biz-flow-evidence",supplierAttempt&&buyerAttempt?"양측 Evidence hash 기록":supplierAttempt?"Supplier Evidence 기록":"Evidence 준비 필요",supplierAttempt&&buyerAttempt?"done":supplierAttempt?"current":"blocked");
    flowState("biz-flow-submit",supplierAttempt&&buyerAttempt?"Station·Actor 제출 완료":supplierAttempt?"Buyer 제출 대기":"서명·Actor 제출 필요",supplierAttempt&&buyerAttempt?"done":([5,6,7,8,9].includes(state)?"current":"blocked"));
    flowState("biz-flow-replay",replay===1?"CONSISTENT 기록":replay===2?"INCONSISTENT · HOLD":([12,13].includes(state)?"독립 Replay 필요":"분쟁 발생 시 실행"),replay>0?"done":([12,13].includes(state)?"current":"blocked"));
    const claimValues=Object.values(r?.claimable||{}).map(value=>BigInt(value?.wei||0)),claimable=claimValues.reduce((a,b)=>a+b,0n);
    flowState("biz-flow-resolution",d.settled?(claimable>0n?"정산 완료 · Withdraw 필요":"정산·Withdraw 완료"):[14,15,16,20].includes(state)?"HOLD·중재 경로":replay===1?"Inspector Decision 필요":"정산 전",d.settled&&claimable===0n?"done":d.settled||replay===1?"current":"blocked");
    set("biz-flow-truth",d.chainId===11155111?"Sepolia 실제 상태입니다. 각 Station 서명과 Actor TX는 권한자의 MetaMask 승인 전에는 실행되지 않습니다.":"LOCAL ANVIL 테스트 환경입니다. 테스트 계정·TX를 Sepolia 또는 기업 실거래로 표시하지 않습니다.");
  }
  const inspectionStatus=x=>{if(Number(x?.attempt||0)===0)return "미제출";if(Number(x?.outcome)===2)return "PASS";if(Number(x?.outcome)===3)return "REVIEW";return "기록됨 ("+x?.outcome+")";};
  function renderDetail(){
    const d=S.detail;if(!d)return;
    set("biz-state",d.stateName||"UNKNOWN");set("biz-state-sub",`온체인 상태 ${d.state} · ${d.settled?"정산 완료":"진행 중"}`);
    set("biz-escrow",d.escrowEth?`${d.escrowEth} ETH`:"—");
    set("biz-supplier",inspectionStatus(d.inspections?.supplier));set("biz-buyer",inspectionStatus(d.inspections?.buyer));
    set("biz-supplier-sub",`시도 ${d.inspections?.supplier?.attempt??0} · 저장된 계약 검사 결과`);
    set("biz-buyer-sub",`시도 ${d.inspections?.buyer?.attempt??0} · 저장된 계약 검사 결과`);
    const approval=d.policy?.documentApproval;
    const approved=Boolean(approval?.approved);
    set("biz-policy",approved?"정책 문서 승인 기록 확인":"정책 문서 미승인 또는 미확인");
    $("biz-policy").className="biz-statuspill"+(approved?"":" warn");
    set("biz-policy-note",approval?.status?`정책 문서: ${approval.status} · 문서 승인과 온체인 거래 상태는 별도입니다.`:"정책 원문 승인 상태 조회되지 않음");
    set("biz-chain",d.chainId===11155111?"Sepolia · 실제 조회":d.chainId?"Local EVM · "+d.chainId:"확인 실패");
    set("biz-hash",short(d.terms?.policyHash||d.policy?.immutableHash?.onchain,11,10));
    set("biz-replay",["NONE","CONSISTENT","INCONSISTENT"][Number(d.replay?.status)]||"UNKNOWN");
    set("biz-accounting",d.accounting?.conserved===true&&d.accounting?.balanceCoversLiabilities===true?"회계·잔액 불변식 PASS":"실시간 확인 필요");
    set("biz-contract",short(d.contract,12,9));
    tip("현재 거래: "+d.title+" · 상태 "+d.stateName+" · "+d.source+" · 서명·트랜잭션 자동 실행 없음"+(approved?"":" · 정책 승인 상태 추가 확인 필요"));
    set("biz-network",d.chainId===11155111?"SEPOLIA · LIVE READ":"LOCAL CHAIN · "+d.chainId);
    set("product-trade",short(d.id,10,8)+" · "+d.stateName);
    renderProgress();renderExecutionFlow();renderTasks();renderAudit();refreshReadiness();
  }
  function readyMark(id,ok,text){const el=$(id);if(!el)return false;el.textContent=text;el.className=ok?"pass":"blocked";return ok;}
  async function refreshReadiness(){
    const d=S.detail,checks=[];let web=null,model=null;
    try{web=await get("/api/ping");}catch{}
    try{model=await get("/api/modelb/status");}catch{}
    checks.push(readyMark("biz-ready-web",web?.status==="OK",web?.status==="OK"?"ONLINE":"BLOCKED"));
    const modelOk=model?.artifact_commitment?.verified===true,resourceConstrained=!modelOk&&Number(d?.chainId)===31341;
    checks.push(readyMark("biz-ready-ai",modelOk,modelOk?"VERIFIED · READY":resourceConstrained?"NOT_RUN_RESOURCE_CONSTRAINT":"OFFLINE / NOT VERIFIED"));
    const chainOk=Number(d?.chainId)>0&&/^0x[a-fA-F0-9]{40}$/.test(String(d?.contract||""));
    checks.push(readyMark("biz-ready-chain",chainOk,chainOk?(d.chainId===11155111?"SEPOLIA · VERIFIED":"LOCAL EVM · VERIFIED"):"BLOCKED"));
    const tradeOk=Boolean(d&&!d.settled&&Number(d.state)>0);
    checks.push(readyMark("biz-ready-trade",tradeOk,d?(d.stateName+(d.settled?" · 종료됨":" · 진행 가능")):"선택 필요"));
    const policyOk=Boolean(d?.policy?.documentApproval?.approved);
    checks.push(readyMark("biz-ready-policy",policyOk,policyOk?"승인 기록 확인":"미승인 / 미확인"));
    const fields=ROLE[S.role]?.fields||[],walletOk=Boolean(S.account&&d&&fields.some(k=>String(d.roles?.[k]||"").toLowerCase()===S.account.toLowerCase()));
    checks.push(readyMark("biz-ready-wallet",walletOk,walletOk?"등록 역할 일치":S.account?"선택 역할 불일치":"미연결"));
    const ready=checks.every(Boolean);$("biz-live-start").disabled=!ready;
    set("biz-ready-reason",ready?"모든 읽기 전용 준비 조건을 통과했습니다. 실제 서명·TX는 이후 각 단계에서 별도 승인합니다.":resourceConstrained?"AI 재추론은 자원 제약으로 실행하지 않습니다. Local Anvil의 고정 보관 증거 경로만 사용할 수 있으며 Station·Actor 승인은 별도입니다.":"차단: Model B, 진행 중 거래, 정책 승인, 등록 역할 지갑을 모두 확인해야 합니다.");
  }
  function shareTrade(){
    const id=S.detail?.id;if(!isId(id))return;
    localStorage.setItem("inspectescrow.activeTrade.v1",id);
    const current=new URL(location.href);if(current.searchParams.get("tradeId")?.toLowerCase()!==id.toLowerCase()){current.searchParams.set("tradeId",id);history.replaceState(null,"",current.pathname+current.search+current.hash);}
    const ext=$("trade-id");if(ext){ext.value=id;ext.dispatchEvent(new Event("change"));}
  }
  async function loadTrade(id){
    if(!isId(id)){tip("유효한 0x + 64자리 거래 ID가 필요합니다.",true);return;}
    const nonce=Symbol();S.lastTrade=nonce;S.detail=null;S.resolution=null;tip("선택 거래의 실제 계약 상태와 이벤트를 확인 중입니다…");
    try{
      const d=await get("/api/trades/"+encodeURIComponent(id));
      if(S.lastTrade!==nonce)return;
      if(!d||d.id?.toLowerCase()!==id.toLowerCase())throw Error("TRADE_ID_RESPONSE_MISMATCH");
      S.detail=d;try{S.resolution=await get("/api/resolution/context?tradeId="+encodeURIComponent(id));}catch{S.resolution=null;}shareTrade();renderDetail();
      const select=$("biz-trades");if(Array.from(select.options).some(o=>o.value.toLowerCase()===id.toLowerCase()))select.value=id;
      else {const opt=document.createElement("option");opt.value=id;opt.textContent="직접 선택 거래 · "+short(id);select.prepend(opt);select.value=id;}
    }catch(e){if(S.lastTrade!==nonce)return;S.detail=null;tip("거래 조회 실패: "+error(e),true);set("biz-state","조회 실패");renderTasks();renderProgress();renderAudit();}
  }
  async function loadList(){
    tip("실제 온체인 거래 목록을 조회 중입니다…");
    try{
      const list=await get("/api/trades");S.trades=Array.isArray(list.items)?list.items:[];S.network=list.chainId;
      const select=clear("biz-trades");
      for(const t of S.trades){const o=document.createElement("option");o.value=t.id;o.textContent=t.title+" · "+t.stateName;select.append(o);}
      if(!S.trades.length){const o=document.createElement("option");o.textContent="추적 중인 거래 없음";o.value="";select.append(o);}
      let prefer="";try{const s=localStorage.getItem("inspectescrow.activeTrade.v1")||"";prefer=s.startsWith("{")?JSON.parse(s).tradeId:s;}catch{}
      await loadTrade(isId(prefer)?prefer:S.trades[0]?.id);
    }catch(e){tip("거래 목록 조회 실패: "+error(e)+". 직접 Trade ID로 조회할 수 있습니다.",true);set("biz-network","거래 조회 오류");}
  }
  function launch(kind){
    const id=S.detail?.id;
    let path;
    if(kind==="new-trade")path="/new-trade";
    else if(!isId(id)){tip("거래를 먼저 선택하세요.",true);return;}
    else if(kind==="roles")path="/?tradeId="+encodeURIComponent(id)+"#roles";
    else if(kind==="field-capture")path="/live?tradeId="+encodeURIComponent(id);
    else if(kind==="evidence-console")path="/evidence?tradeId="+encodeURIComponent(id);
    else if(["e2e","resolution","trades","replay"].includes(kind))path="/"+kind+"?tradeId="+encodeURIComponent(id);
    else return;
    const url=activeUrl(path);S.frame=url;
    set("biz-workbench-name",{roles:"거래 정책 수락 · 예치 · 활성화","new-trade":"신규 B2B 제조 거래 생성","field-capture":"현장 시편 촬영 · AI 검사 · 3뷰", "evidence-console":"Evidence 원본·Hash 검증",e2e:"현장 Station 서명 · Actor 검사 제출",resolution:"분쟁·정산·Withdraw",trades:"거래 상세·계약 조건",replay:"독립 AI Replay"}[kind]);
    set("biz-workbench-help","기존 검증된 실제 실행 콘솔을 동일 웹사이트에서 표시합니다. 필요한 서명은 해당 콘솔이 요청합니다.");
    $("biz-workbench-blank").hidden=true;
    $("biz-workbench-frame").hidden=false;$("biz-workbench-frame").src=url;
    $("biz-open-external").disabled=false;
    $("biz-workbench").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function connectWallet(){
    if(!window.ethereum?.request){set("biz-wallet-text","MetaMask 없음 · 지갑 조회/서명 불가");return;}
    try{
      const accounts=await window.ethereum.request({method:"eth_requestAccounts"});
      S.account=Array.isArray(accounts)?String(accounts[0]||""):null;
      set("biz-wallet-text",S.account?short(S.account,13,10):"계정 없음");
      set("product-wallet",S.account?short(S.account,8,6):"지갑 미연결");
      set("biz-role-access",roleAccess());
      set("biz-connect","지갑 다시 확인");
      refreshReadiness();
    }catch(e){set("biz-wallet-text","연결 취소·실패: "+error(e));}
  }
  function exportAudit(){
    if(!S.detail){tip("거래 조회 후 저장할 수 있습니다.",true);return;}
    const d=S.detail;
    const record={schema:"inspectescrow.business-portal.readonly-audit/1",generatedAt:new Date().toISOString(),origin:"LIVE_READ_ONLY_ENDPOINT",chainId:d.chainId,tradeId:d.id,tradeState:d.stateName,policy:d.policy,roles:d.roles,inspections:d.inspections,replay:d.replay,accounting:d.accounting,transactions:d.transactions,limitations:["This is an export of observable data, not independent identity verification.","No login, original image vault, or actual signature was added by this portal.","Document approval may differ from onchain lifecycle."]};
    const blob=new Blob([JSON.stringify(record,null,2)+"\n"],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="InspectEscrow-audit-"+d.id.slice(2,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function setup(){
    document.querySelectorAll("[data-biz-role]").forEach(b=>b.addEventListener("click",()=>assignRole(b.dataset.bizRole)));
    $("biz-refresh").addEventListener("click",loadList);
    $("biz-ready-refresh").addEventListener("click",refreshReadiness);
    $("biz-live-start").addEventListener("click",()=>{if(!$("biz-live-start").disabled&&isId(S.detail?.id))location.href="/live?tradeId="+encodeURIComponent(S.detail.id);});
    $("biz-trades").addEventListener("change",e=>{if(isId(e.target.value))loadTrade(e.target.value);});
    $("biz-new-trade").addEventListener("click",()=>launch("new-trade"));
    $("biz-connect").addEventListener("click",connectWallet);
    $("biz-use-custom").addEventListener("click",()=>{$("biz-custom-row").hidden=!$("biz-custom-row").hidden;if(!$("biz-custom-row").hidden)$("biz-custom-id").focus();});
    $("biz-custom-search").addEventListener("click",()=>loadTrade($("biz-custom-id").value.trim()));
    $("biz-copy").addEventListener("click",()=>{if(isId(S.detail?.id))navigator.clipboard?.writeText(S.detail.id).then(()=>tip("Trade ID를 복사했습니다."),()=>tip("복사 권한이 거부됐습니다.",true));});
    $("biz-export").addEventListener("click",exportAudit);
    document.querySelectorAll("[data-biz-flow]").forEach(button=>button.addEventListener("click",()=>launch(button.dataset.bizFlow)));
    $("biz-open-external").addEventListener("click",()=>{if(S.frame)window.open(S.frame,"_blank","noopener");});
    $("biz-close-workbench").addEventListener("click",()=>{S.frame="";$("biz-workbench-frame").src="about:blank";$("biz-workbench-frame").hidden=true;$("biz-workbench-blank").hidden=false;$("biz-open-external").disabled=true;});
    $("biz-present").addEventListener("click",()=>{const id=S.detail?.id;location.href="/presentation"+(isId(id)?"?tradeId="+encodeURIComponent(id):"");});
    if(window.ethereum?.on){window.ethereum.on("accountsChanged",accounts=>{S.account=String(accounts?.[0]||"")||null;set("biz-wallet-text",S.account?short(S.account,13,10):"연결 계정 없음");set("product-wallet",S.account?short(S.account,8,6):"지갑 미연결");set("biz-role-access",roleAccess());refreshReadiness();});}
    assignRole("buyer");loadList().catch(e=>tip("초기 거래 조회 실패: "+error(e),true));
  }
  document.addEventListener("DOMContentLoaded",setup);
})();
