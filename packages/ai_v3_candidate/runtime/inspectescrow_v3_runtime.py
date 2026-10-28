"""InspectEscrow V3 off-chain diagnostic runner. Not an attestation signer.

No existing V2/PATCH3 artifacts are modified. Policy values are unapproved.
"""
from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
from io import BytesIO
from pathlib import Path, PurePosixPath
import json
import math
import re

from PIL import Image
import torch
from torch.torch_version import TorchVersion
from torchvision.transforms import v2
from anomalib.models import Patchcore

EXPECTED_CHECKPOINT_SHA256 = "8ab4beeb37242a742bac75c8f697d4af625eaf5acda339c887d6c77c9f6bd36b"
EXPECTED_DRAFT_POLICY_SHA256 = "63f1aa4ba3b937e9be82f4984b998e5188fbfd5737e38c8c86adcb2ca7d226ef"
THRESHOLD_SCALED_CANDIDATE = 45_405_741
TOLERANCE_SCALED_CANDIDATE = 512
UINT128_MAX = (1 << 128) - 1
STATE_TENSOR_COUNT = 267
MEMORY_BANK_SHAPE = (21560, 1536)
MAX_INPUT_BYTES = 32 * 1024 * 1024


def sha256_path(path: str | Path) -> str:
    h = sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def encode_score(raw_score: float) -> int:
    if type(raw_score) not in (int, float) or not math.isfinite(raw_score) or raw_score < 0:
        raise ValueError("INVALID_RAW_SCORE")
    score = int((Decimal(str(raw_score)) * 1_000_000).to_integral_value(rounding=ROUND_HALF_UP))
    if not (0 <= score <= UINT128_MAX):
        raise ValueError("SCORE_OUT_OF_RANGE")
    return score


def verdict(score_scaled: int) -> str:
    if type(score_scaled) is not int or not (0 <= score_scaled <= UINT128_MAX):
        raise ValueError("INVALID_SCORE_ENCODING")
    return "PASS" if score_scaled < THRESHOLD_SCALED_CANDIDATE else "REVIEW_REQUIRED"


def score_replay_diagnostic(station_score: int, replay_score: int) -> tuple[bool, str]:
    if any(type(v) is not int or not (0 <= v <= UINT128_MAX) for v in (station_score, replay_score)):
        return False, "INVALID_ENCODING"
    if abs(station_score - replay_score) > TOLERANCE_SCALED_CANDIDATE:
        return False, "NUMERIC_MISMATCH"
    if verdict(station_score) != verdict(replay_score):
        return False, "DECISION_MISMATCH"
    return True, "SCORE_CONSISTENT_DIAGNOSTIC_ONLY"


def _checkpoint_state(value: object, depth: int = 0):
    if depth > 3 or not isinstance(value, Mapping):
        return None
    if (len(value) == STATE_TENSOR_COUNT and "model.memory_bank" in value
            and all(isinstance(t, torch.Tensor) for t in value.values())):
        return value
    for item in value.values():
        if isinstance(item, Mapping):
            found = _checkpoint_state(item, depth + 1)
            if found is not None:
                return found
    return None


def _byte_view(t: torch.Tensor) -> torch.Tensor:
    return t.detach().to("cpu").contiguous().reshape(-1).view(torch.uint8)


def verify_exact_state(reference: Mapping, actual: Mapping) -> int:
    if set(reference) != set(actual):
        raise ValueError("STATE_KEY_SET_MISMATCH")
    for name in sorted(reference):
        expected, present = reference[name], actual[name]
        if expected.shape != present.shape or expected.dtype != present.dtype:
            raise ValueError("STATE_METADATA_MISMATCH: " + name)
        # Byte equality handles NaN-bearing post_processor buffers correctly.
        if not torch.equal(_byte_view(expected), _byte_view(present)):
            raise ValueError("MODEL_STATE_MISMATCH: " + name)
    return len(reference)


def _check_policy(policy: dict) -> None:
    try:
        ex, model_info = policy["execution"], policy["model"]
        score, replay = policy["score_policy"], policy["replay_policy"]
        correct = (
            policy["status"] == "DRAFT_NOT_APPROVED"
            and model_info["model_core_sha256"] == EXPECTED_CHECKPOINT_SHA256
            and model_info["weights_reused"] is True
            and ex["preprocessing_must_execute"] is True
            and ex["color_space"] == "RGB"
            and ex["input_scale"] == "uint8_to_float32_divide_by_255"
            and ex["resize"] == [320, 320]
            and ex["center_crop"] == [280, 280]
            and ex["normalization"]["mean"] == [0.485, 0.456, 0.406]
            and ex["normalization"]["std"] == [0.229, 0.224, 0.225]
            and ex["input_tensor_shape"] == [1, 3, 280, 280]
            and ex["score_source"] == "PatchCore_image_level_pred_score"
            and score["scale_exponent"] == 6
            and score["rounding"] == "ROUND_HALF_UP"
            and score["threshold_scaled_candidate"] == THRESHOLD_SCALED_CANDIDATE
            and replay["tolerance_scaled_candidate"] == TOLERANCE_SCALED_CANDIDATE
            and policy["authorized_for_onchain_use"] is False
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("POLICY_PROFILE_MISMATCH") from exc
    if not correct:
        raise ValueError("POLICY_PROFILE_MISMATCH")


class DiagnosticRuntime:
    """Loads its own immutable checkpoint reference. No external model injection."""

    def __init__(self, *, checkpoint_path: str | Path, policy_path: str | Path,
                 data_root: str | Path, device: str):
        if device not in ("cpu", "cuda"):
            raise ValueError("INVALID_DEVICE")
        if device == "cuda" and not torch.cuda.is_available():
            raise ValueError("CUDA_UNAVAILABLE")
        self.device = "cuda:0" if device == "cuda" else "cpu"
        self.data_root = Path(data_root).resolve(strict=True)
        if not self.data_root.is_dir():
            raise ValueError("INVALID_DATA_ROOT")
        self.checkpoint_path = Path(checkpoint_path).resolve(strict=True)
        self.policy_path = Path(policy_path).resolve(strict=True)
        self._verify_file_hashes()
        _check_policy(json.loads(self.policy_path.read_text(encoding="utf-8")))

        with torch.serialization.safe_globals([TorchVersion]):
            checkpoint = torch.load(self.checkpoint_path, map_location="cpu", weights_only=True)
        state = _checkpoint_state(checkpoint)
        if state is None:
            raise ValueError("UNEXPECTED_CHECKPOINT_STRUCTURE")
        self.reference_state = state
        self.preprocessor = Patchcore.configure_pre_processor(
            image_size=(320, 320), center_crop_size=(280, 280)
        )
        self.model = Patchcore(
            backbone="wide_resnet50_2", layers=("layer2", "layer3"),
            pre_trained=False, coreset_sampling_ratio=0.1, num_neighbors=9,
            precision="float32", pre_processor=self.preprocessor,
        )
        self.model.load_state_dict(state, strict=True)
        self.model = self.model.to(self.device).eval()
        if tuple(self.model.model.memory_bank.shape) != MEMORY_BANK_SHAPE:
            raise ValueError("MEMORY_BANK_SHAPE_MISMATCH")
        self.verify_runtime_state()
        self.to_tensor = v2.Compose([
            v2.ToImage(), v2.ToDtype(torch.float32, scale=True)
        ])

    def _verify_file_hashes(self) -> None:
        if sha256_path(self.checkpoint_path) != EXPECTED_CHECKPOINT_SHA256:
            raise ValueError("CHECKPOINT_SHA256_MISMATCH")
        if sha256_path(self.policy_path) != EXPECTED_DRAFT_POLICY_SHA256:
            raise ValueError("DRAFT_POLICY_SHA256_MISMATCH")

    def verify_runtime_state(self) -> int:
        return verify_exact_state(self.reference_state, self.model.state_dict())

    def infer(self, relative_image_path: str, expected_image_sha256: str) -> dict:
        if not isinstance(relative_image_path, str) or "\\" in relative_image_path:
            raise ValueError("INVALID_IMAGE_PATH")
        path_part = PurePosixPath(relative_image_path)
        if (path_part.is_absolute() or ".." in path_part.parts
                or path_part.as_posix() != relative_image_path
                or not path_part.parts
                or path_part.parts[0] not in {"validation", "final_test", "demo", "train"}
                or path_part.suffix.lower() != ".png"):
            raise ValueError("INVALID_IMAGE_PATH")
        if not isinstance(expected_image_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_image_sha256):
            raise ValueError("INVALID_EXPECTED_IMAGE_SHA256")
        path = (self.data_root / relative_image_path).resolve(strict=True)
        if not path.is_relative_to(self.data_root) or not path.is_file():
            raise ValueError("IMAGE_PATH_ESCAPE_OR_MISSING")
        size = path.stat().st_size
        if not (0 < size <= MAX_INPUT_BYTES):
            raise ValueError("IMAGE_SIZE_NOT_ALLOWED")
        image_bytes = path.read_bytes()
        if sha256(image_bytes).hexdigest() != expected_image_sha256:
            raise ValueError("IMAGE_SHA256_MISMATCH")
        self._verify_file_hashes()
        self.verify_runtime_state()
        # The checked bytes, not a reopened mutable path, supply PIL input.
        with Image.open(BytesIO(image_bytes)) as image:
            raw = self.to_tensor(image.convert("RGB")).unsqueeze(0).to(self.device)
        x = self.preprocessor.transform(raw)
        if (tuple(x.shape) != (1, 3, 280, 280)
                or x.dtype != torch.float32
                or x.device.type != ("cuda" if self.device.startswith("cuda") else "cpu")
                or not bool(torch.isfinite(x).all().item())):
            raise ValueError("PREPROCESSING_INVARIANT_FAILED")
        with torch.inference_mode():
            result = self.model.model(x)
            if result.pred_score.numel() != 1:
                raise ValueError("UNEXPECTED_SCORE_SHAPE")
            raw_score = float(result.pred_score.detach().cpu().reshape(-1)[0])
        score_scaled = encode_score(raw_score)
        self.verify_runtime_state()
        self._verify_file_hashes()
        return {
            "schema": "InspectEscrow.V3DiagnosticInference.v1",
            "status": "DRAFT_DIAGNOSTIC_ONLY",
            "image": relative_image_path,
            "image_sha256": expected_image_sha256,
            "checkpoint_sha256": EXPECTED_CHECKPOINT_SHA256,
            "draft_policy_file_sha256": EXPECTED_DRAFT_POLICY_SHA256,
            "device": self.device,
            "preprocessing_applied": True,
            "input_shape": list(x.shape),
            "raw_score": raw_score,
            "score_scaled": score_scaled,
            "decision": verdict(score_scaled),
            "signature": None,
            "formal_replay_authorized": False,
        }
