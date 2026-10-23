# PATCH3 Red-Team Status — 2026-10-23

Branch: `patch3-mentor-hardening`  
Candidate: `PHASE2-PATCH3-CANDIDATE`

## Current local gate

GitHub Actions run: `39893169652`

Result:

- Solidity compile: **PASS**
- EIP-170 runtime-size gate: **PASS**
- EIP-3860 initcode-size gate: **PASS**
- local Anvil hostile red-team: **35 PASS / 0 FAIL**
- final accounting conservation: **PASS**

Bytecode with frozen candidate build settings:

| Contract | Creation | Runtime |
|---|---:|---:|
| CredentialRegistryPatch3 | 1,668 B | 1,494 B |
| InspectEscrowPatch3 | 24,556 B | 23,185 B |

Build settings:

```text
Solidity 0.8.26
optimizer = true
optimizer runs = 200
viaIR = true
EVM target = Cancun
OpenZeppelin = 5.5.0
```

The deployment-size gate is important because an earlier monolithic candidate exceeded the EIP-170 runtime limit. Credential lifecycle was therefore separated into a narrow `CredentialRegistryPatch3`, leaving settlement/business-rule logic in the Escrow contract.

## Security / authority checks currently passing

- Credential Authority cannot be a Supplier/Buyer/Inspector/Station role.
- Invalid Station signature is revert-only and cannot force a hold.
- Funded trade rejects policyHash tampering.
- Backup Station key cannot authorize Primary replay.
- Random actor cannot submit a valid Inspector decision.
- Credential lifecycle methods are not present in Escrow ABI.
- No admin settlement / sweep / policy / threshold / fallback mutation function was introduced.
- Revoked Arbitrator Station cannot authorize arbitration.
- REVOKED credential cannot be resumed.
- SUSPENDED credential can be restored for future trades.
- Final fallback is precommitted and executable by any caller only after the deadline.

## Liveness matrix currently passing

- AWAIT_SUPPLIER timeout → REFUNDED
- SUPPLIER_REINSPECTION timeout → REFUNDED
- SUPPLIER_HOLD timeout → REFUNDED
- ACCEPTANCE_PENDING timeout → RELEASED
- BUYER_INSPECTION_TIMEOUT → External Arbitration → REFUNDED
- EXECUTION_HOLD → Arbitration timeout → precommitted fallback
- EVIDENCE_HOLD → Arbitration timeout → precommitted fallback
- DISPUTED_PRIMARY timeout → independent Backup → settlement
- DISPUTED_BACKUP timeout → ESCALATED
- ESCALATED → Arbitration timeout → precommitted fallback
- CREDENTIAL_HOLD → Arbitration/fallback
- Arbitrator credential failure → final fallback remains available

All tested routes were followed through recipient `withdraw()` and final accounting conservation.

## Interoperability gate

Real frozen Supplier evidence was used as the golden fixture:

- raw score `55.442035675048828`
- `ROUND_HALF_UP × 10^6 = 55442036`
- frozen Supplier JCS manifest bytes
- `specimenManifestHash = 0x0c39c0ad9a76fb194c92d9864fa64ce2afbfe00c979ec762bffaf2c8eb436557`
- EIP-712 `StationAttestation`

PASS:
- JavaScript canonical bytes = frozen JCS
- Python canonical bytes = frozen JCS
- JavaScript score integerization = Python = frozen score
- JavaScript EIP-712 digest = Solidity `hashStationAttestation()`
- Python independently recomputed EIP-712 digest = JS = Solidity
- Python and JavaScript independently recover the same Supplier Station signer

## Exception-specific fallback policy

The original single global fallback was red-teamed as too coarse. PATCH3 now freezes separate fallback outcomes for:

- Buyer inspection timeout
- Execution hold
- Evidence hold
- Inspector escalation
- Credential hold

This permits, for example, a Buyer-no-show fallback to be RELEASE while execution/evidence-integrity failures remain REFUND. There is no post-activation fallback-policy setter.

## Important claim boundary

This is **local synthetic protocol evidence**, not:
- an independent professional smart-contract audit,
- formal verification,
- a production-security certification,
- a new Sepolia deployment.

The proven public-chain baseline remains PHASE2-PATCH2 until PATCH3 completes all gates and a new deployment is intentionally approved.

## Still open before PATCH3 GO

- Python ↔ JavaScript ↔ Solidity interoperability golden vector
- broader digest-reuse cases across Replay/Inspector/Arbitration attestations
- additional registry-governance abuse cases
- final ABI / typed-data freeze
- static-analysis / security audit refresh
- new Sepolia funded E2E only after all prior gates PASS
