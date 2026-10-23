# InspectEscrow PHASE2-PATCH3 Mentor Hardening SPEC

Status: **DESIGN FREEZE CANDIDATE**  
Purpose: 김태경·손영성 멘토링 피드백을 현재 성공한 PHASE2-PATCH2 위에 최소 변경으로 반영한다.  
Rule: **기존 Sepolia PHASE2-PATCH2 배포와 완료된 trade는 절대 변경·대체하지 않는다.**

---

## 0. 결론

PATCH3의 목표는 기능 확장이 아니다.

다음 세 질문에 코드로 답하는 것이 목표다.

1. **어떤 예외 상태에서도 funded escrow가 영구히 잠기지 않는가?**
2. **고정된 Station/Inspector credential이 유출·정지되었을 때 business rule을 바꾸지 않고 대응 가능한가?**
3. **운영자·거래당사자 어느 한쪽도 합의된 policy/evidence/state/settlement를 단독으로 변경·집행할 수 없는가?**

기존 성공 경로는 그대로 유지한다.

```text
Fund
→ Supplier inspection
→ Buyer inspection
→ Primary dispute
→ Backup failover
→ Replay
→ Inspector decision
→ claimable
→ withdraw
```

---

## 1. 기존 PHASE2-PATCH2에서 유지할 것

아래는 이미 실제 Sepolia funded E2E로 검증되었으므로 의미를 바꾸지 않는다.

- Native ETH escrow
- immutable per-trade policy/model/capture/product/view commitments
- EIP-712 domain binding
- tradeId binding
- attempt/stage binding
- nonce replay protection
- deadline validation
- Primary → Backup Inspector failover
- Replay는 settlement가 아니라 execution-consistency gate
- Inspector decision은 별도 attestation
- SettlementOutcome은 RELEASE_TO_SUPPLIER / REFUND_TO_BUYER만 허용
- pull-payment `claimable → withdraw()`
- accounting conservation
- no owner force-release / force-refund / sweep
- AI는 돈을 자동으로 결정하지 않음

기존 배포:
- version: `PHASE2-PATCH2`
- Sepolia: `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9`
- 완료 trade: `0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c`

PATCH3는 신규 계약으로만 배포한다.

---

## 2. 현재 Liveness 감사 결과

PHASE2-PATCH2에는 이미 종료 경로가 있는 상태와 없는 상태가 섞여 있다.

### 이미 강제 종료 가능한 상태

- `AWAIT_SUPPLIER` → timeout → Buyer refund
- `SUPPLIER_HOLD` → timeout → Buyer refund
- `SUPPLIER_REINSPECTION` → timeout → Buyer refund
- `ACCEPTANCE_PENDING` → timeout → Supplier release
- `DISPUTED_PRIMARY` → timeout → Backup activation
- `DISPUTED_BACKUP` → timeout → ESCALATED

### 현재 mutualResolve는 가능하지만 강제 종료가 보장되지 않는 상태

- `EXECUTION_HOLD`
- `EVIDENCE_HOLD`
- `BUYER_INSPECTION_TIMEOUT`
- `ESCALATED`

현재 `_mutualResolutionState()`는 위 상태들을 허용한다. 따라서 “출구가 전혀 없다”는 것은 정확하지 않다.

그러나 한쪽이 끝까지 서명하지 않으면 `mutualResolve()`가 실행되지 않으며, 해당 상태들에는 최종 timeout settlement가 없다. 따라서 **funded escrow의 liveness guarantee는 없다.**

PATCH3는 이 gap만 해결한다.

---

## 3. PATCH3 최종 종료 정책

### 3.1 원칙

```text
Automatic settlement
    ↓ 예외
Mutual-resolution window
    ↓ 양측 합의 실패
External arbitration
    ↓ 중재자도 timeout
Pre-committed final fallback
    ↓
RELEASE or REFUND
```

어느 단계에서도 운영자가 임의 금액을 이동시키지 않는다.

### 3.2 Mutual Resolution

예외 상태 진입 시 `actionDeadline`을 0으로 두지 않는다.

`windows.mutualResolution` 기간을 부여한다.

이 기간 동안:
- Supplier + Buyer 동일 outcome 서명 → `mutualResolve()`
- outcome은 RELEASE / REFUND만 가능

### 3.3 External Arbitration

Mutual-resolution deadline이 지난 뒤 누구나:

`escalateToExternalArbitration(tradeId)`

를 호출할 수 있다.

전이:

```text
EXECUTION_HOLD
EVIDENCE_HOLD
BUYER_INSPECTION_TIMEOUT
ESCALATED-from-inspector-timeout
        ↓
ARBITRATION_PENDING
```

External Arbitrator는 돈을 직접 보낼 수 없다.

오직 다음 attestation만 제출한다.

```text
ArbitrationDecisionAttestation
- tradeId
- arbitratorActor
- policyHash
- supplierEvidenceHash
- buyerEvidenceHash
- decision: RELEASE | REFUND
- reasonCode
- decisionEvidenceHash
- nonce
- issuedAt
- validUntil
```

Contract가 서명·credential·deadline·evidence anchor를 검증한 뒤 `_settle()`을 호출한다.

### 3.4 Final Fallback — exception-specific

External Arbitrator도 `windows.externalArbitration` 내 응답하지 않으면 누구나:

`executeFinalFallback(tradeId)`

을 호출할 수 있다.

초기 단일 `finalFallbackOutcome` 설계는 서로 다른 실패 원인을 하나의 결과로 처리한다는 Red-Team 약점이 발견되어 폐기하였다.

PATCH3 candidate는 거래 생성 전에 다음 예외별 fallback을 각각 고정한다.

```text
FallbackPolicy
- buyerInspectionTimeout
- executionHold
- evidenceHold
- inspectorEscalated
```

각 값은 다음 둘 중 하나만 허용한다.

- RELEASE_TO_SUPPLIER
- REFUND_TO_BUYER

External Arbitration으로 전환할 때 원래 예외 상태를 `arbitrationOriginState`로 보존하고, 최종 timeout 시 그 origin에 대응하는 사전합의 fallback만 실행한다.

금지:
- NONE
- 관리자 임의 선택
- timeout 이후 fallback 정책 변경
- 모든 예외를 하나의 사후 재량으로 처리

즉 fallback은 사후 관리자 재량이 아니라 **Outcome-before-Rule Commit**의 일부이며, 실패 유형별 경제적 의미까지 사전에 분리한다.

예:
- Buyer inspection no-response → 당사자 합의에 따라 RELEASE 가능
- execution/evidence integrity failure → 당사자 합의에 따라 REFUND 가능

이 값들은 데모/거래 정책이며 보편적 B2B 정산규칙으로 주장하지 않는다.

---

## 4. Business Rule vs Credential

### 4.1 Immutable Business Rule

거래 활성화 후 변경 불가:

- policyVersion
- policyHash
- modelBundleHash
- captureProfileHash
- productSpecHash
- requiredViewSetHash
- scoreSchemaId
- threshold
- retry policy
- settlement outcomes
- windows
- exception-specific FallbackPolicy
- role identities / assigned organizations

### 4.2 Revocable Credential

키 자체는 business rule이 아니다.

Credential status:

```text
UNKNOWN
ACTIVE
SUSPENDED
REVOKED
```

필드:
- status
- changedAt
- revokedAt
- reasonCode

전이:
- UNKNOWN → ACTIVE
- ACTIVE → SUSPENDED
- SUSPENDED → ACTIVE
- ACTIVE/SUSPENDED → REVOKED
- REVOKED → terminal

### 4.3 Credential Registry 분리와 Authority 권한 제한

초기 candidate에서는 credential lifecycle을 Escrow 본체에 넣었으나, Red-Team/CI에서 runtime bytecode가 EIP-170 한도를 초과하는 문제가 발견되었다.

따라서 PATCH3는 다음 두 계약으로 분리한다.

```text
CredentialRegistryPatch3
→ ACTIVE / SUSPENDED / REVOKED 관리

InspectEscrowPatch3
→ policy / state / evidence / arbitration / settlement
```

`CredentialRegistryPatch3.authority`는 production에서 multisig/dual-control을 전제로 한다.

Registry Authority가 할 수 있는 것:
- credential register
- suspend
- resume suspended credential
- revoke

절대 할 수 없는 것:
- policy 변경
- threshold 변경
- evidence hash 변경
- trade state 직접 변경
- RELEASE/REFUND 선택
- claimable 변경
- withdraw
- escrow sweep

Escrow contract ABI에는 credential lifecycle mutation 함수 자체를 두지 않는다.

즉 security authority는 **키 상태를 관리할 수 있을 뿐 돈의 수령인을 결정할 수 없다.**

남는 governance risk도 명시한다:
- 악의적 Authority가 credential을 정지해 정상 경로를 방해할 수는 있다.
- 그러나 settlement outcome을 사후 선택할 수 없고, trade에 pre-committed된 mutual/arbitration/fallback 경로로만 진행된다.
- production에서는 단일 EOA가 아니라 multisig/dual-control governance가 요구된다.

### 4.4 Revocation 처리

Attestation 제출 시 required credential이 ACTIVE가 아니면 revert.

`revokedAt` 이전에 생성된 서명을 사후 제출하는 것도 MVP에서는 허용하지 않는다.

이유:
- signer가 `issuedAt`을 임의 backdate할 수 있으므로 compromise 이후 “과거 발급” 주장만으로 안전성을 확보할 수 없음.

따라서 current status가 ACTIVE가 아니면 새로운 state transition에 사용할 수 없다.

그 결과 required credential이 SUSPENDED/REVOKED이면 해당 credential의 **새로운 attestation만 거절**한다.

중요하게, Credential Authority의 정지 행위 자체가 Escrow state를 바꾸지는 않는다. 초기 candidate의 credential-triggered hold state는 Authority가 간접적으로 fallback 진행을 앞당길 수 있다는 Red-Team 약점이 발견되어 폐기하였다.

최종 candidate의 liveness 원칙:

```text
credential unavailable
→ new signed action REVERT
→ current protocol state/deadline은 그대로 유지
→ 기존 timeout/failover/exception 경로
→ 필요 시 mutual resolution
→ external arbitration
→ precommitted contextual fallback
```

즉 **Credential은 사용 가능성을 통제하지만 settlement clock이나 수령인을 결정하지 않는다.**

---

## 5. Inspector key 분리

PATCH2:
- Primary Actor
- Backup Actor
- shared `inspectorStation`

Risk:
- shared station key compromise가 Primary/Backup 모두에 영향

PATCH3:

```text
primaryInspector
primaryInspectorStation

backupInspector
backupInspectorStation

externalArbitrator
externalArbitratorStation
```

각 signing credential은 독립한다.

Replay/Decision stage에 따라 정확한 station signer를 선택한다.

- PRIMARY → primaryInspectorStation
- BACKUP → backupInspectorStation
- ARBITRATION → externalArbitratorStation

---

## 6. TradeTerms 변경 후보

### Windows

기존:
- supplierInspection
- buyerInspection
- buyerAcceptance
- primaryInspector
- backupInspector

추가:
- mutualResolution
- externalArbitration

### Role addresses

기존 `inspectorStation` 제거 후보.

추가:
- primaryInspectorStation
- backupInspectorStation
- externalArbitrator
- externalArbitratorStation

### Settlement policy

추가:
- `FallbackPolicy buyerInspectionTimeout`
- `FallbackPolicy executionHold`
- `FallbackPolicy evidenceHold`
- `FallbackPolicy inspectorEscalated`

모든 신규 필드는 `proposeTrade` 시 고정되고 양측이 같은 policy를 accept해야 한다. External Arbitration 진입 시 origin state를 보존하여 해당 예외 유형의 fallback만 적용한다.

---

## 7. 신규 상태 후보

기존 enum 번호에 의존하는 외부 도구가 있으므로 PATCH3에서는 ABI/version을 명확히 새로 freeze한다.

추가:
- `ARBITRATION_PENDING`

초기 candidate에서 검토했던 credential-triggered hold state는 최종 hardening에서 제거했다. Credential Authority가 key suspension만으로 거래를 별도 settlement 경로로 이동시키는 권한을 갖지 않게 하기 위함이다.

### ARBITRATION_PENDING
mutual resolution 실패 또는 Backup timeout 이후 외부 중재 결정을 기다리는 상태.

Terminal:
- RELEASED
- REFUNDED
- CANCELLED

Funded trade가 nonterminal state에 무기한 남는 경로가 없어야 한다.

---

## 8. Credential failure 규칙

Credential 사고 대응과 settlement 권한을 분리한다.

따라서:

- invalid signature → revert only
- wrong signer → revert only
- nonce reuse → revert only
- SUSPENDED/REVOKED credential의 새로운 attestation → revert only
- credential 상태 변경 자체 → **Escrow state mutation 없음**
- funding 직전 모든 assigned signing credential이 ACTIVE인지 다시 확인
- 이미 funded된 거래는 현재 state에 원래 존재하는 timeout/failover/liveness 규칙으로만 진행

credential-triggered state transition 함수는 두지 않는다.

이 구조는 악성 signature DoS뿐 아니라 **Credential Authority가 suspension을 이용해 settlement를 간접적으로 앞당기는 governance attack**도 차단한다.

---

## 9. Blockchain necessity를 코드로 보여줄 검증 시나리오

### B1. Funded 이후 policy mutation
시도:
- 다른 policyHash
- 다른 modelBundleHash
- 다른 threshold-bound attestation

기대:
- revert

메시지:
“운영자도 활성 거래의 합의 규칙을 사후 변경할 수 없다.”

### B2. Unauthorized settlement
시도:
- Supplier/Buyer/임의 계정이 Inspector decision 제출
- Arbitrator가 직접 withdraw/claimable 변경 시도

기대:
- revert

메시지:
“판정권과 자금 집행권이 분리되어 있다.”

### B3. Replay inconsistent
기대:
- `EXECUTION_HOLD`
- 자동 돈 이동 없음
- mutual → arbitration → fallback 순서만 허용

### B4. Revoked/Suspended credential
기대:
- 새로운 attestation reject
- 현재 Escrow state는 credential 변경만으로 변하지 않음
- Credential Authority가 settlement 불가
- 기존 state deadline / failover / precommitted liveness path만 사용

### B5. Liveness
모든 actor가 비협조적인 최악의 경우에도 마지막 pre-committed fallback 이후 terminal state 도달.

---

## 10. Security invariants

PATCH3 테스트에서 반드시 유지:

1. `totalFunded = unsettledEscrow + outstandingClaimable + totalWithdrawn`
2. Contract balance >= unsettledEscrow + outstandingClaimable
3. settled trade는 두 번 settle 불가
4. final fallback은 deadline 이전 실행 불가
5. exception-specific fallback policy는 trade creation 이후 변경 불가
6. Credential Registry Authority는 `_settle()` 직접 호출 불가
7. Credential Registry Authority는 TradeTerms mutation 불가
8. Credential Registry Authority의 suspend/revoke만으로 Escrow state 변경 불가
9. Funding 직전 assigned signing credentials ACTIVE 재검증
10. REVOKED credential은 재활성화 불가
11. Primary/Backup/Arbitrator station signer는 서로 달라야 함
12. actor/station cross-role collision 금지
13. Replay inconsistent만으로 RELEASE/REFUND 불가
14. Arbitration decision은 RELEASE/REFUND 외 값 불가
15. Arbitration decision은 frozen policy/evidence anchors와 일치해야 함
16. Inspector decision은 nonzero reasonCode + decisionEvidenceHash를 가져야 함
17. timeout 호출은 누구나 가능하되 결과는 사전 규칙으로만 결정
18. internal ledger conservation + on-chain balance liability coverage 확인
19. private key/secret은 frontend bundle에 포함 금지

---

## 11. Red-Team 필수 테스트

### Liveness
- EXECUTION_HOLD → mutual timeout → arbitration → decision → RELEASE
- EXECUTION_HOLD → mutual timeout → arbitration timeout → fallback
- EVIDENCE_HOLD → same
- BUYER_INSPECTION_TIMEOUT → same
- Backup timeout → arbitration → same
- all parties silent → fallback terminal

### Credential
- active station accepted
- suspended station rejected
- resumed station accepted
- revoked station rejected
- revoked station cannot resume
- Primary station signature cannot be used for Backup
- Backup station signature cannot be used for Primary
- Arbitrator station cannot act as Inspector

### Authority abuse
- credential authority cannot settle
- credential authority cannot alter policy
- credential authority cannot withdraw escrow
- random user cannot suspend/revoke
- compromised revoked key cannot submit valid attestation

### Signature replay
- same nonce reused → reject
- same digest reused → reject
- different chainId → reject
- different verifyingContract → reject
- different tradeId → reject
- expired validUntil → reject

### Accounting
- every terminal route preserves accountingConserved()
- withdrawal failure reverts atomically
- no direct ETH receive

---

## 12. Interoperability Golden Vector

별도 파일로 고정할 것:

`PATCH3_INTEROP_GOLDEN_VECTOR.json`

한 개의 실제 Supplier StationAttestation을 canonical fixture로 사용한다.

Python / JavaScript / Solidity가 동일하게 산출해야 함:

- raw score
- scoreScaled
- JCS canonical bytes
- keccak256 evidence hash
- EIP-712 struct hash
- EIP-712 digest
- recovered signer
- contract hash helper result

PASS 조건:
- byte-for-byte / hex-for-hex equality

이 검증은 브라우저 UI가 아니라 CI/로컬 테스트로도 실행 가능해야 한다.

---

## 13. Physical Evidence는 별도 layer

PATCH3 Solidity hardening과 실제 너트 실험은 분리한다.

Physical Capture Protocol에서 추가할 대상:

- specimenId
- imageHash
- viewId
- sequenceIndex
- requiredViewCount
- captureSessionNonce
- capturedAt
- previousCaptureDigest

촬영 → hash/signature → inference 순서를 지켜 cherry-picking을 줄인다.

이 실험은 “AI 일반 성능”이 아니라:
- same-specimen procedure
- capture provenance
- post-capture file integrity

를 검증한다.

---

## 14. 구현 순서

1. 이 SPEC freeze
2. PATCH2 source copy → PATCH3 candidate
3. TradeTerms / Windows / station key split
4. Credential registry/state
5. exception-state deadlines
6. ArbitrationDecisionAttestation
7. final fallback
8. Foundry unit tests
9. Red-Team tests
10. ABI/EIP712 schema regenerate
11. JS integration update
12. Golden interoperability vector
13. local E2E
14. security/coverage audit
15. new Sepolia deploy
16. one funded PATCH3 E2E
17. frontend demo integration

PATCH2 주소·기존 E2E evidence는 역사적 baseline으로 계속 보존한다.

---

## 15. Go / No-Go Gate

PATCH3를 Sepolia에 배포하기 전에 아래가 전부 PASS여야 한다.

- all funded nonterminal states have deterministic finite exit
- no admin settlement backdoor
- revoked credential cannot authorize state transition
- Primary/Backup/Arbitrator signing key separation
- final fallback immutable after proposal
- accountingConserved on every terminal branch
- EIP-712 golden vectors identical across JS/Solidity and Python fixture
- existing core PASS/REVIEW/dispute behavior semantically preserved

하나라도 FAIL이면 PATCH2의 기존 성공본을 본선 baseline으로 유지하고 PATCH3는 “hardening candidate”로만 제시한다.


---

## 16. 2026-10-23 Hardening Result Update

현재 `patch3-mentor-hardening` candidate는 다음 자동 gate를 통과했다.

- hostile local Anvil Red-Team: **36 PASS / 0 FAIL**
- Solidity 0.8.26 compile PASS
- InspectEscrowPatch3 runtime: **22,669 bytes** → EIP-170 PASS
- CredentialRegistryPatch3 runtime: **1,494 bytes**
- Python ↔ JavaScript ↔ Solidity interop golden vector PASS
- ABI SHA256 + 5종 EIP-712 typehash local on-chain equality PASS
- Slither project-source untriaged High/Medium blocking findings: **0**
- professional independent audit / formal verification / production certification: **아님**

추가 Red-Team 수정:
- credential-triggered 별도 settlement state 제거
- funding 직전 credential ACTIVE 재검증
- Inspector decision에 `decisionEvidenceHash` 필수화
- `balanceCoversLiabilities()` 검증 추가
- PATCH3는 PATCH2 policyHash를 재사용하지 않으며, 새 settlement/authority semantics를 포함한 **policy schema v1.2 / policyVersion 2**를 새로 생성해야 한다.

Authoritative candidate evidence:
- `packages/phase3c_hardening_20261023/PATCH3_INTERFACE_FREEZE_CANDIDATE.json`
- `packages/phase3c_hardening_20261023/PATCH3_SEPOLIA_DEPLOYMENT_PRECHECK_KO.md`
