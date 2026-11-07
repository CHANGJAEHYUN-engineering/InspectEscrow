# InspectEscrow Model B cloud inference source

**Source snapshot:** actual 2026-11-05/06 Railway model service `inspectescrow-modelb-live` (deployment `9b2f3d1f-f880-4408-9124-53a7d6684a1c`). The public server contains Python FastAPI inference code and a cloud adapter, not a fictitious model.

## Model artifact provisioning

The Docker image expects `model/InspectEscrow_ModelB_BACKUP.zip` at build time. This ~95.5 MB artifact contains model data and is intentionally **not available in the public Git repository** because original specimen data/model packaging are separately controlled.

To build a functional image, obtain the archive from the project owner through an authorized private channel and copy it into `model/`, then verify:

- Archive SHA-256: `8102cedf082c0d8553ad03372d6dd125daab895ed56d2cad77c4ac0342b0206d`
- Expected model checkpoint SHA-256: `8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854`

```bash
# Run only after the authorized model ZIP has been placed in model/
docker build -t inspectescrow-modelb .
```

Run with the same `INSPECTESCROW_DEMO_ACCESS_TOKEN` value used by the integrated web service. The web gateway forwards protected Model B requests to this service; do not expose this token in browser JavaScript, public logs or README.

**API source:** `server.py`, `cloud_app.py`, `requirements.txt` and `Dockerfile`. **Input:** real nut TOP capture. **Output:** PatchCore anomaly score, threshold and evidence provenance. Do not claim the model alone certifies physical identity or product quality.

## Verification boundary

Original S05 TOP cloud replay made two actual Model B calls on identical original bytes:
`36,185,043` → synthetic **unsigned** comparison claim `36,185,044` → real rerun `36,185,043`: `INCONSISTENT` at tolerance 0. This comparison sent **zero blockchain TX**.

The demo is not evidence that a cryptographically signed on-chain result was maliciously altered.

## 2026-11-07 PatchCore XAI update
`cloud_xai.py` derives an anomaly overlay from the **actual frozen PatchCore anomaly_map**, without modifying the model threshold. The output includes a SHA-256 commitment, raw map hash, source TOP hash, and four regional **relative** anomaly indices. The 0–100 regional index is not a defect probability and is not calibrated across separate photos. The cloud app exposes a protected `/api/cloud/xai` endpoint and the gateway forwards it with the server-side environment token. `test_live_xai.mjs` is an optional authorized integration test, requiring `INSPECTESCROW_DEMO_ACCESS_TOKEN`; no secrets are included.
