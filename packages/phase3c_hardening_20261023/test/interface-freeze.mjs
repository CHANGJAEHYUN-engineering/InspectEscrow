import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as E from 'ethers';

const BUILD='.patch3-build';
const files=fs.readdirSync(BUILD);
const escrowAbiFile=files.find(x=>x.endsWith('_InspectEscrowPatch3.abi'));
const registryAbiFile=files.find(x=>x.endsWith('_CredentialRegistryPatch3.abi'));
if(!escrowAbiFile||!registryAbiFile) throw new Error('PATCH3 ABI outputs missing');

const escrowAbi=JSON.parse(fs.readFileSync(path.join(BUILD,escrowAbiFile),'utf8'));
const registryAbi=JSON.parse(fs.readFileSync(path.join(BUILD,registryAbiFile),'utf8'));
const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonicalAbi=x=>JSON.stringify(x);

const types={
  StationAttestation:[
    ['tradeId','bytes32'],['role','uint8'],['station','address'],['attempt','uint32'],
    ['sessionNonce','bytes32'],['policyHash','bytes32'],['modelBundleHash','bytes32'],
    ['captureProfileHash','bytes32'],['specimenManifestHash','bytes32'],
    ['evidencePackageHash','bytes32'],['aggregateScoreScaled','uint128'],
    ['scoreSchemaId','bytes32'],['inspectionValidity','uint8'],['invalidReason','uint8'],
    ['issuedAt','uint64'],['validUntil','uint64']
  ],
  ReplayAttestation:[
    ['tradeId','bytes32'],['stage','uint8'],['inspectorActor','address'],['policyHash','bytes32'],
    ['supplierEvidenceHash','bytes32'],['buyerEvidenceHash','bytes32'],['replayReportHash','bytes32'],
    ['consistent','bool'],['nonce','bytes32'],['issuedAt','uint64'],['validUntil','uint64']
  ],
  InspectorDecisionAttestation:[
    ['tradeId','bytes32'],['stage','uint8'],['inspectorActor','address'],['policyHash','bytes32'],
    ['supplierEvidenceHash','bytes32'],['buyerEvidenceHash','bytes32'],['replayReportHash','bytes32'],
    ['decision','uint8'],['reasonCode','bytes32'],['decisionEvidenceHash','bytes32'],
    ['nonce','bytes32'],['issuedAt','uint64'],['validUntil','uint64']
  ],
  MutualResolution:[
    ['tradeId','bytes32'],['outcome','uint8'],['resolutionNonce','bytes32'],['deadline','uint64']
  ],
  ArbitrationDecisionAttestation:[
    ['tradeId','bytes32'],['arbitratorActor','address'],['policyHash','bytes32'],
    ['supplierEvidenceHash','bytes32'],['buyerEvidenceHash','bytes32'],['decision','uint8'],
    ['reasonCode','bytes32'],['decisionEvidenceHash','bytes32'],['nonce','bytes32'],
    ['issuedAt','uint64'],['validUntil','uint64']
  ]
};
const typeString=(name,fields)=>name+'('+fields.map(([n,t])=>t+' '+n).join(',')+')';
const typehashes=Object.fromEntries(Object.entries(types).map(([name,fields])=>[
  name,E.id(typeString(name,fields))
]));

const red=JSON.parse(fs.readFileSync(path.join(BUILD,'PATCH3_RED_TEAM_RESULTS.json'),'utf8'));
const provider=new E.JsonRpcProvider('http://127.0.0.1:18546',undefined,{cacheTimeout:-1});
const c=new E.Contract(red.contract,escrowAbi,provider);

const onchain={
  STATION_ATTESTATION_TYPEHASH:await c.STATION_ATTESTATION_TYPEHASH(),
  REPLAY_ATTESTATION_TYPEHASH:await c.REPLAY_ATTESTATION_TYPEHASH(),
  INSPECTOR_DECISION_TYPEHASH:await c.INSPECTOR_DECISION_TYPEHASH(),
  MUTUAL_RESOLUTION_TYPEHASH:await c.MUTUAL_RESOLUTION_TYPEHASH(),
  ARBITRATION_DECISION_TYPEHASH:await c.ARBITRATION_DECISION_TYPEHASH()
};
const expected={
  STATION_ATTESTATION_TYPEHASH:typehashes.StationAttestation,
  REPLAY_ATTESTATION_TYPEHASH:typehashes.ReplayAttestation,
  INSPECTOR_DECISION_TYPEHASH:typehashes.InspectorDecisionAttestation,
  MUTUAL_RESOLUTION_TYPEHASH:typehashes.MutualResolution,
  ARBITRATION_DECISION_TYPEHASH:typehashes.ArbitrationDecisionAttestation
};
for(const k of Object.keys(expected)){
  if(onchain[k].toLowerCase()!==expected[k].toLowerCase()) {
    throw new Error(k+' mismatch');
  }
}

const manifest={
  schema:'inspectescrow.patch3-interface-freeze-candidate/1.0.0',
  status:'CANDIDATE_NOT_DEPLOYED',
  contractVersion:await c.CONTRACT_VERSION(),
  eip712Domain:{name:'InspectEscrow',version:'1',chainId:'DEPLOYMENT_SPECIFIC',verifyingContract:'DEPLOYMENT_SPECIFIC'},
  abi:{
    inspectEscrowPatch3:{file:escrowAbiFile,sha256:sha256(canonicalAbi(escrowAbi)),entries:escrowAbi.length},
    credentialRegistryPatch3:{file:registryAbiFile,sha256:sha256(canonicalAbi(registryAbi)),entries:registryAbi.length}
  },
  typedData:Object.fromEntries(Object.entries(types).map(([name,fields])=>[
    name,{typeString:typeString(name,fields),typehash:typehashes[name],fields:fields.map(([name,type])=>({name,type}))}
  ])),
  onchainTypehashEquality:true,
  inspectorDecisionRequiresDecisionEvidenceHash:true,
  note:'Freeze candidate generated from compiled ABI and verified against locally deployed contract getters. ChainId and verifyingContract are deployment-specific EIP-712 domain members.'
};
fs.writeFileSync(path.join(BUILD,'PATCH3_INTERFACE_FREEZE_CANDIDATE.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('PASS PATCH3 ABI hashes and all five EIP-712 typehashes frozen consistently');
console.log(JSON.stringify(manifest,null,2));
provider.destroy();
