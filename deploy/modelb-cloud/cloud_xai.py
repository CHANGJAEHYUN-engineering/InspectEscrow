"""PatchCore-derived XAI evidence, separate from the frozen scoring runtime.

This module uses the exact pinned checkpoint and preprocessing. It never claims
physical defect certainty, and it does not modify the existing model contract.
"""
from __future__ import annotations

import base64
import hashlib
import io
import math
from decimal import Decimal, ROUND_HALF_UP

import server as frozen


XAI_METHOD = "patchcore-anomaly-map-overlay-v1"


def calculate_xai(image_bytes: bytes) -> dict:
    import numpy as np
    import torch
    from PIL import Image, ImageOps

    model, preprocessor, to_tensor, device = frozen.get_model()
    Image.MAX_IMAGE_PIXELS = frozen.MAX_IMAGE_PIXELS
    with Image.open(io.BytesIO(image_bytes)) as source:
        source.verify()
    with Image.open(io.BytesIO(image_bytes)) as source:
        source = ImageOps.exif_transpose(source).convert("RGB")
        w, h = source.size
        if w*h > frozen.MAX_IMAGE_PIXELS:
            raise ValueError("XAI_IMAGE_TOO_LARGE")
        side = min(w, h)
        left, top = (w-side)//2, (h-side)//2
        source = source.crop((left, top, left+side, top+side))
        source = source.resize((700, 700), Image.Resampling.LANCZOS)
        base_image = source.resize((320, 320), Image.Resampling.BILINEAR)
        base_image = base_image.crop((20,20,300,300))
        tensor = to_tensor(source).unsqueeze(0).to(device)

    tensor = preprocessor.transform(tensor)
    if tuple(tensor.shape) != (1,3,280,280):
        raise RuntimeError("XAI_PREPROCESSING_MISMATCH")

    with frozen._infer_lock, torch.inference_mode():
        prediction = model(tensor)
        score = float(prediction.pred_score.detach().cpu().reshape(-1)[0])
        raw_map = getattr(prediction, "anomaly_map", None)
        if raw_map is None:
            raise RuntimeError("PATCHCORE_ANOMALY_MAP_NOT_AVAILABLE")
        values = raw_map.detach().cpu().float().numpy()
    if not math.isfinite(score) or not np.all(np.isfinite(values)):
        raise RuntimeError("NONFINITE_XAI_MODEL_OUTPUT")
    scaled = int((Decimal(str(score))*Decimal(frozen.SCORE_SCALE)).to_integral_value(rounding=ROUND_HALF_UP))
    if values.ndim == 4:
        values = values[0,0]
    elif values.ndim == 3:
        values = values[0]
    if values.ndim != 2:
        raise RuntimeError("XAI_MAP_SHAPE_INVALID")
    anomaly_raw_hash = hashlib.sha256(np.asarray(values,dtype="<f4").tobytes()).hexdigest()

    # Resize only for visualization; immutable raw-score hash is retained above.
    img = Image.fromarray(np.asarray(values,dtype=np.float32), mode="F")
    img = img.resize((280,280), Image.Resampling.BILINEAR)
    anomaly = np.asarray(img,dtype=np.float32)
    rgb = np.asarray(base_image.convert("RGB"), dtype=np.uint8)
    # The supplied TOP image contains a central manufactured specimen.
    # Mask areas resembling the border background to reduce visual false positives.
    margin = 16
    border = np.concatenate((rgb[:margin].reshape(-1,3),rgb[-margin:].reshape(-1,3),
                             rgb[:,:margin].reshape(-1,3),rgb[:,-margin:].reshape(-1,3)))
    background = np.median(border.astype(np.float32),axis=0)
    difference = np.max(np.abs(rgb.astype(np.float32)-background),axis=2)
    yy,xx=np.indices((280,280))
    central = ((xx-139.5)**2+(yy-139.5)**2) <= 133**2
    foreground = (difference>22) & central
    if int(foreground.sum())<1000:
        # If foreground cannot be established, use the centered inspection ROI
        # without pretending that object segmentation has been verified.
        foreground=central

    # Actual anomaly_map values, measured in four spatial TOP image regions.
    # The metric is the regional p90 divided by the whole-ROI p99, after
    # subtracting the common ROI minimum. Relative 0..100, NOT probabilities.
    roi_values=np.asarray(anomaly[foreground],dtype=np.float64)
    roi_base=float(np.min(roi_values))
    roi_p99=float(np.quantile(roi_values,0.99))
    roi_span=roi_p99-roi_base
    quadrants=[]
    for label,xmin,xmax,ymin,ymax in [
        ("좌측 상단",0,140,0,140),
        ("우측 상단",140,280,0,140),
        ("좌측 하단",0,140,140,280),
        ("우측 하단",140,280,140,280)
    ]:
        mask=foreground & (xx>=xmin) & (xx<xmax) & (yy>=ymin) & (yy<ymax)
        samples=np.asarray(anomaly[mask],dtype=np.float64)
        if samples.size==0 or roi_span<=1e-8:
            value=0.0
        else:
            regional_p90=float(np.quantile(samples,0.90))
            value=float(np.clip((regional_p90-roi_base)/roi_span*100,0,100))
        quadrants.append({
            "label":label,
            "relativeAnomalyIndex":round(value,1),
            "pixelCount":int(samples.size)
        })
    # Relative localization is NOT an anomaly probability. A PASS image is not
    # painted red merely because it has a highest patch.
    overlay = np.zeros((280,280,4),dtype=np.uint8)
    if scaled > frozen.THRESHOLD_SCALED:
        ranked = anomaly[foreground]
        threshold = float(np.quantile(ranked, 0.92))
        maximum = float(np.quantile(ranked, 0.999))
        if maximum>threshold:
            strength=np.clip((anomaly-threshold)/(maximum-threshold),0,1)
            alpha=(strength*180).astype(np.uint8)
            alpha[~foreground]=0
            overlay[:,:,0]=255
            overlay[:,:,1]=(155*(1-strength)).astype(np.uint8)
            overlay[:,:,2]=5
            overlay[:,:,3]=alpha
    image=Image.alpha_composite(base_image.convert("RGBA"),Image.fromarray(overlay,"RGBA"))
    target=io.BytesIO()
    image.convert("RGB").save(target,format="PNG",optimize=True)
    png=target.getvalue()
    return {
      "method":XAI_METHOD,
      "method_scope":"Relative PatchCore anomaly-map localization, not defect probability",
      "heatmap_png_base64":base64.b64encode(png).decode("ascii"),
      "heatmap_sha256":frozen.sha256(png),
      "heatmap_bytes":len(png),
      "raw_anomaly_map_sha256":anomaly_raw_hash,
      "quadrants":quadrants,
      "quadrant_metric":"regional_p90_normalized_to_TOP_foreground_p99",
      "quadrant_scope":"TOP cropped image, foreground heuristic, relative 0-100; NOT defect probability",
      "source_image_sha256":frozen.sha256(image_bytes),
      "checkpoint_sha256":frozen.EXPECTED_MODEL_SHA256,
      "score_scaled":scaled,
      "decision":"REVIEW_REQUIRED" if scaled>frozen.THRESHOLD_SCALED else "PASS",
      "foreground_mask_heuristic":True,
      "heatmap_generated_from_actual_model":True,
      "onchain_submitted":False,
    }
