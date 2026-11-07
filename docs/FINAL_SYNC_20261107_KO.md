# InspectEscrow — 2026-11-07 최종 제출 소스 동기화

## 제출 기준
- GitHub: https://github.com/CHANGJAEHYUN-engineering/InspectEscrow
- 공개 통합 PoC: https://inspectescrow-integrated-web-production.up.railway.app/
- 웹 소스: `deploy/cloud-web/`
- AI 추론 서버 소스: `deploy/modelb-cloud/`
- 계약·테스트: `packages/phase3c_hardening_20261023/`
- 이전 불변 제출물(2026-11-06)은 보존하고, 2026-11-07 소스 스냅샷을 추가한다.

## 이번 동기화 내용
1. 공식 통합 UI의 **에스크로 거래 모드 / 증거·판단 보조 모드**를 모두 보존. 후자는 별도 보조 시나리오이며 실제 에스크로 TX를 의미하지 않음.
2. TOP 이미지에 대한 **실제 PatchCore anomaly_map 기반 XAI 오버레이** 및 영역별 상대 이상도(4분면)를 적용. 이 지수는 불량 확률·물리적 손상 정도가 아님.
3. TOP/FRONT/SIDE 원본 SHA-256, AI 점수, XAI 이미지 SHA-256, 모델·촬영 근거를 Evidence Bundle과 해시 검증에 연결.
4. 한 브라우저 세션에서 **실시간 검사 → Evidence 검증 → Station·Actor 제출**로 넘기는 임시 증거 전달 기능. 파일·역할·거래가 바뀌면 관련 임시 데이터를 무효화.
5. 공개 웹 게이트웨이의 클라우드 Model B 라우팅, Replay·정산·역할 권한 화면 최신본 반영.
6. 기존 정상/이상 거래, HOLD, Backup Inspector, 분리된 Station 서명과 Actor TX, Sepolia 결과 및 검증 기록 유지.

## 검증 결과와 경계
- 변경 JavaScript/CJS 구문: 20/20 PASS (확인 시점 소스)
- Python cloud_app.py / cloud_xai.py 컴파일: PASS
- 합성 XAI Evidence 단위검증: 정합성·변조 탐지·파일 누락·해시 일방 변경·레거시 호환성 PASS
- 공개 사이트 읽기 전용 smoke: 10/10 PASS, Sepolia 기존 RELEASED 거래 조회, 신규 거래 TX 0건
- **새롭게 생성한 XAI Evidence가 현재 Sepolia 거래에 EIP-712 서명·온체인 제출됐다는 뜻이 아님.** 기존 완료 거래에 새 검사를 임의 추가할 수 없음.
- 기존 Sepolia E2E의 PASS/REVIEW/Replay/HOLD/합의정산·Withdraw 증거와 최신 오프체인 XAI 시연을 동일한 거래의 연속 온체인 TX로 혼동하지 않음.
- Inspector의 환급 결정은 양측의 사전 동의에 따른 *에스크로 대금 귀속 결정*이며, 원인·운송 과실에 대한 법원 판결이 아님.
- 현재 PoC는 제품 동일성·운송 중 손상 시점·반품 실물 회수를 암호학적으로 증명하거나 강제하지 않음.
- 직거래/택배거래 확대 및 전문 검토자 연계는 사업화 구상이며, 전체 물류·반품 자동화의 구현 실증을 주장하지 않음.

## 공개 저장소에서 제외한 자료
- 모델 가중치/백업 ZIP, 원본 실물 촬영 사진 및 사적 증거, API 토큰/접근 코드/지갑 개인키.
- AI 컨테이너를 독립 재빌드하려면 문서에 명시된 SHA-256의 모델 백업을 허가받은 경로로 별도 제공받아야 함.
- 비밀정보는 운영환경 변수/지갑에서 관리하며 GitHub에는 업로드하지 않음.

## 읽기 전용 검증
```bash
node scripts/submission_public_smoke.mjs
node deploy/cloud-web/app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/tests-xai-smoke.cjs
```

이 문서는 **새 소스 업데이트와 기존 증거의 경계를 구분하기 위한 최종 인수인계 기록**이다.
