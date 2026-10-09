# 2회차 멘토링 — 손영성 교수님

**프로젝트:** InspectEscrow · 팀 창지환 · 창재현(AI/Colab) / 김지환(Web/Blockchain)

**사전검토 자료:** 16쪽 업그레이드 기획안(메일 첨부), [아키텍처](architecture.md), [개발 근거 현황](implementation-status.md), [인터페이스](integration-contract.md), [검증표](validation-matrix.md)

## 기술 자문 요청 (우선순위 순)

1. **Data vs execution vs identity.** 이미지/촬영자료의 무결성, 실제 물리제품 동일성, Station 주체성, AI 추론 재현성을 PoC 수준에서 어디까지 별도 검증해야 신뢰 주장이 성립하는가?
2. **Independent replay.** Frozen PatchCore/동일 이미지 재실행과 Inspector 판단의 경계를 어떻게 두어야 재현성 검사가 품질판단으로 오해되지 않는가?
3. **Distributed trust boundaries.** Google Colab 추론 → 웹/Wallet → Sepolia 계약 → 독립 Inspector의 최소 권한 및 장애 대응 구조는 어떻게 설계하는가? 멀티에이전트 도입은 실제 도움이 되는가?
4. **Most discriminative negative tests.** 시간 제약 안에서 무효 서명, 정책변경, replay 불일치, Inspector 미응답 중 어느 1~2개를 핵심 시연으로 선택해야 하는가?
5. **Future factory extension.** 향후 실제 Station/Edge 이식을 위해 지금부터 기록해야 할 최소 로그/traceability 항목은 무엇인가?

**원하는 산출:** 범위 우선순위, 반드시 검증할 Failure Scenario, 과장 없는 데모 판정 기준.
