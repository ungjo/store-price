import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDisplaySettings, assertDisplaySettings, captureDisplaySettings, densityForWidth,
  parseCurrentUser, parseFontScale, parseWmDensity, parseWmSize,
  restoreDisplaySettings, serializeDisplaySettings,
} from './display-settings.mjs';

function harness(options = {}) {
  const current = {
    userId: '0', font: options.font === undefined ? '1.0' : options.font,
    physicalDensity: 600, density: options.density === undefined ? 560 : options.density,
    physicalSize: '1440x3120', size: options.size ?? null,
  };
  const calls = [];
  const records = [];
  const hooks = { before: null, afterWrite: null, result: null, recording: null };
  const result = (stdout = '') => ({ code: 0, stdout, stderr: '' });
  const adb = async (label, args, opts = {}) => {
    const call = { label, args, cleanup: opts.cleanup === true };
    calls.push(call);
    await hooks.before?.(call, current);
    const text = args.join(' ');
    let response;
    let mutation = false;
    if (text === 'shell am get-current-user') response = result(current.userId + '\n');
    else if (text === 'shell wm size -d 0') response = result('Physical size: ' + current.physicalSize + (current.size ? '\nOverride size: ' + current.size : '') + '\n');
    else if (text === 'shell wm density -d 0') response = result('Physical density: ' + current.physicalDensity + (current.density !== null ? '\nOverride density: ' + current.density : '') + '\n');
    else if (args.slice(0, 3).join(' ') === 'shell wm density') {
      assert.deepEqual(args.slice(-2), ['-d', '0']);
      const value = args[3];
      current.density = value === 'reset' || Number(value) === current.physicalDensity ? null : Number(value);
      mutation = true; response = result();
    } else if (args.slice(0, 3).join(' ') === 'shell settings --user') {
      assert.equal(args[3], current.userId);
      assert.deepEqual(args.slice(5, 7), ['system', 'font_scale']);
      if (args[4] === 'get') response = result((current.font ?? 'null') + '\n');
      else if (args[4] === 'put') { current.font = args[7]; mutation = true; response = result(); }
      else if (args[4] === 'delete') { current.font = null; mutation = true; response = result('Deleted 1 rows\n'); }
      else throw new Error('Unexpected settings verb');
    } else throw new Error('Unexpected command: ' + text);
    if (mutation) await hooks.afterWrite?.(call, current);
    return await hooks.result?.(call, response, current) ?? response;
  };
  return {
    current, calls, hooks, records,
    capture: () => captureDisplaySettings({ adb, onChange: async (record) => { records.push(record); await hooks.recording?.(record); } }),
    writes: () => calls.filter((call) => call.args.includes('put') || call.args.includes('delete') || (call.args[1] === 'wm' && call.args[2] === 'density' && call.args[3] !== '-d')),
  };
}

test('physical/override 크기·밀도와 font_scale의 저장 원문·미설정을 엄격히 파싱한다', () => {
  assert.deepEqual(parseWmDensity('Physical density: 600\r\nOverride density: 560\r\n'), { physical: 600, override: 560, effective: 560 });
  assert.deepEqual(parseWmDensity('Physical density: 600'), { physical: 600, override: null, effective: 600 });
  assert.deepEqual(parseWmSize('Physical size: 1440x3120\nOverride size: 1080x2340').effective, { width: 1080, height: 2340 });
  assert.deepEqual(parseFontScale('1.000\n'), { raw: '1.000', value: 1 });
  assert.deepEqual(parseFontScale('null\n'), { raw: null, value: 1 });
  assert.equal(parseCurrentUser('10\n'), '10');
  for (const value of ['', 'Error: denied', 'Physical density: 0', 'Physical density: 600\nOverride density: 600', 'Physical density: 600\nOverride density: 560\nextra']) assert.throws(() => parseWmDensity(value));
  for (const value of ['', 'Physical size: 0x1000', 'Physical size: 1440x3120\nOverride size: 1440x3120', 'Override size: 1080x2340']) assert.throws(() => parseWmSize(value));
  for (const value of ['', '-1', 'NaN', 'Infinity', '1e0', '0', '1\nError', 'null\0']) assert.throws(() => parseFontScale(value));
  for (const value of ['current', '-1', '00', '0\n10', 'Error: denied']) assert.throws(() => parseCurrentUser(value));
});

test('320dp 밀도는 현재 override 크기를 우선하며 픽셀 폭을 목표 이하로 맞춘다', () => {
  assert.equal(densityForWidth(parseWmSize('Physical size: 1440x3120'), 320), 720);
  assert.equal(densityForWidth(parseWmSize('Physical size: 1440x3120\nOverride size: 1080x2340'), 320), 540);
  const size = parseWmSize('Physical size: 1081x2340');
  assert.ok(size.effective.width * 160 / densityForWidth(size, 320) <= 320);
  for (const width of [0, 239, 320.5, 1201, NaN]) assert.throws(() => densityForWidth(size, width));
  assert.throws(() => densityForWidth({ effective: { width: Infinity } }));
});

test('현재 프로필만 캡처하며 읽기 또는 쓰기 응답의 stderr·비정상 종료를 성공으로 보지 않는다', async () => {
  for (const broken of [{ code: 1 }, { stderr: 'Error: permission denied' }, { stdout: 'Error: denied' }]) {
    const h = harness();
    h.hooks.result = (call, response) => call.label === 'display-capture-font' ? { ...response, ...broken } : response;
    await assert.rejects(h.capture());
    assert.equal(h.writes().length, 0);
  }
  const h = harness(); const state = await h.capture();
  assert.equal(state.original.userId, '0');
  assert.ok(h.calls.filter((call) => call.args[1] === 'settings').every((call) => call.args[2] === '--user' && call.args[3] === '0'));
  assert.equal(h.calls.some((call) => call.args.includes('users')), false);
});

test('일반→큰 글자→320dp 단계의 값을 검증하고 override560·font1.0으로 정확히 복구한다', async () => {
  const h = harness(); const state = await h.capture();
  await assertDisplaySettings(state);
  await applyDisplaySettings(state, { fontScale: 1.5 });
  assert.equal(h.current.density, 560); assert.equal(h.current.font, '1.5');
  await applyDisplaySettings(state, { fontScale: 1.5, density: densityForWidth(state.original.size, 320) });
  assert.equal(h.current.density, 720);
  const checked = await assertDisplaySettings(state);
  assert.equal(checked.expected.size.effective.width * 160 / checked.expected.density.effective, 320);
  const restored = await restoreDisplaySettings(state);
  assert.equal(restored.restoration.verified, true);
  assert.equal(h.current.font, '1.0'); assert.equal(h.current.density, 560);
  assert.ok(h.writes().filter((call) => call.label.startsWith('display-restore')).every((call) => call.cleanup));
  assert.equal(h.calls.some((call) => call.args[1] === 'wm' && call.args[2] === 'size' && call.args[3] !== '-d'), false);
  assert.equal(h.records.some((record) => record.changes.density.pending && record.changes.density.target === 720), true);
});

test('원래 font_scale·density override가 없으면 delete·reset하고 상태가 없는 것을 재확인한다', async () => {
  const h = harness({ font: null, density: null }); const state = await h.capture();
  await applyDisplaySettings(state, { fontScale: 2, density: 720 });
  await restoreDisplaySettings(state);
  assert.equal(h.current.font, null); assert.equal(h.current.density, null);
  assert.ok(h.writes().some((call) => call.args.join(' ') === 'shell settings --user 0 delete system font_scale'));
  assert.ok(h.writes().some((call) => call.args.join(' ') === 'shell wm density reset -d 0'));
});

test('이미 같은 값은 쓰지 않고 복구가 끝난 상태의 재호출도 기기를 바꾸지 않는다', async () => {
  const h = harness({ font: '1.5', density: 720 }); const state = await h.capture();
  await applyDisplaySettings(state, { fontScale: 1.5, density: 720 });
  await restoreDisplaySettings(state);
  await restoreDisplaySettings(state);
  assert.equal(h.writes().length, 0);
  await assert.rejects(applyDisplaySettings(state, { fontScale: 1.5 }), /복구를 시작/u);
});

test('설정이 적용된 직후 응답이 끊겨도 요청 전 기록으로 원래 값까지 복구한다', async () => {
  for (const field of ['fontScale', 'density']) {
    const h = harness(); const state = await h.capture();
    h.hooks.afterWrite = (call) => { if (!call.cleanup && call.label.endsWith('-' + field)) throw new Error('connection lost after write'); };
    await assert.rejects(applyDisplaySettings(state, { fontScale: 1.5, density: 720 }), (error) => error.displaySettings.changes[field].pending);
    await restoreDisplaySettings(state);
    assert.equal(h.current.font, '1.0'); assert.equal(h.current.density, 560);
  }
});

test('두 번째 글자 변경이 쓰기 전에 실패하면 이전에 적용한 큰 글자도 원래대로 복구한다', async () => {
  const h = harness(); const state = await h.capture();
  await applyDisplaySettings(state, { fontScale: 1.5 });
  h.hooks.before = (call) => { if (call.args[4] === 'put' && call.args[7] === '2') throw new Error('write never reached device'); };
  await assert.rejects(applyDisplaySettings(state, { fontScale: 2 }));
  assert.equal(h.current.font, '1.5');
  await restoreDisplaySettings(state);
  assert.equal(h.current.font, '1.0');
});

test('종료 코드0 stderr 오류와 적용되지 않은 설정은 실패하며 복구 가능하다', async () => {
  for (const noEffect of [false, true]) {
    const h = harness(); const state = await h.capture();
    h.hooks.result = (call, response) => {
      if (!call.cleanup && call.args[4] === 'put') {
        if (noEffect) { h.current.font = '1.0'; return response; }
        return { ...response, stderr: 'SecurityException: denied after partial application' };
      }
      return response;
    };
    await assert.rejects(applyDisplaySettings(state, { fontScale: 1.5 }));
    await restoreDisplaySettings(state);
    assert.equal(h.current.font, '1.0');
  }
});

test('사용자가 글자 크기를 바꾸면 그 값을 보존하고 우리가 바꾼 밀도만 복구한 뒤 실패한다', async () => {
  const h = harness(); const state = await h.capture();
  await applyDisplaySettings(state, { fontScale: 1.5, density: 720 });
  h.current.font = '1.3';
  await assert.rejects(assertDisplaySettings(state), /사용자 변경/u);
  await assert.rejects(restoreDisplaySettings(state), (error) => {
    assert.equal(error.displaySettings.changes.fontScale.restoreStatus, 'preserved-change');
    assert.equal(error.displaySettings.changes.density.restoreStatus, 'restored'); return true;
  });
  assert.equal(h.current.font, '1.3'); assert.equal(h.current.density, 560);
  await assert.rejects(restoreDisplaySettings(state));
  assert.equal(h.current.font, '1.3');
});

test('사용자가 원래 밀도로 돌린 경우에도 사용자 변경을 덮어쓰지 않고 검사 실패로 남긴다', async () => {
  const h = harness(); const state = await h.capture();
  await applyDisplaySettings(state, { fontScale: 1.5, density: 720 });
  h.current.density = 560;
  await assert.rejects(restoreDisplaySettings(state), (error) => error.displaySettings.changes.density.restoreStatus === 'preserved-change');
  assert.equal(h.current.density, 560); assert.equal(h.current.font, '1.0');
  assert.equal(h.writes().some((call) => call.cleanup && call.args[1] === 'wm'), false);
});

test('프로필 변경 시 다른 프로필에는 쓰지 않으며 size 사용자 변경도 되돌리지 않는다', async () => {
  const h = harness(); const state = await h.capture();
  await applyDisplaySettings(state, { fontScale: 1.5, density: 720 });
  h.current.userId = '10';
  await assert.rejects(restoreDisplaySettings(state), (error) => error.displaySettings.conflicts.includes('profile'));
  assert.equal(h.writes().some((call) => call.cleanup), false);
  const h2 = harness(); const state2 = await h2.capture();
  await applyDisplaySettings(state2, { fontScale: 1.5, density: 720 });
  h2.current.size = '1080x2340';
  await assert.rejects(restoreDisplaySettings(state2), (error) => error.displaySettings.conflicts.includes('size'));
  assert.equal(h2.current.size, '1080x2340'); assert.equal(h2.current.font, '1.0'); assert.equal(h2.current.density, 560);
});

test('밀도 복구 명령 실패에도 글자는 복구하고 다음 cleanup 호출에서 밀도를 재시도한다', async () => {
  const h = harness(); const state = await h.capture();
  await applyDisplaySettings(state, { fontScale: 1.5, density: 720 });
  h.hooks.before = (call) => { if (call.cleanup && call.args.join(' ') === 'shell wm density 560 -d 0') throw new Error('restore disconnected'); };
  await assert.rejects(restoreDisplaySettings(state));
  assert.equal(h.current.font, '1.0'); assert.equal(h.current.density, 720);
  h.hooks.before = null;
  const restored = await restoreDisplaySettings(state);
  assert.equal(restored.restoration.attempts, 2); assert.equal(restored.restoration.verified, true);
  assert.equal(h.current.density, 560);
});

test('원복 명령 적용 후 읽기에 실패하면 다시 호출할 때 이미 복구된 값을 덮어쓰지 않는다', async () => {
  const h = harness(); const state = await h.capture();
  await applyDisplaySettings(state, { fontScale: 1.5, density: 720 });
  h.hooks.before = (call) => { if (call.label === 'display-restore-1-density-after') throw new Error('read disconnected'); };
  await assert.rejects(restoreDisplaySettings(state));
  const count = h.writes().length;
  assert.equal(h.current.density, 560);
  h.hooks.before = null;
  assert.equal((await restoreDisplaySettings(state)).restoration.verified, true);
  assert.equal(h.writes().length, count);
});

test('복구 원본 직렬화는 독립된 값이며 변조된 JSON으로 기기 쓰기를 시작할 수 없다', async () => {
  const h = harness(); const state = await h.capture();
  const stored = serializeDisplaySettings(state);
  assert.equal(JSON.parse(JSON.stringify(stored)).original.density.override, 560);
  stored.original.fontScale.raw = '9'; stored.recoveryCommands.density[3] = '900';
  await assert.rejects(applyDisplaySettings(stored, { fontScale: 1.5 }), /직접 캡처/u);
  await applyDisplaySettings(state, { fontScale: 1.5, density: 720 });
  await restoreDisplaySettings(state);
  assert.equal(h.current.font, '1.0'); assert.equal(h.current.density, 560);
});

test('복구 기록 저장 실패가 실제 설정 복구를 막지 않지만 성공으로 반환하지는 않는다', async () => {
  const h = harness(); const state = await h.capture();
  await applyDisplaySettings(state, { fontScale: 1.5, density: 720 });
  h.hooks.recording = () => { throw new Error('artifact disk full'); };
  await assert.rejects(restoreDisplaySettings(state), (error) => {
    assert.equal(error.displaySettings.restoration.verified, true);
    assert.equal(error.displaySettings.restoration.recordingFailed, true); return true;
  });
  assert.equal(h.current.font, '1.0'); assert.equal(h.current.density, 560);
  await assert.rejects(restoreDisplaySettings(state), (error) => error.displaySettings.restoration.recordingFailed);
});

test('적용 기록을 저장하는 사이 바뀐 값이나 프로필을 쓰기 직전 확인해 보존한다', async () => {
  for (const field of ['fontScale', 'density', 'profile']) {
    const h = harness(); const state = await h.capture();
    let changed = false;
    h.hooks.recording = () => {
      if (changed) return;
      changed = true;
      if (field === 'fontScale') h.current.font = '1.2';
      else if (field === 'density') h.current.density = 580;
      else h.current.userId = '10';
    };
    await assert.rejects(applyDisplaySettings(state, { fontScale: 1.5, density: 720 }), (error) => error.displaySettings.conflicts.includes(field));
    assert.equal(h.writes().length, 0);
    await assert.rejects(restoreDisplaySettings(state));
    assert.equal(h.writes().length, 0);
    if (field === 'fontScale') assert.equal(h.current.font, '1.2');
    else if (field === 'density') assert.equal(h.current.density, 580);
    else assert.equal(h.current.userId, '10');
  }
});

test('복구 기록 저장 중 사용자가 바꾼 값과 프로필도 덮어쓰지 않는다', async () => {
  for (const field of ['fontScale', 'density', 'profile']) {
    const h = harness(); const state = await h.capture();
    await applyDisplaySettings(state, { fontScale: 1.5, density: 720 });
    let changed = false;
    const watched = field === 'fontScale' ? 'fontScale' : 'density';
    h.hooks.recording = (record) => {
      if (changed || record.changes[watched].restoreStatus !== 'requested') return;
      changed = true;
      // 원래 값으로 돌려도 검사 도구가 한 복구라고 추측하지 않습니다.
      if (field === 'fontScale') h.current.font = '1.0';
      else if (field === 'density') h.current.density = 580;
      else h.current.userId = '10';
    };
    await assert.rejects(restoreDisplaySettings(state), (error) => error.displaySettings.conflicts.includes(field));
    assert.equal(h.writes().some((call) => call.cleanup && call.label.endsWith('-' + watched)), false);
    if (field === 'fontScale') assert.equal(h.current.font, '1.0');
    else if (field === 'density') assert.equal(h.current.density, 580);
    else assert.equal(h.current.userId, '10');
  }
});

test('검사 범위를 벗어난 입력이나 캡처 후 설정 변화는 쓰기 전에 거절한다', async () => {
  const h = harness(); const state = await h.capture();
  for (const options of [{ fontScale: 0.5 }, { fontScale: 2.1 }, { fontScale: NaN }, { fontScale: 1.5, density: 71 }, { fontScale: 1.5, density: 720.5 }, { fontScale: 1.5, size: 320 }]) await assert.rejects(applyDisplaySettings(state, options));
  assert.equal(h.writes().length, 0);
  h.current.density = 580;
  await assert.rejects(applyDisplaySettings(state, { fontScale: 1.5 }), /사용자 변경/u);
  assert.equal(h.writes().length, 0); assert.equal(h.current.density, 580);
});
