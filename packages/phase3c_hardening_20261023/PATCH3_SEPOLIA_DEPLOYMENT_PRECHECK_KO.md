# PATCH3 Sepolia Deployment Precheck

Status: **READY FOR LOCAL BROADCAST EXECUTION — NOT DEPLOYED**  
Date: 2026-10-26

This document is a hard gate. No PATCH3 Sepolia transaction should be sent unless the remaining local-wallet checks pass.

## 1. Proven baseline protection

The deployed PHASE2-PATCH2 baseline remains the public proof of a funded E2E:
- contract: `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9`
- completed trade: `0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c`
- 0.005 ETH funded → dispute → Backup → replay → Inspector refund → withdraw
- accounting conserved

PATCH3 must be deployed as a **new contract pair**. Never overwrite or reinterpret PATCH2 evidence.

## 2. Candidate gates already PASS

- Solidity 0.8.26 compile PASS
- EIP-170 runtime-size PASS
- EIP-3860 initcode-size PASS
- hostile Anvil red-team: **36 PASS / 0 FAIL**
- Python ↔ JavaScript ↔ Solidity golden interop PASS
- five EIP-712 typehashes equal between generated schema and local contract getters
- Slither: untriaged High/Medium in project source = **0**
- Escrow runtime: **22,669 B**
- CredentialRegistry runtime: **1,494 B**
- Inspector decision binds nonzero `decisionEvidenceHash`
- credential suspension/revocation does **not** itself mutate escrow state
- funding rechecks all assigned signing credentials
- frozen public role plan validation: **PASS — 11 unique addresses**
- latest full PATCH3 Solidity CI: **SUCCESS**
  - run: `40322769511`
  - deployment-source freeze commit: `31279e39d3b26210af2b9d755664d67add62a52f`

Authoritative interface freeze:
`packages/phase3c_hardening_20261023/PATCH3_INTERFACE_FREEZE_CANDIDATE.json`

Frozen public role plan:
`packages/phase3c_hardening_20261023/PATCH3_ROLE_PLAN.json`

## 3. Frozen Sepolia roles

### Actors

- Supplier: `0xaE7B8A9B15534829492F9449a67e83aAbd82E7BE`
- Buyer: `0x5B52D3B71dD5B4637B828Fd2a0e8bC78346709eE`
- Primary Inspector: `0xb60F55bC142a078781199C6a1689Bd7a86d4f6a8`
- Backup Inspector: `0xeE9652D5F77ffee10aFeb7854E88f7B83bDAF7dd`
- External Arbitrator: `0x9E3bA22795068b82B3D7C2A998cd40294520c8Ce`

### Signing credentials

- Supplier Station: `0x02883F2C472E6d82B88373448E54a209C27A6779`
- Buyer Station: `0xD5acfa7301BD73FfcBb3f73705E4dA4a2548faab`
- Primary Inspector Station: `0x0d9B5d1caf10e7E66AE1F63A4085387F707d092d`
- Backup Inspector Station: `0x0d88B2aB0E6Aa39c73599C2115b8Ba0C34094a97`
- External Arbitrator Station: `0x6D62A42C2328846778e7120A72b02C90c2eEb8eE`

### Governance

- Credential Registry Authority: `0xA01e44c905CE25377EC5fBBC4064b2d3b5ec4a92`
- Hackathon governance mode: dedicated isolated EOA
- This Authority also acts as deployer for the minimum operational setup.
- Production target remains multisig/dual-control.

Validated hard requirements:
- all 11 role/credential addresses nonzero
- all Actors pairwise distinct
- all Stations pairwise distinct
- no Actor equals any Station
- Authority distinct from every Actor/Station
- Primary/Backup/Arbitrator Station keys are separated
- no private key / seed phrase / mnemonic is stored in the repo

## 4. Credential Authority policy

Authority may:
- register credential
- suspend credential
- resume suspended credential
- revoke credential

Authority may NOT:
- alter TradeTerms
- alter policy/model/threshold
- choose RELEASE/REFUND
- change escrow state directly
- withdraw another party's funds
- sweep escrow
- fast-forward a trade into arbitration/fallback

## 5. Frozen demo fallback policy

This is a **demo policy, not a universal B2B rule**.

- `buyerInspectionTimeout = RELEASE_TO_SUPPLIER`
- `executionHold = REFUND_TO_BUYER`
- `evidenceHold = REFUND_TO_BUYER`
- `inspectorEscalated = REFUND_TO_BUYER`

All outcomes are frozen at trade creation. There is no post-activation fallback setter.

## 6. Frozen demo windows

- Supplier inspection: 3600 s
- Buyer inspection: 3600 s
- Buyer acceptance: 1800 s
- Primary Inspector: 3600 s
- Backup Inspector: 3600 s
- Mutual resolution: 3600 s
- External arbitration: 3600 s

For stage presentation, do not depend on waiting these windows live. Use prepared transactions/recording and live read-only verification.

## 7. Secret-safe local deployment

Never paste a private key into GitHub or chat.

Use local environment variables only:

- `PATCH3_RPC_URL`
- `PATCH3_DEPLOYER_PRIVATE_KEY`

Because the frozen minimum setup uses the Credential Registry Authority as deployer, the deployer private key must resolve to:

`0xA01e44c905CE25377EC5fBBC4064b2d3b5ec4a92`

Before broadcast:
- confirm the Authority/deployer wallet is on Sepolia
- confirm it has sufficient Sepolia ETH
- run the exact source from deployment freeze commit or a descendant with no contract/script semantic changes

Deployment:

```bash
node packages/phase3c_hardening_20261023/scripts/deploy-patch3-sepolia.mjs
```

The deployer refuses non-Sepolia chain IDs and refuses an Authority private key whose derived address does not match the frozen role plan.

## 8. Deployment order

1. checkout/freeze deployment source
2. compile with frozen compiler/settings
3. validate frozen role plan
4. deploy `CredentialRegistryPatch3`
5. register all five Station credentials ACTIVE
6. deploy `InspectEscrowPatch3(registryAddress)`
7. read back CONTRACT_VERSION / Registry / Authority / five ACTIVE credentials
8. run `verify-patch3-deployment.mjs`
9. generate a fresh unused `tradeId`
10. build PATCH3 policy input from actual deployed addresses
11. generate policy schema v1.2 / policyVersion 2 and final policyHash
12. Supplier/Buyer/Inspectors accept exact terms
13. fund one Sepolia E2E
14. execute representative dispute/hardening flow
15. recipient withdraw
16. verify `accountingConserved() == true`
17. verify `balanceCoversLiabilities() == true`

## 9. Post-deploy mandatory negative proofs

At minimum:
- wrong policyHash after funding → REVERT
- Backup Station signature used for Primary → REVERT
- suspended Station new attestation → REVERT without state mutation
- replay inconsistent → EXECUTION_HOLD with finite deadline
- unauthorized Inspector decision → REVERT
- Inspector decision missing `decisionEvidenceHash` → REVERT
- fallback before deadline → REVERT
- final fallback after deadline → terminal settlement
- accounting conservation → true
- balance covers liabilities → true

## 10. GO / NO-GO

### Already PASS

- [x] fresh required role addresses available
- [x] Credential Authority governance chosen
- [x] all address-collision checks PASS
- [x] deployment source commit frozen
- [x] interface freeze unchanged
- [x] latest full CI PASS
- [x] latest static-analysis gate PASS for unchanged contracts
- [x] exact fallback policy frozen
- [x] exact windows frozen
- [x] secret-safe deployment tooling present
- [x] no secret introduced into repository by this finalization work

### Remaining local hard gate

- [ ] Authority/deployer wallet has sufficient Sepolia ETH
- [ ] local RPC + private key injected only through environment variables
- [ ] actual Registry + Escrow broadcast completes and read-back verification passes

Until these three items pass, PATCH3 remains **NOT DEPLOYED**.

If NO-GO, the finals baseline remains the already-proven PHASE2-PATCH2 E2E, and PATCH3 is presented only as a locally verified mentor-hardening candidate.
