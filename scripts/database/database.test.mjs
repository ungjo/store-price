import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { before, after } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { sampleProducts } from '../../apps/mobile/src/data/sample-products.ts';

const migrationUrl = new URL('../../supabase/migrations/20261112090000_catalog.sql', import.meta.url);
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
  const migration = await readFile(migrationUrl, 'utf8');
  seed = await readFile(seedUrl, 'utf8');
  // seed 자체의 BEGIN/COMMIT은 최초 적용에서 실행하고, 재실행 검사에서는 바깥 롤백을 보존하도록 경계만 제외합니다.
  assert.deepEqual(seed.match(/^(?:BEGIN|COMMIT);\r?$/gmu)?.map((line) => line.trim()), ['BEGIN;', 'COMMIT;']);
  isolatedSeed = seed.replace(/^(?:BEGIN|COMMIT);\r?$/gmu, '');
  try {
    await db.exec(migration);
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
