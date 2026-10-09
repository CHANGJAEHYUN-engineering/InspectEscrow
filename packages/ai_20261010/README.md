# InspectEscrow AI — GitHub Sync Package

이 ZIP은 **2026-10-10 기준 최신 Colab AI 작업**을 GitHub에 반영하기 위한 경량 패키지다.

## 현재 Frozen 핵심값
- `policyVersion = 1`
- `policyHash = 0x85cd60bd89d1c82d39a313443723997283d79a46ec415c4c1064088ffe3f9d11`
- `modelBundleHash = 0x64f3359a4e9a276a5f0abef0e5305f42b513dbae1ac5698cb08c9e066962383e`
- `scoreSchemaId = 0xcf1476a2ae70ac5fad6ba79a7f55bab4b4c4973dd892d65de9a887bf08d1f1f8`
- `thresholdScaled = 57904037`
- `tradeId = 0xe021917ece6af29be9a02300cccfe293f484ba685721f49550a98da96d64c94c`
- Sepolia contract: `0x270e3E8a53dC50A04f0d83b5b4ae9416EB42fFa9`

## Demo scenario
- Supplier: `demo/good/000.png` → `55442036` → PASS
- Buyer: `demo/scratch/022.png` → `60138172` → REVIEW_REQUIRED
- Intended state path: Supplier PASS → Buyer REVIEW → `DISPUTED_PRIMARY`

## Notebook
`notebooks/InspectEscrow_AI_E2E_FINAL_GITHUB.ipynb`

최신 수동 감사 내용을 notebook에 반영했다.
- pycryptodome dependency fix
- `policyVersion = 1` assertion
- final Model Bundle 10/10 child digest audit
- historical `supersedesModelBundleHash` 허용 규칙
- robust multi-RPC Sepolia tradeId preflight
- Supplier/Buyer JIT Evidence Package + EIP-712 unsigned payload
- Replay/Inspector handoff
- Final QA/ZIP generation

## GitHub에서 제외한 대용량 파일
일반 GitHub 단일 파일 제한을 넘기므로 아래 2개는 ZIP에서 제외했다.
자세한 digest는 `docs/MODEL_ARTIFACTS_EXTERNAL.md` 참고.
- `patchcore_v2_model_core.pt` — 232,188,217 bytes
- `MODEL_BUNDLE/patchcore_v2_memory_bank.pt` — 132,466,400 bytes

원본 모델 파일을 저장하려면 Git LFS / Release asset / 외부 object storage를 사용한다.

## 주의
- private key / mnemonic / station signature는 포함하지 않는다.
- 이 패키지는 AI + evidence + contract handoff 자료다.
- public MVTec dataset simulation이며 실제 physical custody / same-item proof를 주장하지 않는다.
- `ONCHAIN_UNUSED_TRADE_ID_PREFLIGHT_V1.json`은 Drive의 기존 freeze artifact다.
  더 최근의 세션 preflight 결과는 `audit_notes/LATEST_SEPOLIA_PREFLIGHT_SESSION_NOTE.json`에 별도로 기록했다.
