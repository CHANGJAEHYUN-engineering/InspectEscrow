# PatchCore vs Baselines — Fair Comparison

This folder prepares the one-table AI comparison requested in mentoring.

Models:
1. Mean-image pixel MSE — trivial non-learned image baseline
2. ImageNet pretrained WideResNet50-2 global-feature 1-NN — reasonable global anomaly baseline
3. InspectEscrow frozen PatchCore V2 — local patch-memory method

Fairness rules:
- same frozen train/validation/final split
- same 320 resize / 280 center-crop geometry
- PatchCore model and threshold are never modified
- baseline thresholds are calibrated only on validation with the same Youden-J tie rule
- validation metrics are calibration-set comparisons, not independent test certification
- V2 final89 is always labeled POST_HOC COMPARATIVE

Expected dataset root:
    /content/inspectescrow_dataset/InspectEscrow_metal_nut_FINAL_DATASET

Example Colab command:

    python compare_baselines.py \
      --dataset-root /content/inspectescrow_dataset/InspectEscrow_metal_nut_FINAL_DATASET \
      --patchcore-validation-csv ../core/validation_v2_raw_scores.csv \
      --patchcore-final-csv ../core/v2_posthoc_final_test_raw_scores.csv \
      --output-dir /content/InspectEscrow_baseline_comparison

Do not use the result to retune PatchCore. It is evidence for model-choice explanation only.
