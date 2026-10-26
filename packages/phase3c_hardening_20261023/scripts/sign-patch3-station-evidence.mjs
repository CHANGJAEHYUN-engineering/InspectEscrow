// PATCH3: locally sign prepared, trade-bound StationAttestation.
// READ-ONLY preview by default. --sign creates one local signed envelope ONLY.
// No broadcast, no ETH, no private-key printing or file storage of private keys.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  Contract,JsonRpcProvider,Wallet,getAddress,
  keccak256,toUtf8Bytes,TypedDataEncoder,verifyTypedData,
  hexlify,randomBytes,id,AbiCoder
} from 'ethers';
const pkg='packages/phase3c_hardening_20261023';
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const assert=(v,m)=>{if(!v)throw Error(m)};
const role=process.argv[2];
const options=process.argv.slice(3);
assert(['supplier','buyer'].includes(role),'Usage: node .../sign-patch3-station-evidence.mjs supplier|buyer [--sign]');
assert(options.length===0||(options.length===1&&options[0]==='--sign'),
  'Only optional --sign supported; this is NOT broadcast');
const sign=options[0]==='--sign';
const rpc=process.env.PATCH3_RPC_URL;
assert(typeof rpc==='string'&&/^https:\/\//.test(rpc),'HTTPS Sepolia RPC required');
const input=load(pkg+'/policy/PATCH3_POLICY_INPUT.json');
const policy=load(pkg+'/policy/generated/PATCH3_POLICY_V1_2_FINAL.json');
const commitment=load(pkg+'/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json');
const manifest=load(pkg+'/results/PATCH3_SEPOLIA_DEPLOYMENT.json');
const abi=load('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const regAbi=load('.patch3-build/CredentialRegistryPatch3.sol_CredentialRegistryPatch3.abi');
const tradeId=input.tradeId;
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const stationRole=role==='supplier'?'supplierStation':'buyerStation';
const expectedStation=getAddress(input.roles[stationRole]);
const expectedActor=getAddress(input.roles[role]);
const roleIndex=role==='supplier'?0:1;
const folder='.patch3-local/'+tradeId.slice(2,14);
const preparedPath=path.join(folder,role+'.prepared.json');
const signedPath=path.join(folder,role+'.signed.json');
assert(fs.existsSync(preparedPath),'Missing prepared evidence: '+preparedPath+
  '. Run prepare-patch3-station-evidence.mjs --write first.');
const prepared=load(preparedPath);
assert(!fs.existsSync(signedPath),
  'This role already has a signed envelope; refuse accidental re-sign. Inspect existing signed file.');
function jcs(v){
  if(v===null)return 'null';
  if(typeof v==='string')return JSON.stringify(v);
  if(typeof v==='boolean')return v?'true':'false';
  if(typeof v==='number'){assert(Number.isSafeInteger(v),'Unsafe evidence number');return String(v);}
  if(Array.isArray(v))return '['+v.map(jcs).join(',')+']';
  if(typeof v==='object'&&v)return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+jcs(v[k])).join(',')+'}';
  throw Error('Invalid evidence type');
}
const digest=v=>keccak256(toUtf8Bytes(jcs(v)));
const shaFile=file=>'0x'+createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert(prepared.schema==='inspectescrow.patch3.staged-demo-evidence/1'&&
  prepared.tradeId===tradeId&&prepared.roleName===role&&
  prepared.roleIndex===roleIndex,'Prepared evidence wrong trade/role');
assert(getAddress(prepared.station)===expectedStation&&
  getAddress(prepared.actor)===expectedActor,'Frozen actor/station mismatch');
assert(prepared.specimenManifestHash===digest(prepared.specimenManifest)&&
  prepared.evidencePackageHash===digest(prepared.evidencePackage),
  'Evidence hash tampered or corrupted');
assert(prepared.evidencePackage.specimenManifestHash===prepared.specimenManifestHash,
  'Evidence package lost specimen link');
const source=prepared.sourceAiFile;
assert(source===('packages/ai_20261010/ai/evidence/canonical/'+
  (role==='supplier'?'demo__good__000__ai_evidence.json':'demo__scratch__022__ai_evidence.json')),
  'Unexpected source AI file path');
assert(prepared.evidencePackage.sourceAi.sourceFileSha256===shaFile(source),
  'Source AI file changed since preparation');
const declared=load(source);
assert(prepared.evidencePackage.sourceAi.declaredAiEvidenceSha256===declared.evidence_sha256,
  'AI evidence digest metadata mismatch');
assert(prepared.specimenManifest.binding.tradeId===tradeId &&
  prepared.evidencePackage.binding.tradeId===tradeId &&
  prepared.evidencePackage.binding.policyHash===commitment.policyHash &&
  prepared.evidencePackage.binding.role===roleIndex &&
  getAddress(prepared.evidencePackage.binding.station)===expectedStation,
  'Trade-bound evidence has wrong binding');
assert(prepared.messageBase.tradeId===tradeId&&prepared.messageBase.role===roleIndex &&
  prepared.messageBase.attempt===1 &&
  getAddress(prepared.messageBase.station)===expectedStation&&
  prepared.messageBase.evidencePackageHash===prepared.evidencePackageHash &&
  prepared.messageBase.specimenManifestHash===prepared.specimenManifestHash &&
  prepared.messageBase.policyHash===commitment.policyHash &&
  prepared.messageBase.sessionNonce===null &&
  prepared.messageBase.issuedAt===null &&
  prepared.messageBase.validUntil===null,'Prepared StationAttestation malformed');
assert(policy.hashing.policyHash===commitment.policyHash&&policy.policyVersion===2,
  'Policy commitment changed');
assert(addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905'),
  'Wrong escrow address');
const p=new JsonRpcProvider(rpc);
assert((await p.getNetwork()).chainId===11155111n,'Wrong chain ID');
const liveCode=await p.getCode(addr);
assert(liveCode!=='0x'&&keccak256(liveCode)===manifest.contracts.InspectEscrowPatch3.runtimeCodeHash,
  'Onchain runtime bytecode hash mismatch');
const c=new Contract(addr,abi,p);
const registry=new Contract(manifest.contracts.CredentialRegistryPatch3.address,regAbi,p);
assert(Number(await c.getTradeState(tradeId))===4 &&
  await c.getActionDeadline(tradeId)===0n,'Trade no longer waiting in FUNDED(4)');
assert(Number(await registry.status(expectedStation))===1,'Station credential inactive');
assert(await c.accountingConserved()&&await c.balanceCoversLiabilities(),
  'Escrow accounting invariant failed');
const t=await c.getTradeTerms(tradeId);
assert(t.policyHash===commitment.policyHash&&
  getAddress(t[stationRole])===expectedStation&&
  getAddress(t[role])===expectedActor,
  'Onchain terms do not match station/actor');
assert(t.modelBundleHash===prepared.messageBase.modelBundleHash&&
  t.captureProfileHash===prepared.messageBase.captureProfileHash&&
  t.scoreSchemaId===prepared.messageBase.scoreSchemaId,
  'Station frozen terms mismatch');
assert(t.escrowAmount===5000000000000000n,'Escrow amount altered');
const d=await c.eip712Domain();
const domain=prepared.domain;
assert(d.name===domain.name&&d.version===domain.version&&
  d.chainId===BigInt(domain.chainId)&&
  getAddress(d.verifyingContract)===getAddress(domain.verifyingContract)&&
  getAddress(domain.verifyingContract)===addr,'EIP712 domain mismatch');
const fieldFromAbi=abi.find(x=>x.type==='function'&&x.name==='hashStationAttestation')
  ?.inputs[0].components.map(x=>({name:x.name,type:x.type}));
const fields=prepared.types?.StationAttestation;
assert(JSON.stringify(fields)===JSON.stringify(fieldFromAbi),'EIP712 field type mismatch');
assert(BigInt(prepared.messageBase.aggregateScoreScaled)>=t.scoreMinScaled &&
  BigInt(prepared.messageBase.aggregateScoreScaled)<=t.scoreMaxScaled,
  'Evidence score out of policy range');
const classification=BigInt(prepared.messageBase.aggregateScoreScaled)<t.thresholdScaled?'PASS':'REVIEW';
assert(classification===(role==='supplier'?'PASS':'REVIEW'),
  'Evidence score leads to unexpected outcome');
assert(prepared.messageBase.inspectionValidity===0&&prepared.messageBase.invalidReason===0,
  'Only admissible demo records supported');

console.log(JSON.stringify({
  status:'PASS_READ_ONLY_STATION_SIGN_PREFLIGHT',
  role,station:expectedStation,actor:expectedActor,
  tradeId,policyHash:commitment.policyHash,scoring:classification,
  onchainState:'FUNDED(4)',
  signerRequired:sign,
  signedOutput:sign?signedPath:null,
  privateKeysPrinted:0,
  transactionsSent:0,activateCalled:false
},null,2));
if(!sign){
  console.log('READ-ONLY STATION SIGN PREFLIGHT PASS. No key accessed and no signature created.');
  process.exit(0);
}
assert(process.env.PATCH3_STATION_SIGN_CONFIRM==='SIGN_PATCH3_STATION_'+role,
  'Explicit Station sign confirmation missing');
const key=process.env.PATCH3_STATION_PRIVATE_KEY;
assert(typeof key==='string'&&/^0x[0-9a-fA-F]{64}$/.test(key),
  'PATCH3_STATION_PRIVATE_KEY must be a local 0x-prefixed 32-byte key (not printed)');
let wallet;
try{wallet=new Wallet(key);}catch{throw Error('Unable to derive Station wallet (key not printed)');}
assert(getAddress(wallet.address)===expectedStation,
  'Local key does NOT match frozen '+stationRole+' wallet');

const block=await p.getBlock('latest');
assert(block&&Number.isSafeInteger(block.timestamp),'Unable to get onchain timestamp');
const issuedAt=block.timestamp>5?block.timestamp-5:block.timestamp;
const validUntil=block.timestamp+6*3600;
const sessionNonce=hexlify(randomBytes(32));
const message={...prepared.messageBase,sessionNonce,issuedAt,validUntil};
const expectedDigest=TypedDataEncoder.hash(domain,prepared.types,message);
const onchainDigest=await c.hashStationAttestation(message);
assert(expectedDigest===onchainDigest,'EIP712 typed-data digest mismatch with PATCH3 onchain hash');
const typeString='StationAttestation('+fields.map(x=>x.type+' '+x.name).join(',')+')';
const typehash=id(typeString);
assert(typehash===await c.STATION_ATTESTATION_TYPEHASH(),'Station typehash differs from onchain');
const nonceKey=keccak256(AbiCoder.defaultAbiCoder().encode(
  ['bytes32','address','bytes32','uint8','bytes32'],
  [typehash,expectedStation,tradeId,roleIndex,sessionNonce]
));
assert(!(await c.consumedNonce(nonceKey)) && !(await c.consumedDigest(expectedDigest)),
  'Nonce or digest already consumed');
const signature=await wallet.signTypedData(domain,prepared.types,message);
assert(getAddress(verifyTypedData(domain,prepared.types,message,signature))===expectedStation,
  'Signature recovery mismatch');
const signed={
  schema:'inspectescrow.patch3.station-signed-demo/1',
  demoOnly:true,roleName:role,tradeId,station:expectedStation,
  actor:expectedActor,domain,types:prepared.types,
  message,signature,digest:expectedDigest,
  nonceKey,issuedAt,validUntil,
  specimenManifestHash:prepared.specimenManifestHash,
  evidencePackageHash:prepared.evidencePackageHash,
  preparedFile:preparedPath,
  evidenceSourceFile:source,
  reference:'Original prepared evidence file must be retained for this digest to be meaningful.',
  onchainSimulationPendingActivation:true,
  warning:'Local EIP-712 signature only. No on-chain evidence submitted or verified until later.'
};
fs.writeFileSync(signedPath,JSON.stringify(signed,null,2)+'\n',
  {flag:'wx',mode:0o600});
console.log(JSON.stringify({
  status:'PATCH3_STATION_SIGNATURE_CREATED',
  role,station:expectedStation,actor:expectedActor,
  digest:expectedDigest,
  nonceKey,
  issuedAt,validUntil,
  signedOutput:signedPath,
  signedByCorrectStation:true,
  digestMatchesPATCH3Onchain:true,
  transactionsSent:0,
  activateCalled:false,
  next:'Verify both signed envelopes and relayer readiness before activation.'
},null,2));
