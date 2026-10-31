# InspectEscrow FINAL WEB RELEASE V2 보고서

검증일: 2026-10-31 KST

## 결과

- 통합 UI와 Model B는 재부팅 후 기존 실행 스크립트로 콜드 스타트되었습니다.
- 실제 보관 S05 TOP 재추론은 `36.30290222167969 → PASS`였고 원본 SHA-256 및 checkpoint commitment가 일치했습니다.
- 동적 Trade ID는 신규 Local Anvil 거래 2개로 15/15 PASS, 18 TX를 재검증했습니다. Trade A는 RELEASED·Withdraw 완료, Trade B는 독립 PROPOSED 상태를 유지했습니다.
- 실제 Sepolia 후보 `0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff`는 PROPOSED(1)이며 정책 문서는 계속 `DRAFT_MODEL_B_NOT_APPROVED_FOR_ONCHAIN`입니다.
- `/live`에서 선택한 Trade ID를 `/evidence`, `/replay`, `/e2e`로 전달하고, Evidence/Replay가 URL 또는 전역 활성 거래를 우선 복구하도록 수정했습니다. 다른 거래의 과거 검증 기록은 자동 선택하지 않습니다.
- 이번 작업의 실제 Sepolia 서명·TX는 0건입니다.
- 최종 ZIP을 `C:\IEV2`에 독립 추출하여 npm 9개와 잠금 Python 패키지 90개를 새로 설치했고, 추출본 자체에서 UI/Model B 7개 endpoint 및 보관 S05 TOP 실제 추론을 통과했습니다.

## 실제 재실행

- Trade Context 8/8
- Trade Builder 16/16
- Trade Workspace 14/14
- Role UI 안전 게이트 5/5
- Evidence Import 21/21
- Resolution 23/23
- Dynamic Trade Local Anvil E2E 15/15, 18 TX
- 주요 웹 경로 10/10 HTTP 200, 브라우저 콘솔 오류 0
- 최종 추출 manifest 234/234 해시, npm audit 취약점 0, Model B 첫 추론 139.459초

## 보존된 기록

Model B Local E2E 16/16, Inspector Replay 20/20, Live Evidence 20/20, PATCH3 Red-Team 36/36은 기존 검증 결과입니다. 이번 릴리스에서 해당 assertion을 약화하거나 결과를 재작성하지 않았습니다.

## 한계와 사용자 행동

- C: 여유 공간이 릴리스 사본 작업 중 9.95 GiB로 내려가 10 GiB 안전 게이트 이후에는 Model B를 다시 로드하지 않았습니다.
- 독립 추출 설치 시험에서 긴 OneDrive 경로가 WinError 206을 유발하고 기존 설치기가 이를 놓치는 문제가 발견됐습니다. 최종 설치기는 짧은 경로를 강제 안내하고 각 native exit code를 검사하며, 검증된 Windows 의존성 lock을 사용하도록 수정했습니다.
- 다른 Windows PC에서의 설치, 실제 카메라 권한 승인, MetaMask 역할별 계정 접근, 실제 Station 서명과 Sepolia 거래는 사용자가 별도로 검증·승인해야 합니다.
- Local Anvil 결과는 Sepolia 성공이 아니며, 보관 S03/S05 사진은 신규 실시간 촬영이 아닙니다.
