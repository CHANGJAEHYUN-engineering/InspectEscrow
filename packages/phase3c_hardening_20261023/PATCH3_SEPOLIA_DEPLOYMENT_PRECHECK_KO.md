# PATCH3 Sepolia Deployment Precheck

Status: **READY FOR DEPLOYMENT PARAMETERS — NOT DEPLOYED**  
Date: 2026-10-23

This document is a hard gate. No PATCH3 Sepolia transaction should be sent until every required item below is resolved.

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
- Inspector decision now binds a nonzero `decisionEvidenceHash`
- credential suspension/revocation does **not** itself mutate escrow state
- funding rechecks all assigned signing credentials

Authoritative interface freeze:
`packages/phase3c_hardening_20261023/PATCH3_INTERFACE_FREEZE_CANDIDATE.json`

## 3. Required Sepolia roles

Actor addresses:
- Supplier
- Buyer
- Primary Inspector
- Backup Inspector
- **External Arbitrator**

Signing credentials:
- Supplier Station
- Buyer Station
- **Primary Inspector Station**
- **Backup Inspector Station**
- **External Arbitrator Station**

Governance:
- **Credential Registry Authority**

Hard requirements:
- all 11 role/credential addresses above must be nonzero
- no Actor↔Actor duplicate
- no Station↔Station duplicate
- no Actor↔Station duplicate
- Credential Registry Authority must not equal any Actor or Station
- private keys / seed phrases must never be committed to GitHub

Existing PATCH2 Supplier/Buyer actor/station addresses may be reused only if intentionally approved. PATCH3 must still use distinct Primary/Backup/Arbitrator Station credentials.

## 4. Credential Authority policy

Preferred production-like PoC:
- dedicated multisig authority (e.g. 2-of-3) if operationally feasible

Minimum hackathon fallback:
- isolated dedicated EOA used only for credential lifecycle

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

## 5. Proposed demo fallback policy

This is a **demo policy, not a universal B2B rule**.

- `buyerInspectionTimeout = RELEASE_TO_SUPPLIER`
  - Supplier passed and Buyer failed to perform the agreed incoming inspection.
- `executionHold = REFUND_TO_BUYER`
  - AI execution/replay integrity is unresolved.
- `evidenceHold = REFUND_TO_BUYER`
  - admissible evidence cannot be completed.
- `inspectorEscalated = REFUND_TO_BUYER`
  - Primary and Backup resolution both failed.

All outcomes are frozen at trade creation. There is no post-activation fallback setter.

## 6. Proposed demo windows

Keep the actual finals demo practical while preserving visible timeout semantics.

For the public final demo trade, choose explicit values before proposal and freeze them in the policy. Do not silently reuse PATCH2 windows if the new demo timing requires different values.

Candidate engineering values for a rehearsed Sepolia demo:
- Supplier inspection: 3600 s
- Buyer inspection: 3600 s
- Buyer acceptance: 1800 s
- Primary Inspector: 3600 s
- Backup Inspector: 3600 s
- Mutual resolution: 1800–3600 s
- External arbitration: 1800–3600 s

For stage presentation, do not depend on waiting these windows live. Use prepared transactions/recording and live read-only verification.

## 7. Deployment order

1. Freeze exact deployment commit.
2. Verify interface manifest SHA/typehashes.
3. Select Credential Registry Authority.
4. Deploy `CredentialRegistryPatch3`.
5. Verify registry runtime/source.
6. Register all five Station credentials ACTIVE.
7. Deploy `InspectEscrowPatch3(registryAddress)`.
8. Verify runtime/source.
9. Read and compare:
   - CONTRACT_VERSION
   - registry address
   - EIP-712 domain
   - five typehash getters
10. Only then prepare a fresh unused `tradeId`.
11. Freeze PATCH3 TradeTerms/policy.
12. Run one funded Sepolia E2E.
13. Record every receipt/state/accounting snapshot.
14. Do not call PATCH3 “proven” until withdraw + accounting checks finish.

## 8. Post-deploy mandatory negative proofs

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

## 9. GO / NO-GO

### GO only if
- [ ] fresh required role addresses are available
- [ ] Credential Authority governance chosen
- [ ] all address-collision checks PASS
- [ ] deployment commit is frozen
- [ ] interface freeze remains identical
- [ ] latest CI PASS
- [ ] latest static-analysis gate PASS
- [ ] exact fallback policy approved
- [ ] exact windows approved
- [ ] deployer wallet has sufficient Sepolia ETH
- [ ] no secret is present in repo/logs

### NO-GO if any item fails

If NO-GO, the finals baseline remains the already-proven PHASE2-PATCH2 E2E, and PATCH3 is presented only as a locally verified mentor-hardening candidate.
