# InspectEscrow — FINAL WEB RELEASE V2 (2026-10-31)

## 공개 상태

2026-10-31 최종 Windows 통합 웹사이트의 **검증된 소스코드와 경량 테스트 결과**를 GitHub `main`에 추가했다. 기존 루트 `index.html`은 초기 인터랙티브 콘셉트 데모이며 본선 통합 웹사이트가 아니다.

- 통합 UI·API: [FINAL_PRESENTATION_UI](../.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/)
- 동적 Trade ID: [dynamic-trade-context.cjs](../.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/dynamic-trade-context.cjs)
- 웹 진입점: [server.cjs](../.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/server.cjs)
- Model B Python 추론 소스: [modelb/](../modelb/)
- PATCH3 계약 및 검증 코드: [packages/phase3c_hardening_20261023/](../packages/phase3c_hardening_20261023/)
- 최종 테스트 요약: [TEST_REPORT_KO.md](../.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/TEST_REPORT_KO.md)
- Windows 팀원 실행 설명서: [INSTALL_WINDOWS_KO.md](../.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/INSTALL_WINDOWS_KO.md)

## 검증 범위와 결과

Codex Final Web Release V2 원본 검증 보고에 따르면, 주요 웹 경로 10/10 HTTP 200, Cold Start PASS, 브라우저 Console 오류 0, 동적 Trade ID Local Anvil 15/15 (18개 로컬 TX), Trade Builder 16/16, Trade Workspace 14/14, Evidence Import 21/21, Resolution 23/23이다. 동일 PC에서 최종 인계 ZIP을 별도 위치로 추출해 설치했고, 보관된 S05 TOP 이미지의 실제 Model B 추론에서 36.30290222167969 (PASS)를 확인했다. 해당 수치는 **새 촬영이나 새 Sepolia 거래가 아닌 기존 원본 재추론**이다.

기존 Model A/PATCH2의 Sepolia 분쟁·환급 E2E와 Model B/PATCH3 S05 정상 거래·정산·출금 E2E는 **서로 다른 검증**이다. 모델 B의 실제 실물 REVIEW 분쟁 전체를 Sepolia에서 완주했다는 의미가 아니다. 별도의 Local Anvil Red-Team 36/36 PASS는 실제 Sepolia 트랜잭션과 구분한다.

## 개발자 실행과 사전 조건

공개 소스는 원래 검증한 상대경로 구조를 유지한다. Node.js 24.x에서 `npm ci` 후 `npm run start:web`로 웹 런타임을 시작할 수 있도록 구성됐다. 웹은 기본적으로 `127.0.0.1:8770`에서 동작하며 Sepolia 읽기 전용 조회에는 RPC가 필요하다. 실제 Model B 추론을 사용하려면 별도 Python 서버 및 정합성 검증된 모델 아카이브가 필요하다. **공개 GitHub에 모델 가중치와 원본 S03/S05 사진을 포함하지 않으므로 공개 저장소만 복제해서 최종 실물 AI 시연 전체를 재현할 수는 없다.** 자동 테스트 중 원본 사진·비공개 evidence fixture·Anvil 환경을 요구하는 항목도 동일하게 별도 자산이 필요하다.

### 최종 팀 내부 Windows 실행본

- 이름: `InspectEscrow_FINAL_WEB_HANDOFF_20261031.zip`
- 크기: 153,387,537 bytes
- SHA-256: `B52D02F6AC8A51BFE3267B6562E0A4F4B50293B54A5A77B8579A76D984378C18`
- ZIP 항목: 236
- 공개 저장소에는 해당 ZIP 자체를 배포하지 않음. 팀 내부 전달본으로 설치·콜드 스타트·실제 Model B 추론을 검증함
- 김지환 별도 Windows PC에서의 독립 설치는 **아직 미검증**

## 공개 제외

개인키·mnemonic·환경변수 비밀값·브라우저 프로필·모델 가중치·실물 이미지·비공개 검사 Evidence Bundle·대용량 ZIP은 커밋하지 않는다. 보관된 샘플에 대한 실행 결과와 신규 거래 실시간 촬영 증거를 혼동하지 않는다.

## 운영 주의

- `MODEL_B_PATCH3_COMMITMENT_DRAFT.json`의 `DRAFT_NOT_BROADCASTABLE` 상태는 **신규 후보 정책에 관한 당시 초안/참조 데이터**로, 별도로 실증된 과거 S05 온체인 정상 완료 기록과 다른 상태이다.
- 새 Sepolia 트랜잭션, 사용자 MetaMask 승인 또는 실제 외부 지갑 서명은 이 공개 릴리스 작업에서 수행하지 않았다.
- 루트 `index.html`은 오래된 개념 데모이다. 실제 Windows 통합 UI는 위 `FINAL_PRESENTATION_UI`에서 실행한다.
