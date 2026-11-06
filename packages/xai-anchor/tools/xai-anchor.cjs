#!/usr/bin/env node
"use strict";
/*
  InspectEscrow XAI Anchor command-line helper.
  read-only commands: inspect, preflight, verify
  send command is only executed with explicit --broadcast and an encrypted
  Foundry --account (password entered locally, never stored by this script).
*/
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const child = require("node:child_process");

const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const ORIGINAL_ESCROW = "0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905";
const CHAIN_ID = 11155111;
const WRAPPER = "InspectEscrow.XAI.OfflineSidecar.v1";
const CONTENT = "InspectEscrow.XAI.EvidenceCompanion.v1";
const HASH = /^0x[0-9a-fA-F]{64}$/;

function fail(message) { throw Error(message); }
function getOption(flag, defaultValue) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? defaultValue : process.argv[i + 1] ?? fail("Missing "+flag);
}
function expectHash(value, field) {
  if(!HASH.test(value))fail("INVALID_"+field);
  return value.toLowerCase();
}
function checksum(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}
function checkSidecar(filename) {
  if(!filename)fail("Specify --file path/to/report.sidecar.json");
  const bytes=fs.readFileSync(filename);
  if(bytes.length>3*1024*1024)fail("SIDECAR_FILE_TOO_LARGE");
  const data=JSON.parse(bytes.toString("utf8"));
  if(data.schema!==WRAPPER||data.payload?.schema!==CONTENT)fail("INVALID_SIDECAR_SCHEMA");
  const p=data.payload,x=p.xai;
  const actual=checksum(p);
  if(!/^[0-9a-f]{64}$/.test(data.localContentSha256)||actual!==data.localContentSha256.toLowerCase())
    fail("SIDECAR_PAYLOAD_SHA256_MISMATCH");
  if(p.roleName!=="supplier"&&p.roleName!=="buyer")fail("INVALID_ROLE");
  const tradeId=expectHash(p.tradeId, "TRADE_ID");
  const evidenceHash=expectHash(p.evidencePackageHash,"EVIDENCE_HASH");
  const topHash=expectHash("0x"+p.originalTopSha256.replace(/^0x/,""),"TOP_HASH");
  const modelHash=expectHash("0x"+p.modelCheckpointSha256.replace(/^0x/,""),"MODEL_HASH");
  expectHash("0x"+p.specimenManifestHash.replace(/^0x/,""),"MANIFEST_HASH");
  if(!x||x.method!=="PATCHCORE_NATIVE_ANOMALY_MAP"||
     String(x.originalTopSha256).replace(/^0x/i,"").toLowerCase()!==topHash.slice(2)||
     String(x.modelCheckpointSha256).replace(/^0x/i,"").toLowerCase()!==modelHash.slice(2)||
     String(x.scoreScaled)!==String(p.scoreScaled)||
     x.decision!==p.decision||p.signed!==false||p.onchainSubmitted!==false)
    fail("SIDECAR_XAI_BINDING_MISMATCH");
  if(!Array.isArray(x.quadrants)||x.quadrants.length!==4||
      typeof x.overlayPngBase64!=="string"||x.overlayPngBase64.length<100)
    fail("SIDECAR_XAI_DATA_MISSING");
  return {tradeId,role:p.roleName==="supplier"?0:1,roleName:p.roleName,
    evidenceHash,xaiHash:"0x"+actual,modelHash,topHash,
    originalFile:path.resolve(filename),report:p};
}
function cast(...args) {
  const result=child.spawnSync("cast",args,{encoding:"utf8",timeout:25000,windowsHide:true});
  if(result.error)fail("CAST_ERROR "+result.error.message);
  if(result.status!==0)fail("CAST_FAILED "+args[0]+" "+String(result.stderr||result.stdout).slice(0,450));
  return result.stdout.trim();
}
const command=process.argv[2]||"help";
const file=getOption("--file",null);
const rpc=getOption("--rpc",DEFAULT_RPC);
const address=getOption("--anchor",null);
const ESCROW=getOption("--escrow",ORIGINAL_ESCROW);
const broadcast=process.argv.includes("--broadcast");

try {
  if(command==="help"){
    process.stdout.write("Usage: node tools/xai-anchor.cjs inspect --file report.sidecar.json\n"+
      "       node tools/xai-anchor.cjs preflight --file report.sidecar.json --anchor 0x...\n"+
      "       node tools/xai-anchor.cjs verify --file report.sidecar.json --anchor 0x...\n"+
      "       node tools/xai-anchor.cjs send --file report.sidecar.json --anchor 0x... --account name --broadcast\n"+
      "Never provide a private key to this script. Enter the encrypted account password locally.\n");
    process.exit(0);
  }
  const v=checkSidecar(file);
  const publicFields={tradeId:v.tradeId,role:v.roleName,evidencePackageHash:v.evidenceHash,
    xaiSha256:v.xaiHash,originalTopSha256:v.topHash,modelCheckpointSha256:v.modelHash};
  if(command==="inspect"){
    console.log(JSON.stringify({ok:true,scope:"OFFCHAIN_SIDE_CAR_HASH_CHECK",...publicFields},null,2));
    process.exit(0);
  }
  const chain=Number(cast("chain-id","--rpc-url",rpc));
  if(chain!==CHAIN_ID)fail("WRONG_NETWORK_EXPECTED_SEPOLIA_11155111");
  if(!address)fail("Specify deployed contract --anchor 0x...");
  if(!/^0x[0-9a-fA-F]{40}$/.test(address))fail("INVALID_ANCHOR_ADDRESS");
  const code=cast("code",address,"--rpc-url",rpc);
  if(code==="0x"||code.length<16)fail("ANCHOR_CONTRACT_NOT_DEPLOYED");
  const deployedEscrow=cast("call",address,"escrow()(address)","--rpc-url",rpc).trim();
  if(deployedEscrow.toLowerCase()!==ESCROW.toLowerCase())fail("WRONG_ESCROW_IN_ANCHOR");
  const terms=cast("call",ESCROW,
    "getTradeTerms(bytes32)(bytes32,address,address)",
    v.tradeId,"--rpc-url",rpc).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(terms.length<3||terms[0].toLowerCase()!==v.tradeId.toLowerCase())fail("UNKNOWN_OR_MISMATCHED_TRADE");
  const actor=terms[v.role===0?1:2];
  const existing=cast("call",address,
    "verify(bytes32,uint8,bytes32,bytes32)(bool)",
    v.tradeId,String(v.role),v.evidenceHash,v.xaiHash,"--rpc-url",rpc);
  const record=cast("call",address,
    "getAnchor(bytes32,uint8,bytes32)((bytes32,address,uint64,uint64))",
    v.tradeId,String(v.role),v.evidenceHash,"--rpc-url",rpc);
  if(command==="preflight"||command==="verify"){
    console.log(JSON.stringify({ok:true,network:"Sepolia",chainId:chain,
      anchorContract:address,existingExactMatch:existing==="true",
      authorizedActor:actor,storedAnchor:record,...publicFields},null,2));
    if(command==="verify"&&existing!=="true")process.exitCode=2;
  }else if(command==="send"){
    if(existing==="true")fail("ALREADY_ANCHORED_AND_VERIFIED");
    const recordedBytes=record.match(/0x[0-9a-fA-F]{64}/);
    if(!recordedBytes||!/^0x0{64}$/i.test(recordedBytes[0]))
      fail("ANCHOR_ALREADY_EXISTS_FOR_THIS_EVIDENCE");
    const account=getOption("--account",null);
    if(!account)fail("Specify encrypted Foundry --account name (not a private key)");
    if(!broadcast)fail("BROADCAST_FLAG_REQUIRED");
    console.log("BROADCAST_REQUESTED: account="+account+" expectedAuthorizedActor="+actor);
    console.log("Only a transaction from that trade role's actor can succeed.");
    const args=["send",address,"anchor(bytes32,uint8,bytes32,bytes32)",
      v.tradeId,String(v.role),v.evidenceHash,v.xaiHash,
      "--rpc-url",rpc,"--account",account];
    const result=child.spawnSync("cast",args,{stdio:"inherit"});
    if(result.status!==0)fail("ONCHAIN_TRANSACTION_NOT_CONFIRMED");
    const matched=cast("call",address,"verify(bytes32,uint8,bytes32,bytes32)(bool)",
      v.tradeId,String(v.role),v.evidenceHash,v.xaiHash,"--rpc-url",rpc);
    if(matched!=="true")fail("ONCHAIN_CONFIRMATION_NOT_MATCHED");
    console.log("ONCHAIN_XAI_HASH_CONFIRMED",JSON.stringify(publicFields));
  }else fail("UNKNOWN_COMMAND_"+command);
}catch(error){console.error("ERROR: "+error.message);process.exitCode=1;}
