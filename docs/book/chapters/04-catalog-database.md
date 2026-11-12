# 04장. 상품 DB 구조와 공개 읽기 권한

날짜: 2026-11-12

시작 커밋은 `5d7321b`(계산 완료와 놀이 영수증)이다. 개발 재개 시 git status --short 출력이 없음을 확인했다. 이번 단계는 상품 DB의 로컬 기반을 준비하는 작업이다. 기존 Supabase 프로젝트 적용과 앱의 원격 읽기 연결은 별도로 확인한다.

## 재개 시 확인한 환경

PC에는 docker·psql·supabase 명령이 없었다. 앱은 Expo SDK 58과 내장 예시 상품 6개를 사용하고 있었다. 사용자에게는 Supabase 계정과 기존 프로젝트가 있지만 이 앱에 맞는지는 아직 모른다는 답을 받았다.

첫 device:doctor는 USB 디버깅 승인이 필요해 중단했다. 사용자가 휴대전화 잠금 해제와 승인을 완료한 뒤 다시 실행한 결과는 준비 완료·종료 코드 0이었다. 이 연결 확인을 실기기 기능 검사 성공으로 기록하지 않는다.

연결된 Supabase 도구는 없었으므로 제공되는 연결 도구를 찾아 사용자에게 설치·계정 연결을 안내했다. 이 원고를 작성할 때 기존 클라우드 DB를 조회하거나 SQL을 적용하지 않았다.

## 서버 설치 없이 실제 SQL을 검사하기

공식 PGlite 문서와 패키지 정보를 확인한 뒤 scripts/database에 별도 개발용 package를 만들었다. @electric-sql/pglite 버전은 0.5.16으로 고정하고 lockfile을 저장했다. 실제 실행한 엔진은 PostgreSQL 18.6이며 Windows·Node 26에서 동작했다.

설치 시 실행 스크립트를 허용하지 않고 패키지를 받았다. 다음은 저장된 lockfile로 재현하는 명령이다.

```bash
npm --prefix scripts/database ci --ignore-scripts
npm --prefix scripts/database test
```

메모리에 새 PostgreSQL DB를 만들고 로컬 검사에서만 anon·authenticated·service_role을 준비한다. 배포용 마이그레이션에는 Supabase 기본 역할을 생성하는 코드를 넣지 않았다. 역할 전환 뒤 current_user·superuser·RLS 우회 여부를 확인하고 실제 SQL을 실행한다. 각 변경은 트랜잭션 롤백으로 격리하고 마지막에 DB를 닫는다.

PGlite는 단일 연결 환경이다. SQL·권한·제약을 검사할 수 있지만 Supabase Auth·JWT·키·HTTP API나 실제 클라우드 구성을 검증한 것으로 기록하지 않는다.

## 상품과 가격 이력을 분리한 이유

상품 정보는 catalog_private.products, 가격 관측은 catalog_private.price_observations에 둔다. 앱용으로는 public.play_catalog만 공개한다. 파일별 역할과 전체 필드 흐름은 [상품 DB 안내](../../05-catalog-database.md)에 정리했다.

원 가격과 놀이 가격을 분리하되 현재 exact 규칙은 같은 값을 요구한다. 원 단위 양의 정수를 제약으로 검증한다. SQL의 integer 형변환이 소수를 반올림할 수 있으므로 무척도 numeric에 정수·범위 CHECK를 걸고, 공개 출력에서만 integer로 바꾼다.

예시 자료의 관측 시각은 NULL이고 실제 자료만 출처·관측 시각·유한한 공개 기한을 요구한다. 한 상품에 공개 가격 하나를 명시하며, 철회나 만료 뒤 과거 가격으로 자동 복귀하지 않는다. 미래·만료·조건부 할인·품절·미승인·비활성·현재 놀이 예산 밖의 가격은 저장되더라도 공개 목록에서 제외한다.

## 권한 경계와 불변 기록

private 스키마 USAGE를 회수한 상태에서 뷰에 필요한 원본 열의 SELECT만 부여한다. security_invoker와 RLS가 실제 사용자 권한으로 행을 제한하고, security_barrier로 공개 조건의 경계를 유지한다. 비공개 승인 메모는 열 권한도 주지 않는다. 일반 로그인 사용자도 익명과 같은 읽기 전용 권한을 받는다.

관리자에게만 원본 쓰기를 허용하며 관측 사실은 수정하지 못하게 한다. 가격·출처·관측 시각이 바뀌면 새 관측을 추가한다. 공개·권리·재고 상태만 변경할 수 있다. 상품 이름·규격도 관측 이후에는 변경할 수 없다. 핵심 이유를 SQL과 검사 코드에 한국어 주석으로 남겼다.

## 검사에서 찾은 문제와 보완

첫 독립 검토에서 상품 규격을 나중에 바꾸면 옛 가격이 새 규격의 가격처럼 표시될 수 있다는 문제를 발견했다. 관측이 존재하는 상품의 ID·이름·규격·예시 구분 변경을 막는 trigger를 추가했다. 색상·아이콘·순서·활성 상태는 관리할 수 있게 했다.

이 trigger를 삽입할 때 JavaScript 문자열 치환이 SQL의 달러 따옴표 두 개를 하나로 줄이는 문제가 생겼다. 첫 실제 migration 실행에서 구문 오류를 잡았고, 치환 콜백으로 문자를 보존하도록 고쳤다. 클라우드 적용 전에 실제 SQL 엔진으로 검사한 효과다.

공개 뷰는 두 테이블의 join이므로 쓰기를 시도하면 PostgreSQL이 권한 검사보다 먼저 55000(수정할 수 없는 뷰)을 반환했다. 처음에는 42501만 예상한 검사가 실패했다. view의 쓰기 ACL이 없는 것을 별도로 확인한 뒤 실제 거부 이유를 정확히 검사하도록 바꿨다. 원본 DML·TRUNCATE 차단은 42501로 확인한다.

리뷰에서는 SELECT * 실패만으로 스키마 권한을 검증하면 미허용 열 때문에 거부된 결과와 혼동할 수 있다는 점도 확인했다. 허용된 id 열과 has_schema_privilege로 비공개 스키마 차단을 독립 검증했다. 뷰 WHERE가 RLS 누락을 가릴 수 있으므로 검사 트랜잭션에서만 private USAGE를 임시 허용하고, 원본 행의 RLS도 직접 확인한 뒤 롤백했다.

## 실제 로컬 DB 검사 결과

최종 DB 검사 **34개가 모두 통과**했다. 앱의 실제 sample-products.ts를 import해 seed와 ID·이름·규격·가격·색상·아이콘을 비교하므로 두 데이터가 따로 달라지는 문제도 확인한다.

검사 범위는 공개 가능·불가능한 가격, 시각 경계, 숨김 행의 실제 RLS, 익명·로그인 읽기와 쓰기 차단, 관리자 관리, 가격·상품 규격의 불변성, 정수·FK·중복 제약, 공개 뷰 열 목록, seed 반복 실행, 과거 가격 자동 복귀 방지다. Node 구문 검사와 diff 공백 검사도 통과했다. 기존 앱 TypeScript를 import할 때 MODULE_TYPELESS_PACKAGE_JSON 경고가 있었지만 테스트 실패는 아니었다.

## 전체 자동 검증과 커밋

scripts/device/verify.mjs에 database-tests 단계를 추가했다. 이 단계가 실패하면 앱·갤럭시 검사를 통과한 것으로 처리하거나 커밋하지 않는다. 검사 파일, SQL, package·lockfile, 실제 예시 상품 파일과 문서를 커밋 허용 목록·파일 지문 대상에 포함했다.

```bash
cd apps/mobile
npm run verify:device -- --message "feat: 상품 DB 구조와 공개 권한 검증 추가"
```

위 전체 실행의 실제 결과는 이 원고와 같은 커밋에 포함되는 [검증 기록](../verification/latest-android.md)의 시작 HEAD·database-tests·JUnit 결과로 확인한다. 이 원고를 작성한 시점에 이전 실기기 검증을 이번 DB 단계의 성공으로 대신하지 않았다.

## 다음 연결 단계

기존 Supabase 프로젝트의 이름·용도·PostgreSQL 버전·현재 테이블과 공개 스키마를 읽어서 재사용 가능 여부를 판단한다. 충돌 여부를 확인한 뒤 마이그레이션과 자체 예시를 적용하고 공개 키를 통한 실제 읽기를 검사한다. 그 뒤 앱에 원격 카탈로그와 예시 대체 동작을 연결한다. 계정 비밀번호나 관리자 키는 코드·원고·Git에 저장하지 않는다.

후속 기록: 새 프로젝트 적용과 공개 키 조회, 앱 연결은 [04장 보충](04a-supabase-catalog.md)에 기록했다. 위 내용은 이 장을 작성한 당시의 로컬 검증 범위를 유지한다.

참고: [PGlite 문서](https://pglite.dev/docs/) · [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) · [PostgreSQL CREATE VIEW](https://www.postgresql.org/docs/current/sql-createview.html)
