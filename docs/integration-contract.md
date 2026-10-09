# AI / Evidence / Web / Blockchain integration handoff

**Checklist only. No arbitrary ABI, field type or signature is asserted as frozen here.**

1. **Deployment identity:** Sepolia `chainId=11155111`, bytecode-matched deployed contract/source/ABI/compiler config, verified address and version.
2. **Trade terms:** `policyVersion` (nonzero `uint32` required per earlier team preflight, final frozen value still to be checked), policy/model/capture/product commitments, threshold, deadlines, inspectors and escrow. Match actual Solidity struct field list and order.
3. **Score encoding:** PatchCore float → deterministic on-chain integer; explicit scale, rounding, overflow checks and `score == threshold` golden test vector.
4. **Hashing:** Hash **raw image bytes**, not filename/JSON display; lock canonical JSON byte encoding for packages and source manifest; record model bundle and capture-profile SHA.
5. **EIP-712 Station Attestation:** Fix domain name/version, chainId, verifyingContract, exact typed fields/typehash, nonce, deadline, signing address. Verify a golden signature on chain. EIP-712 alone does NOT supply nonce-based replay protection.
6. **Role enforcement:** Role picker is UI only. Prove Supplier/Buyer/Inspector caller permissions via contract tests and receipts.
7. **Replay:** Same original bytes + frozen model/preprocess → measured new score with explicit tolerance; mismatch must not enable settlement. Document reviewer authority and failure path.
8. **Live integration:** receipt (status/tx/block/log), current on-chain state and claimable/withdraw balance proof, preserving tradeId and evidence digests end to end.

**Release blocker:** verified matching source+ABI, score scale, EIP-712 vector, canonicalization, exact code artifacts, and role-specific tx trace must exist before claiming end-to-end completion.
