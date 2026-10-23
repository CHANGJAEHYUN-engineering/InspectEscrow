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
- hostile Anvil red-team **25 PASS / 0 FAIL**
- finite-exit matrix for the critical funded hold states PASS
- accounting conservation PASS

Credential lifecycle is intentionally separated into `CredentialRegistryPatch3.sol` so credential security authority is distinct from escrow settlement authority.

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
10. regenerate ABI / EIP-712 schema only after source freeze

Design source:
`docs/PATCH3_MENTOR_HARDENING_SPEC_KO.md`
