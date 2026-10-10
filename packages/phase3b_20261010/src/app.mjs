import {createIntegration,json,HASH_METHODS} from './integration.mjs';
const $=id=>document.getElementById(id), E=window.ethers;
const [abi,schema,artifact,finalE2E]=await Promise.all([
  'InspectEscrow.abi.json',
  'EIP712_TYPED_DATA_SCHEMA.json',
  'InspectEscrow.artifact.json'
].map(async n=>{const r=await fetch('./baseline/'+n);if(!r.ok)throw Error(n);return r.json();}).concat([
  fetch('./results/FINAL_SEPOLIA_E2E_20261011.json').then(r=>{if(!r.ok)throw Error('FINAL_SEPOLIA_E2E_20261011.json');return r.json();})
]));
const sdk=createIntegration(E,abi,schema,artifact);
let provider,prepared,envelope,busy=false;const evidence=[],journal=[];
const SEPOLIA_HEX='0xaa36a7';
const text=(id,value)=>$(id).textContent=typeof value==='string'?value:json(value);
const explorerTx=h=>'https://sepolia.etherscan.io/tx/'+h;
const explorerAddress=a=>'https://sepolia.etherscan.io/address/'+a;
const short=v=>v&&v.length>18?v.slice(0,10)+'…'+v.slice(-8):v;
const fmtEth=wei=>(Number(BigInt(wei))/1e18).toLocaleString(undefined,{maximumFractionDigits:6})+' ETH';
function invalidate(){prepared=null;$('send').disabled=true;}
function txLink(hash,label=short(hash)){return hash?'<a class="txlink" target="_blank" rel="noopener" href="'+explorerTx(hash)+'">'+label+'</a>':'<span class="muted">no transaction</span>';}
function renderFinal(){
  $('tradeId').value=finalE2E.tradeId;
  $('contractLink').href=explorerAddress(finalE2E.contract);
  text('finalState',finalE2E.finalAccounting.state.value+' · '+finalE2E.finalAccounting.state.name);
  text('escrow',fmtEth(finalE2E.escrowWei));
  text('withdrawn',fmtEth(finalE2E.finalAccounting.totalWithdrawnWei));
  text('accounting',finalE2E.finalAccounting.accountingConserved?'CONSERVED':'CHECK');
  text('supplierScore',finalE2E.aiEvidence.supplier.scoreScaled);
  text('buyerScore',finalE2E.aiEvidence.buyer.scoreScaled);
  text('supplierHash','evidencePackageHash · '+finalE2E.aiEvidence.supplier.evidencePackageHash);
  text('buyerHash','evidencePackageHash · '+finalE2E.aiEvidence.buyer.evidencePackageHash);
  const th=Number(finalE2E.frozen.thresholdScaled), ss=Number(finalE2E.aiEvidence.supplier.scoreScaled), bs=Number(finalE2E.aiEvidence.buyer.scoreScaled);
  $('supplierBar').style.width=Math.min(100,ss/(th*1.12)*100)+'%';
  $('buyerBar').style.width=Math.min(100,bs/(th*1.12)*100)+'%';
  text('thresholdText','thresholdScaled = '+th+' · score < threshold → PASS · score ≥ threshold → REVIEW');

  const wanted=['activate','supplier.submitInspection','buyer.submitInspection','primaryInspector.timeout','activateBackupInspector','backup.recordReplayResult','backup.submitInspectorDecision','buyer.withdraw'];
  const labels={
    'activate':'Escrow 활성화',
    'supplier.submitInspection':'Supplier AI 검사',
    'buyer.submitInspection':'Buyer AI 검사 · 분쟁 진입',
    'primaryInspector.timeout':'Primary Inspector timeout',
    'activateBackupInspector':'Backup Inspector failover',
    'backup.recordReplayResult':'Independent Replay',
    'backup.submitInspectorDecision':'Human Inspector 정산 판단',
    'buyer.withdraw':'Buyer 실제 환급 수령'
  };
  const detail=t=>{
    if(t.step==='supplier.submitInspection')return 'ADMISSIBLE_PASS · score '+t.scoreScaled+' · state AWAIT_BUYER';
    if(t.step==='buyer.submitInspection')return 'ADMISSIBLE_REVIEW · score '+t.scoreScaled+' · state DISPUTED_PRIMARY';
    if(t.step==='primaryInspector.timeout')return '자동 정산 없음 · deadline 만료 후 Backup으로 failover';
    if(t.step==='activateBackupInspector')return 'state DISPUTED_BACKUP';
    if(t.step==='backup.recordReplayResult')return 'consistent=true · replayReportHash '+short(t.replayReportHash);
    if(t.step==='backup.submitInspectorDecision')return 'REFUND_TO_BUYER · state REFUNDED';
    if(t.step==='buyer.withdraw')return 'claimable 0 · totalWithdrawn '+fmtEth(finalE2E.finalAccounting.totalWithdrawnWei);
    return t.stateAfter?'state '+t.stateAfter.name:'';
  };
  const rows=wanted.map((name,i)=>{
    const t=finalE2E.transactions.find(x=>x.step===name); if(!t)return '';
    return '<div class="step"><div class="node"><span>'+(i+1)+'</span></div><div><div class="step-title">'+labels[name]+'</div><div class="step-meta">'+detail(t)+'</div><div>'+(t.txHash?txLink(t.txHash):'<span class="muted">write tx 없음</span>')+'</div></div></div>';
  }).join('');
  $('timeline').innerHTML=rows;

  const anchors=[
    ['policyHash',finalE2E.frozen.policyHash],
    ['modelBundleHash',finalE2E.frozen.modelBundleHash],
    ['scoreSchemaId',finalE2E.frozen.scoreSchemaId],
    ['Supplier Evidence',finalE2E.aiEvidence.supplier.evidencePackageHash],
    ['Buyer Evidence',finalE2E.aiEvidence.buyer.evidencePackageHash],
    ['Replay Report',finalE2E.replay.replayReportHash]
  ];
  $('anchors').innerHTML=anchors.map(([k,v])=>'<div class="anchor"><b>'+k+'</b><code>'+v+'</code></div>').join('');

  const yes=[
    '실제 PatchCore output → signed evidence → Sepolia state transition 연결',
    '분쟁 중 escrow lock과 권한·deadline 기반 상태 전이',
    'Primary 미응답 시 자동 지급 없이 Backup Inspector failover',
    'Replay consistency gate와 최종 Inspector decision의 권한 분리',
    'claimable → withdraw pull-payment와 accounting conservation'
  ];
  const no=[
    'Supplier/Buyer 이미지가 동일 실물이라는 물리적 보증',
    '공개 MVTec 데이터의 실제 제조현장 custody/provenance',
    'Station 서명 자체가 카메라 또는 AI 실행의 진실성을 증명한다는 주장',
    'controlled replay를 모든 환경의 cross-machine 재현성으로 일반화',
    'AI가 최종 defect/정산 판단을 자동으로 내린다는 주장'
  ];
  $('proves').innerHTML=yes.map(x=>'<p>✓ '+x+'</p>').join('');
  $('limits').innerHTML=no.map(x=>'<p>× '+x+'</p>').join('');
  text('status','최종 E2E evidence snapshot 로드 완료 · trade '+short(finalE2E.tradeId));
}
renderFinal();

async function signer(){
  const wallet=window.ethereum;
  if(!wallet?.request)throw Error('MetaMask 브라우저 확장 프로그램이 감지되지 않습니다.');
  await wallet.request({method:'eth_requestAccounts'});
  const current=String(await wallet.request({method:'eth_chainId'})).toLowerCase();
  if(current!==SEPOLIA_HEX){
    text('status','MetaMask에서 이 사이트의 네트워크를 Sepolia로 전환해 주세요.');
    await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:SEPOLIA_HEX}]});
  }
  provider=new E.BrowserProvider(wallet,'any');
  return provider.getSigner();
}
function download(name,value){const u=URL.createObjectURL(new Blob([json(value)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){let detail=e.shortMessage||e.message;try{if(e.data){const r=new E.Interface(abi).parseError(e.data);if(r)detail=r.name+' '+json(Array.from(r.args));}}catch{}text('status',detail);invalidate();}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);$('send').disabled=!prepared;$('signatureExport').disabled=!envelope;$('export').disabled=!(evidence.length||journal.length);}}
function terms(){const t=JSON.parse($('terms').value);$('tradeId').value=t.tradeId;return t;}
function describe(){const f=abi.find(x=>x.name===$('action').value);text('inputs',f.inputs.map(x=>x.name+': '+x.type).join(', ')||'인자 없음');invalidate();}
for(const f of abi.filter(x=>x.type==='function'&&!['view','pure'].includes(x.stateMutability))){const o=document.createElement('option');o.value=f.name;o.textContent=f.name;$('action').append(o);} $('action').value='proposeTrade';describe();
$('action').onchange=describe;for(const id of ['args','terms','tradeId'])$(id).oninput=invalidate;

$('connect').onclick=()=>run(async()=>{const s=await signer();text('status',{account:await s.getAddress(),...await sdk.preflight(provider)});});

$('verifyLive').onclick=()=>run(async()=>{
  const s=await signer();
  const preflight=await sdk.preflight(provider);
  const buyer=finalE2E.roles?.buyer||'0x5B52D3B71dD5B4637B828Fd2a0e8bC78346709eE';
  const snap=await sdk.snapshot(provider,finalE2E.tradeId,[buyer]);
  const checks={
    chainId:preflight.chainId===11155111,
    runtimeMaskedMatch:preflight.runtimeMaskedMatch===true,
    eip712Domain:preflight.domainMatch===true,
    tradeState:snap.state===18&&snap.stateName==='REFUNDED',
    buyerClaimable:String(snap.claimable[buyer])==='0',
    accountingConserved:snap.accountingConserved===true,
    totalWithdrawnAtLeastDemoEscrow:BigInt(snap.totalWithdrawn)>=BigInt(finalE2E.escrowWei)
  };
  const pass=Object.values(checks).every(Boolean);
  text('liveVerification',{verifiedAt:new Date().toISOString(),blockNumber:snap.blockNumber,state:snap.stateName,buyerClaimableWei:String(snap.claimable[buyer]),totalWithdrawnWei:String(snap.totalWithdrawn),outstandingClaimableWei:String(snap.outstandingClaimable),checks,verdict:pass?'PASS':'CHECK'});
  text('status',pass?'Sepolia live verification PASS · 저장된 E2E 종료 상태와 일치':'Sepolia live verification 결과 확인 필요');
});

$('termsFile').onchange=()=>run(async()=>{$('terms').value=await $('termsFile').files[0].text();terms();invalidate();});
$('useTerms').onclick=()=>run(async()=>{$('action').value='proposeTrade';$('args').value=json([terms()]);describe();});
$('refresh').onclick=()=>run(async()=>{const s=await signer();await sdk.preflight(provider);text('state',await sdk.snapshot(provider,$('tradeId').value.trim()||undefined,[await s.getAddress()]));});
$('sign').onclick=()=>run(async()=>{const s=await signer(),type=$('type').value,m=JSON.parse($('message').value);const t=await sdk.contract(provider).getTradeTerms(m.tradeId);let expected;
  if(type==='StationAttestation'){if(![0,1].includes(Number(m.role)))throw Error('Supplier/Buyer role required');expected=Number(m.role)===0?t.supplierStation:t.buyerStation;}else if(type==='MutualResolution'){const a=await s.getAddress();if(![t.supplier,t.buyer].some(x=>x.toLowerCase()===a.toLowerCase()))throw Error('Supplier/Buyer actor required');expected=a;}else expected=t.inspectorStation;
  envelope=await sdk.sign(s,type,m,expected);text('signed',envelope);text('status','서명 완료. Actor 지갑으로 전환해 서명 파일을 제출하세요.');});
$('signatureExport').onclick=()=>download('InspectEscrow_signed_'+envelope.type+'.json',envelope);
$('envelopeFile').onchange=()=>run(async()=>{const e=JSON.parse(await $('envelopeFile').files[0].text());await signer();await sdk.preflight(provider);const t=await sdk.contract(provider).getTradeTerms(e.message.tradeId);let expected,method;
  if(e.type==='StationAttestation'){if(![0,1].includes(Number(e.message.role)))throw Error('Invalid role');expected=Number(e.message.role)===0?t.supplierStation:t.buyerStation;method='submitInspection';}else if(e.type==='ReplayAttestation'){expected=t.inspectorStation;method='recordReplayResult';}else if(e.type==='InspectorDecisionAttestation'){expected=t.inspectorStation;method='submitInspectorDecision';}else throw Error('MutualResolution에는 Supplier/Buyer 서명 2개를 함수 인자 배열로 입력하세요.');
  const args=sdk.verifyEnvelope(e,e.type,expected);$('action').value=method;$('args').value=json(args);$('tradeId').value=e.message.tradeId;describe();});
$('prepare').onclick=()=>run(async()=>{const s=await signer();prepared=await sdk.prepare(s,$('action').value,JSON.parse($('args').value),$('tradeId').value.trim()||undefined);text('preview',prepared);text('status','미리보기 완료. 함수·발신자·금액을 확인한 뒤 지갑에서 승인하세요.');});
$('send').onclick=()=>run(async()=>{const s=await signer(),p=prepared;invalidate();const item=await sdk.execute(s,p,2,hash=>{journal.push({txHash:hash,chainId:11155111,functionName:p.functionName,tradeId:p.tradeId,status:'BROADCAST_RECEIPT_PENDING'});text('status','전송됨 · 2 confirmations 대기: '+hash);text('evidence',{journal,evidence});});evidence.push(item);journal.find(x=>x.txHash===item.txHash).status='CONFIRMED';text('evidence',{journal,evidence});text('state',item.after);text('status','거래 확인 완료 · '+item.txHash);});
$('export').onclick=()=>download('InspectEscrow_PHASE3B_EVIDENCE.json',{exportedAt:new Date().toISOString(),deployment:sdk.domain,journal,evidence});
window.ethereum?.on?.('accountsChanged',()=>{invalidate();text('status','계정 변경됨 · 다시 연결 및 미리보기 필요');});window.ethereum?.on?.('chainChanged',()=>{invalidate();provider=null;text('status','네트워크 변경됨 · Sepolia 연결 필요');});
