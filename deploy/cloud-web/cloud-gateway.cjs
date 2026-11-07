"use strict";
// Full original InspectEscrow server, protected by a cloud access gate.
// Cloud-only Model B adapter avoids reliance on the presenter's computer.
const http = require("node:http");
const crypto = require("node:crypto");
const {spawn} = require("node:child_process");
const path = require("node:path");
const PORT = Number(process.env.PORT || 8080);
const LOCAL_UI_PORT=8770, LOCAL_AI_PORT=8766;
const PROJECT_ROOT=process.env.INSPECTESCROW_CLOUD_APP_ROOT||path.join(__dirname,"InspectEscrow_PATCH3_DEPLOY");
const SITE_PATH=path.join(PROJECT_ROOT,".modelb-local","2e1e7f88734d","FINAL_PRESENTATION_UI","server.cjs");
const GATE_CODE=process.env.INSPECTESCROW_WEB_ACCESS_CODE||"";
const AI_TOKEN=process.env.INSPECTESCROW_DEMO_ACCESS_TOKEN||"";
const AI_ORIGIN=process.env.INSPECTESCROW_MODELB_CLOUD_URL||"https://inspectescrow-modelb-live-production.up.railway.app";
const CHECKPOINT="8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854";
const HMAC_KEY=crypto.createHash("sha256").update("INSPECTESCROW_CLOUD_AUTH:").update(GATE_CODE).digest();
const COOKIE="inspectescrow_cloud_auth", SESSION_SECONDS=8*3600;
const attempts=new Map();
const publicRequestBudgets=new Map();
let activeAICalls=0;
function protectPublicActions(req,res,pathname){
 if(!["POST","PUT","PATCH","DELETE"].includes(req.method))return false;
 const ip=String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"unknown").split(",")[0].trim().slice(0,100);
 const heavy=/^\/api\/(?:live\/(?:infer|build|replay)|assist\/(?:inspect|explain)|modelb\/infer|replay\/(?:execute|controlled-score-demo)|e2e\/prepare-|review\/prepare)/.test(pathname);
 const windowMs=10*60*1000,now=Date.now();
 for(const [k,v] of publicRequestBudgets)if(now>=v.end)publicRequestBudgets.delete(k);
 function consume(key,max){
   const v=publicRequestBudgets.get(key)||{count:0,end:now+windowMs};
   if(v.count>=max)return false;
   v.count++;publicRequestBudgets.set(key,v);return true;
 }
 if(heavy&&activeAICalls>=1){res.setHeader("Retry-After","10");send(res,429,{error:"ANOTHER_AI_INFERENCE_RUNNING",message:"검사 중입니다. 앞선 검사가 완료된 뒤 다시 시도하세요."});return true;}
 if(heavy&&(!consume("ai_global",35)||!consume("ai_ip:"+ip,12))){res.setHeader("Retry-After","600");send(res,429,{error:"AI_DEMO_RATE_LIMIT",message:"AI 시연 호출 제한에 도달했습니다."});return true;}
 if(!consume("post_ip:"+ip,150)){res.setHeader("Retry-After","600");send(res,429,{error:"PUBLIC_ACTION_RATE_LIMIT"});return true;}
 if(heavy){
   activeAICalls++;
   let released=false;
   const release=()=>{if(!released){released=true;activeAICalls=Math.max(0,activeAICalls-1);}};
   res.once("finish",release);res.once("close",release);
 }
 return false;
}
let appProcess=null,modelWasUsed=false;
if(AI_TOKEN.length<20){process.stderr.write("CLOUD_AI_TOKEN_MISSING\n");process.exit(1);}
function equal(a,b){const x=Buffer.from(String(a||"")),y=Buffer.from(String(b||""));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function sign(v){return crypto.createHmac("sha256",HMAC_KEY).update(v).digest("hex");}
function session(){const e=String(Math.floor(Date.now()/1000)+SESSION_SECONDS);return e+"."+sign(e);}
function authorized(req){
 const match=(req.headers.cookie||"").split(";").map(v=>v.trim()).find(v=>v.startsWith(COOKIE+"="));
 if(!match)return false;
 const m=match.slice(COOKIE.length+1).match(/^([0-9]{9,12})\.([a-f0-9]{64})$/);
 return !!m&&Number(m[1])>Math.floor(Date.now()/1000)&&equal(m[2],sign(m[1]));
}
function headers(res){res.setHeader("X-Frame-Options","DENY");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","same-origin");res.setHeader("Permissions-Policy","camera=(self),microphone=()");}
function send(res,status,value){headers(res);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(value));}
function loginHTML(error){
 return '<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>InspectEscrow | 접근 인증</title><style>*{box-sizing:border-box}body{margin:0;display:grid;place-items:center;min-height:100vh;background:#eff4f9;color:#132d48;font-family:system-ui,Malgun Gothic,sans-serif}main{width:min(420px,calc(100% - 40px));background:white;border:1px solid #d5e1ea;border-radius:16px;padding:35px;box-shadow:0 14px 40px #102a4415}h1{font-size:23px}p{font-size:14px;color:#687f92;line-height:1.7}input{width:100%;padding:13px;border:1px solid #bacddd;border-radius:8px}label{display:block;margin:25px 0 8px;font-size:13px;font-weight:bold}button{background:#125787;color:white;border:0;border-radius:8px;padding:14px;width:100%;font-weight:bold;margin-top:12px;cursor:pointer}.error{color:#b33;font-weight:bold}</style></head><body><main><b>INSPECTESCROW / SECURE CLOUD</b><h1>통합 웹사이트 접근</h1><p>6개 메뉴·7개 역할의 InspectEscrow 통합 시스템입니다. 팀원에게 전달받은 접근 코드를 입력하세요.</p>'+
 (error?'<p class="error">접근 코드가 올바르지 않거나 시도 횟수가 초과됐습니다.</p>':'')+
 '<form method="POST" action="/_auth/login"><label for="code">시연 접근 코드</label><input id="code" type="password" name="code" required autocomplete="off"><button type="submit">통합 웹사이트 열기</button></form><p>AI 검사: 클라우드 모델 서버 · 거래: 사용자 MetaMask 승인</p></main></body></html>';
}
function showLogin(res,error=false,status=200){headers(res);res.writeHead(status,{"Content-Type":"text/html; charset=utf-8"});res.end(loginHTML(error));}
async function readBytes(req,max){
 const bufs=[];let n=0;
 for await (const b of req){n+=b.length;if(n>max)throw Error("REQUEST_TOO_LARGE");bufs.push(b);}
 return Buffer.concat(bufs);
}
function allowedOrigin(req){
 if(!req.headers.origin)return true;
 try{const o=new URL(req.headers.origin);const allow=process.env.INSPECTESCROW_PUBLIC_ORIGIN||("https://"+req.headers.host);return o.protocol==="https:"&&o.origin===allow;}catch{return false;}
}
async function login(req,res){
 if(!allowedOrigin(req)){console.error("LOGIN_ORIGIN_REJECTED",JSON.stringify({origin:req.headers.origin||null,host:req.headers.host||null,expected:process.env.INSPECTESCROW_PUBLIC_ORIGIN||null}));return send(res,403,{error:"ORIGIN_REJECTED"});}
 const ip=String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"").split(",")[0].trim();
 let prev=attempts.get(ip)||{failed:0,until:Date.now()+15*60*1000};
 if(Date.now()>prev.until)prev={failed:0,until:Date.now()+15*60*1000};
 if(prev.failed>=8)return showLogin(res,true,429);
 let raw;try{raw=await readBytes(req,2048);}catch{return showLogin(res,true,413);}
 const params=new URLSearchParams(raw.toString("utf8"));
 if(!equal(params.get("code"),GATE_CODE)){prev.failed++;attempts.set(ip,prev);return showLogin(res,true,401);}
 attempts.delete(ip);headers(res);
 res.writeHead(303,{"Location":"/","Set-Cookie":COOKIE+"="+session()+"; Path=/; Max-Age="+SESSION_SECONDS+"; Secure; HttpOnly; SameSite=Strict"});res.end();
}
function proxy(req,res){
 if(Number(req.headers["content-length"]||"0")>90*1024*1024)return send(res,413,{error:"UPLOAD_TOO_LARGE"});
 const h={...req.headers,host:"127.0.0.1:"+LOCAL_UI_PORT};delete h.cookie;delete h.authorization;
 const upstream=http.request({hostname:"127.0.0.1",port:LOCAL_UI_PORT,path:req.url,method:req.method,headers:h,timeout:300000},up=>{
   headers(res);const back={...up.headers};delete back["access-control-allow-origin"];delete back["set-cookie"];
   res.writeHead(up.statusCode||502,back);up.pipe(res);
 });
 upstream.on("timeout",()=>upstream.destroy(Error("UPSTREAM_TIMEOUT")));
 upstream.on("error",()=>{if(!res.headersSent)send(res,503,{error:"WEB_BACKEND_UNAVAILABLE"});else res.end();});
 req.pipe(upstream);
}
async function aiRequest(method,pathname,body){
 const h={"X-Demo-Token":AI_TOKEN};
 const response=await fetch(AI_ORIGIN+pathname,{method,headers:h,body,signal:AbortSignal.timeout(240000)});
 if(!response.ok)throw Error("CLOUD_AI_HTTP_"+response.status);
 return response.json();
}

async function advisoryRequest(req,res,url){
  if(req.method!=="POST"||!["/api/assist/inspect","/api/assist/explain"].includes(url.pathname))
    return send(res,405,{error:"METHOD_NOT_ALLOWED"});
  try{
    const isExplain=url.pathname.endsWith("/explain");
    const bytes=await readBytes(req,isExplain?9*1024*1024:26*1024*1024);
    const request=new Request("http://127.0.0.1"+url.pathname,{
      method:"POST",headers:{"content-type":req.headers["content-type"]||""},body:bytes
    });
    const input=await request.formData();
    const label=String(input.get("specimen_label")||"").trim();
    if(label.length<2||label.length>100||/[\x00-\x1f]/.test(label))
      return send(res,400,{error:"INVALID_SPECIMEN_LABEL"});
    const names=isExplain?["top"]:["top","front","side"];
    const originals={};
    for(const name of names){
      const file=input.get(name);
      if(!file||typeof file.arrayBuffer!=="function")return send(res,400,{error:"MISSING_VIEW_"+name.toUpperCase()});
      if(file.size<500||file.size>8*1024*1024)return send(res,413,{error:"INVALID_VIEW_SIZE_"+name.toUpperCase()});
      if(!/\.(?:jpe?g|png)$/i.test(String(file.name||""))||String(file.name).length>160)
        return send(res,400,{error:"INVALID_VIEW_FILENAME_"+name.toUpperCase()});
      const b=Buffer.from(await file.arrayBuffer());
      const jpeg=b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
      const png=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      if(!jpeg&&!png)return send(res,400,{error:"INVALID_VIEW_MAGIC_"+name.toUpperCase()});
      originals[name]={file,sha256:crypto.createHash("sha256").update(b).digest("hex")};
    }
    if(!isExplain&&new Set(names.map(name=>originals[name].sha256)).size!==3)
      return send(res,400,{error:"DUPLICATE_ORIGINAL_VIEW"});
    const form=new FormData();
    for(const name of names)form.append(name,originals[name].file,originals[name].file.name);
    form.append("expected_top_sha256",originals.top.sha256);
    form.append("specimen_label",label);
    const output=await aiRequest("POST",isExplain?"/api/cloud/xai":"/api/cloud/inspect",form);
    if(isExplain){
      if(!output.ok||output.heatmap_generated_from_actual_model!==true||
         output.source_image_sha256!==originals.top.sha256||
         output.checkpoint_sha256!==CHECKPOINT||
         !/^[a-f0-9]{64}$/.test(String(output.heatmap_sha256||"")))
        throw Error("ADVISORY_XAI_PROVENANCE_INVALID");
      const png=Buffer.from(String(output.heatmap_png_base64||""),"base64");
      if(png.length<100||png.length>400000||
         crypto.createHash("sha256").update(png).digest("hex")!==output.heatmap_sha256)
        throw Error("ADVISORY_XAI_HEATMAP_INTEGRITY_FAILED");
      return send(res,200,{
        ok:true,method:"PATCHCORE_NATIVE_ANOMALY_MAP",
        sourceMethod:output.method,modelCheckpointSha256:CHECKPOINT,
        originalTopSha256:output.source_image_sha256,scoreScaled:output.score_scaled,
        decision:output.decision,overlayPngBase64:output.heatmap_png_base64,
        heatmapSha256:output.heatmap_sha256,rawMapSha256:output.raw_anomaly_map_sha256,
        quadrants:Array.isArray(output.quadrants)&&output.quadrants.length===4&&
          output.quadrants.every(q=>typeof q.label==="string"&&Number.isFinite(Number(q.relativeAnomalyIndex))&&
            Number(q.relativeAnomalyIndex)>=0&&Number(q.relativeAnomalyIndex)<=100)?
          output.quadrants:(()=>{throw Error("ADVISORY_XAI_GRAPH_DATA_MISSING")})(),
        quadrantMetric:output.quadrant_metric,quadrantScope:output.quadrant_scope,
        scope:"METAL_NUT_ONLY",offchain:true,
        escrowAmountWei:"0",transactionsSent:0,
        relativeLocalizationOnly:true
      });
    }
    const captures=output.bundle?.manifest?.captureFiles;
    if(!output.ok||!output.completeThreeViewCapture||
      !names.every(name=>captures?.[name.toUpperCase()]?.sha256===originals[name].sha256)||
      output.bundle?.inference?.modelCheckpointSha256!==CHECKPOINT||
      output.bundle?.evidence?.stationSigned!==false||
      output.bundle?.evidence?.onchainSubmitted!==false)
      throw Error("ADVISORY_EVIDENCE_OR_MODEL_BINDING_INVALID");
    return send(res,200,{
      ok:true,scope:"METAL_NUT_ONLY",mode:"OFFCHAIN_ADVISORY_NO_ESCROW",
      decision:output.decision,scoreRaw:output.scoreRaw,scoreScaled:output.scoreScaled,
      thresholdScaled:output.thresholdScaled,bundle:output.bundle,
      originalSha256:Object.fromEntries(names.map(name=>[name.toUpperCase(),originals[name].sha256])),
      originalImageStoredByServer:false,escrowAmountWei:"0",transactionsSent:0,
      caveat:"No product authenticity, physical identity, legal responsibility, signature or onchain claim."
    });
  }catch(error){
    return send(res,422,{error:"ADVISORY_REQUEST_FAILED",detail:String(error.message||error).slice(0,180),transactionsSent:0});
  }
}

function aiError(res,error){send(res,502,{detail:"CLOUD_AI_ADAPTER_ERROR: "+String(error.message||error).slice(0,180)});}
async function adapter(req,res){
 const endpoint=new URL(req.url,"http://127.0.0.1").pathname;
 if(endpoint==="/api/status"&&req.method==="GET"){
   try{
     const h=await aiRequest("GET","/api/cloud/health");
     if(!h.artifactVerified||h.modelCheckpointSha256!==CHECKPOINT)throw Error("MODEL_CHECKPOINT_NOT_VERIFIED");
     return send(res,200,{
       app:"InspectEscrow Live Model B",mode:"OFFCHAIN_INFERENCE_ONLY",
       model_artifact_present:true,checkpoint_sha256:CHECKPOINT,
       threshold_scaled:h.thresholdScaled,threshold_raw:h.thresholdScaled/1e6,model_loaded:modelWasUsed,
       artifact_commitment:{verified:true,checkpoint_sha256:CHECKPOINT},
       integrated_ui_available:true,integrated_ui_path:"/live",
       capture_signature_performed:false,blockchain_transaction_sent:false
     });
   }catch(e){return aiError(res,e);}
 }
 if(endpoint==="/api/infer"&&req.method==="POST"){
   try{
     const bytes=await readBytes(req,9*1024*1024);
     const request=new Request("http://127.0.0.1/api/infer",{
       method:"POST",headers:{"content-type":req.headers["content-type"]||""},body:bytes
     });
     const parts=await request.formData(),image=parts.get("image");
     const expected=String(parts.get("expected_sha256")||"").toLowerCase();
     if(!image||typeof image.arrayBuffer!=="function")return send(res,400,{detail:"IMAGE_REQUIRED"});
     if(image.size<500||image.size>8*1024*1024)return send(res,413,{detail:"CLOUD_IMAGE_LIMIT_8MB"});
     const digest=crypto.createHash("sha256").update(Buffer.from(await image.arrayBuffer())).digest("hex");
     if(!equal(digest,expected))return send(res,400,{detail:"IMAGE_SHA256_MISMATCH"});
     const form=new FormData();
     form.append("top",image,image.name||"top.jpg");
     form.append("expected_top_sha256",digest);
     form.append("specimen_label","MODEL_B_CLOUD_BRIDGE");
     const result=await aiRequest("POST","/api/cloud/inspect",form);
     if(result.bundle?.manifest?.captureFiles?.TOP?.sha256!==digest||
         result.bundle?.inference?.modelCheckpointSha256!==CHECKPOINT)throw Error("INFERENCE_ORIGINAL_BINDING_FAILED");
     const xaiForm=new FormData();
     xaiForm.append("top",image,image.name||"top.jpg");
     xaiForm.append("expected_top_sha256",digest);
     const xai=await aiRequest("POST","/api/cloud/xai",xaiForm);
     if(!xai.heatmap_generated_from_actual_model||
        xai.source_image_sha256!==digest||
        xai.checkpoint_sha256!==CHECKPOINT||
        String(xai.score_scaled)!==String(result.scoreScaled)||
        xai.decision!==result.decision||
        !/^[a-f0-9]{64}$/.test(String(xai.heatmap_sha256||"")))throw Error("XAI_SCORE_OR_INPUT_BINDING_FAILED");
     if(!Array.isArray(xai.quadrants)||xai.quadrants.length!==4||
        xai.quadrants.some(q=>typeof q.label!=="string"||
           !Number.isFinite(q.relativeAnomalyIndex)||q.relativeAnomalyIndex<0||
           q.relativeAnomalyIndex>100||!Number.isSafeInteger(q.pixelCount)||q.pixelCount<1))
       throw Error("XAI_4_QUADRANTS_INVALID_OR_MISSING");
     const xaiBytes=Buffer.from(xai.heatmap_png_base64||"","base64");
     if(xaiBytes.length<100||xaiBytes.length>400000||
        crypto.createHash("sha256").update(xaiBytes).digest("hex")!==xai.heatmap_sha256)
       throw Error("XAI_HEATMAP_BYTES_INVALID");
     modelWasUsed=true;
     return send(res,200,{
       xai_generated_from_model:true,
       xai_heatmap_png_base64:xai.heatmap_png_base64,
       xai_heatmap_sha256:xai.heatmap_sha256,
       xai_heatmap_bytes:xaiBytes.length,
       xai_method:xai.method,
       xai_map_sha256:xai.raw_anomaly_map_sha256,
       xai_quadrants:xai.quadrants,
       xai_quadrant_metric:xai.quadrant_metric,
       xai_quadrant_scope:xai.quadrant_scope,
       xai_source_top_sha256:digest,
       xai_score_scaled:xai.score_scaled,
       xai_model_checkpoint_sha256:CHECKPOINT,
       schema:"InspectEscrow.ModelB.LiveLocalInference.v1",
       status:"OFFCHAIN_DEMO_NOT_ONCHAIN_APPROVED",
       specimen_id:"IE-DEMO-001",specimen_code:"S05",
       specimen_label_source:"USER_SELECTED_UNVERIFIED",view:"TOP",
       file_name:image.name||"top.jpg",original_image_sha256:digest,
       original_image_bytes:image.size,model_checkpoint_sha256:CHECKPOINT,
       preprocessing:"EXIF_transpose_RGB_center_square_700_then_Patchcore_320_center_crop_280",
       score_raw:result.scoreRaw,score_raw_decimal:String(result.scoreRaw),
       score_scaled:result.scoreScaled,score_scale:1000000,score_rounding:"ROUND_HALF_UP",
       threshold_scaled:result.thresholdScaled,threshold_raw:result.thresholdScaled/1e6,
       decision_rule:"score_scaled > threshold_scaled => REVIEW_REQUIRED",decision:result.decision,
       device:result.bundle?.inference?.device||"cpu",
       inference_elapsed_ms:null,inferred_at_utc:new Date().toISOString(),
       station_signed_in_this_app:false,sent_to_blockchain:false
     });
   }catch(e){return aiError(res,e);}
 }
 return send(res,404,{error:"AI_COMPAT_ROUTE_NOT_FOUND"});
}
http.createServer(adapter).listen(LOCAL_AI_PORT,"127.0.0.1",()=>console.log("CLOUD_AI_ADAPTER_LISTENING"));
const projectRoot=PROJECT_ROOT;
const childEnv={
  ...process.env,INSPECTESCROW_PORT:String(LOCAL_UI_PORT),INSPECTESCROW_CHAIN_ID:"11155111",
  INSPECTESCROW_RPC_URL:process.env.INSPECTESCROW_PUBLIC_SEPOLIA_RPC||"https://ethereum-sepolia-rpc.publicnode.com",
  INSPECTESCROW_MODEL_B_BASE:path.dirname(path.dirname(SITE_PATH)),
  INSPECTESCROW_PROJECT_ROOT:projectRoot
};
appProcess=spawn(process.execPath,[SITE_PATH],{env:childEnv,stdio:"inherit"});
appProcess.on("exit",(code,signal)=>{console.error("ORIGINAL_WEB_PROCESS_EXIT",code,signal);process.exit(1);});
function shutdown(){if(appProcess)appProcess.kill("SIGTERM");process.exit(0);}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
http.createServer(async(req,res)=>{
 const url=new URL(req.url,"http://localhost");
 if(url.pathname==="/healthz"){
   try{
     const check=await fetch("http://127.0.0.1:"+LOCAL_UI_PORT+"/api/ping",{signal:AbortSignal.timeout(1800)});
     return send(res,check.ok?200:503,{ok:check.ok});
   }catch{return send(res,503,{ok:false});}
 }
 if(url.pathname==="/_auth/login"||url.pathname==="/_auth/logout"){
   headers(res);res.writeHead(303,{"Location":"/"});return res.end();
 }
 if(["POST","PUT","PATCH","DELETE"].includes(req.method)&&!allowedOrigin(req))
   return send(res,403,{error:"CROSS_ORIGIN_REJECTED"});
 if(protectPublicActions(req,res,url.pathname))return;
 if(url.pathname.startsWith("/api/assist/"))return advisoryRequest(req,res,url);
 return proxy(req,res);
}).listen(PORT,"0.0.0.0",()=>console.log("INSPECTESCROW_INTEGRATED_CLOUD_GATEWAY_READY",PORT));
