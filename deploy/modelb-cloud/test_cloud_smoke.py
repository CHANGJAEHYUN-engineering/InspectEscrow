import os
from pathlib import Path
os.environ["INSPECTESCROW_DEMO_ACCESS_TOKEN"]="LOCAL_SMOKE_ONLY_NOT_PRODUCTION"
from fastapi.testclient import TestClient
from cloud_app import app
from server import artifact_commitment_status, EXPECTED_BACKUP_SHA256, sha256_file
root=Path(__file__).resolve().parent
assert sha256_file(root/"model"/"InspectEscrow_ModelB_BACKUP.zip")==EXPECTED_BACKUP_SHA256
artifact=artifact_commitment_status()
assert artifact["verified"] is True, artifact
client=TestClient(app)
home=client.get("/")
assert home.status_code==200 and "INSPECTESCROW" in home.text
health=client.get("/api/cloud/health").json()
assert health["artifactVerified"] is True
assert client.post("/api/cloud/warm",headers={"X-Demo-Token":"WRONG"}).status_code==401
assert client.post("/api/cloud/verify",headers={"X-Demo-Token":"WRONG"},json={}).status_code==401
assert client.post("/api/cloud/verify",headers={"X-Demo-Token":"LOCAL_SMOKE_ONLY_NOT_PRODUCTION"},json={}).json()["ok"] is False
print("PASS: FROZEN_MODEL_ZIP_SHA256; ARTIFACT_COMMITMENT; HTML; HEALTH; ACCESS_CONTROL; NON_FORGED_VERIFICATION")
print("NO MODEL INFERENCE OR ONCHAIN TRANSACTIONS PERFORMED")
