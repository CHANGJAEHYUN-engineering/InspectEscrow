"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ui=__dirname, project=path.resolve(ui,"..","..",".."), workspace=path.resolve(project,"..");
const outBase=path.join(project,"FINAL_WEB_RELEASE_V2_BUILD"), releaseName="InspectEscrow_FINAL_WEB_HANDOFF_20261031", out=path.join(outBase,releaseName);
if(fs.existsSync(out))throw Error("RELEASE_OUTPUT_ALREADY_EXISTS: "+out);
const copy=(src,dst)=>{if(!fs.existsSync(src))throw Error("MISSING_SOURCE: "+src);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);};
const copyTree=(src,dst,filter=()=>true)=>{for(const entry of fs.readdirSync(src,{withFileTypes:true})){const a=path.join(src,entry.name),b=path.join(dst,entry.name);if(!filter(a,entry))continue;if(entry.isDirectory()){fs.mkdirSync(b,{recursive:true});copyTree(a,b,filter);}else copy(a,b);}};
fs.mkdirSync(out,{recursive:true});
const targetProject=path.join(out,"InspectEscrow_PATCH3_DEPLOY"), targetUI=path.join(targetProject,".modelb-local","2e1e7f88734d","FINAL_PRESENTATION_UI");
const allowedExt=new Set([".html",".css",".js",".cjs",".ps1",".bat",".md",".json",".txt"]);
for(const entry of fs.readdirSync(ui,{withFileTypes:true})){
  if(entry.isFile()&&allowedExt.has(path.extname(entry.name).toLowerCase())&&!entry.name.startsWith("PREVIEW_"))copy(path.join(ui,entry.name),path.join(targetUI,entry.name));
}
copyTree(path.join(ui,"STAGE_ASSETS"),path.join(targetUI,"STAGE_ASSETS"));
for(const name of fs.readdirSync(path.resolve(ui,".."))){const src=path.resolve(ui,"..",name);if(fs.statSync(src).isFile()&&path.extname(name).toLowerCase()===".json")copy(src,path.join(targetProject,".modelb-local","2e1e7f88734d",name));}
copyTree(path.resolve(ui,"..","NEW_S05_PREP_HANDOFF_NO_TX"),path.join(targetProject,".modelb-local","2e1e7f88734d","NEW_S05_PREP_HANDOFF_NO_TX"));
copyTree(path.resolve(ui,"..","..","REVIEW_TRADE_CANDIDATE_49bf5596"),path.join(targetProject,".modelb-local","REVIEW_TRADE_CANDIDATE_49bf5596"));
copyTree(path.join(project,".patch3-build"),path.join(targetProject,".patch3-build"));
copy(path.join(project,"package.json"),path.join(targetProject,"package.json"));copy(path.join(project,"package-lock.json"),path.join(targetProject,"package-lock.json"));
for(const rel of ["packages/phase3c_hardening_20261023/contracts/InspectEscrowPatch3.sol","packages/phase3c_hardening_20261023/contracts/CredentialRegistryPatch3.sol","packages/modelb_patch3_bridge_v1/results/MODEL_B_LOCAL_E2E_RESULTS.json"]){copy(path.join(project,rel),path.join(targetProject,rel));}
const modelSrc=path.join(workspace,"InspectEscrow_Live_Demo_v1_FULL","InspectEscrow_Live_Demo_v1"),modelDst=path.join(out,"InspectEscrow_Live_Demo_v1_FULL","InspectEscrow_Live_Demo_v1");
for(const name of ["server.py","server_specimen_v2.py","requirements.txt","requirements-lock-windows.txt","README_KO.md","START_WINDOWS.bat"])copy(path.join(modelSrc,name),path.join(modelDst,name));
copyTree(path.join(modelSrc,"static"),path.join(modelDst,"static"));copyTree(path.join(modelSrc,"model"),path.join(modelDst,"model"));
for(const name of ["S03_normal1.jpg.jpg","S03_normal2.jpg.jpg","S03_normal3.jpg.jpg","S03_deep_scratch1.jpg.jpg","S03_deep_scratch2.jpg.jpg","S03_deep_scratch3.jpg.jpg"]){copy(path.join(workspace,name),path.join(out,name));}
copyTree(path.join(workspace,"NEW_S05_ONLY_2e1e7f88"),path.join(out,"NEW_S05_ONLY_2e1e7f88"));
for(const name of ["README_FIRST_KO.md","INSTALL_WINDOWS_KO.md","ENVIRONMENT_CONFIGURATION_KO.md","WEBSITE_USER_GUIDE_KO.md","TEAMMATE_HANDOFF_KO.md","TEST_REPORT_KO.md","FINAL_WEB_RELEASE_V2_REPORT_KO.md","GITHUB_PUBLIC_ALLOWLIST_KO.md","GITHUB_PUBLIC_ALLOWLIST.json","ENVIRONMENT_EXAMPLE.ps1","INSTALL_DEPENDENCIES.ps1","START_INSPECTESCROW.ps1","CHECK_INSPECTESCROW.ps1","STOP_INSPECTESCROW.ps1"]){copy(path.join(ui,name),path.join(out,name));}
const hash=f=>crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"),files=[];
const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files.push(p);}};walk(out);
const forbidden=files.filter(f=>/\.(key|pem|p12|pfx|keystore|env)$/i.test(f)||/node_modules|\.venv|browser.profile|mnemonic/i.test(f));if(forbidden.length)throw Error("FORBIDDEN_RELEASE_FILE: "+forbidden.join(","));
const rows=files.map(f=>({path:path.relative(out,f).replaceAll("\\","/"),bytes:fs.statSync(f).size,sha256:hash(f)})).sort((a,b)=>a.path.localeCompare(b.path));
const manifest={schema:"inspectescrow.final-web-release-v2/1",generatedAtUtc:new Date().toISOString(),releaseName,sourceCommit:null,files:rows,filesCount:rows.length,totalBytes:rows.reduce((n,x)=>n+x.bytes,0),modelArchiveSha256:"8102cedf082c0d8553ad03372d6dd125daab895ed56d2cad77c4ac0342b0206d",checkpointSha256:"8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854",sepoliaTransactionsSentByBuild:0,security:{privateKeysIncluded:false,mnemonicsIncluded:false,browserProfilesIncluded:false,nodeModulesIncluded:false,venvIncluded:false},truthBoundary:["Archived S03/S05 fixtures are not new captures","Local Anvil results are not Sepolia transactions","Every real wallet action requires user approval"]};
fs.writeFileSync(path.join(out,"RELEASE_MANIFEST.json"),JSON.stringify(manifest,null,2)+"\n");
fs.writeFileSync(path.join(out,"RELEASE_SHA256.txt"),rows.map(x=>`${x.sha256} *${x.path}`).join("\n")+"\n");
console.log(JSON.stringify({output:out,files:rows.length,totalBytes:manifest.totalBytes,manifest:path.join(out,"RELEASE_MANIFEST.json")},null,2));
