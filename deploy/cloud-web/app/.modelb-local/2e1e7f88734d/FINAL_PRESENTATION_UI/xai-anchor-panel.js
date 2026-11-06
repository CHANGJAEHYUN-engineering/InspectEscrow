"use strict";
(() => {
  // Supplemental Sepolia commitment only: it DOES NOT submit InspectEscrow escrow Evidence.
  const ANCHOR="0x16391d0f6e4baA35CC835839e98b85437455ba82";
  const ESCROW="0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905";
  const RPC="https://ethereum-sepolia-rpc.publicnode.com";
  const CHAIN="0xaa36a7"; // 11155111
  const S05={
    tradeId:"0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff",
    role:0,
    evidenceHash:"0x2281badc88418b6b78f83a11de0aa4e0a4b51f8b7f0e7004232c08526f1711c1",
    xaiHash:"0xcf3710f2fa746646770de2236e5947fcd35623178ac7ab91def004d1660cb1bb",
    transaction:"0x23fbae0c5256e01dfc82d698258e5a84aa92421d658dadebf4100b8b731f352f"
  };
  const SELECTORS={getAnchor:"84a1484a",verify:"f1835db7",trade:"5cb67b92",anchor:"45751ee3"};
  const REPORT_SCHEMA="InspectEscrow.XAI.EvidenceDerivedAnchorReport.v1";
  const REPORT_PAYLOAD="InspectEscrow.XAI.EvidenceDerivedAnchorPayload.v1";
  const SIDECAR_SCHEMA="InspectEscrow.XAI.OfflineSidecar.v1";
  const shaRe=/^[a-f0-9]{64}$/i;
  const addressRe=/^0x[a-f0-9]{40}$/i;
  const hex32=s=>typeof s==="string"&&/^0x[a-f0-9]{64}$/i.test(s);
  const small=s=>String(s||"").length>25?String(s).slice(0,15)+"…"+String(s).slice(-9):String(s);
  const $=id=>document.getElementById(id);
  const st={record:null,report:null,rawFile:null,proof:null,connected:null,busy:false};
  const sourceLabel="S05 Supplier · 검증된 기존 거래";
  const limitation="Evidence-derived supplementary XAI report. Created from an unsigned offchain Evidence Bundle; does not reproduce the legacy XAI-companion sidecar schema, validate the physical product, or constitute InspectEscrow EIP-712 signed evidence.";

  function bytesHex(bytes){return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");}
  async function sha(bytes){return bytesHex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));}
  async function shaText(s){return sha(new TextEncoder().encode(s));}
  function bytes32(s,label){if(!hex32(s))throw Error(label+"는 0x로 시작하는 32바이트 해시여야 합니다.");return s.toLowerCase();}
  function word(s){return bytes32(s,"bytes32").slice(2);}
  function roleWord(role){if(role!==0&&role!==1)throw Error("Supplier/Buyer 역할만 지원합니다.");return String(role).padStart(64,"0");}
  function callData(selector,trade,role,evidence,hash){
    return "0x"+selector+word(trade)+roleWord(role)+word(evidence)+(hash?word(hash):"");
  }
  async function rpc(method,params){
    const body=JSON.stringify({jsonrpc:"2.0",id:21,method,params});
    try{
      const res=await fetch(RPC,{method:"POST",headers:{"Content-Type":"application/json"},body,cache:"no-store"});
      if(!res.ok)throw Error("RPC HTTP "+res.status);
      const data=await res.json();
      if(data.error)throw Error(data.error.message||"RPC_ERROR");
      return data.result;
    }catch(networkError){
      // A browser wallet can supply read-only eth_call if public RPC CORS is unavailable.
      if(window.ethereum){
        const chain=await window.ethereum.request({method:"eth_chainId"});
        if(String(chain).toLowerCase()===CHAIN)return window.ethereum.request({method,params});
      }
      throw Error("Sepolia RPC 조회 실패: "+networkError.message);
    }
  }
  async function ethCall(to,data){return rpc("eth_call",[{to,data},"latest"]);}
  function decodeWords(s,min){
    if(!/^0x(?:[a-f0-9]{64})+$/i.test(s)||s.length<2+64*min)
      throw Error("컨트랙트 응답 형식이 올바르지 않습니다.");
    return s.slice(2).match(/.{64}/g);
  }
  function b64bytes(value){
    if(typeof value!=="string"||value.length<40||value.length>6000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
      throw Error("XAI PNG Base64 형식 또는 크기가 잘못됐습니다.");
    const decoded=atob(value),out=new Uint8Array(decoded.length);
    for(let i=0;i<decoded.length;i++)out[i]=decoded.charCodeAt(i);
    return out;
  }
  function checksEq(a,b,label){
    if(String(a??"").toLowerCase()!==String(b??"").toLowerCase())
      throw Error("XAI·Evidence 데이터 불일치: "+label);
  }
  async function verifyPng(png){
    if(!png||!shaRe.test(png.sha256)||png.mimeType!=="image/png")throw Error("XAI PNG 정보 누락");
    const bytes=b64bytes(png.base64);
    if(bytes.length!==Number(png.bytes)||bytesHex(bytes.slice(0,8))!=="89504e470d0a1a0a")
      throw Error("XAI PNG 길이 또는 형식 불일치");
    const h=await sha(bytes);
    checksEq(h,png.sha256,"XAI PNG SHA-256");
    return h;
  }
  async function readReport(report){
    if(!report||![""+REPORT_SCHEMA,SIDECAR_SCHEMA].includes(report.schema))
      throw Error("지원하지 않는 보고서입니다. XAI 연결 보고서 또는 Evidence JSON을 선택하세요.");
    const p=report.payload;
    if(!p||![""+REPORT_PAYLOAD,"InspectEscrow.XAI.EvidenceCompanion.v1"].includes(p.schema))
      throw Error("보고서 payload 스키마 오류");
    const calc=await shaText(JSON.stringify(p));
    if(!shaRe.test(report.localContentSha256||"")||
      calc!==String(report.localContentSha256).toLowerCase())
      throw Error("보고서 내용이 바뀌었거나 SHA-256이 일치하지 않습니다.");
    const tradeId=bytes32(p.tradeId,"Trade ID");
    const evidenceHash=bytes32(p.evidencePackageHash,"Evidence Hash");
    const role=p.roleName==="supplier"?0:p.roleName==="buyer"?1:-1;
    if(role<0||typeof p.sessionId!=="string")throw Error("보고서 역할/세션 오류");
    if(report.schema===REPORT_SCHEMA){
      if(p.role!==role||!shaRe.test(p.originalTopSha256||"")||
        !shaRe.test(p.modelCheckpointSha256||""))throw Error("원본·모델·역할 필드 누락");
      checksEq(p.originalTopSha256,p.xai?.sourceTopSha256,"TOP 원본");
      if(!shaRe.test(p.xai?.rawMapSha256||"")||!p.xai?.method)throw Error("XAI anomaly map 정보 누락");
      await verifyPng(p.xai.heatmapPng);
    }else{
      if(p.xai?.method!=="PATCHCORE_NATIVE_ANOMALY_MAP"||
         !p.xai.overlayPngBase64||!Array.isArray(p.xai.quadrants)||
         p.xai.quadrants.length!==4)throw Error("구형 XAI Sidecar 근거 누락");
      checksEq(p.originalTopSha256,p.xai.originalTopSha256,"원본");
      checksEq(p.modelCheckpointSha256,p.xai.modelCheckpointSha256,"모델");
      checksEq(p.scoreScaled,p.xai.scoreScaled,"AI 점수");
      checksEq(p.decision,p.xai.decision,"AI 판정");
    }
    return {tradeId,role,evidenceHash,xaiHash:"0x"+calc,source:"검증된 XAI 보고서",report};
  }
  async function derivedFromEvidence(evidence,fileBytes){
    if(evidence?.schema!=="inspectescrow.modelb-browser-evidence-bundle/1"||
       !evidence.evidencePackage||!evidence.manifest||!evidence.xaiHeatmap)
      throw Error("XAI 히트맵이 포함된 InspectEscrow Evidence JSON이 필요합니다.");
    const e=evidence.evidencePackage,m=evidence.manifest,heat=evidence.xaiHeatmap,ir=evidence.inferenceReport;
    if(evidence.status!=="OFFCHAIN_EVIDENCE_PREPARED_UNSIGNED_NOT_SUBMITTED"||
       e.onchainSubmissionStatus!=="NOT_SUBMITTED"||
       !/^0x0{64}$/i.test(e.stationAttestationDigest||""))
      throw Error("현재는 미서명·미제출 Evidence Bundle만 변환합니다. 이미 서명된 증거를 미서명으로 표시할 수 없습니다.");
    bytes32(evidence.evidencePackageHash,"Evidence Hash");
    bytes32(evidence.specimenManifestHash,"Manifest Hash");
    bytes32(m.tradeId,"Trade ID");
    if((m.role!==0&&m.role!==1)||e.role!==m.role||
       evidence.roleName!==(m.role===0?"supplier":"buyer"))
      throw Error("Evidence 역할이 일치하지 않습니다.");
    checksEq(e.tradeId,m.tradeId,"Trade ID");
    checksEq(m.captureFiles?.TOP?.sha256,e.xaiSourceTopSha256,"TOP 원본");
    checksEq(e.modelCheckpointSha256,ir?.model_checkpoint_sha256,"모델 체크포인트");
    checksEq(e.scoreScaled,ir?.score_scaled,"AI 점수");
    checksEq(e.offchainDecision,ir?.decision,"AI 판정");
    checksEq(e.xaiHeatmapSha256,ir?.xai_heatmap_sha256,"XAI PNG 해시");
    checksEq(e.xaiRawMapSha256,ir?.xai_map_sha256,"XAI 원본 anomaly map");
    if(typeof heat.data!=="string"||!shaRe.test(e.xaiHeatmapSha256||"")||
       !shaRe.test(e.xaiRawMapSha256||"")||
       e.xaiProvenance!=="MODEL_GENERATED_PATCHCORE_ANOMALY_MAP_VERIFIED")
      throw Error("XAI 생성 근거 또는 SHA-256이 유효하지 않습니다.");
    const png={
      name:heat.name,mimeType:"image/png",bytes:e.xaiHeatmapBytes,
      sha256:e.xaiHeatmapSha256,base64:heat.data
    };
    await verifyPng(png);
    const rawHash=await sha(fileBytes);
    const payload={
      schema:REPORT_PAYLOAD,tradeId:m.tradeId,roleName:evidence.roleName,
      role:m.role,sessionId:m.sessionId,specimenLabel:m.operatorSpecimenLabel,
      evidencePackageHash:evidence.evidencePackageHash,
      specimenManifestHash:evidence.specimenManifestHash,
      sourceEvidenceFileSha256:rawHash,
      sourceEvidenceSchema:evidence.schema,sourceEvidenceStatus:evidence.status,
      originalTopSha256:m.captureFiles.TOP.sha256,
      modelCheckpointSha256:e.modelCheckpointSha256,
      scoreScaled:String(e.scoreScaled),decision:e.offchainDecision,
      xai:{
        method:e.xaiMethod,provenance:e.xaiProvenance,
        rawMapSha256:e.xaiRawMapSha256,
        sourceTopSha256:e.xaiSourceTopSha256,
        heatmapPng:png
      },
      sourceEvidenceSigned:false,
      sourceEvidenceOnchainSubmitted:false,
      physicalCustodyProven:false,
      limitation
    };
    const report={schema:REPORT_SCHEMA,payload,
      localContentSha256:await shaText(JSON.stringify(payload)),
      hashAlgorithm:"SHA-256(UTF-8 JSON.stringify(payload))"};
    const r=await readReport(report);
    r.source="Evidence 원본에서 검증·생성한 XAI 보고서";
    r.report=report;
    return r;
  }
  function setStatus(message,kind){
    const v=$("xai-anchor-status");
    if(!v)return;
    v.textContent=message;v.dataset.kind=kind||"neutral";
  }
  function link(el,url,label){
    const a=$(el);if(!a)return;
    if(url){a.href=url;a.textContent=label||"Etherscan에서 확인";a.hidden=false;}
    else{a.removeAttribute("href");a.hidden=true;}
  }
  function setFields(record){
    st.record=record;st.proof=null;st.connected=null;
    $("xai-anchor-trade").textContent=small(record.tradeId);
    $("xai-anchor-role").textContent=record.role===0?"Supplier":"Buyer";
    $("xai-anchor-evidence").textContent=small(record.evidenceHash);
    $("xai-anchor-digest").textContent=record.xaiHash;
    $("xai-anchor-source").textContent=record.source||"";
    $("xai-anchor-send").disabled=true;
    $("xai-anchor-wallet").textContent="지갑 미연결 · 기록은 읽기 전용으로 조회 가능";
    $("xai-anchor-file-export").disabled=!record.report;
    link("xai-anchor-tx",record.transaction?
      "https://sepolia.etherscan.io/tx/"+record.transaction:null,"Sepolia 등록 트랜잭션");
  }
  async function fetchAnchor(record){
    const words=decodeWords(await ethCall(ANCHOR,
      callData(SELECTORS.getAnchor,record.tradeId,record.role,record.evidenceHash)),4);
    const hash="0x"+words[0];
    const attestor="0x"+words[1].slice(24);
    const block=BigInt("0x"+words[3]);
    const hasAnchor=!/^0x0{64}$/.test(hash)&&!/^0x0{40}$/.test(attestor);
    const result={hasAnchor,hash,attestor,block:block.toString(),
      exact:hasAnchor&&hash.toLowerCase()===record.xaiHash.toLowerCase()};
    if(hasAnchor){
      const checked=decodeWords(await ethCall(ANCHOR,callData(
        SELECTORS.verify,record.tradeId,record.role,record.evidenceHash,record.xaiHash)),1)[0];
      if((checked.endsWith("1"))!==result.exact)
        throw Error("getAnchor와 verify 결과가 일치하지 않습니다.");
    }
    return result;
  }
  async function refresh(){
    const record=st.record;if(!record||st.busy)return;
    st.busy=true;$("xai-anchor-refresh").disabled=true;
    setStatus("Sepolia에서 실제 컨트랙트 기록을 재조회 중…","neutral");
    try{
      const proof=await fetchAnchor(record);
      if(st.record!==record)return;
      st.proof=proof;
      if(proof.exact){
        setStatus("검증 PASS · XAI SHA-256이 Sepolia 온체인 기록과 일치합니다."+
          (record.report?" 업로드한 XAI 보고서의 내용도 검증했습니다.":" 보고서 원본 확인은 파일 업로드가 필요합니다."),"pass");
      }else if(proof.hasAnchor){
        setStatus("검증 불일치 · 동일 거래·역할·Evidence에 다른 해시가 고정돼 있습니다. 덮어쓸 수 없습니다.","fail");
      }else{
        setStatus("미등록 · 이 거래·역할·Evidence에 대한 XAI 기록이 없습니다. 등록하려면 정확한 보고서와 거래 당사자 지갑이 필요합니다.","neutral");
      }
      $("xai-anchor-chain").textContent=proof.hasAnchor?
        "저장 해시 "+small(proof.hash)+" · 등록자 "+small(proof.attestor)+" · 블록 #"+proof.block:
        "해당 키에 등록된 해시 없음";
    }catch(e){st.proof=null;setStatus("온체인 조회 실패 · "+e.message,"fail");}
    finally{st.busy=false;$("xai-anchor-refresh").disabled=false;await checkWallet(false);}
  }
  async function checkWallet(request){
    const record=st.record;
    const btn=$("xai-anchor-send");
    if(!record){btn.disabled=true;return;}
    try{
      if(!window.ethereum){$("xai-anchor-wallet").textContent="MetaMask 없음 · 읽기 전용 검증만 가능";btn.disabled=true;return;}
      const chain=await window.ethereum.request({method:"eth_chainId"});
      if(String(chain).toLowerCase()!==CHAIN){
        $("xai-anchor-wallet").textContent="MetaMask가 Sepolia가 아닙니다. 네트워크를 변경하세요.";
        btn.disabled=true;return;
      }
      const accounts=await window.ethereum.request({method:request?"eth_requestAccounts":"eth_accounts"});
      if(!accounts?.length){
        $("xai-anchor-wallet").textContent="지갑 미연결 · 'MetaMask 연결'을 직접 눌러주세요.";
        btn.disabled=true;return;
      }
      const actor=String(accounts[0]).toLowerCase();
      const raw=decodeWords(await ethCall(ESCROW,"0x"+SELECTORS.trade+word(record.tradeId)),3);
      const expected="0x"+raw[record.role===0?1:2].slice(24).toLowerCase();
      if(raw[0].toLowerCase()!==word(record.tradeId))throw Error("원본 거래 ID 조회 실패");
      st.connected=actor;
      const correct=actor===expected;
      $("xai-anchor-wallet").textContent=small(actor)+" · "+(correct?
        "등록 가능한 거래 당사자":"지정된 "+(record.role===0?"Supplier":"Buyer")+" Actor가 아닙니다");
      btn.disabled=!correct||!record.report||!st.proof||st.proof.hasAnchor||st.busy;
      return correct;
    }catch(e){
      st.connected=null;btn.disabled=true;$("xai-anchor-wallet").textContent="지갑 검증 오류: "+e.message;
      return false;
    }
  }
  async function send(){
    const record=st.record;
    if(!record?.report||st.busy)return;
    // Exact duplicate/immutable write is checked again immediately before MetaMask approval.
    st.busy=true;$("xai-anchor-send").disabled=true;
    try{
      const fresh=await fetchAnchor(record);
      if(fresh.hasAnchor){setStatus(fresh.exact?"이미 고정된 해시입니다. 중복 전송하지 않습니다.":
        "이미 다른 해시가 고정돼 있습니다. 기록을 덮어쓸 수 없습니다.",fresh.exact?"pass":"fail");return;}
      const authorized=await checkWallet(true);
      const actor=st.connected;
      if(!authorized||!actor)throw Error("거래 Actor의 지갑 확인이 필요합니다.");
      if(!confirm("Sepolia에 XAI 보고서 SHA-256을 기록합니다. 실제 테스트 ETH 가스비가 발생하며 한번 기록하면 덮어쓸 수 없습니다. 기존 에스크로의 정식 Evidence 제출은 아닙니다. 진행할까요?"))
        return;
      const data=callData(SELECTORS.anchor,record.tradeId,record.role,record.evidenceHash,record.xaiHash);
      setStatus("MetaMask 서명 요청 중 · 지갑 승인 전에는 아무 기록도 전송되지 않습니다.","neutral");
      const hash=await window.ethereum.request({method:"eth_sendTransaction",params:[{
        from:actor,to:ANCHOR,value:"0x0",data
      }]});
      link("xai-anchor-tx","https://sepolia.etherscan.io/tx/"+hash,"등록 TX "+small(hash));
      setStatus("MetaMask 전송 완료 · Sepolia 영수증 확인 중…","neutral");
      for(let i=0;i<35;i++){
        const receipt=await rpc("eth_getTransactionReceipt",[hash]);
        if(receipt){
          if(receipt.status!=="0x1")throw Error("트랜잭션 실패: "+hash);
          const proof=await fetchAnchor(record);
          if(!proof.exact)throw Error("TX는 성공했지만 등록된 해시가 일치하지 않습니다.");
          st.proof=proof;
          setStatus("온체인 고정 및 재검증 PASS · Etherscan TX가 확인됐습니다.","pass");
          $("xai-anchor-chain").textContent="등록 블록 #"+proof.block+" · SHA-256 "+small(proof.hash);
          return;
        }
        await new Promise(resolve=>setTimeout(resolve,3000));
      }
      setStatus("전송했지만 영수증 확인이 지연 중입니다. Etherscan에서 결과를 확인하고 다시 조회하세요.","neutral");
    }catch(e){setStatus("등록 미확인 · "+e.message,"fail");}
    finally{st.busy=false;$("xai-anchor-send").disabled=true; if(record===st.record)await refresh();}
  }
  function saveFile(report){
    const blob=new Blob([JSON.stringify(report,null,2)+"\n"],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download="InspectEscrow_XAI_AnchorReport_"+(report.payload?.roleName||"role")+".json";
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  async function upload(file){
    if(!file)return;
    if(file.size<100||file.size>8*1024*1024){setStatus("파일은 JSON 100B~8MiB만 허용됩니다.","fail");return;}
    $("xai-anchor-upload").disabled=true;
    setStatus("선택한 JSON 내부 원본·모델·XAI 해시를 확인하는 중…","neutral");
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());
      const parsed=JSON.parse(new TextDecoder().decode(bytes));
      let result;
      if(parsed.schema==="inspectescrow.modelb-browser-evidence-bundle/1")
        result=await derivedFromEvidence(parsed,bytes);
      else result=await readReport(parsed);
      setFields(result);
      setStatus("오프체인 XAI 보고서 SHA-256 검증 PASS · Sepolia 확인을 실행하세요.","neutral");
      await refresh();
    }catch(e){setStatus("파일 검증 실패 · "+e.message,"fail");}
    finally{$("xai-anchor-upload").disabled=false;$("xai-anchor-upload").value="";}
  }
  function render(){
    if($("xai-anchor-panel"))return;
    const parent=document.querySelector('.platform-view[data-view="inspection"]');
    if(!parent)return;
    const panel=document.createElement("section");
    panel.id="xai-anchor-panel";
    panel.className="xai-anchor-panel";
    panel.setAttribute("aria-label","XAI Sepolia 온체인 해시 검증");
    panel.innerHTML=[
      '<div class="xai-anchor-heading"><div><span class="xai-anchor-eyebrow">XAI × BLOCKCHAIN · SEPOLIA</span>',
      '<h2>XAI 판단 근거 온체인 고정·검증</h2>',
      '<p>검사 원본·모델·Evidence에 연결된 XAI 보고서의 SHA-256을 독립 컨트랙트에 고정합니다. 실제 사진과 히트맵은 오프체인에 보관합니다.</p></div>',
      '<a href="https://sepolia.etherscan.io/address/'+ANCHOR+'" target="_blank" rel="noopener noreferrer">XAI Anchor 컨트랙트 확인 ↗</a></div>',
      '<div class="xai-anchor-actions"><button id="xai-anchor-s05" type="button">실증 완료 · Supplier S05 조회</button>',
      '<label class="xai-anchor-upload-label">Evidence / XAI 보고서 JSON 불러오기',
      '<input id="xai-anchor-upload" type="file" accept=".json,application/json"></label>',
      '<button id="xai-anchor-file-export" type="button" disabled>검증된 보고서 저장</button></div>',
      '<div class="xai-anchor-facts">',
      '<div><span>Trade ID</span><code id="xai-anchor-trade">미선택</code></div>',
      '<div><span>역할</span><strong id="xai-anchor-role">미선택</strong></div>',
      '<div><span>Evidence Package Hash</span><code id="xai-anchor-evidence">미선택</code></div>',
      '<div><span>XAI 보고서 SHA-256</span><code id="xai-anchor-digest">미선택</code></div></div>',
      '<p class="xai-anchor-source" id="xai-anchor-source"></p>',
      '<div class="xai-anchor-status" id="xai-anchor-status" data-kind="neutral" role="status" aria-live="polite">실증 완료된 S05 기록을 조회하거나 실제 검사 Evidence JSON을 불러와 검증하세요.</div>',
      '<p class="xai-anchor-chain" id="xai-anchor-chain">Sepolia 재조회 전</p>',
      '<div class="xai-anchor-actions"><button id="xai-anchor-refresh" type="button">Sepolia 해시 재검증</button>',
      '<button id="xai-anchor-connect" type="button">MetaMask 연결</button>',
      '<button id="xai-anchor-send" type="button" class="xai-anchor-primary" disabled>검증된 XAI 해시 Sepolia 등록</button>',
      '<a id="xai-anchor-tx" hidden target="_blank" rel="noopener noreferrer"></a></div>',
      '<p class="xai-anchor-wallet" id="xai-anchor-wallet">지갑 미연결 · 조회는 지갑 없이 가능</p>',
      '<p class="xai-anchor-disclaimer">별도 XAI 보조 해시 기록입니다. 기존 InspectEscrow 에스크로의 EIP-712 검사 증거 서명·제출 및 실물 진품 여부를 보증하지 않습니다. 등록 전에 보고서를 보관하세요.</p>'
    ].join("");
    parent.appendChild(panel);
    $("xai-anchor-s05").addEventListener("click",()=>{
      setFields({...S05,source:sourceLabel,report:null});
      refresh();
    });
    $("xai-anchor-upload").addEventListener("change",event=>upload(event.target.files?.[0]));
    $("xai-anchor-file-export").addEventListener("click",()=>{if(st.record?.report)saveFile(st.record.report);});
    $("xai-anchor-refresh").addEventListener("click",refresh);
    $("xai-anchor-connect").addEventListener("click",()=>checkWallet(true));
    $("xai-anchor-send").addEventListener("click",send);
    // Never auto-sign or auto-send; the verified old record may be shown on request.
  }
  window.InspectEscrowXAIAnchorUI={readReport,derivedFromEvidence,fetchAnchor,refresh,upload,S05,ANCHOR};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",render,{once:true});
  else render();
})();