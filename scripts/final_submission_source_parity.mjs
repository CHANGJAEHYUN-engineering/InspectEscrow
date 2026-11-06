#!/usr/bin/env node
/**
 * InspectEscrow organizer-submission source parity preflight.
 * Read-only. Does not touch wallets, blockchain, tokens, or deployed services.
 * Usage: node scripts/final_submission_source_parity.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dirname,"..");
const website="https://inspectescrow-integrated-web-production.up.railway.app";
const webRoot="deploy/cloud-web";
const files=[
  ["cloud-gateway.cjs",null],
  ["Dockerfile",null],
  [".dockerignore",null],
  ["app/package.json",null],
  ["app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/platform.html","/"],
  ["app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/platform.js","/platform.js"],
  ["app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/roles.js","/roles.js"],
  ["app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/replay.js","/replay.js"],
  ["app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/resolution.js","/resolution.js"],
  ["app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/replay-endpoints.cjs",null],
  ["app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/resolution-endpoints.cjs",null],
  ["app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/server.cjs",null],
  ["app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/enterprise-tools.css","/enterprise-tools.css"]
];
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
const localResults=[];
const deadline=AbortSignal.timeout(18000);
let fail=0;
console.log("InspectEscrow final submission source-parity preflight");
console.log("This checker only reads Git files and public website assets. No transactions.");
for(const [relative,remotePath] of files){
  const p=path.join(root,webRoot,...relative.split("/"));
  const exists=fs.existsSync(p);
  const record={file:relative,localExists:exists};
  if(!exists){record.status="MISSING_LATEST_CLOUD_SOURCE";fail++;localResults.push(record);continue;}
  const content=fs.readFileSync(p);record.sha256=hash(content);
  if(/\.(?:js|cjs|mjs)$/.test(relative)){
    try{execFileSync(process.execPath,["--check",p],{stdio:"pipe",timeout:12000});record.syntax="PASS";}
    catch(e){record.syntax="FAIL";record.status="SYNTAX_ERROR";fail++;}
  }
  if(remotePath){
    try{
      const url=new URL(remotePath,website),r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(18000)});
      if(!r.ok){record.status="PUBLIC_HTTP_"+r.status;fail++;}
      else{const remoteBuffer=Buffer.from(await r.arrayBuffer());record.remoteSha256=hash(remoteBuffer);record.status=record.remoteSha256===record.sha256?"MATCH":"DEPLOYED_CODE_MISMATCH";if(record.status!=="MATCH")fail++;}
    }catch(e){record.status="NETWORK_VERIFICATION_ERROR";record.error=String(e.message||e).slice(0,140);fail++;}
  }else if(!record.status)record.status="LOCAL_SOURCE_EXISTS_ONLY";
  localResults.push(record);
}
let health={};
try{
  const r=await fetch(new URL("/healthz",website),{signal:AbortSignal.timeout(15000)});
  const b=await r.json();health={httpStatus:r.status,body:b};if(!r.ok||b?.ok!==true)fail++;
}catch(e){health={status:"FAIL",reason:String(e.message||e)};fail++;}
const result={checkedAt:new Date().toISOString(),website,repository:root,sourceRoot:path.join(root,webRoot),results:localResults,health,failures:fail,secretHandling:"No secret scanning is complete until human review of all tracked and untracked files.",modelBWeights:"Model weights/images are intentionally excluded and must be provided under the applicable license.",onchainTransactionsSent:0};
const out=path.join(root,"final-submission-source-parity-report.json");
fs.writeFileSync(out,JSON.stringify(result,null,2)+os.EOL,"utf8");
console.log(JSON.stringify({failures:fail,checked:files.length,report:out,health},null,2));
if(fail){console.error("NOT SUBMISSION-CODE-READY: restore latest cloud source and resolve all mismatches before claiming source parity.");process.exitCode=1;}
else console.log("SOURCE_ASSET_PARITY_PASS; separately verify Model B server source, model artifacts and end-to-end browser UX.");
