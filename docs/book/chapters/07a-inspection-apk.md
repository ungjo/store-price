# 07장 보충. 고정 검사 APK로 전체 놀이 확인하기

작업일: 2026-11-17. 시작 HEAD는 `a6d9bb4`이며 사용자가 GitHub 업로드를 확인했다. 앞 단계에서는 정식 앱과 검사 앱의 설정을 분리하고 설정 자동 검사·Expo Go 회귀를 통과했다. 당시 실행 `20261117T104522208Z-d7b5bd39`의 PASS 보고서는 `a6d9bb4`에 보존한다.

이번 단계는 **꼬마 시장 검사**를 설치형 APK로 빌드하고 현재 SM-X710 / Android 14에서 전체 놀이를 직접 검사한다. 이전 설정 검사만으로 증명하지 못했던 APK의 출처·서명·새 설치·네이티브 실행을 확인하는 과정이다. 이 원고는 최종 전체 검사 전에 고정하며 실제 결과는 같은 커밋의 자동 보고서로 확인한다.

## 고정 검사 앱과 첫 실행 전용 앱을 구분하기

| 항목 | 이번 고정 검사 앱 |
| --- | --- |
| 앱 이름 | 꼬마 시장 검사 |
| Android 패키지 | `com.ungjo.storeprice.inspection` |
| 표시 버전 / Android 코드 | `1.0.0` / `1` |
| EAS 프로필 / 환경 | `inspection` / `preview` |
| 배포 형식 | 내부 검사 APK |
| 빌드 표시 | `inspection-a8c0f5699d49d2cd` |
| 빌드 소스 SHA-256 | `825d9c01df249ae6bd93110a62cc1628c4b0e299384353d3f4610fe521ce0a6a` |
| 업로드 자료 비교 | 전용 복사본 36개 파일의 이름·내용 모두 일치 |
| EAS 빌드 ID | `4bd89386-1016-4e9b-9ad3-75bd28fbcc93` |
| EAS 빌드 생성 | 2026-11-17 12:28:57.752 UTC / 21:28:57.752 KST |
| EAS 빌드 완료 | 2026-11-17 12:53:17.944 UTC / 21:53:17.944 KST, `FINISHED` |
| APK SHA-256 | `fcdf05069a64abbe6afefe4769e3b77a07761d1a983ab0f8e502cfcd74bfdb40` |
| APK 파일 크기 | 67,778,281 bytes |
| 서명 인증서 SHA-256 | `edaa623bf85baefadec02d92e2a40467630d838f20ca6aa1fe9e6594c1c93746` |

패키지는 고정하지만 빌드 표시는 매번 새로 만든다. 같은 앱 이름·버전만 보고 이전 파일을 검사하지 않도록 소스·공개 설정·APK 지문, 앱 안의 빌드 표시를 연결한다. 기존 `preview`의 `com.ungjo.storeprice.offline.b…` 패키지는 오프라인 첫 실행을 위한 일회성 앱이며 이번 고정 앱과 별도다. 기존 `--standalone-apk`가 고정 앱을 거부하는 경계도 유지한다.

현재 Android 프로필에 inspection 패키지가 없으면 새로 설치한다. 이미 있으면 APK SHA-256과 버전이 이번 대상과 정확히 같은 경우에만 `reused-exact`로 기록하고 재사용한다. 다른 파일이면 기존 앱과 자료를 보존하고 중단한다. 검사 성공 뒤 앱을 남기며 실패해도 고정 검사 앱을 자동 삭제하지 않는다. 이는 실패한 신규 nonce 앱을 정리할 수 있는 오프라인 첫 실행 도우미와 다른 규칙이다.

## 필요한 앱 파일만 빌드에 전달하기

`scripts/build/inspection.mjs`는 앱에 필요한 파일만 전용 복사본으로 만들고 공개 상품 연결 설정을 고정한다. 복사본·소스 지문과 EAS 빌드 기록, 다운로드한 APK SHA-256을 대조하고 서명과 앱 식별자도 확인한다. 로컬 `.env.local`이나 비공개 가격 관측·관리자 키·기기 로그를 복사본에 넣지 않는다.

이번 고정 패키지의 Android 서명 키는 EAS에서 새로 생성했다. 정식 `production` AAB를 만들거나 Google Play에 업로드하지 않는다. 이번 inspection 빌드에서 확인한 공개 연결 설정을 production 환경의 검증으로 확대하지 않는다.

EAS 빌드 완료 뒤 `.artifacts/build/inspection-a8c0f5699d49d2cd/app.apk`를 다운로드했다. 설치 전 파일 검사에서 앱 이름·고정 패키지·버전 `1.0.0`·코드 `1`, 디버그 불가·백업 비활성, 내장 JavaScript 번들·빌드 표시·공개 상품 URL과 키의 일치를 확인했다. 값은 문서에 노출하지 않는다. 이 읽기 전용 검사는 APK 파일의 확인이며 실제 태블릿 설치·화면 검사를 대신하지 않는다.

원격 환경 변수 상세 조회는 잠재적인 비밀 값 조회라는 이유로 자동 승인 검토에서 거부됐다. 그 조회를 재시도하지 않고 이미 사용하던 로컬 공개 연결 설정을 복사본에 고정했다. 정상 빌드 명령의 출력에서는 preview 환경의 plain/sensitive 변수가 없다고 표시됐지만, 이를 모든 원격 환경 값의 검증으로 확대하지 않는다. 빌드 상태 조회도 처음에는 앱 경로 밖에서 실패해 저장소의 `apps/mobile` 경로에서 다시 실행했다.

## 빌드와 검사 명령

실제로 진행한 준비·업로드 검사의 Git Bash 표기다. `prepare`는 새 빌드 표시를 생성하므로 기존 빌드를 이어 확인할 때 다시 실행하지 않는다.

```bash
node scripts/build/inspection.mjs prepare
cd .artifacts/build/inspection-a8c0f5699d49d2cd/project
npm ci --no-audit --no-fund
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$(pwd -W)" npx eas-cli@latest build:inspect --platform android --profile inspection --stage archive --output ../archive-inspection
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$(pwd -W)" npx eas-cli@latest build --platform android --profile inspection --message inspection-a8c0f5699d49d2cd --no-wait
```

앱 복사본에서 저장소의 `apps/mobile`로 이동해 완료 기록을 저장하고, 저장소 루트에서 다운로드·설치 전 파일 검사를 실행했다. `inspect.mjs`는 이번 실행만을 위한 Git 제외 스크립트이며, 전체 검사도 같은 `captureInspectionApk` API로 APK 검증을 다시 수행한다.

```bash
cd ../../../../apps/mobile
npx eas-cli@latest build:view 4bd89386-1016-4e9b-9ad3-75bd28fbcc93 --json > ../../.artifacts/build/inspection-a8c0f5699d49d2cd/build.json
cd ../..
node scripts/build/inspection.mjs download .artifacts/build/inspection-a8c0f5699d49d2cd
node .artifacts/build/inspection-a8c0f5699d49d2cd/inspect.mjs
```

아래는 문서를 고정한 뒤 실행하는 전체 검사 명령이다. 설치·놀이·복구·커밋 결과는 같은 커밋의 자동 보고서에서 확인한다.

```bash
node scripts/device/verify.mjs --inspection-apk .artifacts/build/inspection-a8c0f5699d49d2cd/provenance.json --message "test: 고정 검사 APK의 태블릿 설치와 전체 놀이 검증"
```

## 검사 대상과 순서

기기 준비 점검 `20261117T121942989Z-fdbe61d7`에서 연결 상태를 확인했다. 준비 점검은 이번 APK의 설치·놀이 검사를 통과한 근거가 아니다.

1. 코드·설정·공개 상품 HTTP와 빌드 출처를 검사한다.
2. 개발용 대기 응답 시나리오에서 예시 선택·취소 뒤 늦은 응답 처리는 Expo Go로 별도 확인한다.
3. 고정 inspection 패키지가 없으면 새로 설치하고, 정확히 같은 APK·버전이 이미 있으면 재사용으로 구분한다. 설치 파일과 빌드 표시가 검증한 대상과 일치해야 진행한다.
4. 새 APK에서 Supabase 공개 상품의 분류, 장바구니·수량·예산·지불 선택·거스름돈 퀴즈·영수증·새 놀이 전체 흐름을 직접 검사한다.
5. 임시 화면 유지 설정을 복구하고 소스·공개 설정·APK 지문 및 실제 검사 결과를 확인한 뒤에만 보고서와 자동 커밋을 만든다.

일반 놀이 검사를 Expo Go의 이전 번들로 대신하지 않는다. 반대로 개발용 지연 응답 시나리오를 검사 APK의 일반 동작이라고 기록하지도 않는다. 이번에는 인터넷을 끄거나 TalkBack을 켜지 않으며, 과거의 오프라인·접근성 성공은 해당 커밋의 기록으로 보존한다.

## 실제 결과를 확인할 근거

빌드 전 inspection 빌드 도우미 24개·기기 도우미 15개, 기존 관련 회귀 39개의 단위·모의 검사가 통과했다. 영향받는 Maestro 파일 2개의 구문과 타입·ESLint 검사도 통과했다. 이는 준비 단계의 PC 검사이며 새 APK의 실제 설치·놀이 성공과 구분한다.

### 첫 전체 실행: Play Protect 선택 대기로 중단

실행 `20261117T125951224Z-50b19551`에서는 코드 검사 451개와 타입·ESLint·번들 내보내기·공개 상품 REST GET이 통과했다. Expo Go의 예시 선택 검사도 JUnit 1건, 실패 0건, 205.376초로 통과했다. 이후 설치 단계에서 **꼬마 시장 검사**의 Play Protect 전송 선택 창이 표시됐고, 사용자 선택을 기다리던 설치 명령이 180초 제한을 넘어 종료 코드 1로 끝났다.

로컬 `summary.json`의 최종 상태는 `failed`, 커밋은 `null`이다. APK 설치는 `failed-or-unconfirmed`이며 설치 지문 확인과 APK 전체 놀이 검사는 실행하지 못했다. 고정 앱을 자동 삭제하지 않는 원칙에 따라 `installationCleanup: preserved`로 기록했고 네트워크 설정도 변경하지 않았다. 설치 대기를 앱 성공으로 처리하거나 통과한 앞부분만으로 커밋하지 않은 것이다. 사용자의 Play Protect 선택 뒤 설치 상태·지문을 다시 확인하고 전체 검사를 재실행한다. 원본 근거는 `.artifacts/device/20261117T125951224Z-50b19551`에 보관하며, 이 실패를 새 APK의 성공으로 기록하지 않는다.

### 두 번째 전체 실행: 설치 정보 파서 범위 수정

사용자가 Play Protect의 **이번에만 전송** 선택을 완료한 뒤, 별도 읽기 전용 점검에서 설치된 APK의 SHA-256과 버전 `1.0.0`·코드 `1`이 이번 파일과 일치함을 확인했다. 재실행 `20261117T140059690Z-46b0c8fb`도 코드 검사 451개·타입·ESLint·번들·공개 상품 HTTP·Expo Go 예시 선택 검사를 통과했다. 그러나 기존 설치 정보를 읽는 검사기가 `Packages` 이외 진단 구역인 실제 기기의 `Queries`에 있는 동명 `User 0` 행까지 중복 설치 정보로 해석해 중단했다. APK 놀이가 실패한 것이 아니라 시작 전 검사기의 출력 해석 문제였다.

이 실행의 `summary.json`은 `failed`, `commit: null`, `verifyInstalledStatus: not-run`이며 기존 앱을 보존했다. 사전 읽기 점검과 달리 전체 검사 안의 설치 검증 단계는 완료되지 않아 `installedHashVerified`도 `false`로 남았다. 네트워크 설정은 바꾸지 않았고 화면 유지 값은 `0 → 7 → 0`으로 복구했다. 원본 근거는 `.artifacts/device/20261117T140059690Z-46b0c8fb`에 보관한다.

파서는 유일한 `Packages` 구역의 정확한 대상 `Package` 블록만 읽도록 수정했다. 다른 `Queries`·`Dexopt` 구역의 반복 행은 제외하고 실제 대상 블록의 모호한 중복은 계속 거부한다. 저장한 실기기 출력으로 추가한 회귀 검사가 수정 전 실패하고 수정 후 통과했으며, 기존 15개와 새 4개를 합한 기기 도우미 검사 **19개가 통과**했다. 저장된 전체 로그의 순수 파서 점검에서도 버전 `1.0.0`·코드 `1`·`installed: true`를 확인했으며 기기 설정은 변경하지 않았다. 이 사전 검증은 후속 전체 실행의 성공을 뜻하지 않는다.

빌드·기기 자료는 `.artifacts`에 보관하고 개인 화면·전체 XML·서명 키를 Git에 넣지 않는다. 최종 결과는 이 장과 같은 커밋의 [자동 검증 보고서](../verification/latest-android.md)에서 검사 시작 HEAD `a6d9bb4`, inspection 패키지·빌드 표시·APK 지문, 새 APK의 전체 놀이 결과와 설정 복구를 확인한다. 앞 단계의 설정·Expo Go PASS는 이번 새 APK의 성공 근거가 아니다.
