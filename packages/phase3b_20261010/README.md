# InspectEscrow Phase3B — Sepolia Integration Frontend

This package contains the frozen Web3 integration frontend, exact contract baseline, EIP-712 schemas, local synthetic test evidence, and the completed funded Sepolia dispute-flow record.

## Current demo mode

Open `index.html` through `serve.py` or another local HTTP server.

The page now starts in **evidence dashboard mode** and shows the completed funded Sepolia E2E:

```text
Supplier PASS
→ Buyer REVIEW
→ DISPUTED_PRIMARY
→ Primary timeout
→ Backup failover
→ Replay CONSISTENT
→ Inspector REFUND_TO_BUYER
→ REFUNDED
→ Buyer withdraw
```

The top of the page is read-oriented and suitable for the hackathon demo. The original signing/transaction console remains available under the collapsible **Operator / Transaction Console** section.

### Live verification

With MetaMask on Sepolia, press **온체인 최종상태 재검증**. The frontend verifies:
- chainId 11155111
- masked deployed runtime against frozen artifact
- EIP-712 domain
- trade state `REFUNDED`
- Buyer claimable `0`
- `accountingConserved() == true`
- totalWithdrawn at least the demo escrow amount

No write transaction is sent by this verification action.

## Final evidence

- `results/FINAL_SEPOLIA_E2E_20261011.json`
- `results/SEPOLIA_LIVE_PROGRESS.json`

## Safety

Do not commit or paste private keys, mnemonics, RPC secrets, or production private images. The public MVTec demo is not proof of same-physical-item identity or production custody provenance.
