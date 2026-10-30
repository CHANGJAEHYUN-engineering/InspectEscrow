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
- 이 표는 2026-10-30에 작성된 실행 결과를 옮긴 것으로, 2026-10-31 GitHub 게시 시 모든 시험을 다시 실행한 기록은 아니다.
