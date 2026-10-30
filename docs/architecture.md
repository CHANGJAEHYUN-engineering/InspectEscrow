# InspectEscrow architecture and explicit trust boundaries

**Scope:** This document records the system architecture and trust boundaries for the technical prototype. Implementation status and verified outcomes are tracked separately.

| Layer | Intended data or behavior | It does NOT prove |
|---|---|---|
| Physical | Product/specimen ID, camera/fixture, captures and required views | Real specimen identity from an image hash |
| AI | PatchCore on metal_nut, score/heatmap, frozen model & threshold | Physical truth / liability / fault judgment |
| Evidence | Off-chain originals + raw-byte SHA-256, canonical manifest, Station attestation | Permanent preservation or honest camera/Station |
| Trust | Sepolia contract manages authorized roles, hash commitments, nonce, policy/state | AI inference or independent inspection |
| Economic | Escrow entitlement and claimable / withdraw, controlled by contract workflow | Payout correctness absent valid submitted evidence |

**Decision policy target:** `score < threshold` → PASS; `score >= threshold` → REVIEW. Actual on-chain integer scale/rounding and equality boundary must be confirmed against frozen ABI.

**Conflict path:** Both parties accept precommitted policy → inspector(s) accept → Buyer funds → Supplier PASS → Buyer REVIEW → keep funds locked → independent replay with original bytes and same frozen model → Inspector decision → claimable → recipient withdraw.

A mismatch may arise from capture, transport, true damage or model variance, not necessarily dishonesty. Replay only tests execution consistency and should not be advertised as ZKML or a universal proof of honesty.

**Ownership:** 창재현 = AI/Colab; 김지환 = Web/Sepolia; both = cross-layer schema and evidence/receipt validation.
