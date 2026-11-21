import test from 'node:test';
import assert from 'node:assert/strict';
import { resumedPackage, returnFromInspectionSettings, withInspectionTalkBack } from './inspection-talkback-toggle.mjs';
import { INSPECTION_APPLICATION_ID } from '../build/inspection.mjs';
import { TALKBACK_COMPONENT } from './talkback-device.mjs';

const settingsPackage = 'com.android.settings';

test('현재 전면 앱은 사용자 0의 단일 topResumedActivity로 식별한다', () => {
  const top = '  topResumedActivity=ActivityRecord{abc u0 com.android.settings/.Settings t123}';
  const older = '  mResumedActivity: ActivityRecord{abc u0 com.example/.Other t1}';
  assert.equal(resumedPackage(top + '\n' + older), settingsPackage);
  assert.equal(resumedPackage(older), 'com.example');
  assert.equal(resumedPackage(top + '\n' + top.replace(settingsPackage, 'com.other')), undefined);
  assert.equal(resumedPackage(top.replace('u0', 'u10')), undefined);
});

function backSequence(screens) {
  let presses = 0;
  const result = returnFromInspectionSettings({
    foreground: async () => screens.length > 1 ? screens.shift() : screens[0],
    back: async () => { presses++; },
    wait: async () => {},
  });
  return { result, presses: () => presses };
}

test('패널 전환이 끝나 검사 앱이면 두 번째 뒤로 가기를 보내지 않는다', async () => {
  const sequence = backSequence([settingsPackage, undefined, settingsPackage, INSPECTION_APPLICATION_ID]);
  await sequence.result;
  assert.equal(sequence.presses(), 1);
});

test('한 번 누른 뒤에도 설정이 전면일 때만 한 번 더 누른다', async () => {
  const sequence = backSequence([...Array(7).fill(settingsPackage), INSPECTION_APPLICATION_ID]);
  await sequence.result;
  assert.equal(sequence.presses(), 2);
});

test('다른 앱·불명확한 전면·복귀 실패에서는 추가 입력을 제한한다', async () => {
  for (const [screens, count] of [[[undefined], 0], [[settingsPackage, 'com.other'], 1], [[settingsPackage], 2]]) {
    const sequence = backSequence(screens);
    await assert.rejects(sequence.result, /뒤로 가기/);
    assert.equal(sequence.presses(), count);
  }
});

function fixture(original = 'null') {
  const current = new Map([['enabled_accessibility_services', original], ['accessibility_enabled', '0']]);
  const writes = [];
  const settings = {
    checkUser: async () => {},
    get: async (key) => current.get(key),
    put: async (key, value) => { writes.push([key, value]); current.set(key, value); },
    remove: async (key) => { writes.push([key, null]); current.set(key, 'null'); },
  };
  return { current, writes, settings };
}

for (const original of ['', 'null']) {
  test('설정 복구는 원래의 빈 값과 미설정을 구별한다: ' + JSON.stringify(original), async () => {
    const { current, settings } = fixture(original);
    await withInspectionTalkBack(settings, async () => {
      assert.equal(current.get('enabled_accessibility_services'), TALKBACK_COMPONENT);
      assert.equal(current.get('accessibility_enabled'), '1');
    });
    assert.equal(current.get('enabled_accessibility_services'), original);
    assert.equal(current.get('accessibility_enabled'), '0');
  });
}

test('화면 관찰 실패에도 일시적으로 설정한 서비스와 활성 상태를 복구한다', async () => {
  const { current, settings } = fixture();
  await assert.rejects(withInspectionTalkBack(settings, async () => { throw new Error('관찰 실패'); }), /관찰 실패/);
  assert.equal(current.get('enabled_accessibility_services'), 'null');
  assert.equal(current.get('accessibility_enabled'), '0');
});

test('이미 사용 중인 서비스를 건드리지 않는다', async () => {
  const { writes, settings } = fixture('org.example/.Reader');
  await assert.rejects(withInspectionTalkBack(settings, async () => {}), /기존 접근성/);
  assert.deepEqual(writes, []);
});

test('테스트 중 추가된 서비스가 있으면 그 항목과 활성 상태를 보존하고 실패를 알린다', async () => {
  const { current, settings } = fixture();
  await assert.rejects(withInspectionTalkBack(settings, async () => {
    current.set('enabled_accessibility_services', TALKBACK_COMPONENT + ':org.example/.Reader');
  }), /다른 접근성 서비스/);
  assert.equal(current.get('enabled_accessibility_services'), 'org.example/.Reader');
  assert.equal(current.get('accessibility_enabled'), '1');
});
