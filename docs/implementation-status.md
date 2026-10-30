# InspectEscrow — 구현·검증 상태

기준일: **2026-10-31**. 실제 체인·로컬 Anvil·Windows AI·GitHub 게시 상태를 구분한다.

| 구성 | 구현·검증 결과 | 현재 GitHub `main` |
|---|---|---|
| PATCH2 Model A PatchCore | 공개 MVTec 기반 추론·증거 및 Sepolia 0.005 ETH 분쟁·환급·출금 E2E | 소스 및 거래 JSON 게시 |
| PATCH3 Solidity | CredentialRegistry 분리, EIP-712 역할/서명 검증, liveness·arbitration·fallback·pull payment | 계약·정책·스크립트·테스트 소스 게시 |
| PATCH3 Sepolia deployment | Escrow 및 Registry 배포, 코드·역할 readback | 계약 주소·배포 TX 요약 게시 |
| PATCH3 Model B S05 | 0.001 Sepolia ETH, Supplier PASS/Buyer PASS, 정상 정산·Withdraw, 12 TX 실행 기록 | 실증 요약 게시. 개별 TX 전체 인덱스 추가 필요 |
| Model B Windows 실물 AI | S01~S08 촬영; S03 정상·손상 비교, S05 재추론 | 기술 요약 게시. 모델 가중치·사진 원본은 미게시 |
| Independent Replay | 동일 Windows runtime에서 S05 점수 재현, 20/20 로컬 PASS | 기술 요약 게시, 일부 상세 보고·실행 바이너리는 로컬 |
| Red-Team 및 예외 종료 | Local Anvil 36/36 PASS, 추가 2A~2E 및 Fork 테스트 | PATCH3 Red-Team 소스와 검증 매트릭스 게시 |
| 최종 통합 사용자 웹사이트 2A~2F | 로컬 개발본의 UI, Evidence/Replay/Resolution 및 서버 | **P0 동적 Trade ID 통합과 독립 실행 인계 검증 진행 중. `main` 미반영** |
| 신규 Model B 실물 REVIEW 분쟁 | 로컬 시나리오 및 DRAFT 거래 후보만 확인 | **신규 Sepolia 분쟁 E2E 완료 아님** |

## 참고 링크

- [README](../README.md)
- [시스템 아키텍처](architecture.md)
- [전체 증거 색인](FINAL_EVIDENCE_INDEX.md)
- [PATCH3 배포·실물 Model B](PATCH3_SEPOLIA_AND_MODEL_B_20261031_KO.md)
- [보안 검증 매트릭스](SECURITY_VALIDATION_MATRIX_20261031_KO.md)

GitHub 루트 `index.html`은 **예선 인터랙티브 시뮬레이션**이다. 실제 Model B 추론·거래·정산용 2F 통합 사이트와 혼동하지 않아야 한다.
