# 05장 보충. 설치형 앱을 인터넷 없이 처음 열기

날짜: 2026-11-15

시작 커밋은 `7b40957`이며 사용자가 GitHub 업로드를 확인했다. 앞 단계는 이미 실행된 Expo Go 앱에서 예시 상품을 선택하는 검사였다. 이번 단계의 목표는 앱 코드를 포함한 Android APK를 새로 설치하고, 휴대전화의 인터넷을 끈 뒤 첫 화면부터 놀이를 검사하는 것이다.

## 설치형 앱 준비

Expo SDK 58.0.23의 앱을 EAS 클라우드에서 release APK로 만든다. Expo Go 설치와 Expo 계정 로그인은 별도다. `eas.json`의 preview 프로필은 `developmentClient: false`, `distribution: internal`, Android `buildType: apk`를 지정한다. 이 APK는 개발 서버에서 JavaScript를 받아 시작하는 개발 클라이언트가 아니다.

`app.config.js`는 검사 빌드에서만 이름을 **꼬마 시장 검사**로 바꾸고, 빌드마다 다른 Android 앱 식별자를 사용한다. 기존 Expo Go나 다른 앱과 구분하며, 백업 복원은 끈다. 첫 실행 전에 현재 Android 프로필에 해당 식별자의 앱이 설치되어 있거나 제거 후 데이터가 남아 있으면 검사를 멈춘다. 설치할 때도 `-R`로 기존 앱 교체를 명시적으로 금지한다. 기존 앱의 데이터를 지워 첫 실행으로 간주하지 않는다.

프로젝트의 `.artifacts`에는 실제 가격의 비공개 관측과 기기 자료가 있다. 이 폴더를 포함한 저장소 전체를 업로드하지 않도록 `.easignore`를 제한하고, 실제 빌드는 별도의 허용 목록 복사본에서 진행한다. 앱 소스·설정·잠금 파일·이미지만 복사하며 공개 Supabase URL과 publishable 키만 빌드 설정에 고정한다. 관리자 키와 실제 가격 미리보기 토큰은 사용하지 않는다. 검사 도중 서버 응답을 지연하는 개발용 설정도 끈다.

## 소스와 APK를 연결하기

아직 커밋하지 않은 코드를 빌드하므로 EAS 화면의 Git 커밋 번호만으로 실행한 소스를 증명할 수 없다. 다음 자료를 Git에서 제외된 `.artifacts/build/<빌드 번호>`에 보관한다.

- 빌드 입력 파일별 SHA-256과 전체 소스 지문
- 업로드 전용 복사본의 지문과 공개 설정 지문
- EAS 프로젝트·빌드 번호, 완료 상태와 프로필
- 다운로드한 APK의 SHA-256, 앱 식별자와 빌드 표시

자동 검사는 Android 공식 `apkanalyzer`와 `apksigner`로 패키지·버전·디버그 비활성화·백업 비활성화·내장 실행 번들·서명을 확인한다. APK 안의 고유 빌드 표시와 휴대전화 화면의 표시도 비교한다. 앱 소스·설정·APK·기록이 바뀌면 다시 빌드하거나 검사해야 하며 커밋하지 않는다.

## 실제 오프라인 검사

먼저 기존 코드 검사와 온라인 갤럭시 회귀 검사를 실행한다. 이어 검사기가 직접 시작했던 서버와 USB 역방향 연결을 정리한다. 사용자가 별도로 켠 개발 서버를 임의로 종료하지 않는다.

검사 앱이 없는 것을 확인하고 APK를 설치하되 실행하지 않는다. 원래 Wi-Fi·모바일 데이터 설정과 SIM 상태를 읽고, 복구 가능한 구성이면 켜져 있던 통신만 잠시 끈다. 인터넷 기본 연결이나 다른 인터넷 경로, USB 역방향 연결이 남으면 오프라인 검사에 들어가지 않는다.

휴대전화에서는 다음 흐름을 확인한다.

1. 새 APK를 처음 실행하고 실제 상품 조회 실패 화면을 확인한다.
2. 예시 상품을 선택해 내장된 6개 상품으로 시작한다.
3. 사과 2개와 우유 1개, 합계 5,500원을 담는다.
4. 놀이돈 10,000원을 고르고 거스름돈 4,500원을 맞힌다.
5. 계산을 완료하고 영수증의 수량·합계·거스름돈을 확인한다.
6. 다시 장보기와 앱 재실행 때 이전 장바구니와 영수증이 남지 않는지 확인한다.

검사 중에도 실제 연결 상태를 확인한다. 실패하거나 사용자가 검사를 중단해도 변경한 통신 설정을 복구한다. 통신과 화면 유지 설정의 복구 확인까지 마친 뒤에만 성공 보고서와 로컬 커밋을 만든다. 이 단계는 마지막 원격 상품 목록을 저장하는 영구 캐시나 실제 가격의 오프라인 공개를 추가하지 않는다.

## 실행 명령과 결과 기록

사용자 명령은 Git Bash 기준이다. 계정 연결은 앱 폴더에서 수행한다.

```bash
cd /c/Hitech_subsidy/AI_automize/workspace/store-price/workspace/apps/mobile
npx eas-cli@latest login --browser
npx eas-cli@latest init
```

연결 후 저장소 루트에서 전용 복사본을 준비한다.

```bash
cd ../..
node scripts/build/standalone.mjs prepare
```

출력된 projectRoot에서 의존성을 설치하고, `EAS_NO_VCS=1`과 해당 절대 경로의 `EAS_PROJECT_ROOT`를 사용한다. 이렇게 해야 복사본이 부모 Git 저장소 전체로 확장되지 않는다. `build:inspect --platform android --profile preview --stage archive`로 업로드 자료를 확인한 뒤 `build --platform android --profile preview --message <빌드 표시>`를 실행한다. 완료 기록을 build.json으로 저장하고 다음 명령으로 APK를 내려받는다.

```bash
node scripts/build/standalone.mjs download .artifacts/build/<빌드 번호>
node scripts/device/verify.mjs --standalone-apk .artifacts/build/<빌드 번호>/provenance.json --message "test: 설치형 앱의 오프라인 첫 실행 검증"
```

위 `<빌드 번호>`는 실제 준비 명령의 결과로 바꾼다. 로그인 비밀번호·인증 코드·서명 키는 원고나 저장소에 적지 않는다. APK와 원본 로그도 Git에 넣지 않는다.

준비 중 브라우저 로그인을 입력 창이 없는 터미널에서 처음 실행했을 때 CLI가 중단했다. 대화형 터미널로 다시 실행해 브라우저 로그인 연결을 열었다. Android 분석 도구는 Google 공식 저장소의 Windows 압축 파일을 받고 공식 저장소 메타데이터의 체크섬과 비교한 뒤 풀었다. 빌드 자체는 클라우드에서 수행하므로 PC의 Android 전체 빌드 환경은 요구하지 않는다.

EAS CLI 27.10.0은 프로필 환경 변수의 빈 문자열을 허용하지 않아 첫 프로젝트 연결 명령이 실패했다. 개발용 미리보기와 지연 검사 설정을 빈 값 대신 `disabled`로 고정하고 연결했다. 실제 업로드 전 확인에서는 앱 파일 32개가 모두 준비한 복사본과 일치했다. EAS의 preview 환경에 별도로 등록된 환경 변수가 없다는 응답도 확인했다. `EAS_NO_VCS`만 설정하면 부모 Git 저장소를 찾을 수 있어 `EAS_PROJECT_ROOT`에 복사본 절대 경로도 함께 지정했다.

이번 실행에서 준비한 빌드 표시는 `standalone-2edbf303751b7831`, EAS 빌드 번호는 `7b192673-6bd0-46a8-80c7-d937cb61cdc9`다. 제출 명령은 다음과 같으며 Windows 실행에서는 PowerShell의 환경 변수 문법과 `npx.cmd`를 사용했다. 아래는 같은 명령의 Git Bash 표기다.

```bash
cd .artifacts/build/standalone-2edbf303751b7831/project
npm ci --no-audit --no-fund
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" npx eas-cli@latest build:inspect --platform android --profile preview --stage archive --output ../archive-inspection
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" npx eas-cli@latest build --platform android --profile preview --message standalone-2edbf303751b7831 --no-wait
npx eas-cli@latest build:view 7b192673-6bd0-46a8-80c7-d937cb61cdc9 --json
```

빌드가 FINISHED 상태가 된 뒤 APK 67,767,609바이트를 내려받았다. 첫 다운로드 시도에서는 Expo가 연결한 최종 파일 서버 `wf-artifacts.eascdn.net`이 검사 목록에 없어 중단했다. 공식 빌드 응답의 Expo 주소에서 실제 이동한 주소와 HTTPS 응답을 확인하고, 이 호스트를 최종 응답에만 허용했다. 기록에 임의 CDN 주소를 직접 넣는 경우는 계속 거부한다. APK SHA-256은 `2b5c8223509d319d5eef496ba9bb86a6bc3a4344e35c8e356ca31fa58aa639eb`다.

새 빌드 준비 도구 검사 22개와 기기 오프라인 처리 검사 16개를 따로 통과했다. 소스 변경·경로 우회·출처 불일치·잘못된 검사 결과·통신 복구 실패·검사 전에 앱이 먼저 실행된 경우를 포함한다. 기기 처리 단위 검사는 가상 응답을 사용하므로 실제 갤럭시 오프라인 성공과 구분한다. 실제 기기를 읽기만 한 사전 점검에서는 Wi-Fi·데이터 켜짐, 비행기 모드 꺼짐, 인터넷 연결 2개와 USB 역방향 연결 0개를 확인했다.

첫 전체 검사 `20261115T120609596Z-7076cc8f`는 `apk-summary`에서 중단했다. 압축 파일을 푼 위치가 Android SDK 표준 구조가 아니어서 APK Analyzer가 도구 폴더를 찾지 못했다. 이 실행에서는 앱을 설치하거나 통신을 끄지 않았고 임시 화면 유지 설정을 복구했다. 이번에 설치한 도구만 `android-inspection/cmdline-tools/latest`와 `android-inspection/build-tools/37.0.0`으로 정리한 뒤 같은 APK의 앱 식별자·버전 읽기에 성공했다. 검사 실패 실행으로는 커밋을 만들지 않았다.

휴대전화를 다시 검사하기 전에 APK 전체 분석을 별도로 실행했다. Build Tools 37의 인증서 출력이 `V2 Signer: certificate SHA-256 digest:` 형식인 점을 확인하고 파서를 맞췄다. 이후 실제 APK의 비디버그 설정·백업 차단·실행 번들·고유 표시·정확한 공개 연결 설정·서명 검증과 검사 전후 파일 지문 확인을 모두 통과했다.

두 번째 전체 검사 `20261115T121109735Z-9cf05f42`에서는 코드 검사와 개발용 예시 선택, 기존 온라인 놀이의 화면 명령 746개가 통과했다. 새 APK 설치와 파일 지문, 아직 실행하지 않은 상태, 실제 Wi-Fi·데이터 꺼짐과 인터넷 경로 0개까지 확인했다. 그러나 별도 Maestro 실행이 시작된 직후 감시기가 Wi-Fi가 다시 켜진 것을 발견해 약 5초 만에 화면 검사를 취소했다. 이 실행은 오프라인 성공으로 기록하지 않았다. 통신 두 설정과 화면 유지 설정이 원래대로 복구됐고, 이번 실행에서 새로 설치한 검사 앱만 정리했으며 커밋하지 않았다.

확인 결과 사용자가 꺼진 Wi-Fi를 직접 다시 켰다고 알려 주었다. 검사 도구가 자동으로 Wi-Fi를 켰다고 단정하지 않고, 재검사 중에는 꺼진 연결을 그대로 두면 종료 후 복구된다고 안내했다. 감시가 실행을 중단한 경우에도 단순한 취소 문구 대신 실제 연결 변경 원인을 남기도록 오류 처리를 보완했다.

새 APK 구간만 먼저 진단할 수 있도록 `--standalone-only --standalone-apk <기록 경로>`를 추가했다. 이 모드는 전체 코드·온라인 검사를 생략하고 공개 성공 보고서·커밋을 생성하지 않는다. 새로 만든 임시 검사 앱만 결과 확인과 통신 복구 뒤 정리하므로 전체 검사에서 다시 첫 설치부터 확인할 수 있다. 이 정리 동작을 포함한 기기 처리 단위 검사 17개를 통과했다. 전체 자동 커밋은 여전히 코드·온라인·오프라인 검사와 설정 복구가 모두 성공한 실행에서만 허용한다.

첫 부분 진단 `20261115T123603708Z-a8d8e7a0`에서는 Google Play Protect가 모르는 앱의 보안 검사 전송 확인을 기다려 설치 제한 시간 180초를 넘었다. 통신을 끄기 전이었으며 화면 설정은 복구했다. 확인 창을 읽고 사용자가 **이번에만 전송**을 직접 선택했다. 항상 전송 설정이나 Play Protect 비활성화는 사용하지 않았다. 이후 이번 APK와 동일한 파일이 아직 실행되지 않은 상태로 설치된 것을 확인했다. 첫 설치 검사를 다시 시작할 수 있도록, 앞 진단에서 생성된 바로 그 검사 앱만 지문과 기존 부재 기록을 대조해 정리했다.

이 정리 과정에서 다른 보호된 Android 프로필의 조회 명령이 종료 코드 0과 빈 표준 출력을 내면서 표준 오류에는 권한 거부를 남긴 점을 발견했다. 빈 출력만 보고 앱이 없다고 판단하는 처리를 수정했다. 검증 범위는 현재 사용 중인 Android 프로필로 한정하고, 다른 보호된 프로필은 조회하지 않는다. 현재 프로필의 조회에서 표준 오류가 나오면 중단하며, 같은 프로필에만 설치·정리한다. Android 패키지 관리자는 `-r` 생략만으로 교체 금지를 보장하지 않으므로, 기기의 도움말과 AOSP 소스를 확인해 명시적인 `adb install -R --user <현재 프로필> <APK>`를 사용했다. 이 첫 실행 결과를 다른 프로필의 실행 결과로 확대하지 않는다.

이 보완을 포함한 기기 처리 검사 20개가 통과했다. 두 번째 부분 진단 `20261115T124841058Z-44d1c424`에서는 실제 갤럭시의 새 설치·미실행 상태·오프라인 첫 화면부터 예시 선택·사과 2개와 우유 1개·5,500원 합계·10,000원 지불·4,500원 정답·영수증·새 놀이·프로세스 재실행까지 화면 명령 60개를 통과했다. 별도 JUnit은 1개 사례, 실패·오류·건너뜀 0개다. 네트워크 감시 29회 동안 Wi-Fi·모바일 데이터는 꺼져 있었고 인터넷 경로와 USB 역방향 연결은 0개였다. 두 통신 설정을 켜짐으로 복구하고 화면 유지 값을 7에서 원래 0으로 되돌린 것을 확인했다. 부분 진단용으로 새로 설치한 앱만 정리했으며 이 부분 성공으로 전체 보고서나 커밋을 만들지 않았다.

실행 성공 여부는 준비 문서와 구분해 [자동 생성 검증 결과](../verification/latest-android.md)에 남긴다. 검사 시작 HEAD가 `7b40957`이고 독립 APK 단계·별도 JUnit·통신 설정 복구 결과가 포함된 실행이 이 장의 검증이다. 빌드나 실기기 검사가 끝나기 전에는 이 문서의 검사 계획을 성공 결과로 읽지 않는다. iPhone의 오프라인 첫 실행과 스토어 심사는 후속 단계다.

## 공식 자료

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [APK 빌드](https://docs.expo.dev/build-reference/apk/)
- [EAS 업로드 범위와 No VCS](https://docs.expo.dev/build-reference/project-upload/)
- [빌드에서 파일 제외](https://docs.expo.dev/build-reference/easignore/)
- [Android APK Analyzer](https://developer.android.com/tools/apkanalyzer)
- [Android APK 서명 확인](https://developer.android.com/tools/apksigner)
