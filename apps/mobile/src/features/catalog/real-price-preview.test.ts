import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPreviewTime, loadRealPricePreview, parseRealPricePreview, previewIsExpired,
  previewStockLabel, readRealPricePreviewConfig, REAL_PRICE_PREVIEW_URL,
} from './real-price-preview.ts';

// 실제 상품 자료 대신 테스트를 위해 만든 이름·가격·번호만 사용합니다.
const token = 'a'.repeat(64);
const now = Date.parse('2026-11-12T12:00:00.000Z');
function example() {
  return {
    schemaVersion: 1, sessionId: 'verification-session', fetchedAt: '2026-11-12T11:50:00.000Z',
    products: [{
      id: 'ssg-emart-0000000000001', name: '검사용 상품', unit: '검사용 1봉', priceKrw: 1234,
      sourceUrl: 'https://emart.ssg.com/item/itemView.ssg?itemId=0000000000001&siteNo=6001&salestrNo=2037',
      observedAt: '2026-11-11T10:00:00.000Z', displayUntil: '2026-11-12T10:00:00.000Z',
      availability: 'unknown', isSample: false, sourceKind: 'manual_observation', salesChannel: 'ssg_emart_online',
    }],
  };
}
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const fetchFor = (value: unknown) => (async () => response(value)) as typeof globalThis.fetch;

test('배포 환경과 명시적으로 켜지 않은 환경에서는 미리보기 설정을 만들지 않는다', () => {
  for (const enabled of [undefined, '', '0', 'true', '1']) {
    assert.equal(readRealPricePreviewConfig(false, enabled, 'not-a-token'), null);
  }
  for (const enabled of [undefined, '', '0', 'true']) {
    assert.equal(readRealPricePreviewConfig(true, enabled, token), null);
  }
  assert.deepEqual(readRealPricePreviewConfig(true, '1', token), { token });
  for (const value of [undefined, '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'unsafe token']) {
    assert.throws(() => readRealPricePreviewConfig(true, '1', value));
  }
});

test('실제 관측의 최소 필드만 읽고 원본 참조와 이후 변경을 화면 값에서 분리한다', () => {
  const source = example();
  const parsed = parseRealPricePreview(source, { now, expectedSessionId: 'verification-session' });
  assert.equal(parsed.products[0].priceKrw, 1234);
  assert.equal(parsed.products[0].isSample, false);
  source.products[0].name = '나중에 바꾼 이름';
  assert.equal(parsed.products[0].name, '검사용 상품');
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.products));
  assert.ok(Object.isFrozen(parsed.products[0]));
});

test('잘못된 묶음·스키마·세션과 관리 정보가 포함된 응답을 거절한다', () => {
  const values: unknown[] = [null, [], {}, { ...example(), schemaVersion: 2 }, { ...example(), sessionId: '' },
    { ...example(), sessionId: 'invalid session' }, { ...example(), approval_notes: '관리자 메모' },
    { ...example(), products: null }];
  for (const value of values) assert.throws(() => parseRealPricePreview(value, { now }));
  assert.throws(() => parseRealPricePreview(example(), { now, expectedSessionId: 'another-run' }));
  const value = example();
  Object.assign(value.products[0], { approval_notes: '노출되면 안 되는 메모' });
  assert.throws(() => parseRealPricePreview(value, { now }));
});

test('빈 기록은 유효하지만 20개 초과 및 같은 상품의 중복 응답은 거절한다', () => {
  assert.deepEqual(parseRealPricePreview({ ...example(), products: [] }, { now }).products, []);
  const item = example().products[0];
  assert.throws(() => parseRealPricePreview({ ...example(), products: [item, { ...item }] }, { now }));
  const many = Array.from({ length: 21 }, (_, index) => {
    const suffix = String(index + 1).padStart(13, '0');
    return { ...item, id: 'ssg-emart-' + suffix, sourceUrl: `https://emart.ssg.com/item/itemView.ssg?itemId=${suffix}&siteNo=6001` };
  });
  assert.throws(() => parseRealPricePreview({ ...example(), products: many }, { now }));
  assert.equal(parseRealPricePreview({ ...example(), products: many.slice(0, 20) }, { now }).products.length, 20);
});

test('원 단위 정수·필수 이름·규격 및 실제 수동 관측 구분을 확인한다', () => {
  const bad: Record<string, unknown>[] = [
    { priceKrw: 0 }, { priceKrw: -1 }, { priceKrw: 1.5 }, { priceKrw: 2147483648 }, { priceKrw: '1234' }, { priceKrw: NaN },
    { name: '' }, { name: '  ' }, { name: '이름\n' }, { name: 'a'.repeat(121) }, { name: '표시\u202e방향' }, { name: '\ud800' },
    { unit: '' }, { unit: 'a'.repeat(121) }, { id: 'sample-example' }, { id: 'ssg-emart-1' },
    { availability: ['unknown'] }, { availability: { value: 'unknown' } }, { availability: 'sold' },
    { isSample: true }, { sourceKind: 'approved_file' }, { salesChannel: 'offline_store' },
  ];
  for (const change of bad) {
    assert.throws(() => parseRealPricePreview({ ...example(), products: [{ ...example().products[0], ...change }] }, { now }), JSON.stringify(change));
  }
  assert.equal(parseRealPricePreview({ ...example(), products: [{ ...example().products[0], name: '검사용 🧺 상품', priceKrw: 2147483647 }] }, { now }).products[0].priceKrw, 2147483647);
});

test('출처 주소는 이마트몰 상품 번호와 일치하고 인증 정보·외부 주소·중복 조건을 포함할 수 없다', () => {
  const bad = [
    'http://emart.ssg.com/item/itemView.ssg?itemId=0000000000001&siteNo=6001',
    'https://example.invalid/item/itemView.ssg?itemId=0000000000001&siteNo=6001',
    'https://emart.ssg.com@evil.invalid/item/itemView.ssg?itemId=0000000000001&siteNo=6001',
    'https://emart.ssg.com/item/itemView.ssg?itemId=0000000000002&siteNo=6001',
    'https://emart.ssg.com/item/itemView.ssg?itemId=0000000000001&siteNo=6005',
    'https://emart.ssg.com/item/itemView.ssg?itemId=0000000000001&siteNo=6001&siteNo=6001',
    'https://emart.ssg.com/item/itemView.ssg?itemId=0000000000001&siteNo=6001&token=secret',
    'https://emart.ssg.com/item/itemView.ssg?itemId=0000000000001&siteNo=6001#',
    'https://emart.ssg.com/item/itemView.ssg?itemId=0000000000001&siteNo=6001&salestrNo=store',
    'https://emart.ssg.com/item/itemView.ssg?itemId=0000000000001&siteNo=60\n01',
  ];
  for (const sourceUrl of bad) {
    assert.throws(() => parseRealPricePreview({ ...example(), products: [{ ...example().products[0], sourceUrl }] }, { now }));
  }
});

test('관측·조회·내부 기한을 구분하고 미래·존재하지 않는 시각·거꾸로 된 기한을 거절한다', () => {
  for (const fetchedAt of ['not-a-date', '2026-02-30T00:00:00.000Z', '2026-11-12T13:00:00.000Z', '2026-11-12T11:50:00+00:00']) {
    assert.throws(() => parseRealPricePreview({ ...example(), fetchedAt }, { now }));
  }
  for (const change of [{ observedAt: '2026-11-12T11:51:00.000Z' }, { observedAt: '2026-02-30T00:00:00.000Z' }, { displayUntil: '2026-11-11T10:00:00.000Z' }, { displayUntil: 'invalid' }]) {
    assert.throws(() => parseRealPricePreview({ ...example(), products: [{ ...example().products[0], ...change }] }, { now }));
  }
  assert.throws(() => parseRealPricePreview(example(), { now: NaN }));
});

test('기한 지난 기록도 보존하며 한국 시각·재고 안내는 과거 관측으로 표현한다', () => {
  const item = parseRealPricePreview(example(), { now }).products[0];
  assert.equal(previewIsExpired(item, Date.parse(item.displayUntil) - 1), false);
  assert.equal(previewIsExpired(item, Date.parse(item.displayUntil)), true);
  assert.equal(formatPreviewTime('2026-11-12T22:02:03.000Z'), '2026-11-13 07:02 (한국 시간)');
  assert.equal(previewStockLabel('unknown'), '재고 미확인');
  assert.equal(previewStockLabel('out_of_stock'), '확인 당시 품절');
  assert.equal(previewStockLabel('available'), '확인 당시 판매 가능');
});

test('고정된 PC 주소에만 임시 토큰을 보내고 응답의 실행 번호를 확인한다', async () => {
  let called = false;
  const mock = (async (url, init) => {
    called = true;
    assert.equal(url, REAL_PRICE_PREVIEW_URL);
    assert.deepEqual(init?.headers, { Accept: 'application/json', Authorization: 'Bearer ' + token });
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    assert.ok(init?.signal instanceof AbortSignal);
    return response(example());
  }) as typeof globalThis.fetch;
  const result = await loadRealPricePreview({ token }, { fetch: mock, now, expectedSessionId: 'verification-session' });
  assert.ok(called);
  assert.equal(result.products.length, 1);
});

test('빈 결과와 서버 실패 뒤 새로운 시도의 성공을 구분한다', async () => {
  const empty = await loadRealPricePreview({ token }, { fetch: fetchFor({ ...example(), products: [] }), now });
  assert.deepEqual(empty.products, []);
  let attempts = 0;
  const mock = (async () => ++attempts === 1 ? new Response('private response', { status: 500 }) : response(example())) as typeof globalThis.fetch;
  await assert.rejects(loadRealPricePreview({ token }, { fetch: mock, now }));
  const recovered = await loadRealPricePreview({ token }, { fetch: mock, now });
  assert.equal(attempts, 2);
  assert.equal(recovered.products[0].priceKrw, 1234);
});

test('외부 오류·서버 본문·토큰을 오류 메시지에 노출하지 않는다', async () => {
  const details = 'private-note-' + token;
  for (const mock of [
    (async () => { throw new Error(details); }) as typeof globalThis.fetch,
    (async () => new Response(details, { status: 401 })) as typeof globalThis.fetch,
    (async () => new Response(details)) as typeof globalThis.fetch,
  ]) {
    await assert.rejects(loadRealPricePreview({ token }, { fetch: mock, now }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(details));
      assert.ok(!error.message.includes(token));
      return true;
    });
  }
});

test('너무 큰 응답·다른 서버로 이동한 응답·잘못된 실행 번호를 거절한다', async () => {
  await assert.rejects(loadRealPricePreview({ token }, { fetch: (async () => new Response(' '.repeat(65537))) as typeof globalThis.fetch, now }));
  const redirected = response(example());
  Object.defineProperty(redirected, 'url', { value: 'https://example.invalid/elsewhere' });
  await assert.rejects(loadRealPricePreview({ token }, { fetch: (async () => redirected) as typeof globalThis.fetch, now }));
  await assert.rejects(loadRealPricePreview({ token }, { fetch: fetchFor(example()), now, expectedSessionId: 'different' }));
});

test('이미 닫힌 요청은 연결하지 않고 진행 중 닫기도 AbortError로 종료한다', async () => {
  const before = new AbortController();
  before.abort('private reason');
  let calls = 0;
  const never = (async () => { calls += 1; return await new Promise<Response>(() => {}); }) as typeof globalThis.fetch;
  await assert.rejects(loadRealPricePreview({ token }, { signal: before.signal, fetch: never, now }), { name: 'AbortError' });
  assert.equal(calls, 0);
  const during = new AbortController();
  const request = loadRealPricePreview({ token }, { signal: during.signal, fetch: never, now });
  during.abort('another private reason');
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('연결과 본문 읽기 전체에 제한 시간을 적용하고 늦은 응답을 채택하지 않는다', async () => {
  const never = (async () => await new Promise<Response>(() => {})) as typeof globalThis.fetch;
  await assert.rejects(loadRealPricePreview({ token }, { fetch: never, now, timeoutMs: 10 }), /기다리는 시간이/);
  const bodyStalled = response(example());
  bodyStalled.text = async () => await new Promise<string>(() => {});
  await assert.rejects(loadRealPricePreview({ token }, { fetch: (async () => bodyStalled) as typeof globalThis.fetch, now, timeoutMs: 10 }), /기다리는 시간이/);
  await assert.rejects(loadRealPricePreview({ token }, { fetch: fetchFor(example()), now, timeoutMs: 0 }));
});
