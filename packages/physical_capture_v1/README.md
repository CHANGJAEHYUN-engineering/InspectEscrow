# InspectEscrow Physical Capture Console V1

Purpose:
- enforce TOP → FRONT → SIDE order
- compute keccak256 of exact original file bytes before inference
- create chained per-view EIP-712 capture attestations
- seal a 3/3 session before inference is allowed
- export a session JSON
- re-import that JSON at finals and verify image hashes, signatures and sequence chain

Run from the packages directory using a local HTTP server. Example:

    cd packages
    python -m http.server 8000

Then open:

    http://localhost:8000/physical_capture_v1/

Requirements:
- MetaMask/EIP-1193 wallet
- Sepolia selected
- Station signing wallet
- no private key is stored by this package

EIP-712 capture signatures are off-chain physical-evidence attestations. The current Solidity contract does not claim that these signatures prove camera sensor truth. The final Evidence Package can retain their digests/signature envelopes and its own package hash is what the escrow protocol anchors.

Protocol specification:
- docs/PHYSICAL_CAPTURE_PROTOCOL_V1_KO.md

Do not run PatchCore until the console shows SEALED_INFERENCE_ALLOWED.
