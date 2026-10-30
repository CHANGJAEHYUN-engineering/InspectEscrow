# InspectEscrow — 시스템 아키텍처와 역할별 실행

## 프로젝트가 해결하는 문제

Supplier가 출하검사에서 PASS, Buyer가 입고검사에서 REVIEW를 얻었을 때, 두 검사결과를 단순 비교해서 어느 당사자에게 대금을 돌려줄지 결정할 수 없다. 양측이 합의한 모델과 촬영조건, 제출된 이미지, 서명자와 검토자의 권한을 동일한 거래에 연결해야 한다.

## 다섯 계층

| 계층 | 입력·역할 | 연결되는 산출물 |
|---|---|---|
| **Physical** | 너트 시편, TOP/FRONT/SIDE 이미지, 촬영조건 | 원본 이미지, 제품 ID, 촬영 manifest |
| **AI** | PatchCore 검사, 고정된 전처리·Model Bundle·threshold | anomaly score, heatmap, PASS/REVIEW 판단 입력 |
| **Evidence** | 원본 SHA-256, canonical metadata, 증거 hash, EIP-712 Station 서명 | `evidencePackageHash`, 원본 검증 기록 |
| **Trust** | Wallet/MetaMask, PATCH3 Escrow·CredentialRegistry | 역할·nonce·deadline·정책·상태 검증 |
| **Economic** | Buyer escrow, Inspector 판단·예외 절차 | RELEASE/REFUND, `claimable`, `withdraw()` |

## 일반 거래

```text
Trade proposed
→ Supplier/Buyer policy acceptance
→ Inspector assignment acceptance
→ Buyer fund
→ Supplier activate & submit AI inspection
→ Buyer submit AI inspection
      ├─ PASS + PASS → acceptance → RELEASE → Supplier withdraw
      └─ PASS + REVIEW → dispute → Independent Replay
                                     ├─ CONSISTENT → Inspector decision
                                     └─ INCONSISTENT → EXECUTION_HOLD
                                                  → mutual resolution / arbitration / fallback
→ claimable → recipient withdraw
```

- 검사점수와 임계값의 정수화 규칙은 거래의 frozen policy 및 실제 배포 계약에 바인딩한다.
- Replay가 CONSISTENT라는 사실만으로 Supplier나 Buyer의 책임을 확정하지 않는다. 별도 Inspector Decision이 경제적 결과를 정한다.
- Station Credential Authority는 신규 서명의 유효성에 영향을 줄 수 있지만, 에스크로 수령자를 임의 지정하거나 자금을 직접 인출할 수 없다.
- 이미지 해시는 촬영 **이후 파일 변경 여부**를 검증한다. 실제 물리제품의 진위, 출하→입고 물류 책임은 별도의 운영·증거관리 문제다.

## 실제 배포 및 검증 경계

1. **PATCH2 / Model A**: 공개 MVTec 데이터, Sepolia 분쟁·Buyer 환급/Withdraw 완료.
2. **PATCH3 / Model B S05**: 직접 촬영한 너트, Sepolia 정상 거래·Supplier Withdraw 완료.
3. **PATCH3 Model B 분쟁·HOLD/예외**: Local Anvil 및 Windows 실제 Replay 검증. 실제 Sepolia 실물 분쟁 완주와 구분.

[배포 및 Model B 근거](PATCH3_SEPOLIA_AND_MODEL_B_20261031_KO.md) · [PATCH3 계약](../packages/phase3c_hardening_20261023/contracts/) · [보안 검증](SECURITY_VALIDATION_MATRIX_20261031_KO.md)

## 공개 코드 현황

공개 `main`은 PATCH3 기술 소스와 검증 기록을 포함하지만, 통합 Model B 웹사이트 2A~2F의 최종 코드 패키지는 아직 미반영이다. 현재 루트 인터랙티브 페이지는 초기 시뮬레이션이다.
