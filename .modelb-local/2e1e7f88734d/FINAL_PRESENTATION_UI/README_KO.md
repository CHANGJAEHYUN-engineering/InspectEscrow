# InspectEscrow — Final Presentation Web UI (2026-10-29)

## 목적
하나의 발표용 웹사이트에서 아래 기능을 일관된 디자인으로 보여주는 UI 패키지입니다.

1. 실물 육각너트 TOP 이미지의 실제 Model B PatchCore 추론 (로컬 AI 서버)
2. TOP/FRONT/SIDE 원본 SHA-256과 서명 전 검사 리포트 생성
3. 별도로 성공했던 PATCH3 Model B S05 정상 거래의 Sepolia 최신 상태 실시간 조회
4. Buyer REVIEW 시 분쟁·Inspector 흐름 설명 (설계와 실증 범위 구분)
5. 명시적 승인이 필요한 기존 PATCH3 거래 실행 콘솔 보존

**중요: 새로 촬영한 사진을 기존에 정산 완료된 S05 거래에 자동 제출하는 기능은 없습니다.**
새 촬영→신규 거래→분쟁 정산 E2E를 구현했다고 주장하지 않습니다.

## 실행 방법 (Windows)
- START_FINAL_DEMO.bat 더블클릭. 기존 8766(Model B), 8768(PATCH3) 서버가 안 떠 있으면 구동하고, 8770에서 새 UI를 실행합니다.
- 브라우저에서 http://127.0.0.1:8770/ 접속.
- 발표 전에 PREPARE_MODEL_B.bat를 실행해 보관 S05 이미지의 원본 SHA-256/추론 결과를 확인하고 모델을 메모리에 미리 로딩합니다.
- 현장에서는 새로운 TOP 사진을 실시간 AI 검사에 업로드해 실제 점수를 계산합니다.
- 온체인 정산·감사 탭의 기록은 기존 보관 이미지를 신규 거래에 바인딩한 별도 검증 건입니다.

## 검증 인터페이스
- UI 및 정적 파일: HTTP 200.
- GET /api/modelb/status : Model B 상태와 체크포인트 검증.
- POST /api/modelb/infer : 기존 AI 서버 8766의 검증된 실제 추론 API.
- GET /api/trade : Ethers.js 읽기 전용 Sepolia. 상태, 검사 기록, 출금 receipt 및 회계 불변식.
- SMOKE_TEST_MODEL_B.json : 보관 S05 TOP 이미지로 완료한 실제 추론 스모크 테스트 기록.
- 기존 Sepolia S05 Trade ID: 0x2e1e7f88734dc4bf2b1fee924192a11311846a4351b86497d5c43670fa173d9e
- 컨트랙트: 0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905 · Sepolia chain 11155111.

## 기능·권한 경계
- 새 8770 서버에는 private key가 없으며 TX를 브로드캐스트하지 않습니다.
- 라이브 AI 검사는 TOP 이미지만 PatchCore 입력에 사용합니다. FRONT/SIDE는 원본 파일 SHA-256 계산에 사용합니다.
- 실시간 결과 JSON은 정식 거래 제출용 Evidence Package 또는 Station Attestation이 아닙니다.
- 온체인 정산·감사는 완료된 S05의 현 상태를 읽고 과거 검증된 12 TX 링크를 보여줍니다.
- 거래 실행 콘솔은 기존 UI 8768을 유지합니다. 실제 MetaMask 승인 작업은 별도의 최상위 브라우저 탭에서 진행하는 편이 안정적입니다.
- PATCH2 Model A의 분쟁 실증과 PATCH3 Model B의 정상 거래 E2E를 구분합니다.
- PATCH3 Model B REVIEW → Inspector → 정산의 온체인 E2E는 이 UI 구축으로 완료된 것이 아닙니다.
- 블록체인이 원본 사진 속 물체의 실제 신원·물리적 인수인계를 증명하지는 않습니다.

## 발표 전 점검
- 8766, 8768, 8770 포트 구동 확인.
- PREPARE_MODEL_B.bat 실행 → INFERENCE_SMOKE_PASS 확인.
- 새 실물 사진으로 Model B 직접 추론하여 REVIEW 또는 PASS 결과 확인.
- Sepolia 조회가 RELEASED(17), accountingConserved true, balanceCoversLiabilities true, supplier claimable 0 반환하는지 확인.
- 필요하다면 MetaMask Sepolia 계정 확인. 이미 완료된 거래를 재제출하거나 다시 fund하지 않습니다.
- 인터넷 연결 문제 대비 기존 12개 Etherscan TX와 녹화 자료 준비.

## 구성 파일
server.cjs / index.html / styles.css / app.js
smoke-test.cjs / SMOKE_TEST_MODEL_B.json
START_FINAL_DEMO.bat / PREPARE_MODEL_B.bat

## 유의사항
- 모든 서버는 127.0.0.1 로컬 Windows 환경에서만 연결됩니다.
- Sepolia RPC 연결에 실패하면 UI는 최신 상태 확인 실패로 안내하고 새로운 PASS를 주장하지 않습니다.
- MetaMask 서명·거래 승인 버튼은 자동으로 실행되지 않습니다.


## REVIEW 거래 준비 확장 (2026-10-30)
이번 추가 구현은 실시간 AI 결과가 REVIEW_REQUIRED일 때:
1. TOP·FRONT·SIDE 원본 모두 존재하는지 확인합니다.
2. 새로운 Trade ID를 입력해 Sepolia AWAIT_BUYER(8), Supplier PASS, Buyer 미제출, 정책/모델/Station, 타임아웃, 자금 보존 불변식을 읽기 전용으로 확인합니다.
3. 기존 정책 preimage에는 Trade ID가 포함되어 있으므로 **새 Trade ID에 맞는 정책 해시를 재계산**합니다.
4. 사전검증 후 TOP 이미지에 대한 **실제 Model B 재추론**과 3개 원본 파일 바이트의 SHA256 검증을 수행합니다.
5. 기존 성공 거래에서 사용한 canonical JSON/keccak 규격과 동일한 Manifest, Evidence Package 및 UNSIGNED StationAttestation JSON을 생성합니다. Station 서명은 아직 없고 블록체인으로 전송하지 않습니다.

새 메뉴: REVIEW 거래 준비
새 GET 엔드포인트: /api/review/preflight?tradeId=<32-byte hex>
새 POST 엔드포인트: /api/review/prepare (Local same-origin UI only, JSON with original image bytes; read-only + offchain-only)
새 모듈: evidence-bridge.cjs, review-endpoints.cjs

### 검증
- 이전 S05 archived bundle 재생성 시 Manifest hash 및 Evidence Package hash 동일: PASS.
- 이전 정책 preimage JCS/hash 재현: PASS.
- 새 Trade ID를 포함한 정책 preimage/hash 재계산: PASS.
- 실제 신규 TradeTerms의 proposeTrade.staticCall (eth_call only): PASS, 거래/서명/자금 전송 없음.
- 종료된 S05 Trade ID를 신규 검사 대상 입력 시: BLOCKED.
- 존재하지 않는 새 Trade ID 입력 시: BLOCKED.
- 새로 AWAIT_BUYER(8)가 된 거래의 실제 POST 증거 생성은 아직 검증되지 않았습니다. 이를 본선 E2E 완료로 주장하지 않습니다.

### 준비된 신규 거래 후보
파일: .modelb-local/REVIEW_TRADE_CANDIDATE_49bf5596/
Trade ID: 0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff
New policy hash: 0x89ca38f6006723c8ad8c29fea789d48f017fe2b6da62ad43591540b5c88e63d1

후보는 아직 **PROPOSED 상태도 아니며, 실제 돈/가스비를 사용하지 않았습니다.** 신규 거래로 승인/배정/예치/활성화/Supplier PASS가 먼저 일어난 후 Buyer REVIEW 제출을 진행해야 합니다. 완료된 S05를 재사용할 수 없습니다.

### 다음 실제 검증 단계
- 사용자와 Buyer/Inspector가 새 후보의 정책·역할·시간 조건을 검토한 뒤 명시적으로 각각의 MetaMask 승인을 수행합니다.
- 새 거래를 AWAIT_BUYER(8)까지 준비한 다음, 이 UI에서 방금 촬영한 BUYER REVIEW 3뷰와 모델 추론을 바인딩합니다.
- 새 Station EIP-712 서명, Buyer Actor staticCall/estimateGas, 명시적 MetaMask 제출과 DISPUTED_PRIMARY 전이를 검증합니다.
- 별도로 Replay/Inspector 정산 및 Withdraw가 성공했을 때만 PATCH3 Model B 분쟁 E2E 완료라고 발표할 수 있습니다.


## PATCH3 신규 거래 개설 UI (2026-10-30, v3)
추가된 좌측 메뉴: 신규 거래 개설
로컬 주소: http://127.0.0.1:8770/#proposal
- 현재 Sepolia 실시간 조회: 체인 ID, 기존 미사용 신규 Trade ID, 컨트랙트 코드/자격 5개, supplier 계정 테스트 ETH 잔액, 정확한 새 Policy Hash와 proposeTrade.staticCall 및 estimateGas.
- 거래 후보는 .modelb-local/REVIEW_TRADE_CANDIDATE_49bf5596/ 폴더에 저장된 JSON이며 원래 완료한 S05 거래와 다른 Trade ID/Policy Hash를 사용합니다.
- MetaMask는 반드시 Supplier Actor = 0xaE7B8A9B15534829492F9449a67e83aAbd82E7BE 계정, Sepolia 네트워크(11155111)여야 합니다.
- 3개 체크박스 동의, Supplier 연결, 1분 이내의 사전검증 상태가 없으면 TX 요청 버튼은 비활성화됩니다.
- 버튼을 누르면 서명 지갑을 한 번 더 확인하고 staticCall과 estimateGas를 다시 실행, 화면 확인을 받은 다음 MetaMask로 최종 거래승인을 요청합니다. 그 전에 어떤 전송도 수행하지 않습니다.
- 사용자 최종 MetaMask 승인 후 컨트랙트의 상태가 PROPOSED(1)가 되는지 조회합니다.
- 이 단계에서 test ETH 예치액은 0이며, 실제로 발생하는 것은 Supplier의 테스트넷 GAS 비용뿐입니다.
- PROPOSED(1) 다음 단계는 Supplier/Buyer 정책 수락, Primary/Backup/External inspector 배정 수락, Buyer 0.001 테스트 ETH 예치, activate, Supplier PASS, Buyer REVIEW, Replay/Inspector 결정 및 withdraw입니다.
- 이번 작업에서는 **신규 거래를 아직 전송하지 않았으며**, 제3자 계정 서명이나 Buyer 예치도 발생하지 않았습니다.
- 새로 작성한 backend: new-trade-endpoints.cjs (GET-only, 읽기 전용), 새 frontend: proposal.js, ethers.js는 기존 node_modules에서 로컬 제공.
- 코드 변경은 FINAL_PRESENTATION_UI 폴더 내부의 frontend 및 읽기 전용 서버로 제한. 기존 Sepolia 컨트랙트와 검증된 기존 8766/8768 앱은 변경하지 않았습니다.


## 역할별 거래 실행 UI (v4 / 2026-10-30)
### 실제 인터페이스
통합 사이트 주소: http://127.0.0.1:8770/#roles
단일 PROPOSED(1) 신규 REVIEW 거래의 역할별 정식 MetaMask 실행 화면을 추가함.
- Supplier Actor: acceptPolicy()
- Buyer Actor: acceptPolicy()
- Primary Inspector Actor: acceptInspectorAssignment()
- Backup Inspector Actor: acceptInspectorAssignment()
- External Arbitrator Actor: acceptInspectorAssignment()
- Buyer Actor: fund() (Value 정확히 0.001 Sepolia ETH)
- Supplier Actor: activate() (컨트랙트 상 permissionless지만 본 UI의 데모 운영 역할은 Supplier로 제한)
위 7개 액션만 사용자 승인에 따라 실행하도록 구현. EIP-712 검사/Replay/Inspector 판정의 실제 온체인 실행은 이 화면에 아직 포함되지 않음.

### 상태 및 안전 게이트
1. 기존 신규 거래 ID/정책 해시/5명의 Actor 및 Station 주소는 실제 컨트랙트와 일치 검증.
2. 현재 Sepolia 상태·회계 불변식·정책·역할의 읽기 전용 조회.
3. 완료된 정책·배정 수락은 이벤트 로그로 판정, 중복 실행은 contract.staticCall 자체가 차단.
4. 계정에 맞는 카드만 활성화; 다른 역할 및 미도달 거래 상태 카드는 비활성화.
5. 실행 전에 다시 RPC 상태를 확인하고 signer address, chainId, staticCall, estimateGas, 잔액/가스 가격을 재검증.
6. 사용자 체크박스와 별도 브라우저 확인, MetaMask 지갑의 직접 승인이 둘 다 있어야 트랜잭션 전송.
7. 영수증 status=1, 거래 ID/역할/정책 이벤트 확인 후에만 성공 표시.
8. 입금은 Buyer actor에서만 정확히 0.001 테스트 ETH 사용, 나머지는 0 ETH + 가스비.
9. 서버는 API를 GET 읽기 전용으로 제공하며 키·시드 문구를 수집하거나 트랜잭션을 발송하지 않음.

### 실증 수준
- 신규 거래 PROPOSED(1) 생성 TX 0xaf26f08f65c0b5541b61ea3c41c51b2af883a5328ed69f5c2da7e75d936c6222 onchain 성공.
- 현재 역할별 신규 API에서 Supplier와 Buyer 정책 수락을 READY로 판정. Inspector/예치/활성화는 WAITING.
- Supplier/Buyer/비등록 지갑/잘못된 네트워크/미설치 MetaMask 5개 가상 브라우저 시나리오 PASS, 실제 트랜잭션 0건.
- 이 v4 작업으로 실제 acceptPolicy/Inspector/fund/activate를 완료했다고 주장하지 않음. 각 Actor가 직접 승인한 뒤 receipt로 검증해야 함.
- 실제 5명의 Actor가 각기 다른 PC에서 동일한 사이트로 접속할 수 있는 상용 배포 환경은 구축되지 않음. 현재 localhost URL은 각 PC에서 서로 다른 주소를 의미하므로 실제 다중 PC 사용 시 정식 호스팅/보안 HTTPS 및 독립 메타마스크를 준비해야 함.
- 검증용 계정 권한을 사용한 단일 노트북 데모는 웹사이트에서 지갑 계정을 바꿔 가며 수행 가능함.

### 발표용 사실관계
"InspectEscrow는 Supplier, Buyer, Inspector가 동일한 거래 조건을 공유하면서 각자의 MetaMask 지갑으로 권한에 맞는 기능만 실행하도록 설계했습니다. 컨트랙트가 참여자 주소·정책 해시·상태를 검증하며, 모든 서명과 자금 이동은 각 역할의 명시적인 승인 뒤에만 실행됩니다. 현재 본선 프로토타입은 로컬 환경에서 시연하며, 여러 사업체가 원격 접속하는 상용 서비스로의 배포는 후속 과제입니다."


## 본선 시연 3장면 콘솔 (2026-10-30 / v5)
- 시작: START_STAGE_3_SCENES.bat 또는 기존 서버 가동 상태에서 http://127.0.0.1:8770/stage
- 장면 1: 보관 정상 S05 / 보관 스크래치 S03 또는 실제 현장 사진. 해당 이미지를 실제 PatchCore Model B 8766 API로 다시 추론. 원본 SHA-256 및 Model checkpoint 검증. 스테이션 서명/온체인 검사 제출 없음. 보관 S05 정상과 S03 스크래치는 서로 다른 제품이므로 동일 실물의 실제 분쟁이라고 주장 금지.
- 장면 2: Inspector 서명 Replay 불일치가 EXECUTION_HOLD(14)로 분기한다는 PATCH3 Anvil Red-Team 36 PASS/0 FAIL를 검증; 실제 Sepolia 신규 거래의 현재 상태와 구분.
- 장면 3: 현재 Sepolia 정책 Hash를 직접 읽어 의도적 다른 해시와 대조. 실제 변조 제출이 허용되는 상태 AWAIT_SUPPLIER(5)일 때만 live staticCall을 실행해 PolicyHashMismatch 확인. 그렇지 않으면 로컬 Anvil 거절 테스트 근거만 제시.
- 발표 준비 문서: STAGE_3_SCENES_README_KO.md. 검증 원본: STAGE_ASSETS/. 검증 완료 브라우저 화면: PREVIEW_STAGE_A_LIVE_INFERENCE.png, PREVIEW_STAGE_B_REPLAY_PROOF.png, PREVIEW_STAGE_C_POLICY_PROOF.png.
- 본선 시연 화면은 블록체인 TX 0건/가스 0, MetaMask 팝업 없음. 역할별 실거래 도구는 기존 /#roles에 보존.
- 페이지 키 1/2/3 장면 전환, F 전체 화면.
- 정확히 구분: Model B 실시간 추론, 과거 원본의 재추론, 로컬 합성 Red-Team 증명, Sepolia 읽기 전용 정책 조회는 서로 다른 근거 수준.
