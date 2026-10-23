#!/usr/bin/env python3
"""
InspectEscrow fair baseline comparison.

Baselines:
1) Mean-image pixel MSE (no learned anomaly model)
2) ImageNet-pretrained WideResNet50-2 global-feature 1-NN
3) Frozen PatchCore V2 scores loaded from existing CSV

Rules:
- PatchCore model/threshold are never changed.
- Baseline thresholds are calibrated on validation only using the same Youden-J rule.
- final_test is labeled POST_HOC_COMPARATIVE, never untouched held-out for V2.
"""
from __future__ import annotations
import argparse, json, math
from pathlib import Path
import numpy as np
import pandas as pd
from PIL import Image
from sklearn.metrics import (
    roc_auc_score, average_precision_score, recall_score, precision_score,
    f1_score, accuracy_score, confusion_matrix
)
import torch
import torch.nn.functional as F
from torchvision.models import wide_resnet50_2, Wide_ResNet50_2_Weights
from torchvision.transforms import Compose, Resize, CenterCrop, ToTensor, Normalize

PATCHCORE_THRESHOLD = 57.90403747558594
CATEGORIES = ("good", "bent", "color", "flip", "scratch")

def parse_args():
    p=argparse.ArgumentParser()
    p.add_argument("--dataset-root", required=True, help=".../InspectEscrow_metal_nut_FINAL_DATASET")
    p.add_argument("--patchcore-validation-csv", required=True)
    p.add_argument("--patchcore-final-csv")
    p.add_argument("--output-dir", default="baseline_comparison_output")
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    return p.parse_args()

def list_split(root: Path, split: str) -> pd.DataFrame:
    rows=[]
    for cat in CATEGORIES:
        d=root/split/cat
        if not d.exists():
            continue
        for p in sorted(d.glob("*.png")):
            rows.append({
                "split":split,
                "category":cat,
                "filename":p.name,
                "relative_key":f"{split}/{cat}/{p.name}",
                "path":str(p),
                "label":0 if cat=="good" else 1,
            })
    df=pd.DataFrame(rows)
    if df.empty:
        raise RuntimeError(f"No PNG images found under {root/split}")
    return df

def preprocess_pixel():
    return Compose([Resize((320,320)), CenterCrop((280,280)), ToTensor()])

def preprocess_feature():
    return Compose([
        Resize((320,320)), CenterCrop((280,280)), ToTensor(),
        Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])
    ])

def load_batch(paths, transform):
    return torch.stack([transform(Image.open(p).convert("RGB")) for p in paths])

@torch.inference_mode()
def mean_image_scores(train_df, eval_df, device):
    tfm=preprocess_pixel()
    acc=None
    n=0
    for start in range(0,len(train_df),16):
        x=load_batch(train_df.path.iloc[start:start+16],tfm).to(device)
        batch=x.sum(dim=0)
        acc=batch if acc is None else acc+batch
        n+=x.shape[0]
    mean=acc/n
    scores=[]
    for start in range(0,len(eval_df),16):
        x=load_batch(eval_df.path.iloc[start:start+16],tfm).to(device)
        mse=((x-mean)**2).flatten(1).mean(1)
        scores.extend(mse.cpu().numpy().tolist())
    return np.asarray(scores,dtype=float)

@torch.inference_mode()
def extract_global_features(df, model, tfm, device, batch_size):
    feats=[]
    for start in range(0,len(df),batch_size):
        x=load_batch(df.path.iloc[start:start+batch_size],tfm).to(device)
        z=model(x)
        z=F.normalize(z,dim=1)
        feats.append(z.cpu())
    return torch.cat(feats,dim=0)

def global_knn_scores(train_df, eval_df, device, batch_size):
    weights=Wide_ResNet50_2_Weights.DEFAULT
    model=wide_resnet50_2(weights=weights)
    model.fc=torch.nn.Identity()
    model.eval().to(device)
    tfm=preprocess_feature()
    train=extract_global_features(train_df,model,tfm,device,batch_size)
    test=extract_global_features(eval_df,model,tfm,device,batch_size)
    # cosine distance to nearest normal train image
    sim=test @ train.T
    score=1.0-sim.max(dim=1).values
    return score.numpy().astype(float)

def youden_threshold(y, scores):
    y=np.asarray(y,dtype=int)
    scores=np.asarray(scores,dtype=float)
    candidates=np.unique(scores)
    best=None
    for thr in candidates:
        pred=(scores>=thr).astype(int)
        tn,fp,fn,tp=confusion_matrix(y,pred,labels=[0,1]).ravel()
        recall=tp/(tp+fn) if tp+fn else 0.0
        fpr=fp/(fp+tn) if fp+tn else 0.0
        j=recall-fpr
        key=(j,recall,-thr)  # max J; then higher recall; then lower threshold
        if best is None or key>best[0]:
            best=(key,float(thr))
    return best[1]

def metrics(y,scores,threshold):
    y=np.asarray(y,dtype=int); scores=np.asarray(scores,dtype=float)
    pred=(scores>=threshold).astype(int)
    tn,fp,fn,tp=confusion_matrix(y,pred,labels=[0,1]).ravel()
    return {
        "n":int(len(y)),
        "positives":int(y.sum()),
        "negatives":int((1-y).sum()),
        "auroc":float(roc_auc_score(y,scores)),
        "average_precision":float(average_precision_score(y,scores)),
        "threshold":float(threshold),
        "recall":float(recall_score(y,pred,zero_division=0)),
        "fpr":float(fp/(fp+tn) if fp+tn else 0.0),
        "precision":float(precision_score(y,pred,zero_division=0)),
        "f1":float(f1_score(y,pred,zero_division=0)),
        "accuracy":float(accuracy_score(y,pred)),
        "confusion":{"tn":int(tn),"fp":int(fp),"fn":int(fn),"tp":int(tp)}
    }

def load_patchcore(csv_path, split_df):
    raw=pd.read_csv(csv_path)
    raw["relative_key"]=raw["image_path"].astype(str).str.extract(
        r"(validation|final_test)/([^/]+)/([^/]+)$"
    ).apply(lambda r:f"{r[0]}/{r[1]}/{r[2]}",axis=1)
    m=split_df[["relative_key","label"]].merge(
        raw[["relative_key","anomaly_score","gt_label"]],on="relative_key",how="left",validate="one_to_one"
    )
    if m.anomaly_score.isna().any():
        missing=m.loc[m.anomaly_score.isna(),"relative_key"].tolist()
        raise RuntimeError(f"Missing PatchCore scores: {missing[:5]}")
    if not np.array_equal(m.label.to_numpy(),m.gt_label.to_numpy()):
        raise RuntimeError("PatchCore CSV labels do not match dataset folders")
    return m.anomaly_score.to_numpy(dtype=float)

def table_md(rows):
    cols=["model","split","n","auroc","average_precision","threshold","recall","fpr","f1","accuracy"]
    out=["| "+" | ".join(cols)+" |","|"+"|".join(["---"]*len(cols))+"|"]
    for r in rows:
        vals=[]
        for c in cols:
            v=r[c]
            vals.append(f"{v:.6f}" if isinstance(v,float) else str(v))
        out.append("| "+" | ".join(vals)+" |")
    return "\n".join(out)+"\n"

def main():
    a=parse_args()
    root=Path(a.dataset_root)
    out=Path(a.output_dir); out.mkdir(parents=True,exist_ok=True)
    train=list_split(root,"train")
    train=train[train.category=="good"].reset_index(drop=True)
    val=list_split(root,"validation").reset_index(drop=True)
    final=list_split(root,"final_test").reset_index(drop=True)

    if len(train)!=176:
        print(f"WARNING: expected 176 train/good images, found {len(train)}")
    if len(val)!=63:
        print(f"WARNING: expected 63 validation images, found {len(val)}")
    if len(final)!=89:
        print(f"WARNING: expected 89 final_test images, found {len(final)}")

    print("Computing Mean-Image MSE...")
    mean_val=mean_image_scores(train,val,a.device)
    mean_final=mean_image_scores(train,final,a.device)
    mean_thr=youden_threshold(val.label,mean_val)

    print("Computing WideResNet global-feature 1-NN...")
    knn_val=global_knn_scores(train,val,a.device,a.batch_size)
    knn_final=global_knn_scores(train,final,a.device,a.batch_size)
    knn_thr=youden_threshold(val.label,knn_val)

    patch_val=load_patchcore(a.patchcore_validation_csv,val)
    # Verify frozen threshold is exactly the historical calibration rule result.
    recomputed_patch_thr=youden_threshold(val.label,patch_val)
    if not math.isclose(recomputed_patch_thr,PATCHCORE_THRESHOLD,rel_tol=0,abs_tol=1e-12):
        raise RuntimeError(
            f"Frozen PatchCore threshold mismatch: recomputed={recomputed_patch_thr} frozen={PATCHCORE_THRESHOLD}"
        )

    rows=[]
    for name,scores,thr in [
        ("MeanImage_MSE",mean_val,mean_thr),
        ("WRN50_GlobalFeature_1NN",knn_val,knn_thr),
        ("PatchCore_V2_FROZEN",patch_val,PATCHCORE_THRESHOLD),
    ]:
        m=metrics(val.label,scores,thr); m.update(model=name,split="VALIDATION_CALIBRATION")
        rows.append(m)

    score_frames=[
        val.assign(model="MeanImage_MSE",score=mean_val,threshold=mean_thr),
        val.assign(model="WRN50_GlobalFeature_1NN",score=knn_val,threshold=knn_thr),
        val.assign(model="PatchCore_V2_FROZEN",score=patch_val,threshold=PATCHCORE_THRESHOLD),
    ]

    if a.patchcore_final_csv:
        patch_final=load_patchcore(a.patchcore_final_csv,final)
        for name,scores,thr in [
            ("MeanImage_MSE",mean_final,mean_thr),
            ("WRN50_GlobalFeature_1NN",knn_final,knn_thr),
            ("PatchCore_V2_FROZEN",patch_final,PATCHCORE_THRESHOLD),
        ]:
            m=metrics(final.label,scores,thr)
            m.update(model=name,split="FINAL89_POST_HOC_COMPARATIVE")
            rows.append(m)
        score_frames += [
            final.assign(model="MeanImage_MSE",score=mean_final,threshold=mean_thr),
            final.assign(model="WRN50_GlobalFeature_1NN",score=knn_final,threshold=knn_thr),
            final.assign(model="PatchCore_V2_FROZEN",score=patch_final,threshold=PATCHCORE_THRESHOLD),
        ]

    result={
        "schema":"inspectescrow.patchcore-baseline-comparison/1.0.0",
        "status":"COMPUTED_NO_PATCHCORE_RETUNING",
        "dataset":"MVTec AD metal_nut / InspectEscrow frozen split",
        "rules":{
            "patchcoreModelChanged":False,
            "patchcoreThresholdChanged":False,
            "baselineThresholdSelection":"validation only; maximize Youden J; tie higher recall; tie lower threshold",
            "validationInterpretation":"calibration comparison, not independent held-out certification",
            "final89Interpretation":"POST_HOC_COMPARATIVE, NOT untouched held-out for PatchCore V2"
        },
        "rows":rows
    }
    (out/"PATCHCORE_BASELINE_COMPARISON.json").write_text(json.dumps(result,indent=2)+"\n")
    (out/"PATCHCORE_BASELINE_COMPARISON.md").write_text(
        "# PatchCore vs Baselines\n\n"
        "> Validation is a calibration comparison. Final89 is POST_HOC COMPARATIVE and must not be described as untouched held-out V2 performance.\n\n"
        +table_md(rows)
    )
    pd.concat(score_frames,ignore_index=True).to_csv(out/"PATCHCORE_BASELINE_ALL_SCORES.csv",index=False)
    print(table_md(rows))
    print("Wrote:",out)

if __name__=="__main__":
    main()
