# InspectEscrow PHASE 3B — 지갑·프론트 연동 패키지

동결 컨트랙트와 ABI를 그대로 사용한 **로컬 운영용 브라우저 지갑 연동 화면**입니다.
현재 완료 범위는 연동 코드 및 로컬 합성 데이터 E2E입니다. 실제 제조 AI·실물 검사·Sepolia funded E2E 완료를 뜻하지 않습니다.

## 바로 실행

1. ZIP을 모두 압축 해제합니다.
2. 패키지 폴더에서 `python serve.py`를 실행합니다. Python 3가 필요합니다.
3. 브라우저에서 <http://localhost:8787>을 엽니다. `index.html` 더블클릭 대신 HTTP 서버를 사용합니다.
4. Sepolia를 지원하는 브라우저 지갑 확장 프로그램에서 역할 계정을 선택합니다.
5. **Sepolia 지갑 연결**을 누릅니다. 이 사이트에 연결된 네트워크가 Mainnet이면 MetaMask가 Sepolia 전환 승인 창을 자동으로 표시합니다. 승인 후 chainId, EIP-712 domain, 컨트랙트 버전, immutable 범위를 제외한 동결 runtime, 회계 보존을 실제 지갑 RPC에서 확인합니다.

브라우저 파일은 ethers 6.15.0을 동봉해 CDN이나 npm 설치가 필요 없습니다. 이 패키지는 로컬 주소에서 실행되며 공개 웹사이트로 배포하지 않았습니다. 개인키·시드 구문을 입력하는 화면은 없습니다.

## 실제 거래 준비

`docs/PHASE3B_INPUTS_TO_FREEZE.json`의 빈 항목을 담당자와 확정하고, `docs/TradeTerms.template.json`을 채웁니다. 이 양식에는 임의로 정한 calibration 수치나 사용할 수 있는 샘플 역할 주소를 넣지 않았습니다. null은 온체인 거래 인자로 사용할 수 없습니다.

확정해야 할 항목은 제품·결함 범위, 모델/촬영/제품/필수 뷰/score schema 해시, 실제 calibration 임계값·정수 범위, 재검사 수·timeout, replay tolerance, evidence 저장 규칙, 최소 Sepolia 테스트 금액, 역할 주소 7개입니다.
해시 알고리즘·파일 정규화 규칙은 AI/evidence 담당자와 먼저 합의하세요. bytes32라는 이유만으로 Keccak과 SHA-256을 서로 바꿔 쓰면 안 됩니다. `policyHash`는 실제 승인 정책에 대응해야 합니다.

Actor 4개(Supplier, Buyer, Primary Inspector, Backup Inspector)와 Station 3개(Supplier, Buyer, Inspector)는 모두 서로 다른 주소입니다. Buyer는 escrow 금액과 gas가 필요합니다. 거래를 보내는 Actor들도 gas가 필요하며, 오프체인 서명만 하는 Station에는 서명 자체를 위한 gas가 필요하지 않습니다.

## 정상 지급 순서

| 순서 | 지갑 | 함수 | 인자 배열 |
|---|---|---|---|
| 1 | Supplier 또는 Buyer | proposeTrade | `[TradeTerms]` |
| 2 | Supplier | acceptPolicy | `[tradeId]` |
| 3 | Buyer | acceptPolicy | `[tradeId]` |
| 4 | Primary Inspector | acceptInspectorAssignment | `[tradeId]` |
| 5 | Backup Inspector | acceptInspectorAssignment | `[tradeId]` |
| 6 | Buyer | fund | `[tradeId]` — 금액은 온체인 terms에서 자동 조회 |
| 7 | 임의 Actor | activate | `[tradeId]` |
| 8 | Supplier Station 서명 → Supplier 제출 | submitInspection | `[message, signature]` |
| 9 | Buyer Station 서명 → Buyer 제출 | submitInspection | `[message, signature]` |
| 10 | Buyer | acceptAndRelease | `[tradeId]` |
| 11 | Supplier | withdraw | `[]` |

8번에서 Supplier의 유효한 score가 threshold보다 작아 `ADMISSIBLE_PASS`가 되어야 Buyer 검사 단계로 갑니다. 출하는 Supplier PASS 이후에만 진행합니다. 9번도 PASS이면 Buyer가 승인해 Supplier의 claimable로 지급 권리가 이동합니다. 실제 ETH 이체는 11번 withdraw입니다.

## 서명 전달

1. 이미 제안된 거래의 `tradeId`와 확정 terms를 기준으로 검사 엔진의 message를 입력합니다. 필드·타입은 `baseline/EIP712_TYPED_DATA_SCHEMA.json`이 기준입니다. `docs/StationAttestation.template.json` 등 4개 빈 양식과 `baseline/ENUMS_SOURCE_DERIVED.json`의 정확한 enum 번호를 사용할 수 있습니다.
2. 해당 Station 지갑으로 **지갑에서 서명** → **서명 JSON 저장**을 누릅니다.
3. 제출할 Actor 지갑으로 전환합니다. **서명 JSON 불러오기**로 해당 파일을 불러옵니다.
4. **거래 미리보기**로 staticCall·gas 추정·현재 상태·발신자·금액·calldata를 확인합니다.
5. **지갑에서 거래 승인**을 누릅니다. 인자나 계정/체인 변경 시 미리보기를 다시 해야 합니다.
6. 각 거래의 2 confirmations를 기다리고 **증거 JSON 저장**을 누릅니다. 거래 수수료는 gasUsed × effective gas price로 기록합니다.

서명 JSON은 서명자가 작성한 주장에 대한 증거입니다. 화면은 AI를 실행하거나 specimen을 인증하지 않습니다. nonce는 각 목적에 맞는 새 bytes32로 지정하고, timestamp는 Unix 초 정수입니다. issuedAt을 미래로 설정하지 마세요. score는 정수 문자열로 전달해 정밀도 손실을 피합니다.

## 분쟁 경로

Buyer의 유효 score가 threshold 이상(같아도 REVIEW)이면 `DISPUTED_PRIMARY`입니다.
Inspector Station이 `ReplayAttestation`에 서명하고 Primary Actor가 `recordReplayResult`로 제출합니다. 일치 replay가 기록된 뒤 같은 evidence/replay 해시를 참조하는 `InspectorDecisionAttestation`을 Inspector Station이 서명하고 Primary Actor가 `submitInspectorDecision`으로 제출합니다.

`decision=1`은 Supplier 지급, `decision=2`는 Buyer 환급입니다. `decision=0`으로 정산할 수 없습니다. replay가 불일치하면 `EXECUTION_HOLD`에 남으며 자동 정산되지 않습니다. 양측 합의를 사용할 경우 Supplier와 Buyer가 **동일한** `MutualResolution`에 각각 서명하고 `mutualResolve`의 인자를 `[resolution, supplierSignature, buyerSignature]`로 넣습니다. 서명 2개 자동 병합 UI는 없으며 인자 배열로 제출할 수 있습니다.

Supplier 검사 미제출 시간초과는 `invokeSupplierInspectionTimeout`으로 Buyer 환급 권리를 만들고, Buyer가 withdraw합니다. Buyer 시간초과·Inspector timeout·Backup 처리와 재검사는 각각 컨트랙트 상태/기한을 충족해야 합니다. 화면에 모든 write 함수 21개를 제공하며, 허용 여부는 staticCall과 컨트랙트가 판단합니다.

## 증거와 복구

성공 receipt(status=1), block hash, TX hash, decoded events, calldata, 거래 전후 상태 및 회계를 JSON으로 내보냅니다. 단일 블록의 읽기 결과를 함께 기록합니다. 앱을 닫기 전에 증거를 저장하세요. 브라우저 메모리 기록은 새로고침 시 초기화됩니다.
TX를 전송한 뒤 대기 중 실패하거나 거절처럼 보이면 이미 전송된 TX hash로 Sepolia explorer에서 상태를 확인하고, 상태 조회 후 이어가세요. 같은 거래를 무조건 재전송하지 마세요. `journal`에는 receipt 미확인 TX도 남습니다. receipt 또는 signer TX replacement의 자동 복구·증거 재수집은 이 버전의 범위 밖입니다.

## 로컬 재검증

Node 24와 Anvil이 있는 환경에서 로컬 chainId 31337, port 18545로 Anvil을 실행한 후 `node test/local-e2e.mjs`를 실행합니다. 테스트는 동결 creation bytecode를 로컬에 배포하고 7개의 임시 무작위 테스트 지갑을 메모리에서만 사용합니다. 개인키를 출력하거나 저장하지 않습니다. 결과는 `results/LOCAL_E2E_EVIDENCE.json`입니다. 이 테스트는 Sepolia에서는 실행되지 않도록 chainId를 검사합니다.

참고 문서: [ethers v6](https://docs.ethers.org/v6/single-page/), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [ERC-5267](https://eips.ethereum.org/EIPS/eip-5267).
