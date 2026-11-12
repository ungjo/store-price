import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sampleProducts } from '../../apps/mobile/src/data/sample-products.ts';
import {
  assertCatalogEnvironmentUnchanged, captureCatalogEnvironment, checkCatalogHttp,
  createCatalogLogWriter, pinnedCatalogEnvironment, redactCatalogText, catalogProjectRef,
} from './catalog-http-check.mjs';

const testUrl = 'https://catalog-check-fixture.supabase.co';
const testKey = 'sb_publishable_test_only_key';
const urlVariable = 'EXPO_PUBLIC_SUPABASE_URL';
const keyVariable = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const envText = (key = testKey) => `${urlVariable}=${testUrl}\n${keyVariable}=${key}\n`;

function fixture(t, content = envText()) {
  const tempRoot = path.resolve(os.tmpdir());
  const root = mkdtempSync(path.join(tempRoot, 'store-price-catalog-test-'));
  t.after(() => {
    // 삭제 대상은 이 테스트가 만든 임시 디렉터리 한 곳으로 제한합니다.
    assert.equal(path.dirname(root), tempRoot);
    assert.ok(path.basename(root).startsWith('store-price-catalog-test-'));
    rmSync(root, { recursive: true, force: true });
  });
  if (content !== null) writeFileSync(path.join(root, '.env.local'), content, 'utf8');
  return root;
}

function rows() {
  return sampleProducts.map((product, index) => ({
    id: product.id, name: product.name, unit_label: product.unit,
    source_price_krw: product.priceKrw, play_price_krw: product.priceKrw,
    play_price_rule: 'exact', is_sample: product.isSample,
    emoji: product.emoji, color: product.color,
    price_observation_id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
  }));
}

function responder({ products = rows(), privateResponse, notesResponse, seen = [] } = {}) {
  return async (url, options) => {
    seen.push({ url, options });
    if (options.headers['Accept-Profile'] === 'catalog_private') {
      return privateResponse?.() ?? Response.json({ code: 'PGRST106' }, { status: 406 });
    }
    if (url.includes('select=approval_notes')) {
      return notesResponse?.() ?? Response.json({ code: '42703' }, { status: 400 });
    }
    return Response.json(products, {
      headers: { 'Content-Range': products.length ? `0-${products.length - 1}/${products.length}` : '*/0' },
    });
  };
}

test('environment precedence and pinned Expo config are explicit without serializing the key', (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, '.env'), envText('sb_publishable_base'));
  writeFileSync(path.join(root, '.env.development'), envText('sb_publishable_development'));
  writeFileSync(path.join(root, '.env.development.local'), envText('sb_publishable_priority'));
  const env = { [keyVariable]: 'sb_publishable_process' };
  const state = captureCatalogEnvironment(root, env);
  const pinned = pinnedCatalogEnvironment(state, { EXPO_NO_CLIENT_ENV_VARS: '1', KEEP: 'yes',
    EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW: '1', EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN: 'inherited-token',
    EXPO_PUBLIC_CATALOG_TEST_SCENARIO: 'pending-choice' }, 'test-run');
  assert.equal(pinned[keyVariable], env[keyVariable]);
  assert.equal(pinned[urlVariable], testUrl);
  assert.equal(pinned.EXPO_NO_DOTENV, '1');
  assert.equal(pinned.EXPO_PUBLIC_DEVICE_RUN_ID, 'test-run');
  assert.equal(pinned.EXPO_NO_CLIENT_ENV_VARS, undefined);
  assert.equal(pinned.KEEP, 'yes');
  assert.equal(pinned.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW, undefined);
  assert.equal(pinned.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN, undefined);
  assert.equal(pinned.EXPO_PUBLIC_CATALOG_TEST_SCENARIO, undefined);
  assert.equal(catalogProjectRef(state), 'catalog-check-fixture');
  assert.equal(JSON.stringify(state).includes('sb_publishable_'), false);
  assert.match(state.fingerprint, /^[a-f0-9]{64}$/u);
  assertCatalogEnvironmentUnchanged(state, env);
  const fileState = captureCatalogEnvironment(root, {});
  assert.equal(pinnedCatalogEnvironment(fileState, {})[keyVariable], 'sb_publishable_priority');
});

test('changed, newly created, and process override inputs invalidate the captured environment', (t) => {
  const root = fixture(t);
  const state = captureCatalogEnvironment(root, {});
  assertCatalogEnvironmentUnchanged(state, {});
  assert.throws(() => assertCatalogEnvironmentUnchanged(state, { [keyVariable]: testKey }));
  writeFileSync(path.join(root, '.env.local'), envText() + '# changed\n');
  assert.throws(() => assertCatalogEnvironmentUnchanged(state, {}));
  writeFileSync(path.join(root, '.env.local'), envText());
  assertCatalogEnvironmentUnchanged(state, {});
  writeFileSync(path.join(root, '.env.development.local'), '# newly created\n');
  assert.throws(() => assertCatalogEnvironmentUnchanged(state, {}));
});

test('missing and privileged configuration is rejected without echoing input', (t) => {
  const root = fixture(t, null);
  assert.throws(() => captureCatalogEnvironment(root, {}), /\.env\.local/u);
  const secret = 'sb_secret_never_print_this';
  assert.throws(() => captureCatalogEnvironment(root, {
    [urlVariable]: testUrl, [keyVariable]: secret,
  }), (error) => !error.message.includes(secret));
  assert.throws(() => captureCatalogEnvironment(root, { [urlVariable]: testUrl }));
});

test('key redaction survives split output chunks and preserves Korean text', (t) => {
  const state = captureCatalogEnvironment(fixture(t), {});
  const output = [];
  const writer = createCatalogLogWriter(state, (text) => output.push(text));
  const bytes = Buffer.from(`검사 ${testKey}\n완료 ${testKey}`, 'utf8');
  for (let index = 0; index < bytes.length; index += 2) writer.write(bytes.subarray(index, index + 2));
  writer.end();
  assert.equal(output.join(''), '검사 <supabase-publishable-key>\n완료 <supabase-publishable-key>');
  assert.equal(redactCatalogText(state, testKey).includes(testKey), false);
});

test('HTTP verification uses only anonymous GET and returns safe evidence for six exact examples', async (t) => {
  const state = captureCatalogEnvironment(fixture(t), {});
  const seen = [];
  const result = await checkCatalogHttp(state, { fetch: responder({ seen }) });
  assert.equal(result.productCount, 6);
  assert.equal(result.projectHost, new URL(testUrl).host);
  assert.equal(result.privateSchemaBlocked, true);
  assert.equal(result.approvalNotesBlocked, true);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(result).includes(testKey), false);
  assert.equal(seen.length, 3);
  for (const request of seen) {
    assert.equal(request.options.method, 'GET');
    assert.equal(request.options.headers.apikey, testKey);
    assert.equal(Object.keys(request.options.headers).some((name) => name.toLowerCase() === 'authorization'), false);
    assert.equal(request.url.includes(testKey), false);
  }
  const after = await checkCatalogHttp(state, { fetch: responder(), previous: result });
  assert.equal(after.fingerprint, result.fingerprint);
});

test('an accessible private schema or notes column cannot count as denied', async (t) => {
  const state = captureCatalogEnvironment(fixture(t), {});
  await assert.rejects(checkCatalogHttp(state, { fetch: responder({ privateResponse: () => Response.json([]) }) }));
  await assert.rejects(checkCatalogHttp(state, { fetch: responder({ notesResponse: () => Response.json([]) }) }));
});

test('only recognized authorization errors count as access denial', async (t) => {
  const state = captureCatalogEnvironment(fixture(t), {});
  await assert.rejects(checkCatalogHttp(state, {
    fetch: responder({ privateResponse: () => Response.json({ code: 'invalid_api_key' }, { status: 401 }) }),
  }));
  await assert.rejects(checkCatalogHttp(state, {
    fetch: responder({ notesResponse: () => Response.json({ code: '42501' }, { status: 500 }) }),
  }));
  const allowed = await checkCatalogHttp(state, {
    fetch: responder({
      privateResponse: () => Response.json({ code: '42501' }, { status: 401 }),
      notesResponse: () => Response.json({ code: 'PGRST204' }, { status: 400 }),
    }),
  });
  assert.equal(allowed.privateSchemaBlocked, true);
});

test('changed product, order, and count fail the deterministic native fixture requirement', async (t) => {
  const state = captureCatalogEnvironment(fixture(t), {});
  const changed = rows();
  changed[0] = { ...changed[0], name: 'changed product' };
  for (const products of [changed, rows().reverse(), rows().slice(1)]) {
    await assert.rejects(checkCatalogHttp(state, { fetch: responder({ products }) }));
  }
});

test('changed price observation fails the before/after check even when displayed prices match', async (t) => {
  const state = captureCatalogEnvironment(fixture(t), {});
  const before = await checkCatalogHttp(state, { fetch: responder() });
  const products = rows();
  products[0].price_observation_id = '11111111-1111-1111-1111-111111111111';
  await assert.rejects(checkCatalogHttp(state, { fetch: responder({ products }), previous: before }));
});

test('transport and response errors never echo the publishable key or raw error body', async (t) => {
  const state = captureCatalogEnvironment(fixture(t), {});
  const injected = `${testKey} raw-private-detail`;
  await assert.rejects(checkCatalogHttp(state, { fetch: async () => { throw new Error(injected); } }),
    (error) => !error.message.includes(injected) && !error.message.includes(testKey));
  await assert.rejects(checkCatalogHttp(state, {
    fetch: responder({ privateResponse: () => Response.json({ code: injected }, { status: 500 }) }),
  }), (error) => !error.message.includes(injected) && !error.message.includes(testKey));
});
