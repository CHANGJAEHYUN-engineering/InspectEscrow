# InspectEscrow — AI Quality Inspection × Blockchain Escrow

> 2026 AI × BLOCKCHAIN Hackathon · TRACK 4 · Team **창지환**
>
> **Public-repo status: 2026-10-10.** The legacy browser demo remains available. The team's newer Colab AI, frozen Solidity, and live-web work is being prepared separately; its full source and a single-trade E2E proof have **not yet been imported and independently reproduced from this repository**.

InspectEscrow addresses disagreement between **Supplier outbound** and **Buyer inbound** AI-supported manufacturing inspections. Pre-agreed model, threshold, capture protocol, signed evidence, independent replay, inspector authority and blockchain escrow aim to prevent unilateral changes and unsafe settlement.

## What the repository actually contains

| Area | Status in this public repository |
|---|---|
| `index.html`, `app.js`, `style.css`, SVG | **Legacy interactive prototype, simulated transaction flow** |
| Browser-generated manifest and SHA-256 demo | **Prototype**, not Station or physical authenticity proof |
| Colab PatchCore inference code / checkpoints / measured metrics | **Pending import** |
| Frozen Solidity, Foundry tests, ABI / Sepolia deployment manifests | **Pending import** |
| Live wallet → AI evidence → trade dispute → withdraw proof | **Pending verification** |

The live legacy website must **not** be treated as evidence that real AI or blockchain integration has passed.

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
