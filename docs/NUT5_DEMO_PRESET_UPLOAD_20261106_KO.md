# 5번 너트 본선 시연 보관 사진 등록 (기능 구조 완료 · 원본 6장 등록 대기)

## 사용자 시연 구조
- Supplier로 전환: **매번** TOP/FRONT/SIDE의 파일 입력과 이미지 미리보기가 빈 상태로 시작
- Buyer로 전환: **매번** TOP/FRONT/SIDE의 파일 입력과 이미지 미리보기가 빈 상태로 시작
- 공급사/구매사의 이전 **완성된** AI, XAI, Evidence 결과는 역할별 비교 카드와 다운로드 기록으로 별도 보관
- 화면에서 다른 역할을 선택하면 이전 역할의 사진을 무심코 재사용하지 않음
- 다시 이전 역할로 돌아가도 원본 입력은 빈 상태. 이전 기록을 보려면 역할별 요약 카드 및 다운로드 사용
- 각 TOP/FRONT/SIDE 파일 선택 왼쪽에 **보관된 [정상/불량] [뷰] 불러오기** 버튼 제공
- `현재 역할의 보관된 3장 한 번에 불러오기` 추가
- 파일을 불러오더라도 AI 추론, XAI, Evidence 생성, Station 서명, MetaMask TX는 **자동으로 실행하지 않음**

## 보관 사진 연결 규약
개발 소스 디렉터리:
`deploy/cloud-web/app/.modelb-local/2e1e7f88734d/FINAL_PRESENTATION_UI/demo-presets/nut5/`

정상 사진 3장 (Supplier):
- `nut5_normal_TOP.jpg`
- `nut5_normal_FRONT.jpg`
- `nut5_normal_SIDE.jpg`

불량 사진 3장 (Buyer):
- `nut5_defect_TOP.jpg`
- `nut5_defect_FRONT.jpg`
- `nut5_defect_SIDE.jpg`

원본은 **리사이징·JPEG 재압축 없이 바이트 그대로** 저장해야 한다. 제출된 파일이 PNG라면 확장자를 .png로 유지하고 manifest 파일명도 일치시킨다. 각 이미지 크기는 500B~8MiB.

`manifest.json` 규격:

```json
{
  "schema": "InspectEscrow.Nut5PhotoPresets.v1",
  "roles": {
    "supplier": {
      "TOP": {"filename":"nut5_normal_TOP.jpg","sha256":"<SHA256 of original bytes>"},
      "FRONT": {"filename":"nut5_normal_FRONT.jpg","sha256":"<SHA256 of original bytes>"},
      "SIDE": {"filename":"nut5_normal_SIDE.jpg","sha256":"<SHA256 of original bytes>"}
    },
    "buyer": {
      "TOP": {"filename":"nut5_defect_TOP.jpg","sha256":"<SHA256 of original bytes>"},
      "FRONT": {"filename":"nut5_defect_FRONT.jpg","sha256":"<SHA256 of original bytes>"},
      "SIDE": {"filename":"nut5_defect_SIDE.jpg","sha256":"<SHA256 of original bytes>"}
    }
  }
}
```

실제 파일 6장과 정확한 manifest가 전부 준비되기 전에는 보관 버튼이 비활성화된다. 공개 Railway 운영 사이트로 배포된 사진은 **공개된 URL로 접근할 수 있는 데모 원본**이므로 민감한 정보나 개인 사진을 포함하지 않는다.

## 검증
- 2026-11-06 로컬 Chrome 기능 테스트 PASS: Supplier 원본 3/3 → Buyer 전환 0/3 + 3개 미리보기 숨김 → Buyer 원본 3/3 → Supplier 전환 0/3 → Buyer 재전환 0/3. 양 역할 Evidence 비교 기록 유지. 실제 새 업로드 후 Evidence/Actor 자동 연결은 기존 동작 유지.
- 2026-11-06 로컬 Chrome 모의 보관 스토리지 테스트 PASS: 정상 Supplier 3/3 → 역할 변경 시 0/3 → 불량 Buyer 3/3, 로드 이미지마다 SHA-256 확인, AI 자동 추론 안 함.
- **사용자 제공 6장 실물 데이터 배포 및 실제 운영 웹 동작 검증은 아직 미완료** (파일 수신 후 진행).
