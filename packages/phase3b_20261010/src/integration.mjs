export const DEPLOYMENT = Object.freeze({chainId:11155111, address:'0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9', name:'InspectEscrow', version:'1', contractVersion:'PHASE2-PATCH2'});
export const STATES = ['NONE','PROPOSED','PARTIES_ACCEPTED','INSPECTORS_ACCEPTED','FUNDED','AWAIT_SUPPLIER','SUPPLIER_REINSPECTION','SUPPLIER_HOLD','AWAIT_BUYER','BUYER_REINSPECTION','BUYER_INSPECTION_TIMEOUT','ACCEPTANCE_PENDING','DISPUTED_PRIMARY','DISPUTED_BACKUP','EXECUTION_HOLD','EVIDENCE_HOLD','ESCALATED','RELEASED','REFUNDED','CANCELLED'];
export const HASH_METHODS = {StationAttestation:'hashStationAttestation',ReplayAttestation:'hashReplayAttestation',InspectorDecisionAttestation:'hashInspectorDecision',MutualResolution:'hashMutualResolution'};
export const json = value => JSON.stringify(value, (_,v)=>typeof v==='bigint'?v.toString():v, 2);
export function createIntegration(E, abi, schema, artifact, deployment=DEPLOYMENT) {
  const domain = {name:deployment.name,version:deployment.version,chainId:deployment.chainId,verifyingContract:deployment.address};
  const iface=new E.Interface(abi);
  const typeArgs={StationAttestation:'a',ReplayAttestation:'a',InspectorDecisionAttestation:'a',MutualResolution:'r'};
  for(const [name, method] of Object.entries(HASH_METHODS)) {
    const components=abi.find(x=>x.name===method).inputs.find(x=>x.name===typeArgs[name]).components;
    if(json(components.map(({name,type})=>({name,type})))!==json(schema.types[name]))throw Error('ABI/schema mismatch: '+name);
  }
  const contract=runner=>new E.Contract(deployment.address,abi,runner);
  async function preflight(provider) {
    const chain=Number(BigInt(await provider.send('eth_chainId',[])));
    if(chain!==deployment.chainId)throw Error('Wrong chain: '+chain);
    const code=await provider.getCode(deployment.address);
    let actual=E.getBytes(code),expected=E.getBytes(artifact.deployedBytecode.object);
    if(actual.length!==expected.length)throw Error('Runtime length mismatch');
    actual=actual.slice();expected=expected.slice();
    for(const ranges of Object.values(artifact.deployedBytecode.immutableReferences))for(const {start,length} of ranges){actual.fill(0,start,start+length);expected.fill(0,start,start+length);}
    if(E.hexlify(actual)!==E.hexlify(expected))throw Error('Frozen runtime mismatch');
    const c=contract(provider), d=await c.eip712Domain();
    if(d.name!==domain.name||d.version!==domain.version||d.chainId!==BigInt(domain.chainId)||d.verifyingContract.toLowerCase()!==domain.verifyingContract.toLowerCase()||d.fields!=='0x0f'||d.extensions.length)throw Error('EIP-712 domain mismatch');
    if(await c.CONTRACT_VERSION()!==deployment.contractVersion)throw Error('Contract version mismatch');
    if(!await c.accountingConserved())throw Error('Accounting mismatch');
    return {chainId:chain,address:deployment.address,contractVersion:deployment.contractVersion,runtimeMaskedMatch:true,domainMatch:true};
  }
  function validateMessage(type,message) {
    const fields=schema.types[type];if(!fields)throw Error('Unknown type');
    const names=fields.map(f=>f.name);
    if(Object.keys(message).length!==names.length||!names.every(n=>Object.hasOwn(message,n)))throw Error('Exact fields required');
    for(const {name,type:t} of fields){const v=message[name];
      if(t.startsWith('uint')){if(typeof v==='number'&&!Number.isSafeInteger(v))throw Error('Use decimal strings for large integers');if(!/^(0|[1-9][0-9]*)$/.test(String(v))||BigInt(v)>=2n**BigInt(t.slice(4)))throw Error('Invalid integer: '+name);}
      if(t==='bool'&&typeof v!=='boolean')throw Error('Boolean required: '+name);
      if(t==='bytes32'&&!/^0x[0-9a-fA-F]{64}$/.test(v))throw Error('Invalid bytes32: '+name);
      if(t==='address'&&!E.isAddress(v))throw Error('Invalid address: '+name);
    }
    return {domain,types:{[type]:fields},primaryType:type,message};
  }
  async function checkDigest(provider,type,message) {
    const payload=validateMessage(type,message);
    const digest=E.TypedDataEncoder.hash(domain,payload.types,message);
    const onchain=await contract(provider)[HASH_METHODS[type]](message);
    if(digest!==onchain)throw Error('On-chain digest mismatch');
    return {payload,digest};
  }
  async function sign(signer,type,message,expectedSigner) {
    await preflight(signer.provider);
    const {payload,digest}=await checkDigest(signer.provider,type,message);
    const address=await signer.getAddress();
    if(address.toLowerCase()!==expectedSigner.toLowerCase())throw Error('Wrong signing account');
    const signature=await signer.signTypedData(domain,payload.types,message);
    if(E.verifyTypedData(domain,payload.types,message,signature).toLowerCase()!==address.toLowerCase())throw Error('Signature recovery mismatch');
    return {type,domain,message,digest,signature,signer:address};
  }
  function verifyEnvelope(envelope,type,expectedSigner) {
    if(envelope.type!==type||json(envelope.domain)!==json(domain))throw Error('Envelope domain/type mismatch');
    const payload=validateMessage(type,envelope.message);
    const digest=E.TypedDataEncoder.hash(domain,payload.types,envelope.message);
    if(envelope.digest!==digest||E.verifyTypedData(domain,payload.types,envelope.message,envelope.signature).toLowerCase()!==expectedSigner.toLowerCase())throw Error('Envelope signature mismatch');
    return [envelope.message,envelope.signature];
  }
  async function snapshot(provider,tradeId,addresses=[]) {
    const block=await provider.getBlock('latest');const c=contract(provider);
    const fields={};for(const n of ['totalFunded','unsettledEscrow','outstandingClaimable','totalWithdrawn','accountingConserved'])fields[n]=await c[n]({blockTag:block.number});
    const result={blockNumber:block.number,blockHash:block.hash,blockTimestamp:block.timestamp,contractBalance:await provider.getBalance(deployment.address,block.number),...fields,claimable:{}};
    for(const a of addresses)result.claimable[a]=await c.claimable(a,{blockTag:block.number});
    if(tradeId){let s;try{s=await c.getTradeState(tradeId,{blockTag:block.number});}catch(e){
      let parsed;try{if(e.data)parsed=iface.parseError(e.data);}catch{}
      const emptyCallException=e.code==='CALL_EXCEPTION'&&(!e.data||e.data==='0x')&&/missing revert data|execution reverted/i.test(e.shortMessage||e.message||'');
      // getTradeState has a single revert path (TradeNotFound). Some Sepolia RPCs
      // strip custom-error returndata, so an otherwise valid new proposal must
      // still be represented as NONE in the pre-transaction snapshot.
      if(parsed?.name==='TradeNotFound'||emptyCallException)s=0n;else throw e;
    }result.tradeId=tradeId;result.state=Number(s);result.stateName=STATES[Number(s)];if(s!==0n){result.deadline=await c.getActionDeadline(tradeId,{blockTag:block.number});result.replay=Array.from(await c.getReplay(tradeId,{blockTag:block.number}));result.settled=await c.isSettled(tradeId,{blockTag:block.number});}}
    return result;
  }
  async function prepare(signer,functionName,args,tradeId) {
    await preflight(signer.provider);
    const f=iface.getFunction(functionName);if(!f||['view','pure'].includes(f.stateMutability))throw Error('Write function required');
    const input=abi.find(x=>x.type==='function'&&x.name===functionName)?.inputs[0];
    const actualTradeId=input?.name==='tradeId'?args[0]:input?.components?.some(x=>x.name==='tradeId')?args[0]?.tradeId:undefined;
    if(actualTradeId){if(tradeId&&tradeId.toLowerCase()!==actualTradeId.toLowerCase())throw Error('Displayed tradeId does not match transaction');tradeId=actualTradeId;}
    const c=contract(signer);const from=await signer.getAddress();let value=0n;
    if(functionName==='fund'){const terms=await c.getTradeTerms(args[0]);value=terms.escrowAmount;}
    await c[functionName].staticCall(...args,{value});
    const data=iface.encodeFunctionData(functionName,args);
    const gas=await signer.estimateGas({to:deployment.address,data,value});
    return {chainId:deployment.chainId,to:deployment.address,from,functionName,args,data,value,gas,tradeId,before:await snapshot(signer.provider,tradeId,[from])};
  }
  async function execute(signer,prepared,confirmations=2,onBroadcast=()=>{}) {
    await preflight(signer.provider);
    const fresh=await prepare(signer,prepared.functionName,prepared.args,prepared.tradeId);
    if(fresh.from.toLowerCase()!==prepared.from.toLowerCase()||fresh.data!==prepared.data||fresh.value!==BigInt(prepared.value))throw Error('Prepared transaction changed; review again');
    const tx=await signer.sendTransaction({to:deployment.address,data:fresh.data,value:fresh.value,gasLimit:fresh.gas*120n/100n});
    onBroadcast(tx.hash);
    const receipt=await tx.wait(confirmations);if(!receipt||receipt.status!==1)throw Error('Transaction failed');
    const events=receipt.logs.filter(l=>l.address.toLowerCase()===deployment.address.toLowerCase()).map(l=>{const p=iface.parseLog(l);return {name:p.name,args:p.fragment.inputs.map((x,i)=>({name:x.name,value:p.args[i]})),logIndex:l.index};});
    const after=await snapshot(signer.provider,prepared.tradeId,[fresh.from]);
    if(!after.accountingConserved)throw Error('Post-transaction accounting failed: '+tx.hash);
    return {kind:deployment.chainId===11155111?'SEPOLIA_TRANSACTION':'LOCAL_SYNTHETIC_TRANSACTION',chainId:deployment.chainId,contract:deployment.address,functionName:prepared.functionName,args:prepared.args,valueWei:fresh.value,txHash:tx.hash,from:fresh.from,to:tx.to,calldata:tx.data,status:receipt.status,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed,gasPrice:receipt.gasPrice,feeWei:receipt.gasUsed*receipt.gasPrice,confirmations,logs:receipt.logs,events,before:fresh.before,after};
  }
  return {domain,contract,preflight,validateMessage,checkDigest,sign,verifyEnvelope,snapshot,prepare,execute};
}
