"""InspectEscrow Model B live inference demonstration (OFF-CHAIN ONLY).

Read-only inference from a pinned checkpoint in the user's Kaggle backup ZIP.
No blockchain transactions, Station signing, or audit claims are performed here.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import os
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from pathlib import Path
from zipfile import ZipFile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
BACKUP_FILE = ROOT / "model" / "InspectEscrow_ModelB_BACKUP.zip"
DEFAULT_PATCH3_ROOT = ROOT.parent.parent / "InspectEscrow_PATCH3_DEPLOY"
PATCH3_ROOT = Path(os.environ.get("INSPECTESCROW_PATCH3_ROOT", DEFAULT_PATCH3_ROOT)).resolve()
EXPECTED_MODEL_SHA256 = "8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854"
EXPECTED_BACKUP_SHA256 = "8102cedf082c0d8553ad03372d6dd125daab895ed56d2cad77c4ac0342b0206d"
THRESHOLD_SCALED = 38280373
SCORE_SCALE = 1_000_000
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000

app = FastAPI(title="InspectEscrow Model B Live Demo", version="1.0")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

_model = None
_preprocessor = None
_to_tensor = None
_device = None
_load_lock = threading.Lock()
_infer_lock = threading.Lock()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@lru_cache(maxsize=1)
def artifact_commitment_status() -> dict:
    if not BACKUP_FILE.is_file():
        return {"verified": False, "reason": "MODEL_BACKUP_NOT_FOUND"}
    archive_sha = sha256_file(BACKUP_FILE)
    if archive_sha != EXPECTED_BACKUP_SHA256:
        return {"verified": False, "reason": "MODEL_BACKUP_SHA256_MISMATCH", "archive_sha256": archive_sha}
    required = [
        "InspectEscrow_ModelB_PILOT.pt", "training_manifest.json",
        "MODEL_B_INTEGRATED_EVALUATION.csv", "MODEL_B_INTEGRATED_REPORT.json",
        "MODEL_B_CANDIDATE_POLICY.json",
    ]
    with ZipFile(BACKUP_FILE) as archive:
        if (bad := archive.testzip()) is not None:
            return {"verified": False, "reason": "MODEL_BACKUP_CORRUPT", "entry": bad}
        missing = [name for name in required if name not in archive.namelist()]
        if missing:
            return {"verified": False, "reason": "MODEL_BACKUP_ENTRIES_MISSING", "entries": missing}
        entry_hashes = {name: sha256(archive.read(name)) for name in required}
    if entry_hashes["InspectEscrow_ModelB_PILOT.pt"] != EXPECTED_MODEL_SHA256:
        return {"verified": False, "reason": "MODEL_SHA256_MISMATCH"}
    return {
        "verified": True,
        "archive_sha256": archive_sha,
        "checkpoint_sha256": EXPECTED_MODEL_SHA256,
        "embedded_artifact_sha256": entry_hashes,
        "server_source_sha256": sha256_file(Path(__file__).resolve()),
        "requirements_sha256": sha256_file(ROOT / "requirements.txt"),
    }


def model_bytes_verified() -> bytes:
    if not BACKUP_FILE.is_file():
        raise RuntimeError("MODEL_BACKUP_NOT_FOUND: model/InspectEscrow_ModelB_BACKUP.zip")
    # Backup ZIP contains the exact checkpoint used for S02/S03/S05 testing.
    with ZipFile(BACKUP_FILE) as z:
        bad = z.testzip()
        if bad is not None:
            raise RuntimeError("CORRUPT_BACKUP_ZIP: " + bad)
        data = z.read("InspectEscrow_ModelB_PILOT.pt")
    if sha256(data) != EXPECTED_MODEL_SHA256:
        raise RuntimeError("MODEL_SHA256_MISMATCH")
    return data


def get_model():
    global _model, _preprocessor, _to_tensor, _device
    if _model is not None:
        return _model, _preprocessor, _to_tensor, _device
    with _load_lock:
        if _model is not None:
            return _model, _preprocessor, _to_tensor, _device
        data = model_bytes_verified()
        import torch
        from torchvision.transforms import v2
        from anomalib.models import Patchcore
        from anomalib.models.image.patchcore.torch_model import PatchcoreModel

        checkpoint = torch.load(io.BytesIO(data), map_location="cpu", weights_only=True)
        metadata = checkpoint.get("metadata", {})
        if metadata.get("training_specimens") != ["S01", "S04", "S06"]:
            raise RuntimeError("TRAINING_SPECIMENS_MISMATCH")
        if metadata.get("status") != "PILOT_NOT_APPROVED_FOR_ONCHAIN":
            raise RuntimeError("UNEXPECTED_MODEL_STATUS")
        model = PatchcoreModel(
            backbone="wide_resnet50_2",
            layers=("layer2", "layer3"),
            pre_trained=False,
            num_neighbors=9,
        )
        model.load_state_dict(checkpoint["model_state_dict"], strict=True)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = model.to(device).eval()
        if tuple(model.memory_bank.shape) != (551, 1536):
            raise RuntimeError("MEMORY_BANK_SHAPE_MISMATCH")
        preprocessor = Patchcore.configure_pre_processor(
            image_size=(320, 320), center_crop_size=(280, 280)
        )
        to_tensor = v2.Compose([
            v2.ToImage(), v2.ToDtype(torch.float32, scale=True)
        ])
        _model, _preprocessor, _to_tensor, _device = model, preprocessor, to_tensor, device
        return _model, _preprocessor, _to_tensor, _device


def infer_original_bytes(data: bytes) -> tuple[float, int, str, str]:
    import torch
    from PIL import Image, ImageOps, UnidentifiedImageError

    model, preprocessor, to_tensor, device = get_model()
    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in ("JPEG", "PNG"):
                raise ValueError("JPEG_OR_PNG_REQUIRED")
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            w, h = image.size
            if w * h > MAX_IMAGE_PIXELS:
                raise ValueError("IMAGE_TOO_LARGE")
            side = min(w, h)
            left, top = (w - side) // 2, (h - side) // 2
            image = image.crop((left, top, left + side, top + side))
            image = image.resize((700, 700), Image.Resampling.LANCZOS)
            x = to_tensor(image).unsqueeze(0).to(device)
    except (UnidentifiedImageError, OSError, ValueError) as e:
        raise HTTPException(status_code=400, detail="INVALID_IMAGE: " + str(e)) from e

    x = preprocessor.transform(x)
    if tuple(x.shape) != (1, 3, 280, 280):
        raise RuntimeError("PREPROCESSING_INVARIANT_FAILED")
    with _infer_lock, torch.inference_mode():
        result = model(x)
        score = float(result.pred_score.detach().cpu().reshape(-1)[0])
    if not math.isfinite(score) or score < 0:
        raise RuntimeError("INVALID_MODEL_SCORE")
    scaled = int((Decimal(str(score)) * Decimal(SCORE_SCALE)).to_integral_value(rounding=ROUND_HALF_UP))
    decision = "REVIEW_REQUIRED" if scaled > THRESHOLD_SCALED else "PASS"
    return score, scaled, decision, device


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/integrated")
def integrated_index():
    target = PATCH3_ROOT / "index.html"
    if not target.is_file():
        raise HTTPException(status_code=404, detail="PATCH3_INTEGRATED_UI_NOT_FOUND")
    return FileResponse(target)


@app.get("/app.js")
def integrated_app_script():
    target = PATCH3_ROOT / "app.js"
    if not target.is_file():
        raise HTTPException(status_code=404, detail="PATCH3_INTEGRATED_APP_NOT_FOUND")
    return FileResponse(target, media_type="application/javascript")


@app.get("/style.css")
def integrated_style():
    target = PATCH3_ROOT / "style.css"
    if not target.is_file():
        raise HTTPException(status_code=404, detail="PATCH3_INTEGRATED_STYLE_NOT_FOUND")
    return FileResponse(target, media_type="text/css")


@app.get("/vendor/ethers.umd.min.js")
def integrated_ethers():
    target = PATCH3_ROOT / "packages" / "phase3b_20261010" / "vendor" / "ethers.umd.min.js"
    if not target.is_file():
        raise HTTPException(status_code=404, detail="ETHERS_VENDOR_NOT_FOUND")
    return FileResponse(target, media_type="application/javascript")


@app.get("/contract-abi.json")
def integrated_contract_abi():
    build = PATCH3_ROOT / ".patch3-build"
    candidates = sorted(build.glob("*_InspectEscrowPatch3.abi"))
    if not candidates:
        raise HTTPException(status_code=404, detail="PATCH3_ABI_NOT_COMPILED")
    return FileResponse(candidates[0], media_type="application/json")


@app.get("/api/status")
def status():
    exists = BACKUP_FILE.is_file()
    artifact_status = artifact_commitment_status()
    return {
        "app": "InspectEscrow Live Model B",
        "mode": "OFFCHAIN_INFERENCE_ONLY",
        "model_artifact_present": exists,
        "checkpoint_sha256": EXPECTED_MODEL_SHA256,
        "threshold_scaled": THRESHOLD_SCALED,
        "threshold_raw": THRESHOLD_SCALED / SCORE_SCALE,
        "model_loaded": _model is not None,
        "artifact_commitment": artifact_status,
        "integrated_ui_available": (PATCH3_ROOT / "index.html").is_file(),
        "integrated_ui_path": "/integrated",
        "capture_signature_performed": False,
        "blockchain_transaction_sent": False,
    }


@app.post("/api/infer")
async def infer(
    image: UploadFile = File(...),
    expected_sha256: str = Form(...),
    specimen_id: str = Form("IE-DEMO-001"),
):
    if specimen_id != "IE-DEMO-001":
        raise HTTPException(status_code=400, detail="UNEXPECTED_SPECIMEN_ID")
    data = await image.read(MAX_UPLOAD_BYTES + 1)
    await image.close()
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="FILE_SIZE_NOT_ALLOWED")
    actual_sha = sha256(data)
    if len(expected_sha256) != 64 or expected_sha256.lower() != actual_sha:
        raise HTTPException(status_code=400, detail="ORIGINAL_IMAGE_SHA256_MISMATCH")
    started = time.perf_counter()
    try:
        score, scaled, decision, device = infer_original_bytes(data)
    except HTTPException:
        raise
    except Exception as e:
        # Avoid sending stack traces or local paths to the browser.
        raise HTTPException(status_code=503, detail=f"INFERENCE_NOT_AVAILABLE: {type(e).__name__}: {str(e)[:180]}") from e
    return {
        "schema": "InspectEscrow.ModelB.LiveLocalInference.v1",
        "status": "OFFCHAIN_DEMO_NOT_ONCHAIN_APPROVED",
        "specimen_id": specimen_id,
        "specimen_code": "S05",
        "specimen_label_source": "USER_SELECTED_UNVERIFIED",
        "view": "TOP",
        "file_name": Path(image.filename or "image").name,
        "original_image_sha256": actual_sha,
        "original_image_bytes": len(data),
        "model_checkpoint_sha256": EXPECTED_MODEL_SHA256,
        "preprocessing": "EXIF_transpose_RGB_center_square_700_then_Patchcore_320_center_crop_280",
        "score_raw": score,
        "score_raw_decimal": str(score),
        "score_scaled": scaled,
        "score_scale": SCORE_SCALE,
        "score_rounding": "ROUND_HALF_UP",
        "threshold_scaled": THRESHOLD_SCALED,
        "threshold_raw": THRESHOLD_SCALED / SCORE_SCALE,
        "decision_rule": "score_scaled > threshold_scaled => REVIEW_REQUIRED",
        "decision": decision,
        "device": device,
        "inference_elapsed_ms": int((time.perf_counter() - started) * 1000),
        "inferred_at_utc": datetime.now(timezone.utc).isoformat(),
        "station_signed_in_this_app": False,
        "sent_to_blockchain": False,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")
