# InspectEscrow 최종 제출 품질 점검

_2026-11-06 기준 · 공개 프로토타입 / 소스 일치성 / 기능 및 용어_

## 구현·제출 현황

**배포 중인 웹의 실제 소스를 `deploy/cloud-web/`, 별도 Model B 서버 소스를 `deploy/modelb-cloud/`에 반영했습니다.** 이전 2026-10-31 Windows 웹은 자료 보존 목적으로 남겨두고 제출 시 진입점은 반드시 최신 `deploy/` 경로로 안내합니다.

| 영역 | 확인된 사실 | 판정 |
|---|---|---|
| 통합 웹 | Railway 성공 배포 `ed39d2d2-0e87-4d2f-9f7e-1e88c0bdc380`, Online | PASS |
| Model B AI | 별도 Railway 성공 배포 `9b2f3d1f-f880-4408-9124-53a7d6684a1c`, Online | PASS |
| 코드 동기화 | 최신 노트북 원본을 GitHub 제출용 `deploy/`에 복사 | 반영 |
| 공개 웹 클라이언트 자산 | HTML/JS/CSS 6개 SHA-256까지 같음 | PASS |
| 소스 구문·의존성 | Node 34개 구문 PASS, Python 2개 컴파일 PASS, `npm ci` PASS | PASS |
| 웹 API 읽기 전용 검사 | 실제 완료 거래 `RELEASED(17)` 및 상태 조회 등 10/10 | PASS |
| 6메뉴·7역할 화면 | 로그인 없는 외부 브라우저 진입·역할 선택 확인 | PASS |
| 원본 Evidence 저장 | 이번 완료 거래의 양측 Evidence JSON을 저장하지 않아 독립 재현 자료 부족 | 개선 필요 |
| 완전 재배포 | 개발 노트북에 Docker CLI 없음 / 비공개 Model B ZIP 미공급 | **미검증** |
| 기존 자동 브라우저 테스트 | 닫힌 거래에 HOLD 상태를 요구하는 구식 Fixture, 헤더에 가려지는 자동 클릭 | 테스트 갱신 필요 |

최종 증거 목록은 [소스 동기화 확인서](SOURCE_SYNC_VERIFIED_20261106_KO.md)와 [12TX 색인](SEPOLIA_12TX_E2E_20261106.json)을 참고하세요.

## 용어·문장 통일

| 부정확한 표현 | 운영진 제출용 문구 |
|---|---|
| AI가 불량 확정 | AI 정책 임계값 초과 → **REVIEW_REQUIRED(검토 필요)** |
| AI가 대금을 판결 | 계약 정책과 검증된 참여자 합의/Inspector 결정을 기반으로 대금 귀속 처리 |
| Replay CONSISTENT = Buyer/Supplier 점수 동일 | 각 제출 결과가 **동일 원본·모델·조건으로 재현 가능** |
| +1 변조로 Sepolia HOLD 자동 실행 | **오프체인 +1 조작 탐지**와 **Sepolia 통제된 HOLD 예외 검증**은 서로 다른 실험 |
| 실제 ETH 수익 | Sepolia **테스트 ETH**의 예치·인출 |
| 모든 Red-Team 온체인 검증 | Local Anvil **36/36 PASS**, 별도 Sepolia 12건 TX |
| Station가 거래 수행 | **Station은 검사 Evidence EIP-712 서명**, **Actor는 계약 TX 실행** |
| 정산 완료 = 이체 완료 | `SettlementCredited → claimable → withdraw()` |
| 블록체인으로 동일 제품 확정 | 이미지 파일의 무결성과 계약 실행 검증, 물리적 실물 동일성은 미보증 |
| 완전 무결/법적 중재 자동화 | 실증 수준의 보안·예외 처리 PoC. 법적 구속력과 생산 현장 운영 별도 검토 |

## 반영된 최신 기능

- 역할 기반 6메뉴 웹, 7역할, MetaMask 연결·오류 안내, EIP-6963 대응
- 자체 서버에서 실제 Model B TOP 검사, TOP/FRONT/SIDE 증거 구성·해시 검증
- Station EIP-712 검사 증거 서명과 Actor의 별도 Sepolia 제출
- 분쟁·Inspector·Backup·HOLD·상호 합의·claimable·withdraw
- **서로 다른 PC의 Buyer와 Supplier가 동일한 EIP-712 메시지에 각자 서명**, Buyer 서명값만 전달해 합의 정산
- **동일 TOP 2회 실제 Model B 추론 → unsigned 주장 점수 +1 비교 → INCONSISTENT**, TX 0
- AI 동시 추론 제한·공개 요청 rate limit·Origin 방어, 브라우저 스크린샷 기반 실행 증거

## 실제 결과의 경계

1. 신규 거래: Supplier PASS(36.302929), Buyer REVIEW(51.506557) → 분쟁 → **통제된 음성 Replay 기록**으로 EXECUTION_HOLD → 서로 다른 PC의 양측 Actor가 상호 합의 → 공급자 지급 → 0.001 Sepolia ETH 인출.
2. 별도 +1 점수 실험: 실제 Model B 2회 점수 36,185,043, 조작된 **비서명 비교용 점수** 36,185,044. 결과 INCONSISTENT, 온체인 TX 0. 원본 서명된 Evidence를 위조한 결과가 아닙니다.
3. 물리적으로 같은 너트라는 확정, 실제 제조 환경 QMS/MES 연동, 계약의 법적 구속력, 생산 SLA는 검증 범위가 아닙니다.

## 제출 전 마지막 점검

- GitHub `main`에 최신 `deploy/`가 실제 반영됐는지, commit SHA가 제출 링크와 일치하는지 확인
- UI의 원본 JSON 저장 버튼 안내 강화. 이미 종료된 거래를 재현하는 데 필요한 파일 자동 보관을 **보장한다고 표시하지 않기**
- 공개된 웹에서 이미지 생성용 가상 스크린샷이 아닌 **실제 실행 캡처**만 제출
- 첫 TX의 전사 해시는 16진수 한 글자가 부족한 기록이 있으므로 Etherscan 원본과 대조 (임의 수정 금지)
- 브라우저 자동 테스트의 종료 거래 Fixture를 새로 구성하고 헤더 클릭 가림을 실제 PC에서 확인
- Railway 운영 중인 두 서비스를 무단 재시작하거나 예전 GitHub 루트의 정적 앱으로 대체 배포하지 않기
