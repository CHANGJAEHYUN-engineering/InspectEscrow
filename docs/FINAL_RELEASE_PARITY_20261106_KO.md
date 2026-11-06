# 최종 제출 전 코드·배포 일치성 점검 및 보완 목록
_2026-11-06 · InspectEscrow · 운영진 제출용 내부 QA_

## 현재 결론

**웹 서비스는 동작하지만, GitHub 소스는 최신 클라우드 배포본과 동기화되지 않았습니다. 따라서 현재 상태를 ‘코드까지 제출 완료’라고 판정할 수 없습니다.**

| 대상 | 현재 확인 상태 | 후속 조치 |
|---|---|---|
| 통합 웹 도메인 | Railway 서비스 Online, 배포 SUCCESS | 브라우저 기능 회귀 검증 |
| Model B API | Railway 별도 추론 서버 Online, 배포 SUCCESS | 외부 사용자 실제 업로드·추론 확인 |
| 웹 배포 코드 | Railway 배포 `ed39d2d2-0e87-4d2f-9f7e-1e88c0bdc380` | 배포 때 사용한 소스 스냅샷을 커밋 |
| GitHub `main` 코드 | 마지막 기준 커밋 `1d8c41c1b5315a071c32b12139c6993128a9f432` (2026-10-31) | 최신 클라우드 소스 병합 필요 |
| 최신 12TX | 실제 Sepolia 실행 및 공개 TX 인덱스 기록 | 첫 번째 TX 해시 원본과 비교 |
| Model B +1 | 원본 TOP 2회 실제 추론 INCONSISTENT | 실제 웹 캡처·Report 원본 안전하게 보존 |
| 원본 Evidence 보관 | 이번 신규 거래에서 Supplier·Buyer JSON 미저장 | 자동 저장·내보내기 강화 후 회귀 테스트 |
| UI 용어·문구 | 최신 코드 전체 정적 감사 미완료 | 아래 용어·상태·버튼을 통일 |

## 소스 동기화 — 최우선 P0

현 GitHub에는 과거 `.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/` 코드가 있으나, 최신 통합 화면의 다음 모듈이 동일한 버전으로 반영되지 않았습니다.

- 클라우드 웹 진입점 `cloud-gateway.cjs`, 배포용 `Dockerfile`, `.dockerignore`.
- 최신 역할 기반 웹 통합 셸 `platform.html`, `platform.js`, `platform.css`, `enterprise-design.css`, `enterprise-tools.css`.
- `roles.js` MetaMask 연결·네트워크·EIP-6963 탐지·사용자에게 보이는 오류 안내.
- `resolution.html`·`resolution.js` 원격 PC 간 Supplier/Buyer EIP-712 동일 메시지 서명, 수신 서명 검증, `mutualResolve()` 실제 ABI.
- `replay.html`, `replay.js`, `replay-endpoints.cjs` 실제 Model B TOP 2회 재추론 / unsigned +1 주장값 / 정확한 INCONSISTENT 표기.
- `server.cjs` 최신 REST 경로, `e2e-endpoints.cjs` 및 거래/정산 상태 조회·권한·프로비넌스.
- 별도 Model B Railway 서버 최신 API 코드, 해당 모델 체크포인트 SHA-256 정보 및 **모델 가중치 파일의 안전한 제공 방법**.
- `browser_test/` 클라우드 브라우저 회귀 스크립트(지갑 mock 검증, 거래 상태 조회, +1 Replay 결과).

**주의:** GitHub의 기존 옛날 정적 `index.html`은 최종 6메뉴 클라우드 앱이 아닙니다. 새 도메인과 같은 앱으로 오해할 수 없도록 README 첫 화면에 즉시 표시해야 합니다.

### 안전한 동기화 절차

1. 최종 배포에 사용한 실제 Windows 소스 폴더를 찾습니다. 당시 클라우드 웹 빌드 위치: `C:\Users\USER\Documents\InspectEscrow_INTEGRATED_CLOUD_CANDIDATE_20261106`. 데스크톱 원격 연결이 복구돼야 해당 원본을 꺼낼 수 있습니다.
2. **배포에 사용한 원본을 별도 백업**하고 GitHub `main`에서 새 `release/2026-11-06-submission` 브랜치를 만듭니다.
3. 최신 웹 서비스 소스 전체를 재현 가능한 경로(예: `deploy/cloud-web/`)에 포함합니다. 다만 환경변수·`.env`·지갑 개인키·시드·API 토큰·이미지 원본·서명된 민감 Evidence·개인 파일은 제외합니다.
4. Model B 서버 코드는 별도 `deploy/modelb-cloud/`에 정리하고 실제 체크포인트 해시만 게시합니다. 모델 파일/원본 사진은 라이선스·용량을 검토한 뒤 별도 공급 경로를 문서화합니다.
5. 새 브랜치에서 Docker 빌드, 로컬 웹 실행, 역할 전환, 비서명 replay, API 응답, Evidence 다운로드·재검증을 수행합니다.
6. 배포본 `/replay.js`, `/resolution.js`, `/roles.js`, `/platform.js` 등과 제출 코드의 실제 SHA-256을 비교해 차이가 없도록 합니다. 빌드 시 생성물이 있으면 소스 커밋·재빌드 해시로 일치성을 입증합니다.
7. 원격 팀원 PC에서 코드만으로 설치할 수 있는지 확인하고 README의 재현 절차·필요 비밀변수 이름(값 제외)·버전/커밋 SHA를 업데이트합니다.
8. 코드 리뷰 후 `main` 병합하고 배포 커밋 SHA 고정 또는 Release 태그 생성. 이 과정에서 **현재 정상 가동 중인 Railway 서비스를 무작정 GitHub의 낡은 코드로 재배포하지 않습니다.**

## 최종 문구 통일 — P1

| 기존 또는 위험 표현 | 최종 권장 문구 |
|---|---|
| AI 불량 확정 | **AI 기준 초과 · 검토 필요(REVIEW_REQUIRED)** |
| AI가 대금을 자동 판결 | **계약 정책·역할·상호 합의에 따라 대금 귀속 결정** |
| Replay가 다른 점수를 보였다 = 사기 확정 | **고정 조건 재추론과 비교값 불일치 확인** |
| Model B Replay 조작으로 Sepolia HOLD 자동 발생 | **클라우드 오프체인 +1 탐지와 Sepolia 통제 HOLD 별도 검증** |
| 실거래·실제 ETH | **Sepolia 테스트넷에서 실행된 실제 온체인 TX·테스트 ETH** |
| 승인된 양산 검사 정책 | **실증용 정책 / 일부 Model B 정책 문서 DRAFT 단계** |
| 검증 36개 모두 온체인 통과 | **Local Anvil 자동 Red-Team 36/36 PASS** |
| Station 지갑으로 정산 | **Station은 검사 증거 서명, Actor는 거래 TX/정산** |
| Inspector 판정이 모두 자동 | **Replay 일관성과 정산 판단을 분리** |
| 정산 완료 = 입금 완료 | **SettlementCredited → claimable → withdraw() 구분** |
| 하나의 해시로 동일 실물 인증 | **원본 파일 무결성 검증, 물리적 시편 동일성은 별도 검증 필요** |
| 고객용 최종 운영 서비스 | **실증용 프로토타입 / PoC** |

**프레젠테이션 문장 원칙:** “실증했습니다”, “확인했습니다”, “기록됐습니다”처럼 누가 무엇을 어디서 검증했는지 구체적으로 설명합니다. “세계 최초”, “완전 무결”, “사기 방지 보장”, “법적 최종 판결”, “양산 즉시 도입” 같은 검증되지 않은 표현은 피합니다. 제출 문서에서 채팅 지시 흔적, ‘AI가 작성함’, 메모·TODO처럼 보이는 표현을 제거합니다.

## P0/P1 기능·안전성 점검표

### P0 — 제출 이전 필수

- [ ] **GitHub 최신 배포 소스 동기화**, 재현 가능한 Docker/설정/설치 문서, 현재 commit SHA 고정
- [ ] 퍼블릭 웹의 기능 회귀: 6개 메뉴·7역할 진입, 거래 선택, 기한 만료·이미 종료된 거래 읽기 동작
- [ ] 지갑 연결: Sepolia chain ID 11155111, Actor/Station 역할, 다른 네트워크·거부·권한 거절 문구
- [ ] 금전 함수: MetaMask 서명 전 컨트랙트 주소·전송 ETH·가스·정산 귀속·최종 승인 게이트
- [ ] 원본 TOP/FRONT/SIDE 및 Evidence JSON **명시적 저장·검증** 안내 (자동 백업 여부 허위 표현 금지)
- [ ] 통제 Red-Team 모드와 실제 Replay 모드에 항상 고정 라벨·TX 발송 여부 표시
- [ ] `+1` 점수 조작은 비서명 비교값임을 API·UI·Report·PPT에 공통 표기
- [ ] 모델 서버의 공개 엔드포인트 직접 호출·반복 추론 제한과 토큰 비노출 검토
- [ ] 시크릿 스캔: `.env`, `PRIVATE_KEY`, `MNEMONIC`, `API_TOKEN`, 지갑 JSON, 실물 이미지·Evidence·로그에 민감정보 유무 확인
- [ ] 개인정보·서버 로그 보관·삭제 범위 명시; 제3자 예치 지갑 개인키/시드 절대 수집하지 않기

### P1 — 완성도 개선

- [ ] 모바일 화면에서 기능 오류·가로 넘침·작은 글씨·테이블 가독성 확인
- [ ] 코드 내 `local`, `draft`, `test wallet`, `placeholder`, `TODO`, 낡은 주소 및 레거시 링크 표기 전수 감사
- [ ] 결과 스크린샷은 **실제 웹 실행 화면 캡처**만 사용, 임의 생성한 브라우저 UI 이미지 사용 금지
- [ ] 실행 중 로딩·중복 클릭·실패 후 재시도·RPC 장애·MetaMask 변경 시나리오 점검
- [ ] 거래 단위와 컨트랙트 전체 누적 ETH 수치 구분
- [ ] 가스비 현실성: 예치금 대비 L1 비용, 롤업/배치 경제성, 시연 비용을 분리해 표기
- [ ] `claimable` 0 전환 후 출금 TX 영수증을 찾지 못해 ‘PENDING’으로 오판하는 조회 UI 오류 점검

## 실제 검증의 한계 (숨기지 않을 것)

1. 2026-11-06 신규 거래의 **HOLD는 통제 테스트**입니다. 정식 서명 Evidence를 훼손해 AI 독립 Replay가 자동으로 이를 탐지하고 HOLD로 전환한 한 번의 연속 온체인 실험이 아닙니다.
2. 클라우드 `+1` 탐지는 실제 AI 2회 추론 기반이지만 **unsigned 비교 주장 조작**입니다. Sepolia TX를 보내지 않았습니다.
3. 신규 거래의 Supplier/Buyer Evidence JSON 원본은 당시 저장하지 않아 해당 거래를 다시 독립 Replay할 완전한 아티팩트가 부족합니다.
4. 물리적으로 같은 실물인지에 대한 지속적 추적과 법적 중재 결과는 검증하지 않았습니다.
5. 현재 공개 GitHub는 실제 클라우드 웹의 완전한 실행 소스가 아니므로 **코드 일치성 검증 완료라고 제출하지 않습니다.**

## 버전 정보

- Railway 통합 웹 최신 확인 성공 배포: `ed39d2d2-0e87-4d2f-9f7e-1e88c0bdc380`
- Railway 별도 Model B 서버: `9b2f3d1f-f880-4408-9124-53a7d6684a1c`
- GitHub 동기화 전 기준 커밋: `1d8c41c1b5315a071c32b12139c6993128a9f432`
- 최신 공개 TX 색인: [SEPOLIA_12TX_E2E_20261106.json](SEPOLIA_12TX_E2E_20261106.json)

본 문서는 **제출 품질 점검 기록**이며 완료 체크박스는 실제 검증 후에만 변경합니다.

## 공식 본선 운영 안내와 대조

[BLOCK AI✳26 공식 홈페이지](https://blockhack.kr/)에는 2026-11-06~07 본선, **최종 구현된 프로토타입 및 GitHub 소스코드** 심사, 발표 **8분·질의응답 2분**으로 안내되어 있습니다. 이전 멘토링 가이드나 팀 내부 발표 시간표가 다르면 **현장 운영진의 개별 공지**를 우선 확인해야 합니다. 행사 당일 제출 마감시각·필수 파일 형식·제출 폼 URL은 이 공개 페이지 정보만으로 확정하지 않습니다.
