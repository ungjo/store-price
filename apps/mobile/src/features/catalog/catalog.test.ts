import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import test from 'node:test';

import {
  CATALOG_TIMEOUT_MS,
  MAX_CATALOG_PRODUCTS,
  loadCatalog,
  parseCatalogRows,
  readCatalogConfig,
  type CatalogConfig,
} from './catalog.ts';

const config: CatalogConfig = {
  url: 'https://abcdefghijklmnopqrst.supabase.co',
  publishableKey: 'sb_publishable_fixture_only_not_a_real_key',
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sample-apple',
    name: '사과',
    unit_label: '1개',
    source_price_krw: 1500,
    play_price_krw: 1500,
    play_price_rule: 'exact',
    is_sample: true,
    emoji: '🍎',
    color: '#FBECE6',
    price_observation_id: '00000000-0000-4000-8000-000000000001',
    ...overrides,
  };
}

function jsonResponse(value: unknown, range?: string, status = 200): Response {
  const count = Array.isArray(value) ? value.length : 0;
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': range ?? (count ? '0-' + (count - 1) + '/' + count : '*/0'),
    },
  });
}

function fetchRows(value: unknown, range?: string): typeof globalThis.fetch {
  return async () => jsonResponse(value, range);
}

function assertSanitized(error: unknown): boolean {
  assert.ok(error instanceof Error);
  assert.equal(error.message.includes(config.publishableKey), false);
  assert.equal(error.message.includes(config.url), false);
  assert.equal(error.message.includes('PRIVATE_RESPONSE'), false);
  return true;
}

test('주소와 키가 모두 없으면 연결 설정 없음으로 구분한다', () => {
  assert.equal(readCatalogConfig(undefined, undefined), null);
  assert.equal(readCatalogConfig('  ', ''), null);
});

test('공개 설정은 바깥 공백과 주소의 마지막 슬래시만 정리한다', () => {
  assert.deepEqual(readCatalogConfig('  ' + config.url + '/ ', ' ' + config.publishableKey + ' '), config);
});

test('주소나 키만 있는 불완전한 설정은 입력값을 드러내지 않고 거부한다', () => {
  assert.throws(() => readCatalogConfig(config.url, undefined), assertSanitized);
  assert.throws(() => readCatalogConfig(undefined, config.publishableKey), assertSanitized);
});

test('HTTPS 프로젝트 주소 이외의 경로·포트·사용자정보·다른 호스트는 거부한다', () => {
  const invalidUrls = [
    'http://abcdefghijklmnopqrst.supabase.co',
    config.url + '/rest/v1',
    config.url + ':443',
    config.url + '?apikey=PRIVATE_RESPONSE',
    config.url + '#fragment',
    'https://user:password@abcdefghijklmnopqrst.supabase.co',
    config.url + '.evil.invalid',
    'https://a.b.supabase.co',
    'https://example.invalid',
    'https://-invalid.supabase.co',
  ];
  for (const url of invalidUrls) {
    assert.throws(() => readCatalogConfig(url, config.publishableKey), assertSanitized);
  }
});

test('secret·이전 JWT·빈 접두사·잘못된 문자 키는 공개 앱 설정으로 받지 않는다', () => {
  for (const key of ['sb_secret_PRIVATE_RESPONSE', 'eyJhbGciOiJIUzI1NiJ9.PRIVATE_RESPONSE.signature',
    'sb_publishable_', 'sb_publishable_공개키', 'sb_publishable_a b', 'sb_publishable_' + 'a'.repeat(257)]) {
    assert.throws(() => readCatalogConfig(config.url, key), (error) => {
      assertSanitized(error);
      assert.ok(error instanceof Error);
      // 공개 접두사 안내는 필요하지만 실제 입력한 키 문자열은 되풀이하지 않습니다.
      if (key !== 'sb_publishable_') assert.equal(error.message.includes(key), false);
      return true;
    });
  }
});

test('loader를 직접 호출해도 잘못된 설정은 요청 전에 다시 거부한다', async () => {
  let calls = 0;
  const fakeFetch: typeof globalThis.fetch = async () => { calls += 1; return jsonResponse([]); };
  await assert.rejects(loadCatalog({ ...config, publishableKey: 'sb_secret_PRIVATE_RESPONSE' }, { fetch: fakeFetch }), assertSanitized);
  assert.equal(calls, 0);
});

test('정상 DB 행을 앱 상품으로 복사하고 예시 여부와 관측 ID를 보존한다', () => {
  const input = Object.freeze(row({ is_sample: false, approval_notes: 'PRIVATE_RESPONSE' }));
  assert.deepEqual(parseCatalogRows([input]), [{
    id: 'sample-apple', name: '사과', unit: '1개', priceKrw: 1500, emoji: '🍎', color: '#FBECE6',
    isSample: false, priceObservationId: '00000000-0000-4000-8000-000000000001',
  }]);
  assert.deepEqual(input, row({ is_sample: false, approval_notes: 'PRIVATE_RESPONSE' }));
});

test('빈 공개 목록은 정상적인 빈 배열로 반환한다', () => {
  assert.deepEqual(parseCatalogRows([]), []);
});

test('배열이 아닌 응답과 객체가 아닌 상품은 거부한다', () => {
  for (const value of [null, undefined, {}, 'PRIVATE_RESPONSE', 1, [null], [true], [[]]]) {
    assert.throws(() => parseCatalogRows(value), assertSanitized);
  }
});

test('상품 식별자와 화면 문자열은 정해진 길이와 비어 있지 않은 값이어야 한다', () => {
  const cases = [
    { id: '' }, { id: 'UPPERCASE' }, { id: 'bad/id' }, { id: 'a'.repeat(129) },
    { name: null }, { name: '' }, { name: ' ' }, { name: '가'.repeat(121) }, { name: '사과\nPRIVATE_RESPONSE' },
    { unit_label: undefined }, { unit_label: ' ' }, { unit_label: '개'.repeat(121) },
    { emoji: '' }, { emoji: ' ' }, { emoji: '🍎'.repeat(17) },
    { color: 'red' }, { color: '#fff' }, { color: '#FFFFFF;PRIVATE_RESPONSE' },
  ];
  for (const fields of cases) assert.throws(() => parseCatalogRows([row(fields)]), assertSanitized);
});

test('가격은 원 단위 숫자 정수 1~10000이며 원래 가격과 정확히 같아야 한다', () => {
  for (const price of [0, -1, 1500.5, 10001, NaN, Infinity, '1500', null]) {
    assert.throws(() => parseCatalogRows([row({ source_price_krw: price, play_price_krw: price })]), assertSanitized);
  }
  assert.throws(() => parseCatalogRows([row({ source_price_krw: 1499 })]), assertSanitized);
  assert.throws(() => parseCatalogRows([row({ source_price_krw: '1500' })]), assertSanitized);
  assert.throws(() => parseCatalogRows([row({ play_price_rule: 'round' })]), assertSanitized);
  assert.equal(parseCatalogRows([row({ source_price_krw: 10000, play_price_krw: 10000 })])[0].priceKrw, 10000);
});

test('예시 구분은 boolean이고 가격 관측 ID는 UUID여야 한다', () => {
  for (const fields of [
    { is_sample: 'true' }, { is_sample: null }, { is_sample: undefined },
    { price_observation_id: undefined }, { price_observation_id: 'PRIVATE_RESPONSE' },
    { price_observation_id: '00000000-0000-4000-8000-000000000001\n' },
  ]) assert.throws(() => parseCatalogRows([row(fields)]), assertSanitized);
});

test('상품 ID나 관측 ID가 중복된 응답은 전체를 거부한다', () => {
  assert.throws(() => parseCatalogRows([row(), row({ price_observation_id: '00000000-0000-4000-8000-000000000002' })]), assertSanitized);
  assert.throws(() => parseCatalogRows([row(), row({ id: 'sample-milk' })]), assertSanitized);
});

test('정상 상품 뒤의 불량 상품도 무시하지 않고 전체 응답을 거부한다', () => {
  assert.throws(() => parseCatalogRows([row(), row({
    id: 'sample-milk', price_observation_id: '00000000-0000-4000-8000-000000000002', play_price_krw: 2.5,
  })]), assertSanitized);
});

test('최대 1000개까지 확인하며 한도를 넘으면 일부만 반환하지 않는다', () => {
  const rows = Array.from({ length: MAX_CATALOG_PRODUCTS }, (_, index) => row({
    id: 'product-' + index,
    price_observation_id: '00000000-0000-4000-8000-' + index.toString(16).padStart(12, '0'),
  }));
  assert.equal(parseCatalogRows(rows).length, 1000);
  assert.throws(() => parseCatalogRows([...rows, row()]), /너무 많아/u);
});

test('공개 뷰에 GET으로 필요한 열·정렬·전체 개수를 요청하고 Bearer 헤더를 보내지 않는다', async () => {
  let calls = 0;
  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    calls += 1;
    const url = new URL(String(input));
    assert.equal(url.origin, config.url);
    assert.equal(url.pathname, '/rest/v1/play_catalog');
    assert.equal(url.searchParams.get('order'), 'sort_order.asc,id.asc');
    assert.equal(url.searchParams.get('limit'), '1000');
    assert.equal(url.searchParams.get('select'), 'id,name,unit_label,source_price_krw,play_price_krw,play_price_rule,is_sample,emoji,color,price_observation_id');
    assert.equal(init?.method, 'GET');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('apikey'), config.publishableKey);
    assert.equal(headers.get('Authorization'), null);
    assert.equal(headers.get('Prefer'), 'count=exact');
    assert.equal(headers.get('Accept'), 'application/json');
    assert.ok(init?.signal);
    return jsonResponse([row()]);
  };
  assert.deepEqual(await loadCatalog(config, { fetch: fakeFetch }), parseCatalogRows([row()]));
  assert.equal(calls, 1);
});

test('HTTP 성공과 전체 개수 0인 빈 목록도 성공으로 반환한다', async () => {
  assert.deepEqual(await loadCatalog(config, { fetch: fetchRows([]) }), []);
});

test('HTTP 실패는 응답 본문을 읽거나 키를 노출하지 않고 한 번만 실패한다', async () => {
  for (const status of [401, 403, 404, 500]) {
    let bodyRead = false;
    let calls = 0;
    const response = new Response('PRIVATE_RESPONSE ' + config.publishableKey, { status });
    response.json = async () => { bodyRead = true; throw new Error('PRIVATE_RESPONSE'); };
    await assert.rejects(loadCatalog(config, { fetch: async () => { calls += 1; return response; } }), assertSanitized);
    assert.equal(bodyRead, false);
    assert.equal(calls, 1);
  }
});

test('JSON 해석 실패와 불량 행은 서버 원문 없이 정제된 오류를 반환한다', async () => {
  await assert.rejects(loadCatalog(config, {
    fetch: async () => new Response('PRIVATE_RESPONSE ' + config.publishableKey, { headers: { 'Content-Range': '0-0/1' } }),
  }), assertSanitized);
  await assert.rejects(loadCatalog(config, { fetch: fetchRows([row({ name: null })]) }), assertSanitized);
});

test('전체 개수가 없거나 응답이 잘렸거나 범위가 다른 경우 성공으로 처리하지 않는다', async () => {
  for (const range of ['0-0/*', '0-0/2', '1-1/1', '0-1/1', '*/1', 'PRIVATE_RESPONSE']) {
    await assert.rejects(loadCatalog(config, { fetch: fetchRows([row()], range) }), assertSanitized);
  }
  await assert.rejects(loadCatalog(config, {
    fetch: async () => new Response(JSON.stringify([row()])),
  }), assertSanitized);
});

test('서버의 전체 목록이 1000개를 넘으면 내려온 일부 행만 사용하지 않는다', async () => {
  await assert.rejects(loadCatalog(config, { fetch: fetchRows([row()], '0-0/1001') }), /너무 많아/u);
});

test('네트워크 오류에 주소나 헤더가 포함되어도 사용자 오류에 복사하지 않는다', async () => {
  await assert.rejects(loadCatalog(config, {
    fetch: async () => { throw new Error('PRIVATE_RESPONSE ' + config.url + ' ' + config.publishableKey); },
  }), assertSanitized);
});

test('이미 취소된 호출은 네트워크 요청을 시작하지 않는다', async () => {
  const controller = new AbortController();
  controller.abort(new Error('PRIVATE_RESPONSE ' + config.publishableKey));
  let calls = 0;
  await assert.rejects(loadCatalog(config, {
    signal: controller.signal,
    fetch: async () => { calls += 1; return jsonResponse([]); },
  }), (error) => {
    assertSanitized(error);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'AbortError');
    return true;
  });
  assert.equal(calls, 0);
});

test('진행 중 취소는 fetch가 취소를 무시해도 종료하고 외부 취소 사유를 감춘다', async () => {
  const controller = new AbortController();
  const sent: AbortSignal[] = [];
  const pending = loadCatalog(config, {
    signal: controller.signal,
    fetch: async (_, init) => {
      assert.ok(init?.signal);
      sent.push(init.signal);
      return new Promise<Response>(() => {});
    },
  });
  const rejected = assert.rejects(pending, (error) => {
    assertSanitized(error);
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'AbortError');
    return true;
  });
  controller.abort(new Error('PRIVATE_RESPONSE ' + config.publishableKey));
  await rejected;
  assert.equal(sent[0].aborted, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('12초가 지나면 멈춘 요청을 취소하고 대기를 끝낸다', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: AbortSignal[] = [];
  const pending = loadCatalog(config, {
    fetch: async (_, init) => {
      assert.ok(init?.signal);
      sent.push(init.signal);
      return new Promise<Response>(() => {});
    },
  });
  const rejected = assert.rejects(pending, /기다리는 시간이 길어졌어요/u);
  context.mock.timers.tick(CATALOG_TIMEOUT_MS);
  await rejected;
  assert.equal(sent[0].aborted, true);
});

test('응답 본문을 읽다가 멈춰도 같은 제한 시간이 적용된다', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let bodyRead = false;
  const response = jsonResponse([row()]);
  response.json = async () => { bodyRead = true; return new Promise<unknown>(() => {}); };
  const pending = loadCatalog(config, { fetch: async () => response });
  const rejected = assert.rejects(pending, /기다리는 시간이 길어졌어요/u);
  await Promise.resolve();
  assert.equal(bodyRead, true);
  context.mock.timers.tick(CATALOG_TIMEOUT_MS);
  await rejected;
});

test('성공 후에는 타이머와 외부 취소 연결을 정리한다', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  const sent: AbortSignal[] = [];
  await loadCatalog(config, {
    signal: controller.signal,
    fetch: async (_, init) => {
      assert.ok(init?.signal);
      sent.push(init.signal);
      return jsonResponse([row()]);
    },
  });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  context.mock.timers.tick(CATALOG_TIMEOUT_MS);
  controller.abort();
  assert.equal(sent[0].aborted, false);
});

test('실패 후에도 타이머와 외부 취소 연결을 정리한다', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  await assert.rejects(loadCatalog(config, {
    signal: controller.signal,
    fetch: async () => new Response('PRIVATE_RESPONSE', { status: 503 }),
  }), assertSanitized);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  context.mock.timers.tick(CATALOG_TIMEOUT_MS);
});
