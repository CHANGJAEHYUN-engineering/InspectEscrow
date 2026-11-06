# InspectEscrow integrated cloud web — organizer-submission source

**Source snapshot:** 2026-11-06 Railway integrated web production deployment (service: `inspectescrow-integrated-web`, deployment ID `ed39d2d2-0e87-4d2f-9f7e-1e88c0bdc380`). This directory holds the actual Node gateway, Dockerfile, role UI, APIs, EIP-712 remote mutual-resolution flow and controlled Model B +1 replay features.

**Live prototype:** https://inspectescrow-integrated-web-production.up.railway.app/

## Build

```bash
docker build -t inspectescrow-cloud-web .
```

Required runtime configuration: `INSPECTESCROW_DEMO_ACCESS_TOKEN` (nonempty, at least 20 characters; **never commit a value**), `INSPECTESCROW_MODELB_CLOUD_URL` (HTTPS address of compatible live Model B service), `INSPECTESCROW_PUBLIC_ORIGIN` (HTTPS canonical origin), `INSPECTESCROW_PUBLIC_SEPOLIA_RPC` (Sepolia RPC URL). `PORT` is supplied by the hosting platform (default 8080). Set secrets in Railway or local environment, not in Git.

Docker startup uses `cloud-gateway.cjs` to start `app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/server.cjs`, plus a token-guarded Model B adapter. `app/.patch3-build` contains public Ethereum contract ABIs. The browser uses **user MetaMask authorization**; server secrets do not authorize on-chain spending.

## Features

- Six integrated menus; seven role contexts
- Separate **Actor transaction wallet** and **Station EIP-712 evidence signing wallet**
- TOP-model inference with TOP/FRONT/SIDE evidence commitments; hash, signature, policy and replay checks
- Existing Sepolia trade management, role approvals, funding, inspection, dispute, settlement, claimable/withdraw
- Cross-device Supplier/Buyer mutual-resolution signatures. The same typed-data JSON must be transferred; no private key exchange
- Actual cloud Model B rerun (+1 **unsigned** score claim, zero on-chain transactions)

## Privacy / reproducibility

Original specimen photographs and private evidence bundles are **not** committed. The two original S05/S03 capture JPGs previously located under `STAGE_ASSETS` are deliberately excluded. Tests requiring those images must be provided with consent and separately. This is a public-facing PoC, not a production QMS or legal arbitration service.

The on-chain `EXECUTION_HOLD` recorded during the latest E2E is a **controlled negative test**. The independent unsigned `+1` score-comparison demo is a distinct off-chain Model B run; do not represent it as the trigger of that TX.

## Verification

From the repo root:

```bash
node scripts/final_submission_source_parity.mjs
node scripts/submission_public_smoke.mjs
```

For third-party clean-room reproduction, install Node 24+ and Docker. The separately deployed AI service requires a controlled-provisioned Model B artifact; see `../modelb-cloud/README.md`.
