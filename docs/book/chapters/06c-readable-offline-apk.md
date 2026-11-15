# 06장 보충. 화면 개선을 새 APK에 담아 오프라인과 키보드 검사하기

작업일: 2026-11-16. 시작 HEAD는 `e15dac6498647b469b0bf1d4e01a0da93f3c04de`이며 사용자가 GitHub 업로드를 확인했다. 이 커밋에서 큰 글자·좁은 화면·키보드 개선과 Expo Go 전체 검사를 완료했다. 당시 실행 `20261115T161955875Z-724b31ea`의 PASS 보고서는 `e15dac6`에 보존한다. 이번에는 같은 화면을 새 설치형 APK로 만들어 인터넷 없는 첫 실행과 설치형 앱의 화면 사용성을 구분해 검증한다.

## 앱과 검사 대상을 구분하기

새 표시명은 **꼬마 시장 화면 검사**다. 앱 설정의 이름·설명만 바꾸고 `e15dac6`의 화면과 계산 코드는 유지한다. 기존 **꼬마 시장 검사**와 **꼬마 시장 검사 12**는 그대로 보존한다. 홈 화면 이름과 별도로 고유 패키지·빌드 표시·APK 지문을 확인해 이번 앱을 검사한다. [Expo의 앱 표시명 설정](https://docs.expo.dev/versions/v58.0.0/config/app/) · [여러 앱을 함께 설치하는 식별자](https://docs.expo.dev/build-reference/variants/)

오프라인 첫 실행은 내장 예시 12개를 대상으로 한다. 통신 복구 뒤의 큰 글자·좁은 화면·키보드 검사는 같은 APK가 Supabase에서 읽어 온 공개 상품 12개를 대상으로 한다. 두 단계의 상품 출처와 연결 조건을 같은 검사로 혼동하지 않는다. DB·가격·공개 권한 변경이나 스토어 제출은 이번 범위에 포함하지 않는다.

## 빌드 입력과 제출 기록

| 항목 | 확인한 값 |
| --- | --- |
| 시작 HEAD | `e15dac6` |
| 앱 표시명 | 꼬마 시장 화면 검사 |
| 빌드 표시 | `standalone-cf5eaac5f72fa3f0` |
| Android 패키지 | `com.ungjo.storeprice.offline.bcf5eaac5f72fa3f0` |
| 빌드 소스 SHA-256 | `bbf8c20d3aa30b41c6e9056c0e599447de5f038d64070823376fbecac42b5044` |
| EAS 빌드 ID | `e5076f0b-a8ec-437a-9559-a13f3c764b14` |
| 빌드 제출 | 2026-11-15 16:56:52.8 UTC / 2026-11-16 01:56:52.8 KST |
| 빌드 완료 | FINISHED, 2026-11-15 17:04:40.431 UTC / 2026-11-16 02:04:40.431 KST |
| APK 다운로드 | 2026-11-15 17:05:46.423 UTC / 2026-11-16 02:05:46.423 KST |
| APK 크기 | 67,774,361바이트 |
| APK SHA-256 | `3b0abb51a07b752b19326edb6165be526650b015a41372cae3d9f5982bd5bb08` |
| 새 설치·실기기 결과 | 검사 시작 HEAD `e15dac6`인 자동 보고서로 확인 |

기존 Expo 계정의 로그인을 `whoami`로 확인하고 연결된 EAS 프로젝트를 사용했다. 전용 복사본에서 의존성 741개 설치가 약 20초에 완료됐다. 업로드 검사 결과 34개 파일의 목록·내용이 복사본과 정확히 일치했으며 `archive-check.json`의 확인 시각은 2026-11-15 16:56:08.830 UTC다. preview 환경에는 별도로 등록된 원격 환경 변수가 없었다. 이번 새 패키지의 서명 키는 EAS 클라우드에서 생성했다.

빌드에는 전용 앱 복사본만 올린다. 공개 상품 설정과 이번 빌드 표시를 고정하며 비공개 관측 자료·관리자 키·실기기 로그·기존 APK를 포함하지 않는다. 개발용 실제 가격 미리보기와 지연 응답 검사 설정도 끈다. 복사본·업로드 내용의 비교는 저장소 전체가 잘못 올라가지 않았는지 확인하는 단계다. [Expo 업로드 과정](https://docs.expo.dev/build-reference/project-upload/)

## 실행 명령

다음은 실행한 준비·제출 작업의 Git Bash 표기다. Windows에서 실행한 환경 변수 설정은 Git Bash 문법으로 옮겼다.

```bash
cd apps/mobile
npx eas-cli@latest whoami
cd ../..
node scripts/build/standalone.mjs prepare
cd .artifacts/build/standalone-cf5eaac5f72fa3f0/project
npm ci --no-audit --no-fund
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$(pwd -W)" npx eas-cli@latest build:inspect --platform android --profile preview --stage archive --output ../archive-inspection
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$(pwd -W)" npx eas-cli@latest build --platform android --profile preview --message standalone-cf5eaac5f72fa3f0 --no-wait
```

`prepare`를 다시 실행하면 새로운 빌드 표시와 폴더를 만든다. 이번 빌드 진행 상황은 위 전용 복사본에서 다음 명령으로 조회했고, FINISHED 상태와 빌드 기록을 확인한 뒤 다운로드를 완료했다.

```bash
npx eas-cli@latest build:view e5076f0b-a8ec-437a-9559-a13f3c764b14 --json > ../build.json
cd ../../../..
node scripts/build/standalone.mjs download .artifacts/build/standalone-cf5eaac5f72fa3f0
```

다운로드한 APK의 출처·서명·포함된 설정을 확인한 다음, 저장소 루트에서 다음 전체 검사를 실행한다. 이 명령을 적었다는 사실만으로 실행·성공을 뜻하지 않는다.

```bash
node scripts/device/verify.mjs --standalone-apk .artifacts/build/standalone-cf5eaac5f72fa3f0/provenance.json --readability --message "test: 화면 개선 APK의 오프라인·키보드 검증"
```

## 오프라인 첫 실행과 후속 화면 검사의 순서

1. 코드·DB·공개 HTTP 검사, 조회 중 내장 예시 선택, Expo Go의 기존 전체 놀이를 확인한다.
2. 이번 실행에서 만든 개발 서버와 USB 전달 연결만 정리한다. 기존 전달 연결이 남아 있으면 독립 APK 검사를 중단한다.
3. 현재 Android 프로필에 새 패키지가 없는지 확인하고 기존 앱을 교체하지 않는 방식으로 설치한다. 설치된 APK 지문과 아직 실행되지 않은 상태를 확인한다.
4. 원래 통신 설정을 기록한 뒤 Wi-Fi·모바일 데이터를 끈다. 실제 인터넷 경로가 없음을 확인하고 새 APK를 처음 열어 내장 예시 12개·분류·장바구니·계산·영수증·재실행을 검사한다. 오프라인 상태는 실행 중에도 감시한다.
5. 오프라인 JUnit과 통신 설정 복구가 모두 성공하면 같은 설치형 APK에서 공개 상품을 불러와 아래 세 화면 조건을 검사한다. 이 단계는 Expo Go가 아닌 이번 APK의 패키지와 빌드 표시를 대상으로 한다.
6. 글자 배율·밀도·화면 유지 설정을 복구하고 소스·APK·설정 지문까지 확인한 뒤에만 최종 보고서와 자동 커밋을 만든다.

| APK 화면 조건 | 글자 배율 | 화면 밀도 | 이 갤럭시의 환산 폭 |
| --- | --- | --- | --- |
| 기본 | 1.0 | 560 | 약 411dp |
| 큰 글자 | 1.5 | 560 | 약 411dp |
| 좁은 화면과 큰 글자 | 1.5 | 720 | 320dp |

물리 해상도 1440×3120은 그대로 둔다. 각 조건에서 다섯 자리 답 입력·오답 수정·한 번의 터치로 채점·영수증·새 놀이를 확인하고, 두 입력 시점에 실제 키보드와 입력칸·확인 버튼 전체 영역을 측정한다. 검사 보고서에는 대상 패키지와 실행 표시도 남겨 Expo Go 결과와 구분한다.

## 후속 검사 실패와 부분 진단

설치형 검사 도우미의 `verifyInstalled`는 오프라인 첫 실행과 통신 복구가 모두 통과한 뒤 호출한다. 호출 전후 APK 지문이 같아야 하고 후속 검사에 실패하면 이번에 새로 설치한 정확한 지문의 앱만 기존 정리 절차로 제거한다. 기존 앱이나 검사 도중 달라진 앱은 제거하지 않는다. 후속 검사 상태는 요청 없음·미실행·통과·실패로 구분한다.

APK 단계만 먼저 진단하려면 다음 옵션을 함께 사용한다.

```bash
node scripts/device/verify.mjs --standalone-only --readability --standalone-apk .artifacts/build/standalone-cf5eaac5f72fa3f0/provenance.json
```

부분 진단은 전체 코드·Expo Go 회귀 검사를 대신하지 않고 공개 전체 보고서나 커밋을 만들지 않는다. 후속 화면 검사까지 성공한 경우에도 이번에 새로 설치한 진단 앱을 정리해 이후 전체 검사에서 새로 설치할 수 있게 한다. 실패 시 통신·화면 복구 확인과 정확한 앱만 정리하는 조건은 유지한다.

## 전체 실행에서 설치가 멈춘 기록

전체 실행 `20261115T170741489Z-54b056d3`에서 PC 검사 312개·타입·ESLint·Android/iOS/웹 번들·공개 HTTP 검사가 통과했다. 내장 예시 선택과 Expo Go 전체 놀이도 각각 JUnit 1개가 통과했고 실패·오류·건너뛰기는 모두 0이었다.

새 APK를 설치하는 단계에서는 Play Protect 선택 창(`com.android.vending`의 `PlayProtectDialogsActivity`)이 표시돼 사용자 선택을 기다렸다. `standalone-install`은 180,140ms 뒤 시간 초과로 중단됐다. 종료 뒤 현재 Android 프로필의 `pm path --user 0` 조회는 빈 값이었으며, 이번 APK가 설치됐다는 근거를 확보하지 못했다. 원본 기록에는 `installedFresh: false`, `offlineChecks: 0`, `firstLaunchOffline: false`, `verifyInstalledStatus: not-run`이 남았다. 따라서 새 APK의 오프라인 첫 실행이나 후속 화면 검사가 성공한 결과가 아니다.

이 실행은 Wi-Fi·모바일 데이터를 바꾸기 전에 끝났다. 원래 Wi-Fi·데이터 켜짐과 비행기 모드 꺼짐을 유지했고 통신 복구 확인은 변경 불필요·확인 완료로 기록했다. 화면 유지값은 `0 → 7 → 0` 복구를 확인했으며 글자 배율·밀도는 바꾸지 않았다. 최종 상태는 실패, `commit: null`이고 기존 자동 보고서는 변경하지 않았다.

원본은 `.artifacts/device/20261115T170741489Z-54b056d3/`에 보관한다. 이 실행은 사용자에게 필요한 Play Protect 선택을 기다리다 종료됐으며, 선택을 마친 뒤 실제 설치 상태를 다시 확인했다.

## 사용자 선택 뒤 늦게 설치된 검사 앱 정리

사용자가 Play Protect의 **이번에만 전송**을 선택했다고 알린 뒤 새 패키지가 설치된 것을 확인했다. 2026-11-15 17:53:04.125 UTC / 2026-11-16 02:53:04.125 KST에 현재 Android 사용자 `0`에서 설치된 파일의 SHA-256이 위 표의 APK 지문과 일치하고 `notLaunched=true`, `stopped=true`인 것을 확인했다. 이전 실행의 설치 전 패키지 부재, 설치 시간 초과, 로컬 APK 지문도 함께 대조했다. 이전 실행의 실패 판정은 그대로 유지한다.

같은 앱의 실제 첫 실행을 다시 검사할 수 있도록 이번 실행에서 늦게 설치된 전용 패키지만 `pm uninstall --user 0`으로 정리했다. `Success` 응답과 `pm list packages -u --user 0` 재조회에서 부재를 확인했다. 기존 앱은 변경하지 않았고 APK를 다시 빌드하지 않았다. 근거는 해당 실행 폴더의 `late-install-cleanup.json`에 남겼다.

이 준비는 새 APK의 오프라인·키보드 검사를 통과했다는 뜻이 아니다. 같은 APK와 앞서 적은 전체 검사 명령으로 새 설치부터 다시 진행하고 최종 결과는 자동 보고서로 확인한다.

## 확인한 내용과 최종 결과의 구분

키보드 영역 도우미 10개와 설치형 앱 도우미 29개의 모의 검사가 통과했다. 설치형 도우미는 통신 복구 뒤 호출 순서, 후속 검사 실패·APK 변조 시 정리, 오프라인·복구 실패 시 미호출, 진단 성공 후 제거를 확인했다. 이는 PC 검사이며 새 APK의 실제 설치·오프라인·키보드 성공을 뜻하지 않는다.

빌드와 APK 다운로드를 완료했다. 이 장의 준비 사실과 검사 설계는 새 설치·최종 전체 실기기 실행 전에 고정한다. 최종 상태는 [자동 검증 보고서](../verification/latest-android.md)의 검사 시작 HEAD `e15dac6`, 이번 빌드 표시, APK 지문, 후속 화면 검사 대상으로 확인한다. `e15dac6`에 포함된 이전 Expo Go 성공 보고서를 새 APK의 성공 근거로 사용하지 않는다. GitHub push·태그, iPhone·스토어 제출용 AAB/IPA 검증은 별도 단계다. [APK 빌드 안내](https://docs.expo.dev/build-reference/apk/)
