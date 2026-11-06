# 최종 배포·GitHub 소스 동기화 확인서

**기준일:** 2026-11-06 · **실증 네트워크:** Ethereum Sepolia (테스트넷)

## 결론

- [최신 웹 게이트웨이·실행 코드](../deploy/cloud-web/)와 [독립 Model B 서버 코드](../deploy/modelb-cloud/)를 실제 Railway 배포에 사용했던 노트북 원본에서 분리·보존했습니다.
- 실제 배포 웹사이트의 `platform.html`, `platform.js`, `roles.js`, `replay.js`, `resolution.js`, `enterprise-tools.css` 6개 공개 자산은 **로컬 소스와 SHA-256 일치**를 확인했습니다.
- `cloud-gateway.cjs`, 핵심 REST 서버 파일과 Dockerfile도 원본 배포 후보에서 복사했습니다. 이 **서버 내부 파일의 배포 컨테이너 해시 비교나 독립 Docker 재빌드까지 검증한 것은 아닙니다.**
- **Node 34개 파일 구문 검사: 34/34 PASS.** **Python 클라우드 서버 2개 파일 컴파일: 2/2 PASS.**
- 패키지 의존성 `npm ci` 재설치 성공; `package-lock.json` 보존.
- 공개 웹 GET 검증 **10/10 PASS** (Health 200, 6메뉴·검사·정산 JS, 실거래 `RELEASED(17)`, 회계 보존).
- Selenium/Playwright 추가 검증: 공개 6메뉴·7역할·Origin 제한 PASS. 과거의 분쟁 중 상태를 전제한 상호 해결 E2E 자동 테스트는 완료된 거래에 대해 실패했으며, 기존 지갑 자동 클릭 테스트는 고정 헤더가 버튼을 가려 실패했습니다. **이 둘은 별도 새 진행 중 fixture로 테스트를 업데이트해야 하는 잔여 항목**입니다.
- 코드 폴더의 실물 너트 원본 JPG, 모델 백업 ZIP, private key, seed, 토큰을 **공개 GitHub 대상에서 제외**했습니다. 시크릿 특징 문자열 검사에서 해당 정규식과 일치하는 값이 없었지만, 모든 유형의 비밀정보 부재를 보증하는 포괄적 감사는 아닙니다.
- 사용 중인 노트북에 Docker CLI가 없어 **깨끗한 환경의 Docker 재빌드 테스트는 실행하지 못했습니다.**
- 기존 Railway 배포는 변경하지 않았으며, 실제 Sepolia 신규 TX도 전송하지 않았습니다.

## 소스 트리

| 위치 | 구성 |
|---|---|
| `deploy/cloud-web/` | 실제 배포된 Node 게이트웨이, 통합 UI, 역할·증거·Replay·정산 API, Dockerfile |
| `deploy/cloud-web/app/.patch3-build/` | 계약의 공개 ABI |
| `deploy/modelb-cloud/` | 실제 FastAPI Model B 클라우드 추론 서버 및 Dockerfile |
| `deploy/modelb-cloud/model/README.md` | 비공개 모델 ZIP SHA-256 및 안전한 확보 절차 |
| `docs/evidence/MODEL_B_CLOUD_PLUS1_20261106.json` | 실제 AI 2회 추론 +1 비교 결과 원본 Report |
| `docs/evidence/MODEL_B_CLOUD_PLUS1_REAL_WEB_SCREENSHOT.png` | 배포된 웹 화면에서 직접 캡처한 Replay 실행 결과 |
| `scripts/final_submission_source_parity.mjs` | 배포된 웹 JS/HTML과 소스 해시 일치·Health 읽기 테스트 |
| `scripts/submission_public_smoke.mjs` | 종료된 온체인 거래를 TX 없이 조회하는 스모크 테스트 |

## 별도 보관 항목과 재현 가능성

**원본 S05 TOP·FRONT·SIDE 사진은 GitHub에 포함되지 않습니다.** AI 모델 재빌드에 필요한 `InspectEscrow_ModelB_BACKUP.zip` (95,478,060 bytes)은 팀에서 관리합니다.

- 모델 ZIP SHA-256: `8102cedf082c0d8553ad03372d6dd125daab895ed56d2cad77c4ac0342b0206d`
- 실행 체크포인트 SHA-256: `8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854`
- GitHub만 단독 복제하면 **UI/계약/추론 서버 소스는 볼 수 있지만, 체크포인트 제공 전 AI 추론 서버를 완전히 구동할 수 없습니다.** 프로토타입 실제 시연은 운영 중인 공개 웹 링크를 이용합니다.
- 모델 서비스는 같은 비밀 `INSPECTESCROW_DEMO_ACCESS_TOKEN`을 사용하지만 값은 코드에 포함되지 않습니다.

## 검증 표현

**이번 실제 Sepolia 12TX:** Supplier PASS → Buyer REVIEW → 분쟁 → **통제된 음성 Replay HOLD** → 서로 다른 두 컴퓨터의 Actor 합의 서명 → Supplier 지급 확정 → Withdraw.

**별도 클라우드 +1 Red-Team:** 동일 원본의 Model B 2회 재추론 결과 `36,185,043`, 변경된 **비서명 주장** `36,185,044`와 비교 → `INCONSISTENT` (TX 0).

**위 두 결과는 별도 시험이며 연결된 자동 on-chain Replay 흐름으로 주장하지 않습니다.**

## 최종 제출 시점 확인사항

- 공개 저장소 최종 Commit/Tag가 운영진 제출 링크의 `main`과 일치하는지 확인
- 실제 브라우저에서 6메뉴·7역할·읽기 전용 검사 흐름 확인
- Model B 서버 및 Railway 서비스 상태 Online 확인
- 첫 번째 정책 수락 TX 해시는 Sepolia 블록 #12071501의 `PolicyAccepted` 원본 로그에서 복구·확인했습니다. 12건의 TX 해시 모두 66자 형식입니다.
- 공개 Demo에서는 역할 전용 MetaMask가 없으면 새 거래 실행을 요구하지 않고, **이미 완료된 거래 기록·스크린샷을 열람**할 수 있도록 안내
