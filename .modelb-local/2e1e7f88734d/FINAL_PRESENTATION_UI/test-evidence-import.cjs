"use strict";
const fs=require("node:fs");
const path=require("node:path");
const {Contract,JsonRpcProvider,Wallet}=require("ethers");
const {validateEvidencePayload,verifyStaticEvidence,verifySignatureLocally,decodeImage,MAX_IMAGE_BYTES}=require("./evidence-import-endpoints.cjs");

const root="C:\\Users\\USER\\OneDrive\\바탕 화면\\대학교 활동\\AI 블록체인";
const project=path.join(root,"InspectEscrow_PATCH3_DEPLOY");
const abi=JSON.parse(fs.readFileSync(path.join(project,".patch3-build","InspectEscrowPatch3.sol_InspectEscrowPatch3.abi"),"utf8"));
const provider=new JsonRpcProvider(process.env.INSPECTESCROW_SEPOLIA_RPC||"https://ethereum-sepolia-rpc.publicnode.com",11155111,{staticNetwork:true});
const contract=new Contract("0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905",abi,provider);
const ctx={provider,contract};
const folders={supplier:path.join(root,"NEW_S05_ONLY_2e1e7f88","04_SUPPLIER_4_FILES"),buyer:path.join(root,"NEW_S05_ONLY_2e1e7f88","04_BUYER_4_FILES")};

function payload(role){
  const folder=folders[role],bundlePath=path.join(folder,role+".modelb-evidence-bundle.json");
  const bundle=JSON.parse(fs.readFileSync(bundlePath,"utf8")),images={};
  for(const view of ["TOP","FRONT","SIDE"]){
    const fileName=bundle.manifest.captureFiles[view].fileName;
    images[view]={name:fileName,data:fs.readFileSync(path.join(folder,fileName)).toString("base64")};
  }
  return {expectedTradeId:bundle.manifest.tradeId,expectedRole:role,bundle,images};
}
function clone(value){return structuredClone(value);}
function expectedFailure(name,fn,pattern){
  try{fn();return {name,pass:false,detail:"DID_NOT_REJECT"};}
  catch(error){const detail=String(error.message);return {name,pass:pattern.test(detail),detail};}
}
async function main(){
  const checks=[];
  const supplier=payload("supplier"),buyer=payload("buyer");
  const staticSupplier=verifyStaticEvidence(supplier);
  checks.push({name:"01_EXPORT_IMPORT_SAME_HASH",pass:staticSupplier.evidenceHash===supplier.bundle.evidencePackageHash,detail:staticSupplier.evidenceHash});

  const changed=clone(supplier),bytes=Buffer.from(changed.images.TOP.data,"base64");bytes[1000]^=1;changed.images.TOP.data=bytes.toString("base64");
  checks.push(expectedFailure("02_ONE_BYTE_IMAGE_TAMPER",()=>verifyStaticEvidence(changed),/ORIGINAL_IMAGE_HASH_MISMATCH_TOP/));
  const trade=clone(supplier);trade.bundle.unsigned.message.tradeId="0x"+"11".repeat(32);
  checks.push(expectedFailure("03_TRADE_ID_TAMPER",()=>verifyStaticEvidence(trade),/TRADE_ID_MISMATCH|TRADE_ID_CROSS/));
  const policy=clone(supplier);policy.bundle.unsigned.message.policyHash="0x"+"22".repeat(32);
  checks.push(expectedFailure("04_POLICY_HASH_TAMPER",()=>verifyStaticEvidence(policy),/POLICY_HASH_MISMATCH/));

  const fakeSignature=clone(staticSupplier),signatureTestNow=Math.floor(Date.now()/1000);
  fakeSignature.normalized.message={...fakeSignature.normalized.message,issuedAt:signatureTestNow-10,validUntil:signatureTestNow+300};
  fakeSignature.normalized.signature="0x"+"00".repeat(65);
  checks.push(expectedFailure("05_STATION_SIGNATURE_TAMPER",()=>verifySignatureLocally(fakeSignature,Math.floor(Date.now()/1000)),/STATION_SIGNATURE_INVALID|SIGNER_MISMATCH/));
  const missing=clone(supplier);delete missing.images.SIDE;
  checks.push(expectedFailure("06A_VIEW_MISSING",()=>verifyStaticEvidence(missing),/EXACT_TOP_FRONT_SIDE_REQUIRED/));
  const duplicate=clone(supplier);duplicate.images.SIDE=clone(duplicate.images.FRONT);
  checks.push(expectedFailure("06B_VIEW_DUPLICATE",()=>verifyStaticEvidence(duplicate),/DUPLICATE_VIEW_IMAGE_BYTES|ORIGINAL_IMAGE_HASH_MISMATCH_SIDE/));
  const wrongRole=clone(supplier);wrongRole.expectedRole="buyer";
  checks.push(expectedFailure("07_WRONG_ROLE",()=>verifyStaticEvidence(wrongRole),/ROLE_MISMATCH_EXPECTED_VS_BUNDLE/));

  const model=clone(supplier);model.bundle.inferenceReport.model_checkpoint_sha256="00".repeat(32);
  checks.push(expectedFailure("08_MODEL_CHECKPOINT_TAMPER",()=>verifyStaticEvidence(model),/MODEL_CHECKPOINT_MISMATCH/));
  const domain=clone(supplier);domain.bundle.unsigned.domain.verifyingContract="0x0000000000000000000000000000000000000001";
  checks.push(expectedFailure("09_EIP712_DOMAIN_TAMPER",()=>verifyStaticEvidence(domain),/EIP712_DOMAIN_CONTRACT_MISMATCH/));
  const jsonField=clone(supplier);jsonField.bundle.evidencePackage.scoreScaled="1";
  checks.push(expectedFailure("10_JSON_FIELD_TAMPER",()=>verifyStaticEvidence(jsonField),/EVIDENCE_PACKAGE_HASH_MISMATCH/));

  const wallet=Wallet.createRandom(),signed=clone(staticSupplier),now=Math.floor(Date.now()/1000);
  signed.normalized.message={...signed.normalized.message,station:wallet.address,issuedAt:now-10,validUntil:now+300};
  signed.normalized.signature=await wallet.signTypedData(signed.normalized.domain,signed.normalized.types,signed.normalized.message);
  const sigOk=verifySignatureLocally(signed,now);
  checks.push({name:"11_VALID_LOCAL_EIP712_SIGNATURE",pass:sigOk.valid&&sigOk.usableNow&&sigOk.recoveredSigner===wallet.address,detail:"synthetic local-only signer; key not persisted"});
  signed.normalized.message.aggregateScoreScaled="1";
  checks.push(expectedFailure("12_SIGNED_MESSAGE_TAMPER",()=>verifySignatureLocally(signed,now),/SIGNER_MISMATCH|STATION_SIGNATURE_INVALID/));

  const expired=clone(staticSupplier);expired.normalized.message={...expired.normalized.message,station:wallet.address,issuedAt:now-600,validUntil:now-300};expired.normalized.signature=await wallet.signTypedData(expired.normalized.domain,expired.normalized.types,expired.normalized.message);const expiredResult=verifySignatureLocally(expired,now);
  checks.push({name:"12B_EXPIRED_SIGNATURE_BLOCKED_FROM_CURRENT_USE",pass:expiredResult.status==="VALID_BUT_EXPIRED"&&expiredResult.usableNow===false,detail:expiredResult.status});
  checks.push(expectedFailure("12C_INVALID_FILE_FORMAT",()=>decodeImage({name:"not-an-image.txt",data:supplier.images.TOP.data},"TOP"),/INVALID_IMAGE_EXTENSION_TOP/));
  checks.push(expectedFailure("12D_EXCESSIVE_FILE_SIZE",()=>decodeImage({name:"oversized.jpg",data:"A".repeat(Math.ceil(MAX_IMAGE_BYTES*4/3)+8)},"TOP"),/IMAGE_TOO_LARGE_TOP/));

  const liveSupplier=await validateEvidencePayload(ctx,supplier);
  const liveBuyer=await validateEvidencePayload(ctx,buyer);
  checks.push({name:"13A_SEPOLIA_SUPPLIER_READBACK",pass:liveSupplier.onchain.submitted&&liveSupplier.onchain.evidenceMatches&&liveSupplier.replayInputStatus==="REPLAY_INPUT_ELIGIBLE"&&liveSupplier.transactionsSent===0,detail:liveSupplier.verificationLevel});
  checks.push({name:"13B_SEPOLIA_BUYER_READBACK",pass:liveBuyer.onchain.submitted&&liveBuyer.onchain.evidenceMatches&&liveBuyer.replayInputStatus==="REPLAY_INPUT_ELIGIBLE"&&liveBuyer.transactionsSent===0,detail:liveBuyer.verificationLevel});
  checks.push({name:"14_UNSIGNED_BUNDLE_TRUTHFUL_STATUS",pass:liveSupplier.signature.status==="UNSIGNED"&&liveSupplier.verificationLevel==="PARTIAL_VERIFICATION",detail:liveSupplier.signature.reason});
  checks.push({name:"15_PHYSICAL_CUSTODY_NOT_CLAIMED",pass:liveSupplier.limitations.some(x=>/physical specimen identity or custody/i.test(x)),detail:liveSupplier.limitations.at(-1)});

  const routeResponse=await fetch("http://127.0.0.1:8770/api/evidence/verify",{method:"POST",headers:{"Content-Type":"application/json","X-InspectEscrow-Local":"1"},body:JSON.stringify(supplier)});
  const routeBody=await routeResponse.json();
  checks.push({name:"16_BROWSER_EQUIVALENT_HTTP_IMPORT",pass:routeResponse.status===200&&routeBody.ok===true&&routeBody.onchain.evidenceMatches===true&&routeBody.transactionsSent===0,detail:"HTTP "+routeResponse.status+" · "+String(routeBody.verificationLevel||routeBody.error)});

  const result={suite:"INSPECTESCROW_2B_EVIDENCE_IMPORT",allPass:checks.every(x=>x.pass),checksPassed:checks.filter(x=>x.pass).length,checksTotal:checks.length,transactionsSent:0,tradeId:liveSupplier.tradeId,supplierEvidenceHash:liveSupplier.hashes.evidencePackageHash,buyerEvidenceHash:liveBuyer.hashes.evidencePackageHash,checks};
  console.log(JSON.stringify(result,null,2));if(!result.allPass)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
