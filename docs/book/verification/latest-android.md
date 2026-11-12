# Android 실기기 자동 검증 기록

- 실행 시각: 2026-11-12 20:28:47 (Asia/Seoul)
- 결과: **PASS**
- 실행 ID: `20261112T111453012Z-9438b0a5`
- 기기: SM-S948N / Android 17
- 검사 시작 HEAD: `0184ef964d0a18450a1720f2345868b8396e0616`
- 검사 소스 SHA-256: `dba421c8ca19a8770ce2bf9e8b10dbc676620c2aa82364d22d2c94e949f72dfa`
- 검사 설정 SHA-256: `f6e2d09f0fd1ba3294a79f473219297affc5854057c2da6a87abdd4318a6ea94` (설정 값은 기록하지 않음)
- 공개 상품 SHA-256: `15037ca24b02eaa24b76cb771590319edb76c5bc047e537448ac3cbba3533169` (실행 전후 일치)
- 개발용 실제 가격 미리보기: 3개, DB 조회 시각 `2026-11-12T10:56:24.568Z`
- 미리보기 원본 SHA-256: `bc241485dae11b09a575a93cbae85c0f8a2aa88f50668f708ec0aa7485f0e1a3` (실행 전후 일치)
- 미리보기 응답 SHA-256: `dfae66d0e3bfb0bf501b78b72af5c6302eca70e215e30d94ff145d2180cc99b9` (이번 실행 세션)
- 배포 산출물 검사: 6개 파일, 실제 상품 식별자·이름·임시 토큰 없음
- 도구: Maestro 2.12.1 / JDK 21 / USB 실기기 / Expo Go
- 커밋 모드: 검사한 소스가 유지된 경우에만 자동 커밋. 실제 커밋 ID는 실행 요약 또는 git log에서 확인.

## 실행한 명령

```bash
adb -s <선택한 실기기> shell settings get global stay_on_while_plugged_in
adb -s <선택한 실기기> shell settings put global stay_on_while_plugged_in 7
adb -s <선택한 실기기> shell settings get global stay_on_while_plugged_in
maestro check-syntax apps/mobile/.maestro/payment.yaml
maestro check-syntax apps/mobile/.maestro/solve-quiz.yaml
maestro check-syntax apps/mobile/.maestro/receipt.yaml
node --test scripts/device/git-guard.test.mjs
node --experimental-strip-types --test scripts/device/catalog-http-check.test.mjs
node --test scripts/device/private-price-preview.test.mjs
npm --prefix scripts/database test
cd apps/mobile
npm test
npm run typecheck
npm run lint
npm run export:check
EXPO_PUBLIC_DEVICE_RUN_ID=<실행 ID> node node_modules/expo/bin/cli start --localhost --port 8091 --clear
cd ../..
adb -s <선택한 실기기> reverse --list
adb -s <선택한 실기기> reverse --no-rebind tcp:8091 tcp:8091
adb -s <선택한 실기기> shell input keyevent 224
maestro --device <선택한 실기기> test -e EXPO_URL=exp://127.0.0.1:8091 -e RUN_ID=<실행 ID> --format junit --output <검사폴더>/result.xml --test-output-dir <검사폴더>/maestro --debug-output <검사폴더>/maestro apps/mobile/.maestro/payment.yaml
```

Windows에서는 npm CLI와 Maestro 배치 파일을 Node에서 호출했다. 위 명령의 실기기 식별자와 실행 폴더는 개인정보 보호를 위해 치환했다.

## 임시 화면 유지 설정

- 검사 전 값: 0. 적용 상태: applied.
- 원래 값이 7이면 설정을 변경하지 않았다. 다른 값이면 충전 중 화면이 꺼지지 않도록 검사 동안만 7을 사용한다.
- 종료 정리에서는 현재 값이 여전히 7일 때만 원래 값을 복구한다. 중간에 바뀐 값은 보존한다.
- 이 보고서는 종료 정리 전에 작성된다. 실제 복구 결과와 실행한 정리 명령의 종료 코드는 원본 summary.json의 screenAwake 및 checks에 기록한다.

## 확인한 항목

- PGlite의 메모리 PostgreSQL에서 상품·가격 이력 제약, 예시 데이터, 수동 가격 관측의 비공개 조건, 공개 카탈로그와 역할별 읽기·쓰기 권한을 검사했다.
- 실제 가격 입력 검증과 저장 SQL 생성은 자체 작성한 테스트 자료로 검사했다. 원격 비공개 적재 결과는 이번 개발 장의 별도 조회 기록을 따른다.
- 공개 키 REST GET으로 예시 상품 6개와 비공개 스키마·승인 메모 읽기 차단을 실행 전후 확인했다. 쓰기·관리자 API는 호출하지 않았다.
- 앱 검사·번들·Expo 서버에는 같은 설정을 전달하고 EXPO_NO_DOTENV=1로 고정했다. 환경 파일과 선택한 프로세스 설정의 변경도 검사했다.
- 실제 앱의 Supabase 출처·상품 6개 로딩을 최초 실행·다시 장보기·재실행에서 확인했다. 외부 상품의 일시적 변경을 연속 감시하는 검사는 아니다.
- 별도 localhost·USB 연결로 비공개 실제 가격을 읽기 전용 표시했다. 상품명·규격·가격·출처·확인 시각·재고 상태를 원본 기대값과 비교했다.
- 미리보기를 닫거나 Android 뒤로 가기를 눌러도 기존 장바구니가 유지된다. 실제 가격을 놀이 목록에 공개하거나 관리자 키를 앱에 넣지 않았다.
- 최근 DB 조회와 과거 가격 관측을 구분한다. DB 자료를 다시 읽었다고 상품 가격을 다시 관측한 것으로 기록하지 않는다.
- 이 실행만의 화면 표시를 확인해 이전 번들로 검사가 통과하는 것을 차단했다.
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
- git-guard-tests: 종료 코드 0
- catalog-http-check-tests: 종료 코드 0
- private-preview-tests: 종료 코드 0
- database-tests: 종료 코드 0
- unit-tests: 종료 코드 0
- typecheck: 종료 코드 0
- lint: 종료 코드 0
- export: 종료 코드 0
- private-preview-release-scan: 종료 코드 0
- private-preview-http-before: 종료 코드 0
- catalog-http-before: 종료 코드 0
- maestro-flow: 종료 코드 0
- catalog-http-after: 종료 코드 0
- private-preview-http-after: 종료 코드 0
- JUnit: 1 testcase, 실패 0, 오류 0, 건너뜀 0

원본 로그·스크린샷·JUnit·실행 요약은 `.artifacts/device/20261112T111453012Z-9438b0a5/`에만 보관하며 Git에 올리지 않는다. 기기 일련번호와 화면 XML은 이 보고서에 포함하지 않는다.

이 기록은 해당 Android 실기기·검사 시점의 결과다. iPhone, 스토어용 APK/AAB/IPA 및 실제 이마트 가격의 앱 공개 표시는 검증하지 않았다. 앱은 공개 예시 상품 6개로 검사한다.
