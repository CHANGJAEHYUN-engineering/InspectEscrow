"use strict";

const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {verifyStaticEvidence}=require("./evidence-import-endpoints.cjs");
const {verifyReportEnvelope,buildReplayReport}=require("./replay-endpoints.cjs");

const root="C:\\Users\\USER\\OneDrive\\바탕 화면\\대학교 활동\\AI 블록체인";
const folders={
  supplier:path.join(root,"NEW_S05_ONLY_2e1e7f88","04_SUPPLIER_4_FILES"),
  buyer:path.join(root,"NEW_S05_ONLY_2e1e7f88","04_BUYER_4_FILES")
};
const sha256=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const clone=value=>structuredClone(value);
const checks=[];
const add=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),detail:String(detail??"")});
const reject=(name,fn,pattern)=>{try{fn();add(name,false,"DID_NOT_REJECT");}catch(error){const detail=String(error.message);add(name,pattern.test(detail),detail);}};

function payload(role){
  const folder=folders[role];
  const bundle=JSON.parse(fs.readFileSync(path.join(folder,role+".modelb-evidence-bundle.json"),"utf8"));
  const images={};
  for(const view of ["TOP","FRONT","SIDE"]){
    const name=bundle.manifest.captureFiles[view].fileName;
    images[view]={name,data:fs.readFileSync(path.join(folder,name)).toString("base64")};
  }
  return {expectedTradeId:bundle.manifest.tradeId,expectedRole:role,bundle,images};
}

async function inferArchived(fileName,specimenId){
  const bytes=fs.readFileSync(path.join(root,fileName));
  const digest=sha256(bytes);
  const form=new FormData();
  form.append("image",new Blob([bytes],{type:"image/jpeg"}),fileName);
  form.append("expected_sha256",digest);
  // The frozen S05 runtime only accepts its committed API identifier.  The
  // caller-provided specimenId is retained by this test as scope metadata,
  // not sent as a false runtime identity.
  form.append("specimen_id","IE-DEMO-001");
  const response=await fetch("http://127.0.0.1:8766/api/infer",{method:"POST",body:form});
  const result=await response.json();
  if(!response.ok)throw Error("S03_REPLAY_FAILED_"+String(result.detail||response.status));
  return result;
}

async function replayHttp(body){
  const response=await fetch("http://127.0.0.1:8770/api/replay/execute",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(body)});
  return {response,data:await response.json()};
}

async function main(){
  const supplier=payload("supplier"),buyer=payload("buyer");
  const supplierStatic=verifyStaticEvidence(supplier),buyerStatic=verifyStaticEvidence(buyer);

  const normalBody={supplier,buyer,controlledRedTeam:false,controlledScoreOverrides:{}};
  const {response,data}=await replayHttp(normalBody);
  if(!data.report)throw Error("ACTUAL_REPLAY_DID_NOT_RETURN_REPORT: "+JSON.stringify(data));
  add("01_ACTUAL_S05_HTTP_REPLAY",response.status===200&&data.status==="CONSISTENT"&&data.actualAiReplayExecuted===true,"HTTP "+response.status+" · "+String(data.status||data.error));
  add("02_SUPPLIER_EXACT_SCORE",data.report?.roles?.supplier?.replayScoreScaled==="36302902"&&data.report.roles.supplier.absoluteErrorScaled==="0","submitted "+data.report?.roles?.supplier?.comparedSubmittedScoreScaled+" replay "+data.report?.roles?.supplier?.replayScoreScaled);
  add("03_BUYER_EXACT_SCORE",data.report?.roles?.buyer?.replayScoreScaled==="37078381"&&data.report.roles.buyer.absoluteErrorScaled==="0","submitted "+data.report?.roles?.buyer?.comparedSubmittedScoreScaled+" replay "+data.report?.roles?.buyer?.replayScoreScaled);
  add("04_S05_DECISIONS_REPRODUCED",data.report?.roles?.supplier?.replayDecision==="PASS"&&data.report?.roles?.buyer?.replayDecision==="PASS","Supplier "+data.report?.roles?.supplier?.replayDecision+" · Buyer "+data.report?.roles?.buyer?.replayDecision);
  add("05_TOP_ONLY_AND_EVIDENCE_VIEWS",data.report?.limitations?.some(x=>/TOP only/i.test(x))&&Object.keys(data.report.roles.supplier.originals).sort().join(",")==="FRONT,SIDE,TOP",data.report?.limitations?.[1]);

  const s03Normal=await inferArchived("S03_normal1.jpg.jpg","S03_ARCHIVED_NORMAL_COMPARISON");
  const s03Review=await inferArchived("S03_deep_scratch1.jpg.jpg","S03_ARCHIVED_DEEP_SCRATCH_COMPARISON");
  const threshold=38280374;
  add("06_DIFFERENT_OUTCOMES_CAN_BOTH_REPRODUCE",s03Normal.score_scaled===35534252&&s03Review.score_scaled===52572132&&s03Normal.score_scaled<threshold&&s03Review.score_scaled>=threshold,"archived comparison only · PASS "+s03Normal.score_scaled+" · REVIEW_REQUIRED "+s03Review.score_scaled);

  const changed=clone(supplier),changedBytes=Buffer.from(changed.images.TOP.data,"base64");changedBytes[1000]^=1;changed.images.TOP.data=changedBytes.toString("base64");
  reject("07_ONE_BYTE_TAMPER_UNVERIFIABLE",()=>verifyStaticEvidence(changed),/ORIGINAL_IMAGE_HASH_MISMATCH_TOP/);
  const policy=clone(supplier);policy.bundle.unsigned.message.policyHash="0x"+"22".repeat(32);
  reject("08_POLICY_TAMPER_UNVERIFIABLE",()=>verifyStaticEvidence(policy),/POLICY_HASH_MISMATCH/);
  const checkpoint=clone(supplier);checkpoint.bundle.inferenceReport.model_checkpoint_sha256="00".repeat(32);
  reject("09_CHECKPOINT_TAMPER_UNVERIFIABLE",()=>verifyStaticEvidence(checkpoint),/MODEL_CHECKPOINT_MISMATCH/);
  const wrongRole=clone(supplier);wrongRole.expectedRole="buyer";
  reject("10_WRONG_ROLE_UNVERIFIABLE",()=>verifyStaticEvidence(wrongRole),/ROLE_MISMATCH_EXPECTED_VS_BUNDLE/);
  reject("11_NO_AI_NO_CONSISTENCY_RESULT",()=>buildReplayReport({bindings:{},supplier:null,buyer:null,runtime:{},contractSnapshot:{},controlled:false}),/BOTH_ROLE_REPLAY_RESULTS_REQUIRED/);

  const controlled=await replayHttp({supplier,buyer,controlledRedTeam:true,controlledScoreOverrides:{buyer:"37078382"}});
  add("12_CONTROLLED_SCORE_MISMATCH_DETECTED",controlled.response.status===200&&controlled.data.status==="INCONSISTENT"&&controlled.data.report.roles.buyer.absoluteErrorScaled==="1",String(controlled.data.status||controlled.data.error)+" · error "+controlled.data.report?.roles?.buyer?.absoluteErrorScaled);
  add("13_CONTROLLED_TEST_LABELED_AND_NOT_SUBMITTABLE",controlled.data.report?.mode==="CONTROLLED_RED_TEAM_TEST"&&controlled.data.report?.controlledRedTeam?.maliciousClaimIsActualModelOutput===false&&controlled.data.unsignedAttestation===null&&controlled.data.submissionGate==="BLOCKED_CONTROLLED_RED_TEAM_TEST_ONLY",controlled.data.submissionGate);
  add("14_INTEGRITY_FAILURE_DISTINCT_FROM_INCONSISTENCY",checks.find(x=>x.name==="07_ONE_BYTE_TAMPER_UNVERIFIABLE")?.pass&&controlled.data.status==="INCONSISTENT","tamper rejected before AI; controlled valid input reached INCONSISTENT");

  const envelope={report:data.report,replayReportHash:data.replayReportHash,unsignedAttestation:data.unsignedAttestation,submissionGate:data.submissionGate};
  const verified=verifyReportEnvelope(envelope);
  add("15_REPORT_EXPORT_IMPORT_HASH",verified.replayReportHash===data.replayReportHash&&verified.status==="REPORT_HASH_VERIFIED",verified.replayReportHash);
  const altered=clone(envelope);altered.report.roles.buyer.replayScoreScaled="1";
  reject("16_REPORT_FIELD_TAMPER_BLOCKED",()=>verifyReportEnvelope(altered),/REPLAY_REPORT_HASH_MISMATCH/);
  add("17_COMPLETED_TRADE_SUBMISSION_BLOCKED",data.submissionGate==="BLOCKED_TRADE_STATE"&&data.unsignedAttestation===null,data.report?.contractSnapshot?.stateName+" · "+data.submissionGate);
  add("18_RUNTIME_AND_CHECKPOINT_PROVENANCE",data.report?.runtimeProvenance?.artifactCommitmentVerified===true&&data.report?.checkpointSha256===supplierStatic.inference.checkpointSha256&&data.report.checkpointSha256===buyerStatic.inference.checkpointSha256,data.report?.checkpointSha256);
  add("19_ZERO_TRANSACTIONS_AND_NO_SIGNATURE",data.transactionsSent===0&&data.report?.transactionsSent===0&&data.unsignedAttestation===null,"transactionsSent=0; signature absent");
  add("20_PHYSICAL_CUSTODY_NOT_CLAIMED",data.report?.roles?.supplier?.physicalSpecimenIdentityProven===false&&data.report?.limitations?.some(x=>/physical specimen identity/i.test(x)),data.report?.limitations?.[0]);

  const reportFile=path.join(__dirname,"INSPECTOR_REPLAY_REPORT_S05_SAMPLE.json");
  fs.writeFileSync(reportFile,JSON.stringify(envelope,null,2)+"\n","utf8");
  const result={suite:"INSPECTESCROW_2C_INDEPENDENT_MODEL_B_REPLAY",generatedAtUtc:new Date().toISOString(),allPass:checks.every(x=>x.pass),checksPassed:checks.filter(x=>x.pass).length,checksTotal:checks.length,transactionsSent:0,actualSepoliaTransactions:0,tradeId:data.report?.tradeId,replayReportHash:data.replayReportHash,supplier:{submitted:data.report?.roles?.supplier?.comparedSubmittedScoreScaled,replay:data.report?.roles?.supplier?.replayScoreScaled,error:data.report?.roles?.supplier?.absoluteErrorScaled,decision:data.report?.roles?.supplier?.replayDecision},buyer:{submitted:data.report?.roles?.buyer?.comparedSubmittedScoreScaled,replay:data.report?.roles?.buyer?.replayScoreScaled,error:data.report?.roles?.buyer?.absoluteErrorScaled,decision:data.report?.roles?.buyer?.replayDecision},archivedS03Comparison:{scope:"ARCHIVED_COMPARISON_ONLY_NOT_TRADE_EVIDENCE",normal:{scoreScaled:s03Normal.score_scaled,decision:s03Normal.score_scaled<threshold?"PASS":"REVIEW_REQUIRED"},deepScratch:{scoreScaled:s03Review.score_scaled,decision:s03Review.score_scaled<threshold?"PASS":"REVIEW_REQUIRED"}},reportFile,checks};
  fs.writeFileSync(path.join(__dirname,"INSPECTOR_REPLAY_TEST_RESULTS.json"),JSON.stringify(result,null,2)+"\n","utf8");
  console.log(JSON.stringify(result,null,2));
  if(!result.allPass)process.exitCode=1;
}

main().catch(error=>{console.error(error);process.exitCode=1;});
