# Windows 신규 PC 설치

## 요구사항

- Windows 10/11 x64
- Node.js 20 이상(검증 환경: 24.19.0)
- Python 3.12 x64(검증 환경: 3.12.10)
- npm 10 이상(검증 환경: 11.17.0)
- Local Anvil 녹화에는 Foundry/Anvil 1.7.1 이상
- C: 여유 공간 10 GiB 이상 권장

## 설치 순서

ZIP은 먼저 `C:\InspectEscrow`처럼 짧은 로컬 경로에 압축 해제합니다. OneDrive의 깊은 경로는 Windows pip 경로 제한으로 설치가 실패할 수 있으며, 설치기는 모델 경로가 120자를 초과하면 명시적으로 중단합니다.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./INSTALL_DEPENDENCIES.ps1
./START_INSPECTESCROW.ps1
./CHECK_INSPECTESCROW.ps1
```

설치 스크립트는 `InspectEscrow_PATCH3_DEPLOY/package-lock.json`의 고정 npm 의존성을 설치하고, `InspectEscrow_Live_Demo_v1_FULL/InspectEscrow_Live_Demo_v1/.venv`를 만든 뒤 검증 환경에서 생성한 `requirements-lock-windows.txt`를 설치합니다. npm, venv, pip 설치 또는 import 단계가 실패하면 성공 메시지를 출력하지 않고 즉시 중단합니다.

Model B archive SHA-256은 반드시 다음과 같아야 합니다.

`8102cedf082c0d8553ad03372d6dd125daab895ed56d2cad77c4ac0342b0206d`

archive 내부 체크포인트 commitment:

`8320d4cab14d071ae65911d59d5ddf608a1a514e0bfdba0c4345d27da94a3854`

설치 실패 시 `npm --version`, `py -3.12 --version`, 인터넷 연결, 프록시 설정을 확인합니다. 비밀 RPC URL은 소스 파일에 쓰지 말고 현재 PowerShell 세션의 환경변수로만 제공합니다.

