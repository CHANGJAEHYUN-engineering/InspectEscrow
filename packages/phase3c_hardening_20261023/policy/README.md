# PATCH3 Policy Freeze

PATCH3 must **not** reuse the PHASE2-PATCH2 policy hash.

Reason: PATCH3 materially changes settlement and authority semantics:
- separate Primary / Backup Inspector Station credentials
- External Arbitrator role + Station
- Credential Registry / revocation semantics
- mutual-resolution and external-arbitration windows
- contextual precommitted fallback outcomes
- Inspector decision evidence-basis hash

Workflow:

1. Copy `PATCH3_POLICY_INPUT_TEMPLATE.json` to `PATCH3_POLICY_INPUT.json`.
2. Fill only public addresses / tradeId / deployment addresses and approved windows/fallbacks.
3. Never place private keys or seed phrases in the input.
4. Run:
   `node packages/phase3c_hardening_20261023/policy/generate-patch3-policy.mjs`
5. Verify generated commitment reports `selfHashRecomputation=true`.
6. Use the generated `policyHash` in PATCH3 TradeTerms.
7. Supplier and Buyer accept that exact policy before funding.

The frozen PATCH2 AI/model/capture semantics are inherited where unchanged. This is a new policy version because authority and settlement rules materially changed.
