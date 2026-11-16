import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTalkBackSnapshot } from './talkback-observer.mjs';

function snapshot() {
  const node = {
    id: 'product-add', packageName: 'example.market', className: 'Button',
    text: '사과 "1개"\n1,500원 🍎', desc: null, hint: null, stateDescription: '현재 1개 담김', bounds: [0, 0, 100, 100],
    accessibilityFocused: true, inputFocused: false, visible: true, enabled: true, children: [],
  };
  return {
    schemaVersion: 1, requestId: 'current-request', status: 'ok', uiAutomationFlags: 1, disconnected: true,
    allowedPackages: ['example.market', 'example.talkback'], captureAttempts: 1, ignoredWindowCount: 2,
    startedAtEpochMs: 1, capturedAtEpochMs: 2, nodeCount: 1,
    windows: [{ id: 1, active: true, inputFocused: true, accessibilityFocused: true, root: node }],
  };
}
const expected = { requestId: 'current-request', applicationId: 'example.market', talkBackPackage: 'example.talkback' };
const parse = (value, options = expected) => parseTalkBackSnapshot(JSON.stringify(value), options);

test('실제 접근성 포커스와 한국어·이모지 텍스트를 그대로 보존한다', () => {
  assert.deepEqual(parse(snapshot()), snapshot());
});

test('같은 연결의 최대 두 번 재시도 결과를 수용하고 초과 시 거절한다', () => {
  const value = snapshot();
  value.captureAttempts = 3;
  assert.equal(parse(value).captureAttempts, 3);
  value.captureAttempts = 4;
  assert.throws(() => parse(value));
});

test('TalkBack 창은 포함하되 관계없는 앱 창은 거절한다', () => {
  const value = snapshot();
  value.windows.push({ ...value.windows[0], id: 2, root: { ...value.windows[0].root, packageName: 'example.talkback' } });
  value.nodeCount = 2;
  assert.equal(parse(value).windows.length, 2);
  value.windows[1].root.packageName = 'other.privateapp';
  assert.throws(() => parse(value));
});

test('TalkBack 창만 있고 검사 앱이 없는 결과는 거절한다', () => {
  const value = snapshot();
  value.windows[0].root.packageName = 'example.talkback';
  assert.throws(() => parse(value));
});

test('설정 준비·원복의 명시적 옵션에서만 앱 창 요구를 생략한다', () => {
  const value = snapshot();
  value.windows[0].root.packageName = 'example.talkback';
  assert.equal(parse(value, { ...expected, requireApplicationObserved: false }).windows.length, 1);
  assert.throws(() => parse(value, { ...expected, requireApplicationObserved: true }));
  for (const invalid of ['false', 0, null]) {
    assert.throws(() => parse(value, { ...expected, requireApplicationObserved: invalid }));
  }
  value.windows[0].root.packageName = 'other.privateapp';
  assert.throws(() => parse(value, { ...expected, requireApplicationObserved: false }));
});

test('명시한 IME만 세 번째 패키지로 관찰할 수 있다', () => {
  const value = snapshot();
  value.allowedPackages.push('example.keyboard');
  value.windows.push({ ...value.windows[0], id: 2, root: { ...value.windows[0].root, packageName: 'example.keyboard' } });
  value.nodeCount = 2;
  assert.equal(parse(value, { ...expected, inputMethodPackage: 'example.keyboard' }).windows.length, 2);
  assert.throws(() => parse(value, { ...expected, inputMethodPackage: 'other.keyboard' }));
  value.allowedPackages.push('other.app');
  assert.throws(() => parse(value));
});

test('요청 번호와 두 패키지의 정확한 일치를 요구한다', () => {
  for (const changes of [{ requestId: 'old' }, { applicationId: 'example.market.extra' }, { talkBackPackage: 'other.talkback' }]) {
    assert.throws(() => parse(snapshot(), { ...expected, ...changes }));
  }
});

test('실패·서비스 억제·연결 해제 실패를 성공으로 취급하지 않는다', () => {
  for (const changes of [{ status: 'error' }, { uiAutomationFlags: 0 }, { disconnected: false }]) {
    assert.throws(() => parse({ ...snapshot(), ...changes }));
  }
});

test('누락·잘못된 패키지 allowlist를 거절한다', () => {
  for (const allowedPackages of [undefined, [], ['example.market'], ['example.market', 'example.market'], ['example.market', 'bad;command']]) {
    assert.throws(() => parse({ ...snapshot(), allowedPackages }));
  }
});

test('부정확한 노드 수와 잘못된 시간·창 목록을 거절한다', () => {
  for (const changes of [{ nodeCount: 2 }, { capturedAtEpochMs: 0 }, { windows: [] }, { ignoredWindowCount: -1 }]) {
    assert.throws(() => parse({ ...snapshot(), ...changes }));
  }
});

test('거짓 boolean·bounds·누락 자식·문자열 누락을 거절한다', () => {
  for (const changes of [{ accessibilityFocused: 'true' }, { bounds: [0, 1, '2', 3] }, { children: null }, { desc: undefined }]) {
    const value = snapshot();
    Object.assign(value.windows[0].root, changes);
    assert.throws(() => parse(value));
  }
});

test('잘린 출력·혼합 로그·복수 JSON은 관찰 결과가 아니다', () => {
  for (const output of ['not-json', '{}', JSON.stringify(snapshot()) + '\n{}', 'old log\n' + JSON.stringify(snapshot())]) {
    assert.throws(() => parseTalkBackSnapshot(output, expected));
  }
});
