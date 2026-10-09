# PHASE 3B Integration Progress — 2026-10-09

**현재 상태: 연동 구현 + 로컬 E2E 검증 완료. Sepolia DISPUTE 거래 진행 중 — `proposeTrade`와 Supplier `acceptPolicy` 성공, Buyer `acceptPolicy` 대기.**

## Sepolia 실거래 진행 현황 (2026-10-10 KST)

- chainId: `11155111`
- contract: `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9`
- tradeId: `0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c`
- 현재 state: `PROPOSED` (`1`)
- `proposeTrade` 성공 TX: `0xa9116ec4f58803f1985924665e6bfb46a455c2d732c7ec531092c779c40e889c`
- Supplier `acceptPolicy` 성공 TX: `0xad8d3e74de6b5675003854d2d1561780a4d0ec0832ce171017593d74abf8cceb`
- Frozen terms: `docs/TradeTerms.frozen.dispute.json`
- 세부 receipt snapshot: `results/SEPOLIA_LIVE_PROGRESS.json`

아직 Buyer 정책 수락, Inspector 2인 배정 수락, fund, activate는 실행되지 않았다. AI evidence가 전달되기 전에는 `submitInspection`을 호출하지 않는다.

2026-10-09에 Supplier/Buyer/Primary Inspector/Backup Inspector Actor 4개와 Supplier/Buyer/Inspector Station 3개의 공개주소를 수신했다. Ethereum 주소 형식 및 checksum 정규화 PASS, 7개 대소문자 비의존 중복검사 PASS. `PHASE3B_ROLE_ADDRESSES.json` 및 `TradeTerms.template.json`에 반영했다. 개인키·복구 문구는 수집하지 않았다.

## 기준 유지

- frozen Solidity SHA-256: `4effb1ee5a18f4c75ae6eb8eaa1ec051a03da9efb4799beffe8772439cf3e6da`
- Solidity 변경/재설계 없음. 기존 전체 테스트 스위트를 다시 수행했다고 주장하지 않음.
- 공개 거래 대상: Sepolia 11155111, `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9`
- EIP-712 domain: InspectEscrow / 1. Contract version: PHASE2-PATCH2.
- ABI 113 entries 및 동결 artifact ABI의 ordered JSON equality 확인.
- 4종 typed-data 필드를 ABI tuple과 비교. 타입·필드·actor/station 규칙 유지.

## 완료 구현

| 기능 | 결과 |
|---|---|
| EIP-1193 브라우저 지갑 연결 | 구현 |
| MetaMask 사이트별 네트워크 Sepolia 전환 요청 | 구현 |
| 실제 chain/domain/version/runtime/accounting 사전 확인 | 구현, 로컬 EVM 검증 |
| Station 서명·Actor 전송 분리 | 구현 |
| 4종 EIP-712 digest와 온체인 hash 함수 비교 | 구현 및 로컬 검증 |
| 서명 JSON 전달, signer recovery 검증 | 구현 및 로컬 검증 |
| write 함수 21개, 정확한 fund 금액 자동 조회 | 구현 |
| staticCall, gas 추정, 발신자·금액·calldata 미리보기 | 구현 및 로컬 검증 |
| 계정/체인/인자 변경 시 미리보기 무효화 | 구현 |
| receipt status, TX/block hash, raw/decoded events 수집 | 구현 및 로컬 검증 |
| 거래 전후 회계 및 상태 snapshot | 구현 및 로컬 검증 |
| confirmations 이후 JSON export, pending TX journal | 구현 |

## 검증

동결 creation bytecode를 신규 로컬 Anvil chainId 31337에 배포해 integration SDK를 실행했다. 실제 계정 키는 사용하지 않았다.

- **20 PASS / 0 FAIL**, **44개 로컬 거래**.
- 정상 지급 → Supplier withdraw.
- threshold equality REVIEW → Primary dispute → 일치 replay → Inspector 환급 → Buyer withdraw.
- replay 불일치 → EXECUTION_HOLD에서 미정산 escrow 유지 → 양측 mutual resolution → 환급/withdraw.
- Supplier 검사 미제출 timeout → 환급/withdraw.
- 잘못된 Actor 제출 거절, 잘못된 Station 계정 서명 거절, replay 전 정산 거절, 잘못된 chain domain 서명 envelope 거절.
- 최종 totalFunded = totalWithdrawn = 400000000000000 wei, unsettledEscrow = outstandingClaimable = contract balance = 0, accountingConserved = true.
- JS 모듈 구문 검사 PASS. 로컬 서버와 정적 참조 검사 수행.

이 수치는 **로컬 합성 fixture 검증**이다. 제조 AI/calibration/실물 검증에 포함하지 않는다. 브라우저 렌더링 자동 검증을 시도했으나 환경에 Chromium 실행 파일이 없어 수행하지 못했다. 별도로 위 Sepolia TX 2건을 실제 MetaMask 승인 후 공개 RPC receipt와 컨트랙트 상태 조회로 확인했다.

## 자료 간 상태 차이

최신 `BASELINE_FREEZE_REPORT.md`가 ABI handoff 및 과거 Sepolia 배포 증거 감사의 기준이다. 이번에 가져온 이전 PHASE3A ZIP의 deployment.json에는 아직 주소/TX가 null이며 `NOT_BROADCAST_HUMAN_SIGNATURE_REQUIRED` 상태가 남아 있다. 최신 보고서가 인용한 실제 배포 receipt/runtime 원본은 해당 ZIP에 없다.
따라서 이번 구현은 최신 typed-data schema의 고정 주소를 사용하되, **이전 ZIP을 실제 배포 완료 증거로 제시하지 않는다**. 배포/verification을 다시 수행하거나 기록을 덮어쓰지 않았다. 실제 지갑 연결 시 runtime/domain/version을 확인해야 한다.

공개 Sepolia RPC에서 배포 runtime/domain/version 및 live state를 읽고, 위 공개 TX 2건의 status=1 receipt와 InspectEscrow event log를 확인했다. 다만 실제 funded 거래와 AI evidence 결합은 아직 완료되지 않았으므로 PHASE3B 전체 완료를 선언하지 않는다.

## 다음 실행 조건

다음 온체인 순서는 Buyer `acceptPolicy` → Primary/Backup `acceptInspectorAssignment` → Buyer `fund` → `activate`이다. `AWAIT_SUPPLIER` 확인 시 중지하고, Supplier AI evidence package와 EIP-712 StationAttestation payload를 받은 뒤에만 `submitInspection`을 수행한다.
**PHASE3B 전체 완료 선언은 실제 funded 거래의 receipt·상태·회계·AI/evidence 결합 검증 이후에만 가능하다.**
