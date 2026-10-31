# 김지환 팀원 인계

권장 압축 해제 경로는 `C:\InspectEscrow`입니다. 긴 OneDrive 경로는 사용하지 마세요. 최종 릴리스는 짧은 경로의 새 `.venv`에서 잠금 의존성 설치와 실제 Model B 추론까지 검증됐습니다.

## 바로 사용할 것

- `START_INSPECTESCROW.ps1`: Model B 8766 + UI 8770 최소 구성 시작
- `CHECK_INSPECTESCROW.ps1`: 포트, API, 모델 commitment, 웹 경로 확인
- `STOP_INSPECTESCROW.ps1`: 이 패키지가 기록한 PID만 종료
- `/journey`: 전체 화면 이동과 현재 거래 preflight
- `test-dynamic-trade-e2e.mjs`: 독립 Local Anvil 신규 거래 2개 격리 E2E 기준

## 김지환 담당 범위

- 녹화 전용 Local Anvil chain 및 PATCH3/Registry 배포
- 4개 시나리오별 독립 Trade ID
- 역할별 테스트 Actor/Station 지갑 구성
- MetaMask 프로필 및 녹화 리허설

## 반드시 유지할 원칙

- Local Anvil 화면에는 `LOCAL ANVIL · NOT SEPOLIA` 표기를 유지합니다.
- 실제 지갑 키를 소스·JSON·브라우저 localStorage에 넣지 않습니다.
- Station과 Actor를 같은 계정으로 설정하지 않습니다.
- 기존 S05/Model A Sepolia 거래를 녹화용으로 변경하지 않습니다.
- `DRAFT_MODEL_B_NOT_APPROVED_FOR_ONCHAIN`을 코드로 우회하지 않습니다.

다른 PC에서의 실제 설치와 카메라·MetaMask 연동은 이 PC에서 대행 검증할 수 없으므로 첫 실행 체크리스트로 남습니다.

