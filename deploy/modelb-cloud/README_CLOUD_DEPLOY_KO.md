# InspectEscrow — PC 독립형 클라우드 LIVE 후보 (2026-11-06)

## 구현 범위
- Model B frozen server.py, requirements.txt, 약 95MB 모델 ZIP을 원본 그대로 복사
- FastAPI cloud_app.py와 static/cloud-live.html 신규 작성
- 접근 코드 입력 후 카메라/파일 TOP 업로드 → 원본 SHA256 대조 → 고정 PatchCore 추론
- TOP-only: TOP_ONLY_EVIDENCE_INCOMPLETE로 표시
- TOP+FRONT+SIDE: THREE_VIEW_UNSIGNED_OFFCHAIN 표시, Manifest/Inference/Evidence SHA256 출력
- 증거 JSON 저장 및 서버 내부 해시 자체검증
- 원본 이미지 영구 저장 없음, Station 서명 0, TX 0
- 기존 8772/8773/18550/Anvil와 실행·소스 분리

## 중요한 한계
이 클라우드 후보의 Evidence는 **별도의 오프체인 시연용 증거**다.
PATCH3 계약의 EIP-712 서명/Keccak Evidence Bundle과 동등하다고 주장하지 않는다.
3뷰 이미지 물리적 동일성도 인증하지 않는다.
기존 온체인 분쟁·정산은 검증된 녹화 영상으로 별도 제시한다.

## 클라우드 배포 전 필수조건
1. Google Cloud 프로젝트/결제계정 및 Cloud Run, Cloud Build, Artifact Registry, Secret Manager API 활성화
2. Secret Manager에 inspectescrow-demo-token 생성, Cloud Run 서비스 계정에 secretAccessor 권한 부여
3. 이 디렉터리에서 독립 Docker 빌드 (FINAL_PRESENTATION_UI는 수정하지 않음)
4. 모델 체크포인트 SHA 및 Linux CPU 실제 추론 결과 검증
5. 외부 네트워크에서 실제 업로드·추론·증거 다운로드·해시 검증
6. 비용/외부 공개 범위 승인

## 배포 명령 예시 (계정 준비 및 승인 후)
gcloud config set project PROJECT_ID
gcloud run deploy inspectescrow-cloud-live --source . --region asia-northeast3 --allow-unauthenticated --cpu 2 --memory 8Gi --concurrency 1 --timeout 300 --max-instances 2 --min-instances 1 --set-secrets INSPECTESCROW_DEMO_ACCESS_TOKEN=inspectescrow-demo-token:latest

위 명령은 실제 비용이 발생할 수 있다. 승인 없이 실행하지 않는다.
최소 인스턴스 1개는 본선 시연 중 서버 절전을 방지하지만 비용이 발생한다.

## 외부 PC 실증
1. 다른 PC에서 HTTPS 접속
2. 접근 코드 입력 → AI 모델 준비
3. 새로운 TOP 사진 촬영/업로드
4. 실제 PatchCore 점수와 TOP SHA256 확인
5. FRONT/SIDE 추가 → 3뷰 Evidence 생성
6. 자체 해시 검증 및 JSON 저장
7. 발표자 PC 전원 OFF 상태에서 동일 과정 반복
8. Windows와 Linux CPU 모델 점수·판정 정합성 검증

## 보안
- 지갑 키/민감 RPC 자격증명/.env/실물 사진 원본 공개 GitHub Push 금지
- 모델 ZIP의 배포 허용 여부 확인 후 비공개 클라우드 컨테이너에서만 보관
- 운영 서비스 재시작, Anvil 초기화, 실거래 TX 금지

## 남은 기술 검증
- Linux CPU에서 anomalib==2.2.0 / torch==2.15.0 조합 빌드 및 실행
- 첫 요청시 모델 로딩 시간과 메모리 측정
- score_scaled 수치 재현성
- 서버 부하 제한, 접근코드 변경, 요청 로그 관리
