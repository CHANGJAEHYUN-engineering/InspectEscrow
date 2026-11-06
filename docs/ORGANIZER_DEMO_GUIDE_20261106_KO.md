# 운영진·심사위원용 InspectEscrow 프로토타입 확인 안내
_2026-11-06 최종 웹 배포 기준 · 읽기 2~3분_

## 접속

**실행 URL:** https://inspectescrow-integrated-web-production.up.railway.app/

이 사이트는 사용자의 브라우저에서 역할과 거래 상태를 조회하며, 실제 블록체인 상의 기록을 확인할 수 있는 제조 품질검사·분쟁·에스크로 PoC입니다. 읽기 전용 확인을 위해 개인키·MetaMask 시드 공유가 필요하지 않습니다.

**네트워크:** Ethereum Sepolia (11155111), **테스트용 자산만 사용**.

## 실증 사례를 보는 순서

### 01. Sepolia 실거래의 검사 충돌·대금 정산

[12건 TX가 연결된 신규 거래 열기](https://inspectescrow-integrated-web-production.up.railway.app/trades?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff)

1. **거래 관리**에서 거래 ID와 최종 상태 `RELEASED (17)` 확인.
2. **AI 품질검사** 또는 **검증·감사 기록**에서 Supplier PASS(36.302929), Buyer REVIEW(51.506557) 기록 확인.
3. 분쟁 기록: `DISPUTED_PRIMARY (12)` → **통제된** `ReplayResultRecorded` → `EXECUTION_HOLD (14)`.
4. [정산·출금 화면](https://inspectescrow-integrated-web-production.up.railway.app/resolution?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff)에서 양측의 EIP-712 상호 합의 정산 결과와 Supplier의 0.001 Sepolia ETH 출금 확인.
5. 별도 [Etherscan 영수증](https://sepolia.etherscan.io/tx/0x1b8956a1394f389a0644c3c5d53ed0bd166daf92943257ee3c256555c9bc98b1)을 통해 최종 `Withdrawal` 이벤트 확인.

※ 거래 생성 및 정책 수락 등 12개 트랜잭션의 전체 목록은 [증거 인덱스 JSON](SEPOLIA_12TX_E2E_20261106.json)에 있습니다. 신규 거래의 결과는 **양측 상호 합의에 따른 Supplier 지급**이며, Inspector가 원본 Replay 후 독립적으로 대금 귀속을 결정한 결과라고 설명하지 않습니다.

### 02. 실제 Model B +1 점수 조작 탐지

[Replay 화면 열기](https://inspectescrow-integrated-web-production.up.railway.app/replay?tradeId=0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff)

- 섹션 이름: **「시나리오 02 · AI 점수 +1 조작 탐지」**
- 동일한 실물 S05 TOP 원본 이미지 `S05_normal_repeat2.jpg.jpg`로 Model B를 실제로 두 번 추론합니다.
- 첫 추론: **36,185,043**
- 비교용 점수: **36,185,044** (`+1` 임의 변경, 비서명)
- 두 번째 실제 Replay: **36,185,043**
- 비교 허용오차 0, 결과 **INCONSISTENT**, 새로운 Sepolia TX 0.

사용자가 동작을 재현하려면 TOP 원본 이미지 파일을 별도로 준비해야 합니다. README의 GitHub 코드만으로 동일 실물 원본을 다운로드할 수 없으며 공개 웹에서 임의 사진을 대체하면 점수가 바뀔 수 있습니다.

**검증 경계:** 이 테스트는 진짜 PatchCore 추론 2회의 비교입니다. 다만 +1은 무결한 EIP-712 온체인 검사 결과가 아니라 **unsigned 비교 주장**이며, 이 화면에서 신규 온체인 HOLD 트랜잭션을 전송하지 않습니다.

## 40초 발표 설명 예시

> “InspectEscrow는 AI 검사 결과가 기업 간 거래와 대금 정산의 근거로 사용될 때 생기는 분쟁을 해결하기 위한 프로토타입입니다. 실제 Sepolia에서 공급자는 PASS, 구매자는 REVIEW 판정을 제출했고 거래는 분쟁 상태로 전환됐습니다. 통제된 불일치 예외 시험에서는 즉시 정산하지 않고 HOLD 상태에 진입했습니다. 이후 서로 다른 PC의 공급자와 구매자가 동일한 EIP-712 메시지에 서명해 상호 합의 정산하고, 공급자가 테스트 ETH를 실제 출금했습니다. 별도의 클라우드 Replay 실험에서는 AI 점수를 1만큼 바꾼 비교값이 원본 재추론 점수와 일치하지 않는 것을 확인했습니다.”

## 실증 환경 구분

| 환경 | 확인 사항 |
|---|---|
| **실제 Sepolia** | 정책 수락, 역할 수락, 예치, 실물 AI 검사 제출, 분쟁, 통제 HOLD, 상호 합의, 정산, Withdraw |
| **실제 클라우드 Model B** | 동일 TOP 2회 AI 추론·+1 비서명 비교점수 조작 탐지 |
| **Windows/Local Anvil** | 실물 촬영 및 다양한 Red-Team/역할/서명 테스트 |
| **기존 PATCH2 Model A Sepolia** | Primary timeout → Backup Replay CONSISTENT → Buyer 환급 사례 |

## 용어·해석

- PASS/REVIEW: AI의 정책 기준 판정입니다. 결함의 물리적 증명은 아닙니다.
- Replay CONSISTENT: 제출된 점수가 원본·동일 모델·고정 실행조건으로 재현된다는 뜻입니다. Supplier와 Buyer의 서로 다른 결과가 동일해지는 것을 뜻하지 않습니다.
- HOLD: 자동 지급 또는 자동 환급이 아니라 후속 합의/판정 전 **정산 보류**입니다.
- claimable → withdraw: 수령권 확정과 지갑 이체는 별도 트랜잭션입니다.
- 0.001 Sepolia ETH: 테스트넷에서 사용한 거래 예치금으로 실거래 매출이 아닙니다.
- README/GitHub: 11월 6일 실제 클라우드 배포 소스와의 **버전 동기화가 진행되어야 하는 상태**입니다. [최신 코드 점검 문서](FINAL_RELEASE_PARITY_20261106_KO.md)

## 주의사항

- 12건의 TX 재실행은 필요하지 않습니다. 이미 종료된 거래는 **읽기 전용**으로 확인하세요.
- 영수증의 `event`, `block`, `contract`, `tradeId`는 모두 원본 트랜잭션으로 확인할 수 있습니다.
- 서버는 비밀번호 없는 공개 데모로 구성되어 있어 URL 열람 가능성을 전제로 합니다. 실제 고객·제품·지갑 비밀키를 업로드하지 않습니다.
- 디지털 이미지 무결성 검증만으로 동일 실물 너트임을 입증할 수 없고, 양산 정책·보안 운영·법적 중재는 후속 과제입니다.
