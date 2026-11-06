# InspectEscrow — 실제 PatchCore XAI·Evidence 통합 (2026-11-06)

## 본선 사용자 경로
1. `/live`에서 Trade ID를 확인하고 Supplier/Buyer를 각각 선택해 TOP·FRONT·SIDE 3뷰를 업로드한다.
2. `TOP 실제 AI 추론 실행`으로 Model B의 PASS/REVIEW_REQUIRED 및 이상 점수를 확인한다.
3. `실제 AI 근거 보기 · 추가 추론` 버튼에서 **실제 Model B의 `anomaly_map`** 결과를 빨간색 히트맵 및 상대 이상도 사분면 그래프로 확인한다.
4. `TOP·FRONT·SIDE 증거 생성`으로 원본·모델·점수·정책 해시를 가진 기존 **미서명 Evidence Bundle**을 생성한다.
5. 필요하면 `빨간색 XAI 이미지 PNG 저장`, `XAI·Evidence 연결 보고서 저장`, `Evidence JSON 백업 다운로드`를 각각 실행한다.
6. 같은 탭에서 `Evidence 검증`으로 이동하면 원본 3뷰·Bundle JSON·XAI 미서명 참고자료를 자동 연결한다. `원본·해시·Sepolia 재검증` 클릭 시 **기존 Evidence 검증 API** 결과와 XAI 연결 검증을 **따로** 표시한다.
7. 새 탭으로 이동했다면 원본 3뷰·Evidence JSON·`.sidecar.json` 파일을 수동으로 선택한다. XAI 연결 보고서는 현재 검증한 Bundle의 Evidence Package Hash, Specimen Manifest Hash, 원본 TOP SHA-256, 체크포인트 SHA-256, AI 점수와 판정을 교차 확인한다.
8. `Station·Actor` 화면에서는 이전 검사 XAI를 **읽기 전용**으로만 표시한다. 현재 거래에 맞는 Evidence 생성·Station 서명·Actor TX는 기존 수동 절차 그대로다.

## 설계의 중요한 구분
- **원본 검증:** 기존 `/api/evidence/verify`에 의해 서버에서 수행되고, 서명·해시·체인 상태가 실제로 확인됨.
- **XAI 링크 검증:** 브라우저에서 지금 검증한 Evidence와 XAI의 원본 해시·모델 해시·점수·Evidence Package Hash를 비교하는 *보조 검증*.
- **사이드카 SHA-256:** 저장된 JSON 파일이 당시 만든 내용과 일치하는지 확인하는 단순 내용 지문. **서명이나 생성자 인증이 아님**. SHA가 맞더라도 동일한 사람이 값을 조작하여 다시 해시를 만들 수 있음.
- **XAI의 기술적 의미:** 위치별 정상 패치 메모리뱅크 거리 차이(상대 이상도). 빨간색이나 막대 길이는 불량 확률이 아님.
- **온체인 계약 불변:** 기존 Evidence Package의 canonical hash, EIP-712 메시지, Smart Contract 또는 규칙을 변경하지 않았다. XAI는 현재 계약상 서명된 Evidence에 포함되지 않으므로 **법적·온체인 증거로 주장하지 않는다**.
- **보안:** 이미지·XAI는 같은 브라우저 탭 RAM에 한정하여 자동 전달한다. 개인키, 새로운 TX, 합의나 정산은 자동 수행하지 않는다. 원본 파일은 서버에 영구 저장하지 않는다.

## 테스트
- `node --check` (xai-companion/live/evidence/e2e/platform/server.js): PASS.
- Chrome Playwright UI 모의 결과 테스트: Evidence 원본 3장 + Bundle + XAI 자동 연결 PASS; 서버 Evidence 검증 완료 후 XAI 연결 PASS; XAI JSON 다운로드 PASS; 점수 변조한 XAI sidecar 거부 PASS; Station/Actor 읽기 전용 XAI PASS; Station 확인 체크박스·서명·전송 자동 수행 없음 PASS.
- 실제 클라우드 Model B + Sepolia 웹 배포 결과는 **별도 실기 테스트 기록**으로만 완료 표시한다.

## 실제 운영 중 발견한 구분: 신규 미서명 Evidence vs 기존 온체인 기록
- 2026-11-06 실제 Buyer S03 3뷰에서는 AI `REVIEW_REQUIRED` 52.572097..., XAI `anomaly_map`을 재현했다.
- 그러나 이미 완료된 Sepolia 거래 ID에 **이번에 새로 생성한 미서명 Evidence**를 엄격 온체인 일치 검증하면 `ONCHAIN_EVIDENCE_HASH_MISMATCH`가 발생한다. 이는 검증 기능의 정상 차단이다.
- 이를 해결하기 위해 **두 검증을 명시적으로 분리**했다.
  1. `/api/evidence/verify-offchain`: 실제 3뷰 바이트, manifest/evidence keccak256, EIP-712 구조, 모델/정책 컨텍스트 및 기존 체인 거래 조건을 교차검증하되, 이전에 제출된 다른 Evidence 해시와 동일하다고 요구하지 않는다. 결과 `OFFCHAIN_VERIFIED_ONLY`; `REPLAY_INPUT_BLOCKED`.
  2. `/api/evidence/verify`: 기존의 온체인 제출 증거까지 같은 해시인지 확인하는 **엄격 대조**. 다른 과거 증거가 제출돼 있으면 그대로 실패한다.
- 양쪽 모두 읽기 전용이며 전자서명·자금 이체를 수행하지 않는다. 기제출 기록은 교체되지 않는다.
- `onchain.submitted`가 역할의 과거 제출을 뜻할 때 혼동하지 않도록, UI 기록의 `onchainSubmitted`는 **검사한 바로 그 증거의 hash+manifest match**인 경우에만 true로 저장한다.
- 위 경계는 심사위원에게 “신규 사진은 오프체인 증거 검증 완료 / 기존 거래 정산은 과거 실제 TX 별도 검증”이라고 설명한다.
