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

    # Transparent, reproducible *visualization* rule. Previously each image
    # independently stretched p05..p98 to red, so even a normal PASS photo
    # appeared highly defective. Use the fixed IMAGE-LEVEL score threshold as
    # a display reference for patch distances, not a calibrated pixel threshold.
    reference = THRESHOLD_SCALED / SCORE_SCALE
    excess = np.maximum(anomaly - reference, 0.0)
    relative = np.clip(excess / 12.0, 0.0, 1.0).astype(np.float32)

    # Visually isolate the metallic nut from the dark textured photo mat.
    # This is a conservative appearance/position mask, NOT a trained part
    # segmentation model; preserve underlying raw anomaly_map untouched.
    from PIL import ImageFilter
    base = np.asarray(visual, dtype=np.float32)
    luminance = base.mean(axis=2)
    yy, xx = np.ogrid[:280, :280]
    radius = np.sqrt((yy - 139.5) ** 2 + (xx - 139.5) ** 2)
    bg = luminance[radius > 119]
    bg_level = float(np.median(bg))
    seed = (luminance > bg_level + 35.0) & (radius > 33) & (radius < 117)
    expanded = Image.fromarray((seed.astype("uint8") * 255), "L").filter(
        ImageFilter.MaxFilter(7)
    )
    # Antialias the mask edge to avoid drawing a hard artificial outline.
    mask = np.asarray(expanded.filter(ImageFilter.GaussianBlur(2)), dtype=np.float32) / 255.0
    mask *= (radius > 41) & (radius < 110)
    if not (0.025 < float(np.mean(mask > 0.15)) < 0.52):
        # Fail closed: no heatmap if the expected dark-background metal nut
        # could not be isolated. This does not affect AI PASS/REVIEW.
        raise RuntimeError("XAI_FOREGROUND_MASK_NOT_RELIABLE")

    alpha_raw = (0.78 * relative ** 1.3) * mask
    alpha = alpha_raw[..., None]
    red = np.zeros_like(base)
    red[:, :, 0] = 240
    red[:, :, 1] = 54
    red[:, :, 2] = 61
    overlay = np.clip(base * (1.0 - alpha) + red * alpha, 0, 255).astype("uint8")
    png = io.BytesIO()
    Image.fromarray(overlay, mode="RGB").save(png, "PNG", optimize=True)

    # These are fixed-reference relative display intensities ON THE NUT,
    # not per-image percentiles, probabilities, or defect area percentages.
    masked_strength = relative * mask
    half = 140
    zones = (
        ("좌상", masked_strength[:half, :half], mask[:half, :half]),
        ("우상", masked_strength[:half, half:], mask[:half, half:]),
        ("좌하", masked_strength[half:, :half], mask[half:, :half]),
        ("우하", masked_strength[half:, half:], mask[half:, half:]),
    )
    limited = np.where(mask > 0.15, anomaly, -np.inf)
    y, x_peak = np.unravel_index(int(np.argmax(limited)), limited.shape)
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
            {"label": label, "relativeAnomalyIndex": round(float(np.percentile(part[roi > 0.15], 95) * 100), 1) if np.any(roi > 0.15) else 0.0}
            for label, part, roi in zones
        ],
        "nativeMapMin": round(float(anomaly.min()), 6),
        "nativeMapMax": round(float(anomaly.max()), 6),
        "visualNormalization": "FIXED_IMAGE_SCORE_REFERENCE_ROI_ONLY_V2",
        "visualReferenceRaw": round(float(reference), 6),
        "visualScaleWidthRaw": 12.0,
        "quadrantDisplayMethod": "P95_FIXED_REFERENCE_EXCESS_ON_METAL_ROI_NOT_PROBABILITY",
        "visualObjectMaskMethod": "BRIGHT_CENTRAL_METAL_ON_DARK_BACKGROUND_HEURISTIC",
        "visualHighlightedPixels": int(np.count_nonzero(alpha_raw > 0.10)),
        "visualObjectMaskPixels": int(np.count_nonzero(mask > 0.15)),
        "visualBackgroundPixelsHighlighted": int(np.count_nonzero((mask <= 0.01) & (alpha_raw > 0.01))),
        "visualizationVersion": 2,
        "calibratedDefectProbability": None,
        "limitations": [
            "Only above-reference native patch distances are tinted on a heuristic nut foreground mask.",
            "The global image-level threshold is a visualization reference, NOT a calibrated pixel-wise defect threshold.",
            "No red on PASS does not prove that every image patch is free of defects.",
            "Localization alone does not prove cause, physical identity, or original-data authenticity.",
            "XAI is offchain, unsigned, and not included in the contractual evidence commitment.",
        ],
        "device": device,
        "originalImageStoredByServer": False, "transactionsSent": 0,
    }
