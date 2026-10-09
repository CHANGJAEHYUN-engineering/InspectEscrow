# Intake checklist — add REAL frozen artifacts, not placeholders

## 창재현 AI/Colab
- [ ] Notebook / runner, pinned environment, random seed, dataset split and license documentation
- [ ] Model bundle manifest, source weights/memory-bank hash (store large binaries outside public repo)
- [ ] Raw-image SHA-256 and consistent canonical evidence manifest / actual heatmap examples
- [ ] Actually measured anomaly AUROC/AP/recall and threshold calibration files
- [ ] Original vs independent replay score logs, mismatch test and tolerance

## 김지환 Web/Contract
- [ ] Frozen InspectEscrow.sol, exact Foundry tests/config/compiler metadata
- [ ] ABI from compiled artifact (never guess), deployed bytecode/source verification
- [ ] Deployment manifest, Sepolia deployment receipt and runtime provenance
- [ ] Web source/package lock, wallet transaction handling and 3-role screenshots
- [ ] Receipt-verified trade including signed Supplier/Buyer submissions, replay, decision and withdraw

## Go/No-go
- [ ] Match `policyVersion`, ABI, EIP-712 domain/type hash and score scaling with actual contract
- [ ] Compare SHA-256 digests and freeze acceptance tests before any funded trading demo
- [ ] Keep all secrets, RPC tokens, mnemonic phrases, private production photos and large weights off GitHub

**Historical UI files remain intentionally untouched as evidence of the preliminary concept.** Do not replace them with unverified production-looking claims.
