# InspectEscrow — AI Quality Inspection × Blockchain Escrow

> 2026 AI × BLOCKCHAIN Hackathon · TRACK 4 · Team **창지환**
>
> **Evidence snapshot: 2026-10-11.** The audited Colab AI package and Phase3B Web/Solidity package are committed under `packages/`. A funded **Sepolia end-to-end DISPUTE flow has now completed through Buyer withdraw**, including Supplier/Buyer AI evidence, Primary Inspector timeout, Backup failover, replay consistency, Inspector refund decision, pull-payment credit and final withdrawal.

InspectEscrow addresses disagreement between **Supplier outbound** and **Buyer inbound** AI-supported manufacturing inspections. Pre-agreed model, threshold, capture protocol, signed evidence, independent replay, inspector authority and blockchain escrow prevent unilateral mutation of active settlement rules while preserving explicit human responsibility for the final real-world decision.

## Final Sepolia E2E status

| Item | Result |
|---|---|
| Network | Sepolia · chainId `11155111` |
| Contract | `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9` |
| Trade | `0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c` |
| Escrow | `0.005 ETH` |
| Supplier AI | `good/000` → `55442036` → `ADMISSIBLE_PASS` |
| Buyer AI | `scratch/022` → `60138172` → `ADMISSIBLE_REVIEW` |
| Dispute | `DISPUTED_PRIMARY` → Primary timeout → `DISPUTED_BACKUP` |
| Replay | Backup `ReplayResultRecorded`, `consistent=true` |
| Inspector decision | `REFUND_TO_BUYER` |
| Final state | `18 (REFUNDED)` |
| Buyer claimable after withdraw | `0 wei` |
| totalWithdrawn | `5,000,000,000,000,000 wei (0.005 ETH)` |
| outstandingClaimable | `0 wei` |
| accountingConserved() | `true` |

### Key public transaction trail

```text
activate
0xe8df43a483e336133d2083987a8584e78005edb8d389d889823d58fa080d9150
→ AWAIT_SUPPLIER

Supplier submitInspection
0x29d71a9fccb4a062ea4fb627d07d2724ad91287f370c2b10fbc5ee3b3b33e98e
→ ADMISSIBLE_PASS → AWAIT_BUYER

Buyer submitInspection
0x8cf9fa20824d588a1896f4f3d43eb98a0c0b536bc64debf9a06f685f4763a994
→ ADMISSIBLE_REVIEW → DISPUTED_PRIMARY

activateBackupInspector
0x8d26b9669fe8ee41db0353b20e456908dc41c5703c8f61c2d7456fda6540a823
→ DISPUTED_BACKUP

Backup recordReplayResult
0x5a018554bac8ca8876c6ef84f8732436b0ef9db0d922a8c017cedfb16c6a2be0
→ consistent=true

Backup submitInspectorDecision
0x3a94aa420901aa1d061c23e5cf40f669eb8f89e88e760a214aba8fa62be48674
→ REFUND_TO_BUYER → REFUNDED

Buyer withdraw
0x5183318aafe01643879771af8d66820dc3e2bfeb206ec9881323d7735c168bd2
→ claimable=0, totalWithdrawn=0.005 ETH
```

Full machine-readable record: [FINAL_SEPOLIA_E2E_20261011.json](packages/phase3b_20261010/results/FINAL_SEPOLIA_E2E_20261011.json)

## Frozen AI ↔ Contract handoff

| Field | Frozen value |
|---|---|
| policyVersion | `1` |
| policyHash | `0x85cd60bd89d1c82d39a313443723997283d79a46ec415c4c1064088ffe3f9d11` |
| modelBundleHash | `0x64f3359a4e9a276a5f0abef0e5305f42b513dbae1ac5698cb08c9e066962383e` |
| scoreSchemaId | `0xcf1476a2ae70ac5fad6ba79a7f55bab4b4c4973dd892d65de9a887bf08d1f1f8` |
| thresholdScaled | `57904037` |
| scoreScaleExponent | `6` |
| Supplier evidencePackageHash | `0x73f141e55ac41d24eb81574ae6ffcaf406bd331f14abe49081dd439f0be5d986` |
| Buyer evidencePackageHash | `0x59a8b83d7674fbce7e776fc341d7fc06c8cd13d34deb3223146b341a73af1d43` |
| Backup replayReportHash | `0x18cb6feb5af67a5907a1c9f4fc3dcfaf7dcc19b1063da337174daca752d0bd1d` |

## Five-layer design

```text
PHYSICAL — specimen / camera / capture conditions
      ↓
AI — PatchCore score & heatmap / frozen threshold
      ↓
EVIDENCE — raw image hash / package hash / Station attestation
      ↓
TRUST — Web + Wallet → Sepolia smart contract / role & state rules
      ↓
ECONOMIC — escrow lock / independent replay / inspector decision / withdraw
```

**Responsibility split:** 창재현 — Google Colab AI, model bundle, evidence and replay; 김지환 — website, wallet/transactions, Sepolia contract integration and settlement UI.

## What this demo proves — and does not prove

The completed flow demonstrates a real testnet transaction chain connecting actual PatchCore inference outputs to signed evidence, escrow state transitions, replay gating, inspector failover, human settlement authority and pull-payment accounting.

It **does not** prove that a physical item is genuine, that Supplier and Buyer images are the same physical specimen, that public MVTec data has production custody provenance, or that replay consistency is a universal cross-machine guarantee. The current replay evidence is a controlled artifact-reload consistency check; the human Inspector remains responsible for the final settlement judgment.

## Documents

- [Final evidence index](docs/FINAL_EVIDENCE_INDEX.md)
- [Final red-team master](docs/FINAL_RED_TEAM_MASTER_20261023_KO.md)
- [PATCH3 mentor-hardening spec](docs/PATCH3_MENTOR_HARDENING_SPEC_KO.md)
- [PATCH3 trust assumptions](docs/PATCH3_TRUST_ASSUMPTION_REGISTER_KO.md)
- [Physical Capture Protocol V1](docs/PHYSICAL_CAPTURE_PROTOCOL_V1_KO.md)
- [2026-10-11 final Korean status](docs/STATUS_20261011_KO.md)
- [2026-10-11 final audit](docs/LATEST_AUDIT_20261011.json)
- [Architecture and trust boundaries](docs/architecture.md)
- [Implementation status](docs/implementation-status.md)
- [AI ↔ Web ↔ Smart Contract handoff](docs/integration-contract.md)
- [Negative tests and acceptance checks](docs/validation-matrix.md)
- [Release checklist](docs/release-checklist.md)

## Security and provenance

Never commit wallet private keys, mnemonics, secrets, RPC tokens, private production images, full raw datasets, or large weights. Dataset MVTec AD is **CC BY-NC-SA 4.0** and the present demo is a public-dataset simulation, not a commercial production dataset claim.
