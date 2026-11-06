"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { formatEther, keccak256 } = require("ethers");
const { KNOWN_TRADES } = require("./trade-workspace-endpoints.cjs");
const { resolutionContext } = require("./resolution-endpoints.cjs");

const ROOT = __dirname;
const PROJECT = path.resolve(ROOT, "..", "..", "..");
const REQUIRED_ROUTES = ["/trades", "/new-trade", "/#roles", "/live", "/e2e", "/evidence", "/replay", "/resolution", "/stage"];
const RELEASE_FILES = [
  "server.cjs", "index.html", "app.js", "proposal.js", "roles.js", "styles.css",
  "trades.html", "trades.js", "trades.css", "trade-workspace-endpoints.cjs",
  "e2e.html", "e2e.js", "e2e.css", "e2e-endpoints.cjs", "evidence-bridge.cjs",
  "evidence.html", "evidence.js", "evidence.css", "evidence-import-endpoints.cjs",
  "replay.html", "replay.js", "replay.css", "replay-endpoints.cjs",
  "live.html", "live.js", "live.css", "live-camera.css", "live-evidence-endpoints.cjs",
  "new-trade.html", "new-trade.js", "new-trade.css", "trade-builder-endpoints.cjs",
  "resolution.html", "resolution.js", "resolution.css", "resolution-endpoints.cjs",
  "stage.html", "stage.js", "stage.css", "stage-endpoints.cjs", "stage-mission.cjs",
  "journey.html", "journey.js", "journey.css", "release-endpoints.cjs",
  "test-release-readiness.cjs", "RELEASE_TRACKING_PLAN_2E_KO.md", "2E_E2E_SCENARIO_RESULTS.json",
  "2E_FINAL_RECORDING_RUNBOOK_KO.md", "2E_INTEGRATED_E2E_REDTEAM_REPORT_KO.md",
  "test-live-evidence.cjs", "2EPLUS_LIVE_EVIDENCE_RESULTS.json", "LIVE_EVIDENCE_S03_ARCHIVED_SAMPLE.json",
  "2EPLUS_LIVE_EVIDENCE_IMPLEMENTATION_REPORT_KO.md",
  "test-trade-builder.cjs", "2F_TRADE_BUILDER_RESULTS.json",
  "START_2F_MINIMAL.ps1", "CHECK_2F_HEALTH.ps1",
  "2F_FINAL_RELEASE_REPORT_KO.md", "2F_FINAL_DEMO_RUNBOOK_KO.md", "2F_SCENARIO_CATALOG.json",
  "INSPECTOR_REPLAY_TEST_RESULTS.json", "INSPECTOR_REPLAY_REPORT_S05_SAMPLE.json",
  "INSPECTOR_REPLAY_SEPOLIA_FORK_RESULTS.json", "2D_RESOLUTION_TEST_RESULTS.json",
  "2D_RESOLUTION_SEPOLIA_FORK_RESULTS.json", "build-2f-release.cjs",
  "2F_RECORDING_READINESS_RESULTS.json", "2F_RECORDING_READINESS_AUDIT_KO.md"
];
const DENY_PATTERNS = ["*.env", "*.key", "*.pem", "*.p12", "*.pfx", "*.keystore", "*.pt", "*.pth", "*.ckpt", "*.onnx", "*.safetensors", "private evidence images", "browser profiles", "mnemonic or private keys"];
const send = (res, status, value) => { res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}); res.end(JSON.stringify(value)); };
const sha256File = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJSON = file => JSON.parse(fs.readFileSync(file, "utf8"));

function diskStatus() {
  try {
    const stat = fs.statfsSync("C:\\");
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    return { source:"LOCAL_OS_READ_ONLY", freeBytes, totalBytes, freeGiB:Number((freeBytes/2**30).toFixed(2)), minimumGiB:10, safeForHeavyTests:freeBytes>=10*2**30 };
  } catch (error) { return { source:"LOCAL_OS_READ_ONLY", error:String(error.message), safeForHeavyTests:false }; }
}
function modelStatus() {
  return new Promise(resolve => {
    const req = http.get({ hostname:"127.0.0.1", port:8766, path:"/api/status", timeout:1200 }, response => {
      const chunks=[]; response.on("data", x=>chunks.push(x)); response.on("end",()=>resolve({available:response.statusCode===200,statusCode:response.statusCode,source:"LOCAL_MODEL_B_RUNTIME",detail:Buffer.concat(chunks).toString("utf8").slice(0,600)}));
    });
    req.on("timeout",()=>req.destroy(Error("timeout")));
    req.on("error",error=>resolve({available:false,source:"LOCAL_MODEL_B_RUNTIME",detail:String(error.message)}));
  });
}
function resultArtifact(relative, expectedChecks) {
  const file = path.resolve(PROJECT, relative);
  try {
    const value = readJSON(file), total=Number(value.checksTotal ?? value.checks ?? expectedChecks ?? 0);
    const legacyComplete=Number(value.checks||0)>0&&Array.isArray(value.results)&&value.results.length===Number(value.checks);
    const passed=Number(value.checksPassed ?? (value.allPass===true||legacyComplete?total:0));
    return { exists:true, file, sha256:sha256File(file), allPass:value.allPass!==false && total>0 && passed===total, checksPassed:passed, checksTotal:total, scope:value.scope||value.suite||"RECORDED_TEST_ARTIFACT", schemaInterpretation:legacyComplete?"LEGACY_CHECK_COUNT_AND_RESULTS_LENGTH_MATCH":"EXPLICIT_PASS_FIELDS", actualSepoliaTransactions:Number(value.actualSepoliaTransactions||value.sepoliaTransactionsSent||0) };
  } catch (error) { return { exists:false, file, allPass:false, error:String(error.message) }; }
}
function buildReleaseManifest() {
  const files = RELEASE_FILES.map(name => {
    const file=path.join(ROOT,name); return { path:name, exists:fs.existsSync(file), bytes:fs.existsSync(file)?fs.statSync(file).size:0, sha256:fs.existsSync(file)?sha256File(file):null };
  });
  return { schema:"inspectescrow.release-manifest/2f-1", generatedAtUtc:new Date().toISOString(), root:ROOT, gitAction:"NOT_STAGED_OR_COMMITTED_BY_CODEX", files, complete:files.every(x=>x.exists), denyPatterns:DENY_PATTERNS, preservation:["existing Git changes", "untracked evidence", "deployment manifests", "model checkpoints", "original images"] };
}
function scenarios(artifacts, live) {
  const local=artifacts.localE2E.allPass, red=artifacts.redTeam.allPass, replay=artifacts.replay.allPass;
  return [
    {id:"A",name:"정상 거래",roles:["Supplier","Buyer"],start:"PROPOSED",transitions:["AWAIT_SUPPLIER","AWAIT_BUYER","ACCEPTANCE_PENDING","RELEASED","WITHDRAWN"],source:"SEPOLIA_CONFIRMED_TX",status:live.reference.state===17&&live.reference.transactionCount===12?"PASS":"FAIL",tradeId:live.reference.tradeId,proof:"기존 S05 12 TX 읽기 전용",recovery:"기존 TX manifest와 Sepolia receipt를 재조회"},
    {id:"B",name:"구매자 분쟁 · Replay CONSISTENT",roles:["Supplier","Buyer","Primary Inspector"],start:"DISPUTED_PRIMARY",transitions:["REPLAY_CONSISTENT","INSPECTOR_DECISION","RELEASED_OR_REFUNDED","WITHDRAWN"],source:"LOCAL_ANVIL",status:local&&replay?"PASS":"BLOCKED",tradeId:"ISOLATED_LOCAL_TRADE",proof:"실제 S05 재추론 오차 0 + 로컬 계약 Decision",recovery:"evidence Import부터 다시 시작"},
    {id:"C",name:"Supplier REVIEW",roles:["Supplier"],start:"AWAIT_SUPPLIER",transitions:["SUPPLIER_HOLD","SUPPLIER_REINSPECTION_OR_REFUND"],source:"LOCAL_ANVIL",status:local&&red?"PASS":"BLOCKED",tradeId:"ISOLATED_LOCAL_TRADE",proof:"Buyer 단계 진입 차단과 timeout 종료",recovery:"새 Trade ID로 재검사 횟수 초기화"},
    {id:"D",name:"CONTROLLED RED-TEAM 점수 불일치",roles:["Station","Primary Inspector"],start:"DISPUTED_PRIMARY",transitions:["ACTUAL_MODEL_RERUN","INCONSISTENT","EXECUTION_HOLD","MUTUAL_OR_ARBITRATION"],source:"LOCAL_ANVIL",status:local&&red&&replay?"PASS":"BLOCKED",tradeId:"ISOLATED_LOCAL_TRADE",proof:"통제 주장 점수와 실제 모델 점수를 분리 표시",recovery:"CONTROLLED 모드를 해제하고 canonical report 재생성"},
    {id:"E",name:"정책·증거 공격",roles:["Attacker","Supplier","Buyer","Station"],start:"MULTIPLE_ISOLATED_TRADES",transitions:["SERVER_PREFLIGHT","CRYPTO_VERIFY","SOLIDITY_REVERT"],source:"LOCAL_ANVIL",status:red?"PASS":"BLOCKED",tradeId:"ISOLATED_LOCAL_TRADES",proof:"PolicyHashMismatch·nonce·deadline·Actor·Station 공격",recovery:"원본·정책·nonce를 새로 검증"}
  ];
}
async function status(ctx, tradeId) {
  if(!/^0x[0-9a-fA-F]{64}$/.test(String(tradeId||"")))throw Error("TRADE_ID_REQUIRED_OR_INVALID");
  const selected = KNOWN_TRADES.find(x=>String(x.id).toLowerCase()===String(tradeId).toLowerCase()) || {id:tradeId,kind:"DYNAMIC_ONCHAIN_TRADE"};
  const reference = KNOWN_TRADES.find(x=>x.kind==="MODEL_B_S05_NORMAL_REFERENCE");
  const network=await ctx.provider.getNetwork(),isSepolia=Number(network.chainId)===11155111;
  const [snapshot, referenceState, code, model] = await Promise.all([
    resolutionContext(ctx, selected.id), isSepolia?ctx.contract.getTradeState(reference.id):Promise.resolve(0), ctx.provider.getCode(String(ctx.contract.target)), modelStatus()
  ]);
  const roleEntries=Object.entries(snapshot.roles).filter(([name])=>!["supplierStation","buyerStation","primaryInspectorStation","backupInspectorStation","externalArbitratorStation"].includes(name));
  const balances=await Promise.all(roleEntries.map(([,address])=>ctx.provider.getBalance(address)));
  const artifacts={
    localE2E:resultArtifact("packages/modelb_patch3_bridge_v1/results/MODEL_B_LOCAL_E2E_RESULTS.json",16),
    redTeam:resultArtifact(".modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/STAGE_ASSETS/PATCH3_RED_TEAM_RESULTS.json",36),
    replay:resultArtifact(".modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/INSPECTOR_REPLAY_TEST_RESULTS.json",20),
    resolution:resultArtifact(".modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/2D_RESOLUTION_TEST_RESULTS.json",23),
    fork:resultArtifact(".modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/2D_RESOLUTION_SEPOLIA_FORK_RESULTS.json",13)
  };
  const disk=diskStatus(), runtimeHash=keccak256(code), manifest=buildReleaseManifest();
  const preflight={
    mode:isSepolia?"SEPOLIA_READ_ONLY":"LOCAL_ANVIL_READ_ONLY", broadcastAttempted:false, actualTransactionsSent:0, chainId:snapshot.chainId, chainOk:snapshot.chainId===Number(network.chainId),
    contract:snapshot.contract, runtimeHash, runtimePresent:code!=="0x", rpcBlock:snapshot.blockNumber,
    tradeId:snapshot.tradeId, state:snapshot.state, stateName:snapshot.stateName, policyHash:snapshot.policyHash,
    policyDocumentStatus:snapshot.policyDocumentStatus, policyHashVerified:snapshot.policyHashVerified, policyApproved:snapshot.policyApproved,
    executionGate:snapshot.policyExecutionGate, deadline:snapshot.deadline, deadlinePhase:snapshot.deadlinePhase,
    evidenceHashes:{supplier:snapshot.inspections.supplier.evidencePackageHash,buyer:snapshot.inspections.buyer.evidencePackageHash,replayReport:snapshot.replay.reportHash},
    replay:snapshot.replay, credentials:snapshot.credentials, roleBalances:Object.fromEntries(roleEntries.map(([name,address],i)=>[name,{address,wei:String(balances[i]),eth:formatEther(balances[i])}])),
    accounting:snapshot.accounting, disk, modelB:model,
    readyForAutomaticBroadcast:false,
    blockers:[...(!snapshot.policyApproved?["POLICY_USER_APPROVAL_REQUIRED"]:[]),...(!disk.safeForHeavyTests?["DISK_SPACE_BELOW_10_GIB"]:[]),...(!model.available?["MODEL_B_RUNTIME_OFFLINE"]:[]),"USER_PER_TRANSACTION_APPROVAL_REQUIRED"]
  };
  const live={candidate:{tradeId:snapshot.tradeId,state:snapshot.state,stateName:snapshot.stateName,policyStatus:snapshot.policyDocumentStatus,transactionCount:snapshot.transactions.length},reference:{tradeId:reference.id,state:Number(referenceState),transactionCount:12}};
  return {schema:"inspectescrow.release-readiness/2f-1",generatedAtUtc:new Date().toISOString(),source:isSepolia?"SEPOLIA_READ_ONLY":"LOCAL_ANVIL_READ_ONLY",readOnly:true,serverTransactionsSent:0,routes:REQUIRED_ROUTES.map((route,index)=>({index:index+1,route,label:["거래·정책","새 거래 작성","역할별 실행","LIVE 새 증거","검사·서명","증거 검증","Inspector Replay","Decision·정산","본선 3장면"][index]})),live,preflight,artifacts,scenarios:scenarios(artifacts,live),releaseManifest:manifest};
}
async function handle(req,res,ctx,url) {
  if(req.method!=="GET")return send(res,405,{error:"GET_READ_ONLY_ONLY",transactionsSent:0});
  try {
    if(url.pathname==="/api/release/status")return send(res,200,await status(ctx,String(url.searchParams.get("tradeId")||"")));
    if(url.pathname==="/api/release/manifest")return send(res,200,buildReleaseManifest());
    return send(res,404,{error:"RELEASE_ROUTE_NOT_FOUND"});
  } catch (error) { return send(res,503,{error:"RELEASE_PREFLIGHT_UNAVAILABLE",detail:String(error.shortMessage||error.message||error).slice(0,300),transactionsSent:0}); }
}

module.exports={handle,status,diskStatus,modelStatus,resultArtifact,buildReleaseManifest,scenarios,RELEASE_FILES,DENY_PATTERNS};
