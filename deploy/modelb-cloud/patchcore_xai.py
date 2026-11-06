"""Pinned Model B PatchCore native anomaly localization (off-chain only).

This uses result.anomaly_map from the *same* frozen CNN PatchCore checkpoint.
It is not Grad-CAM and does not estimate calibrated defect probability.
"""
from __future__ import annotations

import base64
import io
import math
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException


def explain_original_bytes(data: bytes) -> dict:
    import numpy as np
    import torch
    from PIL import Image, ImageOps, UnidentifiedImageError
    from server import (
        get_model, sha256, EXPECTED_MODEL_SHA256, SCORE_SCALE,
        THRESHOLD_SCALED, MAX_IMAGE_PIXELS, _infer_lock,
    )

    model, preprocessor, to_tensor, device = get_model()
    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in ("JPEG", "PNG"):
                raise ValueError("JPEG_OR_PNG_REQUIRED")
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            width, height = image.size
            if width * height > MAX_IMAGE_PIXELS:
                raise ValueError("IMAGE_TOO_LARGE")
            side = min(width, height)
            image = image.crop(((width - side) // 2, (height - side) // 2,
                                (width + side) // 2, (height + side) // 2))
            image = image.resize((700, 700), Image.Resampling.LANCZOS)
            x = preprocessor.transform(to_tensor(image).unsqueeze(0).to(device))
            # Corresponds to Patchcore.configure_pre_processor(
            # image_size=(320,320), center_crop_size=(280,280)).
            visual = image.resize((320, 320), Image.Resampling.BILINEAR)
            visual = visual.crop((20, 20, 300, 300))
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise HTTPException(400, "INVALID_IMAGE: " + str(error)) from error

    if tuple(x.shape) != (1, 3, 280, 280):
        raise RuntimeError("XAI_PREPROCESSING_MISMATCH")
    with _infer_lock, torch.inference_mode():
        result = model(x)
        score = float(result.pred_score.detach().cpu().reshape(-1)[0])
        native = result.anomaly_map
        if native is None:
            raise RuntimeError("PATCHCORE_NATIVE_ANOMALY_MAP_UNAVAILABLE")
        anomaly = native.detach().float().cpu().squeeze().numpy()

    if not math.isfinite(score) or score < 0:
        raise RuntimeError("INVALID_MODEL_SCORE")
    if anomaly.ndim != 2 or not np.isfinite(anomaly).all():
        raise RuntimeError("INVALID_PATCHCORE_MAP")
    if anomaly.shape != (280, 280):
        anomaly = np.asarray(
            Image.fromarray(anomaly.astype("float32"), mode="F").resize(
                (280, 280), Image.Resampling.BILINEAR
            )
        )
    if not np.isfinite(anomaly).all():
        raise RuntimeError("NON_FINITE_RESIZED_MAP")

    scaled = int(
        (Decimal(str(score)) * Decimal(SCORE_SCALE)).to_integral_value(
            rounding=ROUND_HALF_UP
        )
    )
    decision = "REVIEW_REQUIRED" if scaled > THRESHOLD_SCALED else "PASS"

    # Per-image display scaling. It MUST NOT be interpreted as defect probability.
    low, high = (float(v) for v in np.percentile(anomaly, [5, 98]))
    relative = np.zeros_like(anomaly, dtype=np.float32)
    if high > low + 1e-9:
        relative = np.clip((anomaly - low) / (high - low), 0, 1).astype(np.float32)
    base = np.asarray(visual, dtype=np.float32)
    alpha = (np.clip((relative - 0.35) / 0.65, 0, 1) * 0.70)[..., None]
    red = np.zeros_like(base)
    red[..., 0], red[..., 1], red[..., 2] = 245, 48, 54
    overlay = np.clip(base * (1 - alpha) + red * alpha, 0, 255).astype("uint8")
    png = io.BytesIO()
    Image.fromarray(overlay, mode="RGB").save(png, "PNG", optimize=True)

    half = 140
    zones = (
        ("좌상", relative[:half, :half]),
        ("우상", relative[:half, half:]),
        ("좌하", relative[half:, :half]),
        ("우하", relative[half:, half:]),
    )
    y, x_peak = np.unravel_index(int(np.argmax(anomaly)), anomaly.shape)
    return {
        "schema": "InspectEscrow.ModelB.PatchcoreLocalization.v1",
        "method": "PATCHCORE_NATIVE_ANOMALY_MAP",
        "backbone": "wide_resnet50_2",
        "backboneLayers": ["layer2", "layer3"],
        "originalTopSha256": sha256(data),
        "modelCheckpointSha256": EXPECTED_MODEL_SHA256,
        "scoreRaw": score, "scoreScaled": scaled,
        "thresholdScaled": THRESHOLD_SCALED, "decision": decision,
        "overlayPngBase64": base64.b64encode(png.getvalue()).decode("ascii"),
        "overlayWidth": 280, "overlayHeight": 280,
        "highestAnomalyXRatio": round((int(x_peak) + 0.5) / 280, 4),
        "highestAnomalyYRatio": round((int(y) + 0.5) / 280, 4),
        "quadrants": [
            {"label": label, "relativeAnomalyIndex": round(float(part.mean() * 100), 1)}
            for label, part in zones
        ],
        "nativeMapMin": round(float(anomaly.min()), 6),
        "nativeMapMax": round(float(anomaly.max()), 6),
        "visualNormalization": "PER_IMAGE_P05_P98_RELATIVE_ONLY",
        "calibratedDefectProbability": None,
        "limitations": [
            "Red regions show relative PatchCore normal-memory distance, not defect probability.",
            "Localization alone does not prove cause, physical identity, or original-data authenticity.",
            "XAI is offchain, unsigned, and not included in the contractual evidence commitment.",
        ],
        "device": device,
        "originalImageStoredByServer": False, "transactionsSent": 0,
    }
