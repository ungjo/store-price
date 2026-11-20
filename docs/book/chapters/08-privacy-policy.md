# 08. 첫 출시용 개인정보처리방침을 앱에 담기

첫 Google Play 버전의 시장놀이는 자체 예시 상품 12개를 사용한다. 이 장의 출발점은 정식 AAB와 태블릿 설치를 검증한 `35b12e4`이다. 그 AAB는 이번 방침을 넣기 전의 파일이다.

## 앱과 서버 사이에 오가는 정보

상품 로더, 저장소 접근 코드, 앱 의존성, 이전 정식 AAB의 AndroidManifest와 네이티브 라이브러리를 확인했다. 상품 요청은 앱을 열거나 목록을 다시 불러올 때 발생한다. 서버 응답을 기다리는 중에 내장 예시를 고를 수 있다. 이미 보낸 요청은 서버 기록에 남을 수 있다.

| 동작 | 앱에서 확인한 처리 |
| --- | --- |
| 상품 불러오기 | Supabase의 `/rest/v1/play_catalog`에 HTTPS GET을 보낸다. 예시 여부와 내장 상품 ID 12개, 필요한 열, 정렬 순서, 행 수 제한을 지정한다. 앱 공용 키와 응답 형식·건수 헤더를 쓰며 요청 본문이나 이용자 인증 값은 보내지 않는다. |
| 서버 응답 | 이름·단위·분류·놀이 가격·표시 정보와 관측 ID를 받는다. 목록을 검증하고 한 번의 놀이 동안 메모리에 유지한다. 서버가 요청 범위 밖의 상품을 돌려주면 오류로 처리하고 내장 예시로 놀 수 있도록 한다. |
| 담기·계산·맞히기 | 수량·놀이돈·입력한 답·영수증을 기기 메모리에서 처리한다. 서버에 주문을 기록하거나 계산 결과를 파일로 저장하는 코드가 없다. |
| 문의 | 앱에서 문의 내용을 전송하는 기능은 없다. 보호자가 직접 메일을 보낼 때 별도로 처리하는 정보와 문의 절차를 방침에 담는다. |

Supabase 프로젝트의 무료 요금제와 싱가포르 DB 리전을 확인했다. 게이트웨이는 접속 IP, 시각, 요청 경로와 결과 등을 처리할 수 있다. 개발자가 볼 수 있는 기본 API 로그의 보관 기간은 현재 요금제에서 1일이다. 이 기간은 클라우드 사업자의 모든 내부 보안 기록에 대한 삭제 기한을 뜻하지 않는다. 개별 이용자의 로그를 열어 보지 않았다. [Supabase 로그 항목](https://supabase.com/docs/guides/observability/log-field-reference) · [요금제별 로그 보관](https://supabase.com/docs/guides/observability/logs)

이전 정식 AAB는 Android 백업과 Expo 원격 업데이트가 꺼져 있었다. 인터넷·진동·다른 앱 위에 표시 및 Android 12L 이하 외부 저장소 권한 선언이 있었고, 시장놀이 코드에서 사진·연락처·GPS·광고 식별자를 읽는 경로나 광고·분석 SDK 연동은 발견하지 못했다. 권한 선언과 실제 정보 전송을 따로 확인했다. Android 전체 트래픽을 캡처한 결과로 해석하지 않는다.

## 앱에서 읽는 방법

상품을 불러오는 화면, 꼬마 시장 상품 목록, 영수증에서 **개인정보처리방침**을 열 수 있다. 방침은 앱에 포함된 한국어 본문을 표시한다. 상품 서버 접속이나 외부 브라우저가 필요하지 않다. 닫기 또는 Android 뒤로가기로 장보던 화면에 돌아간다.

앱의 [원문](../../../apps/mobile/src/features/privacy/privacy-policy.ts)과 [배포용 HTML](../../privacy/index.html)은 본문을 공유한다. 방침을 수정한 뒤 저장소 루트에서 아래 명령을 실행한다.

```bash
node scripts/build/privacy-page.mjs
node scripts/build/privacy-page.mjs --check
```

두 번째 명령은 앱과 웹페이지의 내용이 다르면 실패한다. HTML에는 외부 글꼴, 분석 스크립트, 폼이 없다. 스토어 등록 시에는 이 파일을 공개 웹페이지로 게시하고 실제 주소를 Play Console에 등록한다. [Google Play 사용자 데이터 정책](https://support.google.com/googleplay/android-developer/answer/10144311?hl=ko)

## 확인한 결과

- 앱 폴더에서 `npm test` 150건, `npm run typecheck`, `npm run lint`, `npm run export:check` 통과. 내장 예시 이외의 응답을 거절하고 요청에 이용자별 정보나 본문을 싣지 않는 경우를 검사했다.
- 저장소 루트에서 `npm --prefix scripts/database test` 69건, `node --test scripts/build/production.test.mjs scripts/build/standalone.test.mjs scripts/build/inspection.test.mjs scripts/device/catalog-http-check.test.mjs` 첫 실행에서 74건 통과. 이후 예시 필터 밖에 있는 공개 행까지 확인하는 HTTP 회귀 검사를 추가하고 해당 HTTP 검사 11건이 통과했다.
- 앱 코드와 같은 조회 함수를 호출하는 `checkCatalogHttp`로 실제 원격 응답에서 예시 12개의 이름·가격·순서·분류를 확인했다. 별도의 검사 요청으로 비공개 스키마 및 관리 메모 열 접근이 차단됨을 확인했다. 이후 검사기에 본문 없이 전체 공개 행 수를 확인하는 HEAD 요청을 추가했다. 이 요청은 앱이 보내는 통신에 포함되지 않는다.
- PC의 Edge 테스트 전용 프로필에서 배포용 웹 번들을 실행했다. 정상 응답과 상품 서버 연결 차단 두 경우 모두 사과 1개를 담고 방침을 열어 문의 항목까지 읽은 뒤 닫자 1개·1,500원이 유지됐다. 각 세션에서 앱이 시도한 외부 요청은 상품 목록 GET 한 번이었다. 방침을 열고 닫거나 상품을 담을 때 추가 요청은 관찰되지 않았다.
- Maestro 시나리오 구문을 검사했다. Android 실기기 검사에서는 상품 로딩 중 방침을 열고 뒤로가기, 예시 상품 영수증에서 방침을 열고 닫기, 원격 목록에서 3개·5,500원이 담긴 장바구니 유지까지 확인한다. 최종 실기기 결과는 아래 명령으로 생성되는 **이번 실행의 PASS 보고서**에서 확인한다.

```bash
node scripts/device/verify.mjs --message "feat: 예시 상품 출시용 개인정보처리방침 추가"
```

첫 준비 점검 `node scripts/device/verify.mjs --doctor` (실행 `20261120T221458701Z-591ae392`)에서는 USB 디버깅이 승인된 기기가 0대였다. 이 실행은 Android 화면을 검사하지 않았고 커밋을 만들지 않았다. 이전 AAB의 실기기 결과와 이번 앱 화면의 결과는 서로 다른 버전의 기록이다.
