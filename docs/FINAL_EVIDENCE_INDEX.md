# InspectEscrow — 기술·실증 증거 색인

최종 갱신: **2026-10-31**  
본 문서는 공개 저장소의 원본 근거와, 아직 로컬에 있는 증거를 구분한다.

## 1. 실제 Sepolia — PATCH2 / Model A 분쟁 종료

- 실제 계약: [`0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9`](https://sepolia.etherscan.io/address/0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9)
- Trade ID: `0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c`
- 0.005 Sepolia ETH
- Supplier PASS → Buyer REVIEW → Primary timeout → Backup Replay CONSISTENT → Inspector REFUND_TO_BUYER → Buyer Withdraw
- 최종 `accountingConserved()=true`
- [실제 거래 실행 JSON](../packages/phase3b_20261010/results/FINAL_SEPOLIA_E2E_20261011.json)
- [거래 단계 상세](STATUS_20261011_KO.md)

입력은 공개 MVTec `metal_nut` 기반의 서로 다른 정상/이상 이미지다. 동일 실물 부품의 출하→입고 이력을 실증한 거래로 소개하지 않는다.

## 2. 실제 Sepolia — PATCH3 배포

- Escrow: [`0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905`](https://sepolia.etherscan.io/address/0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905)
- Registry: [`0xc715A0263B752c9D0Be99379b7939466Af5fd20e`](https://sepolia.etherscan.io/address/0xc715A0263B752c9D0Be99379b7939466Af5fd20e)
- 배포 TX는 [PATCH3 배포 및 Model B 검증 기록](PATCH3_SEPOLIA_AND_MODEL_B_20261031_KO.md) 참고.
- [PATCH3 Solidity source](../packages/phase3c_hardening_20261023/contracts/)
- [정책 생성·서명·배포 검증 스크립트](../packages/phase3c_hardening_20261023/scripts/)
- [Red-Team 테스트 소스](../packages/phase3c_hardening_20261023/test/)

## 3. 실제 Sepolia — PATCH3 / Model B S05 정상 거래

- Trade ID: `0x2e1e7f88734dc4bf2b1fee924192a11311846a4351b86497d5c43670fa173d9e`
- 2026-10-29: 팀의 발표용 거래 기록상 **12건의 성공 트랜잭션**, 0.001 Sepolia ETH
- Supplier PASS `36302902`; Buyer PASS `37078381`
- `RELEASED(17)`, Supplier Withdraw, `claimable=0`
- 로컬 증거: `2E_INTEGRATED_E2E_REDTEAM_REPORT_KO.md` 및 Sepolia 실행 영수증·발표자료의 12 TX 표.
- **전체 12개 TX 해시를 정리한 공개 원본 인덱스는 아직 추가되지 않았음.** 검증된 12건 개별 영수증을 게시하기 전까지 이 문서는 요약본이다.

S05의 온체인 검증 대상은 **정상 → 정상** 거래다. 아래 S03 스크래치 비교와 결합해 하나의 Sepolia 분쟁 거래처럼 표시하지 않는다.

## 4. 실제 실물 AI·Replay — Windows Local

- Model B: 직접 촬영한 육각너트 S01~S08
- S03 정상 `35534252` PASS / 깊은 스크래치 `52572132` REVIEW_REQUIRED (별도 비교 실험)
- S05 Supplier `36302902`, Buyer `37078381` 점수 동등 재추론
- Windows 실제 Model B 동일 runtime Replay **20/20 PASS** (로컬 보고서)
- AI 입력은 TOP 뷰; FRONT/SIDE는 증거·검증용
- 모델 체크포인트·대형 원본 사진은 이 GitHub에 포함하지 않음

## 5. 로컬 Anvil / Fork 보안 검증

- Local Anvil PATCH3 Red-Team: **36/36 PASS**
- Local Anvil Model B 합성 E2E: **16/16 PASS, 70 local TX**, 이 suite 자체의 `physicalAiExecuted=false`
- 2A 거래 workspace **14/14**, 2B Evidence Import **21/21**, 2D Resolution **23/23**
- 2E release readiness **30/30**, `SEPOLIA_READ_ONLY`
- Sepolia fork settlement **13/13**, 실제 Sepolia 전송 **0 TX**
- [보안 검증 매트릭스](SECURITY_VALIDATION_MATRIX_20261031_KO.md)

위 항목들은 별도 환경에서 실행한 과거 기록이다. GitHub 최신화 과정에서 다시 실행한 결과가 아니다.

## 6. 별도 PATCH3 진행 거래·후보

- 기존 별도 funded 거래: `0x8e07587390de665a8a3c0fe81e1e7298541847acd244db5ea98e5dc3acb3f9db`, `FUNDED(4)`
- 신규 Model B REVIEW 후보: `0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff`, `PROPOSED(1)` 및 DRAFT 정책
- 이 거래들을 S05의 `RELEASED` 거래와 합쳐 표시하지 않는다.

## 7. 구현 버전과 공개 파일

| 자료 | 저장소 |
|---|---|
| PATCH2 실제 TX·AI 코드 | `packages/phase3b_20261010/`, `packages/ai_20261010/` |
| PATCH3 스마트컨트랙트·테스트 | `packages/phase3c_hardening_20261023/` |
| 보안 설계 | [PATCH3 security & liveness](PATCH3_SECURITY_AND_LIVENESS_KO.md) |
| 권한·신뢰 경계 | [Trust assumptions](PATCH3_TRUST_ASSUMPTION_REGISTER_KO.md) |
| 실물 촬영 절차 | [Physical capture](PHYSICAL_CAPTURE_PROTOCOL_V1_KO.md) |
| 최신 통합 웹사이트 2A~2F | 로컬 개발본. **P0 동적 Trade ID/릴리스 검증 후 별도 공개 예정** |

추가 외부 감사, 실제 제조기업과의 파일럿, 다른 PC에 설치한 모델·증거 전체 재현성은 아직 이번 공개 저장소의 검증 결과가 아니다.
