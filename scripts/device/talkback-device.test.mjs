import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTalkBackBound, assertCheckpoint, findSettingSwitch, normalizeSpeech, resolveTalkBackTarget, isTalkBackTargetReady, assertTalkBackResult, assertTalkBackLaunchResult, runTalkBack } from './talkback-device.mjs';
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

const expoTarget = { applicationId: 'host.exp.exponent', runId: 'device-test-20261116', expoUrl: 'exp://127.0.0.1:8091' };
const apkTarget = {
  mode: 'standalone', applicationId: 'com.ungjo.storeprice.offline.b0123456789abcdef',
  runId: 'standalone-0123456789abcdef',
};

test('기존 Expo Go 호출은 기본 모드에서 로컬 딥링크로 같은 앱을 연다', () => {
  const target = resolveTalkBackTarget(expoTarget);
  assert.equal(target.mode, 'expo-go');
  assert.equal(target.launchKind, 'expo-deep-link');
  assert.deepEqual(target.launchArgs, ['am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', expoTarget.expoUrl, '-p', expoTarget.applicationId]);
  assert.deepEqual(resolveTalkBackTarget({ ...expoTarget, mode: 'expo-go' }), target);
  assert.throws(() => { target.launchArgs[0] = 'other'; }, TypeError);
});

test('설치형 APK는 같은 nonce의 전용 패키지를 Android 런처로 열고 Expo 주소를 쓰지 않는다', () => {
  const target = resolveTalkBackTarget(apkTarget);
  assert.equal(target.mode, 'standalone');
  assert.equal(target.launchKind, 'android-launcher');
  assert.deepEqual(target.launchArgs, ['am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-n', apkTarget.applicationId + '/' + apkTarget.applicationId + '.MainActivity']);
  assert.equal(target.runId, apkTarget.runId);
  assert.equal(target.applicationId, apkTarget.applicationId);
  assert.equal(target.launchArgs.includes('-d'), false);
});

test('모드와 앱 종류를 혼동하거나 임의 모드를 지정하면 실행하지 않는다', () => {
  for (const value of [
    { ...expoTarget, mode: 'unknown' },
    { ...expoTarget, mode: 'standalone' },
    { ...apkTarget, mode: 'expo-go', expoUrl: expoTarget.expoUrl },
    { ...apkTarget, mode: undefined, expoUrl: expoTarget.expoUrl },
  ]) assert.throws(() => resolveTalkBackTarget(value));
});

test('다른 빌드나 일반 앱을 설치형 검사 대상으로 사용하지 않는다', () => {
  for (const value of [
    { ...apkTarget, applicationId: 'com.ungjo.storeprice.offline.bfedcba9876543210' },
    { ...apkTarget, applicationId: 'com.ungjo.storeprice' },
    { ...apkTarget, applicationId: apkTarget.applicationId + '.extra' },
    { ...apkTarget, runId: 'standalone-0123456789abcde' },
    { ...apkTarget, runId: 'standalone-0123456789ABCDEf' },
    { ...apkTarget, runId: 'standalone-0123456789abcdef.extra' },
    { ...apkTarget, expoUrl: expoTarget.expoUrl },
  ]) assert.throws(() => resolveTalkBackTarget(value));
});

test('외부 주소와 잘못된 포트나 실행 표시를 Expo Go에 전달하지 않는다', () => {
  for (const expoUrl of [undefined, 'https://127.0.0.1:8091', 'exp://example.com:8091', 'exp://127.0.0.1:0',
    'exp://127.0.0.1:65536', 'exp://127.0.0.1:8091/other', 'exp://127.0.0.1:8091?x=1', 'exp://127.0.0.1:8091\n']) {
    assert.throws(() => resolveTalkBackTarget({ ...expoTarget, expoUrl }));
  }
  for (const runId of ['', undefined, '../other', 'a;b', 'line\nbreak', 'a'.repeat(121)]) {
    assert.throws(() => resolveTalkBackTarget({ ...expoTarget, runId }));
  }
  assert.throws(() => resolveTalkBackTarget({ ...expoTarget, applicationId: 'other.app' }));
});

function readyNodes(target) {
  return [
    { id: 'device-run-marker', desc: '자동 검사 ' + target.runId },
    { id: 'catalog-source-marker', desc: '상품 출처 supabase' },
    { id: 'catalog-loaded-count', desc: '불러온 상품 12개' },
  ].map((node) => ({ ...node, packageName: target.applicationId, visible: true }));
}

test('두 실행 모드 모두 같은 앱의 실행 표시와 공개 상품 12개를 확인해야 준비된다', () => {
  for (const input of [expoTarget, apkTarget]) {
    const target = resolveTalkBackTarget(input);
    assert.equal(isTalkBackTargetReady(readyNodes(target), target), true);
  }
});

test('이전 실행 표시나 다른 앱·내장 예시·다른 상품 개수는 준비 상태로 인정하지 않는다', () => {
  const target = resolveTalkBackTarget(apkTarget);
  const initial = readyNodes(target);
  for (const [index, replacement] of [
    [0, { desc: '자동 검사 standalone-fedcba9876543210' }],
    [0, { packageName: 'host.exp.exponent' }],
    [1, { packageName: 'other.app' }],
    [1, { desc: '상품 출처 sample' }],
    [2, { desc: '불러온 상품 6개' }],
    [2, { visible: false }],
  ]) {
    const changed = initial.map((node, offset) => offset === index ? { ...node, ...replacement } : node);
    assert.equal(isTalkBackTargetReady(changed, target), false);
  }
  for (let index = 0; index < initial.length; index++) {
    assert.equal(isTalkBackTargetReady(initial.filter((_, offset) => offset !== index), target), false);
  }
});

test('잘못된 APK 대상은 파일 생성이나 ADB 설정 변경 전에 거부한다', async () => {
  let called = false;
  const unexpected = async () => { called = true; throw new Error('실행하면 안 됩니다.'); };
  await assert.rejects(runTalkBack({
    ...apkTarget, applicationId: 'host.exp.exponent', runDir: undefined, adb: unexpected, run: unexpected,
  }));
  assert.equal(called, false);
});

function passedResult(input) {
  const target = resolveTalkBackTarget(input);
  return {
    status: 'passed', mode: target.mode, launchKind: target.launchKind,
    applicationId: target.applicationId, runId: target.runId, inputMode: 'uinput-touch', talkBackVersion: '14.5.00.14',
    checkpoints: [{ label: 'speech', expectation: { speechIncludes: '거스름돈' }, speech: { matched: true } }],
    restoration: { verified: true },
  };
}

test('결과 gate는 Expo Go와 같은 nonce APK의 실제 입력·발화·복구 증거를 모두 요구한다', () => {
  for (const input of [expoTarget, apkTarget]) {
    assert.doesNotThrow(() => assertTalkBackResult(passedResult(input), input));
  }
});

test('다른 APK·빌드나 Expo Go의 성공을 현재 설치형 검사 결과로 재사용하지 않는다', () => {
  const passed = passedResult(apkTarget);
  for (const wrong of [
    passedResult(expoTarget),
    { ...passed, mode: 'expo-go' },
    { ...passed, launchKind: 'expo-deep-link' },
    { ...passed, applicationId: 'com.ungjo.storeprice.offline.bfedcba9876543210' },
    { ...passed, runId: 'standalone-fedcba9876543210' },
  ]) assert.throws(() => assertTalkBackResult(wrong, apkTarget));
  assert.throws(() => assertTalkBackResult(passed, { ...apkTarget, runId: 'standalone-fedcba9876543210' }));
});

test('실패·빈 검사·발화 누락·복구 실패 결과는 커밋 증거로 인정하지 않는다', () => {
  const passed = passedResult(apkTarget);
  for (const wrong of [
    null,
    { ...passed, status: 'failed' },
    { ...passed, inputMode: 'adb-input' },
    { ...passed, talkBackVersion: '' },
    { ...passed, checkpoints: [] },
    { ...passed, checkpoints: [{ expectation: {} }] },
    { ...passed, checkpoints: [...passed.checkpoints, { expectation: { speechIncludes: '정답' } }] },
    { ...passed, checkpoints: [{ expectation: { speechIncludes: '정답' }, speech: { matched: false } }] },
    { ...passed, restoration: { verified: false } },
  ]) assert.throws(() => assertTalkBackResult(wrong, apkTarget));
});

test('실행 표시 끝의 개행도 같은 빌드 식별자로 받아들이지 않는다', () => {
  assert.throws(() => resolveTalkBackTarget({ ...expoTarget, runId: expoTarget.runId + '\n' }));
  assert.throws(() => assertTalkBackResult(passedResult(apkTarget), { ...apkTarget, runId: apkTarget.runId + '\n' }));
});

const launchOutput = (activity, rest = {}) => ({
  stdout: 'Starting: Intent { ... }\nStatus: ok\nActivity: ' + activity + '\nTotalTime: 214\nWaitTime: 215\nComplete\n',
  stderr: '', code: 0, ...rest,
});

test('APK 시작 완료의 전체 Activity와 축약 Activity를 같은 MainActivity로 확인한다', () => {
  const target = resolveTalkBackTarget(apkTarget);
  for (const activity of [target.applicationId + '/.MainActivity', target.applicationId + '/' + target.applicationId + '.MainActivity']) {
    assert.equal(assertTalkBackLaunchResult(launchOutput(activity), target), target.applicationId + '/' + target.applicationId + '.MainActivity');
  }
});

test('Expo Go는 같은 앱의 ExperienceActivity 시작을 확인하고 정상 재사용 경고를 허용한다', () => {
  const target = resolveTalkBackTarget(expoTarget);
  const result = launchOutput('host.exp.exponent/host.exp.exponent.experience.ExperienceActivity', {
    stderr: 'Warning: Activity not started, intent has been delivered to currently running top-most instance.\n',
  });
  assert.equal(assertTalkBackLaunchResult(result, target), 'host.exp.exponent/host.exp.exponent.experience.ExperienceActivity');
});

test('Android가 종료 코드 0을 반환해도 stdout 또는 stderr의 실제 시작 오류를 거부한다', () => {
  const target = resolveTalkBackTarget(apkTarget);
  const valid = launchOutput(target.applicationId + '/.MainActivity');
  for (const result of [
    { ...valid, stdout: 'Starting: Intent { ... }\nError: Activity not started, unable to resolve Intent { ... }\n' },
    { ...valid, stderr: 'Error: Activity not started, unable to resolve Intent { ... }\n' },
    { ...valid, stderr: 'Error type 3\nError: Activity class does not exist.\n' },
    { ...valid, stderr: 'java.lang.SecurityException: Permission Denial\n' },
    { ...valid, code: 1 },
    { ...valid, exitCode: 1 },
  ]) assert.throws(() => assertTalkBackLaunchResult(result, target));
});

test('시작 요청만 있거나 완료 상태가 없고 시간 초과된 결과는 준비 대기로 넘어가지 않는다', () => {
  const target = resolveTalkBackTarget(apkTarget);
  for (const stdout of [
    'Starting: Intent { ... }\n',
    'Status: timeout\nActivity: ' + target.applicationId + '/.MainActivity\n',
    'Status: ok\n',
    'Status: ok\nStatus: ok\nActivity: ' + target.applicationId + '/.MainActivity\n',
  ]) assert.throws(() => assertTalkBackLaunchResult({ stdout, stderr: '', exitCode: 0 }, target));
});

test('다른 패키지나 다른 APK Activity의 시작은 같은 빌드로 오인하지 않는다', () => {
  const target = resolveTalkBackTarget(apkTarget);
  for (const activity of [
    'host.exp.exponent/.MainActivity',
    'com.ungjo.storeprice.offline.bfedcba9876543210/.MainActivity',
    target.applicationId + '/.OtherActivity',
    target.applicationId + '/other.package.MainActivity',
  ]) assert.throws(() => assertTalkBackLaunchResult(launchOutput(activity), target));
});

test('실행과 복귀에 사용하는 같은 시작 검증은 code와 exitCode 형식을 모두 지원한다', () => {
  const target = resolveTalkBackTarget(apkTarget);
  const result = launchOutput(target.applicationId + '/.MainActivity', { code: undefined, exitCode: 0 });
  assert.doesNotThrow(() => assertTalkBackLaunchResult(result, target));
  assert.throws(() => assertTalkBackLaunchResult({ ...result, stderr: { message: 'unknown' } }, target));
});
