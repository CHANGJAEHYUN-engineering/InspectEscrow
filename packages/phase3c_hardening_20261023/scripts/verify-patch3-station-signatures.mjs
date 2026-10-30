// PATCH3: validate Supplier+Buyer Station signatures without sending a transaction.
// Requires local .patch3-local staged + signed files. Does NOT call activate.
// Local demo evidence is public dataset based; no physical same-specimen assurance.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
 Contract,JsonRpcProvider,getAddress,keccak256,toUtf8Bytes,
 TypedDataEncoder,verifyTypedData,AbiCoder,id,formatEther
} from 'ethers';
const base='packages/phase3c_hardening_20261023';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const yes=(v,m)=>{if(!v)throw Error(m)};
const jcs=v=>{
 if(v===null)return 'null';
 if(typeof v==='string')return JSON.stringify(v);
 if(typeof v==='boolean')return v?'true':'false';
 if(typeof v==='number'){yes(Number.isSafeInteger(v),'Unsafe JSON number');return String(v);}
 if(Array.isArray(v))return '['+v.map(jcs).join(',')+']';
 if(typeof v==='object'&&v)return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+jcs(v[k])).join(',')+'}';
 throw Error('Unsupported JSON canonicalization input');
};
const hashObj=v=>keccak256(toUtf8Bytes(jcs(v)));
const shaFile=f=>'0x'+createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const rpc=process.env.PATCH3_RPC_URL;
yes(typeof rpc==='string'&&/^https:\/\//.test(rpc),'HTTPS Sepolia RPC required');
const input=read(base+'/policy/PATCH3_POLICY_INPUT.json');
const commitment=read(base+'/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json');
const manifest=read(base+'/results/PATCH3_SEPOLIA_DEPLOYMENT.json');
const abi=read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const regAbi=read('.patch3-build/CredentialRegistryPatch3.sol_CredentialRegistryPatch3.abi');
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const tradeId=input.tradeId;
yes(addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905'),'Wrong escrow');
const p=new JsonRpcProvider(rpc);
yes((await p.getNetwork()).chainId===11155111n,'Not Sepolia');
const runtime=await p.getCode(addr);
yes(runtime!=='0x'&&keccak256(runtime)===manifest.contracts.InspectEscrowPatch3.runtimeCodeHash,
  'Escrow bytecode differs');
const c=new Contract(addr,abi,p);
const registry=new Contract(manifest.contracts.CredentialRegistryPatch3.address,regAbi,p);
const t=await c.getTradeTerms(tradeId);
const state=Number(await c.getTradeState(tradeId));
yes(state===4,'Must be FUNDED(4), currently '+state);
yes(await c.getActionDeadline(tradeId)===0n,'Trade already activated');
yes(t.policyHash===commitment.policyHash&&Number(t.policyVersion)===2,'Policy mismatch');
yes(await c.accountingConserved()&&await c.balanceCoversLiabilities(),'Accounting invariants failed');
const onDomain=await c.eip712Domain();
yes(onDomain.name==='InspectEscrow'&&onDomain.version==='1'&&
 onDomain.chainId===11155111n&&getAddress(onDomain.verifyingContract)===addr,
 'EIP712 domain mismatch');
const stationFieldTypes=abi.find(x=>x.type==='function'&&x.name==='hashStationAttestation')
  ?.inputs[0].components.map(x=>({name:x.name,type:x.type}));
yes(stationFieldTypes?.length===16,'Bad EIP712 Station ABI');
const latest=await p.getBlock('latest');
yes(latest,'No latest block');
const signType='StationAttestation('+stationFieldTypes.map(x=>x.type+' '+x.name).join(',')+')';
const typehash=id(signType);
yes(typehash===await c.STATION_ATTESTATION_TYPEHASH(),'EIP712 typehash mismatch');
const dir='.patch3-local/'+tradeId.slice(2,14);
const summary={};
for(const [role,roleIndex] of [['supplier',0],['buyer',1]]){
 const stationRole=role==='supplier'?'supplierStation':'buyerStation';
 const station=getAddress(input.roles[stationRole]);
 const actor=getAddress(input.roles[role]);
 const preparedPath=path.join(dir,role+'.prepared.json');
 const signedPath=path.join(dir,role+'.signed.json');
 yes(fs.existsSync(preparedPath)&&fs.existsSync(signedPath),
   'Missing local '+role+' prepared/signed file. Do not activate.');
 const prep=read(preparedPath);
 const signed=read(signedPath);
 yes(prep.tradeId===tradeId&&prep.roleName===role&&
   getAddress(prep.station)===station&&getAddress(prep.actor)===actor,
   role+' prepared role mismatch');
 yes(signed.schema==='inspectescrow.patch3.station-signed-demo/1' &&
   signed.roleName===role&&signed.tradeId===tradeId&&
   getAddress(signed.station)===station&&getAddress(signed.actor)===actor,
   role+' signed role mismatch');
 yes(prep.specimenManifestHash===hashObj(prep.specimenManifest)&&
   prep.evidencePackageHash===hashObj(prep.evidencePackage),
   role+' stored evidence hashes invalid');
 yes(prep.evidencePackage.specimenManifestHash===prep.specimenManifestHash &&
   prep.evidencePackage.sourceAi.sourceFileSha256===shaFile(prep.sourceAiFile),
   role+' original demo source digest mismatch');
 yes(signed.specimenManifestHash===prep.specimenManifestHash &&
   signed.evidencePackageHash===prep.evidencePackageHash,
   role+' signed evidence hashes not prepared content');
 yes(JSON.stringify(signed.types.StationAttestation)===JSON.stringify(stationFieldTypes),
   role+' typed schema mismatch');
 const d=signed.domain;
 yes(d.name===onDomain.name&&d.version===onDomain.version &&
   BigInt(d.chainId)===onDomain.chainId &&
   getAddress(d.verifyingContract)===addr,role+' signed domain mismatch');
 const msg=signed.message;
 const base=prep.messageBase;
 for(const field of stationFieldTypes.map(x=>x.name).filter(x=>!['sessionNonce','issuedAt','validUntil'].includes(x))){
  yes(String(msg[field]).toLowerCase()===String(base[field]).toLowerCase(),
    role+' signed message field '+field+' changed');
 }
 yes(msg.role===roleIndex&&msg.attempt===1&&
   getAddress(msg.station)===station,'Bad role/attempt');
 yes(msg.policyHash===t.policyHash&&msg.modelBundleHash===t.modelBundleHash &&
   msg.captureProfileHash===t.captureProfileHash&&msg.scoreSchemaId===t.scoreSchemaId,
   role+' onchain commitments mismatch');
 yes(msg.inspectionValidity===0&&msg.invalidReason===0,'Unexpected INVALID demo inspection');
 yes(BigInt(msg.aggregateScoreScaled)>=t.scoreMinScaled &&
   BigInt(msg.aggregateScoreScaled)<=t.scoreMaxScaled,role+' score out of range');
 yes((BigInt(msg.aggregateScoreScaled)<t.thresholdScaled?'PASS':'REVIEW')===
   (role==='supplier'?'PASS':'REVIEW'),role+' result classification unexpected');
 yes(Number.isSafeInteger(msg.issuedAt)&&Number.isSafeInteger(msg.validUntil)&&
   msg.issuedAt<=latest.timestamp&&
   msg.validUntil>=latest.timestamp+2*3600+300,
   role+' signed timestamp expired or too close to 2-hour E2E window. Re-sign required before activation.');
 const digest=TypedDataEncoder.hash(d,signed.types,msg);
 yes(signed.digest===digest && await c.hashStationAttestation(msg)===digest,
   role+' typed data digest mismatch');
 yes(getAddress(verifyTypedData(d,signed.types,msg,signed.signature))===station,
   role+' signature NOT by frozen Station');
 const nonceKey=keccak256(AbiCoder.defaultAbiCoder().encode(
   ['bytes32','address','bytes32','uint8','bytes32'],
   [typehash,station,tradeId,roleIndex,msg.sessionNonce]));
 yes(nonceKey===signed.nonceKey&&
   !(await c.consumedNonce(nonceKey))&&!(await c.consumedDigest(digest)),
   role+' nonce/digest already used');
 yes(getAddress(t[stationRole])===station&&getAddress(t[role])===actor,
   role+' onchain actor/station mismatch');
 yes(Number(await registry.status(station))===1,'Station credential inactive for '+role);
 const actorBalance=await p.getBalance(actor);
 yes(actorBalance>0n,'Actor has no Sepolia ETH for gas '+role);
 summary[role]={
   station,actor,actorBalanceEth:formatEther(actorBalance),
   signedDigest:digest,validUntil:msg.validUntil,
   attestationScoreScaled:String(msg.aggregateScoreScaled),
   outcome:role==='supplier'?'PASS':'REVIEW',
   evidencePackageHash:msg.evidencePackageHash,
   stationSignatureValid:true,nonceUnused:true
 };
}
console.log(JSON.stringify({
 status:'PASS_PATCH3_TWO_STATION_SIGNATURES_READY',
 chainId:11155111,
 tradeId,escrow:addr,
 state:'FUNDED(4)',actionDeadline:0,
 signingWindowStartBlockTimestamp:latest.timestamp,
 staged:summary,
 onchainSubmitSimulation:'NOT_YET_POSSIBLE_UNTIL_ACTIVATE',
 actorPrivateKeysVerified:false,
 actorGasSufficiency:'ONLY_NONZERO_CHECKED',
 readyForActivation:'SIGNATURE_GATE_ONLY; LIVE ACTOR RELAYER AND CALL SIMULATION STILL REQUIRED',
 activateCalled:false,transactionsSent:0
},null,2));
