# InspectEscrow — 운영진 제출용 프로토타입 안내 (2026-11-06)

> **제출 버전:** 최신 Railway 웹과 Model B 클라우드 실행 소스를 GitHub의 `deploy/cloud-web/`, `deploy/modelb-cloud/`에 동기화했습니다. 공개 웹 6개 정적 자산의 SHA-256 일치 및 스모크 테스트를 확인했습니다. 다만 개인 데이터·모델 아티팩트는 제외했고 별도 Docker 재빌드는 미검증입니다. 자세한 검증 기록은 [소스 동기화 확인서](SOURCE_SYNC_VERIFIED_20261106_KO.md)를 참고하세요.

## 1. 프로젝트

**InspectEscrow — AI 제조 품질검사의 신뢰·분쟁 해결을 위한 블록체인 에스크로 시스템**

제조업체 간 품질검사 결과가 다를 때 검사 결과를 거래 대금과 연결하는 절차를 구현한 개념검증(PoC)입니다. 핵심 문제는 **“AI가 불량을 발견했을 때, 누구의 어떤 검증 가능한 증거를 근거로 대금 지급을 결정할 것인가?”**입니다.

- **팀:** 창지환
- **프로토타입:** https://inspectescrow-integrated-web-production.up.railway.app/
- **GitHub:** https://github.com/CHANGJAEHYUN-engineering/InspectEscrow
- **실증 네트워크:** Ethereum Sepolia Testnet (chain ID 11155111)
- **PATCH3 에스크로 컨트랙트:** [0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905](https://sepolia.etherscan.io/address/0x0a4721CF41Ad3f7a9EC9C73049D2db73B905)
- **AI:** 직접 촬영한 실물 너트 TOP 이미지를 사용하는 PatchCore 기반 Model B. FRONT/SIDE는 증거의 무결성 정보로 사용하며 Model B 추론 입력은 TOP입니다.
- **사용자 인터페이스:** 역할 기반 통합 웹, MetaMask, 원본 해시·Station EIP-712 증거 서명·거래 처리·분쟁·정산·출금.

## 2. 운영진이 바로 확인할 경로

| 시연 목적 | 링크 | 증거 범위 |
|---|---|---|
| 통합 프로토타입 | [메인 페이지](https://inspectescrow-integrated-web-production.up.railway.app/) | 역할별 메뉴·거래·검사·분쟁·정산 |
| 완료된 신규 거래 | [거래 상세](https://inspectescrow-integrated-web-production.up.railway.app/trades?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff) | Sepolia 12TX, 거래 종료 RELEASED |
| AI 점수 조작 탐지 | [분쟁 해결 / Replay](https://inspectescrow-integrated-web-production.up.railway.app/replay?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff) | 실제 Model B 2회 추론 및 비서명 +1 조작 비교 |
| 정산·출금 확인 | [정산 화면](https://inspectescrow-integrated-web-production.up.railway.app/resolution?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff) | 상호 해결, RELEASED, Supplier 출금 |
| 트랜잭션 증거 | [12TX 인덱스](SEPOLIA_12TX_E2E_20261106.json) | 트랜잭션 해시와 검증 경계 |

**운영 주의:** 읽기 전용 기록 확인에는 MetaMask가 필수는 아니지만 새 트랜잭션 실행에는 해당 역할 지갑·Sepolia 가스가 필요합니다. 발표용 원본 너트 사진과 체크포인트는 별도 관리되며 개인키·시드·비밀 토큰은 공유하지 않습니다. 화면은 실제 운영 장비에 설치하는 제품이 아니라 테스트넷 기반 PoC입니다.

## 3. 최신 실증 결과

### A. 실물 AI 검사 충돌 → 분쟁 → 통제 HOLD → 합의 정산 → 출금

2026-11-06 신규 거래 `0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff`에서 **12개 Sepolia 트랜잭션**으로 다음을 완료했습니다.

1. Supplier·Buyer 정책 수락 및 Primary/Backup/External 역할 수락
2. Buyer **0.001 테스트 ETH 예치**, 거래 활성화
3. Supplier Model B AI 검사 **PASS**, scaled score **36,302,929**
4. Buyer Model B AI 검사 **REVIEW_REQUIRED**, scaled score **51,506,557**
5. 검사 충돌로 **DISPUTED_PRIMARY(12)** 진입
6. **통제된 불일치 Replay 기록**으로 **EXECUTION_HOLD(14)** 전환
7. 서로 다른 PC의 **Supplier Actor·Buyer Actor가 동일한 EIP-712 상호 해결 메시지에 각자 서명**
8. `mutualResolve()`로 **공급자 지급 합의 → RELEASED(17)**
9. `withdraw()` 성공, Supplier 테스트 지갑으로 **0.001 테스트 ETH 인출**
10. 해당 거래 정산 후 Supplier/Buyer `claimable=0`, 회계 보존·부채 충당 확인

**중요:** 6번 HOLD는 **실제 독립 Model B 원본 Replay의 불일치 결과가 아니라, 불일치 값을 명시적으로 지정한 통제 음성 테스트**입니다. 실제 독립 Replay에 필요한 당시 양측 Evidence JSON을 저장하지 않아 해당 거래의 전체 독립 Replay는 미완료입니다. Inspector의 실제 독립 판정·외부 중재도 이 신규 거래에서 실행했다고 주장하지 않습니다.

### B. 클라우드에서 실제 Model B +1 조작 탐지

- 원본 입력: `S05_normal_repeat2.jpg.jpg` TOP 사진
- 정상 1차 추론 정수 점수: **36,185,043**
- 공격자가 제시한 **비서명 비교용 점수: 36,185,044 (+1)**
- 같은 원본으로 수행한 **실제 Model B 2차 추론: 36,185,043**
- 고정된 비교 허용오차: **0**
- 결과: **INCONSISTENT**, 실제 추론 **2회**, 전송 TX **0**
- 체크포인트 SHA-256: `8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854`
- Report Hash: `0x1b9bb8b666bfcb4d21a3246b3e4c6bec88e688f9c5cdf16f6ca14dc2ed8054ff`

이 데모는 **서명된 온체인 Evidence를 변조한 실험이 아닙니다.** 정상 추론 점수의 **비서명 사본**을 1단위 변경해 실제 재추론과 비교하는 **통제 Red-Team 탐지**입니다. A의 HOLD 기록과 B의 +1 탐지는 서로 다른 증거이므로 연속 실행으로 합치지 않습니다.

### C. 추가 보유 검증

- **Model A / PATCH2:** 공개 MVTec `metal_nut` 기반 Sepolia 분쟁 → Backup Inspector Replay CONSISTENT → Buyer 환급 → Withdraw 경로(기존 검증)
- **Model B / PATCH3 정상 거래:** S05 정상 거래 RELEASED 및 Withdraw(별도 과거 Sepolia 거래)
- **PATCH3 Local Anvil Red-Team:** **36/36 PASS** (서명, 해시, 권한, 상태 전이, timeout, HOLD·Backup·정산 등). 36건 모두 Sepolia 트랜잭션이라고 주장하지 않습니다.

## 4. 설계 개념과 정확한 용어

| 용어 | 정확한 의미 | 피해야 할 표현 |
|---|---|---|
| **AI PASS** | 고정 정책 아래 모델 점수가 정상 검사 기준 충족 | 제품의 물리적 품질을 완전히 보증 |
| **REVIEW_REQUIRED** | 점수가 기준을 넘어 추가 확인이 필요한 상태 | 결함·불량 확정 |
| **Evidence** | 원본 파일 해시, 촬영 뷰, 모델·정책·점수·서명 정보 | 이미지 해시만으로 물리적 동일 제품 보증 |
| **Station** | 검사 증거에 EIP-712 서명하는 검사 주체 | 자금 이체 지갑 |
| **Actor** | 계약 상의 거래·정산 기능을 호출하는 거래 주체 | Station과 동일한 권한 |
| **Replay CONSISTENT** | 보존된 입력·모델·환경에서 점수가 재현됨 | 공급자·구매자 점수가 서로 같음 |
| **Replay INCONSISTENT** | 주장된 점수와 동일 조건 실제 재추론 사이 차이 | 자동으로 사기·범죄 확정 |
| **EXECUTION_HOLD** | 즉시 정산하지 않고 합의/후속 판단을 기다림 | 자동 환급 또는 출금 완료 |
| **Settlement** | 계약 내부의 `claimable` 지급권 확정 | 지갑에 즉시 입금 |
| **Withdraw** | 수령자가 `withdraw()`를 실행해 실제 자금 이체 | 단순한 화면상의 정산 표시 |
| **Sepolia ETH** | 테스트넷 자산 | 실제 ETH 원화 수익 |

## 5. 아키텍처·신뢰 경계

```text
Supplier / Buyer (서로 다른 Actor 지갑)
   └─ 실물 너트 TOP·FRONT·SIDE 촬영
       └─ Model B PatchCore (TOP 실제 추론)
           └─ 원본 해시 / 모델·정책 해시 / Station EIP-712 서명
               └─ Actor의 Sepolia 검사 결과 제출
                   └─ Buyer와 결과 충돌 시 Inspector / Replay
                       └─ 불일치·증거 이슈 시 HOLD
                           └─ 독립 판단 또는 양측 EIP-712 합의
                               └─ claimable 기록 → withdraw()
```

- 실제 웹은 **Railway의 통합 웹 서비스 + 별도 Model B 추론 서비스**로 운영됩니다.
- **컨트랙트의 불변성·서명 검증**과 **물리적 시편 동일성·AI 모델 정확성**은 다른 주장입니다.
- 클라우드 데모의 **모델·정책 일부는 테스트/초안 단계**입니다. 양산 제조 품질 책임, 법적 중재, 개인정보 규제 준수, SLA 등은 검증 범위 밖입니다.
- 테스트넷 가스비와 실제 L1 운영 비용은 다르며, 시험용 예치 0.001 ETH 대비 관측된 가스비가 커서 운영 전 L2/롤업·배치·오프체인 증거 비용을 검토해야 합니다.
- 일부 증거 데이터는 브라우저 임시 저장이며 **자동 영구 보관을 보장하지 않습니다.** 사용자 데이터 보관·복구·분산 저장은 상용화 과제입니다.

## 6. 소스코드·재현성 현황

**2026-11-06 현재 웹·Model B 배포 소스를 별도 `deploy/` 경로에 동기화하고 공개 웹 자산 일치성을 검증했습니다.**

기존 10월 31일 Windows 웹 소스는 기록용으로 유지하고, 신규 `deploy/cloud-web/`에는 실제 Railway 클라우드 게이트웨이, 6메뉴 통합 웹, 개선된 지갑 연결, 원격 상호 해결 EIP-712 서명 및 실제 Model B +1 Replay를 포함했습니다. `deploy/modelb-cloud/`에는 별도 AI 추론 서버가 있습니다. Docker 실행을 위한 모델 가중치는 GitHub에 포함되지 않아 팀이 별도로 제공해야 합니다. 실제 검증 항목과 미완료 항목은 [소스 동기화 확인서](SOURCE_SYNC_VERIFIED_20261106_KO.md)에 구분했습니다.

- [코드·배포 버전 대조 및 보완 목록](FINAL_RELEASE_PARITY_20261106_KO.md)
- [운영진 시연 안내](ORGANIZER_DEMO_GUIDE_20261106_KO.md)
- [공개 Sepolia 거래 결과 JSON](SEPOLIA_12TX_E2E_20261106.json)

**최종 주의:** 운영진은 공개된 GitHub 코드와 웹 프로토타입이 같은 버전인지 확인할 수 있습니다. 동일 버전 소스 반영 전에는 GitHub 코드를 11월 6일 클라우드 웹의 완전한 재배포 패키지로 설명하지 않습니다.
