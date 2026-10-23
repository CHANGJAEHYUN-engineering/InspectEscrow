import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as E from 'ethers';

const BUILD='.patch3-build';
const red=JSON.parse(fs.readFileSync(path.join(BUILD,'PATCH3_RED_TEAM_RESULTS.json'),'utf8'));
const files=fs.readdirSync(BUILD);
const abiFile=files.find(x=>x.endsWith('_InspectEscrowPatch3.abi'));
if(!abiFile) throw new Error('InspectEscrowPatch3 ABI missing');
const abi=JSON.parse(fs.readFileSync(path.join(BUILD,abiFile),'utf8'));

const provider=new E.JsonRpcProvider('http://127.0.0.1:18546',undefined,{cacheTimeout:-1});
assert.equal(Number((await provider.getNetwork()).chainId),31338);

const c=new E.Contract(red.contract,abi,provider);
const supplierStation=await provider.getSigner(6);
const stationAddress=await supplierStation.getAddress();

function jcsSafe(value){
  if(value===null) return 'null';
  if(typeof value==='boolean') return value?'true':'false';
  if(typeof value==='number'){
    if(!Number.isSafeInteger(value)) throw new Error('Golden fixture permits safe integers only');
    return String(value);
  }
  if(typeof value==='string') return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(jcsSafe).join(',')+']';
  if(typeof value==='object'){
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+jcsSafe(value[k])).join(',')+'}';
  }
  throw new Error('Unsupported JCS fixture value');
}

function scaleHalfUp(decimalString,exp){
  const [wholeRaw,fracRaw='']=decimalString.split('.');
  if(wholeRaw.startsWith('-')) throw new Error('Golden score fixture is non-negative');
  const scale=10n**BigInt(exp);
  const whole=BigInt(wholeRaw||'0')*scale;
  const padded=(fracRaw+'0'.repeat(exp+1)).slice(0,exp+1);
  const kept=padded.slice(0,exp)||'0';
  const next=Number(padded[exp]??'0');
  return whole+BigInt(kept)+(next>=5?1n:0n);
}

const readablePath='packages/ai_20261010/ai/onchain_demo/DISPUTE/SUPPLIER_ATTEMPT_1/SUPPLIER_SPECIMEN_MANIFEST_V1.json';
const canonicalPath='packages/ai_20261010/ai/onchain_demo/DISPUTE/SUPPLIER_ATTEMPT_1/SUPPLIER_SPECIMEN_MANIFEST_V1.jcs.json';
const readable=JSON.parse(fs.readFileSync(readablePath,'utf8'));
const canonicalExpected=fs.readFileSync(canonicalPath,'utf8').trim();
const canonicalJs=jcsSafe(readable);
assert.equal(canonicalJs,canonicalExpected,'JS canonical bytes differ from frozen JCS artifact');

const specimenManifestHash=E.keccak256(E.toUtf8Bytes(canonicalJs));
assert.equal(
  specimenManifestHash,
  '0x0c39c0ad9a76fb194c92d9864fa64ce2afbfe00c979ec762bffaf2c8eb436557',
  'Supplier frozen specimen manifest hash mismatch'
);

const rawScore='55.442035675048828';
const scaled=scaleHalfUp(rawScore,6);
assert.equal(scaled,55442036n,'JS score integerization mismatch');

const domain={
  name:'InspectEscrow',
  version:'1',
  chainId:31338,
  verifyingContract:red.contract
};
const types={
  StationAttestation:[
    {name:'tradeId',type:'bytes32'},
    {name:'role',type:'uint8'},
    {name:'station',type:'address'},
    {name:'attempt',type:'uint32'},
    {name:'sessionNonce',type:'bytes32'},
    {name:'policyHash',type:'bytes32'},
    {name:'modelBundleHash',type:'bytes32'},
    {name:'captureProfileHash',type:'bytes32'},
    {name:'specimenManifestHash',type:'bytes32'},
    {name:'evidencePackageHash',type:'bytes32'},
    {name:'aggregateScoreScaled',type:'uint128'},
    {name:'scoreSchemaId',type:'bytes32'},
    {name:'inspectionValidity',type:'uint8'},
    {name:'invalidReason',type:'uint8'},
    {name:'issuedAt',type:'uint64'},
    {name:'validUntil',type:'uint64'}
  ]
};

const message={
  tradeId:'0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c',
  role:0,
  station:stationAddress,
  attempt:1,
  sessionNonce:'0x80281e9f5a621511715d0e7f0637c1f0f0bf99a695ed790112187e7c3edc86b2',
  policyHash:'0x85cd60bd89d1c82d39a313443723997283d79a46ec415c4c1064088ffe3f9d11',
  modelBundleHash:'0x64f3359a4e9a276a5f0abef0e5305f42b513dbae1ac5698cb08c9e066962383e',
  captureProfileHash:'0x3ea93a717cf8570d9b5c0662b1d27bb4a882651784342013786266b269db96da',
  specimenManifestHash,
  evidencePackageHash:'0x73f141e55ac41d24eb81574ae6ffcaf406bd331f14abe49081dd439f0be5d986',
  aggregateScoreScaled:scaled,
  scoreSchemaId:'0xcf1476a2ae70ac5fad6ba79a7f55bab4b4c4973dd892d65de9a887bf08d1f1f8',
  inspectionValidity:0,
  invalidReason:0,
  issuedAt:1700000000,
  validUntil:1700003600
};

const jsDigest=E.TypedDataEncoder.hash(domain,types,message);
const solidityDigest=await c.hashStationAttestation(message);
assert.equal(jsDigest.toLowerCase(),solidityDigest.toLowerCase(),'JS/Solidity EIP-712 digest mismatch');

const signature=await supplierStation.signTypedData(domain,types,message);
const recovered=E.verifyTypedData(domain,types,message,signature);
assert.equal(recovered.toLowerCase(),stationAddress.toLowerCase(),'JS signer recovery mismatch');

const vector={
  schema:'inspectescrow.patch3-interop-golden/1.0.0',
  scope:'LOCAL_DETERMINISTIC_GOLDEN_VECTOR',
  scoreIntegerization:{
    rawScore,
    scaleExponent:6,
    rounding:'ROUND_HALF_UP',
    expectedScaled:'55442036',
    jsScaled:scaled.toString()
  },
  canonicalization:{
    algorithm:'RFC8785-JCS',
    fixtureRestriction:'ASCII object keys and JSON-safe integers used by this frozen manifest',
    readablePath,
    frozenCanonicalPath:canonicalPath,
    utf8ByteLength:Buffer.byteLength(canonicalJs,'utf8'),
    specimenManifestHash
  },
  eip712:{
    domain,
    primaryType:'StationAttestation',
    types,
    message:{...message,aggregateScoreScaled:scaled.toString()},
    jsDigest,
    solidityDigest,
    signature,
    expectedSigner:stationAddress,
    jsRecoveredSigner:recovered
  }
};

fs.writeFileSync(path.join(BUILD,'PATCH3_INTEROP_GOLDEN_VECTOR.json'),JSON.stringify(vector,null,2)+'\n');
console.log('PASS JS score integerization = 55442036');
console.log('PASS JS canonical bytes = frozen Supplier JCS');
console.log('PASS JS specimenManifestHash = 0x0c39...6557');
console.log('PASS JS EIP-712 digest = Solidity digest');
console.log('PASS JS recovered signer = Supplier Station');
console.log(JSON.stringify(vector,null,2));
provider.destroy();
