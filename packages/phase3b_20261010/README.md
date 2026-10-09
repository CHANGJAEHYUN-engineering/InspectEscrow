# InspectEscrow PHASE3B Integration

실행: 이 폴더에서 `python serve.py` → <http://localhost:8787>

자세한 절차: `docs/README_KO.md`

완료: 브라우저 지갑 연동 코드, 동결 ABI·EIP-712 타입 사용, runtime/domain preflight, 거래 미리보기·서명·receipt 증거 수집, 로컬 합성 E2E, Sepolia `proposeTrade`, Supplier `acceptPolicy`.

현재 Sepolia 상태: trade `0xe021…c94c` = `PROPOSED`; Supplier 정책 수락 완료. 다음 단계는 Buyer `acceptPolicy`입니다. 상세 TX 증거는 `results/SEPOLIA_LIVE_PROGRESS.json`을 참조하세요.

미완료: Buyer 정책 수락, Inspector 배정 수락, fund, activate 이후 실제 제조 AI/evidence/replay 결합 및 실물 검사 검증.

실제 거래 입력 양식: `docs/TradeTerms.template.json`, `docs/PHASE3B_INPUTS_TO_FREEZE.json`

이번 DISPUTE 실행의 확정 입력: `docs/TradeTerms.frozen.dispute.json`

`src/integration.mjs`에는 일부 Sepolia RPC가 새 trade의 `TradeNotFound` custom-error returndata를 제거하는 경우에도 안전하게 `NONE` snapshot으로 처리하는 호환 패치가 포함되어 있습니다. 컨트랙트 소스와 Frozen terms는 변경하지 않았습니다.

`test/`의 모든 샘플은 LOCAL_SYNTHETIC_ONLY이며 실제 calibration/제조 정책으로 사용할 수 없습니다.
