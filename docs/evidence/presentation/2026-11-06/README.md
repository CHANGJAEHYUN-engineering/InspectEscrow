# 2026-11-06 PPT 16페이지 — 실제 웹 실행 화면 캡처

이 디렉터리의 PNG는 새로 만든 가상 UI가 아니라, **기존 InspectEscrow 웹을 실제 브라우저로 실행한 뒤 화면을 그대로 캡처한 파일**입니다. `PPT_CROP`은 캡처 원본에서 필요한 영역만 자른 버전으로 문자·숫자·결과를 수정하지 않았습니다.

## 시나리오 01 — 실제 분쟁, 정상 Replay, Buyer 환급

**소스:** `packages/phase3b_20261010/index.html` — 기존 Model A/PATCH2 웹 대시보드. 노트북의 로컬 정적 웹 서버로 브라우저에서 실행해 `results/FINAL_SEPOLIA_E2E_20261011.json`을 읽은 실제 화면입니다. Railway에서 운영 중인 최신 Model B/PATCH3 화면이 아닙니다.

- `SCENARIO_01_ModelA_PATCH2_ActualWeb_Timeline_FULL.png`: 8단계 전체 거래 타임라인.
- `SCENARIO_01_ModelA_PATCH2_ActualWeb_Timeline_PPT_CROP.png`: 분쟁 진입 → Primary timeout → Backup Inspector → 실제 Replay `consistent=true` → `REFUND_TO_BUYER` → Buyer 0.005 Sepolia ETH Withdraw.
- `SCENARIO_01_ModelA_PATCH2_ActualWeb_RefundState.png`: `18 · REFUNDED`, Escrow/Withdrawn 0.005 ETH, Accounting `CONSERVED`.

검증 가능한 기존 컨트랙트: `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9`.
TradeId: `0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c`.
[Buyer 환급 판단 TX](https://eth-sepolia.blockscout.com/tx/0x3a94aa420901aa1d061c23e5cf40f669eb8f89e88e760a214aba8fa62be48674) / [Buyer Withdraw TX](https://eth-sepolia.blockscout.com/tx/0x5183318aafe01643879771af8d66820dc3e2bfeb206ec9881323d7735c168bd2).

## 시나리오 02 — 실제 Model B 재추론과 비서명 +1 조작 탐지

**소스:** 현재 Railway에 배포 중인 `https://inspectescrow-integrated-web-production.up.railway.app/replay`의 실제 웹사이트 테스트 화면. `S05_normal_repeat2.jpg.jpg` 원본 TOP을 동일 모델에 두 번 입력했습니다.

- `SCENARIO_02_ModelB_ActualCloudReplay_FULL.png`: 원본 TOP 너트 사진·실행 버튼·증거 해시·점수까지 실제 웹의 전체 해당 섹션.
- `SCENARIO_02_ModelB_ActualCloudReplay_PPT_CROP.png`: 정상 추론 **36,185,043**, 비서명 주장점수 **36,185,044(+1)**, 실제 Replay **36,185,043** → `INCONSISTENT`. 허용오차 0.

**주의:** 시나리오 2에서 조작한 것은 실제 서명된 on-chain Evidence가 아니라 **unsigned 비교 점수**입니다. 이번 웹 시연은 Sepolia 트랜잭션 0건이고, 과거 별도 테스트의 `EXECUTION_HOLD`가 이 실행 때문에 자동 생성된 것은 아닙니다.

## PPT 16페이지 교체 권장 문구

- Scenario 01: **“Model A/PATCH2 · Sepolia — Buyer REVIEW → Backup Replay CONSISTENT → Inspector Buyer 환급 → Withdraw”**
- Scenario 02: **“Model B · 실제 클라우드 재추론 — 비서명 점수 +1 조작 검출: 36,185,044 ≠ 36,185,043 → INCONSISTENT (온체인 TX 0)”**

**두 결과는 서로 다른 실험이므로 하나의 연속 거래로 연결해서 보여주면 안 됩니다.**
