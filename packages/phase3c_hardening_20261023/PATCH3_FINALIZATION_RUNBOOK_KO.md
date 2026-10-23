# PATCH3 Sepolia FINALIZATION Runbook

Status: **PRE-BROADCAST TOOLING READY / PUBLIC ADDRESSES REQUIRED**

이 문서는 `PHASE2-PATCH3-CANDIDATE`를 로컬 hardening candidate에서 새 Sepolia 공개체인 증거로 승격하기 위한 실행 순서다.

## 0. 절대 규칙

- 기존 `PHASE2-PATCH2` Sepolia 주소와 funded E2E 증거는 변경하지 않는다.
- PATCH3는 `CredentialRegistryPatch3` + `InspectEscrowPatch3` 신규 계약 쌍으로 배포한다.
- GitHub에는 **공개 주소만** 기록한다.
- private key / seed phrase / mnemonic / RPC credential은 GitHub, Chat, 문서, 로그에 넣지 않는다.
- 실제 broadcast 전 `PATCH3_SEPOLIA_DEPLOYMENT_PRECHECK_KO.md`의 GO gate를 다시 확인한다.

## 1. 필요한 신규 공개 주소 4개

`PATCH3_ROLE_PLAN_TEMPLATE.json`의 다음 네 값을 채운다.

- `externalArbitrator`
- `backupInspectorStation`
- `externalArbitratorStation`
- `credentialRegistryAuthority`

기존 PATCH2에서 재사용 후보인 Supplier/Buyer/Primary/Backup actor 및 Supplier/Buyer/Primary Station은 템플릿에 이미 기록되어 있다.

모든 Actor/Station/Authority 주소는 서로 달라야 한다.

실제 파일:

```text
packages/phase3c_hardening_20261023/PATCH3_ROLE_PLAN.json
```

`PATCH3_ROLE_PLAN_TEMPLATE.json`을 복사한 뒤 공개 주소만 채운다.

검증:

```bash
node packages/phase3c_hardening_20261023/scripts/validate-patch3-role-plan.mjs \
  packages/phase3c_hardening_20261023/PATCH3_ROLE_PLAN.json
```

## 2. Candidate 재컴파일

```bash
npm install --no-save solc@0.8.26 @openzeppelin/contracts@5.5.0 ethers@6.15.0

node packages/phase3c_hardening_20261023/scripts/compile-patch3.mjs
```

반드시 유지:

- `InspectEscrowPatch3` runtime <= 24,576 bytes
- `CredentialRegistryPatch3` runtime <= 24,576 bytes
- frozen compiler/build settings 유지

## 3. Secret은 로컬 환경변수로만 주입

예시 파일:

`packages/phase3c_hardening_20261023/PATCH3_ENV.example`

필수:

- `PATCH3_RPC_URL`
- `PATCH3_DEPLOYER_PRIVATE_KEY`

Credential Registry Authority가 deployer와 다른 지갑이면 추가:

- `PATCH3_AUTHORITY_PRIVATE_KEY`

기본 최소 운영은 dedicated Authority EOA가 deployer 역할까지 겸하는 방식이다. Escrow에는 deployer/admin settlement 권한이 없으므로 배포자 자체가 정산 backdoor가 되지 않는다.

## 4. Sepolia 배포

```bash
node packages/phase3c_hardening_20261023/scripts/deploy-patch3-sepolia.mjs
```

스크립트가 수행하는 것:

1. chainId `11155111` 강제 확인
2. role collision 재검사
3. `CredentialRegistryPatch3` 신규 배포
4. 5개 Station credential을 `ACTIVE` 등록
5. `InspectEscrowPatch3(registry)` 신규 배포
6. `CONTRACT_VERSION` read-back
7. Registry pointer/Authority read-back
8. 5개 Station ACTIVE read-back
9. on-chain code 존재 확인
10. secret-free deployment manifest 생성

기본 출력:

```text
packages/phase3c_hardening_20261023/results/PATCH3_SEPOLIA_DEPLOYMENT.json
```

이 manifest에는 private key/RPC secret이 기록되지 않는다.

## 5. 독립 read-only 배포 검증

```bash
node packages/phase3c_hardening_20261023/scripts/verify-patch3-deployment.mjs
```

검증:

- Sepolia chainId
- Registry/Escrow code 존재
- `PHASE2-PATCH3-CANDIDATE`
- Escrow → Registry pointer
- Registry Authority
- 5개 Station ACTIVE
- 초기 `accountingConserved()`
- 초기 `balanceCoversLiabilities()`

## 6. 실제 주소로 PATCH3 policy v1.2 입력 생성

배포 이후에만 실행한다.

```bash
node packages/phase3c_hardening_20261023/scripts/build-patch3-policy-input.mjs

node packages/phase3c_hardening_20261023/policy/generate-patch3-policy.mjs \
  packages/phase3c_hardening_20261023/policy/PATCH3_POLICY_INPUT.json
```

규칙:

- `policyVersion = 2`
- `schemaVersion = 1.2.0`
- PATCH2 policyHash 재사용 금지
- 실제 PATCH3 verifyingContract / Registry / role addresses / fresh tradeId를 hash preimage에 포함
- fallback policy는 proposal 전에 고정
- windows는 proposal 전에 고정

`PATCH3_TRADE_ID`가 지정되지 않으면 input builder가 fresh random bytes32를 만든다. 실제 proposal 전에는 반드시 on-chain `TradeState.NONE`인지 확인한다.

## 7. 그 다음 hard gate

배포만으로 PATCH3가 proven baseline이 되는 것은 아니다.

반드시 새 funded Sepolia E2E에서 최소 다음을 완료해야 한다.

```text
propose exact policy v1.2
→ Supplier/Buyer/Inspector accept
→ fund
→ Supplier inspection
→ Buyer REVIEW
→ Primary/Backup/Arbitration 또는 fallback 대표 경로
→ settlement credit
→ recipient withdraw
→ accountingConserved() == true
→ balanceCoversLiabilities() == true
```

그리고 공개체인 negative proof:

- wrong policyHash REVERT
- wrong Inspector Station REVERT
- suspended Station attestation REVERT without state mutation
- replay inconsistent → EXECUTION_HOLD finite deadline
- unauthorized Inspector decision REVERT
- missing decisionEvidenceHash REVERT
- fallback before deadline REVERT
- fallback after deadline terminal settlement

이 단계까지 끝나야 `PHASE2-PATCH3`를 공개체인 proven hardening으로 승격한다.

## 8. 현재 Claim

현재 말할 수 있는 것:

> PATCH3는 hostile local Anvil Red-Team 36 PASS / 0 FAIL, key separation, bounded credential authority, finite liveness, Python↔JS↔Solidity interop, Slither gate를 통과한 hardening candidate다.

아직 말하면 안 되는 것:

> PATCH3가 Sepolia funded E2E까지 완료됐다.

그 문장은 실제 신규 배포와 funded E2E가 끝난 뒤에만 사용한다.
