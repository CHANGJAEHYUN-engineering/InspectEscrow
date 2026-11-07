"use strict";
// Same-document, memory-only Evidence handoff. No original pixels or signatures in persistent storage.
(()=>{
 let record=null;
 const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
 const isHash=s=>/^0x[0-9a-fA-F]{64}$/.test(String(s||""));
 function matches(filter={}){
  if(!record)return false;
  if(filter.tradeId&&!eq(record.tradeId,filter.tradeId))return false;
  if(filter.role&&!eq(record.role,filter.role))return false;
  if(filter.chainId&&Number(record.chainId)!==Number(filter.chainId))return false;
  if(filter.contract&&!eq(record.contract,filter.contract))return false;
  return true;
 }
 window.InspectEscrowEvidenceSession=Object.freeze({
  save({tradeId,role,chainId,contract,files,bundle}){
   if(!isHash(tradeId)||!["supplier","buyer"].includes(role)||![files?.TOP,files?.FRONT,files?.SIDE].every(f=>f instanceof File))
    throw Error("EVIDENCE_HANDOFF_METADATA_INVALID");
   if(bundle?.unsigned?.message?.tradeId!==tradeId || bundle.roleName!==role ||
      !isHash(bundle?.evidencePackageHash)||!isHash(bundle?.specimenManifestHash)||
      !eq(bundle.evidencePackageHash,bundle.unsigned.message.evidencePackageHash))
    throw Error("EVIDENCE_HANDOFF_BUNDLE_INVALID");
   if(!eq(bundle.unsigned.domain?.verifyingContract,contract)||Number(bundle.unsigned.domain?.chainId)!==Number(chainId))
    throw Error("EVIDENCE_HANDOFF_NETWORK_MISMATCH");
   record={tradeId,role,chainId:Number(chainId),contract,files:{...files},
      bundle:structuredClone(bundle),evidenceHash:bundle.evidencePackageHash,
      verified:null,createdAt:Date.now()};
   return record.evidenceHash;
  },
  peek(filter={}){
   if(!matches(filter))return null;
   if(Date.now()-record.createdAt>45*60*1000){record=null;return null;}
   return record;
  },
  markVerified(result,filter={}){
   if(!matches(filter)||!result||!eq(result.tradeId,record.tradeId)||
     !eq(result.roleName,record.role)||!eq(result.hashes?.evidencePackageHash,record.evidenceHash)||
     result.ok!==true)throw Error("EVIDENCE_VERIFICATION_BINDING_INVALID");
   record.verified={hash:record.evidenceHash,result:structuredClone(result),at:Date.now()};
   return true;
  },
  verified(filter={}){
   const v=this.peek(filter);
   if(!v)return null;
   return v.verified?.hash===v.evidenceHash?v:null;
  },
  markSigned(hash,signature,message){
   if(!record||!record.verified||!eq(record.evidenceHash,hash))throw Error("EVIDENCE_SIGNING_SESSION_INVALID");
   record.bundle.unsigned.message=structuredClone(message);
   record.bundle.signature=signature;
   record.bundle.signatureStatus="STATION_SIGNATURE_INCLUDED";
   return true;
  },
  invalidate(){record=null;},
  status(){return record?{tradeId:record.tradeId,role:record.role,evidenceHash:record.evidenceHash,
   verified:!!record.verified,hasSignature:!!record.bundle.signature}:null;}
 });
})();