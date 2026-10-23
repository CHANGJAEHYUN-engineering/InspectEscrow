# InspectEscrow — FINAL RED-TEAM MASTER

Date: 2026-10-23  
Goal: **대상급 완성도. 심사 질문이 나올수록 설계의 경계·증거·권한분리가 더 선명해지는 상태.**

> “허점이 0개”를 보장한다는 뜻이 아니다. 목표는 **알려진 공격면을 미처리 상태로 남기지 않는 것**이다.
> 모든 공격은 아래 셋 중 하나로 닫는다.
>
> 1. **DESIGN FIX** — 구조 자체를 수정한다.
> 2. **EVIDENCE** — 구현/실험/transaction/test로 증명한다.
> 3. **CLAIM BOUNDARY** — PoC가 증명하지 않는 범위를 명시해 과장을 제거한다.

---

## 1. 본선 평가 최적화

공식 본선 평가:
- 완성도 30%
- 창의성 20%
- 실용성 20%
- 사업성 20%
- 발표·시연 10%

따라서 최종 MVP 우선순위:

1. **완성도:** funded E2E + finite liveness + credential recovery + reproducible evidence
2. **실용성:** 제조 QA 분쟁에서 실제 사용할 수 있는 권한/증거/정산 workflow
3. **사업성:** 기존 QMS/DB를 대체한다고 주장하지 않고 cross-company trust boundary를 명확히 함
4. **창의성:** AI 결과를 온체인에 저장하는 것이 아니라, AI inspection을 거래에 사용할 수 있는 verifiable evidence로 변환
5. **발표:** 8분 안에 Physical → AI → Evidence → Trust → Economic settlement를 한 흐름으로 보여줌

---

## 2. 최상위 설계 문장

**InspectEscrow는 AI 제조검사를 B2B 거래에서 사용할 수 있는 검증 가능한 증거로 변환하고, 합의된 절차와 권한에 따라 escrow를 정산하는 Trust Layer다.**

역할 분리:

```text
Physical layer
  실제 specimen / capture / custody

AI layer
  PatchCore score + heatmap

Evidence layer
  canonical package + hash + EIP-712

Trust layer
  policy / authority / state transition / replay

Economic layer
  escrow / claimable / withdraw
```

핵심 문장:
- AI는 검사 보조
- Blockchain은 합의·증거·집행권한
- 사람/중재자는 최종 품질·분쟁 판단
- AI는 돈을 직접 결정하지 않음
- Hash는 truth가 아니라 integrity를 증명
- Replay CONSISTENT는 “AI가 맞다”가 아니라 “같은 input/model/runtime policy에서 실행 결과가 재현됐다”는 의미

---

## 3. KILL-SHOT ATTACK REGISTER

### K1. “Supplier/Buyer가 같은 실물을 검사했다는 증거가 있나요?”
Severity: CRITICAL  
Closure:
- 실제 동일 금속 specimen
- serialized specimenId / QR
- fixed jig
- required views
- ordered capture
- capture-before-inference hash/signing
- physical substitution risk is reduced, not cryptographically eliminated

Status: OPEN — Physical Capture Protocol 필요

### K2. “실제 사진에 맞춰 AI를 튜닝했죠?”
Severity: CRITICAL  
Closure:
- model / threshold / preprocessing / modelBundleHash를 physical capture 전에 freeze
- capture → hash commit → inference 순서
- blind specimens 결과를 숨기지 않음
- physical demo는 general AI benchmark로 주장하지 않음

Status: PARTIAL — freeze evidence 있음, physical blind test 필요

### K3. “DB + 전자서명 + 중앙 escrow로도 되는데 왜 blockchain?”
Severity: CRITICAL  
Closure:
- 중앙 workflow 자체는 가능하다고 인정
- 차이는 단일 운영자의 unilateral mutation/settlement authority
- funded 이후 policy tamper REVERT
- unauthorized settlement REVERT
- state/settlement event history public verification
- no admin sweep / force settle

Status: PARTIAL — contract evidence 있음, side-by-side failure demo 필요

### K4. “예외에서 돈이 영구 lock될 수 있죠?”
Severity: CRITICAL  
Closure:
- automatic settlement
- mutual resolution window
- external arbitration window
- precommitted final fallback
- every funded nonterminal state finite exit

Status: PATCH3 IN PROGRESS

### K5. “Station/Inspector key 유출되면?”
Severity: CRITICAL  
Closure:
- Business Rule immutable
- Credential revocable
- ACTIVE/SUSPENDED/REVOKED
- Primary/Backup/Arbitrator signing keys separate
- revocation authority cannot settle funds
- credential failure enters bounded liveness path

Status: PATCH3 IN PROGRESS

### K6. “Inspector가 악의적이면?”
Severity: CRITICAL  
Closure:
- decision domain limited to RELEASE/REFUND
- frozen evidence anchors
- reasonCode / decisionEvidenceHash
- separate credential
- optional external arbitration policy
- no direct withdrawal authority

Status: PARTIAL

### K7. “Blockchain이 실제 불량 여부를 증명하나요?”
Severity: CRITICAL  
Closure: CLAIM BOUNDARY
- no physical truth claim
- no custody truth claim
- no honest-camera proof
- no automatic legal defect determination
- Oracle Problem explicitly acknowledged

Status: CLOSED BY CLAIM BOUNDARY

### K8. “한 건 성공했다고 검증됐나요?”
Severity: HIGH  
Closure:
- funded Sepolia representative E2E
- local multi-path tests
- failure scenarios
- accounting invariants
- red-team suite
- no production-certification claim

Status: PARTIAL

---

## 4. AI ATTACK REGISTER

A1. Why PatchCore vs classifier? → normal-only anomaly detection rationale + baseline table  
A2. Public MVTec only? → explicitly “public-dataset reproduction scenario”  
A3. V2 89 images untouched test? → NO. POST_HOC COMPARATIVE only  
A4. validation N=63 small? → PoC calibration, not production certification  
A5. threshold cherry-picked? → validation-only Youden J + demo tuning prohibited  
A6. anomaly score = defect probability? → NO  
A7. heatmap = defect ground truth? → NO  
A8. smartphone domain shift? → blind frozen-model test; do not retune  
A9. only successful real photos shown? → pre-register required views/specimens before inference  
A10. replay exact equality? → tolerance-based, decision-stable rule  
A11. tolerance 222 universal? → NO; CPU↔T4 MVP pair only  
A12. replay consistency = correct quality judgment? → NO; execution reproducibility only  
A13. model drift? → new modelBundleHash / new policy for future trades  
A14. product family drift? → product-specific validated policy/model required  
A15. model artifact reproducible? → release/LFS/object-store + digest required

---

## 5. PHYSICAL / ORACLE ATTACK REGISTER

P1. QR can be moved to another nut  
P2. image can be manipulated before hashing  
P3. screen/photo replay can fool normal camera  
P4. Station can sign malicious input  
P5. EXIF is forgeable  
P6. local clock can be wrong  
P7. view cherry-picking  
P8. multiple captures then select best one  
P9. original evidence unavailable during replay  
P10. supplier→buyer custody break  
P11. buyer can intentionally damage item  
P12. carrier can cause damage

Closure principle:
- P1–P6: do not overclaim; stronger hardware attestation/TEE is future
- P7–P8: fixed required views + sequence chaining + commit before inference
- P9: evidence retention / availability policy
- P10: production custody extension
- P11–P12: causality attribution is outside current MVP

---

## 6. BLOCKCHAIN ATTACK REGISTER

B1. DB alternative  
B2. Credential Authority centralization  
B3. Arbitrator centralization  
B4. public-chain confidentiality  
B5. gas cost  
B6. Sepolia vs production network  
B7. chain reorg/finality  
B8. contract bug + immutability  
B9. no upgradeability  
B10. frontend manipulation  
B11. RPC manipulation  
B12. wallet UX  
B13. native ETH suitability  
B14. independent security audit absent  
B15. formal verification absent

Rule:
- Never claim “blockchain is required because hashes cannot change.”
- Claim: **no single conflicting-interest party has unilateral authority over active rule/state/settlement.**

---

## 7. SMART-CONTRACT / SECURITY ATTACK REGISTER

S1. signature replay  
S2. cross-chain replay  
S3. cross-contract replay  
S4. cross-trade replay  
S5. expired attestation  
S6. unauthorized actor  
S7. wrong Station  
S8. nonce reuse  
S9. double settlement  
S10. double withdrawal  
S11. reentrancy  
S12. direct ETH  
S13. invalid-signature griefing  
S14. malicious credential hold  
S15. permanent lock  
S16. fallback executor abuse  
S17. arbitrator arbitrary amount  
S18. evidence substitution  
S19. policy mutation  
S20. threshold mutation  
S21. role/key collision  
S22. one operator controlling all demo wallets

All S items require either automated test or explicit PoC claim boundary before final submission.

---

## 8. ECONOMIC / B2B ATTACK REGISTER

E1. Why full refund vs partial settlement?  
E2. Who pays gas?  
E3. Inspector fee?  
E4. Replay cost?  
E5. abuse/dispute spam?  
E6. staking/slashing absent?  
E7. lot/batch partial defect?  
E8. trade amount smaller than dispute cost?  
E9. fiat/stablecoin integration?  
E10. accounting/tax/legal enforceability?

MVP rule:
- binary escrow is deliberate scope reduction
- do not present as complete procurement/ERP/legal settlement product
- present as **trust protocol PoC for inspection-triggered B2B settlement**

---

## 9. MANUFACTURING OPERATIONS ATTACK REGISTER

M1. MES/QMS/ERP integration  
M2. camera calibration  
M3. lighting drift  
M4. line throughput  
M5. inference latency  
M6. inspection equipment certification  
M7. evidence retention period  
M8. inspector SLA  
M9. multiple sites  
M10. product/model versioning

Production roadmap should answer these without pretending MVP already solves them.

---

## 10. BUSINESS ATTACK REGISTER

C1. Paying customer?  
C2. Actual dispute pain evidence?  
C3. ROI?  
C4. Existing QMS enough?  
C5. adoption friction?  
C6. wallet/key management?  
C7. who is accredited Inspector?  
C8. who governs credential registry?  
C9. privacy/commercial secrecy?  
C10. why now?

No fabricated ROI numbers. Evidence-backed claims only.

---

## 11. DEMO ATTACK REGISTER

D1. “This is prerecorded.” → live chain reads + Etherscan  
D2. “TX hashes are pasted.” → direct transaction navigation  
D3. “AI score is hardcoded.” → frozen inference artifact / optional live one-image inference  
D4. “UI is fake.” → on-chain state read and event reconciliation  
D5. “Why refund only?” → dispute flow chosen because it exercises core trust protocol  
D6. “Primary timeout was fake.” → deadline/event/backup tx evidence  
D7. “Inspector not truly independent.” → role/key separation only; organizational independence not claimed  
D8. “Sepolia delayed.” → prepared tx path + live read-only verification + backup recording  
D9. “Physical demo and MVTec are disconnected.” → explicit layer separation  
D10. “Too complex.” → 3-stage story: Inspect → Verify → Settle

---

## 12. REPOSITORY / REPRODUCIBILITY ATTACK REGISTER

R1. stale PHASE3B progress document  
Action: historical snapshot banner

R2. historical replay tolerance artifact contains predecessor modelBundleHash  
Action: preserve artifact, document lineage; do not silently mutate provenance artifact

R3. large model files absent from GitHub  
Action: release/LFS/object store + checksum

R4. Foundry full test suite not trivially discoverable  
Action: public tests + exact commands + expected summary

R5. authoritative/latest documents unclear  
Action: root FINAL_EVIDENCE_INDEX

R6. historical vs final artifacts mixed  
Action: explicit CURRENT / HISTORICAL / SUPERSEDED labels

R7. Python/JS/Solidity encoding drift  
Action: golden interop vector + automated test

---

## 13. FINAL EVIDENCE INDEX REQUIREMENT

Before submission, one document must point to:

- deployed contract
- contract source hash
- final ABI
- final policyHash
- final modelBundleHash
- model artifact SHA256
- score schema
- threshold
- evidence package hashes
- Sepolia tx sequence
- final accounting
- replay envelope
- Physical Capture Protocol evidence
- PATCH3 liveness tests
- credential revocation tests
- interop golden vector
- baseline AI comparison
- failure demo outputs
- claim boundary
- exact reproduction commands

A judge should not need to guess which artifact is authoritative.

---

## 14. QUESTION HANDLING RULE

Every difficult question should be answered in this order:

1. **Acknowledge the real limitation**
2. **State exactly what the system proves**
3. **Show the mechanism/evidence**
4. **State what is intentionally outside MVP**
5. **Explain production extension only if needed**

Example:

“QR을 다른 너트에 붙이면 되지 않나요?”

Bad:
“블록체인이라 위조가 어렵습니다.”

Good:
“맞습니다. QR 자체가 물리 동일성을 암호학적으로 증명하지는 않습니다. 현재 MVP는 고정 jig·ordered capture·pre-inference hash/signature로 substitution과 cherry-picking을 줄이고, 촬영 후 파일 교체는 cryptographically 검증합니다. trusted camera/TEE 수준의 physical-origin proof는 production 확장 범위입니다.”

---

## 15. GRAND-PRIZE EXIT GATE

본선 직전 아래 조건이 모두 충족되어야 “FINAL LOCK” 가능.

### Architecture
- [ ] every funded state has finite exit
- [ ] business rule immutable / credential revocable
- [ ] no admin settlement backdoor
- [ ] Primary/Backup/Arbitrator keys separated
- [ ] blockchain necessity demonstrated by authority-failure scenario

### AI
- [ ] frozen-model provenance clear
- [ ] no post-demo tuning
- [ ] PatchCore baseline comparison
- [ ] replay tolerance claim correctly bounded
- [ ] physical blind test recorded honestly

### Evidence
- [ ] actual specimen capture protocol
- [ ] pre-inference image commitments
- [ ] required view order
- [ ] original evidence availability rule
- [ ] interop golden vector

### Security
- [ ] red-team tests pass
- [ ] accounting invariants pass
- [ ] revoked credential tests pass
- [ ] tampered policy rejected
- [ ] replay mismatch enters HOLD

### Repo
- [ ] stale docs labeled
- [ ] lineage contradictions resolved/documented
- [ ] final evidence index
- [ ] reproducible commands

### Demo
- [ ] 8-minute pitch rehearsed
- [ ] 2-minute hostile Q&A rehearsed
- [ ] live read-only chain verification
- [ ] backup video
- [ ] no unsupported production claims

If any critical item fails, do not hide it. Narrow the claim and preserve the proven baseline.
