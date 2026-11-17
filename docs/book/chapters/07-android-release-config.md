# 07장. Android 배포 설정과 검사 앱 분리

작업일: 2026-11-17. 시작 HEAD는 `97b00ff`이며 사용자가 GitHub 업로드를 확인했다. 앞 단계의 **꼬마 시장 읽기 검사** APK는 실행 `20261116T222305411Z-db74af27`에서 오프라인 첫 실행·TalkBack·설정 복구를 통과했다. 그 결과는 당시 APK의 근거로 보존한다.

이번 단계는 정식 배포용 앱과 반복 검사 앱의 식별자·이름·버전·EAS 프로필을 정리한다. 설정을 검사하고 현재 태블릿에서 기존 Expo Go 전체 놀이를 다시 확인한다. 새 APK/AAB 생성이나 Google Play 업로드는 수행하지 않는다. 이 원고는 최종 전체 검사 전에 고정하며 실제 결과는 같은 커밋의 자동 보고서로 확인한다.

## Android로 범위를 정리한 변경을 포함하기

사용자는 2026-11-17 iOS 개발 중단을 요청했다. 앱 대상은 Android, 출시처는 Google Play로 정리하고 웹은 PC 개발용 미리보기·검사에 남겼다. iOS 실행 스크립트·설정을 제거하고 번들 검사를 Android와 웹으로 제한했다. 과거 iOS 번들 검사 결과와 책의 장 원문은 당시 사실이므로 보존했다.

그 범위 변경 직후 타입·ESLint·Android/웹 번들 검사는 통과했으나 별도 실기기 검사나 커밋은 만들지 않았다. 이번 배포 설정 작업과 함께 검증·기록한다.

## 세 가지 앱 설정의 목적

| EAS 프로필 | 앱 이름·식별자 | EAS 환경 | 생성하려는 형식 | 목적 |
| --- | --- | --- | --- | --- |
| `production` | 꼬마 시장 / `com.ungjo.storeprice` | `production` | 스토어 배포 AAB | Google Play에 배포할 고정 앱 |
| `inspection` | 꼬마 시장 검사 / `com.ungjo.storeprice.inspection` | `preview` | 내부 검사 APK | 같은 식별자로 반복 사용하는 검사 앱 |
| 기존 `preview` | 꼬마 시장 읽기 검사 / 빌드마다 새 nonce를 포함한 전용 패키지 | `preview` | 내부 검사 APK | 이전 설치와 구분하는 오프라인 첫 실행 검사 |

다른 앱으로 나란히 설치하려면 식별자도 달라야 한다. 검사 앱이 정식 앱을 덮어쓰거나 검사 중인 상태를 정식 앱의 상태와 혼동하지 않도록 두 고정 식별자를 분리한다. 기존 preview의 일회성 식별자는 첫 실행 검증에 계속 사용한다. [Expo 앱 변형 안내](https://docs.expo.dev/build-reference/variants/)

기존 `--standalone-apk` 도우미는 첫 실행 검사용 nonce 패키지만 받는다. 정식 앱이나 고정 inspection 패키지를 전달하면 ADB 작업 전에 거부하므로 기존 설치 앱을 새 설치 증거로 오인하거나 정리하지 않는다. 세 설정 모두 백업 복원은 `allowBackup: false`로 지정한다.

프로필의 `distribution`과 Android `buildType`도 용도에 맞춰 지정한다. `production`의 `app-bundle`은 AAB, 내부 검사 프로필의 `apk`는 설치형 APK를 만들도록 하는 설정이다. 이 값이 맞다는 검사는 해당 파일을 실제로 빌드했다는 뜻이 아니다. [EAS 설정 명세](https://docs.expo.dev/eas/json/)

## 기본 실행과 배포 환경의 구분

`STORE_PRICE_APP_VARIANT`를 생략하면 로컬 기본값은 `inspection`이다. 정식 배포는 `production`을 명시적으로 선택하고, 정식 환경에 개발용 실제 가격 미리보기·대기 응답 시나리오·검사 실행 표시 또는 독립 APK 패키지·nonce가 섞이면 잘못된 설정으로 거부한다. 비공개 자료가 공개 앱에 연결되거나 개발 검사 화면이 배포되는 일을 구성 단계에서 막기 위한 규칙이다.

이 설정 변경은 상품·장바구니·계산의 동작을 바꾸지 않는다. 기존 오프라인 preview와 자동 검사기의 실행 표시 전달 경로도 별도 검사 대상으로 유지한다. 앱의 공개 상품은 자체 예시 12개이며 실제 이마트 가격의 공개·자동 갱신은 이번 범위가 아니다.

production 프로필의 `production` 환경과 inspection 프로필의 `preview` 환경에 사용할 공개 상품 URL·publishable 키는 이번에 변경하거나 검증하지 않는다. 로컬 `.env.local`은 `.easignore`에 따라 업로드되지 않으므로 새 APK/AAB를 빌드하는 단계에서 각 환경의 공개 연결 설정을 따로 확인해야 한다. 설정 값이나 키는 원고에 적지 않는다.

## 표시 버전과 Android 빌드 번호

정식 표시 버전은 `1.0.0`, `android.versionCode`는 `1`로 시작한다. `version`은 사용자에게 보여 주는 버전이고 `versionCode`는 Android 업로드를 구분하는 번호다. 이번 프로젝트는 `cli.appVersionSource: local`과 `autoIncrement: false`로 저장소의 값을 직접 관리한다. 같은 앱의 다음 Google Play 업로드를 준비할 때에는 `versionCode`를 올린 변경을 함께 기록해야 한다. [Expo 버전 관리 안내](https://docs.expo.dev/build-reference/app-versions/)

자동 증가를 쓰지 않는 이유는 책의 코드와 검토한 버전 값, 빌드 준비 시점을 함께 추적하기 위해서다. 정식 앱의 버전과 예전 APK의 버전을 소급해 바꾸지 않는다.

## 실행 명령과 검증 범위

저장소 루트에서 설정·기존 preview 경로의 PC 검사만 분리해 확인하는 명령은 다음과 같다. 설정 검사는 실제 로컬 Expo CLI로 세 프로필을 해석하며 출력에서 이름·패키지·버전 등 필요한 값만 대조한다.

```bash
node --test scripts/build/app-config.test.mjs
node --test scripts/build/standalone.test.mjs
node --test scripts/device/standalone-device.test.mjs
```

전체 회귀 전에 설정 검사 17/17개, 기존 빌드 도우미 22/22개, 오프라인 기기 도우미 45/45개가 통과했다. 마지막 검사는 기존 43개에 정식·inspection 고정 패키지를 ADB 호출 없이 거부하는 2개를 더한 모의 검사다. 타입·ESLint·Node 구문·공백 검사도 통과했다. 이 PC 결과를 새 네이티브 앱 설치나 이번 전체 실기기 성공으로 확대하지 않는다.

저장소 루트의 Git Bash에서 전체 검사를 실행한다.

```bash
node scripts/device/verify.mjs --message "chore: Android 배포 설정과 검사 앱 분리"
```

이번 명령에는 `--standalone-apk`나 `--talkback`을 추가하지 않는다. 코드·설정·공개 상품 HTTP 검사와 상품 로딩 중 예시 선택, 기존 Expo Go의 장바구니·예산·거스름돈·영수증 전체 회귀를 확인한다. 화면 유지 설정 복구와 소스·설정 지문을 확인한 뒤에만 보고서와 자동 커밋을 만든다.

준비 과정에서 USB 디버깅 승인을 기다렸고 사용자가 연결을 허용했다. 준비 점검 `20261117T103822314Z-bb7d6357`은 통과했다. 이는 기기 연결 준비 확인이며 이번 전체 놀이 검사의 성공을 뜻하지 않는다.

설정 자동 검사는 프로필별 이름·앱 ID·버전·출력 형식과 잘못된 환경의 거부 동작을 확인한다. Expo Go 회귀는 앱의 JavaScript 동작을 확인한다. 어느 쪽도 새 `production` AAB나 `inspection` APK의 설치·서명·네이티브 실행을 증명하지 않으므로 네이티브 빌드 검증과 Google Play 테스트는 후속 단계로 남긴다. 전용 아이콘과 스토어 소개·정책 자료도 별도로 준비한다.

실제 결과는 이 장과 같은 커밋의 [자동 검증 보고서](../verification/latest-android.md)에서 검사 시작 HEAD `97b00ff`, 실행 ID, 필수 검사와 설정 복구 결과를 확인한다. 실행 전에 남아 있는 앞 APK의 PASS 보고서를 이번 설정 단계의 성공으로 사용하지 않는다. 원본 기기 로그·화면은 `.artifacts`에 보관하며 GitHub push는 별도 사용자 요청에 따른다.
