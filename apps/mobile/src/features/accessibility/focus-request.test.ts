import assert from 'node:assert/strict';
import test from 'node:test';

import { scheduleAccessibilityFocus, scheduleAfterKeyboardHidden } from './focus-request.ts';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness(isScreenReaderEnabled: () => Promise<boolean>) {
  const callbacks: (() => void)[] = [];
  let focused = 0;
  let cancelled = 0;
  const cancel = scheduleAccessibilityFocus({
    isScreenReaderEnabled,
    schedule: (callback) => { callbacks.push(callback); return () => { cancelled += 1; }; },
    focus: () => { focused += 1; },
  });
  return { callbacks, cancel, focused: () => focused, cancelled: () => cancelled };
}

test('화면 읽기가 켜졌을 때 렌더 다음 예약에서 초점을 한 번만 옮긴다', async () => {
  const h = harness(async () => true);
  assert.equal(h.focused(), 0);
  await settle();
  assert.equal(h.callbacks.length, 1); assert.equal(h.focused(), 0);
  h.callbacks[0](); h.callbacks[0]();
  assert.equal(h.focused(), 1);
});

test('화면 읽기가 꺼져 있으면 일반 입력 초점을 바꾸거나 예약하지 않는다', async () => {
  const h = harness(async () => false);
  await settle();
  assert.equal(h.callbacks.length, 0); assert.equal(h.focused(), 0);
});

test('화면 전환 뒤 늦게 도착한 활성 상태 응답은 초점을 빼앗지 않는다', async () => {
  let resolveEnabled!: (enabled: boolean) => void;
  const enabled = new Promise<boolean>((resolve) => { resolveEnabled = resolve; });
  const h = harness(() => enabled);
  h.cancel();
  resolveEnabled(true);
  await settle();
  assert.equal(h.callbacks.length, 0); assert.equal(h.focused(), 0);
});

test('예약된 프레임이 이미 실행 대기 중이어도 취소된 화면에는 초점을 보내지 않는다', async () => {
  const h = harness(async () => true);
  await settle();
  h.cancel();
  assert.equal(h.cancelled(), 1);
  h.callbacks[0]();
  assert.equal(h.focused(), 0);
});

test('완료한 요청을 정리해도 초점 이동을 다시 실행하지 않는다', async () => {
  const h = harness(async () => true);
  await settle();
  h.callbacks[0](); h.cancel();
  assert.equal(h.focused(), 1);
});

test('상태 조회가 거부되면 화면 읽기 활성으로 추측하지 않는다', async () => {
  const h = harness(async () => { throw new Error('unavailable'); });
  await settle();
  assert.equal(h.callbacks.length, 0); assert.equal(h.focused(), 0);
});

test('새 화면의 요청은 취소한 이전 화면의 늦은 응답과 독립적으로 처리한다', async () => {
  let resolveOld!: (enabled: boolean) => void;
  const old = harness(() => new Promise<boolean>((resolve) => { resolveOld = resolve; }));
  await settle();
  old.cancel();
  const next = harness(async () => true);
  await settle();
  next.callbacks[0]();
  resolveOld(true);
  await settle();
  assert.equal(old.callbacks.length, 0); assert.equal(old.focused(), 0); assert.equal(next.focused(), 1);
});

function keyboardHarness(initiallyVisible: boolean, hiddenWhileSubscribing = false) {
  let visible = initiallyVisible;
  let listener: (() => void) | undefined;
  let removed = 0;
  let cancelledFrames = 0;
  let focused = 0;
  const frames: (() => void)[] = [];
  const cancel = scheduleAfterKeyboardHidden({
    isKeyboardVisible: () => visible,
    subscribeDidHide: (callback) => {
      listener = callback;
      if (hiddenWhileSubscribing) visible = false;
      return () => { removed += 1; listener = undefined; };
    },
    schedule: (callback) => { frames.push(callback); return () => { cancelledFrames += 1; }; },
  }, () => { focused += 1; });
  return {
    cancel, frames,
    hide: () => { visible = false; listener?.(); },
    reopen: () => { visible = true; },
    queuedHide: () => listener,
    focused: () => focused,
    removed: () => removed,
    cancelledFrames: () => cancelledFrames,
  };
}

test('키보드가 열렸으면 숨김 완료와 다음 화면 갱신까지 정답 초점을 기다린다', () => {
  const h = keyboardHarness(true);
  assert.equal(h.frames.length, 0);
  h.hide();
  assert.equal(h.frames.length, 1); assert.equal(h.focused(), 0); assert.equal(h.removed(), 1);
  h.frames[0]();
  assert.equal(h.focused(), 1);
});

test('키보드가 이미 닫혔으면 숨김 이벤트를 기다리지 않고 다음 프레임을 예약한다', () => {
  const h = keyboardHarness(false);
  assert.equal(h.frames.length, 1); assert.equal(h.removed(), 1);
  h.frames[0]();
  assert.equal(h.focused(), 1);
});

test('키보드가 이벤트 구독 중 닫혀도 상태 재확인으로 대기가 남지 않는다', () => {
  const h = keyboardHarness(true, true);
  assert.equal(h.frames.length, 1); assert.equal(h.removed(), 1);
  h.frames[0]();
  assert.equal(h.focused(), 1);
});

test('숨김 이벤트가 중복 배달돼도 정답 초점은 한 번만 옮긴다', () => {
  const h = keyboardHarness(true);
  const queued = h.queuedHide()!;
  h.hide(); queued();
  assert.equal(h.frames.length, 1);
  h.frames[0](); h.frames[0]();
  assert.equal(h.focused(), 1);
});

test('숨김 대기를 취소하면 구독을 해제하고 늦은 이벤트도 무시한다', () => {
  const h = keyboardHarness(true);
  const queued = h.queuedHide()!;
  h.cancel(); h.hide(); queued();
  assert.equal(h.removed(), 1); assert.equal(h.frames.length, 0); assert.equal(h.focused(), 0);
});

test('키보드가 닫힌 뒤 화면을 떠나면 예약 프레임과 초점 이동을 취소한다', () => {
  const h = keyboardHarness(true);
  h.hide(); h.cancel();
  assert.equal(h.cancelledFrames(), 1);
  h.frames[0]();
  assert.equal(h.focused(), 0);
});

test('예약 프레임 전에 새 키보드 입력을 시작하면 이전 정답이 초점을 빼앗지 않는다', () => {
  const h = keyboardHarness(true);
  h.hide(); h.reopen(); h.frames[0]();
  assert.equal(h.focused(), 0); assert.equal(h.removed(), 1);
});
