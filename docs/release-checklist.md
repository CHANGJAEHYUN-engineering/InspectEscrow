# InspectEscrow 공개 GitHub 릴리스 체크리스트

기준일: **2026-10-31**

## 완료 — 이번 공개 기술 자료

- [x] PATCH2 / Model A Sepolia 분쟁 완료 JSON 및 관련 AI·Web3 기록
- [x] PATCH3 Solidity Escrow·CredentialRegistry 소스와 관련 policy/verification scripts
- [x] PATCH3 배포 주소·배포 TX·검증 readback 공개 요약
- [x] PATCH3 Model B S05 정상 Sepolia 거래·출금 이력 설명
- [x] Windows Model B S05 실제 Replay 점수 및 로컬 검증 결과 JSON 공개 요약
- [x] Local Anvil Red-Team 테스트 소스와 결과의 환경 구분
- [x] 아키텍처·증거 색인·구현 상태·참고자료 링크 일치
- [x] 현재 `main`의 멘토링 요청 파일 제거 및 공개 문서의 기술 내용 정리

## 공개 릴리스 전에 남은 항목

- [ ] 2A~2F 통합 사용자 웹사이트의 **P0 동적 Trade ID E2E** 완료 결과 확인
- [ ] Model B 웹/서버/의존성/체크포인트 배포 가능 범위 확정
- [ ] 다른 Windows PC에서 설치·실행 및 주요 E2E 확인
- [ ] 최신 통합 웹사이트 소스의 전체 경로·내용 보안 스캔, 공개 가능 파일 allowlist 작성
- [ ] 웹사이트 README, 실행 명령, 정확한 환경설정·ABI 경로
- [ ] Model B S05 12건 실제 Sepolia TX 전체 해시 목록을 독립적으로 조회·공개
- [ ] 2A~2F 신규 테스트·로컬/실제 네트워크 범위 별도 기록
- [ ] 최종 릴리스 ZIP 해시와 독립 추출 설치 시험

## 주의

- Root `index.html`은 예선 인터랙티브 시뮬레이션이다.
- 이미 통과한 테스트라도 이번 GitHub 최신화에서 재실행하지 않았다면 과거 결과로 표기한다.
- MetaMask 개인키/시드·RPC 인증토큰·비공개 원본 이미지·대형 가중치 파일을 GitHub에 업로드하지 않는다.
- 검증 완료 이전에 `git add -A`, 무단 merge, 실제 Sepolia broadcast를 하지 않는다.
