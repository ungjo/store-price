# 03장 보충. 실기기 검사와 기록을 자동화하기

날짜: 2026-11-12

시작 HEAD: 281a5e9. 놀이돈 선택 구현과 그동안의 검증 기록은 아직 커밋 전이다.

## 전환 이유

사용자는 버튼 하나를 누를 때마다 결과를 전달하고 다음 동작을 안내받는 방식이 오래 걸린다고 설명했다. 휴대전화를 연결해 검사와 기록을 자동으로 하고, 커밋도 자동화해 달라고 요청했다. 이 요청에 따라 이전의 직접 커밋 원칙을 변경했다. 갤럭시 전체 비우기까지의 사용자 확인은 03a에 남기고, 아직 하지 않은 새로고침 확인을 성공으로 기록하지 않았다.

## 선택한 도구

Windows에서 직접 실행하는 Maestro 2.12.1과 Android Platform-Tools를 선택했다. 기존 Java 21.0.11을 사용할 수 있고, 현재 Expo Go 화면에 접근하므로 이 검사를 위해 Android Studio나 에뮬레이터를 설치하지 않아도 된다. 앱에는 안정적으로 버튼을 찾을 testID와 검사 실행 식별자를 추가한다. 일반 실행에서는 검사 식별자 안내가 나타나지 않는다.

Appium도 검토했으나 현재 npm 안정 Appium 3.9.0과 최신 UiAutomator2 9.0.2는 서로 호환되지 않았다. UiAutomator2 9.0.2는 Appium 4 베타를 요구한다. 현재 기능의 버튼·스크롤·화면 내용 검사에는 Maestro 흐름 파일이 더 간단했다.

## 실제 환경 확인과 설치

PC에서 java -version으로 Java 21.0.11을 확인했다. JAVA_HOME은 기존 JDK를 가리켰고, ADB·Maestro·Android SDK는 설치된 기본 경로에서 찾지 못했다. npm.cmd view로 Appium·드라이버·WebdriverIO 버전과 엔진 조건을 조회했다.

다음 공식 배포 파일을 Node fetch로 내려받아 %LOCALAPPDATA%/store-price-tools에 보관했다.

- https://dl.google.com/android/repository/platform-tools-latest-windows.zip
- https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.12.1/maestro.zip

Maestro ZIP의 SHA-256은 GitHub 공식 release asset의 digest와 비교해 일치했다: 54dbb0716425626604973cbb374c585ca30272375d9ce15177a1152765ddd9d7.

PowerShell에서 실제 실행한 설치·확인 명령:

```powershell
$taskToolsRoot = Join-Path $env:LOCALAPPDATA 'store-price-tools'
Expand-Archive -LiteralPath (Join-Path $taskToolsRoot 'platform-tools.zip') -DestinationPath $taskToolsRoot
& (Join-Path $taskToolsRoot 'platform-tools/adb.exe') version
& (Join-Path $taskToolsRoot 'platform-tools/adb.exe') devices -l
Expand-Archive -LiteralPath (Join-Path $taskToolsRoot 'maestro-2.12.1.zip') -DestinationPath $taskToolsRoot
& (Join-Path $taskToolsRoot 'maestro/bin/maestro.bat') --version
```

ADB는 37.0.1-15733141, Maestro는 2.12.1로 실행되었다. 최초 adb devices -l에는 연결 기기가 없었다. 사용자는 USB는 연결했지만 디버깅 설정이 필요하다고 답했고, 개발자 옵션에서 USB 디버깅을 켜는 방법을 안내했다. 휴대전화 연결 허용은 사용자가 직접 진행한다.

Maestro 최초 버전 실행은 기본 익명 분석 안내를 표시했다. 프로젝트 자동 검사에서는 MAESTRO_CLI_NO_ANALYTICS=1과 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true를 설정한다.

## 검사한 코드와 커밋한 코드를 연결하기

오래된 Expo Go 화면이나 예전 성공 로그로 새 변경을 통과 처리하면 안 된다. 실행마다 새 식별자를 만들고 새 Metro 서버에 전달하며, 휴대전화에서 같은 식별자가 보이는지 검증한다. 실행 전후 파일 지문과 HEAD도 비교한다.

모든 검사에 성공한 같은 실행의 결과만 책의 검증 문서로 옮긴다. 자동 커밋은 검토한 정확한 파일 목록으로 제한하고, 기존 staging이나 작업 중 변경을 발견하면 중단한다. 실패 기록과 연결 대기 기록은 성공으로 승격하지 않는다.

## 최초 자동 화면 검사 전 점검 기록

| 항목 | 결과 |
| --- | --- |
| Java·ADB·Maestro 실행 버전 | 확인 |
| Maestro 배포 ZIP digest | 공식 SHA-256과 일치 |
| 최초 ADB 기기 연결 | 기기 없음, USB 디버깅 승인 대기 |
| 자동 검사 코드와 흐름 | 구현 완료 — 161개 명령, 67개 화면·상태 assertion, 스크린샷 3개. 실기기 실행 전 |
| 기존 앱 검사 | 테스트 32/32·타입·ESLint 통과, Android 631·iOS 633·웹 229 모듈 번들 성공 |
| 자동 커밋 보호 테스트 | 임시 Git 저장소에서 9/9 통과, 실제 프로젝트 커밋 없음 |
| device:doctor 최초 실행 | 기기를 감지했으나 USB 디버깅 승인 대기로 중단, 검사·커밋 미실행 |
| device:doctor 승인 후 재실행 | 준비 확인 완료, 종료 코드 0. 화면 검사·커밋은 실행하지 않음 |
| 갤럭시 자동 검사 전체 실행 | 아직 하지 않음 |
| 자동 커밋 | 아직 하지 않음 |
| iPhone 실기기·화면 읽기 | 미확인 |

[실행 안내와 공식 자료](../../04-device-automation.md)를 함께 참고한다. 실제 성공 기록은 검사가 통과한 뒤 생성하며, 이 원고의 설치 완료와 실기기 검사 성공을 구분한다.

## 구현 뒤 실행한 검사와 해결한 문제

자동 검사 식별자와 testID를 추가한 앱에서 npm.cmd test, npm.cmd run typecheck, npm.cmd run lint, npm.cmd run export:check를 실행했다. 계산 테스트 32개와 ESLint·번들은 통과했다. 처음 타입 검사와 번들 생성 검사를 병렬로 실행했을 때, TypeScript가 생성 폴더 dist까지 읽는 동안 Expo가 기존 번들을 교체해 TS6053 파일 없음 오류가 났다. tsconfig.json에서 node_modules와 dist를 제외하고 타입 검사를 다시 실행해 통과했다. 새 자동 실행기는 이 검사들을 순서대로 수행한다.

node --test scripts/device/git-guard.test.mjs는 임시 Git 저장소에서 9개 모두 통과했다. 기존 staging 보존, 허용 목록 밖 변경 차단, 실행 중 파일·HEAD 변경 차단, 결과 문서만 바뀐 경우 커밋 생략, 정확한 파일만 커밋, 실패 후 자체 staging 복구를 확인했다. 실제 프로젝트의 staging과 커밋은 바꾸지 않았다.

apps/mobile에서 npm.cmd run device:doctor를 실행했다. Java·ADB·Maestro 버전은 확인됐지만 휴대전화가 unauthorized 상태여서 연결 허용 안내와 함께 종료 코드 1로 중단했다. 원본 상태는 .artifacts/device의 해당 실행 폴더에 남기고 성공 문서나 커밋은 만들지 않았다. 이는 연결 승인 전 중단 동작의 확인이며, 휴대전화 화면 시나리오 통과를 뜻하지 않는다.

사용자가 USB 디버깅을 켜고 허용했다고 보고한 뒤 device:doctor를 다시 실행해 준비 완료와 종료 코드 0을 확인했다. 이후 실제 화면 검사와 자동 커밋 결과는 실행기가 생성하는 docs/book/verification/latest-android.md 및 로컬 실행 요약에 남긴다. 위 표는 자동 화면 검사 시작 전의 점검 기록이다.

## 첫 실기기 실행에서 발견한 스크롤 문제

승인된 갤럭시 SM-S948N(Android 17)에서 verify:device를 처음 실행했다. 코드 검사와 초기 화면·빈 장바구니·5,500원 구성·5,000원 부족 안내·10,000원으로 선택 변경까지 진행했지만, 1,000원 버튼을 찾는 35번째 명령에서 실패했다. 실행기는 실패 로그와 화면을 로컬에 남기고 커밋하지 않았다. HEAD는 281a5e9, staging은 빈 상태로 유지되었다.

Maestro 로그에서는 해당 버튼이 이미 화면에 100% 보인다고 판정된 뒤 centerElement:true의 추가 중앙 정렬 스와이프가 일어났다. 이 스와이프로 버튼을 지나친 뒤 고정 방향 검색을 반복해 맨 위까지 이동했다. 버튼 식별자나 앱 계산 문제가 아니라 자동 검사 스크롤의 중앙 정렬 동작이었다. flow의 centerElement를 false로 바꾸어 이미 보이는 버튼을 다시 이동시키지 않도록 했다. 금액·선택·비활성 상태에 대한 assertion은 그대로 유지하고 전체 시나리오를 다시 검사한다.

## 두 번째 실기기 실행의 재시작 문제

스크롤을 수정한 두 번째 전체 실행에서는 149개 명령과 61개 화면·상태 조건 검사가 통과했다. 마지막에 당근 1개와 1,000원을 선택한 뒤 Expo Go를 종료하고 같은 주소를 열었을 때, 실행 식별자를 찾는 대기 단계에서 실패했다. JUnit은 실패를 보고했고 자동 커밋은 실행되지 않았다.

실패 화면은 Android 설정 화면이었다. 기기 로그에서는 개발 주소가 Expo Go의 LauncherActivity로 전달되고 새 프로세스가 시작됐지만, 시장놀이 화면으로 이어지는 ExperienceActivity 전환은 확인되지 않았다. Expo Go 내부의 정확한 원인은 확정하지 않았다. 이 구간을 전체 검사에서 떼어 별도로 재현하며, 앱 데이터를 지우지 않고 Expo Go를 먼저 실행한 다음 개발 주소를 여는 방법을 확인한다.

분리 검사 중에는 화면 캡처에서 AOD(화면 꺼짐)가 확인되었다. 사용자가 직접 화면 잠금을 해제한 뒤, 기존 충전 중 화면 켜짐 설정을 보관하고 검사 중에만 활성화했다. 앱의 계산 오류와 휴대전화 잠금 상태를 구분해야 하므로 앞선 대기 실패를 상품·놀이돈 계산 실패로 기록하지 않았다.

수정한 시작 순서는 stopApp → launchApp(clearState:false, stopApp:false, permissions:{}) → waitForAnimationToEnd → openLink이다. Expo Go 컨테이너를 먼저 띄우되 저장 데이터와 기존 권한은 보존한다. 화면 유지와 이 시작 순서를 함께 적용한 분리 검사는 실제 갤럭시에서 두 번 연속 통과했다(각 35개 명령, 14개 조건 검사). 새 실행 식별자, 당근 1개·1,000원 선택, 재실행 뒤 같은 식별자·빈 장바구니·금액 버튼 비활성 상태를 확인했다. 전체 시나리오의 최종 성공 여부는 자동 생성 검증 기록으로 확인한다.
