import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test, { before, after } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { sampleProducts } from '../../apps/mobile/src/data/sample-products.ts';
import { buildManualImportSql, prepareManualObservations } from './manual-observations.mjs';

const migrationsUrl = new URL('../../supabase/migrations/', import.meta.url);
const seedUrl = new URL('../../supabase/seed.sql', import.meta.url);
const publicRoles = ['anon', 'authenticated'];
const firstObservationId = '00000000-0000-4000-8000-000000000001';
const observationId = '11111111-1111-4111-8111-111111111111';
const secondObservationId = '22222222-2222-4222-8222-222222222222';
const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
let db;
let seed;
let isolatedSeed;

before(async () => {
  db = await PGlite.create();
  // Supabase가 만드는 역할을 로컬 검사에만 준비합니다. 운영 migration에서 역할이나 인증 정보를 만들지 않습니다.
  await db.exec(`
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
    CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;
  `);
  const migrationNames = (await readdir(migrationsUrl)).filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/u.test(name)).sort();
  assert.ok(migrationNames.length > 0, '실제 migration 파일을 읽어 검사해야 합니다.');
  seed = await readFile(seedUrl, 'utf8');
  // seed 자체의 BEGIN/COMMIT은 최초 적용에서 실행하고, 재실행 검사에서는 바깥 롤백을 보존하도록 경계만 제외합니다.
  assert.deepEqual(seed.match(/^(?:BEGIN|COMMIT);\r?$/gmu)?.map((line) => line.trim()), ['BEGIN;', 'COMMIT;']);
  isolatedSeed = seed.replace(/^(?:BEGIN|COMMIT);\r?$/gmu, '');
  try {
    // 실제 배포 순서대로 누적 migration을 적용해 이전 제약을 바꾼 후의 최종 구조를 검사합니다.
    for (const name of migrationNames) {
      await db.exec(await readFile(new URL(name, migrationsUrl), 'utf8'));
    }
    await db.exec(seed);
  } catch (error) {
    // 준비 실패 시 긴 전체 SQL을 각 검사에 반복 출력하지 않고 원인과 위치만 남깁니다.
    throw new Error('DB 초기화 실패: ' + error.code + ' ' + error.message + ' (SQL 위치 ' + (error.position ?? '미확인') + ')');
  }
  const { rows } = await db.query('SELECT version() AS version');
  console.log('로컬 SQL 검사 엔진: ' + rows[0].version);
});

after(async () => {
  if (db) await db.close();
});

// 하나의 메모리 DB를 순서대로 사용하고 매번 롤백해, 앞선 검사의 역할·데이터·실패 상태가 다음 검사에 섞이지 않게 합니다.
async function rollback(body) {
  await db.exec('BEGIN');
  try {
    return await body();
  } finally {
    await db.exec('ROLLBACK');
  }
}

async function setRole(role) {
  assert.ok([...publicRoles, 'service_role'].includes(role));
  await db.exec('SET LOCAL ROLE ' + role);
}

async function insert(table, row) {
  assert.ok(['products', 'price_observations'].includes(table));
  const keys = Object.keys(row);
  assert.ok(keys.every((key) => /^[a-z_]+$/u.test(key)));
  return db.query(
    'INSERT INTO catalog_private.' + table + ' (' + keys.join(', ') + ') VALUES ('
      + keys.map((_, index) => '$' + (index + 1)).join(', ') + ')',
    Object.values(row),
  );
}

function product(overrides = {}) {
  return {
    id: 'test-real',
    name: '검사용 가상 상품',
    unit_label: '1개',
    is_sample: false,
    is_active: true,
    emoji: '🧪',
    color: '#E9F0F7',
    sort_order: 100,
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    id: observationId,
    product_id: 'test-real',
    is_sample: false,
    source_kind: 'approved_file',
    source_product_id: 'test-source-item',
    source_url: 'https://example.invalid/test-item',
    sales_channel: 'ssg_emart_online',
    store_id: null,
    source_price_krw: 2000,
    play_price_krw: 2000,
    play_price_rule: 'exact',
    observed_at: past,
    valid_from: null,
    valid_until: null,
    display_until: future,
    promotion_type: 'none',
    promotion_conditions: null,
    availability: 'available',
    rights_status: 'app_approved',
    publication_state: 'published',
    approval_notes: '실제 가격이나 허가 자료가 아닌 자동 검사용 가상 기록',
    ...overrides,
  };
}

function sampleObservation(overrides = {}) {
  return observation({
    product_id: 'test-sample',
    is_sample: true,
    source_kind: 'sample',
    source_product_id: null,
    source_url: null,
    sales_channel: 'sample',
    store_id: null,
    observed_at: null,
    display_until: null,
    ...overrides,
  });
}

function manualObservation(overrides = {}) {
  return observation({
    source_kind: 'manual_observation',
    rights_status: 'unknown',
    publication_state: 'draft',
    approval_notes: '검사용 가상 수동 관측. 실제 상품 자료나 이용허락이 아닙니다.',
    ...overrides,
  });
}

const manualImportNow = '2026-11-12T10:01:00.000Z';

function manualImportInput(overrides = {}) {
  // 실제 판매 자료는 테스트나 Git에 넣지 않습니다. URL의 상품 번호도 검사용 가짜 값입니다.
  return {
    sourceProductId: '9999999999991',
    sourceUrl: 'https://emart.ssg.com/item/itemView.ssg?itemId=9999999999991&siteNo=6001',
    name: '테스트 전용 가상 상품',
    unitLabel: '가상 1봉',
    priceKrw: 1234,
    observedAt: '2026-11-12T10:00:00.000Z',
    availability: 'available',
    promotionType: 'none',
    priceBasis: 'displayed_item_total',
    notes: '실제 상품이 아닌 자체 작성 검증 자료',
    loginContext: '로그인하지 않음',
    deliveryContext: '배송지를 선택하지 않음',
    ...overrides,
  };
}

function manualImportSql(input) {
  const sql = buildManualImportSql(input, { now: manualImportNow });
  // 생성기의 실제 트랜잭션 경계를 확인한 뒤 검사 바깥 ROLLBACK을 보존합니다.
  assert.deepEqual(sql.match(/^(?:BEGIN|COMMIT);\r?$/gmu)?.map((line) => line.trim()), ['BEGIN;', 'COMMIT;']);
  return sql.replace(/^(?:BEGIN|COMMIT);\r?$/gmu, '');
}

async function fixture(productOverrides = {}, observationOverrides = {}) {
  const row = product(productOverrides);
  await insert('products', row);
  await insert('price_observations', observation({ product_id: row.id, ...observationOverrides }));
}

async function visible(id = 'test-real') {
  return (await db.query('SELECT * FROM public.play_catalog WHERE id = $1', [id])).rows;
}

async function expectFailure(body, code) {
  await assert.rejects(rollback(body), (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });
}

test('예시 seed는 앱이 실제 사용하는 여섯 상품의 이름·단위·가격·표시 정보와 일치한다', async () => {
  await rollback(async () => {
    await setRole('anon');
    const { rows } = await db.query(`
      SELECT id, name, unit_label AS unit, play_price_krw AS "priceKrw", emoji, color, is_sample AS "isSample"
      FROM public.play_catalog ORDER BY sort_order, id
    `);
    assert.deepEqual(rows, sampleProducts.map(({ id, name, unit, priceKrw, emoji, color, isSample }) => ({
      id, name, unit, priceKrw, emoji, color, isSample,
    })));
  });
});

test('seed를 두 번 적용해도 상품과 관측 기록을 중복하거나 변경하지 않는다', async () => {
  await rollback(async () => {
    const productsBefore = (await db.query('SELECT * FROM catalog_private.products ORDER BY id')).rows;
    const pricesBefore = (await db.query('SELECT * FROM catalog_private.price_observations ORDER BY id')).rows;
    await db.exec(isolatedSeed);
    await db.exec(isolatedSeed);
    assert.deepEqual((await db.query('SELECT * FROM catalog_private.products ORDER BY id')).rows, productsBefore);
    assert.deepEqual((await db.query('SELECT * FROM catalog_private.price_observations ORDER BY id')).rows, pricesBefore);
  });
});

test('seed 재적용은 관리자가 철회한 가격을 다시 공개하지 않는다', async () => {
  await rollback(async () => {
    await db.query("UPDATE catalog_private.price_observations SET publication_state = 'withdrawn' WHERE id = $1", [firstObservationId]);
    await db.exec(isolatedSeed);
    await setRole('anon');
    assert.deepEqual(await visible(sampleProducts[0].id), []);
  });
});

test('두 원본 테이블의 RLS와 공개 뷰의 호출자 권한·보안 장벽 설정이 켜져 있다', async () => {
  const { rows } = await db.query(`
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catalog_private' AND c.relname IN ('products', 'price_observations')
    ORDER BY c.relname
  `);
  assert.deepEqual(rows, [
    { relname: 'price_observations', relrowsecurity: true },
    { relname: 'products', relrowsecurity: true },
  ]);
  const view = (await db.query("SELECT reloptions FROM pg_class WHERE oid = 'public.play_catalog'::regclass")).rows[0];
  assert.ok(view.reloptions.includes('security_invoker=true'));
  assert.ok(view.reloptions.includes('security_barrier=true'));
});

test('실제 역할 전환 후 anon과 authenticated 모두 superuser와 BYPASSRLS 권한이 없다', async () => {
  for (const role of publicRoles) {
    await rollback(async () => {
      await setRole(role);
      const { rows } = await db.query('SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
      assert.deepEqual(rows, [{ role, rolsuper: false, rolbypassrls: false }]);
      const schema = (await db.query("SELECT has_schema_privilege(current_user, 'catalog_private', 'USAGE') AS allowed")).rows[0];
      assert.equal(schema.allowed, false);
    });
  }
});

test('익명과 로그인 역할 모두 공개 목록을 읽으며 관리자 메모는 DTO에 포함되지 않는다', async () => {
  for (const role of publicRoles) {
    await rollback(async () => {
      await setRole(role);
      const { rows } = await db.query('SELECT * FROM public.play_catalog ORDER BY sort_order, id');
      assert.equal(rows.length, sampleProducts.length);
      assert.ok(rows.every((row) => row.is_sample && row.source_kind === 'sample' && row.observed_at === null));
      for (const row of rows) {
        assert.deepEqual(Object.keys(row).sort(), [
          'id', 'name', 'unit_label', 'source_price_krw', 'play_price_krw', 'play_price_rule',
          'is_sample', 'emoji', 'color', 'sort_order', 'price_observation_id', 'source_kind',
          'source_url', 'sales_channel', 'store_id', 'observed_at', 'valid_from', 'valid_until', 'display_until',
        ].sort());
      }
    });
  }
});

test('앱 역할은 내부 스키마와 원본 테이블을 직접 읽을 수 없다', async () => {
  for (const role of publicRoles) {
    for (const table of ['products', 'price_observations']) {
      await expectFailure(async () => {
        await setRole(role);
        // 이미 열 권한이 있는 id만 골라 스키마 접근 차단을 다른 열 권한과 독립적으로 확인합니다.
        await db.query('SELECT id FROM catalog_private.' + table);
      }, '42501');
    }
  }
});

test('스키마 접근을 검사 중에만 열어도 내부 승인 메모의 열 권한은 거부된다', async () => {
  for (const role of publicRoles) {
    await expectFailure(async () => {
      await db.exec('GRANT USAGE ON SCHEMA catalog_private TO ' + role);
      await setRole(role);
      await db.query('SELECT approval_notes FROM catalog_private.price_observations');
    }, '42501');
  }
});

test('앱 역할에는 원본과 공개 뷰의 쓰기·비우기 권한이 부여되지 않는다', async () => {
  for (const role of publicRoles) {
    for (const table of ['catalog_private.products', 'catalog_private.price_observations', 'public.play_catalog']) {
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const { rows } = await db.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, table, privilege]);
        assert.equal(rows[0].allowed, false, role + ' ' + table + ' ' + privilege);
      }
    }
  }
});

test('익명과 로그인 역할의 원본 INSERT·UPDATE·DELETE·TRUNCATE는 실제 SQL에서 거부된다', async () => {
  const statements = [
    "INSERT INTO catalog_private.products (id, name, unit_label, is_sample) VALUES ('unauthorized', '무단', '1개', true)",
    "UPDATE catalog_private.products SET name = '무단'",
    'DELETE FROM catalog_private.products',
    'TRUNCATE catalog_private.products',
    "INSERT INTO catalog_private.price_observations (product_id) VALUES ('unauthorized')",
    "UPDATE catalog_private.price_observations SET publication_state = 'withdrawn'",
    'DELETE FROM catalog_private.price_observations',
    'TRUNCATE catalog_private.price_observations',
  ];
  for (const role of publicRoles) {
    for (const sql of statements) {
      await expectFailure(async () => {
        await setRole(role);
        await db.exec(sql);
      }, '42501');
    }
  }
});

test('공개 조인 뷰는 INSERT·UPDATE·DELETE가 불가능하고 앱 역할도 쓰기 권한이 없다', async () => {
  // PostgreSQL은 조인 뷰의 수정 불가를 권한 검사보다 먼저 보고합니다. ACL 거부는 앞선 검사에서 별도로 확인합니다.
  const statements = [
    "INSERT INTO public.play_catalog (id, name) VALUES ('unauthorized', '무단')",
    "UPDATE public.play_catalog SET name = '무단'",
    'DELETE FROM public.play_catalog',
  ];
  for (const role of publicRoles) {
    for (const sql of statements) {
      await expectFailure(async () => {
        await setRole(role);
        await db.exec(sql);
      }, '55000');
    }
  }
});

test('관리자 역할은 상품과 관측 기록을 만들고 공개 상태를 변경하고 정리할 수 있다', async () => {
  await rollback(async () => {
    await setRole('service_role');
    await insert('products', product());
    await db.query("UPDATE catalog_private.products SET name = '관리자가 바꾼 이름' WHERE id = $1", ['test-real']);
    await insert('price_observations', observation());
    await db.query("UPDATE catalog_private.price_observations SET publication_state = 'withdrawn', rights_status = 'revoked', availability = 'out_of_stock' WHERE id = $1", [observationId]);
    const { rows } = await db.query('SELECT publication_state, rights_status, availability FROM catalog_private.price_observations WHERE id = $1', [observationId]);
    assert.deepEqual(rows, [{ publication_state: 'withdrawn', rights_status: 'revoked', availability: 'out_of_stock' }]);
    await db.query('DELETE FROM catalog_private.price_observations WHERE id = $1', [observationId]);
    await db.query('DELETE FROM catalog_private.products WHERE id = $1', ['test-real']);
    assert.deepEqual((await db.query('SELECT id FROM catalog_private.products WHERE id = $1', ['test-real'])).rows, []);
  });
});

test('스키마 접근만 임시로 허용해도 원본 RLS는 비활성 상품과 비공개 관측을 숨긴다', async () => {
  for (const role of publicRoles) {
    await rollback(async () => {
      await fixture({ is_active: false }, { publication_state: 'draft' });
      await db.exec('GRANT USAGE ON SCHEMA catalog_private TO ' + role);
      await setRole(role);
      assert.deepEqual((await db.query('SELECT id FROM catalog_private.products WHERE id = $1', ['test-real'])).rows, []);
      assert.deepEqual((await db.query('SELECT id FROM catalog_private.price_observations WHERE id = $1', [observationId])).rows, []);
      assert.equal((await db.query('SELECT id FROM catalog_private.products')).rows.length, sampleProducts.length);
    });
  }
});

test('공개 허가와 유효기간을 갖춘 조건 없는 온라인 가격만 공개 DTO로 읽힌다', async () => {
  for (const role of publicRoles) {
    await rollback(async () => {
      await fixture();
      await setRole(role);
      const rows = await visible();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].source_price_krw, 2000);
      assert.equal(rows[0].play_price_krw, 2000);
      assert.equal(rows[0].play_price_rule, 'exact');
      assert.equal(rows[0].is_sample, false);
      assert.equal(rows[0].source_url, 'https://example.invalid/test-item');
      assert.equal(rows[0].price_observation_id, observationId);
    });
  }
});

test('권리·공개·재고·행사·판매 채널 조건을 만족하지 않는 가격은 앱에서 보이지 않는다', async () => {
  const cases = [
    { rights_status: 'unknown' },
    { rights_status: 'revoked' },
    { publication_state: 'draft' },
    { publication_state: 'withdrawn' },
    { availability: 'out_of_stock' },
    { availability: 'unknown' },
    { promotion_type: 'member', promotion_conditions: '회원 전용' },
    { promotion_type: 'card', promotion_conditions: '특정 카드 전용' },
    { promotion_type: 'bundle', promotion_conditions: '묶음 구매' },
    { promotion_type: 'other', promotion_conditions: '기타 조건' },
    { promotion_type: 'unknown' },
    { promotion_type: 'none', promotion_conditions: '추가 조건 있음' },
    { sales_channel: 'offline_store', store_id: 'test-store' },
    { sales_channel: 'unknown' },
  ];
  for (const role of publicRoles) {
    for (const fields of cases) {
      await rollback(async () => {
        await fixture({}, fields);
        // 뷰의 WHERE 조건이 RLS 누락을 가리지 못하도록 원본의 같은 관측도 직접 조회합니다.
        await db.exec('GRANT USAGE ON SCHEMA catalog_private TO ' + role);
        await setRole(role);
        assert.deepEqual(await visible(), [], JSON.stringify(fields));
        assert.deepEqual((await db.query('SELECT id FROM catalog_private.price_observations WHERE id = $1', [observationId])).rows, [], JSON.stringify(fields));
      });
    }
  }
});

test('아직 시작하지 않았거나 끝났거나 오래된 가격은 공개하지 않는다', async () => {
  const halfHourAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const cases = [
    { valid_from: future },
    { valid_until: halfHourAgo },
    { display_until: halfHourAgo },
    { observed_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  ];
  for (const role of publicRoles) {
    for (const fields of cases) {
      await rollback(async () => {
        await fixture({}, fields);
        // 뷰의 WHERE 조건이 RLS 누락을 가리지 못하도록 원본의 같은 관측도 직접 조회합니다.
        await db.exec('GRANT USAGE ON SCHEMA catalog_private TO ' + role);
        await setRole(role);
        assert.deepEqual(await visible(), [], JSON.stringify(fields));
        assert.deepEqual((await db.query('SELECT id FROM catalog_private.price_observations WHERE id = $1', [observationId])).rows, [], JSON.stringify(fields));
      });
    }
  }
});

test('예산보다 비싼 가격은 원본에 보관할 수 있어도 놀이 목록에 노출하지 않는다', async () => {
  await rollback(async () => {
    await fixture({}, { source_price_krw: 10001, play_price_krw: 10001 });
    await setRole('anon');
    assert.deepEqual(await visible(), []);
  });
});

test('상품을 비활성화하면 유효한 공개 가격이 있어도 놀이 목록에서 사라진다', async () => {
  await rollback(async () => {
    await fixture({ is_active: false });
    await setRole('anon');
    assert.deepEqual(await visible(), []);
  });
});

test('현재 공개 가격이 만료되면 이전 철회 가격을 대신 보여 주지 않는다', async () => {
  await rollback(async () => {
    await fixture({}, { publication_state: 'withdrawn' });
    await insert('price_observations', observation({
      id: secondObservationId,
      source_price_krw: 2500,
      play_price_krw: 2500,
      display_until: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    }));
    await setRole('anon');
    assert.deepEqual(await visible(), []);
  });
});

test('한 상품에 공개 상태의 관측 기록을 둘 이상 만들 수 없다', async () => {
  await expectFailure(async () => {
    await fixture();
    await insert('price_observations', observation({ id: secondObservationId }));
  }, '23505');
});

test('관리자는 이전 가격을 철회한 뒤 새 관측을 공개할 수 있고 금액 이력은 보존된다', async () => {
  await rollback(async () => {
    await setRole('service_role');
    await fixture();
    await insert('price_observations', observation({
      id: secondObservationId, source_price_krw: 2500, play_price_krw: 2500, publication_state: 'draft',
    }));
    await db.query("UPDATE catalog_private.price_observations SET publication_state = 'withdrawn' WHERE id = $1", [observationId]);
    await db.query("UPDATE catalog_private.price_observations SET publication_state = 'published' WHERE id = $1", [secondObservationId]);
    const { rows } = await db.query('SELECT source_price_krw::integer AS price FROM catalog_private.price_observations WHERE id = $1', [observationId]);
    assert.deepEqual(rows, [{ price: 2000 }]);
    await setRole('anon');
    const current = await visible();
    assert.equal(current.length, 1);
    assert.equal(current[0].price_observation_id, secondObservationId);
    assert.equal(current[0].play_price_krw, 2500);
  });
});

test('관리자도 관측한 금액·출처·시각·승인 메모를 덮어쓰지 못한다', async () => {
  const cases = [
    ["source_price_krw = 2500, play_price_krw = 2500", []],
    ['source_product_id = $2', ['changed-source']],
    ['source_url = $2', ['https://example.invalid/changed']],
    ['observed_at = $2', [new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()]],
    ['display_until = $2', [new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()]],
    ['approval_notes = $2', ['기존 증빙을 다른 내용으로 변경']],
  ];
  for (const [assignments, values] of cases) {
    await expectFailure(async () => {
      await fixture();
      await setRole('service_role');
      await db.query('UPDATE catalog_private.price_observations SET ' + assignments + ' WHERE id = $1', [observationId, ...values]);
    }, '23514');
  }
});

test('존재하지 않는 상품을 가리키는 관측은 저장하지 못한다', async () => {
  await expectFailure(async () => {
    await insert('price_observations', observation({ product_id: 'does-not-exist' }));
  }, '23503');
});

test('예시 상품과 실제 출처 관측의 구분이 다르면 외래키가 거부한다', async () => {
  await expectFailure(async () => {
    await insert('products', product({ id: 'test-sample', is_sample: true }));
    await insert('price_observations', observation({ product_id: 'test-sample' }));
  }, '23503');
  await expectFailure(async () => {
    await insert('products', product());
    await insert('price_observations', sampleObservation({ product_id: 'test-real' }));
  }, '23503');
});

test('가격은 양의 원 단위 정수이며 소수·무한대·범위 밖 값은 거부한다', async () => {
  for (const value of [0, -1, 1500.5, 2147483648, 'NaN', 'Infinity', '-Infinity']) {
    await expectFailure(async () => {
      await insert('products', product());
      await insert('price_observations', observation({ source_price_krw: value, play_price_krw: value }));
    }, '23514');
  }
  for (const key of ['source_price_krw', 'play_price_krw']) {
    await expectFailure(async () => {
      await insert('products', product());
      await insert('price_observations', observation({ [key]: null }));
    }, '23502');
  }
});

test('놀이 가격을 반올림하거나 원래 가격과 다르게 저장할 수 없다', async () => {
  await expectFailure(async () => {
    await insert('products', product());
    await insert('price_observations', observation({ play_price_krw: 1500 }));
  }, '23514');
  await expectFailure(async () => {
    await insert('products', product());
    await insert('price_observations', observation({ play_price_rule: 'round' }));
  }, '23514');
});

test('정해지지 않은 출처·채널·행사·재고·권리·공개 상태를 저장하지 못한다', async () => {
  for (const key of ['source_kind', 'sales_channel', 'promotion_type', 'availability', 'rights_status', 'publication_state']) {
    await expectFailure(async () => {
      await insert('products', product());
      await insert('price_observations', observation({ [key]: 'not-a-known-value' }));
    }, '23514');
  }
});

test('실제 출처 관측에는 확인 시각·기한·출처 상품 식별자·HTTPS 주소가 필요하다', async () => {
  const cases = [
    { observed_at: null }, { display_until: null },
    { source_product_id: null }, { source_product_id: ' ' },
    { source_url: null }, { source_url: 'http://example.invalid/item' },
    { source_kind: 'sample' }, { sales_channel: 'sample' },
    { sales_channel: 'offline_store', store_id: null },
  ];
  for (const fields of cases) {
    await expectFailure(async () => {
      await insert('products', product());
      await insert('price_observations', observation(fields));
    }, '23514');
  }
});

test('예시 관측에 실제 출처나 확인 시각을 넣어 실제 가격처럼 저장할 수 없다', async () => {
  const cases = [
    { observed_at: past },
    { source_kind: 'approved_file' },
    { sales_channel: 'ssg_emart_online' },
    { source_product_id: 'real-id' },
    { source_url: 'https://example.invalid/item' },
    { store_id: 'some-store' },
  ];
  for (const fields of cases) {
    await expectFailure(async () => {
      await insert('products', product({ id: 'test-sample', is_sample: true }));
      await insert('price_observations', sampleObservation(fields));
    }, '23514');
  }
});

test('관측과 표시 기한은 유한해야 하고 기간의 시작과 끝 순서가 맞아야 한다', async () => {
  const cases = [
    { observed_at: 'infinity' }, { observed_at: '-infinity' },
    { display_until: 'infinity' },
    { display_until: past },
    { valid_from: future, valid_until: past },
    { valid_from: 'infinity' }, { valid_until: 'infinity' },
  ];
  for (const fields of cases) {
    await expectFailure(async () => {
      await insert('products', product());
      await insert('price_observations', observation(fields));
    }, '23514');
  }
});

test('상품의 필수 이름·단위·예시 구분이 빠지면 저장하지 못한다', async () => {
  for (const key of ['name', 'unit_label', 'is_sample']) {
    await expectFailure(async () => {
      await insert('products', product({ [key]: null }));
    }, '23502');
  }
  for (const key of ['id', 'name', 'unit_label']) {
    await expectFailure(async () => {
      await insert('products', product({ [key]: ' ' }));
    }, '23514');
  }
});

test('관측 기록이 있는 상품을 바로 삭제할 수 없어 이력 연결을 보호한다', async () => {
  await expectFailure(async () => {
    await fixture();
    await db.query('DELETE FROM catalog_private.products WHERE id = $1', ['test-real']);
  }, '23503');
});

test('관측이 생긴 뒤에는 관리자도 상품 식별자·이름·단위·예시 구분을 바꿀 수 없다', async () => {
  for (const [key, value] of [['id', 'changed-product'], ['name', '다른 이름'], ['unit_label', '2개'], ['is_sample', true]]) {
    await expectFailure(async () => {
      await fixture();
      await setRole('service_role');
      await db.query('UPDATE catalog_private.products SET ' + key + ' = $2 WHERE id = $1', ['test-real', value]);
    }, '23514');
  }
});

test('관측이 있는 상품도 표시 색상·그림·순서·활성 상태는 관리할 수 있다', async () => {
  await rollback(async () => {
    await fixture();
    await setRole('service_role');
    await db.query(`
      UPDATE catalog_private.products SET emoji = $2, color = $3, sort_order = $4, is_active = false WHERE id = $1
    `, ['test-real', '🧺', '#FFFFFF', 101]);
    const { rows } = await db.query('SELECT emoji, color, sort_order, is_active FROM catalog_private.products WHERE id = $1', ['test-real']);
    assert.deepEqual(rows, [{ emoji: '🧺', color: '#FFFFFF', sort_order: 101, is_active: false }]);
  });
});

test('관리자는 수동 관측을 실제 자료 구분의 미승인 비공개 초안으로 보관할 수 있다', async () => {
  await rollback(async () => {
    await setRole('service_role');
    await insert('products', product({ is_active: false }));
    await insert('price_observations', manualObservation());
    const { rows } = await db.query(`
      SELECT is_sample, source_kind, rights_status, publication_state,
        source_product_id, source_url, source_price_krw::integer AS price
      FROM catalog_private.price_observations WHERE id = $1
    `, [observationId]);
    assert.deepEqual(rows, [{
      is_sample: false,
      source_kind: 'manual_observation',
      rights_status: 'unknown',
      publication_state: 'draft',
      source_product_id: 'test-source-item',
      source_url: 'https://example.invalid/test-item',
      price: 2000,
    }]);
  });
});

test('수동 관측은 상품이 활성 상태여도 공개 뷰와 원본 RLS에서 숨겨진다', async () => {
  for (const role of publicRoles) {
    await rollback(async () => {
      await insert('products', product({ is_active: true }));
      await insert('price_observations', manualObservation());
      // 우연히 비활성 상태여서 숨겨진 결과가 아닌지 활성 상품과 임시 스키마 권한으로 확인합니다.
      await db.exec('GRANT USAGE ON SCHEMA catalog_private TO ' + role);
      await setRole(role);
      assert.deepEqual(await visible(), []);
      assert.deepEqual((await db.query('SELECT id FROM catalog_private.price_observations WHERE id = $1', [observationId])).rows, []);
      assert.equal((await db.query('SELECT id FROM public.play_catalog')).rows.length, sampleProducts.length);
    });
  }
});

test('수동 관측을 승인·철회·공개 상태로 직접 저장할 수 없다', async () => {
  const cases = [
    { rights_status: 'app_approved' },
    { rights_status: 'revoked' },
    { publication_state: 'published' },
    { publication_state: 'withdrawn' },
    { rights_status: 'app_approved', publication_state: 'published' },
  ];
  for (const fields of cases) {
    await expectFailure(async () => {
      await insert('products', product());
      await insert('price_observations', manualObservation(fields));
    }, '23514');
  }
});

test('수동 관측도 출처·시각·유한한 기한과 정확한 원 단위 가격이 필요하다', async () => {
  const cases = [
    { observed_at: null },
    { observed_at: 'infinity' },
    { source_product_id: null },
    { source_url: null },
    { source_url: 'http://example.invalid/test-item' },
    { display_until: null },
    { display_until: 'infinity' },
    { display_until: past },
    { sales_channel: 'sample' },
    { source_price_krw: 2000.5, play_price_krw: 2000.5 },
    { play_price_krw: 1500 },
  ];
  for (const fields of cases) {
    await expectFailure(async () => {
      await insert('products', product());
      await insert('price_observations', manualObservation(fields));
    }, '23514');
  }
  await expectFailure(async () => {
    await insert('products', product({ is_sample: true }));
    await insert('price_observations', manualObservation({ is_sample: true }));
  }, '23514');
});

test('관리자도 기존 수동 관측의 상태를 승인·공개로 승격할 수 없다', async () => {
  for (const [key, value] of [
    ['rights_status', 'app_approved'],
    ['rights_status', 'revoked'],
    ['publication_state', 'published'],
    ['publication_state', 'withdrawn'],
  ]) {
    await expectFailure(async () => {
      await insert('products', product());
      await insert('price_observations', manualObservation());
      await setRole('service_role');
      await db.query('UPDATE catalog_private.price_observations SET ' + key + ' = $2 WHERE id = $1', [observationId, value]);
    }, '23514');
  }
});

test('수동 관측의 출처를 허락된 API·파일로 바꾸거나 관측 사실을 덮어쓸 수 없다', async () => {
  const cases = [
    ['source_kind', 'approved_api'],
    ['source_kind', 'approved_file'],
    ['source_url', 'https://example.invalid/changed'],
    ['source_product_id', 'changed-source'],
    ['observed_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()],
  ];
  for (const [key, value] of cases) {
    await expectFailure(async () => {
      await insert('products', product());
      await insert('price_observations', manualObservation());
      await setRole('service_role');
      await db.query('UPDATE catalog_private.price_observations SET ' + key + ' = $2 WHERE id = $1', [observationId, value]);
    }, '23514');
  }
});

test('수동 관측을 보관해도 예시 seed 재실행과 공개 상품 6개의 내용은 유지된다', async () => {
  await rollback(async () => {
    await insert('products', product({ is_active: false }));
    await insert('price_observations', manualObservation());
    const stored = (await db.query('SELECT * FROM catalog_private.price_observations WHERE id = $1', [observationId])).rows;
    await db.exec(isolatedSeed);
    assert.deepEqual((await db.query('SELECT * FROM catalog_private.price_observations WHERE id = $1', [observationId])).rows, stored);
    await setRole('anon');
    const { rows } = await db.query(`
      SELECT id, name, unit_label AS unit, play_price_krw AS "priceKrw", emoji, color, is_sample AS "isSample"
      FROM public.play_catalog ORDER BY sort_order, id
    `);
    assert.deepEqual(rows, sampleProducts.map(({ id, name, unit, priceKrw, emoji, color, isSample }) => ({
      id, name, unit, priceKrw, emoji, color, isSample,
    })));
  });
});

test('생성한 적재 SQL을 실행하면 비활성 상품과 미승인 수동 가격 이력이 함께 저장된다', async () => {
  await rollback(async () => {
    await setRole('service_role');
    const input = [manualImportInput()];
    const prepared = prepareManualObservations(input, { now: manualImportNow });
    await db.exec(manualImportSql(input));
    const storedProduct = (await db.query('SELECT * FROM catalog_private.products WHERE id = $1', [prepared.products[0].id])).rows[0];
    const { created_at, ...productFields } = storedProduct;
    assert.ok(created_at);
    assert.deepEqual(productFields, prepared.products[0]);
    const stored = (await db.query('SELECT * FROM catalog_private.price_observations WHERE id = $1', [prepared.observations[0].id])).rows[0];
    const expected = prepared.observations[0];
    for (const [key, value] of Object.entries(expected)) {
      if (['observed_at', 'display_until'].includes(key)) {
        assert.equal(Date.parse(stored[key]), Date.parse(value), key);
      } else if (['source_price_krw', 'play_price_krw'].includes(key)) {
        assert.equal(Number(stored[key]), value, key);
      } else {
        assert.equal(stored[key], value, key);
      }
    }
  });
});

test('같은 관측의 적재 SQL을 재실행해도 이력을 중복하거나 관리자 표시 설정을 되돌리지 않는다', async () => {
  await rollback(async () => {
    const input = [manualImportInput()];
    const sql = manualImportSql(input);
    await db.exec(sql);
    await db.query("UPDATE catalog_private.products SET is_active = true, color = '#FFFFFF', sort_order = 2000 WHERE id = $1", ['ssg-emart-9999999999991']);
    const productsBefore = (await db.query('SELECT * FROM catalog_private.products ORDER BY id')).rows;
    const pricesBefore = (await db.query('SELECT * FROM catalog_private.price_observations ORDER BY id')).rows;
    await db.exec(sql);
    await db.exec(sql);
    assert.deepEqual((await db.query('SELECT * FROM catalog_private.products ORDER BY id')).rows, productsBefore);
    assert.deepEqual((await db.query('SELECT * FROM catalog_private.price_observations ORDER BY id')).rows, pricesBefore);
    await setRole('anon');
    assert.equal((await db.query('SELECT id FROM public.play_catalog')).rows.length, sampleProducts.length);
  });
});

test('같은 상품의 새로운 가격 관측을 적재하면 앞선 가격을 보존하고 새 이력을 만든다', async () => {
  await rollback(async () => {
    await db.exec(manualImportSql([manualImportInput()]));
    await db.exec(manualImportSql([manualImportInput({ priceKrw: 1400, observedAt: '2026-11-12T10:00:30.000Z' })]));
    const { rows } = await db.query(`
      SELECT source_price_krw::integer AS price, publication_state, rights_status
      FROM catalog_private.price_observations WHERE product_id = $1 ORDER BY observed_at
    `, ['ssg-emart-9999999999991']);
    assert.deepEqual(rows, [
      { price: 1234, publication_state: 'draft', rights_status: 'unknown' },
      { price: 1400, publication_state: 'draft', rights_status: 'unknown' },
    ]);
    assert.equal((await db.query('SELECT id FROM catalog_private.products WHERE id = $1', ['ssg-emart-9999999999991'])).rows.length, 1);
  });
});

test('묶음 뒤쪽 상품의 이름 충돌이 나면 앞쪽 상품과 가격도 실제 트랜잭션에서 저장되지 않는다', async () => {
  const conflictId = 'ssg-emart-9999999999992';
  const firstId = 'ssg-emart-9999999999991';
  await insert('products', product({ id: conflictId, name: '이미 보관된 다른 이름', unit_label: '가상 1봉', is_active: false }));
  try {
    const sql = buildManualImportSql([
      manualImportInput(),
      manualImportInput({
        sourceProductId: '9999999999992',
        sourceUrl: 'https://emart.ssg.com/item/itemView.ssg?itemId=9999999999992&siteNo=6001',
      }),
    ], { now: manualImportNow });
    await assert.rejects(db.exec(sql), (error) => error.code === '23514');
    // 오류가 난 명시적 트랜잭션을 정리하고, 앞서 삽입한 행까지 취소된 사실을 확인합니다.
    await db.exec('ROLLBACK');
    assert.deepEqual((await db.query('SELECT id FROM catalog_private.products WHERE id = $1', [firstId])).rows, []);
    assert.deepEqual((await db.query('SELECT id FROM catalog_private.price_observations WHERE product_id = ANY($1)', [[firstId, conflictId]])).rows, []);
    assert.deepEqual((await db.query('SELECT name FROM catalog_private.products WHERE id = $1', [conflictId])).rows, [{ name: '이미 보관된 다른 이름' }]);
  } finally {
    await db.exec('ROLLBACK');
    await db.query('DELETE FROM catalog_private.price_observations WHERE product_id = ANY($1)', [[firstId, conflictId]]);
    await db.query('DELETE FROM catalog_private.products WHERE id = ANY($1)', [[firstId, conflictId]]);
  }
});

test('기존 관측의 관리 상태가 바뀐 뒤 예전 적재를 재시도하면 차이를 숨기지 않고 거부한다', async () => {
  await expectFailure(async () => {
    const input = [manualImportInput()];
    const prepared = prepareManualObservations(input, { now: manualImportNow });
    const sql = manualImportSql(input);
    await db.exec(sql);
    await db.query("UPDATE catalog_private.price_observations SET availability = 'out_of_stock' WHERE id = $1", [prepared.observations[0].id]);
    await db.exec(sql);
  }, '23514');
});

test('상품 이름과 메모의 따옴표·SQL 문장은 실행되지 않고 문자 자료로만 저장된다', async () => {
  await rollback(async () => {
    const name = "가상 상품 '; DROP SCHEMA public CASCADE; --";
    const notes = "검사용 '따옴표'와 $manual_price_import$; DELETE FROM catalog_private.products; --";
    await db.exec(manualImportSql([manualImportInput({ name, notes })]));
    assert.deepEqual((await db.query('SELECT name FROM catalog_private.products WHERE id = $1', ['ssg-emart-9999999999991'])).rows, [{ name }]);
    const { rows } = await db.query('SELECT approval_notes FROM catalog_private.price_observations WHERE product_id = $1', ['ssg-emart-9999999999991']);
    assert.ok(rows[0].approval_notes.includes(notes));
    assert.equal((await db.query('SELECT id FROM public.play_catalog')).rows.length, sampleProducts.length);
  });
});

test('앱 역할은 생성된 관리자 적재 SQL도 실행할 수 없다', async () => {
  for (const role of publicRoles) {
    await expectFailure(async () => {
      await setRole(role);
      await db.exec(manualImportSql([manualImportInput()]));
    }, '42501');
  }
});
