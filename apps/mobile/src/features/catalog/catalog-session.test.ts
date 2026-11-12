import assert from 'node:assert/strict';
import test from 'node:test';

import { sampleProducts } from '../../data/sample-products.ts';
import type { CatalogProduct } from './catalog.ts';
import { createCatalogSession, type CatalogState } from './catalog-session.ts';

type Result = readonly CatalogProduct[] | null;
const remoteProducts: readonly CatalogProduct[] = [{ ...sampleProducts[0], priceKrw: 2200 }];

function deferred() {
  let resolve!: (value: Result) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Result>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const events: CatalogState[] = [];
  const requests: (ReturnType<typeof deferred> & { signal: AbortSignal })[] = [];
  const session = createCatalogSession({
    samples: sampleProducts,
    read: (signal) => {
      const request = { ...deferred(), signal };
      requests.push(request);
      return request.promise;
    },
  });
  const connect = () => session.connect((state) => events.push(state));
  return { session, events, requests, connect };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const sampleReady = { status: 'ready', products: sampleProducts, source: 'sample' };

test('원격 요청 성공 후 받은 상품과 원격 출처로 준비되며 생성만으로 통신하지 않는다', async () => {
  const h = harness();
  assert.equal(h.requests.length, 0);
  const disconnect = h.connect();
  assert.deepEqual(h.events, [{ status: 'loading' }]);
  h.requests[0].resolve(remoteProducts);
  await settle();
  assert.deepEqual(h.events.at(-1), { status: 'ready', products: remoteProducts, source: 'supabase' });
  disconnect();
});

test('로딩 중 예시를 고르면 즉시 준비되며 통신을 취소하고 늦은 성공을 무시한다', async () => {
  const h = harness();
  h.connect();
  h.session.useSamples();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.deepEqual(h.events.at(-1), sampleReady);
  const count = h.events.length;
  h.requests[0].resolve(remoteProducts);
  await settle();
  assert.equal(h.events.length, count);
  assert.deepEqual(h.events.at(-1), sampleReady);
  assert.equal(h.requests.length, 1);
});

test('예시 선택 후 늦은 실패나 취소 오류가 와도 놀이 화면을 오류로 바꾸지 않는다', async () => {
  const h = harness();
  h.connect();
  h.session.useSamples();
  const count = h.events.length;
  h.requests[0].reject(new Error('지연된 네트워크 오류'));
  await settle();
  assert.equal(h.events.length, count);
  assert.deepEqual(h.events.at(-1), sampleReady);
});

test('이미 응답된 Promise라도 예시 선택이 먼저 처리되면 원격 결과로 되돌리지 않는다', async () => {
  const events: CatalogState[] = [];
  const session = createCatalogSession({ samples: sampleProducts, read: () => Promise.resolve(remoteProducts) });
  session.connect((state) => events.push(state));
  session.useSamples();
  await settle();
  assert.deepEqual(events, [{ status: 'loading' }, sampleReady]);
});

test('요청 실패는 오류 상태로 알리고 예시 선택은 사용자가 명시적으로 할 때만 적용한다', async () => {
  const h = harness();
  h.connect();
  h.requests[0].reject(new Error('네트워크 오류'));
  await settle();
  assert.deepEqual(h.events.at(-1), { status: 'error' });
  h.session.useSamples();
  assert.deepEqual(h.events.at(-1), sampleReady);
});

test('빈 목록과 설정 없음은 서로 다른 안내 상태로 유지한다', async () => {
  for (const [result, status] of [[[], 'empty'], [null, 'unconfigured']] as const) {
    const h = harness();
    h.connect();
    h.requests[0].resolve(result);
    await settle();
    assert.deepEqual(h.events.at(-1), { status });
    h.session.useSamples();
    assert.deepEqual(h.events.at(-1), sampleReady);
  }
});

test('설정을 읽는 중 동기 오류가 발생해도 요청 밖으로 던지지 않고 오류 상태를 알린다', () => {
  const events: CatalogState[] = [];
  const session = createCatalogSession({ samples: sampleProducts, read: () => { throw new Error('잘못된 설정'); } });
  assert.doesNotThrow(() => session.connect((state) => events.push(state)));
  assert.deepEqual(events.at(-1), { status: 'error' });
});

test('재시도는 이전 요청을 취소하며 늦은 이전 응답보다 최신 요청만 반영한다', async () => {
  const h = harness();
  h.connect();
  h.session.reload();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.requests[1].signal.aborted, false);
  h.requests[1].resolve(remoteProducts);
  await settle();
  const count = h.events.length;
  h.requests[0].resolve(sampleProducts);
  await settle();
  assert.equal(h.events.length, count);
  assert.deepEqual(h.events.at(-1), { status: 'ready', products: remoteProducts, source: 'supabase' });
});

test('예시 선택 후 명시적으로 원격 재시도하면 새 요청의 결과를 받을 수 있다', async () => {
  const h = harness();
  h.connect();
  h.session.useSamples();
  h.session.reload();
  assert.deepEqual(h.events.at(-1), { status: 'loading' });
  h.requests[1].resolve(remoteProducts);
  await settle();
  assert.deepEqual(h.events.at(-1), { status: 'ready', products: remoteProducts, source: 'supabase' });
  h.requests[0].reject(new Error('오래된 취소'));
  await settle();
  assert.deepEqual(h.events.at(-1), { status: 'ready', products: remoteProducts, source: 'supabase' });
});

test('화면 정리는 요청과 알림을 멈추며 이후 남은 재시도 이벤트도 통신을 만들지 않는다', async () => {
  const h = harness();
  const disconnect = h.connect();
  disconnect();
  assert.equal(h.requests[0].signal.aborted, true);
  const count = h.events.length;
  h.requests[0].resolve(remoteProducts);
  h.session.reload();
  h.session.useSamples();
  await settle();
  assert.equal(h.requests.length, 1);
  assert.equal(h.events.length, count);
});

test('StrictMode의 연결·정리·재연결에서는 두 번째 요청만 화면에 반영한다', async () => {
  const h = harness();
  const firstCleanup = h.connect();
  firstCleanup();
  const secondCleanup = h.connect();
  firstCleanup();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].signal.aborted, true);
  assert.equal(h.requests[1].signal.aborted, false);
  h.requests[0].resolve(sampleProducts);
  await settle();
  assert.deepEqual(h.events.at(-1), { status: 'loading' });
  h.requests[1].resolve(remoteProducts);
  await settle();
  assert.deepEqual(h.events.at(-1), { status: 'ready', products: remoteProducts, source: 'supabase' });
  secondCleanup();
});

test('초기 연결 전 고른 예시는 연결과 재연결 후에도 유지되고 원격 요청을 만들지 않는다', () => {
  const h = harness();
  h.session.useSamples();
  const disconnect = h.connect();
  assert.deepEqual(h.events.at(-1), sampleReady);
  disconnect();
  h.connect();
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.events.at(-1), sampleReady);
});
