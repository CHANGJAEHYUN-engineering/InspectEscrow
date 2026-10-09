import {createIntegration,json,HASH_METHODS} from './integration.mjs';
const $=id=>document.getElementById(id), E=window.ethers;
const [abi,schema,artifact]=await Promise.all(['InspectEscrow.abi.json','EIP712_TYPED_DATA_SCHEMA.json','InspectEscrow.artifact.json'].map(async n=>{const r=await fetch('./baseline/'+n);if(!r.ok)throw Error(n);return r.json();}));
const sdk=createIntegration(E,abi,schema,artifact);
let provider,prepared,envelope,busy=false;const evidence=[],journal=[];
const SEPOLIA_HEX='0xaa36a7';
const text=(id,value)=>$(id).textContent=typeof value==='string'?value:json(value);
function invalidate(){prepared=null;$('send').disabled=true;}
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
