// Synthetic unit-test fixture: mock XAI provenance flags validate hash bindings, not actual AI inference.
"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {hashObject,reference}=require("./evidence-bridge.cjs");
const {domain,stationTypes}=require("./e2e-endpoints.cjs");
const {verifyStaticEvidence}=require("./evidence-import-endpoints.cjs");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const png=(marker)=>Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(600,marker)]);
const files={TOP:png(11),FRONT:png(12),SIDE:png(13)},xai=png(14);
const encoded=(name,b)=>({name,data:b.toString("base64")});
const images=Object.fromEntries(Object.entries(files).map(([view,b])=>[view,encoded(view+".png",b)]));
const tradeId=reference.tradeId,station=reference.supplierStation,nonce="0x"+"a".repeat(64),role=0;
const captureFiles=Object.fromEntries(Object.entries(files).map(([view,b])=>[view,{fileName:view+".png",sha256:sha(b),bytes:b.length}]));
const manifest={tradeId,policyHash:reference.policyHash,station,role,attempt:1,sessionNonce:nonce,
  captureFiles,requiredCaptureViews:["TOP","FRONT","SIDE"],providedCaptureViews:["TOP","FRONT","SIDE"],completeThreeViewCapture:true};
const specimenManifestHash=hashObject(manifest);
const score=37078381,raw=37.078381,threshold=String(reference.thresholdScaled),decision=BigInt(score)>=BigInt(threshold)?"REVIEW_REQUIRED":"PASS";
const evidence={tradeId,policyHash:reference.policyHash,station,role,attempt:1,sessionNonce:nonce,
 specimenManifestHash,modelBundleHash:reference.modelBundleHash,captureProfileHash:reference.captureProfileHash,
 productSpecHash:reference.productSpecHash,requiredViewSetHash:reference.requiredViewSetHash,
 scoreSchemaId:reference.scoreSchemaId,scoreScaled:String(score),contractThresholdScaled:threshold,
 xaiHeatmapSha256:sha(xai),xaiHeatmapBytes:xai.length,xaiHeatmapFileName:"heatmap.png",
 xaiProvenance:"MODEL_GENERATED_PATCHCORE_ANOMALY_MAP_VERIFIED",xaiMethod:"patchcore-anomaly-map-overlay-v1",xaiRawMapSha256:sha(Buffer.from("unit-test-raw-map")),xaiSourceTopSha256:sha(files.TOP)};
const evidencePackageHash=hashObject(evidence);
const report={score_raw:raw,score_scaled:score,decision,model_checkpoint_sha256:"8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854",
 original_image_sha256:sha(files.TOP),original_image_bytes:files.TOP.length,xai_generated_from_model:true,xai_heatmap_sha256:sha(xai),xai_method:evidence.xaiMethod,xai_map_sha256:evidence.xaiRawMapSha256,xai_source_top_sha256:sha(files.TOP),xai_score_scaled:score};
const message={tradeId,role,station,attempt:1,sessionNonce:nonce,policyHash:reference.policyHash,modelBundleHash:reference.modelBundleHash,
 captureProfileHash:reference.captureProfileHash,specimenManifestHash,evidencePackageHash,
 aggregateScoreScaled:String(score),scoreSchemaId:reference.scoreSchemaId,inspectionValidity:0,invalidReason:0,issuedAt:1,validUntil:2};
const bundle={schema:"inspectescrow.modelb-browser-evidence-bundle/1",roleName:"supplier",manifest,specimenManifestHash,
 evidencePackage:evidence,evidencePackageHash,inferenceReport:report,unsigned:{domain,types:stationTypes,message,signature:null,transactionsSent:0}};
const req={expectedRole:"supplier",bundle,images,xaiHeatmap:encoded("heatmap.png",xai)};
const ok=verifyStaticEvidence(req);
assert.equal(ok.evidenceHash,evidencePackageHash);
console.log("XAI_COMMITMENT_ORIGINAL_PASS",evidencePackageHash);
const changed=Buffer.from(xai);changed[100]^=0x01;
assert.throws(()=>verifyStaticEvidence({...req,xaiHeatmap:encoded("heatmap.png",changed)}),/XAI_HEATMAP_HASH_MISMATCH/);
console.log("XAI_TAMPER_DETECTED_PASS");
assert.throws(()=>verifyStaticEvidence({...req,xaiHeatmap:null}),/XAI_EVIDENCE_BYTES_MISSING/);
console.log("XAI_MISSING_FILE_REJECTED_PASS");
const badBundle=structuredClone(bundle);badBundle.evidencePackage.xaiHeatmapSha256=sha(changed);
assert.throws(()=>verifyStaticEvidence({...req,bundle:badBundle}),/XAI_HEATMAP_HASH_MISMATCH/);
console.log("XAI_UNILATERAL_HASH_EDIT_REJECTED_PASS");

const legacyBundle=structuredClone(bundle);
delete legacyBundle.evidencePackage.xaiHeatmapSha256;
delete legacyBundle.evidencePackage.xaiHeatmapBytes;
delete legacyBundle.evidencePackage.xaiHeatmapFileName;
delete legacyBundle.evidencePackage.xaiProvenance;
legacyBundle.evidencePackageHash=hashObject(legacyBundle.evidencePackage);
legacyBundle.unsigned.message.evidencePackageHash=legacyBundle.evidencePackageHash;
assert.equal(verifyStaticEvidence({...req,bundle:legacyBundle,xaiHeatmap:null}).evidenceHash,legacyBundle.evidencePackageHash);
console.log("LEGACY_WITHOUT_XAI_COMPATIBILITY_PASS");
