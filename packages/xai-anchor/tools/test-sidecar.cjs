"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const program=path.join(__dirname,"xai-anchor.cjs");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"inspectescrow-xai-anchor-test-"));
const tradeId="0x"+"ab".repeat(32),evidenceHash="0x"+"cd".repeat(32);
const originalTopSha256="12".repeat(32),modelCheckpointSha256="34".repeat(32);
const xai={
  method:"PATCHCORE_NATIVE_ANOMALY_MAP",originalTopSha256,modelCheckpointSha256,
  scoreScaled:52572000,scoreRaw:52.572,decision:"REVIEW_REQUIRED",
  quadrants:[{label:"좌상",relativeAnomalyIndex:0},{label:"우상",relativeAnomalyIndex:57.5},
    {label:"좌하",relativeAnomalyIndex:0},{label:"우하",relativeAnomalyIndex:0}],
  overlayPngBase64:Buffer.from("test-not-a-real-image".repeat(12)).toString("base64")
};
const payload={
 schema:"InspectEscrow.XAI.EvidenceCompanion.v1",tradeId,
 roleName:"buyer",sessionId:"sample-session",
 evidencePackageHash:evidenceHash,specimenManifestHash:"0x"+"56".repeat(32),
 originalTopSha256,modelCheckpointSha256,scoreScaled:"52572000",
 decision:"REVIEW_REQUIRED",xai,signed:false,onchainSubmitted:false,legalConclusion:false,
 limitation:"test fixture"
};
function record(p){return {schema:"InspectEscrow.XAI.OfflineSidecar.v1",payload:p,
  localContentSha256:crypto.createHash("sha256").update(JSON.stringify(p)).digest("hex")};}
function run(p,expectSuccess){
 const filename=path.join(dir,expectSuccess?"valid.json":"modified.json");
 fs.writeFileSync(filename,JSON.stringify(record(p)));
 const r=spawnSync(process.execPath,[program,"inspect","--file",filename],{encoding:"utf8"});
 if((r.status===0)!==expectSuccess)throw Error("unexpected status "+r.status+" "+r.stderr+" "+r.stdout);
 return r;
}
try{
 const valid=run(payload,true);
 if(!valid.stdout.includes('"ok": true'))throw Error("NO_SUCCESS_OUTPUT");
 let changed=JSON.parse(JSON.stringify(payload));
 changed.xai.scoreScaled=1; // attacker can recompute a file SHA but binding must fail
 const bad=run(changed,false);
 if(!bad.stderr.includes("SIDECAR_XAI_BINDING_MISMATCH"))throw Error("TAMPER_NOT_CAUGHT");
 console.log("PASS local exact-sidecar hash; tampered XAI score rejected; SHA recalculation cannot bypass binding validation");
}finally{fs.rmSync(dir,{recursive:true,force:true});}
