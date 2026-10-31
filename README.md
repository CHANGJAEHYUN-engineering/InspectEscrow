# InspectEscrow

## 2026-10-31 FINAL WEB RELEASE V2

**Latest integrated web application source is now included in this repository.**
The top-level `index.html` remains the **earlier conceptual demo**, not the final role-based Windows application.

- [Integrated Windows UI and API code](.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/)
- [Dynamic Trade ID P0](.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/dynamic-trade-context.cjs)
- [Final release results and reproducibility notes](docs/FINAL_WEB_RELEASE_V2_20261031_KO.md)
- [Model B inference server source](modelb/)
- [Windows installation guidance](.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/INSTALL_WINDOWS_KO.md)

**Scope:** Final Web Release V2 was verified on the development Windows machine and from a separately extracted release ZIP. The portable ZIP (153,387,537 bytes; SHA-256 `B52D02F6AC8A51BFE3267B6562E0A4F4B50293B54A5A77B8579A76D984378C18`) is a private teammate handoff. The repository intentionally excludes model archives, original nut photos, private evidence bundles and credentials, so live Model B inference requires separately provisioned artifacts. Independent installation on the teammate's PC remains unverified. No new Sepolia transactions were sent for this release.


**AI 제조 품질검사의 신뢰·분쟁 해결을 위한 블록체인 에스크로 시스템**  
2026 AI × Blockchain Hackathon · Track 4 · 팀 창지환

> AI가 불량을 발견하면, 대금은 누가 결정할까?

InspectEscrow는 공급기업(Supplier)의 출하검사와 구매기업(Buyer)의 입고검사가 서로 다른 결과를 보일 때, 검사 근거를 검증하고 합의된 절차에 따라 대금을 지급하거나 환급하도록 연결하는 제조 B2B PoC입니다. 실제 이미지의 AI 검사, 원본·정책·모델의 증거 결합, Station 서명, 독립 Replay, 스마트컨트랙트 에스크로를 결합했습니다.

## 주요 실증 결과

| 검증 시나리오 | 환경 | 확인된 결과 |
|---|---|---|
| **Model A / PATCH2 분쟁 처리** | **Ethereum Sepolia** | 공개 MVTec `metal_nut` 기반 Supplier PASS → Buyer REVIEW → Primary timeout → Backup Replay → Inspector Buyer 환급 → **0.005 ETH Withdraw** |
| **Model B / PATCH3 정상 거래** | **Ethereum Sepolia** | 직접 촬영한 너트 S05의 Supplier/Buyer PASS → 정상 인수 → Supplier 정산 및 **0.001 ETH Withdraw**. 2026-10-29 실행 기록: **12건 성공 TX** |
| **Model B 실물 AI 검사** | Windows local | S01~S08 실물 너트 촬영, PatchCore 추론. S03 정상/스크래치 비교, S05 재추론 기록 |
| **PATCH3 공격·예외 처리** | **Local Anvil** | Red-Team **36/36 PASS**. 재현 불일치 HOLD, 자격·서명·역할·기한 검증, 중재 및 종료 경로 |
| **독립 Model B Replay** | Windows local | S05 Supplier `36302902`, Buyer `37078381` 재추론 정수 점수 일치, 동일 실행환경의 Replay **20/20 PASS** |

**검증 범위:** Model A는 Sepolia 분쟁·환급 완료, Model B의 Sepolia 실증은 S05 정상 거래·출금 완료입니다. Model B의 분쟁/HOLD·중재 예외 흐름은 로컬에서 확인했으며, 이를 Model B 실물 분쟁의 Sepolia 전체 완주라고 표현하지 않습니다.

## 전체 아키텍처

```text
Supplier / Buyer / Inspector
           │
           ▼
Physical   실물 제품 · TOP/FRONT/SIDE 촬영 · 제품 식별
           │
AI         PatchCore · anomaly score · threshold · heatmap
           │
Evidence   원본 해시 · Model Bundle · Policy · Station EIP-712 서명
           │
Trust      MetaMask / Web3 → Sepolia
           │             ├─ CredentialRegistryPatch3
           │             └─ InspectEscrowPatch3
           ▼
Economic   거래 조건 합의 → 예치 → 검사 → 분쟁·Replay
           → Inspector 판단 / 예외 종료 → claimable → withdraw()
```

- **사전합의:** `policyHash`, `modelBundleHash`, `captureProfileHash`, `productSpecHash`, `requiredViewSetHash` 및 `thresholdScaled` 고정
- **증거 연결:** 원본 이미지와 검사 결과의 hash 및 EIP-712 Station 서명 검증
- **역할 분리:** Actor 지갑과 Station 서명자, Primary/Backup Inspector, 외부 중재자 구분
- **검사 판단:** 계약이 등록된 점수와 임계값을 비교하여 PASS/REVIEW 분기
- **분쟁 처리:** Independent Replay는 실행 일관성을 확인하고 Inspector는 정산 방향을 별도 판단
- **정산:** 자금 수령 권리를 `claimable`에 기록한 뒤 수령자가 `withdraw()` 실행

[시스템 아키텍처](docs/architecture.md) · [PATCH3 보안·종료 규칙](docs/PATCH3_SECURITY_AND_LIVENESS_KO.md) · [PATCH3 Solidity CI](https://github.com/CHANGJAEHYUN-engineering/InspectEscrow/actions/runs/41096637460) · [Slither 정적 분석](https://github.com/CHANGJAEHYUN-engineering/InspectEscrow/actions/runs/41096816045)

## 검증된 Sepolia 배포

| 계약 | 주소 |
|---|---|
| PATCH2 Escrow / Model A 분쟁 | [`0x270e3E8a…42fFa9`](https://sepolia.etherscan.io/address/0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9) |
| PATCH3 Escrow / Model B 정상 | [`0x0a4721CF…73B905`](https://sepolia.etherscan.io/address/0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905) |
| PATCH3 Credential Registry | [`0xc715A026…fd20e`](https://sepolia.etherscan.io/address/0xc715A0263B752c9D0Be99379b7939466Af5fd20e) |

- PATCH2 완료 거래: `0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c`
- PATCH3 Model B S05 정상 거래: `0x2e1e7f88734dc4bf2b1fee924192a11311846a4351b86497d5c43670fa173d9e`
- PATCH3 별도 과거 보호 거래: `0x8e07587390de665a8a3c0fe81e1e7298541847acd244db5ea98e5dc3acb3f9db` — `FUNDED`, 정상 거래 완료로 합산하지 않음

[배포 및 Model B 실증 세부 기록](docs/PATCH3_SEPOLIA_AND_MODEL_B_20261031_KO.md) · [전체 증거 색인](docs/FINAL_EVIDENCE_INDEX.md)

## 공개 저장소 구조

| 위치 | 내용 |
|---|---|
| `packages/ai_20261010/` | PATCH2 모델 A AI 추론·정책·증거 및 재현성 자료 |
| `packages/phase3b_20261010/` | PATCH2 Web3·Solidity 코드 및 10월 11일 실제 Sepolia 분쟁 E2E |
| `packages/phase3c_hardening_20261023/` | **PATCH3 Solidity 계약**, 정책 생성·배포·검증 스크립트, Red-Team 테스트 |
| `packages/physical_capture_v1/` | 촬영 프로토콜 관련 기술 자료 |
| `docs/` | 아키텍처, 배포 이력, 테스트·보안 설계, 검증 범위, 출처 및 라이선스 |
| `index.html` / `app.js` | **예선 당시 정적 인터랙티브 시뮬레이션**. 최종 통합 웹사이트의 실행 파일이 아님 |


## 기술 문서

- [프로젝트 아키텍처 및 역할별 흐름](docs/architecture.md)
- [구현·배포·검증 상태표](docs/implementation-status.md)
- [Sepolia 배포 및 Model B 결과](docs/PATCH3_SEPOLIA_AND_MODEL_B_20261031_KO.md)
- [보안·회귀 검증 매트릭스](docs/SECURITY_VALIDATION_MATRIX_20261031_KO.md)
- [PATCH3 안전성 및 종료 규칙](docs/PATCH3_SECURITY_AND_LIVENESS_KO.md)
- [신뢰 가정과 권한 경계](docs/PATCH3_TRUST_ASSUMPTION_REGISTER_KO.md)
- [원본 촬영·증거 관리 프로토콜](docs/PHYSICAL_CAPTURE_PROTOCOL_V1_KO.md)
- [PATCH2 Sepolia 원본 E2E JSON](packages/phase3b_20261010/results/FINAL_SEPOLIA_E2E_20261011.json)
- [참고자료·라이선스](docs/references.md)

## 적용과 확장

우선 적용 대상은 품질 검사결과 불일치가 실제 정산 지연이나 분쟁 비용으로 이어지는 정밀 부품 공급망입니다. 기존 MES/QMS를 대체하기보다 검사·증거·정산 연결 계층으로 연동하는 방향을 검토합니다. 현장 도입에는 제품 ID, 촬영 표준화, 증거 보존, Inspector 거버넌스, 운영비·가스비 검증이 필요합니다.

**데이터 사용 및 보안:** 공개 MVTec 데이터의 라이선스 조건을 준수하고, 별도 Model B 모델 가중치·원본 사진·민감한 서명 자료와 개인키·시드·토큰을 공개 저장소에 올리지 않습니다. 블록체인 기록의 무결성과 제품 자체의 물리적 진실성은 구분합니다.
