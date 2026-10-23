# PHASE3C Mentor Hardening Candidate

Branch: `patch3-mentor-hardening`

This folder is intentionally separate from the funded Sepolia PHASE2-PATCH2 baseline.

## Baseline preservation

Do not modify or overwrite:

- deployed Sepolia PHASE2-PATCH2 contract
- completed funded trade evidence
- `packages/phase3b_20261010/baseline/`

## Candidate status

The candidate has now passed the first local hardening gate:

- compile PASS
- deployable bytecode-size gates PASS
- hostile Anvil red-team **36 PASS / 0 FAIL**
- finite-exit matrix for the critical funded exception states PASS
- accounting conservation PASS

Credential lifecycle is intentionally separated into `CredentialRegistryPatch3.sol` so credential security authority is distinct from escrow settlement authority. Suspension/revocation rejects new signatures but does not itself change escrow state; existing protocol deadlines and precommitted arbitration/fallback rules preserve liveness.

This is still a **candidate**, not a replacement for the proven PHASE2-PATCH2 Sepolia baseline. See `RED_TEAM_STATUS_20261023.md`.

## Implementation order

1. split Primary / Backup Inspector Station keys
2. add external arbitrator role + station
3. add mutualResolution / externalArbitration windows
4. add deterministic final fallback
5. add bounded credential status / revocation
6. add credential-hold path without signature-triggered DoS
7. add arbitration decision typed data
8. test every funded nonterminal state for finite exit
9. test authority abuse and accounting invariants
10. regenerate ABI / EIP712 schema only after source freeze

Design source:
`docs/PATCH3_MENTOR_HARDENING_SPEC_KO.md`

## Sepolia finalization tooling

Pre-broadcast tooling now exists for the last deployment layer:

- `scripts/validate-patch3-role-plan.mjs`
  - validates all Actor / Station / Credential Authority public addresses
  - rejects cross-role collisions
- `scripts/deploy-patch3-sepolia.mjs`
  - Sepolia-only deployment
  - deploys `CredentialRegistryPatch3`
  - registers five Station credentials ACTIVE
  - deploys `InspectEscrowPatch3`
  - performs contract/registry read-back checks
  - writes a secret-free deployment manifest
- `scripts/verify-patch3-deployment.mjs`
  - repeatable read-only verification of the deployed pair
- `scripts/build-patch3-policy-input.mjs`
  - binds actual deployment addresses + role plan + fresh tradeId into policy-v1.2 input
- `PATCH3_FINALIZATION_RUNBOOK_KO.md`
  - exact execution order and GO/NO-GO boundary
- `PATCH3_ENV.example`
  - environment-variable names only; never commit real secrets

The four still-required new public addresses are:

- External Arbitrator actor
- Backup Inspector Station
- External Arbitrator Station
- Credential Registry Authority

No PATCH3 broadcast is authorized merely because these scripts exist. The existing deployment precheck remains the hard gate.
