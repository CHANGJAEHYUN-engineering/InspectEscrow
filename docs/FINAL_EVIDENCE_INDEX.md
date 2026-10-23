# InspectEscrow — FINAL EVIDENCE INDEX

Status: **WORKING INDEX / authoritative pointers only**  
Last updated: 2026-10-23

This file exists so reviewers do not need to guess which artifact is authoritative.

## A. Proven baseline — PHASE2-PATCH2

- Contract version: `PHASE2-PATCH2`
- Sepolia contract: `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9`
- Completed trade: `0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c`
- Escrow: `0.005 ETH`
- Final state: `REFUNDED`
- Buyer withdraw: completed
- `accountingConserved() = true`

Authoritative machine-readable record:
- `packages/phase3b_20261010/results/FINAL_SEPOLIA_E2E_20261011.json`

Human-readable status:
- `docs/STATUS_20261011_KO.md`

## B. Frozen AI / policy values used by the completed Sepolia trade

- policyVersion: `1`
- policyHash: `0x85cd60bd89d1c82d39a313443723997283d79a46ec415c4c1064088ffe3f9d11`
- modelBundleHash: `0x64f3359a4e9a276a5f0abef0e5305f42b513dbae1ac5698cb08c9e066962383e`
- scoreSchemaId: `0xcf1476a2ae70ac5fad6ba79a7f55bab4b4c4973dd892d65de9a887bf08d1f1f8`
- thresholdScaled: `57904037`
- scoreScaleExponent: `6`
- replayToleranceScaled: `222`

Authoritative policy commitment:
- `packages/ai_20261010/ai/policy/INSPECTION_POLICY_V1_1_COMMITMENT.json`

Model-bundle integration clarification:
- `packages/ai_20261010/ai/policy/FINAL_POLICY_INTEGRATION_CLARIFICATION_V1.json`

## C. AI result provenance

Supplier:
- input: `demo/good/000.png`
- raw score: `55.442035675048828`
- scaled: `55442036`
- outcome: `ADMISSIBLE_PASS`
- evidencePackageHash: `0x73f141e55ac41d24eb81574ae6ffcaf406bd331f14abe49081dd439f0be5d986`

Buyer:
- input: `demo/scratch/022.png`
- raw score: `60.138172149658203`
- scaled: `60138172`
- outcome: `ADMISSIBLE_REVIEW`
- evidencePackageHash: `0x59a8b83d7674fbce7e776fc341d7fc06c8cd13d34deb3223146b341a73af1d43`

AI freeze manifest:
- `packages/ai_20261010/ai/core/FINAL_AI_FREEZE_MANIFEST.json`

Important evaluation caveat:
- V2 89-image result is **POST_HOC COMPARATIVE**, not an untouched held-out test.

## D. Replay evidence

- replayReportHash: `0x18cb6feb5af67a5907a1c9f4fc3dcfaf7dcc19b1063da337174daca752d0bd1d`
- final result: CONSISTENT
- verified runtime pair: CPU ↔ NVIDIA Tesla T4 CUDA
- full-demo observed max scaled difference: `111`
- frozen tolerance: `222`
- universal cross-machine guarantee: **NO**

Artifacts:
- `packages/ai_20261010/ai/reproducibility/E3_CPU_VS_CUDA_CROSS_RUNTIME_REPLAY.json`
- `packages/ai_20261010/ai/reproducibility/E3_FULL_DEMO_CPU_CUDA_ENVELOPE.json`
- `packages/ai_20261010/ai/policy/AI_REPLAY_TOLERANCE_POLICY_V1.json`

Lineage note:
- the replay-tolerance artifact retains a predecessor modelBundleHash for provenance;
  the active final Model Bundle for the Sepolia trade is `0x64f335...`.

## E. Public transaction trail

- proposeTrade: `0xa9116ec4f58803f1985924665e6bfb46a455c2d732c7ec531092c779c40e889c`
- supplier.acceptPolicy: `0xad8d3e74de6b5675003854d2d1561780a4d0ec0832ce171017593d74abf8cceb`
- activate: `0xe8df43a483e336133d2083987a8584e78005edb8d389d889823d58fa080d9150`
- Supplier submitInspection: `0x29d71a9fccb4a062ea4fb627d07d2724ad91287f370c2b10fbc5ee3b3b33e98e`
- Buyer submitInspection: `0x8cf9fa20824d588a1896f4f3d43eb98a0c0b536bc64debf9a06f685f4763a994`
- activateBackupInspector: `0x8d26b9669fe8ee41db0353b20e456908dc41c5703c8f61c2d7456fda6540a823`
- Backup replay: `0x5a018554bac8ca8876c6ef84f8732436b0ef9db0d922a8c017cedfb16c6a2be0`
- Backup decision: `0x3a94aa420901aa1d061c23e5cf40f669eb8f89e88e760a214aba8fa62be48674`
- Buyer withdraw: `0x5183318aafe01643879771af8d66820dc3e2bfeb206ec9881323d7735c168bd2`

## F. Hardening candidate — NOT YET A PROVEN REPLACEMENT

PATCH3 design:
- `docs/PATCH3_MENTOR_HARDENING_SPEC_KO.md`

Development branch:
- `patch3-mentor-hardening`

Candidate workspace:
- `packages/phase3c_hardening_20261023/`

Until PATCH3 tests, audits and a new funded E2E pass, **PHASE2-PATCH2 remains the proven baseline**.

## G. Final red-team source of truth

- `docs/FINAL_RED_TEAM_MASTER_20261023_KO.md`

Every critical attack must be closed as one of:
- DESIGN FIX
- EVIDENCE
- CLAIM BOUNDARY

## H. Still-open final submission evidence

- [ ] Physical Capture Protocol + same-specimen demo
- [ ] pre-inference ordered image commitments
- [ ] blind physical-specimen frozen-model result
- [ ] PatchCore vs baseline comparison
- [ ] PATCH3 finite-liveness tests
- [ ] credential suspend/revoke tests
- [ ] Primary/Backup/Arbitrator key-separation tests
- [ ] policy-tamper rejection demo
- [ ] replay-mismatch HOLD demo
- [ ] Python ↔ JS ↔ Solidity golden interop vector
- [ ] discoverable public Foundry test suite / reproduction commands
- [ ] external hosting/release of large frozen model artifacts + checksum
- [ ] final 8-minute pitch + hostile 2-minute Q&A
- [ ] backup demo recording

No unchecked item may silently be presented as completed.
