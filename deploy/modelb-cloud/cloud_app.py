"""PC-independent, off-chain live demo. Frozen Model B runtime is imported unchanged."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError

from server import (
    EXPECTED_MODEL_SHA256, THRESHOLD_SCALED,
    artifact_commitment_status, get_model, infer_original_bytes, sha256
)

ROOT = Path(__file__).resolve().parent
TOKEN = os.environ.get("INSPECTESCROW_DEMO_ACCESS_TOKEN", "")
MAX_FILE = 8 * 1024 * 1024
app = FastAPI(title="InspectEscrow Cloud Live - Offchain Evidence", version="1.0.0")

def require_token(provided: str | None) -> None:
    if not TOKEN:
        raise HTTPException(503, "DEMO_ACCESS_TOKEN_NOT_CONFIGURED")
    if not provided or not hmac.compare_digest(provided, TOKEN):
        raise HTTPException(401, "DEMO_ACCESS_DENIED")

def canonical(data: object) -> bytes:
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def sha256_obj(data: object) -> str:
    return sha256(canonical(data))

async def validate_image(file: UploadFile | None, view: str) -> dict | None:
    if file is None:
        return None
    name = Path(file.filename or "").name
    if not name or len(name) > 160 or not name.lower().endswith((".jpg", ".jpeg", ".png")):
        raise HTTPException(400, "INVALID_FILENAME_" + view)
    data = await file.read(MAX_FILE + 1)
    await file.close()
    if len(data) < 500 or len(data) > MAX_FILE:
        raise HTTPException(413, "IMAGE_SIZE_NOT_ALLOWED_" + view)
    try:
        with Image.open(BytesIO(data)) as im:
            if im.format not in ("JPEG", "PNG") or im.width * im.height > 40_000_000:
                raise ValueError("UNSUPPORTED_OR_OVERSIZED_IMAGE")
            im.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(400, "INVALID_IMAGE_" + view) from exc
    return {"view": view, "fileName": name, "sha256": sha256(data),
            "bytes": len(data), "data": data}

@app.get("/")
def home():
    return FileResponse(ROOT / "static" / "cloud-live.html", headers={"Cache-Control": "no-store"})

@app.get("/api/cloud/health")
def health():
    check = artifact_commitment_status()
    if not check.get("verified"):
        raise HTTPException(status_code=503, detail="MODEL_ARTIFACT_INVALID")
    return {"status": "READY_FOR_INFERENCE",
            "artifactVerified": True,
            "modelCheckpointSha256": EXPECTED_MODEL_SHA256,
            "thresholdScaled": THRESHOLD_SCALED,
            "scope": "OFFCHAIN_DEMO_NO_STATION_SIGNATURE_NO_ONCHAIN_TX"}

@app.post("/api/cloud/warm")
async def warm(x_demo_token: str | None = Header(default=None)):
    require_token(x_demo_token)
    verified = await run_in_threadpool(artifact_commitment_status)
    if not verified.get("verified"):
        raise HTTPException(503, "MODEL_ARTIFACT_NOT_VERIFIED")
    await run_in_threadpool(get_model)
    return {"ok": True, "modelLoaded": True, "mode": "OFFCHAIN"}

@app.post("/api/cloud/inspect")
async def inspect(
    top: UploadFile = File(...),
    front: UploadFile | None = File(default=None),
    side: UploadFile | None = File(default=None),
    specimen_label: str = Form(default="LIVE-NUT-001"),
    expected_top_sha256: str = Form(...),
    x_demo_token: str | None = Header(default=None),
):
    require_token(x_demo_token)
    if not 2 <= len(specimen_label) <= 100 or any(ord(c) < 32 for c in specimen_label):
        raise HTTPException(400, "INVALID_SPECIMEN_LABEL")
    if (front is None) != (side is None):
        raise HTTPException(400, "FRONT_AND_SIDE_REQUIRED_TOGETHER")
    top_img = await validate_image(top, "TOP")
    front_img = await validate_image(front, "FRONT")
    side_img = await validate_image(side, "SIDE")
    if not hmac.compare_digest(top_img["sha256"], expected_top_sha256.lower()):
        raise HTTPException(400, "TOP_SHA256_MISMATCH")
    images = [item for item in (top_img, front_img, side_img) if item]
    if len({im["sha256"] for im in images}) != len(images):
        raise HTTPException(400, "DUPLICATE_VIEW_CONTENT")
    verified = await run_in_threadpool(artifact_commitment_status)
    if not verified.get("verified"):
        raise HTTPException(503, "MODEL_ARTIFACT_NOT_VERIFIED")
    score, scaled, decision, device = await run_in_threadpool(
        infer_original_bytes, top_img["data"]
    )
    complete = len(images) == 3
    created = datetime.now(timezone.utc).isoformat()
    captures = {im["view"]: {"fileName": im["fileName"], "sha256": im["sha256"],
                             "bytes": im["bytes"]} for im in images}
    manifest = {
        "schema": "InspectEscrow.CloudLive.OffchainManifest.v1",
        "sessionId": secrets.token_hex(16),
        "createdAtUtc": created,
        "operatorSpecimenLabel": specimen_label,
        "operatorLabelNotPhysicallyVerified": True,
        "captureFiles": captures,
        "aiInputView": "TOP",
        "requiredViewsForContractualEvidence": ["TOP", "FRONT", "SIDE"],
        "completeThreeViewCapture": complete,
        "physicalCustodyProven": False,
    }
    inference = {
        "schema": "InspectEscrow.ModelB.CloudInference.v1",
        "inputImageSha256": top_img["sha256"],
        "modelCheckpointSha256": EXPECTED_MODEL_SHA256,
        "scoreRaw": score, "scoreScaled": scaled,
        "thresholdScaled": THRESHOLD_SCALED, "decision": decision,
        "inferredAtUtc": created, "device": device,
        "actualModelInferenceExecuted": True,
    }
    evidence = {
        "schema": "InspectEscrow.CloudLive.OffchainEvidence.v1",
        "status": "THREE_VIEW_UNSIGNED_OFFCHAIN" if complete else "TOP_ONLY_EVIDENCE_INCOMPLETE",
        "manifestSha256": sha256_obj(manifest),
        "inferenceSha256": sha256_obj(inference),
        "modelCheckpointSha256": EXPECTED_MODEL_SHA256,
        "stationSigned": False, "onchainSubmitted": False,
        "transactionsSent": 0,
        "originalImagesStoredByServer": False,
        "contractCompatibleEvidenceBundle": False,
        "limitation": "Offchain demo evidence: not a PATCH3 signed/onchain evidence bundle.",
    }
    bundle = {"manifest": manifest, "inference": inference, "evidence": evidence,
              "evidenceSha256": sha256_obj(evidence)}
    return {"ok": True, "scoreRaw": score, "scoreScaled": scaled,
            "thresholdScaled": THRESHOLD_SCALED, "decision": decision,
            "completeThreeViewCapture": complete, "bundle": bundle}

@app.post("/api/cloud/verify")
async def verify(bundle: dict, x_demo_token: str | None = Header(default=None)):
    require_token(x_demo_token)
    try:
        m, inf, ev = bundle["manifest"], bundle["inference"], bundle["evidence"]
        good = (ev["manifestSha256"] == sha256_obj(m)
                and ev["inferenceSha256"] == sha256_obj(inf)
                and bundle["evidenceSha256"] == sha256_obj(ev)
                and inf["modelCheckpointSha256"] == EXPECTED_MODEL_SHA256
                and inf["inputImageSha256"] == m["captureFiles"]["TOP"]["sha256"]
                and ev["stationSigned"] is False and ev["onchainSubmitted"] is False)
        return {"ok": good, "internalHashesValid": good,
                "originalImageBytesRechecked": False,
                "stationSignatureVerified": False, "onchainVerified": False}
    except (KeyError, TypeError, ValueError):
        return {"ok": False, "internalHashesValid": False}

