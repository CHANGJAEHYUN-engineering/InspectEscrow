# Implementation audit — funded Sepolia E2E update 2026-10-11

| Part | Evidence | GitHub status |
|---|---|---|
| Legacy static UI / hash demo | Existing public files | Present |
| Frozen PatchCore V2 | Colab notebook + score/heatmap/replay/manifest sources, AI manifest 75/75 | Present under `packages/ai_20261010` |
| Model metrics | Validation N=63 F1=0.8205 / recall=84.21%. Additional 89-image V2 post-hoc AUROC=0.93036, not independent untouched test | Present |
| Phase3B Web3 frontend | EIP-1193/ethers integration and EIP-712 flows | Present under `packages/phase3b_20261010` |
| Contract/ABI | Frozen Solidity SHA-256 `4effb1ee5a18f4c75ae6eb8eaa1ec051a03da9efb4799beffe8772439cf3e6da`, ABI 113 entries | Present |
| Local E2E | Archived 20 PASS / 44 tx tagged LOCAL_SYNTHETIC_ONLY | Present |
| Funded Sepolia AI→chain dispute | Supplier PASS + Buyer REVIEW reached `DISPUTED_PRIMARY` | **Completed** |
| Inspector liveness failover | Primary timeout → `activateBackupInspector` → `DISPUTED_BACKUP` | **Completed** |
| Independent replay gate | Backup `ReplayResultRecorded`, `consistent=true` | **Completed** |
| Inspector settlement | Backup Inspector signed `REFUND_TO_BUYER` | **Completed** |
| Pull-payment settlement | Buyer `claimable=0.005 ETH` then `withdraw()` | **Completed** |
| Final accounting | `totalWithdrawn=0.005 ETH`, `outstandingClaimable=0`, `accountingConserved()=true` | **Completed** |

Final state: `18 (REFUNDED)`.

See:
- [Final Sepolia E2E JSON](../packages/phase3b_20261010/results/FINAL_SEPOLIA_E2E_20261011.json)
- [2026-10-11 Korean status](STATUS_20261011_KO.md)

The demo remains a public-dataset simulation. It must not be presented as proof of physical same-item identity, production custody provenance, or universal cross-machine replay reproducibility.
