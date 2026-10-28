# InspectEscrow V3 — integration gates / red-team review

**Status: DRAFT; no authorization for Station signing, Inspector attestations, deploy, or existing-trade migration.** This branch is based on `fix/patch3-preflight-exit-code-20261026` and only adds under `packages/ai_v3_candidate/`.

## What the existing PATCH3 contract actually does

- `InspectEscrowPatch3.sol` binds `policyHash`, `modelBundleHash`, `scoreSchemaId` and `thresholdScaled` per trade. `_recordInspection()` derives `ADMISSIBLE_PASS` iff `aggregateScoreScaled < thresholdScaled`.
- `recordReplayResult()` verifies inspector actor, active inspector station credential, signature, nonce, evidence anchors, deadline and policy binding, but **does not recompute the AI score**. It records the station-signed `attestation.consistent` Boolean. The off-chain Inspector must substantiate this Boolean with a canonical, authenticated Replay report before signing.
- Existing `prepare-patch3-station-evidence.mjs` enforces `policyVersion === 2` and old frozen threshold/bridge. Existing `prepare-patch3-replay-dossier.mjs` asserts the historical threshold `57,904,037` and tolerance `222`. These scripts must not be silently reused for V3.

## Required gates prior to any integration

1. **New-trade-only versioning**: adopt reviewed new `policyVersion`, model bundle commitment, score schema semantics, threshold and tolerance. Do not update an existing funded trade or reinterpret old evidence.
2. **Canonical commitments**: derive new bundle and policy commitments from versioned canonical preimages using the contract/registry's **Keccak** rules, independently verify bytes, domain/version and hashes. The draft policy file's SHA-256 is only file-integrity metadata.
3. **Station evidence**: bind trade ID, role, station, image SHA-256, specimen/capture profile, ordered views, preprocessing/runtime provenance, score, policy/model hashes, nonce and validity window into the signed evidence package. The present diagnostic code generates *no* such signature.
4. **Inspector Replay**: independently load the pinned model/checkpoint, verify evidence bytes and execution contract, rerun inference, enforce numeric tolerance **and** identical contract-derived verdict, and sign a committed replay report. Never treat `SCORE_CONSISTENT_DIAGNOSTIC_ONLY` as a contract attestation.
5. **Two independent environments**: validate all required software/runtime versions and independent-machine CPU/GPU differences. The factor-of-two tolerance 512 is a candidate based on a maximum observed same-Kaggle envelope of 256 and is **not** a universal guarantee.
6. **Threshold and failure-mode review**: candidate 45,405,741 was validation-selected and has one validation false negative, four historical post-hoc final_test false negatives and one demo false negative. Require new untouched data, target defect recall criteria, and a documented disposition for missed `demo/scratch/001.png`.
7. **Security boundaries**: pin package/dependency/container digests; protect model memory, signing keys and Station runtime, validate arbitrary image decompression limits, evidence canonicalization, invalid/corrupt captures, replay request authorization, timeouts and operational fallback. A SHA-pinned checkpoint is not a trusted hardware execution attestation.
8. **Integration tests**: submit only deterministic fixtures to a local fork/new test trade, assert EIP-712 domain and type hashes, role and nonce failures, image/hash mismatches, score/decision mismatches, Inspector timeout and backup routing, claimable/withdraw accounting invariants. No Sepolia broadcast without explicit separate approval.

## Provenance

- The handoff ZIP SHA-256 is `a2b6788a8e9d41fdb187b7ff68d5d809578b9a3d6bcea85c04fff1ad96a42780`.
- The full 159-image record SHA-256 is `9b39e8ba433bccbc907ecf05545f4a1f91aec8440c2db2e4611057006deea43c` (not committed in this draft branch; index in `HANDOFF_MANIFEST.json`).
- Existing model core SHA-256 `8ab4beeb37242a742bac75c8f697d4af625eaf5acda339c887d6c77c9f6bd36b` is unchanged.
