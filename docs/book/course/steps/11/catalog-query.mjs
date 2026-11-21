import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(path.join(root, 'scripts/database/package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = await PGlite.create();
try {
  // 운영 역할 생성은 하지 않습니다. 종료하면 사라지는 로컬 DB에서만 역할을 준비합니다.
  await db.exec(`CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;`);
  const folder = path.join(root, 'supabase/migrations');
  for (const name of (await readdir(folder)).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort()) {
    await db.exec(await readFile(path.join(folder, name), 'utf8'));
  }
  await db.exec(await readFile(path.join(root, 'supabase/seed.sql'), 'utf8'));
  await db.exec('BEGIN; SET LOCAL ROLE anon');
  const initial = await db.query('SELECT id,name,category_id,play_price_krw FROM public.play_catalog ORDER BY sort_order,id');
  assert.equal(initial.rows.length, 12);
  console.table(initial.rows);
  console.log('공개 역할 조회:', initial.rows.length);
  await db.exec('ROLLBACK');

  // 변경은 메모리 DB의 트랜잭션 안에서만 적용하고 즉시 되돌립니다.
  await db.exec("BEGIN; UPDATE catalog_private.price_observations SET publication_state='withdrawn' WHERE product_id='sample-apple'; SET LOCAL ROLE anon");
  const hidden = await db.query('SELECT count(*)::integer AS count FROM public.play_catalog');
  assert.equal(hidden.rows[0].count, 11);
  console.log('사과 공개 철회 중:', hidden.rows[0].count);
  await db.exec('ROLLBACK');
  await db.exec('BEGIN; SET LOCAL ROLE anon');
  const restored = await db.query('SELECT count(*)::integer AS count FROM public.play_catalog');
  assert.equal(restored.rows[0].count, 12);
  console.log('롤백 후:', restored.rows[0].count);
  await db.exec('ROLLBACK');
} finally {
  await db.close();
}
