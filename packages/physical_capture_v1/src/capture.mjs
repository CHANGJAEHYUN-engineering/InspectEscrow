const E = globalThis.ethers;
if (!E) throw new Error("ethers UMD bundle not loaded");

const ZERO32 = "0x" + "00".repeat(32);
const EXPECTED_CHAIN_ID = 11155111n;
const VIEWS = ["TOP", "FRONT", "SIDE"];
const REQUIRED_VIEW_SET_ID = "PHYSICAL_TOP_FRONT_SIDE_V1";
const REQUIRED_VIEW_SET_HASH = E.id(REQUIRED_VIEW_SET_ID);

const CAPTURE_TYPES = {
  CaptureAttestation: [
    {name:"tradeId",type:"bytes32"},
    {name:"role",type:"uint8"},
    {name:"station",type:"address"},
    {name:"specimenIdHash",type:"bytes32"},
    {name:"captureSessionNonce",type:"bytes32"},
    {name:"viewIdHash",type:"bytes32"},
    {name:"sequenceIndex",type:"uint8"},
    {name:"requiredViewCount",type:"uint8"},
    {name:"imageHash",type:"bytes32"},
    {name:"previousCaptureDigest",type:"bytes32"},
    {name:"capturedAt",type:"uint64"},
    {name:"validUntil",type:"uint64"}
  ]
};

const SEAL_TYPES = {
  CaptureSessionSeal: [
    {name:"tradeId",type:"bytes32"},
    {name:"role",type:"uint8"},
    {name:"station",type:"address"},
    {name:"specimenIdHash",type:"bytes32"},
    {name:"captureSessionNonce",type:"bytes32"},
    {name:"requiredViewSetHash",type:"bytes32"},
    {name:"sessionManifestHash",type:"bytes32"},
    {name:"finalCaptureDigest",type:"bytes32"},
    {name:"requiredViewCount",type:"uint8"},
    {name:"sealedAt",type:"uint64"}
  ]
};

const state = {
  provider:null,
  signer:null,
  station:null,
  domain:null,
  session:null
};

function $(id){ return document.getElementById(id); }
function nowSec(){ return Math.floor(Date.now()/1000); }
function isBytes32(v){ return /^0x[0-9a-fA-F]{64}$/.test(v||""); }

function jcs(value){
  if(value===null) return "null";
  if(typeof value==="boolean") return value ? "true" : "false";
  if(typeof value==="number"){
    if(!Number.isSafeInteger(value)) throw new Error("Unsafe JSON integer");
    return String(value);
  }
  if(typeof value==="string") return JSON.stringify(value);
  if(Array.isArray(value)) return "[" + value.map(jcs).join(",") + "]";
  if(typeof value==="object"){
    return "{" + Object.keys(value).sort().map(function(k){
      return JSON.stringify(k) + ":" + jcs(value[k]);
    }).join(",") + "}";
  }
  throw new Error("Unsupported JCS value");
}

function log(msg, kind){
  const el=$("log");
  const line=document.createElement("div");
  line.className=kind||"";
  line.textContent=msg;
  el.prepend(line);
}

function roleCode(){
  return $("role").value==="SUPPLIER" ? 0 : 1;
}

async function connectWallet(){
  if(!window.ethereum) throw new Error("MetaMask/EIP-1193 wallet not found");
  state.provider=new E.BrowserProvider(window.ethereum);
  await state.provider.send("eth_requestAccounts",[]);
  const network=await state.provider.getNetwork();
  if(network.chainId!==EXPECTED_CHAIN_ID){
    throw new Error("Switch wallet to Sepolia chainId 11155111 before signing");
  }
  state.signer=await state.provider.getSigner();
  state.station=await state.signer.getAddress();
  state.domain={
    name:"InspectEscrowPhysicalCapture",
    version:"1",
    chainId:Number(EXPECTED_CHAIN_ID)
  };
  $("wallet").textContent=state.station;
  log("Wallet connected: "+state.station,"ok");
}

function generateDemoTradeId(){
  const specimen=$("specimenId").value.trim()||"IE-DEMO-001";
  const v=E.id("InspectEscrow|PhysicalDemo|"+specimen+"|"+Date.now());
  $("tradeId").value=v;
  log("Generated demo binding id: "+v,"ok");
}

async function startSession(){
  if(!state.signer) await connectWallet();
  const tradeId=$("tradeId").value.trim();
  const specimenId=$("specimenId").value.trim();
  if(!isBytes32(tradeId)) throw new Error("tradeId/demo binding must be bytes32");
  if(!specimenId) throw new Error("specimenId required");

  const nonce=E.hexlify(E.randomBytes(32));
  state.session={
    schema:"inspectescrow.physical-capture-session/1.0.0",
    protocol:"PHYSICAL_CAPTURE_PROTOCOL_V1",
    status:"OPEN_NO_INFERENCE_ALLOWED",
    tradeId,
    role:$("role").value,
    roleCode:roleCode(),
    station:state.station,
    specimenId,
    specimenIdHash:E.id(specimenId),
    captureSessionNonce:nonce,
    requiredViewSetId:REQUIRED_VIEW_SET_ID,
    requiredViewSetHash:REQUIRED_VIEW_SET_HASH,
    requiredViewCount:VIEWS.length,
    openedAt:nowSec(),
    captures:[],
    seal:null,
    claimBoundary:{
      cryptographicPhysicalIdentityProof:false,
      trustedCameraProof:false,
      postCaptureFileIntegrity:true,
      preInferenceCommitment:true
    }
  };
  render();
  log("Session OPEN. Inference is prohibited until 3/3 views are sealed.","warn");
}

async function readFileBytes(file){
  return new Uint8Array(await file.arrayBuffer());
}

async function commitNextView(){
  if(!state.session) throw new Error("Start a session first");
  if(state.session.seal) throw new Error("Session already sealed");
  const index=state.session.captures.length;
  if(index>=VIEWS.length) throw new Error("All required views already committed");

  const file=$("imageFile").files[0];
  if(!file) throw new Error("Select the next original image file");
  const expectedView=VIEWS[index];
  const bytes=await readFileBytes(file);
  const imageHash=E.keccak256(bytes);
  const previous=index===0 ? ZERO32 : state.session.captures[index-1].attestationDigest;
  const capturedAt=nowSec();
  const message={
    tradeId:state.session.tradeId,
    role:state.session.roleCode,
    station:state.station,
    specimenIdHash:state.session.specimenIdHash,
    captureSessionNonce:state.session.captureSessionNonce,
    viewIdHash:E.id(expectedView),
    sequenceIndex:index+1,
    requiredViewCount:VIEWS.length,
    imageHash,
    previousCaptureDigest:previous,
    capturedAt,
    validUntil:capturedAt+3600
  };
  const digest=E.TypedDataEncoder.hash(state.domain,CAPTURE_TYPES,message);
  const signature=await state.signer.signTypedData(state.domain,CAPTURE_TYPES,message);
  const recovered=E.verifyTypedData(state.domain,CAPTURE_TYPES,message,signature);
  if(recovered.toLowerCase()!==state.station.toLowerCase()) throw new Error("Capture signature recovery mismatch");

  state.session.captures.push({
    viewId:expectedView,
    originalFileName:file.name,
    byteLength:file.size,
    mediaType:file.type||"application/octet-stream",
    imageHash,
    attestation:message,
    attestationDigest:digest,
    signature,
    recoveredSigner:recovered
  });
  $("imageFile").value="";
  render();
  log(expectedView+" committed before inference: "+imageHash,"ok");
}

function unsignedSessionManifest(){
  const s=state.session;
  return {
    schema:s.schema,
    protocol:s.protocol,
    tradeId:s.tradeId,
    role:s.role,
    roleCode:s.roleCode,
    station:s.station,
    specimenId:s.specimenId,
    specimenIdHash:s.specimenIdHash,
    captureSessionNonce:s.captureSessionNonce,
    requiredViewSetId:s.requiredViewSetId,
    requiredViewSetHash:s.requiredViewSetHash,
    requiredViewCount:s.requiredViewCount,
    openedAt:s.openedAt,
    captures:s.captures.map(function(c){
      return {
        viewId:c.viewId,
        originalFileName:c.originalFileName,
        byteLength:c.byteLength,
        mediaType:c.mediaType,
        imageHash:c.imageHash,
        attestationDigest:c.attestationDigest
      };
    })
  };
}

async function sealSession(){
  if(!state.session) throw new Error("Start a session first");
  if(state.session.captures.length!==VIEWS.length) throw new Error("Required views incomplete: "+state.session.captures.length+"/3");
  if(state.session.seal) throw new Error("Already sealed");

  const canonical=jcs(unsignedSessionManifest());
  const sessionManifestHash=E.keccak256(E.toUtf8Bytes(canonical));
  const sealedAt=nowSec();
  const finalCaptureDigest=state.session.captures.at(-1).attestationDigest;
  const message={
    tradeId:state.session.tradeId,
    role:state.session.roleCode,
    station:state.station,
    specimenIdHash:state.session.specimenIdHash,
    captureSessionNonce:state.session.captureSessionNonce,
    requiredViewSetHash:REQUIRED_VIEW_SET_HASH,
    sessionManifestHash,
    finalCaptureDigest,
    requiredViewCount:VIEWS.length,
    sealedAt
  };
  const digest=E.TypedDataEncoder.hash(state.domain,SEAL_TYPES,message);
  const signature=await state.signer.signTypedData(state.domain,SEAL_TYPES,message);
  const recovered=E.verifyTypedData(state.domain,SEAL_TYPES,message,signature);
  if(recovered.toLowerCase()!==state.station.toLowerCase()) throw new Error("Seal signature recovery mismatch");
  state.session.status="SEALED_INFERENCE_ALLOWED";
  state.session.sealedAt=sealedAt;
  state.session.sessionManifestHash=sessionManifestHash;
  state.session.seal={
    domain:state.domain,
    types:SEAL_TYPES,
    message,
    digest,
    signature,
    recoveredSigner:recovered
  };
  render();
  log("SESSION SEALED. Inference may now consume only the committed image hashes.","ok");
}

function exportSession(){
  if(!state.session || !state.session.seal) throw new Error("Seal session before export");
  const blob=new Blob([JSON.stringify(state.session,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=state.session.specimenId+"_"+state.session.role+"_CAPTURE_SESSION.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function verifySession(){
  const manifestFile=$("verifyManifest").files[0];
  const imageFiles=Array.from($("verifyImages").files||[]);
  if(!manifestFile) throw new Error("Select exported capture session JSON");
  if(imageFiles.length!==3) throw new Error("Select exactly 3 original images in TOP, FRONT, SIDE order");
  const manifest=JSON.parse(await manifestFile.text());
  if(!manifest.seal || manifest.status!=="SEALED_INFERENCE_ALLOWED") throw new Error("Manifest not sealed");
  if(!Array.isArray(manifest.captures) || manifest.captures.length!==3) throw new Error("Manifest does not contain 3 captures");
  if(manifest.requiredViewSetId!==REQUIRED_VIEW_SET_ID) throw new Error("Required view set ID mismatch");
  if(manifest.requiredViewSetHash.toLowerCase()!==REQUIRED_VIEW_SET_HASH.toLowerCase()) throw new Error("Required view set hash mismatch");
  if(manifest.requiredViewCount!==3) throw new Error("Required view count mismatch");
  if(E.id(manifest.specimenId).toLowerCase()!==manifest.specimenIdHash.toLowerCase()) throw new Error("Specimen ID hash mismatch");

  const importedPreimage={
    schema:manifest.schema,
    protocol:manifest.protocol,
    tradeId:manifest.tradeId,
    role:manifest.role,
    roleCode:manifest.roleCode,
    station:manifest.station,
    specimenId:manifest.specimenId,
    specimenIdHash:manifest.specimenIdHash,
    captureSessionNonce:manifest.captureSessionNonce,
    requiredViewSetId:manifest.requiredViewSetId,
    requiredViewSetHash:manifest.requiredViewSetHash,
    requiredViewCount:manifest.requiredViewCount,
    openedAt:manifest.openedAt,
    captures:manifest.captures.map(function(c){
      return {
        viewId:c.viewId,
        originalFileName:c.originalFileName,
        byteLength:c.byteLength,
        mediaType:c.mediaType,
        imageHash:c.imageHash,
        attestationDigest:c.attestationDigest
      };
    })
  };
  const recomputedManifestHash=E.keccak256(E.toUtf8Bytes(jcs(importedPreimage)));
  if(recomputedManifestHash.toLowerCase()!==manifest.sessionManifestHash.toLowerCase()) throw new Error("Session manifest hash mismatch");
  if(recomputedManifestHash.toLowerCase()!==manifest.seal.message.sessionManifestHash.toLowerCase()) throw new Error("Seal does not bind this session manifest");

  for(let i=0;i<3;i++){
    const cap=manifest.captures[i];
    if(cap.viewId!==VIEWS[i]) throw new Error("View order mismatch at "+(i+1));
    if(cap.attestation.sequenceIndex!==i+1) throw new Error(VIEWS[i]+" sequence index mismatch");
    if(cap.attestation.requiredViewCount!==3) throw new Error(VIEWS[i]+" required view count mismatch");
    if(cap.attestation.tradeId.toLowerCase()!==manifest.tradeId.toLowerCase()) throw new Error(VIEWS[i]+" trade binding mismatch");
    if(cap.attestation.station.toLowerCase()!==manifest.station.toLowerCase()) throw new Error(VIEWS[i]+" station binding mismatch");
    if(cap.attestation.specimenIdHash.toLowerCase()!==manifest.specimenIdHash.toLowerCase()) throw new Error(VIEWS[i]+" specimen binding mismatch");
    if(cap.attestation.captureSessionNonce.toLowerCase()!==manifest.captureSessionNonce.toLowerCase()) throw new Error(VIEWS[i]+" session nonce mismatch");
    if(cap.attestation.viewIdHash.toLowerCase()!==E.id(VIEWS[i]).toLowerCase()) throw new Error(VIEWS[i]+" view ID hash mismatch");

    const h=E.keccak256(await readFileBytes(imageFiles[i]));
    if(h.toLowerCase()!==cap.imageHash.toLowerCase()) throw new Error(VIEWS[i]+" image hash mismatch");
    if(h.toLowerCase()!==cap.attestation.imageHash.toLowerCase()) throw new Error(VIEWS[i]+" attestation image hash mismatch");

    const recomputedDigest=E.TypedDataEncoder.hash(manifest.seal.domain,CAPTURE_TYPES,cap.attestation);
    if(recomputedDigest.toLowerCase()!==cap.attestationDigest.toLowerCase()) throw new Error(VIEWS[i]+" attestation digest mismatch");
    const recovered=E.verifyTypedData(manifest.seal.domain,CAPTURE_TYPES,cap.attestation,cap.signature);
    if(recovered.toLowerCase()!==manifest.station.toLowerCase()) throw new Error(VIEWS[i]+" capture signature mismatch");

    const expectedPrevious=i===0 ? ZERO32 : manifest.captures[i-1].attestationDigest;
    if(cap.attestation.previousCaptureDigest.toLowerCase()!==expectedPrevious.toLowerCase()) throw new Error(VIEWS[i]+" chain link mismatch");
  }

  if(manifest.seal.message.finalCaptureDigest.toLowerCase()!==manifest.captures[2].attestationDigest.toLowerCase()) throw new Error("Final capture digest mismatch");
  if(manifest.seal.message.requiredViewSetHash.toLowerCase()!==REQUIRED_VIEW_SET_HASH.toLowerCase()) throw new Error("Seal required-view-set mismatch");
  if(manifest.seal.message.tradeId.toLowerCase()!==manifest.tradeId.toLowerCase()) throw new Error("Seal trade binding mismatch");
  if(manifest.seal.message.station.toLowerCase()!==manifest.station.toLowerCase()) throw new Error("Seal station binding mismatch");
  if(manifest.seal.message.specimenIdHash.toLowerCase()!==manifest.specimenIdHash.toLowerCase()) throw new Error("Seal specimen binding mismatch");
  if(manifest.seal.message.captureSessionNonce.toLowerCase()!==manifest.captureSessionNonce.toLowerCase()) throw new Error("Seal session nonce mismatch");

  const recomputedSealDigest=E.TypedDataEncoder.hash(manifest.seal.domain,SEAL_TYPES,manifest.seal.message);
  if(recomputedSealDigest.toLowerCase()!==manifest.seal.digest.toLowerCase()) throw new Error("Seal digest mismatch");
  const sealRecovered=E.verifyTypedData(manifest.seal.domain,SEAL_TYPES,manifest.seal.message,manifest.seal.signature);
  if(sealRecovered.toLowerCase()!==manifest.station.toLowerCase()) throw new Error("Seal signer mismatch");

  $("verifyResult").textContent="VERIFIED — exact 3/3 files, view order, metadata bindings, capture digest chain, session manifest hash and Station signatures all match.";
  $("verifyResult").className="result ok";
  log("Imported physical evidence verified successfully.","ok");
}

function render(){
  const s=state.session;
  if(!s){
    $("sessionState").textContent="No active session";
    $("nextView").textContent="TOP";
    $("tableBody").innerHTML="";
    return;
  }
  $("sessionState").textContent=s.status+" · "+s.captures.length+"/3";
  $("nextView").textContent=s.captures.length<3 ? VIEWS[s.captures.length] : "COMPLETE";
  $("tableBody").innerHTML=s.captures.map(function(c,i){
    return "<tr><td>"+(i+1)+"</td><td>"+c.viewId+"</td><td>"+escapeHtml(c.originalFileName)+"</td><td class='mono'>"+c.imageHash+"</td><td class='mono'>"+c.attestationDigest+"</td></tr>";
  }).join("");
  $("sealBtn").disabled=s.captures.length!==3 || !!s.seal;
  $("exportBtn").disabled=!s.seal;
}

function escapeHtml(v){
  return String(v).replace(/[&<>"']/g,function(ch){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
  });
}

function safe(fn){
  return async function(){
    try{ await fn(); }
    catch(err){ log(err.message||String(err),"bad"); }
  };
}

$("connectBtn").addEventListener("click",safe(connectWallet));
$("demoIdBtn").addEventListener("click",generateDemoTradeId);
$("startBtn").addEventListener("click",safe(startSession));
$("commitBtn").addEventListener("click",safe(commitNextView));
$("sealBtn").addEventListener("click",safe(sealSession));
$("exportBtn").addEventListener("click",safe(async function(){exportSession();}));
$("verifyBtn").addEventListener("click",safe(verifySession));
render();

export {jcs, CAPTURE_TYPES, SEAL_TYPES, REQUIRED_VIEW_SET_HASH};
