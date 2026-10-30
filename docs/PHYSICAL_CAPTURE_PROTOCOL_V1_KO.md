> **구현 경과 (2026-10-31):** 이 문서는 10월 23일에 정의한 촬영 절차 설계안이다. 본문 예시 `IE-DEMO-001` 및 동일 시편 Normal→Scratch 과정은 설계 프로토콜이며, 10월 29일 Sepolia S05 검증은 **Supplier PASS / Buyer PASS 정상 거래**이다. S03 정상/스크래치 비교는 별도 실물 실험이다. 전체 촬영 체인의 하드웨어 진위·동일 시편 운송 이력 검증을 완료한 것으로 해석하지 않는다. 구체적 이력은 [실제 배포·Model B 기록](PATCH3_SEPOLIA_AND_MODEL_B_20261031_KO.md)을 참조한다.

# InspectEscrow Physical Capture Protocol V1

Date: 2026-10-23
Purpose: same-specimen procedure + capture provenance + anti-cherry-picking demo

## 0. Scope

이 프로토콜은 블록체인이 실물 동일성을 증명한다고 주장하지 않는다.

강화 대상:
- 같은 식별자를 가진 실물 시편의 촬영 audit trail
- 촬영 후 파일 integrity
- required views와 순서
- inference 전에 image bytes를 commit했다는 절차

증명하지 않는 대상:
- trusted camera sensor
- 촬영 전 substitution 완전 제거
- transport custody
- 손상 책임 귀속

## 1. Specimen setup

Main specimen:
- specimenId = IE-DEMO-001
- real metal hex nut
- normal state를 먼저 완전 촬영
- 이후 같은 시편에 scratch 생성
- damaged state 재촬영

QR 카드를 옆에만 놓는 것보다 너트 중앙 홀을 통과하는 1회성 cable/numbered tag와 matte QR/serial tag를 권장한다.
Tag에는 IE-DEMO-001 사람이 읽을 수 있는 문자도 병기하고 Supplier/Buyer 촬영 사이 제거하지 않는다.

이 장치는 substitution risk를 줄이지만 cryptographic physical identity proof라고 부르지 않는다.

## 2. Fixed capture station

고정:
- lightbox
- smartphone holder
- camera height/angle
- background
- light setting
- nut position marker
- tag position marker
- TOP / FRONT / SIDE orientation marks

Practice nut로 framing을 확정하고 본 시편 session 시작 뒤 score를 보고 위치를 바꾸지 않는다.

## 3. Required view set

Physical demo V1:
1. TOP
2. FRONT
3. SIDE

Required view count = 3.
순서는 TOP → FRONT → SIDE로 고정한다.
Normal/Supplier session과 scratched/Buyer session 모두 동일 순서를 쓴다.

## 4. Session open

각 session 시작 시:
- tradeId 또는 demoSessionId
- specimenId
- inspectionRole
- captureSessionNonce
- requiredViewSetId
- requiredViewCount = 3
- captureProfileId
- openedAt
- station address

Required views 3/3를 seal하기 전 PatchCore inference를 실행하지 않는다.

## 5. Per-image pre-inference commitment

각 view를 확보하자마자 AI 실행 전에 exact original file bytes로 keccak256 imageHash를 계산한다.

CaptureAttestation V1 fields:
- tradeId/demoSessionId
- inspectionRole
- station
- specimenIdHash
- captureSessionNonce
- viewIdHash
- sequenceIndex
- requiredViewCount
- imageHash
- previousCaptureDigest
- capturedAt
- validUntil

sequenceIndex:
- TOP = 1
- FRONT = 2
- SIDE = 3

첫 view previousCaptureDigest는 ZERO_BYTES32.
FRONT는 TOP digest를, SIDE는 FRONT digest를 참조한다.

이 chaining으로 view order와 session completeness를 검증한다.

## 6. Session seal

3/3 완료 후 CaptureSessionManifest를 생성한다.

필드:
- specimenId
- role
- sessionNonce
- requiredViewSetId
- orderedCaptureDigests
- originalImageHashes
- finalCaptureDigest
- openedAt
- sealedAt
- complete = true

Manifest를 canonicalize + keccak256하고 Station이 서명한다.
그 뒤에만 AI inference를 허용한다.

## 7. Inference rule

AI pipeline은 sealed manifest의 imageHash와 exact match하는 파일만 읽는다.

금지:
- inference 후 잘 나온 사진으로 교체
- 결과를 보고 view 재선택
- 실제 시편 결과에 맞춰 threshold 변경
- 실제 시편 결과에 맞춰 model 재학습

Frozen PatchCore가 스마트폰 사진 domain에서 잘 동작하지 않더라도 결과를 숨기지 않는다.
Physical demo의 1차 목적은 model benchmark가 아니라 capture provenance다.

## 8. Normal → Scratch → Buyer capture

순서:
1. IE-DEMO-001 identity/tag 확인
2. Supplier NORMAL TOP/FRONT/SIDE capture + seal
3. originals/hash/signatures archive
4. 그 다음에만 same nut에 scratch
5. Buyer SCRATCH TOP/FRONT/SIDE capture + seal
6. originals/hash/signatures archive
7. inference

본 시편을 정상촬영 전에 긁지 않는다.

## 9. Anti-cherry-picking rule

Session 시작 전:
- required view set fixed
- sequence fixed
- recapture rule fixed

Recapture 허용:
- file corruption
- explicit QA failure
- camera acquisition failure

Recapture 시:
- 이전 attempt 삭제 금지
- invalid attempt retain
- reasonCode 기록
- attempt number 증가

Score가 마음에 들지 않는다는 이유는 recapture 사유가 아니다.

## 10. Evidence retention

보관:
- original files
- exact byte hashes
- capture session manifest
- capture signature envelopes
- inference reports
- heatmaps
- final Evidence Package
- physical demo procedure recording

Original evidence가 replay 때 없으면 hash만으로 replay 가능하다고 주장하지 않는다. Evidence availability failure로 기록하고 분쟁 절차로 넘긴다.

## 11. Finals demo

권장:
1. 실제 IE-DEMO-001 너트 + attached tag를 보여준다.
2. 15–20초 사전녹화로 normal capture → seal → scratch → recapture를 보여준다.
3. 현장에서 당시 original image를 업로드한다.
4. 시스템이 specimenId, 3/3 order, imageHash, Station signature, session chain을 검증한다.
5. Physical Evidence Verified 후 AI → Evidence → Blockchain → Settlement로 이동한다.

발표 문장:
동일 시편이라는 물리적 연결은 attached identifier·고정 촬영·연속 기록으로 보완하고, 시스템은 촬영 당시 commit된 이미지가 이후 교체되지 않았는지를 hash와 signature로 검증합니다.

## 12. 공격 대응

“QR 다른 너트에 옮기면 되죠?”
맞다. QR 자체를 physical truth proof로 주장하지 않는다. Attached one-time tag + continuous capture로 risk를 줄이며 trusted hardware/custody proof는 production 확장이다.

“사진 여러 장 찍고 좋은 것만 고른 거죠?”
Required view/sequence를 먼저 정하고 session seal 전에 inference를 금지하며 invalid recapture attempt를 retain한다.

“촬영 전에 조작하면요?”
현재 hash는 촬영 이후 integrity를 보장한다. Pre-capture truth는 trusted camera/TEE 없이는 완전 증명하지 않는다.

“그 실물 사진에 AI를 맞춘 거죠?”
Frozen model/threshold는 physical capture 전에 고정되어 있고 physical result 때문에 재학습/threshold 변경을 금지한다.
