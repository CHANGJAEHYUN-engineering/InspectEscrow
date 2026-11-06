# InspectEscrow

**AI 제조 품질검사의 신뢰·분쟁 해결을 위한 블록체인 에스크로 PoC**  
2026 AI × Blockchain Hackathon · Track 4 · 창지환 팀

> **AI가 불량을 발견했을 때, 누구의 어떤 증거를 근거로 거래 대금을 지급할 것인가?**

## 실제 운영 중인 프로토타입 — 2026-11-06

**[InspectEscrow 통합 웹사이트 바로가기](https://inspectescrow-integrated-web-production.up.railway.app/)**

실물 너트 AI 검사(모델 B), 원본·정책·검사 증거, EIP-712 역할별 서명, Sepolia 에스크로, 분쟁·Replay, 당사자 상호 합의, 정산 및 Withdraw를 연결한 **테스트넷 기반 제조 B2B 프로토타입**입니다. 역할별 통합 웹 화면과 별도의 클라우드 Model B 추론 서버로 운영됩니다.

**중요한 소스 버전 공지:** 이 저장소의 기존 소스는 **2026-10-31 Windows Web Release V2** 기준입니다. **2026-11-06 클라우드에 배포된 최신 코드와의 완전 동기화는 아직 확인되지 않았습니다.** 운영진은 웹 프로토타입을 바로 사용할 수 있지만, GitHub 코드만으로 동일한 최신 클라우드 앱을 재빌드·배포할 수 있다고 주장하지 않습니다. [소스 불일치 및 보완 계획](docs/FINAL_RELEASE_PARITY_20261106_KO.md)을 참고하세요.

### 운영진 제출 자료

- **[운영진용 제출 안내 / 최신 구현·검증 범위](docs/FINAL_SUBMISSION_20261106_KO.md)**
- **[실제 웹 사용·시연 가이드](docs/ORGANIZER_DEMO_GUIDE_20261106_KO.md)**
- **[Sepolia 신규 거래 12건 TX 및 결과 JSON](docs/SEPOLIA_12TX_E2E_20261106.json)**
- **[최종 코드 동기화·UI·보안 점검표](docs/FINAL_RELEASE_PARITY_20261106_KO.md)**
- **[최신 Railway 배포 매니페스트](docs/DEPLOYMENT_MANIFEST_20261106.json)**
- **[GitHub·배포 소스 일치성 검사 스크립트](scripts/final_submission_source_parity.mjs)**
- [2026-10-31 과거 README 원문](docs/README_20261031_ARCHIVE.md)

### 확인된 주요 실증

| 시나리오 | 실제 실행 환경 | 확인 결과 |
|---|---|---|
| 실물 Model B 검사 충돌 및 정산 | **Ethereum Sepolia** | Supplier PASS(36.302929) → Buyer REVIEW(51.506557) → DISPUTED_PRIMARY → **통제 Replay 불일치/EXECUTION_HOLD** → 양측 EIP-712 상호 합의 → RELEASED → Supplier 0.001 Sepolia ETH Withdraw. **12TX** |
| 실물 Model B 점수 +1 조작 탐지 | **실제 클라우드 추론 / 오프체인** | 원본 TOP 2회 추론 **36,185,043 → 36,185,043**, 비교용 **비서명 점수만 36,185,044로 +1 조작**, 허용오차 0에서 **INCONSISTENT**, 신규 TX 0 |
| 정상 거래 / Model B | Sepolia | S05 정상 거래 정산·Withdraw (이전 별도 거래) |
| 기존 분쟁 환급 / Model A PATCH2 | Sepolia | Primary timeout → Backup Replay CONSISTENT → Buyer 환급·Withdraw |
| PATCH3 Red-Team | Local Anvil | **36/36 PASS** · 역할·서명·정책·기한·예외·회계 등 |

**검증 범위 주의:** 위 신규 Sepolia 거래의 HOLD는 **실제 Model B 독립 원본 Replay가 검출한 불일치 결과가 아니라 통제된 음성 테스트 기록**입니다. 실제 Model B +1 점수 탐지는 **오프체인에서 unsigned 비교 점수만 변경한 별도 실험**입니다. 두 시나리오를 하나의 자동 온체인 조작 탐지 실행처럼 제시하지 않습니다.

### 바로 확인하기

- **[완료된 실증 거래](https://inspectescrow-integrated-web-production.up.railway.app/trades?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff)** — `RELEASED(17)`, 12TX 진행 이력
- **[Model B +1 Replay](https://inspectescrow-integrated-web-production.up.railway.app/replay?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff)** — 원본 TOP이 필요한 별도 통제 테스트
- **[정산·Withdraw](https://inspectescrow-integrated-web-production.up.railway.app/resolution?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff)** — 합의 정산·Supplier 출금
- **[Sepolia 최종 Withdrawal TX](https://sepolia.etherscan.io/tx/0x1b8956a1394f389a0644c3c5d53ed0bd166daf92943257ee3c256555c9bc98b1)**

### 기술 구성과 역할 분리

```text
실물 제품 촬영 (TOP 추론, FRONT/SIDE 무결성)
   → PatchCore Model B 점수 / 촬영·모델·정책 Hash
   → Station EIP-712 검사 증거 서명
   → Supplier/Buyer Actor Sepolia 제출
   → 분쟁 상태·Replay/Inspector·HOLD
   → 양측 합의 또는 정해진 예외 처리
   → claimable 지급권 확정 → withdraw() 실제 출금
```

**Station**은 검사 증거를 서명하고 **Actor**는 계약의 거래·정산 동작을 실행합니다. **REVIEW_REQUIRED**는 '불량 확정'이 아니라 검토 필요이며, **Replay CONSISTENT**는 양 당사자의 점수가 서로 같다는 뜻이 아니라 *각자의 원본에서 제출 점수가 재현된다*는 의미입니다.

### 공개 코드 구조 (기준: 2026-10-31)

- `packages/phase3c_hardening_20261023/`: PATCH3 Solidity/EIP-712/보안·Red-Team 테스트
- `.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/`: 기존 Windows용 역할 기반 웹 소스
- `modelb/`: Model B 서버 소스(모델 아티팩트는 외부 관리)
- `packages/phase3b_20261010/`: 기존 Model A Sepolia 분쟁 경로
- `docs/`: 아키텍처, 재현성, 정책·보안·실증 기록
- 루트 `index.html`·`app.js`: **예선 당시 정적 콘셉트 화면이며 최종 통합 웹이 아님**

비밀키·토큰·시드·서명 원본·개인/제조 데이터는 공개 저장소에 올리지 않습니다. 모델 재현성을 위한 원본 파일, 모델 가중치, API 설정은 별도의 안전한 제공/검증 절차가 필요합니다. 물리적 시편 동일성·양산 품질·법적 중재 완결은 별도 과제입니다.
