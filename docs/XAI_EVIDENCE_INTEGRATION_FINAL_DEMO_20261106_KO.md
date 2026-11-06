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

## 2026-11-06 실제 Railway 운영 사이트 검증 완료
- 웹 배포 ID: `5dc602b3-622a-4a8f-a25d-db1cdfe2b9cd` · Railway `SUCCESS`.
- 실제 Model B, 보관된 사용자가 직접 촬영한 육각너트 시편 원본을 사용. 모의 AI 응답 없음.
- Supplier 실제 TOP `S05_normal_repeat2.jpg.jpg`: score **36.18498992919922**, `PASS`; TOP·FRONT·SIDE 원본 기반 Evidence 생성, 실제 `anomaly_map` 히트맵 생성, 원본/모델/점수 매칭 및 XAI sidecar JSON 다운로드 PASS.
- Buyer 실제 TOP `S03_deep_scratch1.jpg.jpg`: score **52.57209777832031**, `REVIEW_REQUIRED`; TOP·FRONT·SIDE 원본 기반 Evidence 생성, 실제 `anomaly_map` 히트맵 생성, 4영역 상대 이상도 그래프 PASS.
- 공급사 PASS / 구매사 REVIEW 비교 카드 PASS. Buyer 최초 전환 시 Supplier 업로드 원본을 요구 없이 재사용하지 않음.
- 이미 정산 완료된 기존 Trade ID의 과거 Buyer Evidence와 새 미서명 Buyer Evidence가 다르므로 **strict onchain 검증은 `ONCHAIN_EVIDENCE_HASH_MISMATCH`가 정상**.
- `/api/evidence/verify-offchain`로 새 Evidence 원본/해시/정책 컨텍스트 검증: **HTTP 200 / OFFCHAIN_VERIFIED_ONLY**. 기존 Sepolia 기록을 대체하지 않음.
- 새 Evidence에 대한 XAI sidecar 연결 검증: **PASS** (TOP SHA-256, 모델 체크포인트, 점수, Evidence Package Hash). 히트맵 표시 / 4개 막대 / JSON 다운로드 PASS.
- `/e2e` Station·Actor 화면: 직전 검사 XAI 읽기 전용 표시 PASS, Buyer 이미지 3장 자동 전달 PASS, 뷰 확인 체크박스 미선택, EIP-712 서명·Actor TX 버튼 비활성 PASS.
- **Sepolia 신규 트랜잭션 전송 0건**. 사용된 검사 결과 및 XAI는 미서명 오프체인 PoC 증거다.
- Playwright Chrome 실기 테스트 `test-xai-buyer-evidence-prod.cjs`: `PRODUCTION_EVIDENCE_XAI_ALL_PASS`.
- 모의 UI 변조 테스트: XAI 연결 JSON `scoreScaled` 값을 바꾸면 `SIDECAR_CONTENT_CHANGED`로 거부. 자체 재해싱 가능성 때문에 이는 제3자 서명 인증이 아님.

## 2026-11-06 XAI 히트맵 시각화 보정 (v2)

**문제:** 이전 `patchcore_xai.py`는 각 사진의 위치별 이상도 5~98 백분위를 독립적으로 0~1 정규화했다. 정상 PASS 이미지도 가장 높은 부분이 빨간색으로 칠해지며 배경(검은 매트)까지 붉게 표시됐다. 통합 SPA는 일부 legacy CSS를 의도적으로 제거하므로 사분면 그래프도 세로 텍스트로 나타나는 문제가 있었다.

**수정:**
- 기존 WideResNet50-2 PatchCore 체크포인트·이상 점수·판정 임계값·Evidence 포맷과 온체인 코드는 변경하지 않는다.
- 빨간 오버레이는 **고정된 이상 점수 임계값(38.280373 수준)을 위치별 거리의 시각화 참고 기준**으로 사용한다. 원본 원생 anomaly_map에는 손을 대지 않는다. 이미지마다 최고점이 무조건 빨개지는 백분위 정규화를 제거한다.
- 검은 배경의 이미지 주변부를 제거하기 위해 밝은 금속 너트의 중앙 ROI를 밝기 기반 휴리스틱으로 마스킹한다. **이 마스크는 별도의 학습된 인스턴스 세그멘테이션이 아니며** 너트의 진짜 영역을 보장하지 않는다.
- 시각화 범위와 강도는 `visualNormalization=FIXED_IMAGE_SCORE_REFERENCE_ROI_ONLY_V2`, `visualReferenceRaw`, `visualObjectMaskMethod`, `visualHighlightedPixels`를 응답에 표시해 감사 가능하게 남긴다.
- 정상 PASS는 원생 위치별 거리가 참고 임계값 아래라면 붉은 강조가 전혀 표시되지 않을 수 있다. 이는 모든 위치에 결함이 없다는 증명이 아니다.
- 사분면 그래프는 **너트 시각화 ROI 내 상대 강조 강도의 95백분위 지수**로 변경한다. 0~100 수치는 결함 확률/결함 면적 비율이 아니다.
- 통합 SPA에서 HTML style/link를 제거하는 특성에 맞춰 별도 `xai-dashboard.css`를 shell에 직접 로드해 XAI 히트맵과 4개 막대 그래프를 정상 레이아웃으로 표시한다.
- 이 마스크 방법은 밝은 금속 너트 + 어두운 매트 촬영 환경에 한정한다. 다른 상품·배경·조명에 일반화된 제품 분할 모델로 주장하면 안 된다.

## 시각화 v2 실제 Railway 회귀 시험 (2026-11-06)
- 모델 서비스 배포 `f96a4e10-bfac-4ad7-bc64-662e34af70c5`: SUCCESS. 웹 서비스 배포 `e2e92c60-f2f6-4a7b-824f-75be13417451`: SUCCESS.
- S05 `S05_normal_repeat2.jpg.jpg` 실제 Model B: `PASS` / 점수 `36.18504333496094` / 원생 anomaly map 최대값 `35.588165`. 고정 위치별 표시 기준 `38.280373` 미만 → 빨간 강조 픽셀 0, 배경 강조 픽셀 0. 사분면 지수 0/0/0/0.
- S03 `S03_deep_scratch1.jpg.jpg` 실제 Model B: `REVIEW_REQUIRED` / 점수 `52.57213592529297` / 원생 anomaly map 최대값 `50.038719`. 붉은 강조 픽셀 872, 배경 강조 픽셀 0. 사분면 지수 0/57.5/0/0 (좌상/우상/좌하/우하).
- 실제 통합 Chrome 화면에서 XAI 카드 `display:grid`, 4영역 막대 `display:grid`, 그래프 트랙 높이 13px을 확인함. 따라서 이전 unstyled 텍스트 나열 문제 수정.
- 실제 통합 거래에서 Buyer S03 → AI inference HTTP200 → XAI HTTP200 → Evidence 생성 HTTP200 → `/api/evidence/verify-offchain` HTTP200 → XAI 연결 PASS → sidecar JSON 다운로드 PASS → Station·Actor XAI 읽기 전용 · 자동 서명/트랜잭션 0건 확인. 테스트 결과 `PRODUCTION_EVIDENCE_XAI_ALL_PASS`.
- 기술적 한계: 밝은 금속 제품과 어두운 촬영 매트에 대한 **휴리스틱 ROI 마스킹**이며 의미론적 객체 분할/확률 보정/결함 확정은 아니다. 이미지당 자동 contrast stretching을 없앴지만, 화면의 고정 기준은 픽셀별로 임상적으로/공정적으로 보정된 결함 판정 임계값이 아니다.
