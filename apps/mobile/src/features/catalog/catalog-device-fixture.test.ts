import assert from 'node:assert/strict';
import test from 'node:test';

import { sampleProducts } from '../../data/sample-products.ts';
import { createCatalogSession, type CatalogState } from './catalog-session.ts';
import {
  createCatalogDeviceFixture,
  isCatalogDeviceFixtureEnabled,
  type CatalogDeviceFixtureState,
} from './catalog-device-fixture.ts';

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test('개발 모드와 유효한 검사 번호 및 명시적 시나리오를 모두 만족할 때만 켜진다', () => {
  assert.equal(isCatalogDeviceFixtureEnabled({ development: true, runId: '20261113T000000Z-test-loading', scenario: 'pending-choice' }), true);
  const valid = { development: true, runId: 'test-run', scenario: 'pending-choice' };
  for (const changed of [
    { development: false }, { runId: undefined }, { runId: '' }, { runId: ' ' },
    { runId: '_leading' }, { runId: '한글' }, { runId: 'run\n' }, { runId: 'a'.repeat(129) },
    { scenario: undefined }, { scenario: '' }, { scenario: 'another-scenario' },
  ]) assert.equal(isCatalogDeviceFixtureEnabled({ ...valid, ...changed }), false);
});

test('대기 요청은 취소 전까지 완료되지 않고 취소 후 늦은 성공을 한 번만 전달한다', async () => {
  const fixture = createCatalogDeviceFixture(sampleProducts);
  const events: CatalogDeviceFixtureState[] = [];
  fixture.subscribe((state) => events.push(state));
  const controller = new AbortController();
  let resolved = false;
  const pending = fixture.read(controller.signal).then((products) => { resolved = true; return products; });
  await settle();
  assert.equal(resolved, false);
  assert.deepEqual(events.at(-1), { requests: 1, lateResponse: false });
  controller.abort();
  controller.abort();
  assert.equal(resolved, false);
  assert.equal(await pending, sampleProducts);
  await settle();
  assert.deepEqual(events.at(-1), { requests: 1, lateResponse: true });
  assert.equal(events.filter((event) => event.lateResponse).length, 1);
});

test('구독을 정리한 화면에는 대기 중이던 늦은 완료를 통지하지 않는다', async () => {
  const fixture = createCatalogDeviceFixture(sampleProducts);
  const events: CatalogDeviceFixtureState[] = [];
  const unsubscribe = fixture.subscribe((state) => events.push(state));
  const controller = new AbortController();
  const pending = fixture.read(controller.signal);
  unsubscribe();
  const count = events.length;
  controller.abort();
  await pending;
  await settle();
  assert.equal(events.length, count);
});

test('StrictMode에서 취소된 이전 요청의 늦은 응답은 새 요청의 완료 표시를 만들지 않는다', async () => {
  const fixture = createCatalogDeviceFixture(sampleProducts);
  const events: CatalogDeviceFixtureState[] = [];
  fixture.subscribe((state) => events.push(state));
  const first = new AbortController();
  const second = new AbortController();
  const old = fixture.read(first.signal);
  first.abort();
  const current = fixture.read(second.signal);
  await old;
  await settle();
  assert.deepEqual(events.at(-1), { requests: 2, lateResponse: false });
  second.abort();
  await current;
  await settle();
  assert.deepEqual(events.at(-1), { requests: 2, lateResponse: true });
});

test('이미 취소된 요청도 검사 응답을 전달하지만 동기 완료로 처리하지 않는다', async () => {
  const fixture = createCatalogDeviceFixture(sampleProducts);
  const controller = new AbortController();
  controller.abort();
  const events: CatalogDeviceFixtureState[] = [];
  fixture.subscribe((state) => events.push(state));
  const pending = fixture.read(controller.signal);
  assert.deepEqual(events.at(-1), { requests: 1, lateResponse: false });
  await pending;
  await settle();
  assert.deepEqual(events.at(-1), { requests: 1, lateResponse: true });
});

test('실제 카탈로그 세션과 연결해도 취소 뒤 늦은 성공은 예시 출처를 바꾸지 않는다', async () => {
  const fixture = createCatalogDeviceFixture(sampleProducts);
  const catalogEvents: CatalogState[] = [];
  const fixtureEvents: CatalogDeviceFixtureState[] = [];
  const unsubscribe = fixture.subscribe((state) => fixtureEvents.push(state));
  const session = createCatalogSession({ samples: sampleProducts, read: fixture.read });
  const disconnect = session.connect((state) => catalogEvents.push(state));
  session.useSamples();
  await settle();
  assert.deepEqual(catalogEvents, [
    { status: 'loading' },
    { status: 'ready', products: sampleProducts, source: 'sample' },
  ]);
  assert.deepEqual(fixtureEvents.at(-1), { requests: 1, lateResponse: true });
  unsubscribe();
  disconnect();
});
