# InspectEscrow — 보안·회귀 검증 요약

기준: 2026-10-30 로컬 개발 결과 보고서 및 기존 공개 소스. **실제 Sepolia TX / Sepolia Fork / Local Anvil / 브라우저 검증을 구분**한다.

| 검증 항목 | 보고된 결과 | 환경 및 해석 |
|---|---:|---|
| PATCH3 Red-Team | **36/36 PASS** | Local Anvil; 공격 시나리오·정산 불변식 검증 |
| Model B 지역 E2E | **16/16 PASS, 70 local TX** | 로컬 합성 증거·상태 전이 중심. 실제 물리 추론 자체를 실행하지 않은 해당 suite와 실물 AI Replay는 구분 |
| 2A 거래 workspace | **14/14 PASS** | 로컬 통합 테스트 |
| 2B Evidence Import | **21/21 PASS** | 로컬 증거 검증 |
| 2C Model B Independent Replay | **20/20 PASS** | Windows 실제 AI 재추론; S05 점수 일치 |
| 2D Resolution | **23/23 PASS** | Local Anvil |
| 2E release readiness | **30/30 PASS** | Sepolia READ-ONLY, 신규 Sepolia TX 0 |
| Sepolia fork settlement | **13/13 PASS** | Sepolia snapshot의 로컬 fork; 실제 네트워크 TX 0 |

보안 검토 주제: 해시·정책·모델 불일치, Station 서명 및 권한 위반, nonce 재사용, 잘못된 chain/domain, 유효시간 위반, Replay 점수 불일치 시 EXECUTION_HOLD, Credential 정지, 중재·fallback, 중복 정산·인출, 회계 보존.

## GitHub Actions 재검증 (2026-10-31)

- [PATCH3 Solidity CI — SUCCESS](https://github.com/CHANGJAEHYUN-engineering/InspectEscrow/actions/runs/41096637460): 공개 `main`의 실제 소스 재컴파일, hostile Local Anvil Red-Team, JS/Python interop, 인터페이스·정책 테스트 및 바이트코드 검사 통과.
- [PATCH3 Static Analysis — SUCCESS](https://github.com/CHANGJAEHYUN-engineering/InspectEscrow/actions/runs/41096816045): pinned Slither 정적 분석 게이트 통과.
- 위 CI의 Anvil 트랜잭션은 **로컬 테스트용**이며 실제 Sepolia 트랜잭션은 발생시키지 않는다.

## 공개 결과 JSON

- [Model B local E2E (16 checks)](results/MODEL_B_LOCAL_E2E_20261029.json)
- [Windows Model B Replay (20 checks)](results/MODEL_B_REPLAY_20261030_PUBLIC.json)
- [PATCH3 Sepolia deployment public manifest](../packages/phase3c_hardening_20261023/results/PATCH3_SEPOLIA_DEPLOYMENT_PUBLIC.json)

## 코드 근거

- [PATCH3 Solidity 계약](../packages/phase3c_hardening_20261023/contracts/)
- [PATCH3 Red-Team 테스트](../packages/phase3c_hardening_20261023/test/red-team-smoke.mjs)
- [EIP-712 및 Python·JavaScript Interop](../packages/phase3c_hardening_20261023/test/)
- [보안·종료 정책](PATCH3_SECURITY_AND_LIVENESS_KO.md)
- [신뢰 주체 및 권한 경계](PATCH3_TRUST_ASSUMPTION_REGISTER_KO.md)

## 검증 경계

- 실물 S03 정상/스크래치 결과와 S05 PASS/PASS 거래는 다른 실험이다.
- Local Anvil이나 Fork에서 완주한 분쟁은 실제 Sepolia Model B 분쟁 E2E 완료를 뜻하지 않는다.
- 전문 제3자 보안감사, 형식검증, 생산 현장 운영인증을 실시했다는 주장은 하지 않는다.
- 모델 체크포인트, 사진 원본, test runtime의 외부 배포·독립 PC 재현성은 별도 인계 패키지와 추가 검증이 필요하다.
- 위 표는 2026-10-30 로컬 실행 이력을 포함한다. 공개 `main`의 계약 컴파일·Red-Team·정적 분석은 상단 GitHub Actions에서 별도 재실행 후 성공했으며, Windows Model B 실추론·현장 촬영·실제 Sepolia 거래를 GitHub Actions에서 재현했다는 의미는 아니다.
