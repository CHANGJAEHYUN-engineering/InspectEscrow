# FINAL WEB RELEASE V2 검증 요약

검증일: 2026-10-31 KST

- 재부팅 직후 C: 여유 공간: 15.20 GiB
- 릴리스 사본 생성·추출 후 최신 측정: 9.95 GiB. 10 GiB 안전 게이트가 Model B 재로딩을 차단했으며, 생성 사본을 정리한 뒤 경량 회귀만 수행했습니다.
- Node.js 24.19.0 / npm 11.17.0 / Python 3.12.10 / Anvil 1.7.1
- 콜드 스타트: UI 8770, Model B 8766, 5개 health endpoint PASS
- 실제 Model B 보관 S05 TOP 재추론: 36.30290222167969, PASS, 원본 SHA 일치
- Dynamic Trade E2E 이번 재실행: 15/15, LOCAL_ANVIL 18 TX, Trade A 정산·Withdraw 및 Trade B PROPOSED 격리
- 기존 Model B E2E 기록: 16/16
- PATCH3 Red-Team 기록: 36/36
- 이번 재실행: Trade Context 8/8, Trade Builder 16/16, Trade Workspace 14/14, Role UI 5/5, Evidence Import 21/21, Resolution 23/23
- 기존 검증 기록: Replay 20/20, Live Evidence 20/20, Model B Local E2E 16/16, PATCH3 Red-Team 36/36
- 실제 브라우저: 10개 주요 경로 HTTP 200, 콘솔 오류 0, 후보 Trade ID가 Evidence → Replay → Resolution에서 유지됨
- 최종 ZIP 독립 추출(`C:\IEV2`): manifest 234/234 해시 PASS, npm 9개·Python lock 90개 설치 PASS, npm 취약점 0
- 독립 추출본 콜드 스타트: UI/Model B 포함 7개 endpoint PASS
- 독립 추출본 S05 TOP 실제 추론: `36.30290222167969 → PASS`, 원본 SHA 일치, checkpoint 일치, 첫 로드 139.459초
- 이번 릴리스 작업의 실제 Sepolia TX: 0

`RECORDED` 결과와 이번에 재실행한 결과를 혼동하지 않습니다. 최종 추출본은 짧은 로컬 경로에서 독립 설치·콜드 스타트·실제 보관 S05 추론까지 통과했습니다. 타 Windows PC 설치, 실제 카메라 권한 승인, 실제 MetaMask 역할별 서명은 해당 PC 사용자 검증이 필요합니다.

