# InspectEscrow Cloud Live — Railway 배포 인수인계

## 준비된 파일
- Dockerfile, requirements.txt, frozen server.py
- cloud_app.py (FastAPI; 토큰 보호)
- static/cloud-live.html (현장 촬영/사진 입력/AI 추론/Evidence)
- model/InspectEscrow_ModelB_BACKUP.zip (기존 체크포인트, SHA 검증)
- test_cloud_smoke.py, test_frontend.cjs
- CANDIDATE_SHA256_MANIFEST.json

## 직접 완료한 검증
- 원본 모델 ZIP SHA-256 일치
- 모델 artifact commitment 검증 통과
- FastAPI 브라우저 UI 및 health 응답 정상
- 인증 없는 warm/verify 요청 401
- 거짓 증거 verify 요청 FAIL
- 프런트엔드 JavaScript 문법·필수 컨트롤 확인
- 기존 서비스 및 실제 온체인 상태를 수정하지 않음

## 아직 필요한 검증
- Railway 계정/워크스페이스 인증
- 요금제·메모리 확인 (체험 1GB / 무료 0.5GB는 PatchCore+PyTorch에 부족할 위험)
- Railway Linux Docker 빌드 성공 확인
- 컨테이너에서 실제 Model B 추론 및 점수 재현성
- 원격 HTTPS 주소 생성 및 외부 PC의 새 사진 업로드
- 발표자 PC 완전 종료 시 독립 동작
- 외부 네트워크, 카메라 권한, Evidence JSON 다운로드

## Railway CLI 절차 (사용자 계정 로그인 후, 비용 관련 승인 시)
Railway CLI는 별도 컴퓨터 로그인이 필요하다. ChatGPT에서 Railway 앱을 설치해도
로컬 CLI 로그인 상태가 자동 공유되지는 않는다.

PowerShell (Railway 명령 버전은 사전 확인):
  Set-Location 'C:\Users\USER\Documents\InspectEscrow_CLOUD_LIVE_CANDIDATE_20261106'
  npx.cmd --yes @railway/cli whoami
  npx.cmd --yes @railway/cli up --new --name inspectescrow-cloud-live-20261106
  npx.cmd --yes @railway/cli domain

- 새 프로젝트만 만들고 기존 공개 InspectEscrow Github 리포지토리에는 Push하지 않는다.
- 프로젝트 변수 INSPECTESCROW_DEMO_ACCESS_TOKEN에 최소 32바이트 난수 설정
- Railway 서비스 메모리/CPU와 Restart Policy 설정
- 외부 배포 이전 무단 공개 금지
- 서비스 루트 페이지는 공개지만 실제 inference/verify/warm API는 접근 코드가 필요하다.
- Railway 공식 CLI up 문서: https://docs.railway.com/cli/up
- Railway 가격/상한: https://docs.railway.com/pricing/plans

## 발표 표현 구분
- 이 클라우드 MVP는 '실시간 AI 이미지 검사 + 오프체인 증거 생성'이다.
- 기존 6메뉴, 7역할과 온체인 정산 전체를 클라우드로 이전한 버전은 아니다.
- 기존 Anvil Local E2E 및 Sepolia 공식 8773은 절대 건드리지 않는다.
- Station EIP-712 서명, 정책 승인, 블록체인 정산은 녹화 영상/별도 검증으로 보여준다.
- TOP 단독은 3뷰 완료가 아니며, FRONT/SIDE가 있어도 물리적 동일성을 증명하지 않는다.

## 비용
Railway는 사용량 기반 과금이다. 유료 Hobby 기본 요금은 $5/월.
사용자 승인 없이 요금제 업그레이드 및 유료 리소스 생성 금지.

## 긴급 시연 대체
네 PC 전원이 불안정하면 단일 HTML/JS만 호스팅해서는 실제 AI 추론을 보장할 수 없다.
반드시 모델 컨테이너와 HTTPS API를 외부에서 검증해야 한다.
