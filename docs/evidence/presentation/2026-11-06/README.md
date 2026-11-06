# 2026-11-06 — 실제 최종 Railway 통합 웹사이트 캡처

**중요:** 이 폴더의 발표용 캡처는 모두 아래 동일 도메인의 실제 배포 화면을 Chromium으로 열어 얻은 것입니다. 과거 PATCH2 단독 사이트 화면이나 웹 섹션만 따로 캡처한 사진을 **현재 최종 통합 웹 화면**으로 표시하지 않습니다.

**실제 프로토타입 URL:** https://inspectescrow-integrated-web-production.up.railway.app/

## 현재 최종 통합 웹사이트 화면 ① — 최신 Sepolia 거래 종료

`CURRENT_RAILWAY_INTEGRATED_WEB/SCENARIO_01_CURRENT_FINAL_WEB_RELEASED_DASHBOARD.png`

- 직접 연 페이지: `https://inspectescrow-integrated-web-production.up.railway.app/?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff`
- 실제 화면 요소: **InspectEscrow 좌측 6메뉴 / 상단 Sepolia(11155111) / 거래 RELEASED / 테스트 예치 0.001 ETH / Supplier PASS / 회계 불변식 PASS / 거래 진행률 8/8**
- 이 거래의 별도 실제 TX 증거: 통제된 Replay 불일치→HOLD 기록, Supplier·Buyer EIP-712 양자 합의 `RELEASE_TO_SUPPLIER`, Supplier **0.001 ETH** 출금
- [Supplier 출금 영수증](https://sepolia.etherscan.io/tx/0x1b8956a1394f389a0644c3c5d53ed0bd166daf92943257ee3c256555c9bc98b1)

**정확한 슬라이드 문구:** “SCENARIO 01 · 최신 Sepolia 거래 E2E — Supplier PASS · Buyer REVIEW → 통제 HOLD → 양측 합의 → Supplier 정산·Withdraw”. 화면에 표시된 `RELEASED`와 8/8은 실제 조회 결과이며, 나머지 중간 단계 및 Withdraw는 별도 온체인 TX 영수증으로 검증합니다.

## 현재 최종 통합 웹사이트 화면 ② — Model B 점수 +1 조작 탐지

`CURRENT_RAILWAY_INTEGRATED_WEB/SCENARIO_02_CURRENT_FINAL_WEB_MODEL_B_PLUS1_INCONSISTENT.png`

- 직접 연 페이지: `https://inspectescrow-integrated-web-production.up.railway.app/replay?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff`
- 실제 원본 S05 TOP 이미지를 첨부하고 **클라우드 Model B를 두 차례 실제 추론한 뒤** 브라우저 화면을 캡처했습니다. 화면에는 최종 통합 UI 좌측 메뉴, 입력 사진, 결과 점수, `INCONSISTENT`가 함께 표시됩니다.
- 정상 추론 scaled 점수: **36,185,043**
- 비서명 비교용 조작 점수: **36,185,044 (+1)**
- 실제 AI Replay scaled 점수: **36,185,043**
- 허용오차 0, `INCONSISTENT`, 신규 온체인 TX **0**
- 세부 실행 증거: `CURRENT_RAILWAY_INTEGRATED_WEB/CURRENT_FINAL_WEB_EXECUTION_VERIFICATION.json`

**정확한 슬라이드 문구:** “SCENARIO 02 · 실제 Model B 재추론 / unsigned 점수 +1 탐지 — 36,185,044 ≠ 36,185,043 → INCONSISTENT (오프체인)”.

## 구버전 화면이 혼동되지 않도록 분리했습니다

과거 업로드 사진은 더 이상 이 발표용 폴더에 두지 않았습니다. 모두 `docs/evidence/archive/legacy_patch2_and_partial_screenshots/`로 이동했습니다.

- Model A/PATCH2 Sepolia의 **Buyer 환급** 경로는 실제 완료된 역사적 실증이지만 **최신 Railway 통합 웹 거래 상태는 아닙니다**.
- 이전 Model B **부분 UI 캡처**도 실제 결과 자체는 맞지만 최종 통합 웹사이트 전체 화면을 보여주지 않아 구분했습니다.

## 웹 UI에서 확인한 잔여 표시 이슈

- `/audit` 화면은 Supplier/Buyer Evidence 상태를 보여 주지만 “온체인 감사 타임라인 0건”으로 표시되었습니다. 이는 실제 12TX가 0건이었다는 뜻이 아니므로, 제출용 TX 증명에는 공개 Etherscan receipt/검증 인덱스를 사용하세요.
- `/resolution` 요약 패널의 “출금 대기” 표시는 신규 거래의 이미 성공한 Withdrawal receipt와 일치하지 않았습니다. **출금 완료 여부는 온체인 TX receipt와 `claimable`을 기준으로 검증**해야 하며, 화면 오표시는 후속 수정 항목입니다.
- 다른 거래의 PATCH2 `Replay CONSISTENT → Buyer 환급`을 최신 PATCH3 `EXECUTION_HOLD → 양측 합의 → Supplier 지급`과 연결한 하나의 시나리오로 표현하지 않습니다.
