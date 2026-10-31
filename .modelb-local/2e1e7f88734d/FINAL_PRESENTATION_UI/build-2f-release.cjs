"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const release=require("./release-endpoints.cjs");
const out=path.join(__dirname,"2F_RELEASE_MANIFEST.json");
const hash=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const packageArg=process.argv.find(x=>x.toLowerCase().endsWith(".zip"));
if(packageArg){
  if(!fs.existsSync(out))throw Error("RUN_MANIFEST_BUILD_FIRST");
  const packagePath=path.resolve(packageArg);
  if(!fs.existsSync(packagePath))throw Error("PACKAGE_NOT_FOUND: "+packagePath);
  const packageProof={schema:"inspectescrow.release-package/2f-1",generatedAtUtc:new Date().toISOString(),packagePath,bytes:fs.statSync(packagePath).size,sha256:hash(packagePath),sourceManifest:out,sourceManifestSha256:hash(out),actualSepoliaTransactionsCreated:0};
  const proofPath=path.join(__dirname,"2F_RELEASE_PACKAGE_SHA256.json");
  fs.writeFileSync(proofPath,JSON.stringify(packageProof,null,2)+"\n");
  console.log(JSON.stringify({packageProof:proofPath,packageSha256:packageProof.sha256,sourceManifestSha256:packageProof.sourceManifestSha256},null,2));
}else{
  const manifest=release.buildReleaseManifest();
  if(!manifest.complete)throw Error("RELEASE_ALLOWLIST_INCOMPLETE: "+manifest.files.filter(x=>!x.exists).map(x=>x.path).join(","));
  const output={...manifest,verification:{allFilesPresent:true,secretAndModelDenylistApplied:true,actualSepoliaTransactionsCreatedByPackaging:0},packageInstructions:"Archive exactly the files in this manifest plus this manifest; do not include models, original evidence, browser profiles, keys, env files, or the surrounding .modelb-local tree."};
  fs.writeFileSync(out,JSON.stringify(output,null,2)+"\n");
  console.log(JSON.stringify({output:out,files:output.files.length,manifestSha256:hash(out)},null,2));
}
