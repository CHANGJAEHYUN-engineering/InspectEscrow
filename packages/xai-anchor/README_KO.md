# InspectEscrow — XAI 해시 온체인 고정 모듈 (UI 별도 작업)

## 상태 (2026-11-06)
- 독립 컨트랙트: src/InspectEscrowXAIAnchor.sol
- Foundry 단위 테스트: test/InspectEscrowXAIAnchor.t.sol (9개 PASS)
- 오프체인 XAI 보고서 검증 + 온체인 조회/등록 CLI: tools/xai-anchor.cjs
- Sepolia 네트워크와 기존 에스크로 계약의 getTradeTerms ABI prefix 실조회 확인
- 실제 Sepolia 컨트랙트 배포: **성공** (주소 및 TX 아래 참조). 다만 XAI 보고서 해시 자체는 별도 거래로 등록해야 한다.
- **기존 웹 UI, 기존 InspectEscrow 에스크로 코드, 기존 증거 해시와 가스 정산 흐름은 변경하지 않음.**

## 설계
- 컨트랙트 배포 시 기존 Sepolia InspectEscrow 주소(0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905)를 immutable로 지정
- XAI 증거 고정 단위: (tradeId, role[0 supplier / 1 buyer], evidencePackageHash) -> xaiSha256
- XAI의 xaiSha256은 기존 브라우저 XAI sidecar의 localContentSha256. **PNG만의 SHA가 아니며, XAI heatmap Base64, 모델/원본/점수/Evidence Hash가 포함된 JSON payload의 SHA-256임.**
- 등록 권한: 기존 거래의 Supplier actor 또는 Buyer actor (getTradeTerms에서 검증), Inspector·일반 운영자·타인은 불허
- 동일 키 중복·덮어쓰기 불가, 조회/일치 검증은 누구나 가능
- 추가 계약은 Ether 수령·정산·결재·Inspector 권한을 전혀 갖지 않음
- 원본 3뷰·XAI 원본 JSON은 오프체인 보관. 블록체인은 해시·거래 ID·역할·Evidence 해시·기록 주체·시간만 저장
- **본 XAI Anchor는 기존 에스크로 스마트컨트랙트에 제출한 정식 EIP-712 Evidence 구조의 일부가 아님.** 기존 계약을 재배포하거나 수정하지 않음.
- 해시 고정은 등록 뒤 내용 변경 검출이지 실제 촬영 시점·실물 제품 정품 여부·물리적 동일성 보장 아님.
- 별도 Station 서명이 아닌 **거래 당사자 actor의 온체인 트랜잭션 승인이 증거를 고정**. XAI 계산이 정직하게 이뤄졌다는 것 자체를 컨트랙트가 검증하는 것은 아님.

## 실 배포 전 확인
1. 사용자 컴퓨터의 Powershell(암호화된 지갑 비밀번호는 본인 컴퓨터에서만 입력)에서 이 모듈 폴더로 이동
2. 읽기 전용 진단:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-sepolia.ps1
3. 테스트 PASS 및 네트워크 Sepolia(11155111), 기존 에스크로 주소 일치 확인
4. 배포할 계정에 Sepolia **테스트 ETH**가 있는지 확인 후 아래 명령 실행:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy-sepolia.ps1 -Broadcast
5. 결과에 표시되는 컨트랙트 주소/트랜잭션 해시를 Etherscan에서 확인. deployment.sepolia.json 파일이 생성되어야 함.
6. **반드시 배포가 완료된 경우에만** UI 수정 채팅방에 ABI와 주소를 전달해 버튼을 연결.

### XAI sidecar 생성 (기존 웹)
- Supplier/Buyer 3뷰 → 실제 AI 추론 → XAI 추론 → Evidence Bundle 생성 → XAI·Evidence 연결 보고서(.sidecar.json) 다운로드
- 중요한 점: 단순히 새로 생성한 미서명 Evidence에 XAI 해시를 등록해도, 과거 InspectEscrow 에스크로에 기록된 Evidence와 동일하다는 뜻은 아니다.

### read-only 내용 확인
node tools\xai-anchor.cjs inspect --file C:\path\to\report.sidecar.json

### 배포 후 원본과 온체인 조회
node tools\xai-anchor.cjs preflight --file C:\path\to\report.sidecar.json --anchor 0xYourAnchorContract
node tools\xai-anchor.cjs verify --file C:\path\to\report.sidecar.json --anchor 0xYourAnchorContract

### 거래 당사자가 실제 XAI 해시 등록
- 계약에 지정된 Supplier 또는 Buyer **actor** 지갑으로만 등록 가능
- CLI는 로컬 암호화된 Foundry 계정의 비밀번호를 직접 입력해야 하며, 개인키를 메일·채팅·코드에 적으면 안 됨.
- UI가 아직 없으므로 현재는 별도 Ethereum 지갑/Foundry CLI로 실행.
- CLI로 실행하는 경우:
  node tools\xai-anchor.cjs send --file C:\path\to\report.sidecar.json --anchor 0xYourAnchorContract --account YOUR_ACTOR_FOUNDRY_ACCOUNT --broadcast
- Foundry account가 해당 거래의 actor 주소가 아니면 거부되며 수수료가 발생할 수 있음. 트랜잭션을 보내기 전 계정 일치 여부와 가스비를 반드시 확인.

## 주요 공개 ABI (UI 수정방 인계)
- anchor(bytes32 tradeId, uint8 role, bytes32 evidencePackageHash, bytes32 xaiSha256)
- getAnchor(bytes32 tradeId, uint8 role, bytes32 evidencePackageHash) view returns (bytes32 xaiSha256, address attestor, uint64 anchoredAt, uint64 anchoredBlock)
- verify(bytes32 tradeId, uint8 role, bytes32 evidencePackageHash, bytes32 xaiSha256) view returns (bool)
- escrow() view returns (address)
- XAIAnchored(bytes32 indexed tradeId, uint8 indexed role, bytes32 indexed evidencePackageHash, bytes32 xaiSha256, address attestor, uint64 anchoredAt)

## 현재 검증
- forge test -vvv: 9 PASS / 0 FAIL
- node tools\test-sidecar.cjs: 정상 SHA-256 검증 PASS / 점수 변조 검출 PASS
- Sepolia cast chain-id: 11155111 PASS
- 기존 InspectEscrow getTradeTerms(완료된 거래)에서 Supplier/Buyer actor 주소 확인 PASS
- PowerShell deploy-sepolia.ps1 읽기 전용 preflight: PASS / 실제 전송 0건

## [2026-11-06] Sepolia 실제 배포 확정
- 새 XAI Anchor: `0x16391d0f6e4baA35CC835839e98b85437455ba82`
- 배포 TX: `0x0260e6d67446e5550afdf7feaa97ef6513caf6acee84170b37cc33d2f9561ff0`
- Etherscan: https://sepolia.etherscan.io/address/0x16391d0f6e4baA35CC835839e98b85437455ba82
- Receipt `status=1`, block `12077201`, 온체인 런타임 코드 `3653 bytes` 확인.
- 읽기 전용 `escrow()` 조회: `0x0a4721CF41Ad3f7a9EC9C73049D2db73B905` (원 계약 정확히 일치).
- 배포자: `0xaE7B8A9B15534829492F9449a67e83aAbd82E7BE` (검증된 기존 거래 Supplier actor와 일치).
- **XAI 보고서 해시 실제 저장은 아직 0건 확인.** `anchor(...)` 별도 서명·승인·TX 필요.
- 검증된 현황 원본: `deployment.sepolia.json`.
- UI 변경은 별도 채팅방에서만 진행. 코드/ABI/주소는 여기서 인계.

## 2026-11-07 01:21 KST — 첫 실 XAI 해시 등록 확인

Supplier S05 정상 Evidence에 연결한 **XAI Evidence-Derived Anchor Report**의 SHA-256이 실제 Sepolia에 등록되었다.

- 컨트랙트: `0x16391d0f6e4baA35CC835839e98b85437455ba82`
- 등록 TX: `0x23fbae0c5256e01dfc82d698258e5a84aa92421d658dadebf4100b8b731f352f`
- 블록 #12077704 / receipt status 1 / `XAIAnchored` 이벤트 발생
- 거래 ID: `0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff`
- role: `0` (Supplier)
- Evidence Package Hash: `0x2281badc88418b6b78f83a11de0aa4e0a4b51f8b7f0e7004232c08526f1711c1`
- XAI report SHA-256: `0xcf3710f2fa746646770de2236e5947fcd35623178ac7ab91def004d1660cb1bb`
- Supplier actor: `0xaE7B8A9B15534829492F9449a67e83aAbd82E7BE`
- `getAnchor(tradeId,0,evidenceHash)` 반환값 4개가 등록 해시·행위자·타임스탬프·블록번호와 일치
- `verify(...,xaiSha256)` → `true`
- 마지막 1바이트를 변경한 `verify(...,tamperedSha256)` → `false`
- 로컬 사용자 제공 JSON 리포트 `localContentSha256`과 UTF-8 `JSON.stringify(report.payload)`의 SHA-256 일치
- 417,147 gas; 비용 0.000625720505840058 Sepolia ETH (실 트랜잭션 기준)
- 실 증거 파일은 `inspectescrow.modelb-browser-evidence-bundle/1`이며 **미서명/에스크로 정식 미제출**.
- 새 보고서 형식은 `InspectEscrow.XAI.EvidenceDerivedAnchorReport.v1`이다. 기존 `InspectEscrow.XAI.OfflineSidecar.v1`와 **다른 스키마**이므로 **UI 수정방은 이 스키마에 맞게 검증/재해싱 구현**. 기존 CLI `tools/xai-anchor.cjs`는 구형 Sidecar 스키마만 인식하며 새 JSON을 그대로 전달하면 거절됨. 임의로 기존 보고서라고 처리하지 말 것.
- 본 기록은 XAI 보고서에 대한 **별도 온체인 보조 해시 고정**이다. 기존 InspectEscrow 컨트랙트의 EIP-712 Evidence 생성·서명·제출 성공을 의미하지 않는다.

온체인 검증 요약은 `anchor-proof.supplier-S05.sepolia.json`에 보존했고, 큰 히트맵 원본 JSON은 GitHub에 커밋하지 않았다.
