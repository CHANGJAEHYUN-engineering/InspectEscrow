# InspectEscrow — PATCH3 배포 및 실물 Model B 검증 기록

기준일: **2026-10-31** · 네트워크: **Ethereum Sepolia (11155111)**

## 1. PATCH3 컨트랙트

| 구성요소 | 배포 주소 | 배포 TX |
|---|---|---|
| CredentialRegistryPatch3 | [`0xc715A026…fd20e`](https://sepolia.etherscan.io/address/0xc715A0263B752c9D0Be99379b7939466Af5fd20e) | [`0x309d40b2…6ffc4`](https://sepolia.etherscan.io/tx/0x309d40b2af8aff9e47a7b14dde7ed07fe9bf5615a3d310263643f9914886ffc4) |
| InspectEscrowPatch3 | [`0x0a4721CF…B905`](https://sepolia.etherscan.io/address/0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905) | [`0x57707c32…fc59`](https://sepolia.etherscan.io/tx/0x57707c3241fe0e8c0be057012fb8f884d8aa5fa4ba11a6cb0d0faff5c41efc59) |

- 배포 기록: 2026-10-26 15:26:13 UTC
- Escrow runtime code hash: `0x5a606383f54c6ebeb52316927343ee802ecdd4774a1a2978de08bf9ee981bdd9`
- Registry runtime code hash: `0x9b2c499441beb2414877fabc7ef65d54cecf752ef1c3963e5bf5a059ab275262`
- 배포 후 검증 기록: chain ID, 계약 버전, 등록소 포인터, 코드 존재, 5개 Station ACTIVE.
- Solidity 소스: [PATCH3 contracts](../packages/phase3c_hardening_20261023/contracts/).

## 2. 실물 Model B — S05 정상 거래 Sepolia

- 거래 ID: `0x2e1e7f88734dc4bf2b1fee924192a11311846a4351b86497d5c43670fa173d9e`
- 예치: **0.001 Sepolia ETH**
- 2026-10-29 실행 요약: **12개 성공 TX**, 검사 제출, 정상 인수 및 정산, Supplier `withdraw()` 기록.
- 최종 거래 상태: **RELEASED(17)**; 인출 후 `claimable=0`.
- Supplier S05 모델 추론: `scoreScaled=36302902` → PASS
- Buyer S05 모델 추론: `scoreScaled=37078381` → PASS
- 해당 거래 정책의 `thresholdScaled=38280374`; `policyVersion=2`.
- 이 거래의 Supplier·Buyer 증거는 정상/정상이며, **실물 REVIEW 분쟁을 Sepolia에서 완료했다는 증거가 아니다.**

실행 TX 12건의 상세 리스트는 본선 발표자료의 거래표에 기록되어 있다. 이 공개 문서에서는 배포 컨트랙트·거래 식별자·실행 범위를 제공한다. **개별 TX 전체 해시 목록을 이 문서에서 아직 별도 검증·수록하지 않았으므로, 이 문서만으로 12건 영수증 전부를 추적할 수 있다고 표현하지 않는다.**

## 3. 실물 AI 검사와 독립 Replay

- S01~S08: 직접 확보·촬영한 육각너트 시편.
- S03 정상과 깊은 스크래치 비교(별도 실물 실험): `35534252` PASS / `52572132` REVIEW_REQUIRED.
- S05 Supplier/Buyer **동일 기록에 대한 Windows 로컬 실제 재추론**: 각각 `36302902`, `37078381`로 원래 점수와 일치(동일 runtime의 정수값 오차 0).
- FRONT/SIDE 사진은 촬영·무결성 evidence; 현 Model B의 AI 점수 입력은 **TOP 뷰**.
- S03 스크래치 비교는 S05의 실제 Sepolia 정상 거래의 Buyer REVIEW라고 표시하지 않는다.

모델 가중치 및 원본 사진은 공용 GitHub에 일괄 업로드하지 않았다. 별도 아티팩트의 체크섬과 사용 조건을 확인해 공유해야 한다.

## 4. 공개 가능한 측정치와 운영비 검증

2026-10-30 발표 초안에는 정상 Sepolia 거래의 **12 TX 가스비 합계 약 0.00770 Sepolia ETH**가 기록되어 있다. 이는 테스트넷에서의 관측 결과로, 실제 서비스의 거래당 상용 운영비나 절감률로 환산하지 않는다. 파일럿에서는 배포·거래 단계별 가스/수수료, 처리시간과 분쟁 비용을 별도로 측정해야 한다.

## 5. 구분해야 할 네 가지 증거

| 검증 묶음 | 실제 환경 | 확보 결과 |
|---|---|---|
| PATCH2 / Model A | **Sepolia** | 공개 MVTec 기반 PASS→REVIEW, Primary timeout→Backup Replay→Buyer REFUND/Withdraw, 0.005 ETH |
| PATCH3 / Model B S05 | **Sepolia** | 정상 PASS→PASS 거래의 RELEASE/Withdraw, 0.001 ETH, 발표자료 12 성공 TX |
| PATCH3 Model B 분쟁·보류 | **Local Anvil / 통제된 Replay** | 분쟁, HOLD, 재현 불일치, 예외 종료 및 차단 검증 |
| PATCH3 신규 REVIEW 후보 | **Sepolia 후보·정책 초안** | `PROPOSED(1)` 기록; 분쟁부터 출금까지 완주한 거래 아님 |

PATCH2 실제 거래는 [기존 E2E 기록](../packages/phase3b_20261010/results/FINAL_SEPOLIA_E2E_20261011.json)에서 확인 가능하며, PATCH3의 기존 별도 funded 거래는 [2026-10-27 증거 기록](../packages/phase3c_hardening_20261023/results/PATCH3_FUNDED_ONCHAIN_EVIDENCE_20261027.md)을 참조한다.

### 기록의 출처 및 시점

이 문서는 2026-10-31 기준 팀의 로컬 배포 manifest, 2026-10-30 통합 E2E/Red-Team 보고서, 실물 Replay 결과 JSON, 최종 발표 초안의 Sepolia TX 표를 대조해 작성한 공개 기술 요약이다. 공개 GitHub 반영 과정에서 신규 Sepolia 거래를 발생시키거나 전체 실험을 재실행하지 않았다.
