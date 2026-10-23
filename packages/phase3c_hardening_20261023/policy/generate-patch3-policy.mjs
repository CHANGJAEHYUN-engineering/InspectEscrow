import fs from 'node:fs';
import path from 'node:path';
import * as E from 'ethers';

const inputPath=process.argv[2] ?? 'packages/phase3c_hardening_20261023/policy/PATCH3_POLICY_INPUT.json';
const outDir=process.argv[3] ?? 'packages/phase3c_hardening_20261023/policy/generated';
const basePolicyPath='packages/ai_20261010/ai/policy/INSPECTION_POLICY_V1_1_FINAL.json';

const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const base=JSON.parse(fs.readFileSync(basePolicyPath,'utf8'));
const ZERO='0x'+'00'.repeat(32);

function isAddress(x){return typeof x==='string' && /^0x[0-9a-fA-F]{40}$/.test(x);}
function isBytes32(x){return typeof x==='string' && /^0x[0-9a-fA-F]{64}$/.test(x);}
function jcs(v){
  if(v===null)return 'null';
  if(typeof v==='boolean')return v?'true':'false';
  if(typeof v==='number'){
    if(!Number.isSafeInteger(v)) throw Error('Unsafe JSON number: '+v);
    return String(v);
  }
  if(typeof v==='string')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(jcs).join(',')+']';
  if(typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+jcs(v[k])).join(',')+'}';
  throw Error('Unsupported JSON type');
}
function requireValue(cond,msg){if(!cond)throw Error(msg);}
function unique(values,label){
  const lowered=values.map(x=>x.toLowerCase());
  requireValue(new Set(lowered).size===lowered.length,label+' must be pairwise distinct');
}
function outcomeCode(name){
  if(name==='RELEASE_TO_SUPPLIER') return 1;
  if(name==='REFUND_TO_BUYER') return 2;
  throw Error('Invalid fallback outcome '+name);
}

requireValue(input.chainId===11155111,'PATCH3 demo policy is Sepolia-only');
for(const k of ['verifyingContract','credentialRegistry','credentialAuthority']) requireValue(isAddress(input[k]),k+' missing/invalid');
requireValue(isBytes32(input.tradeId),'tradeId missing/invalid');
const actorKeys=['supplier','buyer','primaryInspector','backupInspector','externalArbitrator'];
const stationKeys=['supplierStation','buyerStation','primaryInspectorStation','backupInspectorStation','externalArbitratorStation'];
const actors=actorKeys.map(k=>input.roles[k]);
const stations=stationKeys.map(k=>input.roles[k]);
for(const [i,a] of [...actors,...stations].entries()) requireValue(isAddress(a),'role address '+i+' invalid');
unique(actors,'actors');
unique(stations,'stations');
unique([...actors,...stations,input.credentialAuthority],'actors/stations/credentialAuthority');
requireValue(BigInt(input.escrowAmountWei)>0n,'escrowAmountWei must be positive');
for(const [k,v] of Object.entries(input.windowsSeconds)) requireValue(Number.isSafeInteger(v)&&v>0,'window '+k+' invalid');

const policy={
  schema:'inspectescrow.inspection-policy',
  schemaVersion:'1.2.0',
  status:'ACTIVE',
  policyVersion:2,
  parentPolicyHash:base.hashing.policyHash,
  policyId:E.keccak256(E.toUtf8Bytes('InspectEscrow|MeaningfulDemoPolicy|'+input.tradeId+'|v2')),
  hashing:{
    canonicalization:'RFC8785-JCS',
    hashAlgorithm:'keccak256',
    policyHashRule:'ZERO_POLICY_HASH_PREIMAGE_V1',
    policyHash:ZERO
  },
  trade:{
    chainId:input.chainId,
    verifyingContract:input.verifyingContract,
    credentialRegistry:input.credentialRegistry,
    credentialAuthority:input.credentialAuthority,
    tradeId:input.tradeId,
    escrowAmountWei:input.escrowAmountWei,
    settlementAsset:'NATIVE_SEPOLIA_ETH',
    roles:input.roles
  },
  product:base.product,
  ai:base.ai,
  capture:base.capture,
  evidence:{
    ...base.evidence,
    availabilityRule:'ORIGINAL_EVIDENCE_MUST_REMAIN_RETRIEVABLE_FOR_REPLAY_OR_ROUTE_TO_EVIDENCE_EXCEPTION_POLICY'
  },
  replay:base.replay,
  attestation:{
    signatureFormat:'EIP712',
    domain:{chainId:input.chainId,verifyingContract:input.verifyingContract,name:'InspectEscrow',version:'1'},
    callerSignerSeparation:{
      supplierInspection:'SUPPLIER_ACTOR_CALLS_SUPPLIER_STATION_SIGNS',
      buyerInspection:'BUYER_ACTOR_CALLS_BUYER_STATION_SIGNS',
      primaryReplayAndDecision:'PRIMARY_INSPECTOR_ACTOR_CALLS_PRIMARY_INSPECTOR_STATION_SIGNS',
      backupReplayAndDecision:'BACKUP_INSPECTOR_ACTOR_CALLS_BACKUP_INSPECTOR_STATION_SIGNS',
      externalArbitration:'EXTERNAL_ARBITRATOR_ACTOR_CALLS_EXTERNAL_ARBITRATOR_STATION_SIGNS'
    },
    inspectorDecisionMustBind:[
      'tradeId','stage','inspectorActor','policyHash','supplierEvidenceHash','buyerEvidenceHash',
      'replayReportHash','decision','reasonCode','decisionEvidenceHash','nonce','issuedAt','validUntil'
    ],
    arbitrationDecisionMustBind:[
      'tradeId','arbitratorActor','policyHash','supplierEvidenceHash','buyerEvidenceHash',
      'decision','reasonCode','decisionEvidenceHash','nonce','issuedAt','validUntil'
    ],
    notClaimed:base.attestation.notClaimed
  },
  procedure:{
    ...base.procedure,
    windowsSeconds:input.windowsSeconds
  },
  credentialGovernance:{
    businessRuleImmutable:true,
    credentialStatus:['ACTIVE','SUSPENDED','REVOKED'],
    securityAuthorityCanSettle:false,
    securityAuthorityCanMutateTradeState:false,
    securityAuthorityCanMutatePolicy:false,
    securityAuthorityCanSweep:false,
    suspendedOrRevokedCredentialNewAttestation:'REJECT',
    livenessAfterCredentialFailure:'USE_EXISTING_STATE_DEADLINE_THEN_PRECOMMITTED_PROTOCOL_PATH'
  },
  settlement:{
    allowedFinalOutcomes:['RELEASE_TO_SUPPLIER','REFUND_TO_BUYER'],
    escrowAmountWei:input.escrowAmountWei,
    partialSettlement:'OUT_OF_MVP',
    withdrawalPattern:'PULL_PAYMENT',
    unilateralAdminFundRedirection:false,
    externalArbitratorDirectFundAccess:false,
    contextualFallback:{
      buyerInspectionTimeout:{name:input.fallbackPolicy.buyerInspectionTimeout,encoding:outcomeCode(input.fallbackPolicy.buyerInspectionTimeout)},
      executionHold:{name:input.fallbackPolicy.executionHold,encoding:outcomeCode(input.fallbackPolicy.executionHold)},
      evidenceHold:{name:input.fallbackPolicy.evidenceHold,encoding:outcomeCode(input.fallbackPolicy.evidenceHold)},
      inspectorEscalated:{name:input.fallbackPolicy.inspectorEscalated,encoding:outcomeCode(input.fallbackPolicy.inspectorEscalated)}
    },
    fallbackMutableAfterProposal:false,
    externalArbitratorChoices:['RELEASE_TO_SUPPLIER','REFUND_TO_BUYER']
  },
  stateRules:{
    supplierSilenceOrPreShipmentFailure:'REFUND_TO_BUYER',
    supplierPass:'AWAIT_BUYER',
    supplierReview:'SUPPLIER_HOLD',
    buyerPass:'ACCEPTANCE_PENDING',
    buyerAcceptanceTimeout:'RELEASE_TO_SUPPLIER',
    buyerReview:'DISPUTED_PRIMARY',
    primaryTimeout:'DISPUTED_BACKUP',
    backupTimeout:'ESCALATED',
    replayInconsistent:'EXECUTION_HOLD',
    exceptionExit:'MUTUAL_RESOLUTION_WINDOW_THEN_EXTERNAL_ARBITRATION_THEN_CONTEXTUAL_PRECOMMITTED_FALLBACK'
  },
  claimBoundary:{
    blockchainProvesPhysicalTruth:false,
    blockchainProvesAiCorrectness:false,
    stationSignatureProvesHonestAiExecution:false,
    replayConsistentMeansQualityCorrect:false,
    inspectorOrArbitratorIsInfallible:false,
    publicDatasetIsProductionManufacturingData:false
  },
  versioning:{
    activePolicyMutable:false,
    materialChangeRequiresNewPolicyAndFreshAcceptance:true,
    patch2PolicyReusedForPatch3:false
  }
};

const preimage=structuredClone(policy);
preimage.hashing.policyHash=ZERO;
const canonicalPreimage=jcs(preimage);
const policyHash=E.keccak256(E.toUtf8Bytes(canonicalPreimage));
policy.hashing.policyHash=policyHash;
const canonicalFinal=jcs(policy);

fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json'),canonicalPreimage+'\n');
fs.writeFileSync(path.join(outDir,'PATCH3_POLICY_V1_2_FINAL.jcs.json'),canonicalFinal+'\n');
fs.writeFileSync(path.join(outDir,'PATCH3_POLICY_V1_2_FINAL.json'),JSON.stringify(policy,null,2)+'\n');
fs.writeFileSync(path.join(outDir,'PATCH3_POLICY_V1_2_COMMITMENT.json'),JSON.stringify({
  schema:'inspectescrow.patch3-policy-commitment/1.0.0',
  policyVersion:2,
  schemaVersion:'1.2.0',
  policyId:policy.policyId,
  policyHash,
  parentPolicyHash:base.hashing.policyHash,
  tradeId:input.tradeId,
  verifyingContract:input.verifyingContract,
  credentialRegistry:input.credentialRegistry,
  fallbackPolicy:input.fallbackPolicy,
  windowsSeconds:input.windowsSeconds,
  selfHashRecomputation:E.keccak256(E.toUtf8Bytes(jcs({...policy,hashing:{...policy.hashing,policyHash:ZERO}})))===policyHash
},null,2)+'\n');

console.log(JSON.stringify({status:'PASS',policyHash,policyId:policy.policyId,parentPolicyHash:base.hashing.policyHash},null,2));
