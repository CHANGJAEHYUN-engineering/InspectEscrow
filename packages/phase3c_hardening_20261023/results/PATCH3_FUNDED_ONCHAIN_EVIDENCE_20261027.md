# InspectEscrow PATCH3 — Sepolia funded trade evidence (2026-10-27 KST)

> Status: **funding confirmed, not activated**. This record captures transaction receipts and read-backs supplied by the executing operator. It is a provenance ledger, not independent third-party audit. No private keys or raw signed secret material are stored.

## Frozen context

- Chain: Ethereum Sepolia (chain ID `11155111`)
- PATCH3 Registry: `0xc715A0263B752c9D0Be99379b7939466Af5fd20e`
- PATCH3 Escrow: `0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905`
- Trade ID: `0x8e07587390de665a8a3c0fe81e1e7298541847acd244db5ea98e5dc3acb3f9db`
- Policy v1.2 / `policyVersion=2`: `0xb3b497c467fe6a060b2317ab8c531f75f5a72a9ca985ac4acc1a0d123b6b7f93`
- Exact deposit: `5000000000000000` wei (`0.005` Sepolia ETH)
- Roles: Supplier `0xaE7B8A9B15534829492F9449a67e83aAbd82E7BE`, Buyer `0x5B52D3B71dD5B4637B828Fd2a0e8bC78346709eE`, Primary `0xb60F55bC142a078781199C6a1689Bd7a86d4f6a8`, Backup `0xeE9652D5F77ffee10aFeb7854E88f7B83bDAF7dd`, External Arbitrator `0x9E3bA22795068b82B3D7C2A998cd40294520c8Ce`.

## Successful on-chain milestones

| Step | Transaction hash | Block | Post-tx state |
|---|---|---:|---|
| Supplier `proposeTrade` | [`0x2cf92964…bb8a712b`](https://sepolia.etherscan.io/tx/0x2cf92964d676ade9588f35dc06a378d708270a5b4c8a59f48b137212bb8a712b) | 11999278 | `PROPOSED(1)` |
| Supplier `acceptPolicy` | [`0x8f4b4889…b88735d4`](https://sepolia.etherscan.io/tx/0x8f4b4889fb9b086741abd11e7fd289550b9889efc82472cbf5931cb4b88735d4) | 11999312 | `PROPOSED(1)` |
| Buyer `acceptPolicy` | [`0xa390950c…335e0fbf8`](https://sepolia.etherscan.io/tx/0xa390950c973a9128e0099fc1393ceaec52dcd5d0f7b134da9ef8aa4335e0fbf8) | 11999372 | `PARTIES_ACCEPTED(2)` |
| Primary `acceptInspectorAssignment` | [`0xb0a84e76…3818ab9f`](https://sepolia.etherscan.io/tx/0xb0a84e76cc88a421b823df58c43feb19c351817022b2c34bed9005373818ab9f) | 11999387 | `PARTIES_ACCEPTED(2)` |
| Backup `acceptInspectorAssignment` | [`0x63c4455d…34d1db1c`](https://sepolia.etherscan.io/tx/0x63c4455d5db99c267682d805eba06a75807948a4c0f779f937ebcd1f34d1db1c) | 11999449 | `PARTIES_ACCEPTED(2)` |
| External `acceptInspectorAssignment` | [`0xab466f34…32f3debe7`](https://sepolia.etherscan.io/tx/0xab466f345c9c71b9084374b10ba83a1242ea72a1fe03fe620c3b2cf32f3debe7) | 11999467 | `INSPECTORS_ACCEPTED(3)` |
| Buyer `fund` with exact 0.005 Sepolia ETH | [`0x948c2de8…0bcadf0b`](https://sepolia.etherscan.io/tx/0x948c2de8f7aaa27f525c24d89e100742fa7fbe3e036832ff035b14ff0bcadf0b) | 11999500 | **`FUNDED(4)`** |

## Funding readback (operator output)

```json
{
  "status": "PATCH3_FUND_CONFIRMED",
  "transactionHash": "0x948c2de8f7aaa27f525c24d89e100742fa7fbe3e036832ff035b14ff0bcadf0b",
  "blockNumber": 11999500,
  "newState": 4,
  "newStateLabel": "FUNDED",
  "depositedWei": "5000000000000000",
  "inspectionDeadline": "0",
  "accountingConserved": true,
  "balanceCoversLiabilities": true,
  "activateCalled": false
}
```

Interpretation:
- The buyer's exact amount has been deposited on-chain under `fund(tradeId)`.
- Contract accounting conservation and coverage checks returned true **at the post-funding readback**.
- `getActionDeadline(tradeId)=0` confirms that supplier inspection timing has not been started at this readback.
- The script does not invoke `activate()`. **Do not imply AI evidence, dispute resolution, refund/release or withdrawal have been demonstrated by this ledger.**

## Next explicit gate

1. Verify the frozen supplier inspection window and end-to-end signing/evidence pipeline readiness; collect station addresses, existing evidence and scripts locally. Avoid activating until the next action can be sent safely before its deadline.
2. `activate(tradeId)` only after readiness check; it is permissionless and begins the supplier inspection deadline. Persist the activation transaction hash, block, exact `actionDeadline` and current state.
3. Supplier evidence and buyer evidence (EIP-712 station attestations bound to frozen policy and station credentials).
4. Primary timeout -> Backup Inspector takeover / Replay, decision, and ledger withdrawal proof, as applicable.
5. Required negative/red-team proofs including revoked Station, stale/replayed signature, deadline state exits, zero locked funds / double-withdraw prevention.

Baseline PATCH2 deployed contract `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9` remains separate. This PATCH3 evidence record does not change baseline behavior.
