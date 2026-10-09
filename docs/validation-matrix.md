# Validation matrix (targets, not reported test passes)

| ID | Test | Required observable evidence | Status on public repo |
|---|---|---|---|
| T01 | Cannot change pre-agreed model/threshold | before/after contract state and revert | Pending |
| T02 | Supplier actual AI PASS | raw image digest, model version, station sig, tx receipt | Pending |
| T03 | Buyer REVIEW locks funds | real inference + dispute event and locked balance | Pending |
| T04 | Wrong Station / reused nonce | negative signature tests, revert | Pending |
| T05 | Model, policy or capture hash substitution | rejected transaction, hash mismatch log | Pending |
| T06 | Replay original image+bundle returns consistent score | original/replayed scores, epsilon and digests | Pending |
| T07 | Replay mismatch stops automatic settlement | hold state test | Pending |
| T08 | Primary/Backup Inspector timeout escalation | event/state trace, no silent payout | Pending |
| T09 | Decision → claimable → withdraw | tx receipts, account balance delta | Pending |
| T10 | Unauthorized withdrawal / reentrancy / double-settle | Foundry tests/invariants and source version | External Phase 2 test history; raw logs pending import |

An earlier Foundry test record does **not** certify that these cross-layer live Sepolia tests have passed. For each true PASS store run date, source commit, environment, tradeId, data hash, expected/actual and receipt or raw test log.
