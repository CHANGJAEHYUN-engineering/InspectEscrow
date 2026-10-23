import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as E from 'ethers';

const BUILD='.patch3-build';
const files=fs.readdirSync(BUILD);
const abiFile=files.find(x=>x.endsWith('_InspectEscrowPatch3.abi'));
const binFile=files.find(x=>x.endsWith('_InspectEscrowPatch3.bin'));
const registryAbiFile=files.find(x=>x.endsWith('_CredentialRegistryPatch3.abi'));
const registryBinFile=files.find(x=>x.endsWith('_CredentialRegistryPatch3.bin'));
if(!abiFile||!binFile||!registryAbiFile||!registryBinFile) throw Error('PATCH3 compile outputs not found');
const abi=JSON.parse(fs.readFileSync(path.join(BUILD,abiFile),'utf8'));
const bytecode='0x'+fs.readFileSync(path.join(BUILD,binFile),'utf8').trim();
const registryAbi=JSON.parse(fs.readFileSync(path.join(BUILD,registryAbiFile),'utf8'));
const registryBytecode='0x'+fs.readFileSync(path.join(BUILD,registryBinFile),'utf8').trim();

const checks=[];
const pass=name=>{checks.push(name);console.log('PASS',name);};

const provider=new E.JsonRpcProvider('http://127.0.0.1:18546',undefined,{cacheTimeout:-1});
assert.equal(Number((await provider.getNetwork()).chainId),31338,'PATCH3 TEST CHAIN ONLY');

const signers=[];
for(let i=0;i<12;i++) signers.push(await provider.getSigner(i));
const [
  authority,supplier,buyer,primary,backup,arbitrator,
  supplierStation,buyerStation,primaryStation,backupStation,arbitratorStation,attacker
]=signers;

const addr=async s=>s.getAddress();
const addresses=await Promise.all(signers.map(addr));

const registry=await new E.ContractFactory(registryAbi,registryBytecode,authority).deploy(addresses[0]);
await registry.waitForDeployment();
const registryAddress=await registry.getAddress();

const deployed=await new E.ContractFactory(abi,bytecode,authority).deploy(registryAddress);
await deployed.waitForDeployment();
const contractAddress=await deployed.getAddress();
const c=deployed;

const runtimeCode=await provider.getCode(contractAddress);
const runtimeBytes=(runtimeCode.length-2)/2;
assert.ok(runtimeBytes<=24576,'Escrow runtime exceeds EIP-170');
pass('optimized Escrow runtime satisfies EIP-170: '+runtimeBytes+' bytes');

const domain={name:'InspectEscrow',version:'1',chainId:31338,verifyingContract:contractAddress};
const types={
  StationAttestation:[
    {name:'tradeId',type:'bytes32'},{name:'role',type:'uint8'},{name:'station',type:'address'},
    {name:'attempt',type:'uint32'},{name:'sessionNonce',type:'bytes32'},{name:'policyHash',type:'bytes32'},
    {name:'modelBundleHash',type:'bytes32'},{name:'captureProfileHash',type:'bytes32'},
    {name:'specimenManifestHash',type:'bytes32'},{name:'evidencePackageHash',type:'bytes32'},
    {name:'aggregateScoreScaled',type:'uint128'},{name:'scoreSchemaId',type:'bytes32'},
    {name:'inspectionValidity',type:'uint8'},{name:'invalidReason',type:'uint8'},
    {name:'issuedAt',type:'uint64'},{name:'validUntil',type:'uint64'}
  ],
  ReplayAttestation:[
    {name:'tradeId',type:'bytes32'},{name:'stage',type:'uint8'},{name:'inspectorActor',type:'address'},
    {name:'policyHash',type:'bytes32'},{name:'supplierEvidenceHash',type:'bytes32'},
    {name:'buyerEvidenceHash',type:'bytes32'},{name:'replayReportHash',type:'bytes32'},
    {name:'consistent',type:'bool'},{name:'nonce',type:'bytes32'},
    {name:'issuedAt',type:'uint64'},{name:'validUntil',type:'uint64'}
  ],
  InspectorDecisionAttestation:[
    {name:'tradeId',type:'bytes32'},{name:'stage',type:'uint8'},{name:'inspectorActor',type:'address'},
    {name:'policyHash',type:'bytes32'},{name:'supplierEvidenceHash',type:'bytes32'},
    {name:'buyerEvidenceHash',type:'bytes32'},{name:'replayReportHash',type:'bytes32'},
    {name:'decision',type:'uint8'},{name:'reasonCode',type:'bytes32'},{name:'nonce',type:'bytes32'},
    {name:'issuedAt',type:'uint64'},{name:'validUntil',type:'uint64'}
  ],
  ArbitrationDecisionAttestation:[
    {name:'tradeId',type:'bytes32'},{name:'arbitratorActor',type:'address'},
    {name:'policyHash',type:'bytes32'},{name:'supplierEvidenceHash',type:'bytes32'},
    {name:'buyerEvidenceHash',type:'bytes32'},{name:'decision',type:'uint8'},
    {name:'reasonCode',type:'bytes32'},{name:'decisionEvidenceHash',type:'bytes32'},
    {name:'nonce',type:'bytes32'},{name:'issuedAt',type:'uint64'},{name:'validUntil',type:'uint64'}
  ]
};

const h=x=>E.keccak256(E.toUtf8Bytes('PATCH3_RED_TEAM:'+x));
async function expectRevert(name,fn){
  let err;
  try{await fn();}catch(e){err=e;}
  assert.ok(err,name+' must revert');
  pass(name);
}
async function mine(seconds){
  await provider.send('evm_increaseTime',[seconds]);
  await provider.send('evm_mine',[]);
}
async function timeWindow(){
  const b=await provider.getBlock('latest');
  return {issuedAt:b.timestamp,validUntil:b.timestamp+120};
}
async function signTyped(signer,type,message){
  return signer.signTypedData(domain,{[type]:types[type]},message);
}

for(const station of [supplierStation,buyerStation,primaryStation,backupStation,arbitratorStation]){
  await (await registry.connect(authority).registerCredential(await addr(station),h('REGISTER:'+await addr(station)))).wait();
}
pass('five signing credentials registered ACTIVE');

function terms(label,overrides={}){
  return {
    tradeId:h('TRADE:'+label),
    supplier:addresses[1],
    buyer:addresses[2],
    primaryInspector:addresses[3],
    backupInspector:addresses[4],
    externalArbitrator:addresses[5],
    supplierStation:addresses[6],
    buyerStation:addresses[7],
    primaryInspectorStation:addresses[8],
    backupInspectorStation:addresses[9],
    externalArbitratorStation:addresses[10],
    escrowAmount:E.parseEther('0.001'),
    policyVersion:1,
    policyHash:h('POLICY'),
    modelBundleHash:h('MODEL'),
    captureProfileHash:h('CAPTURE'),
    productSpecHash:h('PRODUCT'),
    requiredViewSetHash:h('VIEWS'),
    scoreSchemaId:h('SCORE_SCHEMA'),
    thresholdScaled:500n,
    scoreScaleExponent:3,
    scoreMinScaled:0n,
    scoreMaxScaled:1000n,
    maxSupplierRetries:1,
    maxBuyerRetries:1,
    finalFallbackOutcome:2,
    windows:{
      supplierInspection:60,buyerInspection:60,buyerAcceptance:60,
      primaryInspector:60,backupInspector:60,mutualResolution:30,externalArbitration:30
    },
    ...overrides
  };
}
async function setup(label){
  const t=terms(label);
  await (await c.connect(supplier).proposeTrade(t)).wait();
  await (await c.connect(supplier).acceptPolicy(t.tradeId)).wait();
  await (await c.connect(buyer).acceptPolicy(t.tradeId)).wait();
  await (await c.connect(primary).acceptInspectorAssignment(t.tradeId)).wait();
  await (await c.connect(backup).acceptInspectorAssignment(t.tradeId)).wait();
  await (await c.connect(arbitrator).acceptInspectorAssignment(t.tradeId)).wait();
  await (await c.connect(buyer).fund(t.tradeId,{value:t.escrowAmount})).wait();
  await (await c.connect(attacker).activate(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),5n);
  return t;
}
async function inspectionMessage(t,role,score,tag,patch={}){
  const tw=await timeWindow();
  const station=role===0?addresses[6]:addresses[7];
  return {
    tradeId:t.tradeId,role,station,attempt:1,sessionNonce:h(tag+':SESSION'),
    policyHash:t.policyHash,modelBundleHash:t.modelBundleHash,captureProfileHash:t.captureProfileHash,
    specimenManifestHash:h(tag+':SPECIMEN'),evidencePackageHash:h(tag+':EVIDENCE'),
    aggregateScoreScaled:BigInt(score),scoreSchemaId:t.scoreSchemaId,
    inspectionValidity:0,invalidReason:0,...tw,...patch
  };
}
async function submitInspection(t,role,score,tag){
  const m=await inspectionMessage(t,role,score,tag);
  const station=role===0?supplierStation:buyerStation;
  const actor=role===0?supplier:buyer;
  const sig=await signTyped(station,'StationAttestation',m);
  await (await c.connect(actor).submitInspection(m,sig)).wait();
  return m;
}
async function submitInvalidInspection(t,role,tag){
  const m=await inspectionMessage(t,role,0,tag,{inspectionValidity:1,invalidReason:1});
  const station=role===0?supplierStation:buyerStation;
  const actor=role===0?supplier:buyer;
  const sig=await signTyped(station,'StationAttestation',m);
  await (await c.connect(actor).submitInspection(m,sig)).wait();
  return m;
}
async function replayMessage(t,consistent,tag,stage=0){
  const tw=await timeWindow();
  const si=await c.getInspection(t.tradeId,0);
  const bi=await c.getInspection(t.tradeId,1);
  const inspectorActor=stage===0?addresses[3]:addresses[4];
  return {
    tradeId:t.tradeId,stage,inspectorActor,policyHash:t.policyHash,
    supplierEvidenceHash:si.evidencePackageHash,buyerEvidenceHash:bi.evidencePackageHash,
    replayReportHash:h(tag+':REPLAY'),consistent,nonce:h(tag+':REPLAY_NONCE'),...tw
  };
}
async function arbitrationMessage(t,decision,tag){
  const tw=await timeWindow();
  const si=await c.getInspection(t.tradeId,0);
  const bi=await c.getInspection(t.tradeId,1);
  return {
    tradeId:t.tradeId,arbitratorActor:addresses[5],policyHash:t.policyHash,
    supplierEvidenceHash:si.evidencePackageHash,buyerEvidenceHash:bi.evidencePackageHash,
    decision,reasonCode:h(tag+':REASON'),decisionEvidenceHash:h(tag+':DECISION_EVIDENCE'),
    nonce:h(tag+':ARB_NONCE'),...tw
  };
}

// G1: Credential Authority must stay outside all business roles.
{
  const bad=terms('authority-collision',{supplier:addresses[0]});
  await expectRevert('credential authority cannot be Supplier/Buyer/Inspector/Station',async()=>{
    await c.connect(authority).proposeTrade(bad);
  });
}

// G2: Invalid signature must not mutate state or create a hold.
{
  const t=await setup('invalid-signature');
  const m=await inspectionMessage(t,0,100,'BAD_SIG');
  const sig=await signTyped(attacker,'StationAttestation',m);
  await expectRevert('invalid Station signature is revert-only, not a state-changing DoS',async()=>{
    await c.connect(supplier).submitInspection(m,sig);
  });
  assert.equal(await c.getTradeState(t.tradeId),5n);
  pass('invalid signature leaves trade in AWAIT_SUPPLIER');
  await mine(61);
  await (await c.connect(attacker).invokeSupplierInspectionTimeout(t.tradeId)).wait();
  await (await c.connect(buyer).withdraw()).wait();
}

// G3: Policy tamper is rejected after funding.
{
  const t=await setup('policy-tamper');
  const m=await inspectionMessage(t,0,100,'TAMPER',{policyHash:h('OTHER_POLICY')});
  const sig=await signTyped(supplierStation,'StationAttestation',m);
  await expectRevert('funded trade rejects policyHash tampering',async()=>{
    await c.connect(supplier).submitInspection(m,sig);
  });
  assert.equal(await c.getTradeState(t.tradeId),5n);
  await mine(61);
  await (await c.connect(attacker).invokeSupplierInspectionTimeout(t.tradeId)).wait();
  await (await c.connect(buyer).withdraw()).wait();
}

// G4: Primary and Backup signing keys are not interchangeable; unauthorized actor cannot settle.
{
  const t=await setup('inspector-key-separation');
  await submitInspection(t,0,100,'KEYSEP_SUPPLIER');
  await submitInspection(t,1,600,'KEYSEP_BUYER');
  assert.equal(await c.getTradeState(t.tradeId),12n);

  const r=await replayMessage(t,true,'KEYSEP');
  const wrongSig=await signTyped(backupStation,'ReplayAttestation',r);
  await expectRevert('Backup Station signature cannot authorize Primary replay',async()=>{
    await c.connect(primary).recordReplayResult(r,wrongSig);
  });
  assert.equal((await c.getReplay(t.tradeId))[0],0n);

  const goodSig=await signTyped(primaryStation,'ReplayAttestation',r);
  await (await c.connect(primary).recordReplayResult(r,goodSig)).wait();
  assert.equal((await c.getReplay(t.tradeId))[0],1n);
  pass('Primary replay accepts only Primary Station signature');

  const tw=await timeWindow();
  const d={
    tradeId:t.tradeId,stage:0,inspectorActor:addresses[3],policyHash:t.policyHash,
    supplierEvidenceHash:r.supplierEvidenceHash,buyerEvidenceHash:r.buyerEvidenceHash,
    replayReportHash:r.replayReportHash,decision:2,reasonCode:h('KEYSEP:DECISION'),
    nonce:h('KEYSEP:DECISION_NONCE'),...tw
  };
  const dsig=await signTyped(primaryStation,'InspectorDecisionAttestation',d);
  await expectRevert('random actor cannot submit a valid Inspector decision',async()=>{
    await c.connect(attacker).submitInspectorDecision(d,dsig);
  });
  await (await c.connect(primary).submitInspectorDecision(d,dsig)).wait();
  assert.equal(await c.getTradeState(t.tradeId),18n);
  await (await c.connect(buyer).withdraw()).wait();
}

// G5: Replay mismatch must enter a bounded hold, then remain finitely resolvable.
{
  const t=await setup('execution-hold');
  await submitInspection(t,0,100,'HOLD_SUPPLIER');
  await submitInspection(t,1,600,'HOLD_BUYER');
  const r=await replayMessage(t,false,'HOLD');
  const sig=await signTyped(primaryStation,'ReplayAttestation',r);
  await (await c.connect(primary).recordReplayResult(r,sig)).wait();
  assert.equal(await c.getTradeState(t.tradeId),14n);
  const deadline=await c.getActionDeadline(t.tradeId);
  assert.ok(deadline>0n);
  pass('Replay mismatch enters EXECUTION_HOLD with finite mutual-resolution deadline');

  await mine(31);
  await (await c.connect(attacker).escalateToExternalArbitration(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),21n);
  await mine(31);
  await (await c.connect(attacker).executeFinalFallback(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),18n);
  await (await c.connect(buyer).withdraw()).wait();
  pass('EXECUTION_HOLD reaches terminal fallback with all decision actors silent');
}

// L1: SUPPLIER_REINSPECTION has a deterministic timeout refund.
{
  const t=await setup('supplier-reinspection-timeout');
  await submitInvalidInspection(t,0,'SUP_REINSPECT_INVALID');
  assert.equal(await c.getTradeState(t.tradeId),6n);
  assert.ok((await c.getActionDeadline(t.tradeId))>0n);
  await mine(61);
  await (await c.connect(attacker).invokeReinspectionTimeout(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),18n);
  await (await c.connect(buyer).withdraw()).wait();
  pass('SUPPLIER_REINSPECTION timeout reaches REFUNDED and withdraw');
}

// L2: SUPPLIER_HOLD has a deterministic timeout refund.
{
  const t=await setup('supplier-hold-timeout');
  await submitInspection(t,0,500,'SUP_HOLD_REVIEW');
  assert.equal(await c.getTradeState(t.tradeId),7n);
  assert.ok((await c.getActionDeadline(t.tradeId))>0n);
  await mine(61);
  await (await c.connect(attacker).invokeSupplierHoldTimeout(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),18n);
  await (await c.connect(buyer).withdraw()).wait();
  pass('SUPPLIER_HOLD timeout reaches REFUNDED and withdraw');
}

// L3: ACCEPTANCE_PENDING cannot be held forever by a silent Buyer.
{
  const t=await setup('acceptance-timeout');
  await submitInspection(t,0,100,'ACCEPT_SUPPLIER');
  await submitInspection(t,1,100,'ACCEPT_BUYER');
  assert.equal(await c.getTradeState(t.tradeId),11n);
  assert.ok((await c.getActionDeadline(t.tradeId))>0n);
  await mine(61);
  await (await c.connect(attacker).invokeAcceptanceTimeout(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),17n);
  await (await c.connect(supplier).withdraw()).wait();
  pass('ACCEPTANCE_PENDING timeout reaches RELEASED and Supplier withdraw');
}

// L4: BUYER_INSPECTION_TIMEOUT -> arbitration -> valid signed arbitrator decision.
{
  const t=await setup('buyer-inspection-timeout');
  await submitInspection(t,0,100,'BUYER_TIMEOUT_SUPPLIER');
  assert.equal(await c.getTradeState(t.tradeId),8n);
  await mine(61);
  await (await c.connect(attacker).invokeBuyerInspectionTimeout(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),10n);
  assert.ok((await c.getActionDeadline(t.tradeId))>0n);

  await mine(31);
  await (await c.connect(attacker).escalateToExternalArbitration(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),21n);

  const a=await arbitrationMessage(t,2,'BUYER_TIMEOUT_ARB');
  const sig=await signTyped(arbitratorStation,'ArbitrationDecisionAttestation',a);
  await (await c.connect(arbitrator).submitArbitrationDecision(a,sig)).wait();
  assert.equal(await c.getTradeState(t.tradeId),18n);
  await (await c.connect(buyer).withdraw()).wait();
  pass('BUYER_INSPECTION_TIMEOUT reaches signed external arbitration and REFUNDED');
}

// L5: BUYER_REINSPECTION timeout -> EVIDENCE_HOLD -> finite fallback.
{
  const t=await setup('evidence-hold-timeout');
  await submitInspection(t,0,100,'EVIDENCE_SUPPLIER');
  await submitInvalidInspection(t,1,'EVIDENCE_BUYER_INVALID');
  assert.equal(await c.getTradeState(t.tradeId),9n);
  await mine(61);
  await (await c.connect(attacker).invokeReinspectionTimeout(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),15n);
  assert.ok((await c.getActionDeadline(t.tradeId))>0n);

  await mine(31);
  await (await c.connect(attacker).escalateToExternalArbitration(t.tradeId)).wait();
  await mine(31);
  await (await c.connect(attacker).executeFinalFallback(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),18n);
  await (await c.connect(buyer).withdraw()).wait();
  pass('EVIDENCE_HOLD reaches precommitted terminal fallback');
}

// L6: Primary silence -> Backup; Backup key is independent and can settle.
{
  const t=await setup('primary-timeout-backup-success');
  await submitInspection(t,0,100,'BACKUP_SUPPLIER');
  await submitInspection(t,1,600,'BACKUP_BUYER');
  assert.equal(await c.getTradeState(t.tradeId),12n);
  await mine(61);
  await (await c.connect(attacker).activateBackupInspector(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),13n);

  const r=await replayMessage(t,true,'BACKUP_SUCCESS',1);
  const rsig=await signTyped(backupStation,'ReplayAttestation',r);
  await (await c.connect(backup).recordReplayResult(r,rsig)).wait();

  const tw=await timeWindow();
  const d={
    tradeId:t.tradeId,stage:1,inspectorActor:addresses[4],policyHash:t.policyHash,
    supplierEvidenceHash:r.supplierEvidenceHash,buyerEvidenceHash:r.buyerEvidenceHash,
    replayReportHash:r.replayReportHash,decision:2,reasonCode:h('BACKUP_SUCCESS:DECISION'),
    nonce:h('BACKUP_SUCCESS:DECISION_NONCE'),...tw
  };
  const dsig=await signTyped(backupStation,'InspectorDecisionAttestation',d);
  await (await c.connect(backup).submitInspectorDecision(d,dsig)).wait();
  assert.equal(await c.getTradeState(t.tradeId),18n);
  await (await c.connect(buyer).withdraw()).wait();
  pass('DISPUTED_PRIMARY timeout fails over to independent Backup and settles');
}

// L7: Both Inspectors silent -> ESCALATED -> arbitration window -> fallback.
{
  const t=await setup('backup-timeout-escalated');
  await submitInspection(t,0,100,'ESC_SUPPLIER');
  await submitInspection(t,1,600,'ESC_BUYER');
  await mine(61);
  await (await c.connect(attacker).activateBackupInspector(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),13n);
  await mine(61);
  await (await c.connect(attacker).escalateAfterBackupTimeout(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),16n);
  assert.ok((await c.getActionDeadline(t.tradeId))>0n);

  await mine(31);
  await (await c.connect(attacker).escalateToExternalArbitration(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),21n);
  await mine(31);
  await (await c.connect(attacker).executeFinalFallback(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),18n);
  await (await c.connect(buyer).withdraw()).wait();
  pass('ESCALATED after both Inspector timeouts reaches precommitted fallback');
}

// N1: Credential registry governance cannot be called by a random account.
await expectRevert('random account cannot suspend a credential',async()=>{
  await registry.connect(attacker).suspendCredential(addresses[7],h('UNAUTHORIZED_SUSPEND'));
});

// N2: EIP-712 domain/timestamp attacks must all be revert-only.
{
  const t=await setup('eip712-negative-matrix');
  const base=await inspectionMessage(t,0,100,'DOMAIN_MATRIX');

  const wrongChainDomain={...domain,chainId:31339};
  const wrongChainSig=await supplierStation.signTypedData(
    wrongChainDomain,{StationAttestation:types.StationAttestation},base
  );
  await expectRevert('cross-chain Station signature is rejected',async()=>{
    await c.connect(supplier).submitInspection(base,wrongChainSig);
  });

  const wrongContractDomain={...domain,verifyingContract:addresses[11]};
  const wrongContractSig=await supplierStation.signTypedData(
    wrongContractDomain,{StationAttestation:types.StationAttestation},base
  );
  await expectRevert('cross-contract Station signature is rejected',async()=>{
    await c.connect(supplier).submitInspection(base,wrongContractSig);
  });

  const otherTradeMessage={...base,tradeId:h('OTHER_TRADE_FOR_SIGNATURE')};
  const crossTradeSig=await supplierStation.signTypedData(
    domain,{StationAttestation:types.StationAttestation},otherTradeMessage
  );
  await expectRevert('cross-trade Station signature is rejected',async()=>{
    await c.connect(supplier).submitInspection(base,crossTradeSig);
  });

  const latest=await provider.getBlock('latest');
  const expired={
    ...base,
    sessionNonce:h('EXPIRED:SESSION'),
    issuedAt:latest.timestamp-120,
    validUntil:latest.timestamp-1
  };
  const expiredSig=await signTyped(supplierStation,'StationAttestation',expired);
  await expectRevert('expired Station attestation is rejected',async()=>{
    await c.connect(supplier).submitInspection(expired,expiredSig);
  });

  const future={
    ...base,
    sessionNonce:h('FUTURE:SESSION'),
    issuedAt:latest.timestamp+10,
    validUntil:latest.timestamp+120
  };
  const futureSig=await signTyped(supplierStation,'StationAttestation',future);
  await expectRevert('future-issued Station attestation is rejected',async()=>{
    await c.connect(supplier).submitInspection(future,futureSig);
  });

  assert.equal(await c.getTradeState(t.tradeId),5n);
  pass('domain/timestamp attack matrix leaves trade state unchanged');
  await mine(61);
  await (await c.connect(attacker).invokeSupplierInspectionTimeout(t.tradeId)).wait();
  await (await c.connect(buyer).withdraw()).wait();
}

// N3: Nonce replay must be blocked even when the attempt number changes.
{
  const t=await setup('nonce-reuse');
  const first=await inspectionMessage(t,0,0,'NONCE_REUSE_FIRST',{
    inspectionValidity:1,
    invalidReason:1,
    sessionNonce:h('FIXED_REPLAY_NONCE')
  });
  const firstSig=await signTyped(supplierStation,'StationAttestation',first);
  await (await c.connect(supplier).submitInspection(first,firstSig)).wait();
  assert.equal(await c.getTradeState(t.tradeId),6n);

  const second=await inspectionMessage(t,0,100,'NONCE_REUSE_SECOND',{
    attempt:2,
    sessionNonce:h('FIXED_REPLAY_NONCE')
  });
  const secondSig=await signTyped(supplierStation,'StationAttestation',second);
  await expectRevert('same scoped Station nonce cannot be reused on a later attempt',async()=>{
    await c.connect(supplier).submitInspection(second,secondSig);
  });
  assert.equal(await c.getTradeState(t.tradeId),6n);
  await mine(61);
  await (await c.connect(attacker).invokeReinspectionTimeout(t.tradeId)).wait();
  await (await c.connect(buyer).withdraw()).wait();
}

// N4: Credential Authority has security-control authority, not settlement authority.
{
  const t=await setup('authority-no-settlement');
  await submitInspection(t,0,100,'AUTH_SUPPLIER');
  await submitInspection(t,1,600,'AUTH_BUYER');
  const r=await replayMessage(t,true,'AUTH_REPLAY');
  const rsig=await signTyped(primaryStation,'ReplayAttestation',r);
  await (await c.connect(primary).recordReplayResult(r,rsig)).wait();

  const tw=await timeWindow();
  const d={
    tradeId:t.tradeId,stage:0,inspectorActor:addresses[3],policyHash:t.policyHash,
    supplierEvidenceHash:r.supplierEvidenceHash,buyerEvidenceHash:r.buyerEvidenceHash,
    replayReportHash:r.replayReportHash,decision:2,reasonCode:h('AUTH:DECISION'),
    nonce:h('AUTH:DECISION_NONCE'),...tw
  };
  const dsig=await signTyped(primaryStation,'InspectorDecisionAttestation',d);
  await expectRevert('Credential Authority cannot submit Inspector settlement decision',async()=>{
    await c.connect(authority).submitInspectorDecision(d,dsig);
  });
  await (await c.connect(primary).submitInspectorDecision(d,dsig)).wait();
  await (await c.connect(buyer).withdraw()).wait();
}

// G6: A credential incident before the first inspection must still have a finite exit.
//     Then revoke the external-arbitrator Station too, proving fallback is independent of it.
{
  const t=await setup('credential-liveness');
  await (await registry.connect(authority).suspendCredential(addresses[6],h('SUPPLIER_STATION_SUSPEND'))).wait();
  await (await c.connect(attacker).invokeCredentialHold(t.tradeId,addresses[6])).wait();
  assert.equal(await c.getTradeState(t.tradeId),20n);
  assert.ok((await c.getActionDeadline(t.tradeId))>0n);
  pass('suspended currently-required Station enters bounded CREDENTIAL_HOLD');

  await mine(31);
  await (await c.connect(attacker).escalateToExternalArbitration(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),21n);

  await (await registry.connect(authority).revokeCredential(addresses[10],h('ARBITRATOR_STATION_REVOKE'))).wait();
  const a=await arbitrationMessage(t,2,'CRED_LIVE');
  const asig=await signTyped(arbitratorStation,'ArbitrationDecisionAttestation',a);
  await expectRevert('revoked Arbitrator Station cannot authorize arbitration decision',async()=>{
    await c.connect(arbitrator).submitArbitrationDecision(a,asig);
  });

  await mine(31);
  await (await c.connect(attacker).executeFinalFallback(t.tradeId)).wait();
  assert.equal(await c.getTradeState(t.tradeId),18n);
  await (await c.connect(buyer).withdraw()).wait();
  pass('credential failure plus arbitrator-key failure still reaches precommitted terminal fallback');

  await expectRevert('REVOKED credential cannot be resumed',async()=>{
    await registry.connect(authority).resumeCredential(addresses[10],h('ILLEGAL_RESUME'));
  });
}

// Restore supplier station for any later trade; SUSPENDED may resume.
await (await registry.connect(authority).resumeCredential(addresses[6],h('SUPPLIER_STATION_RESTORE'))).wait();
pass('SUSPENDED credential can be restored for future trades');

// ABI surface check: no admin settlement/sweep backdoor was introduced.
const writeNames=abi.filter(x=>x.type==='function'&&!['view','pure'].includes(x.stateMutability)).map(x=>x.name);
for(const forbidden of [
  'adminSettle','forceRelease','forceRefund','sweep','setPolicy','setThreshold',
  'setFinalFallbackOutcome','registerCredential','suspendCredential','resumeCredential','revokeCredential'
]){
  assert.ok(!writeNames.includes(forbidden),'forbidden admin capability present: '+forbidden);
}
pass('no admin settlement, sweep, policy or fallback mutation function in ABI');

assert.equal(await c.accountingConserved(),true);
assert.equal(await c.unsettledEscrow(),0n);
assert.equal(await c.outstandingClaimable(),0n);
assert.equal(await c.totalFunded(),await c.totalWithdrawn());
pass('final accounting conserved after all red-team scenarios');

const result={
  scope:'PATCH3_LOCAL_SYNTHETIC_RED_TEAM',
  chainId:31338,
  contract:contractAddress,
  credentialRegistry:registryAddress,
  runtimeBytes,
  checks:checks.length,
  results:checks
};
fs.writeFileSync(path.join(BUILD,'PATCH3_RED_TEAM_RESULTS.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));

provider.destroy();
