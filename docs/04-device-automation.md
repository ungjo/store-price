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

## 큰 글자·작은 화면·키보드 검사

저장소 루트에서 새 화면 조건만 진단할 때:

```bash
node scripts/device/verify.mjs --readability-only
```

코드 검사와 세 가지 화면 조건의 실기기 흐름을 실행한다. 기존 장바구니·계산 전체 회귀 검사는 생략하므로 자동 커밋하지 않으며 전체 검증 보고서를 덮어쓰지 않는다. 기존 기능과 화면 사용성까지 함께 검사하고 기록·커밋할 때:

```bash
node scripts/device/verify.mjs --readability --message "feat: 큰 글자와 좁은 화면의 계산 사용성 개선"
```

이번 갤럭시의 조건은 기존 밀도 560에서 글자 배율 1.0/1.5, 이어 밀도 720에서 글자 배율 1.5다. 물리 해상도 1440×3120은 바꾸지 않으며 밀도 720의 환산 폭은 320dp다. 각 조건에서 분류·상품·장바구니·다섯 자리 답 입력·오답 수정·정답·영수증·새 놀이를 확인한다. 키보드가 실제로 열린 두 시점에 입력칸과 확인 버튼 전체가 키보드 위에 있는지 Android 화면 자료로 검사한다.

글자 배율과 밀도는 현재 Android 프로필의 원래 값을 기록한 뒤 임시로 바꾼다. 정상 종료와 오류 종료 모두 복구를 시도하고 원래 값으로 돌아왔는지 다시 확인한다. 사용자 변경을 발견하면 덮어쓰지 않는다. 복구가 확인되지 않으면 통과·자동 커밋하지 않는다. 검사 중에는 설정을 직접 바꾸거나 휴대전화를 조작하지 않고 연결을 유지한다. [화면 개선과 검사 설계](book/chapters/06b-readable-layout.md)에서 구현 이유와 검사 범위를 확인한다.

## 검사와 기록

- PGlite의 메모리 PostgreSQL에서 상품·가격 이력·예시 데이터·공개 조건·역할별 권한을 검사한다. 실제 Supabase 클라우드/HTTP 검증과 구분한다.
- 기존 장바구니·예산·놀이돈 단위 테스트, 타입 검사, ESLint, 세 플랫폼 번들을 검사한다.
- 별도 PC 서버에서 이번 실행의 식별자를 앱에 넣고, 갤럭시에서도 같은 값을 읽어 최신 소스를 실행 중인지 확인한다.
- 실제 화면에서 담기·수량 변경·합계·금액 선택·부족 안내·선택 취소·예산 초과 차단·회복·전체 비우기·다시 열기 초기화를 검사한다.
- 거스름돈 맞히기·정답 전 계산 완료 차단·상품별 영수증·거스름돈과 잔액 구분·새 놀이와 영수증 재실행 초기화를 함께 검사한다.
- 원격 목록과 내장 예시 12개에서 분류별 6·4·2개, 분류 전환 시 장바구니·돈 선택·퀴즈 유지, 추가 상품 계산·영수증과 새 놀이의 전체 분류 초기화를 검사한다.
- 실행 결과와 원시 로그는 저장소의 .artifacts/device 아래에 둔다. 이 폴더는 Git에서 제외한다.
- 전체 검사에 성공한 결과만 docs/book/verification/latest-android.md에 정리한다. 시나리오 결과, 기기 모델·Android 버전, 실행 시각, 코드 지문을 남기며 기기 식별자와 원시 화면 자료는 커밋하지 않는다.

앱을 다시 열어 메모리 상태가 초기화되는 검사는 Expo Go 종료 후 같은 개발 주소를 여는 방식이다. 터미널 r 키를 누르는 수동 검사와 실행 방법은 다르므로 기록에서 구분한다.

검사를 실행하는 동안에만 충전 중 화면 켜짐 설정을 적용하며, 종료 시 원래 값으로 복원한다. 검사 중 사용자가 이 값을 바꾸었다면 새 값을 보존한다. 화면을 켜는 동작은 자동으로 수행하지만 잠금번호 입력과 잠금 해제는 사용자가 직접 해야 한다. 검사 중에는 휴대전화를 조작하지 않고 USB 연결을 유지한다.

## 자동 커밋 조건

사용자는 2026-11-12에 기존 직접 커밋 방식에서 자동 검사·기록·커밋 방식으로 변경을 요청했다.

검사 실패, 기기 연결 없음, 허용하지 않은 변경 파일, 기존 staging, 검사 중 파일이나 HEAD 변경이 있으면 자동 커밋하지 않는다. 커밋 대상은 scripts/device/commit-files.json의 정확한 파일 목록으로 제한한다. 새 기능으로 파일이 늘면 검토 후 목록을 갱신한다. 결과 문서만 달라진 재검사로는 새 커밋을 만들지 않는다.

기존 커밋 이력은 유지하고 추가 커밋만 만든다. GitHub push와 tag는 별도 사용자 요청에 따라 진행한다.

## 현재 확인 범위

검사 도구 설치와 첫 전체 검증은 `8309377`, 예시 6개가 포함된 설치형 APK의 인터넷 없는 첫 실행 검증은 `4fbe035`, 상품 분류와 예시 12개의 Expo Go 검증은 `479f6f5`에 기록했다. **꼬마 시장 검사 12** APK의 빌드·실제 오프라인 첫 실행·분류 검사와 설정 복구는 `125d852`에 포함했으며 사용자가 GitHub 업로드를 확인했다. 이전 단계의 결과는 해당 커밋에 포함된 보고서로 확인한다.

큰 글자·작은 화면·키보드 개선과 Expo Go 전체 검증은 `e15dac6`으로 완료했고 사용자가 GitHub 업로드를 확인했다. 실행 `20261115T161955875Z-724b31ea`에서 기존 놀이·세 화면 조건·각 두 번의 열린 키보드 실측·설정 복구가 모두 통과했다. [당시 개발 기록](book/chapters/06b-readable-layout.md)과 `e15dac6`에 포함된 자동 보고서로 확인한다.

이번 단계는 같은 화면을 포함한 **꼬마 시장 화면 검사** APK를 빌드하고 검사한다. 빌드와 다운로드를 완료했으며 실제 오프라인 첫 실행 뒤 통신을 복구하고 같은 APK에서 공개 상품으로 화면 사용성을 검사한다. [새 APK 기록](book/chapters/06c-readable-offline-apk.md) 및 검사 시작 HEAD `e15dac6`인 자동 보고서로 이번 결과를 구분한다. 이전 Expo Go나 이전 APK의 성공을 새 APK의 성공으로 사용하지 않는다.

사전 연결 확인인 device:doctor는 실기기 시나리오를 실행하거나 커밋하지 않는다. 실제 화면 조건을 적용한 검사와 설정 복구가 완료돼야 그 범위의 성공으로 기록한다.

## 설치형 APK의 실제 오프라인 첫 실행

Expo 계정으로 EAS 클라우드에서 release APK를 만든 뒤 아래처럼 기존 전체 검사에 독립 APK 단계를 추가할 수 있다. 최초 준비는 [설치형 앱 기록](book/chapters/05a-standalone-offline.md), 예시 12개 빌드는 [분류 APK 기록](book/chapters/06a-categories-offline-apk.md), 화면 개선을 담는 현재 작업은 [화면 개선 APK 기록](book/chapters/06c-readable-offline-apk.md)에 남긴다.

```bash
node scripts/device/verify.mjs --standalone-apk .artifacts/build/<빌드 번호>/provenance.json --message "test: 설치형 앱의 오프라인 첫 실행 검증"
```

이 옵션은 영수증 부분 검사와 함께 사용할 수 없다. 현재 소스·공개 설정·EAS 기록·APK 지문이 맞아야 시작한다. Android 공식 APK Analyzer와 apksigner가 추가로 필요하며, 기본 설치 위치는 `%LOCALAPPDATA%/store-price-tools/android-inspection`이다. 다른 경로는 `STORE_PRICE_APKANALYZER`, `STORE_PRICE_APKSIGNER`로 지정한다.

검사 APK는 빌드별로 별도 앱 식별자를 사용한다. 현재 Android 프로필에 해당 앱이 이미 있으면 덮어쓰거나 자료를 지우지 않고 멈춘다. 설치에도 `-R`로 기존 앱 교체를 명시적으로 금지하며 다른 보호된 프로필을 조회하지 않는다. 새로 설치한 앱이 아직 실행되지 않았음을 확인한 뒤, 복구 가능한 단일 데이터 회선의 Wi-Fi·모바일 데이터를 잠시 끈다. 실제 인터넷 경로와 USB 역방향 전달이 없는 상태를 첫 실행 전과 검사 중에 확인한다.

새 12개 예시 APK에서는 첫 실행과 기존 장바구니·거스름돈·영수증에 더해 분류별 6·4·2개, 다른 분류의 상품을 함께 담기, 분류를 바꿔도 유지되는 돈 선택·퀴즈, 새 놀이의 전체 분류 초기화를 검사하도록 확장한다. 오렌지·요구르트·크래커의 합계 4,500원에 5,000원을 내면 거스름돈 500원과 남은 놀이돈 5,500원을 구분한다.

별도 `standalone-result.xml`에 첫 실행·분류·예시 상품·장바구니·거스름돈·영수증·재실행 결과를 남긴다. 통신과 화면 유지 설정을 복구한 뒤에만 성공 보고서와 자동 커밋을 허용한다. 실패하면 이번 실행에서 직접 새로 설치했고 APK 지문이 같은 검사 앱만 정리하며 기존 앱은 보존한다.

오프라인 구간의 문제만 먼저 살필 때는 다음 부분 검사를 사용한다.

```bash
node scripts/device/verify.mjs --standalone-only --standalone-apk .artifacts/build/<빌드 번호>/provenance.json
```

이 모드는 APK 출처와 해당 실기기 시나리오만 확인한다. 코드 검사와 기존 온라인 놀이 전체를 대신하지 않으며, 공개 성공 보고서와 커밋을 만들지 않는다. 성공한 경우에도 이번 실행에서 새로 만든 검사 앱만 정리하므로 이후 전체 검사에서 다시 새로 설치할 수 있다. 통신·화면 설정 복구와 실패 차단 조건은 전체 검사와 같다.

## 같은 APK에서 오프라인과 화면 사용성까지 검사

새 APK의 오프라인 첫 실행 뒤 큰 글자·좁은 화면·키보드 검사까지 연결하려면 두 옵션을 함께 사용한다.

```bash
node scripts/device/verify.mjs --standalone-apk .artifacts/build/standalone-cf5eaac5f72fa3f0/provenance.json --readability --message "test: 화면 개선 APK의 오프라인·키보드 검증"
```

코드 검사·내장 예시 선택·Expo Go 기존 전체 놀이를 먼저 실행한다. 이번 서버와 USB 전달 연결을 정리한 뒤 새 APK의 실제 오프라인 첫 실행과 내장 예시를 검사한다. 오프라인 JUnit과 통신 복구가 모두 성공해야 후속 화면 검사를 호출한다. 후속 검사는 같은 APK가 Supabase에서 읽어 온 공개 상품으로 기본·글자 배율 1.5·320dp와 배율 1.5 조건을 실행한다. 보고서에 APK 패키지와 실행 표시를 남겨 Expo Go 화면 검사와 구분한다.

후속 검사 전후 APK 지문을 다시 확인한다. 실패하면 이번에 새로 설치했고 현재 지문이 같은 앱만 정리한다. 성공 앱을 남기거나 진단 앱을 제거하는 결정은 후속 검사와 화면 설정 복구까지 확인한 뒤에 한다. 오프라인·통신 복구 실패 시 후속 검사를 실행하지 않는다.

전체 검사 전 APK 구간만 살피려면 다음 부분 진단을 사용한다.

```bash
node scripts/device/verify.mjs --standalone-only --readability --standalone-apk .artifacts/build/standalone-cf5eaac5f72fa3f0/provenance.json
```

이 진단은 오프라인 첫 실행·통신 복구·같은 APK 화면 검사 순서를 실행한다. 성공하더라도 이번 진단 앱을 정리하며 전체 보고서나 자동 커밋을 만들지 않는다. 최종 전체 결과를 대신하지 않는다.

## 공식 자료

- [Maestro Windows 설치](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli)
- [Maestro의 React Native·Expo Go 지원](https://docs.maestro.dev/get-started/supported-platform/react-native)
- [Android USB 디버깅과 ADB](https://developer.android.com/tools/adb)
- [갤럭시 개발자 옵션](https://developer.android.com/studio/debug/dev-options.html)
