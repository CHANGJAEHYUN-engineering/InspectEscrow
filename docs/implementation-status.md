# Implementation audit — source intake update 2026-10-10

| Part | Evidence from user-provided source ZIPs | GitHub import |
|---|---|---|
| Legacy static UI / hash demo | Existing public files | Completed |
| Frozen PatchCore V2 | Colab notebook + score/heatmap/replay/manifest sources, AI manifest 75/75 | Full source pending |
| Model metrics | Validation N=63 F1=0.8205 / recall=84.21%. Additional 89-image V2 post-hoc AUROC=0.93036, not independent untouched test | Evidence summary published; source pending |
| Phase3B Web3 frontend | Real EIP-1193/ethers integration code and 4 typed EIP-712 sets | Full source pending |
| Contract/ABI | Frozen Solidity SHA-256 4effb1ee5a18f4c75ae6eb8eaa1ec051a03da9efb4799beffe8772439cf3e6da, ABI 113 entries | Full source pending |
| Local E2E | Archived 20 PASS / 44 tx tagged LOCAL_SYNTHETIC_ONLY; no fresh Anvil execution | Full record pending |
| Sepolia | Archived 2 success receipts, proposed trade and Supplier acceptance, PROPOSED state | Full receipt import pending |
| Funded AI→chain dispute/settlement | Not demonstrated | Incomplete |

See [full source intake audit](source-intake-audit-20261010.md). Do not confuse a prior unused tradeId preflight with the now-proposed trade.
