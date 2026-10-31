# 환경 구성

웹 서버가 인식하는 선택적 환경변수:

| 이름 | 기본값 | 용도 |
|---|---|---|
| `INSPECTESCROW_PORT` | `8770` | 통합 UI 포트 |
| `INSPECTESCROW_CHAIN_ID` | `11155111` | 선택 체인 ID |
| `INSPECTESCROW_CONTRACT_ADDRESS` | commitment의 PATCH3 주소 | 검증 컨트랙트 |
| `INSPECTESCROW_RPC_URL` | 공개 Sepolia RPC | JSON-RPC URL |
| `INSPECTESCROW_SEPOLIA_RPC` | 없음 | 이전 이름 호환 |

기본 Sepolia PATCH3 주소는 `0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905`, Credential Registry는 `0xc715A0263B752c9D0Be99379b7939466Af5fd20e`입니다.

Local Anvil 녹화에서는 별도 PowerShell 세션에서 다음처럼 지정합니다.

```powershell
$env:INSPECTESCROW_CHAIN_ID='31337'
$env:INSPECTESCROW_RPC_URL='http://127.0.0.1:8545'
$env:INSPECTESCROW_CONTRACT_ADDRESS='<로컬 배포 PATCH3 주소>'
```

브라우저 저장소의 Trade ID는 편의 컨텍스트일 뿐 권한 증거가 아닙니다. 모든 화면은 현재 체인과 컨트랙트에서 TradeTerms와 상태를 다시 읽습니다.

