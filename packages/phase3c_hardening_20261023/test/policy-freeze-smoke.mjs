import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import * as E from 'ethers';

const BUILD='.patch3-build';
const red=JSON.parse(fs.readFileSync(path.join(BUILD,'PATCH3_RED_TEAM_RESULTS.json'),'utf8'));
const templatePath='packages/phase3c_hardening_20261023/policy/PATCH3_POLICY_INPUT_TEMPLATE.json';
const template=JSON.parse(fs.readFileSync(templatePath,'utf8'));
const provider=new E.JsonRpcProvider('http://127.0.0.1:18546',undefined,{cacheTimeout:-1});
const addresses=[];
for(let i=0;i<12;i++) addresses.push(await (await provider.getSigner(i)).getAddress());

const input={
  ...template,
  status:'TEST_FIXTURE',
  verifyingContract:red.contract,
  credentialRegistry:red.credentialRegistry,
  credentialAuthority:addresses[0],
  tradeId:E.keccak256(E.toUtf8Bytes('PATCH3_POLICY_FREEZE_SMOKE_TRADE')),
  roles:{
    supplier:addresses[1],
    buyer:addresses[2],
    primaryInspector:addresses[3],
    backupInspector:addresses[4],
    externalArbitrator:addresses[5],
    supplierStation:addresses[6],
    buyerStation:addresses[7],
    primaryInspectorStation:addresses[8],
    backupInspectorStation:addresses[9],
    externalArbitratorStation:addresses[10]
  }
};

const inputPath=path.join(BUILD,'PATCH3_POLICY_INPUT_SMOKE.json');
const outDir=path.join(BUILD,'policy-smoke');
fs.writeFileSync(inputPath,JSON.stringify(input,null,2)+'\n');

const run=spawnSync(
  process.execPath,
  ['packages/phase3c_hardening_20261023/policy/generate-patch3-policy.mjs',inputPath,outDir],
  {encoding:'utf8'}
);
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
if(run.status!==0) throw new Error('PATCH3 policy generator failed');

const commitment=JSON.parse(fs.readFileSync(path.join(outDir,'PATCH3_POLICY_V1_2_COMMITMENT.json'),'utf8'));
const policy=JSON.parse(fs.readFileSync(path.join(outDir,'PATCH3_POLICY_V1_2_FINAL.json'),'utf8'));
if(commitment.selfHashRecomputation!==true) throw new Error('Policy self-hash recomputation failed');
if(commitment.policyHash===policy.parentPolicyHash) throw new Error('PATCH3 policy unexpectedly reused PATCH2 policy hash');
if(policy.policyVersion!==2 || policy.schemaVersion!=='1.2.0') throw new Error('PATCH3 policy version mismatch');
if(policy.settlement.contextualFallback.buyerInspectionTimeout.name!=='RELEASE_TO_SUPPLIER') throw new Error('Buyer timeout fallback mismatch');
for(const k of ['executionHold','evidenceHold','inspectorEscalated']){
  if(policy.settlement.contextualFallback[k].name!=='REFUND_TO_BUYER') throw new Error(k+' fallback mismatch');
}
if(policy.credentialGovernance.securityAuthorityCanSettle!==false) throw new Error('Credential authority settlement boundary violated');
if(policy.credentialGovernance.securityAuthorityCanMutateTradeState!==false) throw new Error('Credential authority state boundary violated');
if(!policy.attestation.inspectorDecisionMustBind.includes('decisionEvidenceHash')) throw new Error('Inspector decision evidence hash not committed');
if(policy.trade.verifyingContract.toLowerCase()!==red.contract.toLowerCase()) throw new Error('verifyingContract mismatch');
if(policy.trade.credentialRegistry.toLowerCase()!==red.credentialRegistry.toLowerCase()) throw new Error('registry mismatch');

const result={
  schema:'inspectescrow.patch3-policy-freeze-smoke/1.0.0',
  status:'PASS',
  policyHash:commitment.policyHash,
  parentPolicyHash:commitment.parentPolicyHash,
  policyId:commitment.policyId,
  selfHashRecomputation:true,
  policyVersion:2,
  schemaVersion:'1.2.0',
  newPolicyHashDistinctFromPatch2:true,
  contextualFallbackCommitted:true,
  credentialAuthorityBoundaryCommitted:true,
  inspectorDecisionEvidenceHashCommitted:true
};
fs.writeFileSync(path.join(BUILD,'PATCH3_POLICY_FREEZE_SMOKE_RESULT.json'),JSON.stringify(result,null,2)+'\n');
console.log('PASS PATCH3 policy generator and ZERO_POLICY_HASH_PREIMAGE self-hash gate');
console.log(JSON.stringify(result,null,2));
provider.destroy();
