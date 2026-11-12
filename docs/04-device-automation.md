# 갤럭시 자동 검사와 커밋

2026-11-12부터 반복적인 휴대전화 확인을 자동화한다. 앱 기능을 개발한 뒤 한 번의 명령으로 코드 검사 → 갤럭시 화면 조작·검증 → 결과 기록 → 로컬 커밋을 수행하도록 구성한다.

## 한 번만 준비할 것

- PC: Java 17 이상, Android SDK Platform-Tools의 ADB, Maestro CLI. 이 PC는 Java 21.0.11, ADB 37.0.1, Maestro 2.12.1을 사용한다. 재현성을 위해 프로젝트 실행기는 JDK 21과 Maestro 2.12.1을 확인한다.
- 갤럭시: 기존 Expo Go, USB 케이블 연결, 개발자 옵션의 USB 디버깅, 이 PC의 디버깅 연결 허용, 잠금 해제된 화면.
- Maestro는 처음 검사할 때 Android 화면을 조작하는 보조 앱을 기기에 설치한다. Expo Go의 앱 데이터를 지우는 방식은 사용하지 않는다.

갤럭시 설정 → 휴대전화 정보 → 소프트웨어 정보에서 빌드번호를 7번 누른다. 잠금번호는 휴대전화에서 직접 입력하고, 설정으로 돌아가 개발자 옵션의 USB 디버깅을 켠다. USB 연결 뒤 허용 창이 나오면 개발에 사용하는 이 PC인지 확인하고 직접 허용한다.

현재 도구는 Windows 사용자 폴더의 다음 위치에 설치했다. 시스템 PATH는 변경하지 않고 실행 스크립트에서 경로를 찾는다.

```text
%LOCALAPPDATA%/store-price-tools/platform-tools/adb.exe
%LOCALAPPDATA%/store-price-tools/maestro/bin/maestro.bat
```

다른 위치에 설치했다면 STORE_PRICE_ADB, STORE_PRICE_MAESTRO 환경 변수로 실행 파일 경로를 지정한다. 여러 기기가 연결돼 있다면 ANDROID_SERIAL로 사용할 기기를 명시한다. 기기 식별자는 Git에 저장하지 않는다.

## Git Bash에서 실행

저장소 루트에서:

```bash
npm --prefix scripts/database ci
cd apps/mobile
npm run device:doctor
npm run verify:device
```

device:doctor는 도구·Git·기기 준비 상태만 확인한다. verify:device는 모든 검사가 통과하면 결과 문서와 검증한 변경 파일을 자동 커밋한다. 연결 승인이 끝난 뒤에는 기능 개발 시 이 검사를 실행해 반복 확인을 맡길 수 있다.

커밋 없이 검사만 실행할 때:

```bash
npm run verify:device:check
```

영수증 구간만 먼저 확인할 때:

```bash
npm run verify:receipt
```

이 명령은 --receipt-only로 코드 검사와 영수증 실기기 시나리오를 실행한다. 부분 검사에서는 커밋을 하지 않고 기존 전체 검증 보고서도 덮어쓰지 않는다. 원본 summary.json의 scope는 receipt-only로 기록한다. 이후 verify:device로 장바구니·퀴즈·영수증을 모두 검사해야 자동 커밋할 수 있다.

## 검사와 기록

- PGlite의 메모리 PostgreSQL에서 상품·가격 이력·예시 데이터·공개 조건·역할별 권한을 검사한다. 실제 Supabase 클라우드/HTTP 검증과 구분한다.
- 기존 장바구니·예산·놀이돈 단위 테스트, 타입 검사, ESLint, 세 플랫폼 번들을 검사한다.
- 별도 PC 서버에서 이번 실행의 식별자를 앱에 넣고, 갤럭시에서도 같은 값을 읽어 최신 소스를 실행 중인지 확인한다.
- 실제 화면에서 담기·수량 변경·합계·금액 선택·부족 안내·선택 취소·예산 초과 차단·회복·전체 비우기·다시 열기 초기화를 검사한다.
- 거스름돈 맞히기·정답 전 계산 완료 차단·상품별 영수증·거스름돈과 잔액 구분·새 놀이와 영수증 재실행 초기화를 함께 검사한다.
- 실행 결과와 원시 로그는 저장소의 .artifacts/device 아래에 둔다. 이 폴더는 Git에서 제외한다.
- 전체 검사에 성공한 결과만 docs/book/verification/latest-android.md에 정리한다. 시나리오 결과, 기기 모델·Android 버전, 실행 시각, 코드 지문을 남기며 기기 식별자와 원시 화면 자료는 커밋하지 않는다.

앱을 다시 열어 메모리 상태가 초기화되는 검사는 Expo Go 종료 후 같은 개발 주소를 여는 방식이다. 터미널 r 키를 누르는 수동 검사와 실행 방법은 다르므로 기록에서 구분한다.

검사를 실행하는 동안에만 충전 중 화면 켜짐 설정을 적용하며, 종료 시 원래 값으로 복원한다. 검사 중 사용자가 이 값을 바꾸었다면 새 값을 보존한다. 화면을 켜는 동작은 자동으로 수행하지만 잠금번호 입력과 잠금 해제는 사용자가 직접 해야 한다. 검사 중에는 휴대전화를 조작하지 않고 USB 연결을 유지한다.

## 자동 커밋 조건

사용자는 2026-11-12에 기존 직접 커밋 방식에서 자동 검사·기록·커밋 방식으로 변경을 요청했다.

검사 실패, 기기 연결 없음, 허용하지 않은 변경 파일, 기존 staging, 검사 중 파일이나 HEAD 변경이 있으면 자동 커밋하지 않는다. 커밋 대상은 scripts/device/commit-files.json의 정확한 파일 목록으로 제한한다. 새 기능으로 파일이 늘면 검토 후 목록을 갱신한다. 결과 문서만 달라진 재검사로는 새 커밋을 만들지 않는다.

기존 커밋 이력은 유지하고 추가 커밋만 만든다. GitHub push와 tag는 별도 사용자 요청에 따라 진행한다.

## 현재 확인 범위

도구 설치와 실행 버전, 앱 계산 테스트 32개·타입·ESLint·세 플랫폼 번들, 자동 커밋 보호 테스트 9개를 확인했다. 설치 직후 ADB 목록은 비어 있었고, 이어 실행한 device:doctor에서는 기기를 감지했지만 USB 디버깅 연결 승인이 없어 중단했다. 사용자가 연결을 허용한 뒤 재실행한 device:doctor는 준비 완료와 종료 코드 0을 반환했다. 사전 검사는 실기기 시나리오를 실행하거나 커밋하지 않는다. 실제 기기 검사 성공은 실행 후 생성되는 docs/book/verification/latest-android.md로 확인한다.

## 공식 자료

- [Maestro Windows 설치](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli)
- [Maestro의 React Native·Expo Go 지원](https://docs.maestro.dev/get-started/supported-platform/react-native)
- [Android USB 디버깅과 ADB](https://developer.android.com/tools/adb)
- [갤럭시 개발자 옵션](https://developer.android.com/studio/debug/dev-options.html)
