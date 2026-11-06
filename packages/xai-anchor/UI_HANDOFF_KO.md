# UI 수정 채팅방 인수인계 — XAI 해시 Sepolia Anchor

**이 문서만 별도 UI 수정 채팅방에 전달하세요.** 여기서는 웹 화면이나 기존 거래·정산 코드를 수정하지 않았습니다.

## 기능 목적
기존 AI 검사 → XAI 히트맵 → 3뷰 Evidence Bundle → XAI sidecar 보고서까지 완료된 뒤, **추가적인 온체인 XAI 보고서 해시 고정**을 지원합니다. 기존 InspectEscrow 에스크로와 무관한 독립적인 스마트컨트랙트입니다.

## 필수 연결
1. 현재 웹의 InspectEscrowXAI.wrap(xai, bundle) 반환값에서 sidecar.payload의 JSON.stringify UTF-8 SHA-256 == sidecar.localContentSha256인지 다시 확인.
2. sidecar.payload.tradeId, roleName, evidencePackageHash, originalTopSha256, modelCheckpointSha256, scoreScaled 및 xai 결과가 현재 검사 기록과 일치하는지 먼저 확인.
3. 'Sepolia XAI 해시 고정' 버튼: EIP-1193 지갑 연결 후 chainId == 11155111; Supplier role 0, Buyer role 1; getTradeTerms(tradeId)에서 해당 actor가 로그인한 지갑과 일치하는지 검증.
4. 추가 컨트랙트의 anchor(tradeId,role,evidencePackageHash,0x + sidecar.localContentSha256) 호출 시 사용자 지갑 확인. **자동 서명/자동 TX 금지**.
5. 트랜잭션 영수증과 XAIAnchored 이벤트, getAnchor, verify(...) == true 재조회 확인 후에만 'XAI 해시 Sepolia 기록 완료' 표시.
6. etherscan 링크를 거래 내역과 함께 표시. 이전 해시 중복 등록이면 '이미 고정됨'으로 안내. 실패/거부/잘못된 지갑/네트워크는 온체인 완료로 표시하지 않음.
7. XAI JSON 원본을 사용자가 보관하도록 export 기능 유지. 웹 서버에 원본을 영구 저장하거나 블록체인에 Base64 이미지 자체를 올리지 않음.
8. **별도 프레임**: 'XAI 증거 보조 해시 고정' vs '기존 거래 검사 Evidence 정식 온체인 제출'을 명확히 분리한다. 새로운 미서명 Evidence가 Sepolia 기존 증거와 같아졌다고 표시하지 않는다.

## 배포 컨트랙트 주소
- **Sepolia 배포 완료:** `0x16391d0f6e4baA35CC835839e98b85437455ba82` (deployment.sepolia.json 실 체인 조회 확인). 아직 실제 XAI 해시는 미등록.
- 기존 InspectEscrow 원 계약: 0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905
- 해당 contract 소스: packages/xai-anchor/src/InspectEscrowXAIAnchor.sol
- ABI: packages/xai-anchor/out/InspectEscrowXAIAnchor.sol/InspectEscrowXAIAnchor.json (forge build 생성)
- GUI 구현 시 xai sidecar 생성·출력은 기존 검증 완료 소스를 재사용하고 알고리즘·보고서 스키마를 임의로 바꾸지 않는다.

## UI 문구
- 고정 전: 'XAI 보고서 해시는 아직 온체인에 기록되지 않았습니다.'
- 기록 성공 후: 'XAI 보고서 SHA-256을 Sepolia에 고정했습니다. 제출 후 변경 여부를 검증할 수 있습니다.'
- 절대 표현 금지: '정상 제품의 진품을 블록체인으로 증명', '모든 최초 상태를 위변조 불가로 보장', 'XAI가 법적 분쟁을 해결'

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
