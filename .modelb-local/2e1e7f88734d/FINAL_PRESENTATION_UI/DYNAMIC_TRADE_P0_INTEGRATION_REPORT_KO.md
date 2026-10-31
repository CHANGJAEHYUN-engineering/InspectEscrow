# InspectEscrow P0 동적 Trade ID 통합 결과

검증 시각: 2026-10-31 KST  
실제 Sepolia 서명/TX: **0건**  
핵심 판정: **LOCAL_ANVIL VERIFIED / SEPOLIA READ-ONLY**

## 1. 해결한 P0

`/new-trade`가 생성한 Trade ID가 더 이상 고정 Candidate로 치환되지 않는다. 선택 Trade ID는 다음 경로에서 URL과 브라우저 편의 컨텍스트로 전달되며, 각 화면/API는 이를 권한 증거로 신뢰하지 않고 구성된 PATCH3 컨트랙트에서 다시 읽는다.

`/new-trade → /trades → /#roles → /e2e → /evidence → /replay → /resolution`

온체인 재조회 범위는 Actor/Station 역할, Policy/Model/Capture/Product/View/Score commitments, escrow, state, deadline, Supplier/Buyer inspection, Replay, Settlement, claimable 및 전역 회계 불변식이다. 누락·형식 오류·미존재 Trade ID는 오류로 차단하며 기존 Candidate로 조용히 대체하지 않는다.

## 2. 고정 Trade ID 전수조사 분류

| 분류 | 처리 |
|---|---|
| 실제 실행 경로 | 동적 Trade ID와 온체인 TradeTerms 기준으로 변경 |
| 읽기 전용 과거 거래 | S05 완료 거래와 REVIEW Candidate 기록을 명시적 선택지로 보존 |
| 테스트 fixture | 재현성을 위해 고정값 유지 |
| 정적 설명/발표 자료 | 기존 검증 기록으로 유지 |
| legacy Candidate 전용 준비 화면 | 기존 거버넌스 상태를 보존하고 동적 신규 거래 경로와 분리 |

기계 판독 감사 결과: `DYNAMIC_TRADE_HARDCODE_AUDIT.json`

## 3. 구현 구조

- `dynamic-trade-context.cjs`: 단일 동적 컨텍스트 계층. 선택 Trade의 실제 계약 데이터를 읽고 엄격히 검증한다.
- `server.cjs`: 포트, chain ID, RPC, PATCH3 주소를 환경별로 주입한다.
- Role/E2E/Live/Evidence/Replay/Resolution endpoint: 요청 Trade ID의 실제 계약 domain/terms/state를 사용한다.
- `/new-trade`: 구성 네트워크에서 policy hash, credential, `staticCall`, gas를 준비한다. 정책 위험 승인과 실제 지갑 TX 승인을 분리한다.
- 화면 간 이동: 모든 다음 단계 링크에 `tradeId`를 전달하며 새로고침 후 선택을 복구한다.
- 네트워크 안전 표기: Local Anvil과 Sepolia를 화면에 동적으로 표시하고 다른 chain의 지갑 제출을 차단한다.

## 4. 로컬 신규 거래 E2E

출처: `LOCAL_ANVIL`, chain ID 31339, PATCH3 `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`

- Trade A: `0x435028b61076135ff7dc9ca3977cc6c1c9c372061bc804c89078c09678a8cc6d`
- Trade B: `0xc318eb1b7515bffd7fe6e5c847f8dbfe03d05ae166c634a60b6c15f1880447b4`
- 검사: **15/15 PASS**
- 실제 로컬 영수증: **18 TX**
- Trade A: PROPOSED → 정책 수락 → 3 Inspector 배정 수락 → funding → activation → Supplier PASS → Buyer PASS → RELEASED(17) → Supplier withdraw
- Trade B: 독립적으로 PROPOSED(1) 유지
- 최종 회계: `accountingConserved=true`, `balanceCoversLiabilities=true`, outstanding claimable 0, unsettled escrow 0
- 증거: `DYNAMIC_TRADE_E2E_RESULTS.json`

테스트는 Local Anvil 합성 증거를 사용한다. 이를 실제 물리 AI 증거나 Sepolia 성공으로 표현하지 않는다.

## 5. 공격·권한 검증

- Supplier Station EIP-712 digest와 컨트랙트 digest 일치
- Buyer Station EIP-712 digest와 컨트랙트 digest 일치
- 잘못된 Actor 제출 차단
- Trade A 서명을 Trade B에 재사용하는 공격 차단
- 중복 withdraw 차단
- 누락 Trade ID Candidate fallback 차단
- 두 거래의 정책·상태·결과 격리
- PATCH3 기존 Red-Team **36/36 PASS** (`STAGE_ASSETS/PATCH3_RED_TEAM_RESULTS.json`)

## 6. 브라우저 실사용 검증

실제 브라우저에서 Local Anvil UI를 조작했다.

1. `/trades?tradeId=<Trade B>`: Trade B, PROPOSED(1), 고유 policy hash 및 역할 표시
2. `Supplier 정책 수락` 링크: `/?tradeId=<Trade B>#roles`로 이동, 현재 상태에서 Supplier/Buyer acceptPolicy만 READY
3. `/e2e?tradeId=<Trade B>`: activation 전 inspection 제출 차단
4. `/resolution?tradeId=<Trade B>`: 현재 상태에서 불가능한 정산 행동 차단, 회계 불변식 표시
5. 새로고침: 동일 Trade B와 상태 복구, 재조회 완료
6. `/new-trade`: 새 Trade ID 생성, 정책 hash 생성, 5/5 Station ACTIVE, `proposeTrade.staticCall` PASS, 정책 위험 승인 후 `READY_FOR_SEPARATE_METAMASK_APPROVAL`

사용자 지갑을 대신하지 않았고 MetaMask 연결·서명·TX 버튼은 누르지 않았다. 브라우저 TX 제출 자체는 사용자 승인 전 미실행이며, 동일 계약 동작은 격리된 Local Anvil 자동 E2E 영수증으로 검증했다.

## 7. 회귀 결과

| 검증 | 결과 | 출처 |
|---|---:|---|
| Dynamic Trade E2E | 15/15 | LOCAL_ANVIL, 18 TX |
| 기존 Model B E2E | 16/16 | LOCAL_ANVIL, 70 TX |
| PATCH3 Red-Team | 36/36 | LOCAL_ANVIL |
| Trade Builder | 16/16 | UNIT/API, TX 0 |
| Trade Workspace | 14/14 | UNIT/API |
| Evidence Import | 21/21 | UNIT/API |
| Inspector Replay | 20/20 | LOCAL/API |
| Resolution | 23/23 | LOCAL/API |
| Live Evidence | 20/20 | 실제 보관 S03 입력, TX 0 |
| Role UI gates | 전체 시나리오 PASS | BROWSER-MOCK/UNIT |

재현 명령:

```powershell
cd ".modelb-local\2e1e7f88734d\FINAL_PRESENTATION_UI"
node test-dynamic-trade-e2e.mjs
node test-trade-builder.cjs
node test-trade-workspace.cjs
node test-role-ui-gates.cjs
node test-evidence-import.cjs
node test-inspector-replay.cjs
node test-resolution.cjs
node test-live-evidence.cjs
node test-e2e-typeddata.cjs
```

대형 AI/Fork 전체 재실행 전 C: 여유 공간 10 GiB 이상이 필요하다. 최종 확인 시 C: 여유 공간은 약 3.50 GiB였으므로 이번 마무리에서는 새 대형 Fork를 시작하지 않았다.

## 8. 변경 파일

핵심 신규 파일:

- `dynamic-trade-context.cjs`
- `test-dynamic-trade-e2e.mjs`
- `DYNAMIC_TRADE_E2E_RESULTS.json`
- `DYNAMIC_TRADE_HARDCODE_AUDIT.json`
- `DYNAMIC_TRADE_P0_INTEGRATION_REPORT_KO.md`

핵심 수정 파일:

- `server.cjs`
- `trade-builder-endpoints.cjs`, `new-trade.js`, `new-trade.html`
- `role-action-endpoints.cjs`, `roles.js`
- `trade-workspace-endpoints.cjs`, `trades.js`, `trades.html`
- `e2e-endpoints.cjs`, `e2e.js`, `e2e.html`
- `live-evidence-endpoints.cjs`, `live.js`
- `evidence-import-endpoints.cjs`
- `replay-endpoints.cjs`
- `resolution-endpoints.cjs`, `resolution.js`
- `journey.js`
- 관련 기존 단위/회귀 테스트 fixture

## 9. 남은 P0/P1 및 다음 녹화 모드

- **P0 사용자 행동 필요:** 실제 Sepolia 신규 거래는 정책 소유자의 위험 승인과 Supplier MetaMask `proposeTrade` 개별 승인이 필요하다.
- **P0 사용자 행동 필요:** 이후 정책 수락, Inspector 수락, funding, activation, Station 서명, Actor 제출, settlement, withdraw는 각 단계별로 별도 사용자 승인이 필요하다.
- **P1:** Local Anvil에서 역할별 MetaMask 프로필을 실제로 연결해 버튼을 누르는 녹화 리허설은 아직 사용자 지갑 승인 없이 수행하지 않았다.
- **P1:** C: 여유 공간을 10 GiB 이상 확보한 후 Sepolia fork와 전체 AI 회귀를 한 번 더 실행한다.

다음 녹화 모드는 환경 배지, 격리된 chain/contract, deterministic 테스트 Actor/Station, 시나리오별 Trade ID, 초기화 스크립트 및 영수증 패널을 사용해야 한다. Local Anvil 기록은 항상 `LOCAL ANVIL RECORDING · NOT SEPOLIA`로 표시한다.

## 10. 보존 확인

- 기존 S05/Model A 기록, 정책, 증거, 배포 manifest를 변경하지 않았다.
- Git dirty/untracked 파일을 삭제하거나 초기화하지 않았다.
- 개인키·시드 문구를 읽거나 저장하지 않았다.
- 기존 Candidate 거버넌스를 승인 상태로 변경하지 않았다.
- 실제 Sepolia TX 및 테스트 ETH 지출은 0건이다.
