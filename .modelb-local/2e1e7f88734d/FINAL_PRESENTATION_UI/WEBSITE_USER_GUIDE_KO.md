# 통합 웹사이트 사용자 가이드

시작 URL: `http://127.0.0.1:8770/journey`

## Supplier

`새 거래 생성 → 정책 위험 검토 → Supplier MetaMask proposeTrade → 역할별 정책 수락 → 활성화 후 /live 또는 /e2e 검사 → 정산 후 claimable/withdraw 확인`

## Buyer

`/trades 조건·정책 해시 확인 → /#roles 정책 수락·fund → Supplier 결과 확인 → Buyer 검사 → PASS이면 acceptAndRelease, REVIEW이면 Inspector 경로 확인`

## Inspector

`/evidence 양측 bundle 재검증 → /replay 실제 TOP 재추론 → Replay Report → /resolution 별도 Decision → 정산 상태 확인`

Primary timeout 전에는 Backup 행동이 열리지 않으며, Replay INCONSISTENT 이후 `EXECUTION_HOLD`는 자동 지급·환급 상태가 아닙니다. External Arbitrator도 Solidity가 허용한 상태와 deadline에서만 활성화됩니다.

TOP만 업로드하면 AI 미리보기만 완료됩니다. FRONT/SIDE까지 있어야 3-view Evidence Bundle을 만들 수 있으며, 이 상태도 Station 서명·Actor 제출 전에는 오프체인 미제출 증거입니다.

