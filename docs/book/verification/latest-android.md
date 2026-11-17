# Android 실기기 자동 검증 기록

- 실행 시각: 2026-11-17 23:37:04 (Asia/Seoul)
- 결과: **PASS**
- 실행 ID: `20261117T141319521Z-de579384`
- 기기: SM-X710 / Android 14
- 검사 시작 HEAD: `a6d9bb48fb4d440cbf5689a78a8ad959a0086cba`
- 검사 소스 SHA-256: `fe1fe702ac691f90cb5d5021f9012746baa879daa9bcf7fe085e30e23c139c09`
- 검사 설정 SHA-256: `f6e2d09f0fd1ba3294a79f473219297affc5854057c2da6a87abdd4318a6ea94` (설정 값은 기록하지 않음)
- 공개 상품 SHA-256: `d8c79583dff9fc97e15e342b9834c7627c73020d07c54418e31af7a25f16536b` (실행 전후 일치)
- 예시 선택 별도 실행 ID: `20261117T141319521Z-de579384-loading` (개발 검사 요청, 실제 통신 장애를 발생시키지 않음)
- 도구: Maestro 2.12.1 / JDK 21 / USB 실기기 / Expo Go / 설치형 APK
- 커밋 모드: 검사한 소스가 유지된 경우에만 자동 커밋. 실제 커밋 ID는 실행 요약 또는 git log에서 확인.

## 실행한 명령

```bash
adb -s <선택한 실기기> shell settings get global stay_on_while_plugged_in
adb -s <선택한 실기기> shell settings put global stay_on_while_plugged_in 7
adb -s <선택한 실기기> shell settings get global stay_on_while_plugged_in
maestro check-syntax apps/mobile/.maestro/payment.yaml
maestro check-syntax apps/mobile/.maestro/solve-quiz.yaml
maestro check-syntax apps/mobile/.maestro/receipt.yaml
maestro check-syntax apps/mobile/.maestro/catalog-loading-choice.yaml
maestro check-syntax apps/mobile/.maestro/catalog-categories.yaml
maestro check-syntax apps/mobile/.maestro/standalone-offline.yaml
node --test scripts/device/git-guard.test.mjs
node --experimental-strip-types --test scripts/device/catalog-http-check.test.mjs
node --test scripts/device/private-price-preview.test.mjs
node --test scripts/build/standalone.test.mjs
node --test scripts/build/app-config.test.mjs
node --test scripts/build/inspection.test.mjs
node --test scripts/device/inspection-device.test.mjs
node --test scripts/device/standalone-device.test.mjs
node --test scripts/device/display-settings.test.mjs
node --test scripts/device/keyboard-layout.test.mjs
node --test scripts/device/talkback-observer.test.mjs
node --test scripts/device/talkback-device.test.mjs
node --test scripts/device/talkback-speech-ocr.test.mjs
maestro check-syntax apps/mobile/.maestro/readability-open.yaml
maestro check-syntax apps/mobile/.maestro/readability-correct.yaml
maestro check-syntax apps/mobile/.maestro/readability-finish.yaml
npm --prefix scripts/database test
cd apps/mobile
npm test
npm run typecheck
npm run lint
npm run export:check
EXPO_PUBLIC_DEVICE_RUN_ID=<실행 ID>-loading EXPO_PUBLIC_CATALOG_TEST_SCENARIO=pending-choice node node_modules/expo/bin/cli start --localhost --port 8091 --clear
# 예시 선택 검사 후 직접 시작한 서버와 USB reverse를 종료하고, 설치한 APK에서 전체 놀이 검사
cd ../..
adb -s <선택한 실기기> reverse --list
adb -s <선택한 실기기> reverse --no-rebind tcp:8091 tcp:8091
adb -s <선택한 실기기> shell input keyevent 224
maestro --device <선택한 실기기> test -e EXPO_URL=exp://127.0.0.1:8091 -e RUN_ID=<실행 ID>-loading --format junit --output <검사폴더>/loading-result.xml --test-output-dir <검사폴더>/maestro-loading --debug-output <검사폴더>/maestro-loading apps/mobile/.maestro/catalog-loading-choice.yaml
# 이미 설치한 검사 APK의 해시·버전이 이번 빌드와 정확히 같은지 검증해 재사용
maestro --device <선택한 실기기> test -e APP_ID=com.ungjo.storeprice.inspection -e TARGET_MODE=inspection -e RUN_ID=<APK 빌드 확인 번호> -e PRIVATE_PREVIEW_ENABLED=0 --format junit --output <검사폴더>/result.xml --test-output-dir <검사폴더>/maestro --debug-output <검사폴더>/maestro apps/mobile/.maestro/payment.yaml
adb -s <선택한 실기기> shell settings put global stay_on_while_plugged_in 0
adb -s <선택한 실기기> shell settings get global stay_on_while_plugged_in
```

Windows에서는 npm CLI와 Maestro 배치 파일을 Node에서 호출했다. 위 명령의 실기기 식별자와 실행 폴더는 개인정보 보호를 위해 치환했다.

## 임시 화면 유지 설정

- 검사 전 값: 0. 적용 상태: applied.
- 원래 값이 7이면 설정을 변경하지 않았다. 다른 값이면 충전 중 화면이 꺼지지 않도록 검사 동안만 7을 사용한다.
- 성공 기록 전에 현재 값이 여전히 7일 때만 원래 값을 복구한다. 중간에 바뀐 값은 보존한다.
- 복구 상태: restored. 복구 뒤 값: 0.
- 임시 설정의 복구를 확인하지 못하면 성공 보고서와 자동 커밋을 만들지 않는다. 원본 summary.json에 실제 복구 결과와 실행한 명령의 종료 코드를 남긴다.

## 고정 검사 APK

- 앱: 꼬마 시장 검사 / 앱 ID: `com.ungjo.storeprice.inspection`
- 버전: `1.0.0` / 코드 `1`
- 빌드 ID: `4bd89386-1016-4e9b-9ad3-75bd28fbcc93` / 빌드 확인 번호: `inspection-a8c0f5699d49d2cd`
- APK SHA-256: `fcdf05069a64abbe6afefe4769e3b77a07761d1a983ab0f8e502cfcd74bfdb40` (원본과 실제 설치 파일을 검사 전후 대조)
- 빌드 소스 SHA-256: `825d9c01df249ae6bd93110a62cc1628c4b0e299384353d3f4610fe521ce0a6a`
- 서명 인증서 SHA-256: `edaa623bf85baefadec02d92e2a40467630d838f20ca6aa1fe9e6594c1c93746`
- 설치: `reused-exact` / 현재 Android 사용자에 한정. 기존 다른 앱과 데이터를 보존했다.
- 디버그 모드 비활성·백업 복원 비활성·내장 번들·고정 공개 상품 설정·빌드 표시를 검증했다.
- 개발 서버를 종료한 뒤 설치한 동일 APK에서 전체 놀이를 검사했다. 성공한 검사 앱은 기기에 남겼다.
- Wi-Fi·모바일 데이터를 변경하지 않았으며 오프라인 첫 실행·TalkBack 검증을 주장하지 않는다.

## 확인한 항목

- PGlite의 메모리 PostgreSQL에서 상품·가격 이력 제약, 예시 데이터, 수동 가격 관측의 비공개 조건, 공개 카탈로그와 역할별 읽기·쓰기 권한을 검사했다.
- 실제 가격 입력 검증과 저장 SQL 생성은 자체 작성한 테스트 자료로 검사했다. 원격 비공개 적재 결과는 이번 개발 장의 별도 조회 기록을 따른다.
- 공개 키 REST GET으로 예시 상품 12개의 이름·단위·가격·분류와 비공개 스키마·승인 메모 읽기 차단을 실행 전후 확인했다. 이 HTTP 검사는 쓰기·관리자 API를 호출하지 않았다.
- 앱 검사·번들·Expo 서버에는 같은 설정을 전달하고 EXPO_NO_DOTENV=1로 고정했다. 환경 파일과 선택한 프로세스 설정의 변경도 검사했다.
- 별도 개발 검사에서 상품 로딩 중 예시 놀이를 선택하고, 취소를 무시한 늦은 성공이 와도 예시 출처가 유지되는지 확인했다.
- 예시 사과 1개·1,500원으로 10,000원 지불·8,500원 정답·영수증·다시 장보기를 확인했다. 다시 장보기에서 상품 요청 수가 늘지 않는다.
- 휴대전화 Wi-Fi·모바일 데이터는 바꾸지 않았다. 실제 오프라인 연결이나 인터넷 없는 Expo Go 첫 실행을 검증한 결과는 아니다.
- 대기 요청 시나리오는 Expo Go에서만 검사했고, 전체 놀이는 대기 설정 없는 설치형 검사 APK에서 실제 공개 상품으로 확인했다.
- 실제 앱의 Supabase 출처·상품 12개 로딩을 이번 검사에서 처음 연 화면·다시 장보기·재실행에서 확인했다. 외부 상품의 일시적 변경을 연속 감시하는 검사는 아니다.
- 원격 목록과 내장 예시에서 전체 12개·과일/채소 6개·유제품/달걀 4개·빵/간식 2개의 분류와 선택 상태를 확인했다.
- 분류를 바꿔 화면에서 숨겨진 상품도 장바구니에 남고, 선택한 돈과 퀴즈 정답이 유지되는지 확인했다.
- 추가 상품의 합계·거스름돈·영수증과 다시 장보기에서 전체 분류로 돌아오는 흐름을 두 출처에서 확인했다.
- 이번 빌드의 화면 표시와 설치 APK 해시를 확인해 다른 번들을 검사하지 않도록 했다.
- 장바구니 담기·합계·수량 감소·9개 상한·품목 삭제·전체 비우기.
- 놀이돈 예산 안·딱 맞음·초과와 예산 안으로 복귀.
- 지불할 돈 단일 선택·부족액·선택 취소·상품 변경 시 선택 초기화.
- 빈 장바구니와 예산 초과의 선택 차단·재실행 시 초기화.
- 받을 거스름돈과 계산식: 5,500원에 10,000원은 4,500원, 정확히 낸 금액은 0원.
- 1,000원에 5,000원을 고르면 거스름돈 4,000원이며 예산 잔액 9,000원은 유지된다.
- 부족한 돈으로 교체·선택 취소·상품 변경·비우기·재실행 시 이전 거스름돈이 사라진다.
- 거스름돈 퀴즈: 빈 답과 0원 구분, 오답 수정·정답 확인·다시 풀기·입력 잠금.
- 정답 전 계산 결과와 예산 잔액을 숨기고, 맞힌 뒤 계산식과 잔액을 공개한다.
- 상품·낼 돈 변경은 퀴즈를 초기화하며 같은 선택과 수량 상한의 무변화는 풀이를 유지한다.
- 정답 전 계산 완료 차단, 영수증 상품별 가격·수량·합계·지불액·거스름돈·잔액을 확인한다.
- 0원 거스름돈도 완료하며, 다시 장보기와 영수증 상태의 재실행으로 새 놀이를 시작한다.

## 결과

- maestro-syntax-main: 종료 코드 0
- maestro-syntax-quiz: 종료 코드 0
- maestro-syntax-receipt: 종료 코드 0
- maestro-syntax-preview: 종료 코드 0
- maestro-syntax-loading: 종료 코드 0
- maestro-syntax-categories: 종료 코드 0
- maestro-syntax-standalone: 종료 코드 0
- maestro-syntax-readability-open: 종료 코드 0
- maestro-syntax-readability-correct: 종료 코드 0
- maestro-syntax-readability-finish: 종료 코드 0
- git-guard-tests: 종료 코드 0
- catalog-http-check-tests: 종료 코드 0
- private-preview-tests: 종료 코드 0
- build-helpers: 종료 코드 0
- app-config-tests: 종료 코드 0
- inspection-build-helpers: 종료 코드 0
- inspection-device-helpers: 종료 코드 0
- standalone-device-helpers: 종료 코드 0
- display-settings-helpers: 종료 코드 0
- keyboard-layout-helpers: 종료 코드 0
- talkback-observer-tests: 종료 코드 0
- talkback-speech-ocr-tests: 종료 코드 0
- talkback-device-helpers: 종료 코드 0
- database-tests: 종료 코드 0
- unit-tests: 종료 코드 0
- typecheck: 종료 코드 0
- lint: 종료 코드 0
- export: 종료 코드 0
- catalog-http-before: 종료 코드 0
- maestro-loading-choice: 종료 코드 0
- maestro-flow: 종료 코드 0
- inspection-installed: 종료 코드 0
- catalog-http-after: 종료 코드 0
- screen-awake-restore: 종료 코드 0
- screen-awake-restored-check: 종료 코드 0
- JUnit: 1 testcase, 실패 0, 오류 0, 건너뜀 0
- 예시 선택 JUnit: 1 testcase, 실패 0, 오류 0, 건너뜀 0

원본 로그·스크린샷·JUnit·실행 요약은 `.artifacts/device/20261117T141319521Z-de579384/`에만 보관하며 Git에 올리지 않는다. 기기 일련번호와 화면 XML은 이 보고서에 포함하지 않는다.

이 기록은 해당 Android 실기기·검사 시점의 결과다. 설치형 APK는 위에 기록한 빌드만 검증했다. Google Play 제출용 AAB 및 실제 이마트 가격의 앱 공개 표시는 검증하지 않았다. 앱은 공개 예시 상품 12개로 검사한다.
