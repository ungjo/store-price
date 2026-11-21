# 11장 상품과 가격을 저장할 데이터베이스 설계하기

10장에서는 앱에 들어 있는 예시 상품으로 계산과 영수증을 완성했다. 이제 같은 12개 상품을 데이터베이스에 넣고, 앱에 보여 줄 자료를 골라 읽는 구조를 살펴본다. 이 장의 실습은 PC 안의 메모리 데이터베이스에서 끝난다. Supabase 계정과 DB 비밀번호는 다음 장에서 준비한다.

이 장에서 다룰 전체 파일은 `work/ch11`에 생성되는 참고 코드다. 10장에서 직접 작성한 앱은 그대로 보관한다. 참고 코드는 상품 목록, 장바구니, 퀴즈, 영수증을 이미 포함한 실제 개발 단계 `479f6f5`이며, 데이터 연결과 검사를 읽기 쉬운 파일로 분리해 놓았다. 기능을 처음부터 다시 만들지 않고, 앞에서 익힌 계산이 더 큰 구조에서도 유지되는지 비교한다.

## 11.1 앱 안의 예시와 서버 데이터의 차이 이해하기

Git Bash에서 동봉 자료를 풀어 둔 `kit`으로 이동해 이 장의 작업 폴더를 만든다.

```bash
cd ~/market-book/kit
node start.mjs 11
cd work/ch11
ls
```

`apps`, `scripts`, `supabase`가 보이면 올바른 위치다. `work/ch11`이 이 장에서 말하는 **저장소 루트**다. 같은 명령을 다시 실행했을 때 폴더가 이미 있다는 안내가 나오면 기존 폴더를 지우지 말고 그 폴더를 열어 계속한다.

VS Code에서 **파일 → 폴더 열기**로 `work/ch11`을 연다. 10장의 VS Code 창은 닫아도 파일이 사라지지 않는다. 두 창을 함께 열었다면 터미널의 `pwd`를 확인해 어느 장에서 작업하는지 구분한다.

| 앞에서 익힌 역할 | 참고 코드에서 찾을 파일 |
| --- | --- |
| 상품 이름·가격·분류 | `apps/mobile/src/data/sample-products.ts` |
| 상품 화면과 놀이 상태 | `apps/mobile/App.tsx`의 `MarketScreen` |
| 장바구니와 합계 | `src/features/cart/cart.ts` |
| 돈 선택·퀴즈·영수증 | `src/features/payment/` |
| 서버 상품과 내장 예시 선택 | `src/components/catalog-loader.tsx` |
| 상품·가격 저장 구조 | `supabase/migrations/` |

이 표의 `src/`는 `apps/mobile/src/`를 뜻한다. 교육용 앱의 `ShoppingScreen`과 참고 앱의 `MarketScreen`은 같은 사용자 흐름을 맡지만 파일과 함수 이름이 다르다. 이름을 한꺼번에 바꾸거나 두 구현을 섞어 붙이지 않는다.

앱을 한 번 실행해 인계를 확인하자.

```bash
cd apps/mobile
npm ci
npm run typecheck
npm run lint
npm start
```

Supabase 연결값을 넣기 전에는 준비 안내가 나타난다. **예시 상품으로 바로 놀이하기**를 눌러 전체 12개와 분류를 확인한다. 사과 2개와 우유 1개를 담으면 합계는 5,500원이다. 10,000원을 고르고 4,500원을 입력해 영수증을 확인한다. 이 결과가 10장과 같아야 다음으로 간다. 참고 코드로 옮겼다고 상품이 6개로 줄거나 계산 규칙이 바뀌지 않는다.

내장 예시는 설치 파일에 포함된 배열이다. 서버 상품은 통신으로 전달받은 배열이다. 둘 다 화면에는 같은 `CatalogProduct` 형태로 전달된다. **자료를 얻는 방법**을 바꾸어도 합계 함수는 같은 입력 구조를 사용한다. 이름만 같은 두 배열에 가격이 다르면 계산도 달라지므로, 이 책은 앱 예시와 DB 예시가 일치하는지도 검사한다.

자신이 10장에서 바꾼 색상이나 문구는 `ch10`에 남는다. `ch11`은 독립된 참고 사본이며 개인 수정사항을 자동 이식하지 않는다. 기준 기능을 확인한 뒤 필요한 변경만 두 폴더를 비교해 적용한다.

## 11.2 PostgreSQL 테이블·행·열·키 이해하기

스프레드시트 한 장을 떠올려 보자. 상품 하나가 한 행이고, 이름과 규격이 열이다. 데이터베이스는 여기에 저장 가능한 값과 관계의 규칙을 더한다.

| 개념 | 이 앱의 예 | 필요한 이유 |
| --- | --- | --- |
| 테이블 | `products` | 같은 구조의 상품을 모은다 |
| 행 | 사과 1개 상품 | 상품 하나를 구분한다 |
| 열 | `name`, `unit_label` | 이름과 규격을 나눈다 |
| 기본키 | `id = sample-apple` | 이름이 비슷해도 같은 상품을 찾는다 |
| 외래키 | 가격의 `product_id` | 어느 상품의 가격인지 연결한다 |
| 제약 | 가격은 양의 정수 | 잘못된 자료를 저장 단계에서 거절한다 |
| 뷰 | `public.play_catalog` | 앱이 읽을 결과를 정해 둔다 |

`PRIMARY KEY`는 값이 겹치지 않게 한다. `NOT NULL`은 빠지면 안 되는 값을 정한다. `CHECK`는 허용 범위를 검사한다. `FOREIGN KEY`는 없는 상품을 가리키는 가격을 막는다. TypeScript 타입은 앱 개발 중 실수를 찾고, SQL 제약은 DB에 들어오는 모든 경로의 자료를 검사한다. 둘은 서로를 대신하지 않는다.

```sql
-- 이름이 비슷해도 상품 ID를 기준으로 찾습니다.
SELECT id, name, unit_label
FROM catalog_private.products
WHERE id = 'sample-apple';
```

관리자 조회에서 실행할 때의 의미를 읽는 예제다. 일반 앱은 원본 테이블에 직접 접근하지 않고 공개 뷰를 사용한다.

## 11.3 상품, 분류, 가격 이력, 출처 나누기

상품 행에 가격을 하나만 두면 가격을 바꿀 때 이전 값이 사라진다. 이 앱은 상품의 정체성과 가격 관측을 나눈다.

```text
catalog_private.products
  id · name · unit_label · category_id
                 │ product_id
                 ▼
catalog_private.price_observations
  가격 · 출처 · 확인 시각 · 권리 상태 · 공개 상태
                 │ 공개 조건에 맞는 현재 행
                 ▼
public.play_catalog
                 │ 읽기
                 ▼
앱의 CatalogProduct 배열
```

분류는 이 책의 세 가지 값으로 제한한다. `produce`는 과일·채소, `dairy-eggs`는 유제품·달걀, `bakery-snacks`는 빵·간식이다. 별도 분류 관리 화면을 만들지 않고 상품의 `category_id` 열로 표현한다.

가격의 `source_price_krw`와 `play_price_krw`는 현재 같은 값이다. 임의 반올림 기능은 없다. 나중에 규칙을 바꾸려면 DB 제약과 앱 검사 모두 바꿔야 한다. 원 단위 정수라는 약속을 한쪽에서만 바꾸면 응답 검증에 실패한다.

실제 관측의 `observed_at`은 가격을 확인한 때다. `created_at`은 DB에 기록을 만든 때다. 오늘 어제 자료를 저장해도 가격을 오늘 확인한 것이 되지 않는다. 자체 예시는 외부 가격을 관측하지 않았으므로 `observed_at`을 비워 둔다.

## 11.4 SQL로 테이블과 예시 데이터 만들기

VS Code 탐색기에서 다음 파일을 순서대로 연다. 파일을 합치거나 번호를 바꾸지 않는다.

| 순서 | 파일 | 역할 |
| --- | --- | --- |
| 1 | `supabase/migrations/20261112090000_catalog.sql` | 상품·가격·공개 뷰와 권한 |
| 2 | `supabase/migrations/20261112102641_manual_price_observations.sql` | 수동 관측의 비공개 제약 |
| 3 | `supabase/migrations/20261115133406_catalog_categories.sql` | 분류와 예시 12개 확장 |
| 4 | `supabase/seed.sql` | 자체 예시 데이터의 반복 가능한 입력 |

전체 SQL은 동봉 파일이 실행 단위다. 다음 부분만 복사해 전체 구조를 대신하지 않는다. 첫 파일의 `CREATE TABLE catalog_private.products`에서 아래 구조를 찾는다.

```sql
CREATE TABLE catalog_private.products (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  unit_label text NOT NULL CHECK (length(btrim(unit_label)) BETWEEN 1 AND 120),
  is_sample boolean NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  emoji text NOT NULL DEFAULT '🛒' CHECK (length(emoji) BETWEEN 1 AND 16),
  color text NOT NULL DEFAULT '#EAF0E5' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
    CHECK (isfinite(created_at)),
  UNIQUE (id, is_sample)
);
```

이것은 첫 마이그레이션의 실제 정의다. 분류 열은 세 번째 파일에서 추가된다. 초기 개발은 6개 상품으로 시작했지만, 이번 실습은 세 파일을 모두 적용한 **12개 상태**로 시작한다. 첫 파일 뒤에 옛 seed를 따로 찾아 넣지 않는다.

세 번째 파일은 기존 여섯 상품의 분류를 채우고 여섯 상품을 더한다. 마지막 seed도 같은 12개다. 동일한 ID를 다시 넣었을 때 중복 상품을 늘리지 않도록 처리하지만, 모든 SQL을 아무 상태에서 반복 실행해도 된다는 뜻은 아니다. 최초 테이블 생성은 한 번이며, 반복 데이터 입력과 구조 변경은 구분한다.

금액 열은 `numeric`과 `trunc`로 소수를 거절한다. PostgreSQL이 정수형으로 변환하며 먼저 반올림하는 상황을 피하려는 선택이다.

```sql
source_price_krw numeric NOT NULL CHECK (
  source_price_krw BETWEEN 1 AND 2147483647
  AND source_price_krw = trunc(source_price_krw)
)
```

이 절의 SQL은 구조 읽기다. 실제 실행은 11.7의 프로그램이 메모리 DB에 전체 파일을 순서대로 적용한다.

## 11.5 공개 가능한 상품과 가격의 조건 정하기

저장된 모든 행을 앱에 보여 주지 않는다. 아래 조건을 통과한 현재 관측만 `play_catalog`에 나온다.

| 조건 | 제외되는 예 |
| --- | --- |
| 상품 활성, 분류 지정 | 검토 중인 상품, 미분류 실제 상품 |
| `published`와 `app_approved` | 초안, 철회, 권리 미확인 |
| 판매 가능, 조건 없는 가격 | 품절, 카드 회원만의 할인 |
| 원 단위 정수, 놀이 가격 10,000원 이하 | 소수 입력, 한 개도 살 수 없는 가격 |
| 관측·행사·공개 기한이 현재 조건과 일치 | 미래 관측, 시작 전 행사, 지난 기한 |

`app_approved`라는 문자열은 이 프로젝트의 관리 상태다. 그 값을 입력한다고 외부 데이터의 사용권이 생기는 것은 아니다. 책의 seed는 직접 만든 예시만 사용한다.

한 상품에는 공개 관측을 하나만 둔다. 현재 관측을 철회했다고 옛 가격을 자동으로 다시 공개하지 않는다. 되돌아갈 옛 가격이 지금도 유효한지 알 수 없기 때문이다. 앱이 편리하다는 이유로 오래된 값을 오늘 가격처럼 표시하지 않는 설계다.

## 11.6 RLS와 권한으로 공개 읽기 범위 제한하기

권한은 두 질문으로 나누어 읽는다. **이 역할이 무엇을 읽을 수 있는가**는 `GRANT`가 정하고, **그중 어떤 행이 보이는가**는 RLS 정책이 정한다.

```sql
ALTER TABLE catalog_private.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_active_products
ON catalog_private.products
FOR SELECT TO anon, authenticated
USING (is_active);
```

익명 역할 `anon`도 허용된 공개 상품을 읽을 수 있다. 이 앱에 어린이 로그인 기능을 넣을 필요는 없다. 원본의 관리자 메모는 공개 결과에 포함하지 않는다.

뷰에는 실제 호출자의 권한으로 원본을 읽도록 다음 옵션을 둔다.

```sql
CREATE VIEW public.play_catalog
WITH (security_invoker = true, security_barrier = true)
AS
-- 실제 파일에는 상품·관측의 JOIN과 공개 조건이 이어집니다.
SELECT ...;
```

위 코드는 옵션 위치를 설명하는 발췌이므로 SQL Editor에 그대로 실행하지 않는다. 실행할 전체 문장은 마이그레이션 파일에 있다. 공개 뷰에 필요한 원본 열 읽기와 RLS를 함께 구성하며, `catalog_private`를 Data API의 공개 스키마 목록에 추가하지 않는다. Supabase의 Data API 노출, 객체 권한, 행 정책은 각각 확인할 대상이다. [Supabase API 보안](https://supabase.com/docs/guides/api/securing-your-api), [RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 11.7 PGlite로 실제 SQL 검사하기

실행 중인 Expo 서버 터미널은 Ctrl+C로 멈춘다. 새 Git Bash에서 다음을 실행한다.

```bash
cd ~/market-book/kit/work/ch11
cd scripts/database
npm ci
npm test
```

PGlite는 이 실습에서 PostgreSQL을 메모리에 실행하는 검사 도구다. Docker나 서버 비밀번호 없이 테이블·제약·권한을 확인한다. 앱 설치 파일에는 들어가지 않는다.

검사 파일 `database.test.mjs`를 열어 `before(async`를 검색한다. 프로그램은 로컬에서만 역할을 만든 뒤 마이그레이션을 이름순으로 읽고 seed를 넣는다. 검사마다 트랜잭션을 시작하고 마지막에 롤백해, 앞선 실패가 다음 검사에 남지 않게 한다.

```javascript
// 실제 검사 파일에서 사용하는 롤백 구조
async function rollback(body) {
  await db.exec('BEGIN');
  try {
    return await body();
  } finally {
    await db.exec('ROLLBACK');
  }
}
```

SQL이 실행됐다는 사실과 Supabase에 연결됐다는 사실은 다르다. PGlite 통과는 SQL 규칙의 근거이며, 공개 키·REST API·실제 기기 통신은 12장 이후에 따로 확인한다.

## 11.8 허용과 차단 결과 직접 읽기

검사 목록만 읽지 말고, 12행이 어떻게 11행이 되는지 출력해 보자. 메모리 DB만 사용하는 동봉 실습 파일을 자기 폴더로 복사한다.

```bash
cd ~/market-book/kit/work/ch11
cp ../../steps/11/catalog-query.mjs ./catalog-query.mjs
node catalog-query.mjs
```

처음 표에는 사과부터 크래커까지 12행이 나온다. 뒤에는 다음 세 결과가 이어져야 한다.

```text
공개 역할 조회: 12
사과 공개 철회 중: 11
롤백 후: 12
```

코드에서 `publication_state='withdrawn'`를 찾아 읽는다. 사과 상품을 삭제하지 않고 공개 가격의 상태만 바꾼다. 일반 역할로 다시 조회하면 사과가 제외된다. 마지막 롤백 후 12행으로 돌아온다. 이 프로그램은 원격 DB 주소나 키를 읽지 않는다.

**직접 바꿔 보기.** 복사한 `catalog-query.mjs`에서 철회 대상만 `sample-milk`로 바꾼다. 다시 실행해 행 수가 12→11→12인지 확인한다. 화면에서 “안 보인다”와 데이터베이스에서 “삭제됐다”를 구분해 설명해 보자.

### 화면의 분류 개수를 SQL로 확인하기

5장에서 분류 버튼의 개수는 상품 배열을 순회해 구했다. 이제 공개 뷰에서 같은 값을 구해 보자. 12행이라는 전체 개수가 맞아도 한 상품의 분류가 잘못될 수 있다. 화면에서 보이는 분류별 개수와 데이터베이스가 세는 개수를 따로 구하면 잘못된 행을 찾을 수 있다.

방금 복사한 `work/ch11/catalog-query.mjs`를 VS Code에서 연다. `console.table(initial.rows);`를 찾고, 그 줄 **바로 아래**에 다음 코드를 추가한다. 이 위치에서는 공개 역할로 읽는 트랜잭션이 열려 있고 사과도 공개되어 있다.

~~~javascript
const byCategory = await db.query(
  'SELECT category_id, count(*)::integer AS product_count ' +
  'FROM public.play_catalog GROUP BY category_id ORDER BY category_id'
);
console.table(byCategory.rows);
~~~

`node catalog-query.mjs`를 다시 실행한다. 원래의 열두 행 바로 아래에 세 행짜리 표가 하나 더 생긴다. `GROUP BY`는 같은 분류값을 한 묶음으로 만들고, `count(*)`는 각 묶음에 들어 있는 행을 센다. `ORDER BY`는 결과를 분류 ID의 알파벳순으로 정렬한다.

| category_id | product_count | 화면에서 누르는 분류 |
| --- | ---: | --- |
| bakery-snacks | 2 | 빵·간식 |
| dairy-eggs | 4 | 유제품·달걀 |
| produce | 6 | 과일·채소 |

세 행의 개수를 더하면 12가 된다. 그림 5-1에서 누른 ‘유제품·달걀’의 값은 가운데 줄의 4다. 정렬 순서를 바꿔도 각 분류의 개수는 같아야 한다. 그래서 앱은 화면에서 몇 번째 버튼을 눌렀는지보다 `dairy-eggs` 같은 ID로 분류를 연결한다.

한 번 더 실험할 수 있다. 위 코드 전체를 `console.log('사과 공개 철회 중:', hidden.rows[0].count);`의 바로 아래로 **옮겨** 실행한다. 지금은 사과가 빠진 상태라 과일·채소만 5개가 되고, 나머지는 2개와 4개를 유지한다. 복사본의 다른 입력도 우유로 바꾸었다면 유제품·달걀이 3개가 된다. `console.log`에 사람이 적은 ‘사과’라는 글자도 ‘우유’로 바꾸면 관찰 기록이 실제 조건과 맞는다.

문제가 생기면 아래 순서로 확인한다.

| 증상 | 확인과 해결 |
| --- | --- |
| PGlite 패키지를 찾지 못함 | `scripts/database`에서 `npm ci`를 완료했는지 확인 |
| `supabase/migrations`를 찾지 못함 | 실습 프로그램은 `work/ch11` 루트에서 실행 |
| 공개 행이 6개 | 세 번째 분류 마이그레이션까지 적용했는지 확인 |
| 권한 검사 실패 | `SET LOCAL ROLE anon`을 제거하지 않았는지 확인 |
| 같은 테이블이 있다는 오류 | 새 메모리 DB 실행인지 확인; 원격 DB에 반복 붙여 넣지 않기 |

이 장의 완료 기준은 12개 조회, 철회 중 11개, 롤백 후 12개를 확인하고 이유를 설명하는 것이다. 10장의 계산 기능도 5,500원 합계와 4,500원 정답으로 다시 확인한다.
