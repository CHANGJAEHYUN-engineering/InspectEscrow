# InspectEscrow 최종 시연 UX 개선 — 3뷰 원본 1회 선택 후 화면 연결
기준일: 2026-11-06 · 변경 범위: 통합 웹 프런트엔드(`/live`, `/evidence`, `/e2e`)

## 해결한 문제
- AI 품질검사에서 TOP·FRONT·SIDE 업로드 후 `검증 연결`을 누르면 검증 화면이 원본을 다시 요구하던 문제
- Evidence JSON을 다운로드한 뒤 같은 탭의 Evidence 검증에서 다시 불러와야 하던 문제
- Station EIP-712/Actor 거래 제출 화면에서 이미 선택한 3뷰 원본을 또 선택해야 하던 문제
- 검사 화면으로 돌아왔을 때 직전 입력·점수·Bundle 상태가 초기화되던 문제
- 새 세션, TOP/FRONT/SIDE 교체, 역할·시편 변경에도 이전 Evidence 완료 메시지가 남을 수 있던 문제

## 변경된 사용 흐름
1. `AI 품질검사`에서 **기존 Trade ID**와 Supplier/Buyer 역할 및 시편 ID를 확인한다.
2. TOP, FRONT, SIDE 원본 파일을 한 번 선택한다. TOP만 실제 PatchCore AI 추론을 실행한다.
3. `TOP 실제 AI 추론 실행` → `TOP·FRONT·SIDE 증거 생성`을 순서대로 누른다.
4. 같은 탭의 `검증 연결 → Evidence 검증` 화면으로 이동하면 JSON과 원본 3뷰가 자동 채워진다. **검증은 반드시 `원본·해시·Sepolia 재검증`을 눌러 실행한다.**
5. `검사 Evidence 온체인 제출(Station/Actor)` 화면으로 이동하면 **해당 Trade ID + Supplier/Buyer 역할이 같은 경우에만** 3뷰가 자동 채워진다.
6. **작업자가 뷰·시편 확인 체크박스를 직접 선택**하고, 현재 거래의 새로운 `실제 AI 재추론·동적 증거 생성`을 실행한다.
7. **Station EIP-712 서명과 Actor MetaMask 거래 제출은 각각 수동 승인**한다. 기존 서명이나 EIP-712 메시지는 자동 전달·재사용하지 않는다.

## 신뢰·보안 경계
- 원본 이미지는 **같은 브라우저 탭의 메모리**에서만 전달된다. 서버 영구 저장이나 localStorage/IndexedDB 저장은 하지 않는다.
- 새로고침, 새 탭, 브라우저 종료 후에는 원본 파일과 JSON을 다시 선택해야 한다. Evidence JSON 다운로드는 백업을 위한 선택 사항이다.
- 다른 Trade ID에는 원본을 자동 연결하지 않는다. Supplier와 Buyer의 별도 촬영·검사 증거는 서로 대체하지 않는다.
- 실제 `/api/evidence/verify`의 원본 해시·서명·거래 상태 검증을 우회하지 않는다.
- `/e2e`는 새 거래 상태와 새 EIP-712 서명을 다시 검증한다. MetaMask 계정을 자동 전환하거나 트랜잭션을 자동 실행하지 않는다.
- `PARTIAL_VERIFICATION` 또는 `UNSIGNED`는 실수나 전송 완료를 뜻하지 않는다. AI 검사 Bundle은 최초 생성 시 미서명·온체인 미제출 상태이다.

## 확인된 테스트
- `node --check live.js/evidence.js/e2e.js`: 구문 PASS.
- `git diff --check`: PASS.
- Chrome headless + Playwright-core, **API 응답을 모의 처리한 UI 연결 테스트**:
  - 3뷰 1회 선택 → AI 점수와 Evidence Bundle 생성 → Evidence 검증 화면 원본 3뷰+JSON 자동 채움 PASS
  - Station/Actor 화면 해당 역할의 원본 3뷰 자동 채움 PASS
  - 체크박스 자동 승인 없음 · EIP-712 자동서명 없음 · Actor TX 자동전송 없음 PASS
  - 서로 다른 Trade ID에 이전 원본이 자동 연결되지 않음 PASS

## 배포 전 확인해야 할 사항
- **아직 실 운영 중인 Railway production 서비스를 변경했다고 주장하지 않는다.**
- 미완료: 실제 Model B 원본과 실거래를 사용한 End-to-End 브라우저 검증, 배포 컨테이너 재빌드·배포 버전 해시 비교, Sepolia 신규 거래 트랜잭션 시험.
- 본선이 임박했으므로 운영 중인 배포를 덮어쓰기 전에 비운영 미리보기에서 실제 원본 검증/인증/거래 조회를 확인할 것. 기존 완료 거래를 변경하거나 실제 신규 TX를 자동 실행하지 말 것.
