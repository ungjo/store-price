import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTalkBackBound, assertCheckpoint, findSettingSwitch, normalizeSpeech } from './talkback-device.mjs';
import { touchConfiguration } from './talkback-input.mjs';

const component = 'com.samsung.android.accessibility.talkback/com.samsung.android.marvin.talkback.TalkBackService';
const bound = 'touchExplorationEnabled=true\n Bound services:{Service[label=TalkBack, id=' + component + ', feedbackType[FEEDBACK_SPOKEN]]}';
test('설정값뿐 아니라 실제 TalkBack 연결과 터치 탐색이 필요하다', () => {
  assert.doesNotThrow(() => assertTalkBackBound(bound));
  for (const value of [bound.replace('Bound services:', 'Enabled services:'), bound.replace('true', 'false'), bound.replace('FEEDBACK_SPOKEN', 'FEEDBACK_GENERIC'), bound.replace(component, 'com.other/.Reader')]) {
    assert.throws(() => assertTalkBackBound(value));
  }
});
test('읽기 초점과 대상 노드의 텍스트·선택·활성 상태를 함께 확인한다', () => {
  const focus = { id: 'payment-option-10000', desc: '10000원', text: '선택됨', stateDescription: null, selected: true, enabled: true, visible: true, bounds: [0, 0, 50, 50] };
  const view = { focus, nodes: [focus] };
  assert.doesNotThrow(() => assertCheckpoint(view, { focusId: focus.id, nodeId: focus.id, textIncludes: '선택됨', selected: true, enabled: true }));
  for (const expectation of [{ focusId: 'wrong' }, { nodeId: 'missing' }, { textIncludes: '5000' }, { selected: false }, { enabled: false }]) {
    assert.throws(() => assertCheckpoint(view, expectation));
  }
});
test('수량의 stateDescription도 읽기 내용으로 검증한다', () => {
  assert.doesNotThrow(() => assertCheckpoint({ focus: { id: 'add', visible: true, bounds: [0, 0, 50, 50], stateDescription: '현재 9개 담김. 9개까지 담을 수 있어요.' }, nodes: [] }, { focusId: 'add', textIncludes: '9개까지' }));
});
test('같은 화면의 다른 스위치를 음성 표시 스위치로 오인하지 않는다', () => {
  const row = (text, checked) => ({ children: [{ text, children: [] }, { className: 'android.widget.Switch', checkable: true, checked, children: [] }] });
  const root = { children: [row('다른 설정', true), row('음성 출력 표시', false)] };
  assert.equal(findSettingSwitch([root], '음성 출력 표시').toggle.checked, false);
  assert.throws(() => findSettingSwitch([root], '없는 설정'));
});
test('음성 비교는 띄어쓰기·구두점을 무시하지만 금액과 한글을 보존한다', () => {
  assert.equal(normalizeSpeech('사과 1,500원. 버튼'), normalizeSpeech('사과1500원 버튼'));
  assert.notEqual(normalizeSpeech('사과 1500원'), normalizeSpeech('우유 2500원'));
});
test('가상 터치 장치는 직접 터치 속성과 물리 화면 범위를 사용한다', () => {
  const value = touchConfiguration(1600, 2560, 'StorePriceTalkBack-test');
  assert.deepEqual(value.configuration.find((item) => item.type === 110).data, [1]);
  assert.equal(value.abs_info.find((item) => item.code === 53).info.maximum, 1599);
  assert.equal(value.abs_info.find((item) => item.code === 54).info.maximum, 2559);
});
test('잘못된 크기·경로 문자·다른 장치 이름은 등록하지 않는다', () => {
  for (const args of [[-1, 2560, 'StorePriceTalkBack-test'], [1600.5, 2560, 'StorePriceTalkBack-test'], [1600, 99999, 'StorePriceTalkBack-test'], [1600, 2560, 'other'], [1600, 2560, 'StorePriceTalkBack-../test']]) {
    assert.throws(() => touchConfiguration(...args));
  }
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createTalkBackTouch } from './talkback-input.mjs';

test('로그 경로 충돌은 입력 장치를 생성하기 전에 거절한다', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'store-price-talkback-log-'));
  const logPath = path.join(directory, 'input.log');
  fs.writeFileSync(logPath, 'existing'); let spawned = false;
  try {
    await assert.rejects(createTalkBackTouch({ adbPath: 'unused', serial: 'test-device', width: 1600, height: 2560,
      name: 'StorePriceTalkBack-test', logPath, inspectInput: async () => '', spawnProcess: () => { spawned = true; throw Error('unexpected'); } }));
    assert.equal(spawned, false); assert.equal(fs.readFileSync(logPath, 'utf8'), 'existing');
  } finally { fs.unlinkSync(logPath); fs.rmdirSync(directory); }
});
test('EOF 뒤 남은 출력까지 기록하고 장치 부재를 확인한다', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'store-price-talkback-close-'));
  const logPath = path.join(directory, 'input.log'); let registered = false; let session;
  const name = 'StorePriceTalkBack-test';
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(chunk, _encoding, done) { if (String(chunk).includes('register')) registered = true; done(); },
    final(done) {
      registered = false; child.emit('exit', 0);
      setTimeout(() => { child.stdout.write('last output\n'); child.stdout.end(); child.stderr.end(); child.emit('close', 0); done(); }, 50);
    },
  });
  child.kill = () => { throw Error('정상 종료 전에 kill하면 안 됩니다.'); };
  try {
    session = await createTalkBackTouch({ adbPath: 'unused', serial: 'test-device', width: 1600, height: 2560,
      name, logPath, inspectInput: async () => registered ? name : '', spawnProcess: () => child });
    assert.equal(registered, true);
    await session.close(); assert.equal(registered, false);
    assert.equal(fs.readFileSync(logPath, 'utf8'), 'last output\n');
    await session.close();
  } finally {
    if (session) await session.close();
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath); fs.rmdirSync(directory);
  }
});

test('화면 밖이나 크기 없는 초점을 자동 이동 성공으로 인정하지 않는다', () => {
  for (const focus of [
    {id:'target',visible:false,bounds:[0,0,50,50]},
    {id:'target',visible:true,bounds:[0,0,0,50]},
    {id:'target',visible:true,bounds:[0,50,50,0]},
    {id:'target',visible:true},
  ]) assert.throws(() => assertCheckpoint({focus,nodes:[focus]}, {focusId:'target'}));
});
