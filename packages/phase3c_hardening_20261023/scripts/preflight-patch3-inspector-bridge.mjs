// PATCH3 pre-activation Inspector EIP-712 ABI and operational-readiness audit.
// READ ONLY. This does NOT perform AI inference or attest replay consistency.
// It does not create decisions, signatures, a transaction, or activate the trade.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {
  Contract,JsonRpcProvider,getAddress,keccak256,toUtf8Bytes,
  id,formatEther,TypedDataEncoder,verifyTypedData,AbiCoder
} from 'ethers';
const base='packages/phase3c_hardening_20261023';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const check=(ok,message)=>{if(!ok)throw Error(message)};
const rpc=process.env.PATCH3_RPC_URL;
check(typeof rpc==='string'&&/^https:\/\//.test(rpc),'Set PATCH3_RPC_URL to an HTTPS Sepolia RPC endpoint');
check(process.argv.length===2,'This inspector preflight accepts no flags; READ ONLY');
const input=read(base+'/policy/PATCH3_POLICY_INPUT.json');
const manifest=read(base+'/results/PATCH3_SEPOLIA_DEPLOYMENT.json');
const policy=read(base+'/policy/generated/PATCH3_POLICY_V1_2_FINAL.json');
const commitment=read(base+'/policy/generated/PATCH3_POLICY_V1_2_COMMITMENT.json');
const abi=read('.patch3-build/InspectEscrowPatch3.sol_InspectEscrowPatch3.abi');
const regAbi=read('.patch3-build/CredentialRegistryPatch3.sol_CredentialRegistryPatch3.abi');
const addr=getAddress(manifest.contracts.InspectEscrowPatch3.address);
const regAddr=getAddress(manifest.contracts.CredentialRegistryPatch3.address);
const tradeId=input.tradeId;
check(addr===getAddress('0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905'),
  'Unexpected Escrow contract address');
check(manifest.chainId===11155111&&input.chainId===11155111,
  'Expected Sepolia chainId=11155111');
check(policy.policyVersion===2&&commitment.policyVersion===2&&
  policy.trade.tradeId===tradeId&&commitment.tradeId===tradeId&&
  policy.hashing.policyHash===commitment.policyHash,
  'Expected actual PATCH3 policy v1.2 and matching Trade ID');
const policyPreimage=fs.readFileSync(base+'/policy/generated/PATCH3_POLICY_V1_2_HASH_PREIMAGE.jcs.json','utf8').trimEnd();
check(keccak256(toUtf8Bytes(policyPreimage))===commitment.policyHash,
  'Canonical policy preimage digest changed');
const p=new JsonRpcProvider(rpc);
check((await p.getNetwork()).chainId===11155111n,'RPC chain is not Sepolia');
for(const [label,a,expectedRuntime] of [
  ['Escrow',addr,manifest.contracts.InspectEscrowPatch3.runtimeCodeHash],
  ['Credential Registry',regAddr,manifest.contracts.CredentialRegistryPatch3.runtimeCodeHash]
]){
  const runtime=await p.getCode(a);
  check(runtime!=='0x'&&keccak256(runtime)===expectedRuntime,
    label+' runtime bytecode hash mismatch');
}
const c=new Contract(addr,abi,p);
const registry=new Contract(regAddr,regAbi,p);
const terms=await c.getTradeTerms(tradeId);
check(Number(terms.policyVersion)===2&&terms.policyHash===commitment.policyHash&&
  terms.escrowAmount===5000000000000000n,
  'Onchain trade terms mismatch');
const state=Number(await c.getTradeState(tradeId));
check(state===4&&await c.getActionDeadline(tradeId)===0n,
  'Trade must remain FUNDED(4); DO NOT activate during preflight');
check(await c.accountingConserved()&&await c.balanceCoversLiabilities(),
  'Failed accounting/liability check');
const onDomain=await c.eip712Domain();
const domain={
  name:'InspectEscrow',version:'1',chainId:11155111,verifyingContract:addr
};
check(onDomain.name===domain.name&&onDomain.version===domain.version &&
  onDomain.chainId===11155111n&&getAddress(onDomain.verifyingContract)===addr,
  'Onchain Inspector EIP712 domain mismatch');
const fields=name=>{
 const f=abi.find(x=>x.type==='function'&&x.name===name);
 check(f?.inputs?.[0]?.components,'Missing '+name+' tuple ABI');
 return f.inputs[0].components.map(x=>({name:x.name,type:x.type}));
};
const replayFields=fields('hashReplayAttestation');
const decisionFields=fields('hashInspectorDecision');
const expectedReplay=[
  ['tradeId','bytes32'],['stage','uint8'],['inspectorActor','address'],
  ['policyHash','bytes32'],['supplierEvidenceHash','bytes32'],
  ['buyerEvidenceHash','bytes32'],['replayReportHash','bytes32'],
  ['consistent','bool'],['nonce','bytes32'],['issuedAt','uint64'],
  ['validUntil','uint64']
].map(([name,type])=>({name,type}));
const expectedDecision=[
  ['tradeId','bytes32'],['stage','uint8'],['inspectorActor','address'],
  ['policyHash','bytes32'],['supplierEvidenceHash','bytes32'],
  ['buyerEvidenceHash','bytes32'],['replayReportHash','bytes32'],
  ['decision','uint8'],['reasonCode','bytes32'],
  ['decisionEvidenceHash','bytes32'],['nonce','bytes32'],
  ['issuedAt','uint64'],['validUntil','uint64']
].map(([name,type])=>({name,type}));
check(JSON.stringify(replayFields)===JSON.stringify(expectedReplay),
  'ReplayAttestation structure mismatch');
check(JSON.stringify(decisionFields)===JSON.stringify(expectedDecision),
  'PATCH3 InspectorDecisionAttestation requires NEW decisionEvidenceHash field');
const typeHash= (typeName,arr)=>id(typeName+'('+
  arr.map(field=>field.type+' '+field.name).join(',')+')');
check(typeHash('ReplayAttestation',replayFields)===
  await c.REPLAY_ATTESTATION_TYPEHASH(),'Replay EIP712 typehash differs from deployed contract');
check(typeHash('InspectorDecisionAttestation',decisionFields)===
  await c.INSPECTOR_DECISION_TYPEHASH(),'Inspector Decision EIP712 typehash differs from deployed contract');

// Read only: ensure staged Station hashes are immutable and digests still recover.
// Future Inspector attestation hashes must reference actual Supplier/Buyer onchain
// InspectionRecord anchors after those inspections have been submitted.
const dir='.patch3-local/'+tradeId.slice(2,14);
const evidence={};
for(const [role,roleIndex] of [['supplier',0],['buyer',1]]){
 const signed=read(dir+'/'+role+'.signed.json');
 const prepared=read(dir+'/'+role+'.prepared.json');
 const station=getAddress(input.roles[role+'Station']);
 check(signed.schema==='inspectescrow.patch3.station-signed-demo/1'&&
   signed.roleName===role&&getAddress(signed.station)===station,
   'Missing valid '+role+' Station envelope');
 check(signed.message.tradeId===tradeId&&signed.message.role===roleIndex &&
   signed.message.policyHash===terms.policyHash &&
   signed.message.evidencePackageHash===prepared.evidencePackageHash &&
   signed.message.specimenManifestHash===prepared.specimenManifestHash,
   role+' local Station anchor mismatch');
 const digest=TypedDataEncoder.hash(domain,signed.types,signed.message);
 check(digest===signed.digest&&
   getAddress(verifyTypedData(domain,signed.types,signed.message,signed.signature))===station&&
   await c.hashStationAttestation(signed.message)===digest,
   role+' Station digest/signer mismatch');
 check(!(await c.consumedDigest(digest)),
   role+' Station digest already used; expected pre-activation');
 evidence[role]={
   evidencePackageHash:signed.message.evidencePackageHash,
   stationDigest:digest,
   futureOnchainAnchorRequired:true
 };
}
const replay=await c.getReplay(tradeId);
check(Number(replay[0])===0&&replay[1]==='0x'+'00'.repeat(32),
  'Unexpected onchain replay record before inspections');
const gasPrice=await p.getFeeData();
const rpcFeeQuote=gasPrice.maxFeePerGas??gasPrice.gasPrice;
check(rpcFeeQuote!=null&&rpcFeeQuote>0n,'Missing Sepolia fee quote');
const feeCap=rpcFeeQuote>2_000_000_000n?rpcFeeQuote:2_000_000_000n;
const inspectorGasReserve=1_300_000n*feeCap; // 650k x 2 calls
const inspectors={};
for(const [label,actorRole,stationRole,index] of [
  ['primary','primaryInspector','primaryInspectorStation',0],
  ['backup','backupInspector','backupInspectorStation',1]
]){
 const actor=getAddress(input.roles[actorRole]);
 const station=getAddress(input.roles[stationRole]);
 check(getAddress(terms[actorRole])===actor&&
  getAddress(terms[stationRole])===station,
  'Frozen '+label+' Inspector addresses mismatch');
 const status=Number(await registry.status(station));
 check(status===1,label+' Inspector Station credential not ACTIVE');
 const balance=await p.getBalance(actor);
 inspectors[label]={
   actor,station,stage:index,
   credential:'ACTIVE',balanceEth:formatEther(balance),
   conservativeTwoTransactionBudgetEth:formatEther(inspectorGasReserve),
   gasBudgetAdequate:balance>=inspectorGasReserve,
   actorPrivateKeyVerifiedInThisAudit:false,
   stationPrivateKeyVerifiedInThisAudit:false
 };
}
check(inspectors.primary.gasBudgetAdequate||inspectors.backup.gasBudgetAdequate,
  'Neither Inspector Actor has a conservative two-tx gas reserve');
const result={
 status:'PASS_PATCH3_INSPECTOR_SCHEMA_AND_READONLY_PRECHECK',
 tradeId,state:'FUNDED(4)',actionDeadline:0,chainId:11155111,
 escrow:addr,policyHash:terms.policyHash,
 inspectorDomain:domain,
 replayTypeHash:await c.REPLAY_ATTESTATION_TYPEHASH(),
 decisionTypeHash:await c.INSPECTOR_DECISION_TYPEHASH(),
 decisionEvidenceHashField:'REQUIRED_PATCH3_ONLY',
 stagedEvidence:evidence,
 inspectors,
 notes:{
  noPhysicalReplayHasBeenPerformed:true,
  noInspectorStationSignaturesCreated:true,
  noInspectorDecisionApproved:true,
  postBuyerOnchainAnchorComparisonStillRequired:true,
  operationalReadiness:'NOT_READY_FOR_ACTIVATION',
  recommendedRoute:'Primary immediate human-reviewed resolution OR primary timeout + Backup human-reviewed resolution'
 },
 privateKeysAccessed:0,transactionsSent:0,activateCalled:false
};
console.log(JSON.stringify(result,null,2));
