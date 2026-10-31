"""Separate Model B specimen-aware runtime.

This module intentionally does not replace server.py. Its different source hash requires a
new artifact commitment, modelBundleHash, policyHash and tradeId before any on-chain use.
"""
from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

import server as base

app = FastAPI(title="InspectEscrow Model B Specimen-aware Runtime", version="2.0")
_SAFE_CODE = re.compile(r"^S\d{2}$")
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$")


@app.get("/api/status")
def status():
    artifact = base.artifact_commitment_status()
    return {
        "app": "InspectEscrow Model B Specimen-aware Runtime",
        "mode": "OFFCHAIN_INFERENCE_ONLY_NEW_POLICY_REQUIRED",
        "checkpoint_sha256": base.EXPECTED_MODEL_SHA256,
        "threshold_scaled": base.THRESHOLD_SCALED,
        "model_loaded": base._model is not None,
        "base_runtime_source_sha256": artifact.get("server_source_sha256"),
        "runtime_source_sha256": base.sha256_file(Path(__file__).resolve()),
        "specimen_identity_claim": "USER_SELECTED_NOT_PHYSICALLY_VERIFIED",
        "compatible_with_existing_s05_policy": False,
        "capture_signature_performed": False,
        "blockchain_transaction_sent": False,
    }


@app.post("/api/infer")
async def infer(
    image: UploadFile = File(...),
    expected_sha256: str = Form(...),
    specimen_id: str = Form(...),
    specimen_code: str = Form(...),
):
    if not _SAFE_ID.fullmatch(specimen_id):
        raise HTTPException(status_code=400, detail="INVALID_SPECIMEN_ID")
    if not _SAFE_CODE.fullmatch(specimen_code):
        raise HTTPException(status_code=400, detail="INVALID_SPECIMEN_CODE")
    data = await image.read(base.MAX_UPLOAD_BYTES + 1)
    file_name = Path(image.filename or "image").name
    await image.close()
    if not data or len(data) > base.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="FILE_SIZE_NOT_ALLOWED")
    actual_sha = base.sha256(data)
    if len(expected_sha256) != 64 or expected_sha256.lower() != actual_sha:
        raise HTTPException(status_code=400, detail="ORIGINAL_IMAGE_SHA256_MISMATCH")
    started = time.perf_counter()
    try:
        score, scaled, decision, device = base.infer_original_bytes(data)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"INFERENCE_NOT_AVAILABLE: {type(error).__name__}") from error
    return {
        "schema": "InspectEscrow.ModelB.SpecimenAwareInference.v2",
        "status": "OFFCHAIN_DEMO_NEW_POLICY_REQUIRED",
        "specimen_id": specimen_id,
        "specimen_code": specimen_code,
        "specimen_label_source": "USER_SELECTED_UNVERIFIED",
        "view": "TOP",
        "file_name": file_name,
        "original_image_sha256": actual_sha,
        "original_image_bytes": len(data),
        "model_checkpoint_sha256": base.EXPECTED_MODEL_SHA256,
        "preprocessing": "EXIF_transpose_RGB_center_square_700_then_Patchcore_320_center_crop_280",
        "score_raw": score,
        "score_raw_decimal": str(score),
        "score_scaled": scaled,
        "score_scale": base.SCORE_SCALE,
        "score_rounding": "ROUND_HALF_UP",
        "threshold_scaled": base.THRESHOLD_SCALED,
        "threshold_raw": base.THRESHOLD_SCALED / base.SCORE_SCALE,
        "decision_rule": "score_scaled > threshold_scaled => REVIEW_REQUIRED",
        "decision": decision,
        "device": device,
        "inference_elapsed_ms": int((time.perf_counter() - started) * 1000),
        "inferred_at_utc": datetime.now(timezone.utc).isoformat(),
        "physical_identity_verified": False,
        "station_signed_in_this_app": False,
        "sent_to_blockchain": False,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8767, log_level="warning")
