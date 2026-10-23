# InspectEscrow — Trust Assumption Register

Date: 2026-10-23
Status: FINAL DESIGN CONTROL

InspectEscrow의 목표는 모든 신뢰를 제거하는 것이 아니다.
목표는 각 신뢰를 명시하고, 그 주체가 침해되었을 때 무엇까지 영향을 줄 수 있는지 제한하며, 서로 다른 권한을 한 주체에 몰아주지 않는 것이다.

## 1. 핵심 원칙

- Blockchain은 physical truth oracle이 아니다.
- Hash는 truth가 아니라 integrity를 증명한다.
- Signature는 honest execution 자체의 증명이 아니다.
- Replay CONSISTENT는 quality correctness가 아니다.
- Inspector 판단은 infallible truth가 아니다.
- Separate wallet은 independent organization의 증명이 아니다.
- Testnet E2E는 production certification이 아니다.

대신 시스템은 사전 합의된 business rule, evidence hash, signer authority, state transition, settlement authority, claimable/withdraw accounting을 검증한다.

## 2. Trust roots

| Trust root | 신뢰 범위 | 침해 시 영향 | 단독으로 못 하는 것 | Mitigation |
|---|---|---|---|---|
| Physical Capture Operator | 선택된 파일이 촬영 세션 원본이라는 운영행위 | 촬영 전 substitution / staged scene | hash-commit 이후 파일 교체 | fixed jig, attached tag, ordered capture, continuous recording, pre-inference hash/sign |
| Supplier Station | Supplier evidence signer | 잘못된 새 attestation 시도 | policy/threshold 변경, direct settlement | registry status, nonce, deadline, anchors |
| Buyer Station | Buyer evidence signer | 잘못된 새 attestation 시도 | direct settlement | 동일 |
| Primary Inspector Station | Primary replay/decision signer | Primary evidence/judgment 오염 | Backup key 사용, direct withdrawal | distinct key, deadline, failover |
| Backup Inspector Station | Backup replay/decision signer | Backup evidence/judgment 오염 | Primary key 사용, direct withdrawal | distinct key, separate actor |
| External Arbitrator Station | 최종 중재 signer | RELEASE/REFUND 중 잘못된 판단 | arbitrary amount, policy mutation, direct withdrawal | bounded outcome, reasonCode, decisionEvidenceHash |
| Credential Registry Authority | credential lifecycle | credential availability 방해 | escrow state 직접 변경, settlement 선택, sweep | role separation, public events, production multisig |
| Ethereum/Sepolia | state/order/finality | outage/reorg/delay | physical truth 생성 | confirmation policy, claim boundary |
| RPC/UI | chain data 전달/표시 | stale/wrong display | canonical chain state 변경 | chain read, Etherscan, multi-RPC |
| Off-chain Evidence Storage | 원본 availability | replay 불가 | committed hash 변경 | retention, digest, backup |
| PatchCore Model Bundle | frozen inference definition | artifact/runtime 문제 | settlement 자동 결정 | modelBundleHash, manifest, replay |
| Human Inspector/Arbitrator | real-world judgment | wrong human judgment | arbitrary transfer, hidden rule change | bounded outputs, evidence-basis hash |

## 3. Credential Authority governance risk

Credential lifecycle을 허용하려면 명시적 security trust root가 필요하다.

현재 PATCH3 hardening:
- Authority는 Escrow admin이 아니다.
- Authority는 register / suspend / resume / revoke만 한다.
- credential 변경만으로 Escrow state는 변하지 않는다.
- RELEASE/REFUND를 직접 호출할 수 없다.
- policy, fallback, threshold를 바꿀 수 없다.
- withdraw나 sweep을 할 수 없다.

남는 위험:
malicious Authority가 필수 credential을 정지하여 availability를 방해할 수 있다.

이 위험은 숨기지 않는다. Production mitigation은 dedicated multisig/dual-control, Actor/Station과 governance signer 분리, reasonCode/event audit, emergency runbook이다.

발표 claim:
PATCH3는 Credential Authority를 trustless하게 만들지 않는다. 대신 명시적이고 제한된 security trust root로 만들고 settlement authority와 분리한다.

## 4. External Arbitrator boundary

External Arbitrator는 진실을 암호학적으로 증명하는 Oracle이 아니다.

가능:
- RELEASE_TO_SUPPLIER
- REFUND_TO_BUYER

불가능:
- arbitrary amount
- policy mutation
- evidence replacement
- direct withdraw
- escrow sweep

필수 evidence:
- policyHash
- Supplier/Buyer evidence anchors
- reasonCode
- decisionEvidenceHash
- nonce
- issuedAt / validUntil
- dedicated Station signature

## 5. Physical truth boundary

현재 MVP가 증명하지 않는 것:
- QR 자체가 동일 금속을 cryptographically 증명
- 촬영 전에 다른 시편로 바꾸지 않았음
- camera sensor 자체가 trusted hardware임
- transport custody 완전성
- 손상 책임 귀속

Physical Capture Protocol은 위험을 줄이고 auditability를 높이지만 Oracle Problem을 제거하지 않는다.

## 6. AI boundary

PatchCore output은 anomaly score, heatmap, threshold-based PASS/REVIEW input이다.

아닌 것:
- legal defect probability
- responsibility attribution
- payment instruction
- universal production performance guarantee

Replay CONSISTENT는 frozen evidence/model execution이 허용 tolerance 안에서 재현됐다는 뜻이지 실제 품질판정이 옳다는 뜻이 아니다.

## 7. Database alternative boundary

중앙 DB + 전자서명 + escrow operator도 유사 workflow를 만들 수 있다.

InspectEscrow가 blockchain으로 바꾸는 핵심은 기능 존재가 아니라 authority topology다.

- Supplier 단독 active rule 변경 불가
- Buyer 단독 변경 불가
- Inspector 직접 fund withdrawal 불가
- Credential Authority 직접 settlement 불가
- Frontend/operator 단독 chain state rewrite 불가

발표 claim:
블록체인이 있어야 workflow가 기술적으로 가능하다는 것이 아니라, 상충하는 이해관계자 사이에서 누구도 단독으로 active rule/state/settlement를 다시 쓰지 못하게 하는 shared execution layer로 사용한다.

## 8. Production claim boundary

현재:
- public MVTec-based reproduction scenario
- Sepolia testnet
- hackathon PoC
- automated local red-team + Slither

아님:
- independent professional security audit
- production certification
- legal enforceability opinion
- industrial camera certification
- audited custody chain
- universal cross-machine AI reproducibility

이 경계를 지키는 것이 설계 신뢰성의 일부다.
