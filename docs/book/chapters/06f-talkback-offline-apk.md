# 06장 보충. TalkBack 개선을 새 APK에 담아 검사하기

작업일: 2026-11-16~2026-11-17. 시작 HEAD는 `c9491548c75ce30446f33c2859645caeff80f1b1`이다. 앞 단계의 Expo Go 실행 `20261116T112508546Z-5416f64e`에서 TalkBack 23개 확인 지점과 설정 복구를 통과했고 그 보고서는 `c949154`에 보존한다. 이번 단계는 같은 개선을 설치형 Android APK에 담아 현재 태블릿에서 검증한다.

## 새 앱과 빌드 출처

앱 표시명은 **꼬마 시장 읽기 검사**다. `c949154`의 장보기·계산·접근성 코드를 유지하고 독립 APK의 이름을 구분한다. 이전 **꼬마 시장 화면 검사**를 덮어쓰지 않도록 새 패키지를 사용한다. DB·가격·공개 권한 변경은 포함하지 않는다.

| 항목 | 확인한 값 |
| --- | --- |
| 시작 HEAD | `c949154` |
| 앱 표시명 / 버전 | 꼬마 시장 읽기 검사 / `0.1.0`, versionCode `1` |
| 빌드 표시 | `standalone-edc2c57143e6fb27` |
| Android 패키지 | `com.ungjo.storeprice.offline.bedc2c57143e6fb27` |
| 빌드 소스 SHA-256 | `da0c444f62924d67fed6326eb90ee351219a6b9dd7b03e9717613fae0dd00786` |
| 업로드 자료 비교 | 전용 복사본의 36개 파일과 목록·내용 모두 일치 |
| EAS 빌드 ID | `35fc43bc-0e4e-4bba-b220-57c9696a6429` |
| EAS 빌드 생성 | 2026-11-16 12:17:26 UTC / 21:17:26 KST |
| 빌드 완료 | FINISHED, 2026-11-16 12:30:00.621 UTC / 21:30:00.621 KST |
| APK 다운로드 | 2026-11-16 12:31:03.130 UTC / 21:31:03.130 KST |
| APK 크기 | 67,778,413바이트 |
| APK SHA-256 | `7881a5026081de5c390e1923f69bd2dd056c70f6f4d69035bb5925ad81de7792` |
| 새 설치·실기기 결과 | 아래 첫 실행 실패 기록과 구분해 검사 시작 HEAD `c949154`인 새 자동 보고서로 확인 |

이번 고유 패키지의 서명 키는 EAS 클라우드에서 새로 생성했다. 업로드는 앱 소스·설정·잠금 파일·이미지의 전용 복사본으로 제한하고 공개 상품 설정과 빌드 표시를 고정한다. 비공개 실제 가격 자료·관리자 키·개발용 미리보기 토큰·기기 로그·기존 APK는 올리지 않는다.

빌드와 다운로드를 완료했고 빌드 ID·패키지·빌드 표시·preview 프로필의 일치를 확인했다. 다운로드 도구의 입력 복사본·소스 지문 검증도 통과했다. 첫 전체 실행에서는 APK manifest·서명 분석까지 통과했지만 설치는 사용자 선택 대기로 중단됐다. APK 파일 검증과 실제 설치·실행 성공을 구분한다.

## 빌드와 검사 명령

다음은 전용 복사본에서 진행하는 준비·제출 절차의 Git Bash 표기다. `prepare`를 다시 실행하면 새로운 빌드 번호가 생기므로 이미 준비한 빌드를 이어 확인할 때는 해당 폴더를 사용한다.

```bash
node scripts/build/standalone.mjs prepare
cd .artifacts/build/standalone-edc2c57143e6fb27/project
npm ci --no-audit --no-fund
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$(pwd -W)" npx eas-cli@latest build:inspect --platform android --profile preview --stage archive --output ../archive-inspection
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$(pwd -W)" npx eas-cli@latest build --platform android --profile preview --message standalone-edc2c57143e6fb27 --no-wait
```

같은 복사본에서 완료 기록을 저장한 뒤 저장소 루트의 다운로드 도구로 APK와 출처 기록을 만들었다. 이어 전체 검사를 먼저 실행해 검증·자동 보고서·커밋까지 확인한다. 부분 진단은 전체 실행에서 실패한 구간을 따로 확인해야 할 때만 사용한다.

```bash
npx eas-cli@latest build:view 35fc43bc-0e4e-4bba-b220-57c9696a6429 --json > ../build.json
cd ../../../..
node scripts/build/standalone.mjs download .artifacts/build/standalone-edc2c57143e6fb27
node scripts/device/verify.mjs --standalone-apk .artifacts/build/standalone-edc2c57143e6fb27/provenance.json --talkback --message "test: TalkBack APK의 오프라인·접근성 검증"
```

## 설치형 앱의 TalkBack 검사 경로

기존 TalkBack 도구는 Expo Go의 VIEW 링크 실행을 전제로 했다. 새 `standalone` 모드는 고유 패키지와 16자리 빌드 번호의 일치를 확인하고 Expo URL을 받지 않는다. MAIN/LAUNCHER로 해당 앱을 열며 검사 뒤 앱으로 돌아갈 때도 같은 방식을 쓴다. Expo Go의 기본 VIEW 실행은 유지한다.

두 모드 모두 같은 대상 패키지 안에서 이번 실행 표시·Supabase 출처·상품 12개가 준비됐는지 확인한다. 결과에는 모드와 실행 방식, 앱 ID·빌드 표시를 남긴다. 실제 터치, native 포커스·표시 상태, TalkBack 발화 OCR과 설정 복구 근거가 맞아야 성공으로 판단한다. 기존 23개 동선과 OCR 기대값·복구 기준은 유지한다. 이 런타임 확장의 단위·모의 검사 22/22개와 Node 구문·공백 검사가 통과했으며 새 APK 실기기 성공과 구분한다.

전체 실행은 다음 순서를 따른다.

1. 코드·DB·공개 HTTP·내장 예시 선택·Expo Go 기존 놀이 회귀를 검사한다.
2. 이번 검사에서 만든 서버와 USB 역방향 전달만 정리한다. 현재 Android 프로필의 새 패키지 부재를 확인하고 기존 앱을 교체하지 않는 방식으로 설치한다.
3. 설치 파일 지문과 미실행 상태를 대조하고 실제 인터넷 경로가 없는 상태에서 처음 실행한다. SIM 없는 태블릿은 원본 모바일 데이터 값을 보존하고 Wi-Fi만 잠시 끈다.
4. 내장 예시 12개·분류·장바구니·계산·영수증·재실행의 오프라인 JUnit과 통신 복구를 확인한다.
5. 같은 APK에서 공개 상품 12개를 불러오고 모든 Maestro 검사 뒤 TalkBack 23개 확인 지점을 실행한다.
6. 접근성·통신·화면 유지 설정 복구와 소스·공개 설정·APK 지문을 확인한 뒤 최종 보고서와 자동 커밋을 만든다.

오프라인 첫 실행의 내장 예시와 통신 복구 후 TalkBack의 공개 DB 상품을 구분한다. 이번 실행은 보통 화면 조건에서 접근성을 확인하며 `--readability`와 결합하지 않는다. iOS VoiceOver·스토어 제출·스피커 음성을 사람이 듣는 평가를 수행한 결과로 확대하지 않는다.

## 첫 전체 실행에서 설치가 중단된 기록

실행 `20261116T123224071Z-bca924b0`에서 앱 149개·DB 69개와 검사 도우미를 포함한 코드 검사 387개, 타입·ESLint·Android/iOS/웹 번들 생성이 통과했다. 내장 예시 선택은 211.020초에 JUnit 1개, 기존 Expo Go 전체 놀이는 1,097.558초에 JUnit 1개가 통과했다.

APK 분석에서는 디버그 모드 비활성(`debuggable: false`), 내장 실행 번들(`embeddedBundle: true`), 백업 복원 비활성(`backupDisabled: true`)과 서명을 확인했다. 서명 인증서 SHA-256은 `70ba025819d0651123d4ac907912d497988acc90c344ecc2c5197d11ad451cb9`다. 이것은 APK 파일의 검증 결과이며 설치 완료를 뜻하지 않는다.

새 APK 설치 중 Play Protect 선택 창이 나타나 사용자 선택을 기다렸고 `standalone-install`은 180초 뒤 시간 초과로 실패했다. 이후 현재 사용자 0의 `pm path --user 0` 조회에서 새 패키지 경로가 나오지 않아 설치를 확인하지 못했다. 이 실패 실행에서는 오프라인 첫 실행과 설치형 앱 TalkBack을 실행하지 않았다.

네트워크를 바꾸기 전에 중단됐고 통신 복구 확인은 `verified: true`였다. USB 역방향 전달은 0개, 화면 유지값은 `0 → 7 → 0` 복구를 확인했다. 최종 상태는 실패·`commit: null`이며 기존 자동 보고서를 갱신하지 않았다. 이 실패의 근거는 `.artifacts/device/20261116T123224071Z-bca924b0/summary.json`과 같은 폴더의 원본 로그다. 현재 남아 있는 `c949154`의 Expo Go PASS 보고서를 이번 새 APK의 성공으로 읽지 않는다.

## 사용자 선택 뒤 재개와 늦은 설치 정리

2026-11-17 KST에 사용자가 Play Protect의 **이번에만 전송** 선택을 마치고 나머지 검사·기록·커밋을 요청했다. 2026-11-16 21:32:01.654 UTC / 2026-11-17 06:32:01.654 KST에 현재 Android 사용자 0에서 새 패키지의 단일 `base.apk`를 확인했다. 설치된 파일의 SHA-256은 위 표의 `7881a502…81de7792`와 일치했고 버전 `0.1.0`·코드 `1`, `stopped=true`, `notLaunched=true`도 확인했다.

앞선 실패 요약, 설치 전 `standalone-package-absence-current.log`의 빈 조회 결과, 로컬 APK 지문을 함께 대조한 뒤 이 실행에서 늦게 설치된 정확한 새 패키지만 `pm uninstall --user 0`으로 정리했다. `Success` 응답과 `pm list packages -u --user 0` 재조회에서 부재를 확인했다. 다른 앱은 변경하지 않았고 APK도 다시 빌드하지 않았다. 근거는 `.artifacts/device/20261116T123224071Z-bca924b0/late-install-cleanup.json`에 보존한다.

이 정리는 같은 APK의 실제 첫 실행을 다시 확인하기 위한 준비다. 이전 실패 판정은 유지하며 위의 전체 검사 명령으로 새 설치부터 다시 검증한다. 아직 새 APK의 오프라인·TalkBack 전체 성공이나 새 커밋이 완료된 것으로 기록하지 않는다.

## 두 번째 전체 실행의 오프라인 통과와 TalkBack 준비 실패

실행 `20261116T213305884Z-30d5852d`에서 코드 검사 387개, 내장 예시 선택과 기존 Expo Go 전체 놀이가 통과했다. 새 APK 설치와 파일 지문 일치를 확인했고 실제 오프라인 첫 실행·분류를 포함한 JUnit 1개도 통과했다. 오프라인 구간의 83회 감시에서 인터넷 연결과 USB 역방향 전달은 모두 0개였으며 Wi-Fi 복구 확인도 `verified: true`였다.

이후 TalkBack 준비 단계에서 앱을 여는 명령이 실패했다. `talkback-35-open-app.log`에 `Error: Activity not started, unable to resolve Intent`가 기록됐고, MAIN/LAUNCHER와 패키지 지정(`-p`)으로 앱을 열지 못해 화면 조회에는 TalkBack 설정만 남았다. 실행 표시나 상품 데이터의 오류가 아니라 검사기의 앱 시작 명령 문제이며 TalkBack 확인 지점은 0개였다.

검사기는 실제 APK manifest의 `MainActivity`를 `-n`으로 명시하고 `am start -W`의 완료 응답을 확인하도록 보완했다. `Status: ok`와 정확한 대상 Activity를 요구하며 표준 출력·오류의 `Error`/`Exception`, 다른 앱·잘못된 Activity·상태 누락은 즉시 실패로 처리한다. Expo Go의 VIEW·URL 실행은 유지한다. `-n`의 명시적 컴포넌트와 `-W`의 시작 완료 대기는 [Android ADB 명세](https://developer.android.com/tools/adb#IntentSpec)를 따른다. 기존 22개에 시작 응답 회귀 6개를 추가한 단위·모의 검사 28/28개와 Node 구문·공백 검사가 통과했다. 이 수정의 실기기 결과는 후속 검사에서 확인한다.

재설치 과정의 Play Protect에는 사용자가 앞서 허용한 동일 APK의 **이번에만 전송**을 적용했으며 항상 전송 설정은 바꾸지 않았다. 근거는 이 실행 폴더의 `play-protect-action.json`이다. 실패 뒤 TalkBack 설정과 화면 유지값 0의 복구를 확인했고 이번 실행에서 설치한 정확한 지문의 APK만 자동 정리해 `Success`를 확인했다. 최종 상태는 실패·`commit: null`이며 기존 자동 보고서는 유지했다.

원본은 `.artifacts/device/20261116T213305884Z-30d5852d/`에 보관한다. 앱 소스·공개 설정·서명·SDK 변경 없이 검사기의 시작 명령을 수정하므로 같은 APK를 재사용한다. 다음에는 부분 진단으로 시작 명령과 후속 TalkBack을 먼저 확인한 뒤 전체 검사를 다시 실행한다. 오프라인 단계의 성공을 TalkBack이나 전체 실행 성공으로 확대하지 않는다.

## 부분 진단과 실패 처리

전체 검사에서 문제가 발생했을 때 APK 구간만 살피는 명령이다. 첫 검사는 전체 실행으로 시작했으며 위 두 번째 실패 이후에는 다음 부분 진단으로 수정 사항부터 확인한다.

```bash
node scripts/device/verify.mjs --standalone-only --standalone-apk .artifacts/build/standalone-edc2c57143e6fb27/provenance.json --talkback
```

부분 진단은 전체 코드·온라인 회귀 검사를 대신하지 않으며 공개 전체 보고서나 커밋을 만들지 않는다. 성공해도 이번에 새로 설치한 정확한 APK만 정리해 다음 전체 실행에서 새 설치부터 확인할 수 있게 한다. 오프라인·통신 복구 실패 시 후속 TalkBack을 호출하지 않는다. TalkBack 실패도 기존 `verifyInstalled` 실패 경로로 처리해 설정 복구 뒤 이번 신규 앱의 지문이 일치할 때만 정리한다.

## 시작 명령 수정 뒤 부분 진단 통과

부분 실행 `20261116T220920692Z-527f8f20`의 `summary.json`에서 `scope: standalone-only`, `status: passed`, `commit: null`을 확인했다. 같은 APK를 현재 Android 프로필에 새로 설치해 실제 오프라인 첫 실행을 통과했고 JUnit은 1개, 실패·오류·건너뛰기 0개였다. 네트워크 감시는 82회였고 첫·마지막 오프라인 확인 모두 인터넷 연결과 USB 역방향 전달이 0개였다. Wi-Fi는 원래 값으로 복구했으며 모바일 데이터 복구는 `not-applicable`, 전체 통신 복구 확인은 `true`였다.

이어 설치형 앱 모드(`standalone`), 실행 방식 `android-launcher`, 위 표의 패키지와 빌드 표시가 일치한 상태에서 TalkBack 23개 확인 지점이 순서대로 모두 통과했다. 발화 대조가 필요한 16개도 모두 일치했고 TalkBack 서비스 연결과 실제 `uinput-touch` 입력을 확인했다. 첫 앱 열기는 `Status: ok`·COLD, 복구 뒤 앱 복귀는 `Status: ok`·HOT이었으며 둘 다 정확한 `MainActivity`였다. 정상적인 재사용 경고를 오류로 오인하지 않고 실제 상태와 대상을 확인했다.

TalkBack 설정·발화 표시·관찰 도구·임시 입력 장치 복구는 모두 확인됐고 복구 오류 목록은 비어 있었다. 화면 유지값도 원래 0으로 돌아왔다. 성공한 부분 진단용 신규 앱은 정확한 지문을 대조해 정리했으며 상태는 `removed-own-probe-install`이다. 원본 근거는 `.artifacts/device/20261116T220920692Z-527f8f20/`에 보관한다.

이는 APK 구간의 부분 통과이며 전체 성공 보고서나 커밋을 만들지 않았다. 같은 APK와 앞서 적은 전체 명령으로 코드·기존 놀이·오프라인·TalkBack·복구를 다시 검사한 결과만 최종 전체 근거로 사용한다.

빌드·실기기 원본은 `.artifacts`에 보관하고 비밀번호·서명 키·개인 화면·전체 XML을 커밋하지 않는다. 이 원고는 후속 전체 실행 전에 고정한다. 실제 전체 결과는 이 단계와 함께 커밋하는 [자동 검증 보고서](../verification/latest-android.md)의 검사 시작 HEAD `c949154`, 이번 패키지·빌드 표시·APK 지문·TalkBack 모드·설정 복구로 확인한다. 이전 Expo Go PASS나 새 런타임의 모의 검사만으로 새 APK가 통과했다고 기록하지 않는다.
