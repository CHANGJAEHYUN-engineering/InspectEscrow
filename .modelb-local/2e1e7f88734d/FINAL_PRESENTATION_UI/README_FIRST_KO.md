# InspectEscrow FINAL WEB RELEASE V2

이 패키지는 InspectEscrow PATCH3 통합 웹사이트와 Model B 로컬 추론 서버를 다른 Windows PC에서 실행하기 위한 팀 내부 인계본입니다.

## 진실성 경계

- 기본 네트워크는 Sepolia **읽기 전용**입니다.
- 실제 MetaMask 서명과 트랜잭션은 각 사용자가 단계별로 승인해야 합니다.
- 포함된 S03/S05 이미지는 보관 검증 fixture이며 신규 촬영 증거가 아닙니다.
- Local Anvil 결과를 Sepolia 성공으로 표시하지 않습니다.
- 개인키, mnemonic, 브라우저 프로필, RPC 비밀 토큰은 포함하지 않습니다.

## 빠른 시작

1. `INSTALL_WINDOWS_KO.md`를 읽습니다.
2. PowerShell에서 `./INSTALL_DEPENDENCIES.ps1`을 한 번 실행합니다.
3. `./START_INSPECTESCROW.ps1`을 실행합니다.
4. `./CHECK_INSPECTESCROW.ps1`이 모두 PASS인지 확인합니다.
5. 브라우저에서 `http://127.0.0.1:8770/journey`를 엽니다.

최종 웹 소스는 `InspectEscrow_PATCH3_DEPLOY/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI`에 있습니다.

