# InspectEscrow V3 diagnostic runtime candidate

This package provides an **off-chain-only** PatchCore inference runner that constructs its own model instance from a SHA-256-pinned checkpoint, enforces preprocessing, verifies exact model state including NaN-bearing buffers, and compares integer scores. It is **not** a Station signer, an Inspector Replay attestation, a deployed policy, or an authorized transaction path.

Expected inputs in the user's Kaggle environment:

- Frozen checkpoint SHA-256: `8ab4beeb37242a742bac75c8f697d4af625eaf5acda339c887d6c77c9f6bd36b`.
- Draft policy JSON SHA-256: `63f1aa4ba3b937e9be82f4984b998e5188fbfd5737e38c8c86adcb2ca7d226ef`.
- Dataset images under the original data root.

Sample Kaggle usage, after uploading/extracting this package or copying module into `/kaggle/working/`:

```python
from inspectescrow_v3_runtime import DiagnosticRuntime, score_replay_diagnostic

cpu = DiagnosticRuntime(checkpoint_path=MODEL_PATH, policy_path="/kaggle/working/InspectEscrow_V3_Replay_Policy_CANDIDATE.json", data_root=DATA_ROOT, device="cpu")
gpu = DiagnosticRuntime(checkpoint_path=MODEL_PATH, policy_path="/kaggle/working/InspectEscrow_V3_Replay_Policy_CANDIDATE.json", data_root=DATA_ROOT, device="cuda")
image = "demo/good/000.png"
image_hash = "d7ca543f04733fb91ac02e18d0fbf06dcff554a1b1ad754173c42d10bb026bb6"
a = cpu.infer(image, image_hash)
b = gpu.infer(image, image_hash)
print(a["score_scaled"], b["score_scaled"], score_replay_diagnostic(b["score_scaled"], a["score_scaled"]))
```

## Boundaries and integration

- Tolerance `512` and threshold `45,405,741` are diagnostic **candidates**, not approved policies.
- A SHA-256 policy file digest is not the on-chain `policyHash` (Keccak commitment), and cannot substitute for it.
- No evidencePackageHash, EIP-712 signature, nonce/deadline checks, Inspector authorization, or independent hardware attestation.
- A validator in the same Python process cannot defend against a hostile runtime, monkeypatching, or compromised software dependencies.
- The frozen V2 model bundle and existing PATCH3 trade must not be modified. New V3 binding requires new and formally accepted policy and model bundle commitments.
- Old post-hoc test data and legacy AI evidence cannot be represented as independently validated V3 results.
