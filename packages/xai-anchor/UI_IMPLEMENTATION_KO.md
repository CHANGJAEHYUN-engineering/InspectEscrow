# XAI Anchor UI — Integration Notes (2026-11-07)

## 목적
기존 InspectEscrow UI의 품질검사(inspection) 화면 아래에 독립 Sepolia XAI 해시 증거 고정/검증 패널 추가. 기존 거래·에스크로·AI·XAI·Evidence·Station/Actor를 수정하거나 자동 트랜잭션 호출하지 않음.

## 온체인 자료
- XAI Anchor: 0x16391d0f6e4baA35CC835839e98b85437455ba82
- Escrow 원본: 0x0a4721CF41Ad3f7a9EC9C73049D2b5D2db73B905
- 기존 실증 Supplier S05: tradeId 0x49bf5596d20cdf4c5de348a699967a1fc06f51c83fcbf5fcedf54dcf08c591ff
- Evidence hash: 0x2281badc88418b6b78f83a11de0aa4e0a4b51f8b7f0e7004232c08526f1711c1
- XAI report sha256: 0xcf3710f2fa746646770de2236e5947fcd35623178ac7ab91def004d1660cb1bb
- TX: 0x23fbae0c5256e01dfc82d698258e5a84aa92421d658dadebf4100b8b731f352f
- getAnchor exact match & verify=true, mutated hash=false 확인.

## UI 구동
- `xai-anchor-panel.js` 및 `xai-anchor-panel.css`은 독립 동작.
- `platform.html`에서 CSS/JS 로드. JS가 `.platform-view[data-view="inspection"]` 하단에 고정 패널 생성.
- `server.cjs`에서 두 파일만 읽기용 static route 추가.
- 기존 S05 기록을 지갑 없이 실시간 Sepolia RPC로 조회, 거래 당사자 MetaMask 연결 시 신규 보고서 해시 등록.
- 새 Evidence JSON을 직접 읽으면 XAI PNG byte SHA-256, 원본 TOP·모델·점수·결정·역할 등을 교차검증하고 Evidence-derived XAI AnchorReport 생성. 출력 SHA-256 = UTF-8 JSON.stringify(payload)의 SHA-256.
- 기존 `InspectEscrow.XAI.OfflineSidecar.v1` 보고서와 새 `InspectEscrow.XAI.EvidenceDerivedAnchorReport.v1` 보고서 모두 업로드 검증.
- 컨트랙트 `getTradeTerms`를 호출해 실제 Supplier 또는 Buyer Actor와 연결 지갑 주소가 맞을 때만 등록 가능. 기존 등록이 있으면 중복/덮어쓰기 거절. 각 TX는 사용자 MetaMask 동의와 확인 필수.
- 열람, 서명, 트랜잭션 어느 쪽도 자동으로 시작하지 않음.
- 기존 Evidence 파일이 미서명/미제출인 경우 UI에 추가 증거 해시 고정과 에스크로 정식 Evidence 제출을 구분해 표시함.

## 브라우저 회귀 테스트
- 실제 프로덕션 `/live`에서 패널 JS/CSS 추가한 고립 브라우저 테스트: S05 Sepolia 해시 검증 PASS, 거래 Actor 표시, 등록 버튼 안전 비활성 PASS.
- 패널 통합한 로컬 `http://127.0.0.1:8790/live`: CSS/JS 200 PASS, S05 온체인 검증 PASS, 기존 tool-host 보존 PASS, JS 오류 0 PASS.
- 사용자 제공 Evidence JSON과 AnchorReport의 원본 해시 및 JSON.stringify 순서가 동일하다는 교차검증 PASS (S05 해시 cf3710... 일치).
- 신규 온체인 등록은 실 사용자의 명시적 MetaMask 승인을 요구하므로 자동 테스트에서는 수행하지 않음.

## 운영 배포 안전 원칙
- 배포 직전 실제 Railway 운영 컨테이너의 `FINAL_PRESENTATION_UI` 전체를 tar.gz로 가져와 프런트엔드·백엔드 원본을 복제했다. **예전 Git 브랜치의 live.js 등으로 배포하지 않음.**
- 이 새 모듈 소스/2개의 로더·서버 라우트 이외에는 운영 UI 기능을 변경하지 않아야 함.
- 증거 파일 본문·보고서 이미지 전체·비밀키 등은 GitHub에 업로드하지 않는다.
