# V3 diagnostic evidence index — 2026-10-28

**DRAFT / OFF-CHAIN / NOT APPROVED.** This is a human-readable index to the independently checked Kaggle handoff ZIP, not a substitute for its complete records. The complete evidence ZIP is **not included in this Git branch**; preserve the original handoff archive for independent review.

## Verified handoff ZIP

- Name: `InspectEscrow_V3_GitHub_Handoff_20261028.zip`
- Size: `28,539` bytes
- SHA-256: `a2b6788a8e9d41fdb187b7ff68d5d809578b9a3d6bcea85c04fff1ad96a42780`
- Archive CRC test: passed; all 16 files in the handoff manifest independently matched their listed SHA-256 digests.

## Off-chain test observations

| Check | Observed result |
|---|---|
| 159-image corrected CPU/GPU preprocessor+inference comparison | All classifications stable |
| Validation (63) | TP 18, FP 0, TN 44, FN 1 |
| Historical final_test (89, post-hoc) | TP 67, FP 0, TN 18, FN 4 |
| Demo (7) | TP 2, FP 0, TN 4, FN 1 |
| Maximum score-envelope across 159 images, scaled 1e6 | 256 |
| Historical tolerance 222 | Exceeded by 2 independent-path images |
| Candidate tolerance 512 | 0 mismatches among 159 observed samples |
| Minimum observed threshold margin | 721,884 scaled units |
| Fresh checkpoint CPU/GPU state | 267/267 exact byte matches each |
| Standalone pure unit tests | 9/9 passed on Kaggle |
| Standalone image inference cases | 2/2 passed |
| Standalone negative input tests | 3/3 rejected |

Two observed independent CPU-vs-GPU path deltas exceeded old tolerance 222: `validation/good/110.png` (233) and `final_test/good/001.png` (229). The largest observed *any-pair* envelope of 256 occurred for `validation/good/110.png`.

**Known defects and limits:** `demo/scratch/001.png` incorrectly received PASS under the V3 candidate threshold, while demo scratch/010 and scratch/022 received REVIEW_REQUIRED. The original final_test had already been inspected during development and is not a fresh held-out validation set. No independent machine, hardware enclave, signed Station evidence, EIP-712 Replay, or live chain integration has been validated. Candidate threshold 45,405,741 and Replay tolerance 512 are not approved and do not supersede V2/PATCH3.

## Relevant SHA-256 digests from handoff

- `runtime/inspectescrow_v3_runtime.py`: `7f12246d59373827dbde44bb03040cc31ae08badb02c2bdf62b4568720755db8`
- `test/test_v3_runtime_pure.py`: `b07f53ca5f9a1a081693d21246a84bb7e02a26b30792fc4184f7a3e0fd4ec2ad`
- `evidence/InspectEscrow_V3_Replay_Policy_CANDIDATE.json`: `63f1aa4ba3b937e9be82f4984b998e5188fbfd5737e38c8c86adcb2ca7d226ef`
- `evidence/InspectEscrow_V3_Full_159_Pipeline_Audit.json`: `9b39e8ba433bccbc907ecf05545f4a1f91aec8440c2db2e4611057006deea43c`
- `evidence/InspectEscrow_V3_Standalone_Smoke_Test.json`: `655e6f7b79e6df9f418d0f39f58c145162c4e9c686fcd604e96b21a6d0fcb3a3`

## Scope boundary

- Existing V2 model core SHA-256: `8ab4beeb37242a742bac75c8f697d4af625eaf5acda339c887d6c77c9f6bd36b` (weights unchanged).
- Existing V2 modelBundleHash is **not** a valid V3 execution commitment.
- Policy JSON file SHA-256 is **not** the on-chain `policyHash` (whose canonical Keccak derivation must be separately implemented).
- Do not sign attestations, broadcast transactions, reconfigure any already-funded trade, or classify off-chain score matching as a formally recorded Inspector Replay.
