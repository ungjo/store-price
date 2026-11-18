# 07c. 정식 Android App Bundle로 설치 검사하기

검사 앱의 아이콘과 시작 화면은 `807d295`에서 확인했다. 이번에는 Google Play에 사용할 패키지 `com.ungjo.storeprice`의 앱 이름 **꼬마 시장**, 버전 `1.0.0`, Android 버전 코드 `2`를 기준으로 정식 빌드와 설치 결과를 따로 기록한다.

## 빌드 입력과 서명

공개 상품 목록을 읽는 설정과 앱 소스만 추린 뒤 EAS의 `production` 프로필로 Android App Bundle(AAB)을 만든다. 업로드용으로 서명된 AAB를 태블릿에서 확인할 때는 Google의 bundletool로 해당 기기에 맞는 분할 APK를 생성한다. 로컬 설치용 APK에는 별도의 임시 키를 사용한다. 이렇게 하면 Play 앱 서명 키나 업로드 키를 PC로 내보낼 필요가 없다.

## 진행 기록

- 앱 폴더에서 `npm test`를 실행해 149개 테스트가 모두 통과했다.
- Google의 bundletool 1.18.3 배포 파일을 내려받아 공개된 SHA-256 `a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`와 대조하고 `java -jar … version`의 출력 `1.18.3`을 확인했다.

[Android의 bundletool 안내](https://developer.android.com/tools/bundletool) · [Expo의 EAS 환경 변수 안내](https://docs.expo.dev/eas/environment-variables/usage/)

## 빌드 복사본 확인

저장소 루트에서 `node scripts/build/production.mjs prepare`를 실행해 빌드 작업 폴더 `production-74c1de1567c4b0a6`을 만들었다. 이 폴더 아래 `project`에서 실행한 명령은 다음과 같다.

```bash
npm ci --no-audit --no-fund
export EAS_NO_VCS=1
export EAS_PROJECT_ROOT="$PWD"
eas build:inspect --platform android --profile production --stage archive --output ../archive-production
eas build --platform android --profile production --message production-74c1de1567c4b0a6 --no-wait
```

PC에 설치된 EAS CLI를 사용했다. 의존성 742개가 설치됐고, 업로드될 압축본의 파일 42개가 복사본과 이름·내용까지 일치했다. 앱 소스 지문은 `1bbf73aeeb2820ec74c3bb3b7ae5b818266c5fbf814fda53d5ba00bc4643b357`이다. 원래 앱 폴더에서 `npm run typecheck`와 `npm run lint`도 통과했다.

첫 빌드를 요청하자 EAS가 정식 앱의 Android 서명 키 생성 여부를 물었다. 업로드 키는 이후 업데이트에도 사용되므로 소유자가 생성 여부를 선택한다.

## 로컬에서 확인한 범위

정식 프로필의 공개 환경 변수로 빌드 복사본에서 `node node_modules/expo/bin/cli export --platform android --output-dir ../local-export`를 실행했다. 결과는 Hermes 번들 1개(1,646,459바이트)였다. 파일에서 공개 상품 연결 설정을 확인했고 빌드 작업 번호는 검출되지 않았다. 이 결과는 로컬 실행 번들에 대한 검사다.

PC에서 실행한 빌드·기기 도구 단위 테스트 347개가 통과했다. 최종 정식 빌드·설치·화면 증거 검사만 별도로 모아 실행한 `node --test scripts/build/production.test.mjs scripts/device/production-device.test.mjs scripts/device/production-branding.test.mjs`에서도 18개가 통과했다. 정식 앱용 Maestro 시나리오는 문법 검사를 통과했다. 시나리오는 상품 12개를 확인하고 사과 2개와 우유 1개를 담아 5,500원을 결제한 뒤, 거스름돈 4,500원과 영수증을 확인한다.

## EAS 제출과 태블릿 준비

2026-11-18에 소유자가 첫 업로드 키의 생성·보관·사용을 승인했다. EAS가 클라우드에서 키를 만들고 Android 빌드 `8c6e0a43-45ae-48c8-941e-f60447e9397d`를 시작했다. 기기 목록에서 Galaxy Tab S9(SM-X710)의 USB 디버깅 연결을 확인했다. 관리 프로필이 함께 있는 이 태블릿에서는 패키지를 조회할 때 `adb shell am get-current-user`로 확인한 사용자 번호를 `pm list packages --user`에 지정한다. 해당 프로필에는 기존 검사 앱이 있었고 정식 앱 ID는 없었다. 빌드·검사 중 화면 재잠금을 막기 위해 USB 화면 유지 설정의 원래 값 `0`을 기록하고 임시로 `2`를 적용했다.

## 완성된 정식 번들

EAS의 결과는 `FINISHED`, 빌드 시간은 약 7분 33초였다. 빌드 ID를 지정해 다음 순서로 검사했다.

```bash
build_dir=.artifacts/build/production-74c1de1567c4b0a6
node scripts/build/production.mjs download "$build_dir" 8c6e0a43-45ae-48c8-941e-f60447e9397d
node scripts/build/production.mjs verify "$build_dir"
node scripts/build/production-apks.mjs "$build_dir"
```

다운로드 중 Expo가 동일한 파일 ID로 `expo.dev`에서 `api.expo.dev`를 거쳐 공식 CDN으로 이동하는 것을 확인했다. 다운로드 검사가 이 경로를 인식하도록 보완했다. AAB 크기는 46,068,913바이트, SHA-256은 `1ef00c83dd376d82eee0a5a87c09331f693621e898ad2850a2cd07f61090cf03`였다. 완성된 번들에서 앱 이름 **꼬마 시장**, 정식 패키지·버전, 백업·디버그 비활성 상태, 실행 번들의 공개 상품 연결 설정, JAR 전체의 서명을 확인했다. 업로드 인증서의 SHA-256은 `282ede849b8ffb886840bafd0b0e76ec5fa74c399e4dfd702a722219881368e7`이다.

bundletool은 태블릿에 필요한 기본 코드·ARM64·한국어·화면 밀도의 APK 네 개를 골랐다. Android Build Tools 37의 실제 출력에서 v3 서명자는 `V3.0 Signer:`로 표시됐다. 기존 검사기는 이 형식을 읽지 못해 설치 전에 중단됐다. 인증서 SHA-256 줄에서 이 표기도 읽도록 보완하고 기존 서명 회귀 검사 22개를 통과한 뒤 네 파일의 서명과 지문을 확정했다.

## 실기기 검사를 재현하는 명령

```bash
node scripts/device/verify.mjs --production-aab .artifacts/build/production-74c1de1567c4b0a6/provenance.json --message "test: 정식 Android App Bundle과 태블릿 설치 검증"
```

검사기는 설치된 네 파일을 원본과 대조한다. 앱 정보에서 아이콘을, 새 프로세스로 시작할 때 녹화한 영상에서 시작 화면을 확인한다. 상품 12개에서 장보기와 거스름돈 맞히기, 영수증까지 진행한 결과와 실제로 확인한 프레임은 [자동 검사 보고서](../verification/latest-android.md)에 기록한다. 이 단계의 판정은 정식 패키지 `com.ungjo.storeprice`와 위 AAB 지문이 함께 표시된 보고서로 확인한다.

첫 전체 검사 `20261118T110226416Z-579b5d7a`에서는 코드·DB 검사 뒤 Expo Go의 예시 상품 선택 흐름이 실패했다. 실패 시점의 화면 트리에 Android 잠금 화면이 있었고, 화면 유지 설정이 `0`으로 복구된 것을 확인했다. 정식 앱 설치 전이어서 이 실행에는 성공 보고서나 커밋이 없다.

태블릿 잠금 해제 상태를 다시 확인하고 올바른 AAB·현재 Android 사용자·각 APK 지문·정식 패키지 부재를 대조한 뒤 `adb install-multiple -R --user <현재 사용자> <APK 4개>`를 실행했다. 결과는 `Success`였다. 이어지는 전체 검사는 이미 설치한 네 파일을 다시 읽어 지문과 버전이 같을 때 그 앱에서 실행한다.
