const $ = (id) => document.getElementById(id);
const state = {
  step: 0,
  contract: "DRAFT",
  role: "Supplier",
  manifest: { status: "waiting_for_evidence" },
  events: [{ t: "00:00", msg: "Job created · DRAFT" }],
  startAt: Date.now()
};

const scores = {
  outbound: { score: 0.18, decision: "PASS" },
  inbound: { score: 0.82, decision: "REVIEW" },
  reinspection: { score: 0.71, decision: "REVIEW CONFIRMED" }
};

function toast(msg){
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 2300);
}

function elapsed(){
  const s = Math.floor((Date.now()-state.startAt)/1000);
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}

function addEvent(msg){
  state.events.push({t: elapsed(), msg});
  renderEvents();
}

function renderEvents(){
  $("eventLog").innerHTML = state.events.map(e => `<li><time>${e.t}</time><span>${e.msg}</span></li>`).join("");
}

function setStep(n){
  state.step = n;
  document.querySelectorAll(".step").forEach((el, i)=>{
    el.classList.toggle("active", i===n);
    el.classList.toggle("done", i<n);
  });
}

function setContractState(name){
  state.contract = name;
  $("heroState").textContent = name;
  $("contractStateBadge").textContent = name;
  document.querySelectorAll(".state-node").forEach(node=>{
    const order = ["DRAFT","FUNDED","REVIEW","DISPUTED","RESOLVED"];
    const idx = order.indexOf(node.dataset.state);
    const cur = order.indexOf(name);
    node.classList.toggle("active", idx === cur);
    node.classList.toggle("done", idx < cur);
  });
}

function status(elId, text, cls){
  const el = $(elId);
  el.textContent = text;
  el.className = `status ${cls}`;
}

async function sha256Text(text){
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function buildManifest(kind, score, decision){
  const base = {
    transaction_id: "TX-IE-2026-0914-001",
    lot_or_serial_id: "LOT-2026-0914-01",
    fixture_id: "FIXTURE-A",
    camera_id: "CAM-DEMO-01",
    inspector_public_key: kind === "reinspection" ? "0xInspectorDemo" : (kind === "outbound" ? "0xSupplierDemo" : "0xBuyerDemo"),
    capture_nonce: `${kind.toUpperCase()}-${Date.now()}`,
    acquired_at: new Date().toISOString(),
    rule_digest: "sha256:rule-v0.1",
    model_digest: "sha256:patchcore-v0.1",
    preprocessing_digest: "sha256:roi-norm-v0.1",
    ai_result: { anomaly_score: score, decision }
  };
  const hash = await sha256Text(JSON.stringify(base));
  base.raw_image_sha256 = `sha256:${hash}`;
  return base;
}

function renderManifest(m){
  state.manifest = m;
  $("manifestBox").textContent = JSON.stringify(m, null, 2);
}

function enable(id, yes=true){ $(id).disabled = !yes; }

function setFreeze(mode){
  const el = $("freezeIndicator");
  el.className = "freeze";
  if(mode==="frozen"){ el.textContent="FROZEN"; el.classList.add("frozen"); }
  else if(mode==="released"){ el.textContent="SETTLED"; el.classList.add("released"); }
  else if(mode==="funded"){ el.textContent="FUNDED"; }
  else { el.textContent="NOT FUNDED"; }
}

function reset(){
  state.step=0; state.contract="DRAFT"; state.role="Supplier"; state.startAt=Date.now();
  state.events=[{t:"00:00",msg:"Job created · DRAFT"}];
  renderEvents(); setStep(0); setContractState("DRAFT"); setFreeze("draft");
  $("heroState").textContent="DRAFT"; $("custodyLabel").textContent="미예치"; $("disputeLabel").textContent="없음";
  status("lockBadge","DRAFT","status-gray"); status("outBadge","대기","status-gray"); status("inBadge","대기","status-gray"); status("reBadge","대기","status-gray");
  $("outScore").textContent=$("inScore").textContent=$("reScore").textContent="—";
  $("outDecision").textContent=$("inDecision").textContent=$("reDecision").textContent="—";
  renderManifest({status:"waiting_for_evidence"});
  ["submitOutbound","runInbound","raiseDispute","runReinspect","resolveSettlement","tryRuleChange","tryAdminSweep"].forEach(id=>enable(id,false));
  enable("lockFund",true);
  document.querySelectorAll(".role").forEach(b=>b.classList.toggle("active",b.dataset.role==="Supplier"));
  toast("Demo reset");
}

async function lockAndFund(){
  setStep(1); setContractState("FUNDED"); setFreeze("funded");
  status("lockBadge","LOCKED","status-blue");
  $("custodyLabel").textContent="Contract controlled";
  addEvent("Spec digest signed by Buyer & Supplier");
  addEvent("1.00 Test ETH funded → active terms locked");
  enable("lockFund",false); enable("submitOutbound",true); enable("tryRuleChange",true); enable("tryAdminSweep",true);
  toast("FUNDED — 기준과 자금 조건이 잠겼습니다.");
}

async function submitOutbound(){
  const m = await buildManifest("outbound", scores.outbound.score, scores.outbound.decision);
  renderManifest(m);
  $("outScore").textContent = scores.outbound.score.toFixed(2);
  $("outDecision").textContent = scores.outbound.decision;
  status("outBadge","PASS","status-green");
  setStep(2); setContractState("REVIEW");
  addEvent("Supplier outbound evidence submitted");
  addEvent(`Outbound AI result: ${scores.outbound.score.toFixed(2)} PASS`);
  enable("submitOutbound",false); enable("runInbound",true);
  toast("출하 검사 evidence가 고정되었습니다.");
}

async function runInbound(){
  const m = await buildManifest("inbound", scores.inbound.score, scores.inbound.decision);
  renderManifest(m);
  $("inScore").textContent = scores.inbound.score.toFixed(2);
  $("inDecision").textContent = scores.inbound.decision;
  status("inBadge","REVIEW","status-amber");
  setStep(3);
  addEvent(`Buyer inbound AI result: ${scores.inbound.score.toFixed(2)} REVIEW`);
  enable("runInbound",false); enable("raiseDispute",true);
  toast("입고 검사에서 REVIEW가 발생했습니다.");
}

function dispute(){
  setContractState("DISPUTED"); setFreeze("frozen");
  $("disputeLabel").textContent="활성 · 잔금 동결";
  addEvent("Buyer raised dispute → escrow frozen");
  setStep(4); enable("raiseDispute",false); enable("runReinspect",true);
  toast("DISPUTED — 한쪽 단독 지급이 차단됩니다.");
}

async function reinspect(){
  const m = await buildManifest("reinspection", scores.reinspection.score, scores.reinspection.decision);
  renderManifest(m);
  $("reScore").textContent = scores.reinspection.score.toFixed(2);
  $("reDecision").textContent = scores.reinspection.decision;
  status("reBadge","SIGNED","status-red");
  addEvent(`Inspector reinspection: ${scores.reinspection.score.toFixed(2)} REVIEW CONFIRMED`);
  addEvent("Inspector signed decision reference");
  setStep(5); enable("runReinspect",false); enable("resolveSettlement",true);
  toast("독립 재검 판정이 제출되었습니다.");
}

function resolve(){
  setContractState("RESOLVED"); setFreeze("released");
  $("disputeLabel").textContent="종료";
  addEvent("Precommitted rule executed → Buyer refunded 1.00 Test ETH");
  addEvent("Job RESOLVED · no further transition allowed");
  enable("resolveSettlement",false);
  toast("RESOLVED — 사전 규칙에 따라 정산 완료");
}

function rejected(kind){
  if(state.contract==="DRAFT"){ toast("먼저 Funded 상태로 이동하세요."); return; }
  const msg = kind==="rule"
    ? "REJECTED: active job의 rule/model digest는 단독 변경할 수 없습니다."
    : "REJECTED: operator has no admin sweep path for funded balance.";
  addEvent(msg);
  toast(msg);
}

async function autoDemo(){
  reset();
  const seq = [
    [700, lockAndFund],
    [1600, submitOutbound],
    [2600, runInbound],
    [3600, dispute],
    [4700, reinspect],
    [5900, ()=>rejected("rule")],
    [6900, ()=>rejected("sweep")],
    [8000, resolve]
  ];
  seq.forEach(([ms,fn])=>setTimeout(fn,ms));
}

$("lockFund").onclick = lockAndFund;
$("submitOutbound").onclick = submitOutbound;
$("runInbound").onclick = runInbound;
$("raiseDispute").onclick = dispute;
$("runReinspect").onclick = reinspect;
$("resolveSettlement").onclick = resolve;
$("tryRuleChange").onclick = ()=>rejected("rule");
$("tryAdminSweep").onclick = ()=>rejected("sweep");
$("startDemo").onclick = autoDemo;
$("resetDemo").onclick = reset;

document.querySelectorAll(".role").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll(".role").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active"); state.role=btn.dataset.role; toast(`Role switched: ${state.role}`);
  };
});

document.querySelectorAll(".tab").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
    btn.classList.add("active"); $(btn.dataset.tab).classList.add("active");
  };
});

$("copyManifest").onclick=async()=>{
  await navigator.clipboard.writeText(JSON.stringify(state.manifest,null,2));
  toast("Manifest JSON copied");
};

$("downloadLog").onclick=()=>{
  const blob = new Blob([JSON.stringify(state.events,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download="inspectescrow-event-log.json"; a.click();
  URL.revokeObjectURL(url);
};

reset();
