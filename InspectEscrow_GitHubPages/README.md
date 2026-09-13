# InspectEscrow

> **Pre-committed AI Inspection & Dispute Escrow for Manufacturing Transactions**

제조부품 거래 전에 **검사 evidence · 판정 기준 · AI model · preprocessing · 재검 규칙**을 고정하고,  
출하·입고 검사 이견을 **독립 재검**과 **비수탁 검수잔금 상태**로 연결하는 인터랙티브 프로토타입입니다.

## Live Demo

GitHub Pages를 켜면 이 저장소 자체가 제출용 단일 링크가 됩니다.

**Settings → Pages → Deploy from a branch → `main` / `(root)` → Save**

약 1~3분 뒤 생성되는 Pages URL을 README 상단에 추가하세요.

---

## What the demo shows

1. **Pre-commit**
   - Buyer / Supplier가 검사 기준, AI 버전, 재검 규칙, 금액을 합의
2. **Funded**
   - Test asset이 예치되고 active job의 조건을 잠금
3. **Outbound evidence**
   - 공급사 출하검사 evidence / manifest 제출
4. **Inbound inspection**
   - 구매사 입고검사에서 AI가 `REVIEW` 권고
5. **Dispute**
   - Buyer 이의제기 → 잔금 `FROZEN`
6. **Independent reinspection**
   - Inspector가 사전 고정 기준으로 재검 후 서명
7. **Settlement**
   - 사전 정의된 규칙으로 지급/환급
8. **Unauthorized action test**
   - active job의 모델/기준 변경, operator 임의 출금 시도 → `REJECTED`

---

## Why blockchain?

이 프로젝트는 **“블록체인은 데이터가 안 바뀌니까 쓴다”**고 주장하지 않습니다.

전자서명 + WORM + transparency log + neutral SaaS도 evidence 무결성을 강하게 제공할 수 있습니다.

InspectEscrow에서 blockchain의 추가 역할은 **Funded 이후**:

- Buyer가 결과를 본 뒤 rule/model을 단독 변경하지 못하고
- Supplier가 disputed 상태를 혼자 accepted로 바꾸지 못하며
- Platform operator가 active job의 예치자금을 임의의 주소로 sweep하지 못하도록

**Contract / Governance State와 자금 집행 권한을 제한하는 것**입니다.

> 이 비수탁 예치 수요가 실제 고객의 핵심 요구인지 여부는 아직 검증되지 않은 사업 가정입니다.

---

## AI role

- **Input:** 고정 fixture에서 취득한 한 부품군 이미지
- **Model target:** PatchCore 1개 구성
- **Output:** anomaly score / heatmap / `PASS` 또는 `REVIEW` 권고
- **Strong baselines:** template / SSIM / area rules / global-feature kNN
- **Metrics:** AUROC, AP, fixed-FPR recall, hold rate, error cases

AI가 법적 불량 여부나 실제 지급 여부를 결정하지 않습니다.

---

## Current implementation status

### 실제 동작하는 것
- 인터랙티브 state flow
- manifest JSON 생성
- 브라우저 Web Crypto API 기반 SHA-256 digest 생성
- role switching / event log
- unauthorized action rejection 시나리오
- log JSON 다운로드
- GitHub Pages 정적 배포

### 현재 시뮬레이션인 것
- PatchCore inference score
- MetaMask wallet signing
- Sepolia transaction
- Solidity escrow state transition

본선 진출 시 위 3개를 실제 구현에 연결하는 것이 목표입니다.

---

## Planned MVP stack

| Layer | Stack |
|---|---|
| Frontend | React |
| Backend | FastAPI |
| DB | PostgreSQL |
| AI | Python, PatchCore, OpenCV, scikit-learn |
| Blockchain | Solidity, Ethereum Sepolia |
| Wallet | MetaMask |
| Web3 client | ethers.js |
| Storage | Off-chain object storage + on-chain digest |

**Contract count: 1**  
NFT / DAO / custom token / multi-chain은 구현하지 않습니다.

---

## On-chain / Off-chain

### Off-chain
- 원본 이미지
- AI weights / preprocessing
- heatmap / 상세 report
- 민감한 기업 데이터

### On-chain
- evidence / rule / model digest
- parties / deadlines
- acceptance / dispute / reinspection state
- inspector decision reference
- escrow settlement state

---

## Important limitations

InspectEscrow는 다음을 해결한다고 주장하지 않습니다.

- 사진 속 물체와 실제 납품품의 동일성
- QR 복제 / 촬영 후 바꿔치기
- 운송 중 손상
- 검사자 공모
- AI 실행의 정직성
- AI의 법적 불량 판정
- 실제 제조기업의 비수탁 escrow 구매의사
- 실제 반도체 생산라인 수준의 성능

Blockchain의 주된 역할은 **Contract / Governance State**, 보조 역할은 **Data Integrity**입니다.

---

## Prior-art positioning

기존 제조 traceability, AI-assisted quality verification, inspection escrow 관련 기술과 연구가 존재합니다.

따라서 이 프로젝트는 **“세계 최초”**를 주장하지 않습니다.

차별화는 다음 제한된 end-to-end workflow의 구현에 둡니다.

> **영상 evidence + inspection recipe + AI model/preprocessing 사전 고정 → AI 검수보조 → buyer dispute → independent reinspection → non-custodial inspection-balance settlement**

---

## 90-second demo story

**0–15s**  
Buyer / Supplier가 검사 조건·재검 규칙·잔금을 합의하고 Funded

**15–30s**  
Supplier가 outbound evidence 제출

**30–45s**  
Inbound inspection에서 `REVIEW`

**45–60s**  
Buyer dispute → escrow frozen

**60–75s**  
Independent Inspector가 재검·서명

**75–90s**  
사전 규칙으로 settlement  
+ operator 임의 변경 / 출금 시도 → rejected

---

## Run locally

별도 설치가 필요 없습니다.

```bash
git clone <YOUR_REPOSITORY_URL>
cd InspectEscrow
```

`index.html`을 브라우저에서 열면 됩니다.

로컬 서버를 쓰려면:

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속.

---

## GitHub Pages setup

1. 저장소를 `Public`으로 생성
2. 이 폴더 안의 파일을 저장소 root에 업로드
3. `Settings`
4. `Pages`
5. **Build and deployment → Deploy from a branch**
6. Branch: `main`
7. Folder: `/(root)`
8. `Save`
9. 생성된 Pages URL을 이 README의 **Live Demo** 위치에 추가

---

## Competition scope

Track: **산업 및 비즈니스 혁신 솔루션**

This repository is a **preliminary interactive prototype for competition submission**.
