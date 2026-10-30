# InspectEscrow PATCH3 — Smart contracts and test sources

This directory contains the **PATCH3 contract source and validation scripts** used for the 2026 proof of concept. The Solidity and Red-Team source files were imported without modification from the existing public development branch after matching their Git blob hashes against the local tracked source.

## Components

- [InspectEscrowPatch3.sol](contracts/InspectEscrowPatch3.sol): policy commitments, role-bound state transitions, dispute handling, escrow accounting and withdrawal.
- [CredentialRegistryPatch3.sol](contracts/CredentialRegistryPatch3.sol): independently managed ACTIVE / SUSPENDED / REVOKED station credentials.
- [policy/](policy/): policy commitment generation and input template.
- [scripts/](scripts/): contract compilation, preflight, signature checks and operator-driven transaction workflows.
- [test/](test/): Red-Team, interface freeze and Python/JavaScript interop checks.

## Deployment

- Network: Ethereum Sepolia, chain ID `11155111`
- Escrow: `0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905`
- Credential registry: `0xc715A0263B752c9D0Be99379b7939466Af5fd20e`
- See [PATCH3 Sepolia and Model B results](../../docs/PATCH3_SEPOLIA_AND_MODEL_B_20261031_KO.md) for actual deployment and transaction evidence.

These scripts are development-source material, **not a standalone installer**. Running them requires the dependencies, ABI/contract artifacts, network configuration and authorized wallet setup used during the original test. Transaction-sending scripts must not be executed without an explicit operator review. Do not place secrets in this repository.

The current integrated Model B Windows UI and its dynamic Trade ID work are developed locally and are **not part of this source snapshot**. This code should not be described as the final packaged 2F website.

## Test provenance

The earlier local PATCH3 Red-Team report records **36/36 PASS**, based on Anvil, while the actual Sepolia proofs cover separately recorded transactions. See [security test matrix](../../docs/SECURITY_VALIDATION_MATRIX_20261031_KO.md). A historical PASS is not a claim that the full suite was rerun as part of this GitHub publication.
