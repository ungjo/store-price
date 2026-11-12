# 04장 보충. Supabase에서 상품 목록 읽기

날짜: 2026-11-12

시작 커밋은 `06cb47c`(상품 DB 구조와 공개 권한 검증)이다. 앞 장에서 로컬 PostgreSQL로 확인한 구조를 새 Supabase 프로젝트에 적용하고, 앱이 공개 카탈로그를 읽도록 연결하는 단계다. 원격 DB에도 직접 만든 예시 6개만 넣었다. 실제 이마트 가격 수집을 완료한 것은 아니다.

## 새 프로젝트를 먼저 확인하기

사용자는 Supabase 계정이 있었으나 기존 프로젝트가 이 앱에 맞는지는 확실하지 않았다. 이후 사용자가 이 앱용 store-price 프로젝트를 새로 만들었다. 브라우저에서 프로젝트 상태가 Healthy이고 FREE 요금제, Singapore(ap-southeast-1), PostgreSQL 17.11인 것을 읽어서 확인했다.

적용 전에는 catalog_private 스키마와 public.play_catalog가 없고 public 객체 수가 0임을 확인했다. anon·authenticated 역할에는 RLS 우회 권한이 없고 service_role에는 우회 권한이 있었다. 이 확인은 SQL을 적용할 대상을 구분하고 기존 객체와 충돌하지 않는지 살피기 위한 것이었다.

사용자가 SQL Editor에서 마이그레이션을 먼저 실행하고 seed를 따로 실행해 성공했다고 알려 주었다. 이어 공개 뷰의 6행과 예시 구분을 확인했다고 답했다. 이후 브라우저의 SQL Editor 결과에서도 실제 6행을 직접 확인했다. 사용자 실행 보고와 직접 읽은 결과를 구분해서 남긴다.

## 공개 연결 정보와 실제 읽기 권한

앱의 연결 정보는 apps/mobile/.env.local에 저장하고, 변수 이름과 가짜 값만 든 .env.example을 저장소에 남겼다. 실제 키 값은 원고에 싣지 않는다.

사용하는 변수는 EXPO_PUBLIC_SUPABASE_URL과 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY다. Expo는 process.env의 직접 점 표기로 참조한 EXPO_PUBLIC_ 값을 앱 번들에 넣는다. SDK 58에서는 .env.local을 표준 환경 파일로 읽으며, .env.test 같은 별도 이름은 같은 방식으로 읽지 않는다. [Expo 환경 변수 문서](https://docs.expo.dev/guides/environment-variables/)

publishable 키는 공개 클라이언트용이다. 키 자체가 읽기 전용인 것은 아니며, 앞 장의 GRANT와 RLS가 앱에서 가능한 일을 공개 카탈로그 읽기로 제한한다. 이 값은 설치된 앱에서 확인할 수 있으므로 비밀 키처럼 취급하지 않는다. 관리자 secret 키와 service_role 키는 앱 설정에 넣지 않았다. [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys)

요청은 HTTPS의 GET /rest/v1/play_catalog로 보낸다. publishable 키는 apikey 헤더에만 넣고 Authorization: Bearer 값으로 보내지 않는다. 별도 사용자 로그인 없이 공개 읽기를 사용한다. Supabase의 Data API는 PostgreSQL 권한과 RLS를 적용하는 PostgREST를 통해 뷰를 제공한다. [Data REST API](https://supabase.com/docs/guides/api)

## 원격 HTTP에서 직접 확인한 결과

첫 연결 확인은 curl 명령이 아니라 Node 스크립트의 fetch로 실행했다. HTTP 200, Content-Range 0-5/6을 받았고 이름·규격·가격·is_sample을 확인했다.

| 상품 | 규격 | 놀이 가격 | 예시 여부 |
| --- | --- | --- | --- |
| 사과 | 1개 | 1,500원 | true |
| 우유 | 1팩 · 1L | 2,500원 | true |
| 당근 | 1개 | 1,000원 | true |
| 식빵 | 1봉 | 3,000원 | true |
| 바나나 | 1송이 | 3,500원 | true |
| 달걀 | 6개 | 2,000원 | true |

이 결과는 실제 Supabase 서버가 공개 키 요청에 예시 목록을 반환했다는 근거다. 쓰기 차단을 포함한 전체 HTTP 권한 검사나 휴대전화 앱 동작을 모두 확인했다는 뜻은 아니다. 현재 자료의 is_sample이 true이므로 원격 목록도 실제 판매 가격이라고 표시하지 않는다.

첫 점검 스크립트에서는 require와 최상위 await를 함께 사용해 ERR_AMBIGUOUS_MODULE_SYNTAX가 발생했다. 모듈 문법을 import fs로 통일한 뒤 다시 실행해 위 응답을 확인했다. 이 오류는 DB 접속 오류가 아니라 점검 스크립트의 모듈 문법 문제였다.

## 통신과 놀이 화면을 나누기

CatalogLoader가 연결 설정과 요청 상태를 관리하고, 목록을 받으면 기존 MarketScreen에 상품을 전달한다. 장바구니·예산·돈 선택·거스름돈 맞히기·영수증 계산은 같은 상품 목록을 사용한다.

처음에는 “가게 물건을 가져오고 있어요”를 표시한다. 요청이 끝나면 준비된 목록, 빈 목록, 통신·자료 오류, 연결 설정 없음으로 구분한다. 요청의 제한 시간은 12초다. 응답은 앱에서 사용할 수 있는 자료인지 검증한 뒤 목록으로 전달한다. 가격은 원 단위 정수 1~10,000원이어야 하고 원 가격과 놀이 가격이 같아야 한다. 중복 상품·관측 ID, 잘못된 행, 응답의 행 수 불일치를 거절한다. 목록은 sort_order·id 순으로 요청하며 1,000개를 넘으면 부분 목록으로 시작하지 않는다.

오류가 나도 내장 예시로 자동 전환하지 않는다. “다시 불러오기”로 재시도하거나 “예시 상품으로 놀이하기”를 직접 선택하게 했다. 원격 상품과 내장 예시는 화면에서 출처를 구분한다. 이전 요청이 늦게 끝나더라도 사용자가 이미 선택한 예시 목록을 덮어쓰지 않도록 요청 중단과 현재 요청 여부를 함께 확인한다.

## 가격을 한 번의 놀이 동안 유지하기

상품을 담는 중에 서버 가격이 바뀌어도 현재 장바구니의 계산 기준이 달라지지 않도록, 받은 목록과 가격은 한 번의 놀이 동안 유지한다. 화면에서 계산한 값과 영수증의 값이 같은 목록을 기준으로 하게 하기 위한 선택이다.

원격 목록으로 만든 영수증에서 “다시 장보기”를 누르면 새 목록을 조회하고, 조회가 끝난 뒤 빈 장바구니로 새 놀이를 시작한다. 내장 예시로 놀았다면 내장 목록으로 새 놀이를 시작한다. 두 경우 모두 놀이돈은 10,000원이며 이전 돈 선택·답·영수증을 이어 쓰지 않는다.

현재 놀이 상태는 메모리에만 둔다. 앱을 다시 실행하면 다시 목록을 읽는 단계부터 시작한다. 원격 가격을 기기에 영구 저장하는 오프라인 캐시는 이번 범위에 포함하지 않았다.

## 검증을 나누어 기록하기

초안 작성 시점에 확인한 것은 새 프로젝트의 사전 상태, 사용자의 SQL 실행 보고, SQL Editor의 6행, Node fetch의 원격 HTTP 200 응답이다. 로컬 DB 검사 34개는 앞 단계의 결과이며 이번 앱 연결 검사 결과와 구분한다.

카탈로그 도메인은 apps/mobile에서 node --experimental-strip-types --test src/features/catalog/catalog.test.ts로 단위 검사 28개가 통과했다. 해당 두 파일의 TypeScript 진단과 ESLint도 0건이었다. 기존 MODULE_TYPELESS_PACKAGE_JSON 경고는 있었으나 검사 실패는 아니었다. 원격 검증기의 가짜 응답 단위 검사도 10개 모두 통과했다.

앱 전체의 npm run typecheck와 npm run lint도 통과했다. 처음에는 render prop으로 전달하는 reload 콜백 안의 ref 접근 때문에 ESLint 검사가 실패했다. 그 접근을 제거하고 effect의 정리 동작에서 이전 요청을 중단하도록 고친 뒤 다시 통과했다.

오류 화면은 별도 8093 포트의 Expo 서버에서 확인했다. EXPO_NO_DOTENV=1로 자동 환경 파일 읽기를 끄고, 올바른 프로젝트 URL에 의도적으로 유효하지 않은 클라이언트 키를 전달했다. 실제 DB 구조나 데이터를 바꾼 검사가 아니다. 브라우저에서 기다림 뒤 오류와 재시도 버튼이 보였고, 예시 상품 버튼을 눌러 내장 출처의 6개로 전환했다. 사과 1개를 담아 합계 1,500원·잔액 8,500원을 확인한 뒤 별도 서버를 종료했다. 테스트용 키와 실제 키 값은 원고에 남기지 않는다.

실제 publishable 키로 원격 검증기를 실행한 결과는 productCount=6, privateSchemaBlocked=true, approvalNotesBlocked=true였다. 공개 목록의 예시 일치와 비공개 스키마·승인 메모 읽기 차단을 확인했다. 저장소 루트에서 아래 명령으로 같은 읽기 검사를 재현할 수 있다.

```bash
node --experimental-strip-types --input-type=module -e "import { captureCatalogEnvironment, checkCatalogHttp } from './scripts/device/catalog-http-check.mjs'; console.log(await checkCatalogHttp(captureCatalogEnvironment('./apps/mobile')));"
```

앱 전체 단위 검사와 갤럭시 전체 검사는 아직 성공으로 기록하지 않았다. 최종 결과는 이 변경과 함께 커밋하는 [실기기 검증 기록](../verification/latest-android.md)의 시작 HEAD·각 검사 단계·JUnit 결과로 확인한다. 이전 커밋의 성공 보고서를 이번 연결 성공의 근거로 사용하지 않는다.

새 원격 검증기는 공개 예시 6개 일치, 비공개 스키마 접근 거부, 공개 뷰의 approval_notes 접근 거부를 읽기 요청으로 확인한다. 기존 자동 실행기에 catalog-http-before·catalog-http-after와 검증기 단위 검사 단계를 넣어 앱과 같은 연결 설정으로 검사한다. 서버 자료를 쓰거나 지우는 검사는 아니다.

기존 자동 실행은 아래 명령을 사용한다. 이 명령을 안내한 것과 실제 성공한 것은 구분한다.

```bash
cd apps/mobile
npm run verify:device -- --message "feat: Supabase 공개 상품 목록 읽기 연결"
```

코드·DB·실기기 검사가 모두 성공하고 검사 중 파일이 바뀌지 않은 경우에만 실행기가 결과를 기록하고 허용된 파일을 커밋한다. GitHub 업로드와 태그 생성은 별도 요청에 따라 진행한다.

## 다음 단계

연결 확인 뒤에도 실제 가격 이용 범위 확인, 승인된 자료의 수집·검증·갱신, iPhone 실기기 검사는 남아 있다. 이번 단계는 자체 예시 자료를 원격 DB에서 읽는 기반을 마련하는 작업이다.

실행과 설정은 [상품 DB와 앱 연결 안내](../../05-catalog-database.md), 이전 SQL 설계 이유는 [04장](04-catalog-database.md)을 참고한다.
