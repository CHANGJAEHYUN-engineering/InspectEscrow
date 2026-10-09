# InspectEscrow source intake audit — 2026-10-10

## Actual supplied source packages, not hypothetical integration

- AI package: `InspectEscrow_AI_GITHUB_SYNC_20261010(1).zip`. 75 listed artifacts matched SHA-256. Contains actual Colab notebook (16 cells, 13 code cells), score records, policy / model bundle commitments, evidence visualizations, replay and reproducibility reports. The large 232MB core model and 132MB memory bank and original image data were intentionally excluded.
- Phase3B: `InspectEscrow_PHASE3B_GITHUB_LATEST_20261010.zip`. 26 listed artifacts matched SHA-256. Contains browser Web3 frontend, frozen Solidity SHA-256 `4effb1ee5a18f4c75ae6eb8eaa1ec051a03da9efb4799beffe8772439cf3e6da`, ABI (113 entries), EIP-712 schema, synthetic local E2E execution record and Sepolia receipt snapshot.
- Cross-file static checks passed: byte-identical artifact ABI, ABI-aligned 16 StationAttestation tuples, trade terms and AI `thresholdScaled=57904037`, `scoreSchemaId=0xcf1476a2ae70ac5fad6ba79a7f55bab4b4c4973dd892d65de9a887bf08d1f1f8`. Both use `modelBundleHash=0x64f3359a4e9a276a5f0abef0e5305f42b513dbae1ac5698cb08c9e066962383e` in current freeze documents.

## Measured AI and limits

PatchCore V2, backbone wide_resnet50_2. Validation N=63, threshold 57.90403747558594, recall 84.21%, FPR 9.09%, F1 0.8205. Additional 89-image evaluation: AUROC 0.93036, AP 0.98264, F1 0.9091 — **POST-HOC COMPARATIVE**, since these images had been analyzed during the prior V1 work. Never describe this as untouched independent test.

Demo DISPUTE: Supplier `demo/good/000.png` score `55442036` scaled → PASS; Buyer `demo/scratch/022.png` score `60138172` scaled → REVIEW. Frozen threshold `57904037`.

## Blockchain evidence and exact boundary

Frozen contract version PHASE2-PATCH2, Sepolia 11155111 at `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9`. Uploaded receipt snapshot at 2026-10-09T22:41:46Z says tradeId `0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c` was **PROPOSED**.

- `proposeTrade` tx `0xa9116ec4f58803f1985924665e6bfb46a455c2d732c7ec531092c779c40e889c`, uploaded status=1.
- Supplier `acceptPolicy` tx `0xad8d3e74de6b5675003854d2d1561780a4d0ec0832ce171017593d74abf8cceb`, uploaded status=1.
- Next: Buyer acceptPolicy → Primary and Backup Inspector accept → Buyer fund → activate. Then, and only after valid actual evidence & station signing, `submitInspection`.
- Local test record shows 20 PASS / 44 tx, tagged `LOCAL_SYNTHETIC_ONLY`. These are not Sepolia AI evidence transactions; we have not independently rerun an Anvil node.

## Obsolete records and safety

The AI archive's older `PHASE2_PATCH2_AI_COMPATIBILITY_AUDIT_PATCH2.json` has a historical model bundle digest `0x5283badc...`; it is superseded by the final `0x64f3359a...` trade freeze. Earlier unused-tradeId preflight files are **time-scoped historical records**, not permission to call proposeTrade again.

Source ZIP files are prepared for import but **are not yet all uploaded to GitHub**. No private signing keys or secrets should be added. A public MVTec demonstration does not establish physical same-item custody or production suitability. Final cross-layer E2E requires real Station signatures, transaction receipts, replay decision and withdraw/accounting proof.

See [integration contract](integration-contract.md) and [testing targets](validation-matrix.md).
