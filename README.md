# InspectEscrow — AI Quality Inspection × Blockchain Escrow

> 2026 AI × BLOCKCHAIN Hackathon · TRACK 4 · Team **창지환**
>
> **Evidence snapshot: 2026-10-10.** Both the AI Colab package and Phase3B Web/Solidity package have been received and integrity-audited outside this GitHub repository. Their **complete source ZIPs are not yet committed here**. The public root site remains the legacy browser demo; the uploaded Phase3B frontend is separate. Live Sepolia contains a proposed trade and Supplier policy acceptance only, not a funded end-to-end settlement.

InspectEscrow addresses disagreement between **Supplier outbound** and **Buyer inbound** AI-supported manufacturing inspections. Pre-agreed model, threshold, capture protocol, signed evidence, independent replay, inspector authority and blockchain escrow aim to prevent unilateral changes and unsafe settlement.

## Implementation evidence as of 2026-10-10

| Component | Latest examined source package | Visible in current GitHub? |
|---|---|---|
| Legacy static site / sample manifest | Older interactive browser simulation | **Yes** |
| PatchCore V2 / Colab inference, evidence and replay | Received, 75/75 SHA manifest files verified. Validation F1 **0.8205**; 89-image V2 post-hoc AUROC **0.93036** (not untouched test) | **Source import pending** |
| Frozen Phase3B Web + Solidity / ABI | Received, 26/26 SHA manifest files verified; source digest checked; 113 ABI entries | **Source import pending** |
| Local synthetic Anvil E2E | Archived record: **20 PASS / 44 tx**. No fresh Anvil re-execution | **Evidence import pending** |
| Sepolia DISPUTE trade | Archived receipts: `proposeTrade` and Supplier `acceptPolicy` status 1, state `PROPOSED` at provided snapshot | **Evidence import pending** |
| Funded AI → signed Station evidence → dispute/replay → withdraw | **Not demonstrated yet** | **No** |

**Current frozen handoff:** `policyVersion=1`, `thresholdScaled=57904037`, `scoreScaleExponent=6`, `modelBundleHash=0x64f3359a4e9a276a5f0abef0e5305f42b513dbae1ac5698cb08c9e066962383e`. AI scores are scaled with ROUND_HALF_UP; frozen StationAttestation has 16 ABI-matching fields.

The provided chain state snapshot dated 2026-10-09 22:41:46Z lists `tradeId=0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c` as **PROPOSED**. Older AI `UNUSED` preflight records predate the proposal. **Do not re-propose the same tradeId.**

[Detailed intake audit and outstanding gates](docs/source-intake-audit-20261010.md)

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

**Responsibility split:** 창재현 — Google Colab AI, model bundle, evidence and replay; 김지환 — website, wallet/transactions, Sepolia contract integration and settlement UI. Shared gate — freeze actual ABI, evidence serialization, score quantization, EIP-712 type schema, chain/network and `policyVersion` before sending inspection transactions.

## Documents

- [Architecture and trust boundaries](docs/architecture.md)
- [Evidence-based development status](docs/implementation-status.md)
- [AI ↔ Web ↔ Smart Contract handoff](docs/integration-contract.md)
- [Negative tests and acceptance checks](docs/validation-matrix.md)
- [Second mentoring briefing](docs/mentoring-round-2.md)
- [References and data license](docs/references.md)
- [Source intake & release gate](docs/release-checklist.md)

## Historical blockchain baseline (requires evidence import)

The team previously recorded a Sepolia deployment at `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9` on **chain 11155111**, version `PHASE2-PATCH2`. This is a **prior project record**, not an independent current bytecode/ABI verification on this GitHub branch. It does not prove a funded AI-to-chain trade.

## Preview of existing demo

Open `index.html` or `python -m http.server 8000`. It is **not** the completed live-transactions frontend.

## Security and provenance

Never commit wallet private keys, mnemonics, secrets, RPC tokens, private production images, full raw datasets, or large weights. Dataset MVTec AD is **CC BY-NC-SA 4.0**, not commercial-ready data. Preserve the byte-for-byte frozen contract and import its exact provenance, ABI and test logs rather than rewriting it to match this README. Read the [release checklist](docs/release-checklist.md).
