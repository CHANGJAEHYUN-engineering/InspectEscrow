const fs=require("node:fs");const path=require("node:path");const crypto=require("node:crypto");
const file=path.join(__dirname,"..","NEW_S05_PREP_HANDOFF_NO_TX","S05_SUPPLIER_TOP_20261029_01.jpg.jpg");
(async()=>{
const bytes=fs.readFileSync(file),sha=crypto.createHash("sha256").update(bytes).digest("hex");
const form=new FormData();form.append("image",new Blob([bytes],{type:"image/jpeg"}),path.basename(file));form.append("expected_sha256",sha);form.append("specimen_id","IE-DEMO-001");
console.log("INFERENCE_SMOKE_STARTED",JSON.stringify({bytes:bytes.length,sha256:sha}));
const start=Date.now();const resp=await fetch("http://127.0.0.1:8770/api/modelb/infer",{method:"POST",body:form,signal:AbortSignal.timeout(180000)});const json=await resp.json();
if(!resp.ok||json.original_image_sha256!==sha||!["PASS","REVIEW_REQUIRED"].includes(json.decision))throw Error("INFERENCE_SMOKE_FAIL "+JSON.stringify(json));
console.log("INFERENCE_SMOKE_PASS",JSON.stringify({http:resp.status,decision:json.decision,score:json.score_raw,threshold:json.threshold_raw,shaMatch:true,durationSec:(Date.now()-start)/1000,checkpoint:json.model_checkpoint_sha256}));
fs.writeFileSync(path.join(__dirname,"SMOKE_TEST_MODEL_B.json"),JSON.stringify({type:"Archived source image retest - NOT a newly captured live image",checkedAt:new Date().toISOString(),http:resp.status,durationSec:(Date.now()-start)/1000,result:json},null,2));
})().catch(e=>{console.error("INFERENCE_SMOKE_FAIL",e.message);process.exitCode=1;});
