"use strict";
const {preflightBuyer,makeBuyerBundle,sha256}=require("./evidence-bridge.cjs");
function json(res,code,value){res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(value));}
function requestBody(req,limit=32*1024*1024){return new Promise((resolve,reject)=>{let len=0;const chunks=[];
  req.on("data",chunk=>{len+=chunk.length;if(len>limit){reject(Error("UPLOAD_TOO_LARGE"));req.destroy();return;}chunks.push(chunk);});
  req.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))}catch(e){reject(Error("INVALID_JSON"));}});
  req.on("error",reject);
});}
function filesFromJSON(body){
  const out={};for(const view of ["TOP","FRONT","SIDE"]){
    const item=body?.images?.[view];
    if(!item||typeof item.name!=="string"||typeof item.data!=="string"||item.name.length<1||item.name.length>120||/[\\/\x00-\x1f]/.test(item.name))throw Error("INVALID_IMAGE_META_"+view);
    if(item.data.length>29*1024*1024||item.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(item.data))throw Error("INVALID_IMAGE_BASE64_"+view);
    out[view]={name:item.name,bytes:Buffer.from(item.data,"base64")};
  }return out;
}
async function rerunModelB(image){
  const form=new FormData();form.append("image",new Blob([image.bytes],{type:/\.png$/i.test(image.name)?"image/png":"image/jpeg"}),image.name);
  form.append("expected_sha256",sha256(image.bytes));form.append("specimen_id","IE-DEMO-001");
  const r=await fetch("http://127.0.0.1:8766/api/infer",{method:"POST",body:form,signal:AbortSignal.timeout(180000)});
  const data=await r.json();if(!r.ok)throw Error("MODEL_B_REINFERENCE_FAILED: "+JSON.stringify(data).slice(0,200));return data;
}
async function handle(req,res,ctx,url){
 const pathname=url.pathname;
 if(pathname==="/api/review/preflight"){
   if(req.method!=="GET")return json(res,405,{error:"READ_ONLY_GET_ONLY"});
   const tradeId=url.searchParams.get("tradeId")||"";
   try{return json(res,200,await preflightBuyer({contract:ctx.contract,provider:ctx.provider,tradeId}));}
   catch(e){return json(res,503,{ok:false,reason:"SEPOLIA_RPC_UNAVAILABLE",detail:String(e.shortMessage||e.message).slice(0,180)});}
 }
 if(pathname==="/api/review/prepare"){
   if(req.method!=="POST")return json(res,405,{error:"POST_ONLY"});
   const origin=req.headers.origin;
   if(origin&&origin!=="http://127.0.0.1:8770")return json(res,403,{error:"ORIGIN_REJECTED"});
   if(req.headers["x-inspectescrow-local"]!=="1"||String(req.headers["content-type"]||"").split(";")[0]!=="application/json")return json(res,403,{error:"LOCAL_UI_HEADER_REQUIRED"});
   try{
     const body=await requestBody(req);
     const tradeId=String(body?.tradeId||"");
     const check=await preflightBuyer({contract:ctx.contract,provider:ctx.provider,tradeId});
     if(!check.ok)return json(res,409,{ok:false,reason:check.reason,details:check});
     const images=filesFromJSON(body);
     const topHash=sha256(images.TOP.bytes);
     if(topHash!==body?.report?.original_image_sha256)throw Error("ORIGINAL_IMAGE_HASH_MISMATCH");
     const fresh=await rerunModelB(images.TOP);
     if(fresh.original_image_sha256!==topHash||fresh.score_scaled!==body.report.score_scaled||fresh.decision!==body.report.decision||fresh.model_checkpoint_sha256!==body.report.model_checkpoint_sha256)throw Error("LIVE_INFERENCE_REPLAY_MISMATCH");
     if(fresh.decision!=="REVIEW_REQUIRED")throw Error("BUYER_REVIEW_REQUIRED_FOR_THIS_PATH");
     const recheck=await preflightBuyer({contract:ctx.contract,provider:ctx.provider,tradeId});
     if(!recheck.ok)return json(res,409,{ok:false,reason:"PREFLIGHT_CHANGED_DURING_PREPARATION",details:recheck});
     const {hexlify,randomBytes}=require("ethers");
     const bundle=makeBuyerBundle({tradeId,images,report:body.report,nonce:hexlify(randomBytes(32)),capturedAtUtc:String(body.capturedAtUtc||new Date().toISOString()),label:String(body.label||"BUYER-LIVE-REVIEW").slice(0,120)});
     return json(res,200,{ok:true,stage:"UNSIGNED_EVIDENCE_PREPARED_ONLY",preflight:recheck,scoreScaled:body.report.score_scaled,decision:body.report.decision,sourceImageSHA256:topHash,bundle,
       next:"Save this bundle plus original TOP/FRONT/SIDE images. A fresh Station signature and Actor staticCall/transaction are separate explicit user actions. No wallet transaction was sent."});
   }catch(e){if(!res.headersSent)return json(res,422,{ok:false,reason:String(e.message).slice(0,240)});}
 }
 return false;
}
module.exports={handle};
