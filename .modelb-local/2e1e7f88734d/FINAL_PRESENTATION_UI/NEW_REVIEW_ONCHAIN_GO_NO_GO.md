# PATCH3 Sepolia 실거래 E2E 점검 (2026-10-30)
현재 새 거래는 PROPOSED(1). 실거래 이행은 아직 7개 역할별 승인/활성화가 남아 있다.
장면 1 AI 추론은 검증됨. 실제 Supplier Station 서명 + Supplier Actor submitInspection, Buyer Station 서명 + Buyer Actor submitInspection은 아직 실행되지 않음.
장면 2 Replay INCONSISTENT -> EXECUTION_HOLD는 로컬 Anvil Red-Team 36 PASS 기록은 있으나 신규 Sepolia Model B 거래 실제 TX로는 미완료.
장면 3 정책 변조 로컬 Anvil 오류는 PASS. 현재 PROPOSED(1)에서는 PolicyHashMismatch 동작의 실제 Sepolia staticCall 조건이 충족되지 않음.

온체인 완결 순서:
1 Supplier 정책 수락 (본인 MetaMask)
2 Buyer 정책 수락 (김지환 MetaMask)
3 Primary, Backup, External Inspector 각 배정 수락 (각 정확한 역할 계정)
4 Buyer 0.001 Sepolia ETH 예치
5 활성화(검사 타임아웃 시작)
6 정상 사진 TOP/FRONT/SIDE 및 유효한 Supplier Station EIP712 서명 -> Supplier Actor 제출
7 Buyer 스크래치 사진 TOP/FRONT/SIDE 및 Buyer Station EIP712 서명 -> Buyer Actor 제출
8 DISPUTED_PRIMARY 진입 검증
9 독립적인 Replay 또는 명시적 합성 음성 테스트의 증거 -> Primary Inspector Station 서명 -> Primary Inspector Actor 제출
10 EXECUTION_HOLD + ReplayResultRecorded 이벤트, Accounting 보존 검사
11 별도 거래를 AWAIT_SUPPLIER(5)로 준비한 뒤 정책 변조 eth_call -> PolicyHashMismatch 검사
다음 앱: http://127.0.0.1:8770/#roles (역할 승인 / 가스 소모 가능)
검사 제출 앱: http://127.0.0.1:8770/e2e (역할별 지갑 명시적 승인)
본선 3장면: http://127.0.0.1:8770/stage (읽기 전용 / 오프체인 AI)
주의: 서명키/시드문구 공유 금지. 준비 상태를 실제 성공으로 발표하지 않는다.