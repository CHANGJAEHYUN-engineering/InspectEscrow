"""Create a reproducible 2026-11-07 reviewer source ZIP from an immutable Git tag."""
from __future__ import annotations

import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TAG = "submission-2026-11-07-final"
SUBDIR = "submissions/2026-11-07"
ZIP_NAME = "InspectEscrow_FINAL_SOURCE_SUBMISSION_20261107.zip"
PREFIX = "InspectEscrow_SOURCE_CODE_FINAL_20261107"
DEST = ROOT / SUBDIR / ZIP_NAME
PATHS = [
    "README.md", "package.json", "package-lock.json",
    "deploy/cloud-web", "deploy/modelb-cloud",
    "packages/phase3c_hardening_20261023/contracts",
    "packages/phase3c_hardening_20261023/test",
    "packages/phase3c_hardening_20261023/README.md",
    "docs/FINAL_SYNC_20261107_KO.md",
    "docs/FINAL_SUBMISSION_20261106_KO.md",
    "docs/ORGANIZER_DEMO_GUIDE_20261106_KO.md",
    "docs/SOURCE_SYNC_VERIFIED_20261106_KO.md",
    "docs/SEPOLIA_12TX_E2E_20261106.json",
    "docs/DEPLOYMENT_MANIFEST_20261106.json",
    "docs/evidence/MODEL_B_CLOUD_PLUS1_20261106.json",
    "docs/evidence/MODEL_B_CLOUD_PLUS1_REAL_WEB_SCREENSHOT.png",
    "scripts/submission_public_smoke.mjs",
    "scripts/final_submission_source_parity.mjs",
    "scripts/build_submission_20261107.py",
]
ALLOWED_IMAGES = {
    "docs/evidence/MODEL_B_CLOUD_PLUS1_REAL_WEB_SCREENSHOT.png",
    "deploy/modelb-cloud/xai_smoke_nut.png",
    "deploy/modelb-cloud/xai_smoke_front.png",
    "deploy/modelb-cloud/xai_smoke_side.png",
}

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def main() -> None:
    commit = subprocess.check_output(["git", "rev-list", "-n", "1", TAG], cwd=ROOT, text=True).strip()
    result = subprocess.run(
        ["git", "archive", "--format=tar", TAG, *PATHS],
        cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    payload: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(result.stdout), mode="r:") as archive:
        for item in archive:
            if not item.isfile():
                continue
            name = item.name.replace("\\", "/")
            lower = name.lower()
            if any(x in lower for x in ("/node_modules/", "/.git/", "/__pycache__/", "/private/", "/secrets/")):
                continue
            if Path(name).suffix.lower() in (".jpg", ".jpeg", ".webp", ".pem", ".p12", ".pfx", ".key", ".zip", ".log", ".pyc", ".pt", ".pth", ".ckpt"):
                continue
            if lower.endswith(".png") and name not in ALLOWED_IMAGES:
                continue
            if name.startswith(".env") and name != ".env.example":
                continue
            data = archive.extractfile(item).read()
            if len(data) > 3_000_000:
                raise RuntimeError(f"Unexpected large artifact: {name}")
            payload[name] = data
    required = [
        "README.md",
        "deploy/cloud-web/cloud-gateway.cjs",
        "deploy/cloud-web/app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/assist.js",
        "deploy/cloud-web/app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/tests-xai-smoke.cjs",
        "deploy/modelb-cloud/cloud_xai.py",
        "packages/phase3c_hardening_20261023/contracts/InspectEscrowPatch3.sol",
        "docs/FINAL_SYNC_20261107_KO.md",
    ]
    if len(payload) < 90 or not all(x in payload for x in required):
        raise RuntimeError("Incomplete source package: " + ", ".join(x for x in required if x not in payload))

    intro = """InspectEscrow | 2026 AI x Blockchain Hackathon | final reviewer source

Repository: https://github.com/CHANGJAEHYUN-engineering/InspectEscrow
Public PoC: https://inspectescrow-integrated-web-production.up.railway.app/

Start with README.md and docs/FINAL_SYNC_20261107_KO.md.
Web: deploy/cloud-web/
Model B cloud: deploy/modelb-cloud/
Smart contract and tests: packages/phase3c_hardening_20261023/

This archive is exported from the immutable 2026-11-07 Git tag.
No original specimen images, wallet keys, access tokens or 95 MB model backup.
The separate model artifact is required for a fully independent AI rebuild.

Do not conflate the prior real Sepolia settlement with newly generated,
unsigned, off-chain XAI evidence. Relative 0-100 anomaly bars are not
defect probabilities. The PoC does not verify physical product identity,
shipping liability or physical product return.
"""
    payload["00_START_HERE.txt"] = intro.encode("utf-8")
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["path", "bytes", "sha256"])
    for name, data in sorted(payload.items()):
        writer.writerow([name, len(data), digest(data)])
    payload["00_FILE_SHA256.csv"] = buf.getvalue().encode("utf-8")
    metadata = {
        "archive": "InspectEscrow final source submission",
        "git_tag": TAG, "git_commit": commit,
        "file_count": len(payload) + 1,
        "model_artifact_included": False, "private_images_included": False,
        "new_xai_evidence_submitted_onchain": False,
        "date": "2026-11-07",
    }
    payload["00_PACKAGE_METADATA.json"] = (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    DEST.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(DEST, "w", zipfile.ZIP_DEFLATED, compresslevel=8) as target:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(f"{PREFIX}/{name}", date_time=(2026, 11, 7, 12, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            target.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=8)
    with zipfile.ZipFile(DEST, "r") as verify:
        if verify.testzip() is not None or len(verify.namelist()) != len(payload):
            raise RuntimeError("ZIP CRC / entry count failed")
        for row in csv.DictReader(io.StringIO(verify.read(f"{PREFIX}/00_FILE_SHA256.csv").decode("utf-8"))):
            data = verify.read(f"{PREFIX}/{row['path']}")
            if len(data) != int(row["bytes"]) or digest(data) != row["sha256"]:
                raise RuntimeError("ZIP file hash failed: " + row["path"])
    summary = {"path": str(DEST), "source_commit": commit,
               "source_tag": TAG, "files": len(payload), "bytes": DEST.stat().st_size,
               "zip_sha256": digest(DEST.read_bytes()), "crc": "PASS", "file_hashes": "PASS"}
    (DEST.parent / "SHA256SUMS.txt").write_text(f"{summary['zip_sha256']}  {ZIP_NAME}\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
