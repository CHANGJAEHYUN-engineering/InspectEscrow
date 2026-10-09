# External / Large Model Artifacts

다음 파일은 GitHub 일반 push용 ZIP에서 제외했다.

## 1. PatchCore model core
- file: `patchcore_v2_model_core.pt`
- byteLength: `232188217`
- SHA-256: `8ab4beeb37242a742bac75c8f697d4af625eaf5acda339c887d6c77c9f6bd36b`
- Keccak-256: `0xc75c7edea0b06c01f0cccb2f30e4223c16a4fedb58690adfb77d8a247524270a`

## 2. PatchCore memory bank
- file: `MODEL_BUNDLE/patchcore_v2_memory_bank.pt`
- byteLength: `132466400`
- Keccak-256: `0x4761c52147167bcfb846dbf2362ab72dc94badb388bf054ec5e65ca609985b06`

두 artifact 모두 최종 Model Bundle의 committed child다.
`FINAL_MODEL_BUNDLE_PHASE1_SEMANTIC_PATCH1.json`의 digest와 실제 Drive artifact bytes가 1:1 일치하는 것을 감사했다.

GitHub에는 Git LFS 또는 Release asset 사용을 권장한다.
