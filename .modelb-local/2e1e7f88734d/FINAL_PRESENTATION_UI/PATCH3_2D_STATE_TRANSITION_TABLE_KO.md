# PATCH3 2D 상태 전이표

기준: `InspectEscrowPatch3.sol`과 배포 ABI. 프런트엔드는 아래 전이 외 성공 상태를 만들지 않는다.

| 현재 상태 | 조건/호출자 | 함수 | 다음 상태 또는 결과 |
|---|---|---|---|
| `AWAIT_SUPPLIER` | deadline 경과, 누구나 | `invokeSupplierInspectionTimeout` | `REFUNDED`, Buyer claimable |
| `SUPPLIER_HOLD` | Supplier, retry 남음 | `requestSupplierReinspection` | `SUPPLIER_REINSPECTION` |
| `SUPPLIER_HOLD` | Supplier | `abandonSupplierHold` | `REFUNDED`, Buyer claimable |
| `SUPPLIER_HOLD` | deadline 경과, 누구나 | `invokeSupplierHoldTimeout` | `REFUNDED`, Buyer claimable |
| `SUPPLIER_REINSPECTION` | deadline 경과 | `invokeReinspectionTimeout` | `REFUNDED`, Buyer claimable |
| `AWAIT_BUYER` | deadline 경과, Buyer 미제출 | `invokeBuyerInspectionTimeout` | `BUYER_INSPECTION_TIMEOUT` |
| `BUYER_REINSPECTION` | deadline 경과 | `invokeReinspectionTimeout` | `EVIDENCE_HOLD` |
| `ACCEPTANCE_PENDING` | Buyer PASS, Buyer | `acceptAndRelease` | `RELEASED`, Supplier claimable |
| `ACCEPTANCE_PENDING` | Buyer PASS, deadline 경과 | `invokeAcceptanceTimeout` | `RELEASED`, Supplier claimable |
| `DISPUTED_PRIMARY` | Primary Actor + Primary Station, deadline 내, Replay NONE | `recordReplayResult(CONSISTENT)` | 상태 유지, Replay CONSISTENT |
| `DISPUTED_PRIMARY` | 동일 조건 | `recordReplayResult(INCONSISTENT)` | `EXECUTION_HOLD` |
| `DISPUTED_PRIMARY` | Replay CONSISTENT, Primary Actor + Station | `submitInspectorDecision` | `RELEASED` 또는 `REFUNDED` |
| `DISPUTED_PRIMARY` | deadline 경과 | `activateBackupInspector` | `DISPUTED_BACKUP`, Replay 초기화 |
| `DISPUTED_BACKUP` | Backup Actor + Backup Station | Replay/Decision 동일 규칙 | 정산 또는 `EXECUTION_HOLD` |
| `DISPUTED_BACKUP` | deadline 경과 | `escalateAfterBackupTimeout` | `ESCALATED` |
| `EXECUTION_HOLD`, `EVIDENCE_HOLD`, `ESCALATED`, `BUYER_INSPECTION_TIMEOUT` | deadline 내, Supplier+Buyer 동일 서명 | `mutualResolve` | `RELEASED` 또는 `REFUNDED` |
| 위 보호 상태 | mutual deadline 경과 | `escalateToExternalArbitration` | `ARBITRATION_PENDING` |
| `ARBITRATION_PENDING` | External Arbitrator Actor + Station, deadline 내 | `submitArbitrationDecision` | `RELEASED` 또는 `REFUNDED` |
| `ARBITRATION_PENDING` | deadline 경과 | `executeFinalFallback` | 정책에 고정된 release/refund |
| `RELEASED`/`REFUNDED` | 해당 수령자 claimable > 0 | `withdraw` | claimable 0, 실제 ETH 전송 |

## 회계 의미

- `_settle`은 즉시 외부 지갑으로 송금하지 않고 수령자의 `claimable`을 증가시킨다.
- `withdraw`가 성공해야 실제 지갑으로 ETH가 이동한다.
- 보존식: `totalFunded == unsettledEscrow + outstandingClaimable + totalWithdrawn`.
- `balanceCoversLiabilities`는 컨트랙트 잔액이 `unsettledEscrow + outstandingClaimable` 이상인지 검증한다.
- Replay `CONSISTENT`는 자동 지급/환급 결정이 아니다. `submitInspectorDecision`에는 별도 decision, reasonCode, decisionEvidenceHash가 필요하다.
- Replay `INCONSISTENT`는 자동 환급이 아니다. `EXECUTION_HOLD` 이후 상호 해결/중재/fallback만 허용된다.
