from __future__ import annotations

import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from Crypto.Hash import keccak

BUILD = Path(".patch3-build")
VECTOR_PATH = BUILD / "PATCH3_INTEROP_GOLDEN_VECTOR.json"
READABLE = Path(
    "packages/ai_20261010/ai/onchain_demo/DISPUTE/"
    "SUPPLIER_ATTEMPT_1/SUPPLIER_SPECIMEN_MANIFEST_V1.json"
)
FROZEN_JCS = Path(
    "packages/ai_20261010/ai/onchain_demo/DISPUTE/"
    "SUPPLIER_ATTEMPT_1/SUPPLIER_SPECIMEN_MANIFEST_V1.jcs.json"
)

P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
GX = 55066263022277343669578718895168534326250603453777594175500187360389116729240
GY = 32670510020758816978083085130507043184471273380659243275938904335757337482424
G = (GX, GY)

STATION_TYPE = (
    "StationAttestation(bytes32 tradeId,uint8 role,address station,uint32 attempt,"
    "bytes32 sessionNonce,bytes32 policyHash,bytes32 modelBundleHash,"
    "bytes32 captureProfileHash,bytes32 specimenManifestHash,bytes32 evidencePackageHash,"
    "uint128 aggregateScoreScaled,bytes32 scoreSchemaId,uint8 inspectionValidity,"
    "uint8 invalidReason,uint64 issuedAt,uint64 validUntil)"
)
DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"


def k256(data: bytes) -> bytes:
    h = keccak.new(digest_bits=256)
    h.update(data)
    return h.digest()


def hx(data: bytes) -> str:
    return "0x" + data.hex()


def canonical_fixture(obj) -> str:
    # The frozen Supplier manifest uses JSON-safe integers and no values requiring
    # ECMAScript-vs-Python floating point formatting reconciliation.
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def uint256(value: int) -> bytes:
    if value < 0:
        raise ValueError("unsigned integer cannot be negative")
    return value.to_bytes(32, "big")


def b32(value: str) -> bytes:
    raw = bytes.fromhex(value.removeprefix("0x"))
    if len(raw) != 32:
        raise ValueError(f"expected bytes32, got {len(raw)}")
    return raw


def addr32(value: str) -> bytes:
    raw = bytes.fromhex(value.removeprefix("0x"))
    if len(raw) != 20:
        raise ValueError(f"expected address, got {len(raw)}")
    return b"\x00" * 12 + raw


def inv(value: int, modulus: int) -> int:
    return pow(value, -1, modulus)


def point_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    x1, y1 = a
    x2, y2 = b
    if x1 == x2 and (y1 + y2) % P == 0:
        return None
    if a == b:
        if y1 == 0:
            return None
        slope = (3 * x1 * x1) * inv(2 * y1 % P, P) % P
    else:
        slope = (y2 - y1) * inv((x2 - x1) % P, P) % P
    x3 = (slope * slope - x1 - x2) % P
    y3 = (slope * (x1 - x3) - y1) % P
    return (x3, y3)


def point_mul(k: int, point):
    if k % N == 0 or point is None:
        return None
    result = None
    addend = point
    k %= N
    while k:
        if k & 1:
            result = point_add(result, addend)
        addend = point_add(addend, addend)
        k >>= 1
    return result


def point_neg(point):
    if point is None:
        return None
    x, y = point
    return (x, (-y) % P)


def recover_address(digest: bytes, signature_hex: str) -> str:
    sig = bytes.fromhex(signature_hex.removeprefix("0x"))
    if len(sig) != 65:
        raise ValueError(f"expected 65-byte signature, got {len(sig)}")
    r = int.from_bytes(sig[:32], "big")
    s = int.from_bytes(sig[32:64], "big")
    v = sig[64]
    parity = v - 27 if v >= 27 else v
    if parity not in (0, 1):
        raise ValueError(f"unsupported recovery parity: {parity}")

    # Ethereum signatures produced by Anvil/ethers use recovery ids 0/1.
    x = r
    alpha = (pow(x, 3, P) + 7) % P
    beta = pow(alpha, (P + 1) // 4, P)
    y = beta if beta % 2 == parity else P - beta
    R = (x, y)

    if point_mul(N, R) is not None:
        raise ValueError("invalid recovery point")

    z = int.from_bytes(digest, "big") % N
    r_inv = inv(r, N)
    q = point_mul(r_inv, point_add(point_mul(s, R), point_neg(point_mul(z, G))))
    if q is None:
        raise ValueError("failed to recover public key")

    pub = q[0].to_bytes(32, "big") + q[1].to_bytes(32, "big")
    return "0x" + k256(pub)[-20:].hex()


vector = json.loads(VECTOR_PATH.read_text())
readable = json.loads(READABLE.read_text())
frozen_jcs = FROZEN_JCS.read_text().strip()

canonical_py = canonical_fixture(readable)
assert canonical_py == frozen_jcs, "Python canonical bytes differ from frozen JCS"
print("PASS Python canonical bytes = frozen Supplier JCS")

manifest_hash = hx(k256(canonical_py.encode("utf-8")))
assert manifest_hash.lower() == vector["canonicalization"]["specimenManifestHash"].lower()
assert manifest_hash == "0x0c39c0ad9a76fb194c92d9864fa64ce2afbfe00c979ec762bffaf2c8eb436557"
print("PASS Python specimenManifestHash = frozen 0x0c39...6557")

raw_score = vector["scoreIntegerization"]["rawScore"]
exp = int(vector["scoreIntegerization"]["scaleExponent"])
scaled = int(
    (Decimal(raw_score) * (Decimal(10) ** exp)).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
)
assert str(scaled) == vector["scoreIntegerization"]["expectedScaled"]
assert str(scaled) == vector["scoreIntegerization"]["jsScaled"]
assert scaled == 55442036
print("PASS Python ROUND_HALF_UP score = JS = 55442036")

domain = vector["eip712"]["domain"]
msg = vector["eip712"]["message"]

type_hash = k256(STATION_TYPE.encode())
encoded = b"".join(
    [
        type_hash,
        b32(msg["tradeId"]),
        uint256(int(msg["role"])),
        addr32(msg["station"]),
        uint256(int(msg["attempt"])),
        b32(msg["sessionNonce"]),
        b32(msg["policyHash"]),
        b32(msg["modelBundleHash"]),
        b32(msg["captureProfileHash"]),
        b32(msg["specimenManifestHash"]),
        b32(msg["evidencePackageHash"]),
        uint256(int(msg["aggregateScoreScaled"])),
        b32(msg["scoreSchemaId"]),
        uint256(int(msg["inspectionValidity"])),
        uint256(int(msg["invalidReason"])),
        uint256(int(msg["issuedAt"])),
        uint256(int(msg["validUntil"])),
    ]
)
struct_hash = k256(encoded)

domain_hash = k256(
    b"".join(
        [
            k256(DOMAIN_TYPE.encode()),
            k256(domain["name"].encode()),
            k256(domain["version"].encode()),
            uint256(int(domain["chainId"])),
            addr32(domain["verifyingContract"]),
        ]
    )
)
digest = k256(b"\x19\x01" + domain_hash + struct_hash)
digest_hex = hx(digest)

assert digest_hex.lower() == vector["eip712"]["jsDigest"].lower()
assert digest_hex.lower() == vector["eip712"]["solidityDigest"].lower()
print("PASS Python EIP-712 digest = JS = Solidity")

recovered = recover_address(digest, vector["eip712"]["signature"])
assert recovered.lower() == vector["eip712"]["expectedSigner"].lower()
assert recovered.lower() == vector["eip712"]["jsRecoveredSigner"].lower()
print("PASS Python recovered signer = JS recovered signer = Supplier Station")

result = {
    "schema": "inspectescrow.patch3-interop-python-result/1.0.0",
    "status": "PASS",
    "scoreScaled": str(scaled),
    "canonicalUtf8ByteLength": len(canonical_py.encode("utf-8")),
    "specimenManifestHash": manifest_hash,
    "stationAttestationStructHash": hx(struct_hash),
    "domainSeparator": hx(domain_hash),
    "eip712Digest": digest_hex,
    "recoveredSigner": recovered,
    "matchesJavaScript": True,
    "matchesSolidity": True,
}
(BUILD / "PATCH3_INTEROP_PYTHON_RESULT.json").write_text(
    json.dumps(result, indent=2) + "\n"
)
print(json.dumps(result, indent=2))
