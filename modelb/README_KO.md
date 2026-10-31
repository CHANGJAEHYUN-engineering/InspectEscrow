# InspectEscrow — 실시간 AI 검사 화면 V1

## 무엇을 실제로 하는가
- 현장에서 새로 선택하거나 웹캠으로 촬영한 **TOP** 이미지 원본의 SHA-256을 브라우저에서 추론 전에 계산합니다.
- Python 서버가 원본 바이트의 SHA-256을 재계산해 일치 여부를 확인합니다.
- S02 / S03에서 검증한 **Model B 체크포인트 SHA-256 `8320d4…a3854`**를 백업 ZIP에서 무결성 확인 후 불러옵니다.
- 학습에 사용한 전처리(EXIF transpose → RGB → 중심 정사각형 → 700×700 → PatchCore resize 320 / center crop 280)를 그대로 적용합니다.
- 실제 PatchCore 이상 점수의 `ROUND_HALF_UP(score * 1e6)`을 고정 임계값 `38,280,373`과 비교해 PASS / REVIEW_REQUIRED를 출력합니다.
- 결과 JSON을 저장합니다.

**주의:** 이 화면에는 Station 서명, EIP-712 Attestation 생성, Inspector Replay 또는 Sepolia 온체인 제출 기능이 없습니다. **실제 로컬 AI 추론 데모**일 뿐입니다. 새 검사 결과는 서명된 증거나 트랜잭션으로 오인해서는 안 됩니다.

## 실행 (Windows 10/11, Microsoft Edge)

1. 전체 ZIP을 영문 경로(예: `C:\InspectEscrow_Live_Demo_v1`)에 압축 해제합니다.
2. Windows에 Python 3.11 또는 3.12 설치가 필요합니다. PowerShell의 `py --version`으로 확인합니다.
3. `START_WINDOWS.bat`을 더블클릭합니다. **최초 실행 시 인터넷 연결이 필요하고 PyTorch/Anomalib 설치가 클 수 있습니다.**
4. 설치가 완료되면 Edge에서 `http://127.0.0.1:8765`를 엽니다.
5. 미리 촬영한 TOP 이미지로 결과를 검증한 뒤, 웹캠이 연결된 PC에서 **카메라 켜기 → 현재 화면 촬영 → 실시간 AI 검사 실행**을 시험합니다.
6. 응답 JSON은 **결과 JSON 저장**으로 저장합니다. 창은 닫지 말고 서버 콘솔을 유지합니다.

## PATCH3 통합 콘솔

동일 서버에서 `http://127.0.0.1:8765/integrated`를 열면 신규 Model B candidate의
TradeTerms 로드, TOP/FRONT/SIDE 증거 패키지, 분리된 Station EIP-712 서명,
Actor MetaMask read-only preflight와 명시적 트랜잭션 승인 흐름을 사용할 수 있습니다.
Model B candidate가 `DRAFT_NOT_BROADCASTABLE`인 동안 Sepolia 전송은 UI에서 차단됩니다.
기본 AI 화면의 **PATCH3 통합 콘솔 열기** 링크로도 이동할 수 있습니다.

실시간 카메라 기능은 연결된 PC 웹캠의 영상으로 작동합니다. 스마트폰 카메라에서 촬영한 이미지를 전달하려면 **사진 선택**으로 파일을 추가해야 합니다. UI는 localhost 접근만 허용합니다.

## 동일 결과 확인

| 이미지 | 기존 Kaggle 모델 B 점수 | 기대 판정 |
|---|---:|---|
| S05 최초 정상 TOP (`S05_Top_normal.jpg.jpg`) | 38.972004 | REVIEW_REQUIRED |
| S05 반복 정상 1 | 38.118038 | PASS |
| S05 반복 정상 2 | 36.185017 | PASS |
| S05 반복 정상 3 | 38.060619 | PASS |
| S03 deep 스크래치 1 | 52.572155 | REVIEW_REQUIRED |

이는 **사용자가 Kaggle에서 얻은 이전 결과**로, 개발 패키지 생성 환경에서 Anomalib을 설치·실행하지 못해 이 Windows 패키지의 수치 일치 여부는 **아직 직접 검증되지 않았습니다**. 기존 데이터를 넣어서 동일 결과가 나오는지 확인한 뒤 본선 시연에 사용해야 합니다.

## 증거 범위 / 주의

- 이 패키지는 데모 구동 편의를 위해 사용자 제공 모델 B ZIP을 그대로 포함합니다.
- `model/InspectEscrow_ModelB_BACKUP.zip`을 다른 ZIP/체크포인트로 교체하면 해시 검증에 실패합니다.
- `score_scaled > 38280373` 일 때만 REVIEW_REQUIRED입니다. 모델·임계값 자동 변경 없음.
- S05 원본 정상 Station 서명 세션의 최초 TOP는 REVIEW가 나왔습니다. 이후 반복 촬영 PASS는 별도 비서명 이미지의 결과입니다. **이를 숨기거나 최초 서명 기록을 성공으로 바꾸지 마세요.**
- 웹캠 이미지의 구도와 해상도가 Kaggle 스마트폰 사진과 다르면 점수가 달라질 수 있습니다.
- 사용자 사진은 이 앱에서 서버 파일로 저장하지 않습니다. 하지만 저장 버튼을 누른 결과 JSON에는 이름, 해시, 점수 등이 남습니다.
- 운영체제, GPU, PyTorch/Anomalib 버전 차이로 점수 재현성이 달라질 수 있습니다. 본선 이전에 결과와 환경을 고정해 재검증하세요.
- 반드시 **오프라인 백업 영상**과 기존 Sepolia 거래 TX 증거를 따로 준비하세요.

## 문제 해결

- `ModuleNotFoundError: anomalib` → `START_WINDOWS.bat` 설치 로그 확인. 설치가 실패하면 `.venv` 폴더를 삭제한 뒤 Python 3.11/3.12로 재실행.
- Python 버전 문제 → `py -3.11 --version` 또는 `py -3.12 --version` 확인.
- `MODEL_BACKUP_NOT_FOUND` → 모델 ZIP이 `model` 하위에 있는지 확인.
- `MODEL_SHA256_MISMATCH` → 원본 ZIP과 체크포인트 해시를 재확인. 임의로 모델 교체 금지.
- 카메라 불가 → Edge의 해당 사이트 카메라 권한 허용, 또는 **사진 선택**으로 대체.
- 점수가 기존 Kaggle과 다름 → CUDA/CPU, PyTorch/Anomalib 버전, 전처리 코드 일치 확인.

## 모델·정책 고정 값

- `Model B` checkpoint SHA-256 `8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854`
- threshold scaled `38280373`
- `pre_trained=False`, `wide_resnet50_2`, `layer2` + `layer3`, `num_neighbors=9`, memory bank `(551,1536)`.
- No retraining; no onchain claims.
