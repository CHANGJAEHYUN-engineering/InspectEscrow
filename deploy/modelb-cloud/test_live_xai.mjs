import fs from "node:fs";
import crypto from "node:crypto";
const fn=new URL("./xai_smoke_nut.png",import.meta.url);
const data=fs.readFileSync(fn);
const sha=crypto.createHash("sha256").update(data).digest("hex");
const token=process.env.INSPECTESCROW_DEMO_ACCESS_TOKEN;
if(!token || token.length<20)throw Error("RAILWAY_MODEL_ACCESS_TOKEN_UNAVAILABLE");
const form=new FormData();
form.append("top",new Blob([data],{type:"image/png"}),"xai_smoke_nut.png");
form.append("expected_top_sha256",sha);
const res=await fetch("https://inspectescrow-modelb-live-production.up.railway.app/api/cloud/xai",
 {method:"POST",headers:{"X-Demo-Token":token},body:form,signal:AbortSignal.timeout(240000)});
const json=await res.json();
if(!res.ok)throw Error("MODEL_XAI_HTTP_"+res.status+" "+String(json.detail||"").slice(0,150));
const png=Buffer.from(json.heatmap_png_base64||"","base64");
const computed=crypto.createHash("sha256").update(png).digest("hex");
if(json.heatmap_sha256!==computed || json.source_image_sha256!==sha || png.length<100)
 throw Error("MODEL_XAI_BYTES_OR_SOURCE_MISMATCH");
if(!Array.isArray(json.quadrants)||json.quadrants.length!==4||json.quadrants.some(q=>!Number.isFinite(q.relativeAnomalyIndex)||q.relativeAnomalyIndex<0||q.relativeAnomalyIndex>100||q.pixelCount<1))throw Error("XAI_QUADRANTS_DATA_MISSING_OR_INVALID");
console.log("XAI_QUADRANT_DATA_PASS",JSON.stringify(json.quadrants),json.quadrant_metric);
console.log(JSON.stringify({ok:true,status:res.status,scoreScaled:json.score_scaled,decision:json.decision,method:json.method,heatmapBytes:png.length,heatmapSha256:computed,sourceMatched:true,modelDerived:json.heatmap_generated_from_actual_model}));
fs.writeFileSync(new URL("./xai_smoke_result.png",import.meta.url),png);