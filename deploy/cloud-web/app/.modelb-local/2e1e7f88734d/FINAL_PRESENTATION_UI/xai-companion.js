"use strict";
(()=>{
  const SCHEMA="InspectEscrow.XAI.EvidenceCompanion.v1";
  const WRAPPER="InspectEscrow.XAI.OfflineSidecar.v1";
  function validHash(s){return typeof s==="string"&&/^0x?[0-9a-f]{64}$/i.test(s);}
  function eq(a,b){return String(a??"").toLowerCase()===String(b??"").toLowerCase();}
  function xaiChecks(xai,bundle,verified){
    const errors=[];
    const add=(ok,name)=>{if(!ok)errors.push(name);};
    add(bundle?.schema==="inspectescrow.modelb-browser-evidence-bundle/1","BUNDLE_SCHEMA");
    add(!!xai&&xai.method==="PATCHCORE_NATIVE_ANOMALY_MAP","XAI_METHOD");
    add(eq(xai?.originalTopSha256,bundle?.manifest?.captureFiles?.TOP?.sha256),"TOP_SHA256");
    add(eq(xai?.modelCheckpointSha256,bundle?.evidencePackage?.modelCheckpointSha256),"MODEL_CHECKPOINT_SHA256");
    add(eq(xai?.scoreScaled,bundle?.evidencePackage?.scoreScaled),"SCORE_SCALED");
    add(eq(xai?.decision,bundle?.evidencePackage?.offchainDecision),"AI_DECISION");
    add(xai?.calibratedDefectProbability===null||xai?.calibratedDefectProbability===undefined,"NOT_PROBABILITY");
    add(typeof xai?.overlayPngBase64==="string"&&xai.overlayPngBase64.length>100&&xai.overlayPngBase64.length<2000000&&
      /^[A-Za-z0-9+/]*={0,2}$/.test(xai.overlayPngBase64),"XAI_OVERLAY");
    add(Array.isArray(xai?.quadrants)&&xai.quadrants.length===4&&
      xai.quadrants.every(v=>Number.isFinite(Number(v.relativeAnomalyIndex))&&Number(v.relativeAnomalyIndex)>=0&&Number(v.relativeAnomalyIndex)<=100),"XAI_QUADRANTS");
    if(verified){
      add(eq(bundle?.unsigned?.message?.tradeId,verified.tradeId),"VERIFIED_TRADE_ID");
      add(eq(bundle?.roleName,verified.roleName),"VERIFIED_ROLE");
      add(eq(bundle?.evidencePackageHash,verified.hashes?.evidencePackageHash),"VERIFIED_EVIDENCE_HASH");
      add(eq(bundle?.specimenManifestHash,verified.hashes?.specimenManifestHash),"VERIFIED_MANIFEST_HASH");
      add(eq(xai?.originalTopSha256,verified.images?.TOP?.sha256),"VERIFIED_ORIGINAL_TOP");
      add(eq(xai?.modelCheckpointSha256,verified.inference?.checkpointSha256),"VERIFIED_MODEL");
      add(eq(xai?.scoreScaled,verified.inference?.scoreScaled),"VERIFIED_SCORE");
      add(eq(xai?.decision,verified.inference?.decision),"VERIFIED_DECISION");
    }
    return {ok:errors.length===0,errors};
  }
  function makePayload(xai,bundle){
    const validity=xaiChecks(xai,bundle);
    if(!validity.ok)throw Error("XAI_EVIDENCE_LINK_MISMATCH: "+validity.errors.join(", "));
    return {
      schema:SCHEMA,
      tradeId:bundle.unsigned.message.tradeId,
      roleName:bundle.roleName,
      sessionId:bundle.manifest.sessionId,
      evidencePackageHash:bundle.evidencePackageHash,
      specimenManifestHash:bundle.specimenManifestHash,
      originalTopSha256:xai.originalTopSha256,
      modelCheckpointSha256:xai.modelCheckpointSha256,
      scoreScaled:String(xai.scoreScaled),
      decision:xai.decision,
      xai,
      signed:false,onchainSubmitted:false,legalConclusion:false,
      limitation:"XAI is an unsigned offchain explanatory sidecar, not part of the signed Evidence Package Hash. Matching content does not attest who originally generated this XAI."
    };
  }
  async function sha256(payload){
    const b=new TextEncoder().encode(JSON.stringify(payload));
    const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",b));
    return [...hash].map(x=>x.toString(16).padStart(2,"0")).join("");
  }
  async function wrap(xai,bundle){
    const payload=makePayload(xai,bundle);
    return {schema:WRAPPER,payload,localContentSha256:await sha256(payload)};
  }
  async function checkSidecar(sidecar,bundle,verified=null){
    if(sidecar?.schema!==WRAPPER||sidecar.payload?.schema!==SCHEMA)
      return {ok:false,errors:["SIDECAR_SCHEMA"]};
    const p=sidecar.payload;
    const actual=await sha256(p);
    if(!eq(actual,sidecar.localContentSha256))return {ok:false,errors:["SIDECAR_CONTENT_CHANGED"]};
    const check=xaiChecks(p.xai,bundle,verified);
    const errors=[...check.errors];
    const add=(condition,reason)=>{if(!condition)errors.push(reason);};
    add(eq(p.tradeId,bundle?.unsigned?.message?.tradeId),"SIDECAR_TRADE_ID");
    add(eq(p.roleName,bundle?.roleName),"SIDECAR_ROLE");
    add(eq(p.sessionId,bundle?.manifest?.sessionId),"SIDECAR_SESSION");
    add(eq(p.evidencePackageHash,bundle?.evidencePackageHash),"SIDECAR_EVIDENCE_PACKAGE_HASH");
    add(eq(p.specimenManifestHash,bundle?.specimenManifestHash),"SIDECAR_MANIFEST_HASH");
    add(eq(p.originalTopSha256,p.xai?.originalTopSha256),"SIDECAR_TOP_SHA256");
    add(eq(p.modelCheckpointSha256,p.xai?.modelCheckpointSha256),"SIDECAR_CHECKPOINT");
    add(eq(p.scoreScaled,p.xai?.scoreScaled),"SIDECAR_SCORE");
    add(eq(p.decision,p.xai?.decision),"SIDECAR_DECISION");
    return {ok:errors.length===0,errors,sha256:actual};
  }
  window.InspectEscrowXAI={SCHEMA,WRAPPER,xaiChecks,makePayload,wrap,checkSidecar};
})();