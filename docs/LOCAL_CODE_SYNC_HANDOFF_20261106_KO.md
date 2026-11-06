# Codex/개발 PC용 최종 제출 소스 동기화 작업 지시서
_2026-11-06 · 최신 Railway 웹 코드 → 공개 GitHub 코드 일치_

## 역할과 목표

**목표:** 이미 정상 운영 중인 InspectEscrow의 최신 Railway 통합 웹과 별도 Model B AI 서버 코드를 GitHub `CHANGJAEHYUN-engineering/InspectEscrow`의 **최종 제출 가능한 재현형 소스**로 정리한다. 단순 README 갱신이 아니라 **실행 코드·Docker 구성·의존성·테스트·UI 문구·보안·버전 대응**까지 맞춘다. 이미 배포된 웹 프로토타입은 이 단계에서 변경·중지하지 않는다.

## 기준 주소와 경로

- 프로토타입: https://inspectescrow-integrated-web-production.up.railway.app/
- 공개 저장소: https://github.com/CHANGJAEHYUN-engineering/InspectEscrow
- 로컬 최신 웹 후보: `C:\Users\USER\Documents\InspectEscrow_INTEGRATED_CLOUD_CANDIDATE_20261106`
- 최신 웹: Railway 배포 `ed39d2d2-0e87-4d2f-9f7e-1e88c0bdc380`
- 별도 Model B 추론 서비스: Railway 배포 `9b2f3d1f-f880-4408-9124-53a7d6684a1c`
- 제출 거래 ID: `0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff`

## 엄격한 작업 순서

1. **현재 폴더 확인:** 위 최신 클라우드 후보 폴더, 원본 `cloud-gateway.cjs`, `Dockerfile`, `app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/`가 존재하는지 먼저 검증하라. 폴더/원본을 찾지 못하면 추측으로 생성하지 말고 중단하고 미해결로 보고하라.
2. **별도 배포 소스 보존:** 현재 Railway 배포와 원본 소스를 백업한 후 GitHub 최신 `main`을 fetch. 새 `release/2026-11-06-final-submission` 브랜치에서만 병합하라.
3. **웹 코드 동기화:** 최신 Cloud 후보를 저장소의 `deploy/cloud-web/`에 재현 가능한 형태로 반영하라. `cloud-gateway.cjs`, `Dockerfile`, `.dockerignore`, Node 의존성, 실제 실행에 필요한 `app` 소스, `platform.*`, `roles.js`, `replay.*`, `resolution.*`, E2E 및 REST 서버를 빠뜨리지 말 것. 단, 개발자 로컬 아티팩트·사진·증거 JSON·로그는 최소화하라.
4. **Model B 별도 서버:** Railway에 실제 배포한 클라우드 Model B 어댑터 및 추론 서버의 정확한 소스 위치를 확인하여 `deploy/modelb-cloud/` 또는 동등한 경로에 반영하라. 모델 체크포인트는 SHA-256 `8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854`로 고정하되, 라이선스·용량 확인 전에는 가중치 파일과 실물 사진을 Git에 추가하지 마라.
5. **정적·보안 스캔:** 업로드할 모든 파일에서 `node_modules`, `.env`, API 비밀 토큰, 메타마스크 개인키·시드, 민감 서명, 로컬 절대 경로, 불필요한 중간 출력, 테스트 지갑 파일과 고객 사진을 제거하라. Node 소스에 테스트용 공개 주소는 허용하지만, 운영자가 실행할 때는 환경변수로 역할을 설정하도록 분리하라.
6. **실행·회귀 테스트:** 브라우저로 6개 메뉴와 7역할, Sepolia 연결, 거래 읽기 전용 조회, Supplier/Buyer 검사, Evidence JSON 저장, Station/Actor 구분, 원격 PC EIP-712 상호 합의, 출금 증빙, Replay +1 시연을 검증하라. 실제 온체인 새 트랜잭션을 생성하지 말고 읽기·mock/시뮬레이션만 수행하라.
7. **검증 범위 보존:** `+1` 시험의 조작 점수는 **비서명 비교용 점수**, AI 실제 실행 2회, TX 0이다. 신규 Sepolia 거래의 HOLD는 **통제된 음성 시험**, 이후 양측 서명·정산·출금은 실제 TX다. 문구를 과장하지 마라.
8. **용어 최신화:** `PASS/REVIEW_REQUIRED`, `CONSISTENT/INCONSISTENT/UNVERIFIABLE`, `EXECUTION_HOLD`, `Station/Actor`, `claimable/withdraw`를 [검증·용어 표준](FINAL_RELEASE_PARITY_20261106_KO.md)에 맞춰 모든 UI·README·로그·오류 문구에서 통일하라. 레거시 `FINAL WEB V2`·`INITIALIZED_TEST_WALLET_ONLY`가 최신 웹의 최종 제품 상태인 것처럼 보이지 않게 수정하라.
9. **버전 검증:** `node scripts/final_submission_source_parity.mjs`를 실행해 GitHub 소스와 공개된 `/platform.js`, `/roles.js`, `/replay.js`, `/resolution.js` 등 동일 바이트 해시를 비교하라. 백엔드 소스 역시 Docker 재빌드와 스모크 테스트로 별도 검증할 것.
10. **소스·설명서 일치:** README의 코드 불일치 경고를 삭제하는 대신 **소스 동기화 PASS 증거를 남긴 뒤** 완료 상태로 업데이트하라. 신규 커밋 SHA, Railway 배포 ID, 기동 명령, 필수 환경변수 **이름**, 종속 서비스, 설치·재현 한계를 작성하라.
11. **제출 마무리:** 검증 결과·검토할 diff를 보여준 후 GitHub `main`에 안전하게 병합하고 제출용 태그를 생성하라. **사용자의 명시적 승인 없이는 새 Sepolia TX·Railway 재배포·자금 이동·역할 권한 변경을 실행하지 마라.**

## 최종 완료 보고 형식

아래 기준을 충족한 뒤에만 ‘운영진 코드 제출 준비 완료’로 판정하라.

- GitHub URL 및 최종 commit SHA / tag
- 최신 웹 원본 소스 경로, 필수 Docker/Node 파일 수, 보안 스캔 결과
- 6메뉴·7역할·원격 상호 해결·Replay +1 및 증거 저장의 회귀 테스트 결과
- 공개 웹 JS와 커밋된 JS SHA-256 일치 검사
- Model B 별도 AI 서버 실행 재현 절차와 가중치 획득 방안
- 개인정보/키/토큰 누출 여부
- 현재 잔여 이슈와 제출 적합/부적합 판정

**실패 시** 지난 버전으로 최신 Cloud를 덮어쓰거나 기동 중 서비스를 지우지 마라. 완료되지 않은 항목은 있는 그대로 미완료라고 기재하라.
