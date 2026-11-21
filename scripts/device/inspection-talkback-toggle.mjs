import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { INSPECTION_APPLICATION_ID } from '../build/inspection.mjs';
import { buildTalkBackObserver, parseTalkBackSnapshot } from './talkback-observer.mjs';
import { assertTalkBackBound, flattenNodes, isTalkBackTargetReady, nodeText, TALKBACK_COMPONENT, TALKBACK_PACKAGE } from './talkback-device.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const services = 'enabled_accessibility_services';
const enabled = 'accessibility_enabled';

// 원래 꺼져 있던 전용 검사 상태에서만 잠시 서비스를 켠다. 도중에 오류가 나도 우리가 추가한 설정만 정리한다.
export async function withInspectionTalkBack({ get, put, remove, checkUser }, checkEnabled) {
  await checkUser();
  const original = await get(services);
  if (!['null', ''].includes(original) || await get(enabled) !== '0') {
    throw new Error('기존 접근성 서비스가 사용 중이므로 설정을 보존했습니다.');
  }
  try {
    await put(services, TALKBACK_COMPONENT);
    await put(enabled, '1');
    await checkEnabled();
  } finally {
    const current = await get(services, true);
    const components = current === 'null' ? [] : current.split(':').filter(Boolean);
    const others = components.filter((component) => component !== TALKBACK_COMPONENT);
    if (others.length) {
      // 검사가 진행되는 동안 사용자가 다른 서비스를 켠 경우 해당 서비스와 전역 사용 상태를 보존한다.
      if (components.includes(TALKBACK_COMPONENT) && others.every((item) => /^[\w.$]+\/[\w.$]+$/u.test(item))) {
        await put(services, others.join(':'), true);
      }
      throw new Error('검사 중 다른 접근성 서비스가 변경되어 원래 상태와 일치하는지 확인할 수 없습니다.');
    }
    if (original === 'null') await remove(services, true);
    else await put(services, '', true);
    await put(enabled, '0', true);
    if (await get(services, true) !== original || await get(enabled, true) !== '0') {
      throw new Error('원래의 TalkBack 서비스와 접근성 설정이 복구되지 않았습니다.');
    }
  }
}

async function waitUntil(read, accept, label) {
  const deadline = Date.now() + 35_000;
  let reason;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (accept(value)) return value;
    } catch (error) { reason = error; }
    await pause(400);
  }
  throw new Error(label + ' 확인 시간 초과' + (reason ? ': ' + reason.message : ''));
}

const settingsPackage = 'com.android.settings';

export function resumedPackage(activities) {
  // 여러 화면이 동시에 활성 상태이면 다른 앱으로 갈 수 있는 뒤로 가기 입력을 멈춘다.
  const resumed = activities.split(/\r?\n/u).filter((line) => /^\s*topResumedActivity[=:]/u.test(line));
  const lines = resumed.length ? resumed : activities.split(/\r?\n/u).filter((line) => /^\s*mResumedActivity[=:]/u.test(line));
  const packages = new Set(lines.map((line) => line.match(/\bu0 ([\w.]+)\//u)?.[1]));
  return packages.size === 1 ? [...packages][0] : undefined;
}

export async function returnFromInspectionSettings({ foreground, back, wait = pause }) {
  // 삼성 태블릿은 첫 뒤로 가기가 설정의 두 번째 패널만 닫기도 한다.
  let current = await foreground();
  for (let press = 0; press < 2; press++) {
    if (current === INSPECTION_APPLICATION_ID) return;
    if (current !== settingsPackage) throw new Error('Android 설정 전면을 확인할 수 없어 뒤로 가기를 중단했습니다.');
    await back();
    for (let poll = 0; poll < 6; poll++) {
      await wait(400);
      current = await foreground();
      if (current === INSPECTION_APPLICATION_ID) return;
      if (current && current !== settingsPackage) throw new Error('다른 앱이 전면에 있어 뒤로 가기를 중단했습니다.');
    }
  }
  throw new Error('설정에서 뒤로 가기를 두 번 눌렀지만 검사 앱 복귀를 확인하지 못했습니다.');
}

export async function verifyInspectionTalkBackToggle({ repoRoot, runDir, run, adb, apkState }) {
  const applicationId = INSPECTION_APPLICATION_ID;
  if (apkState?.applicationId !== applicationId || apkState.historical || !/^inspection-[0-9a-f]{16}$/u.test(apkState.buildNonce)) {
    throw new Error('이번에 설치한 고정 검사 APK만 화면 읽기 전환을 확인할 수 있습니다.');
  }
  const token = randomBytes(8).toString('hex');
  const remote = '/data/local/tmp/store-price-toggle-' + token + '.jar';
  let sequence = 0;
  const exec = async (args, label, cleanup = false) =>
    (await adb('inspection-toggle-' + (++sequence) + '-' + label, args, { timeout: 30_000, cleanup })).stdout.trim();
  const shell = (args, label, cleanup) => exec(['shell', ...args], label, cleanup);
  const checkUser = async () => {
    if (await shell(['am', 'get-current-user'], 'user') !== '0') throw new Error('현재 사용자 0의 검사 앱에서만 전환을 확인합니다.');
  };
  const secure = (op, key, values, cleanup) => shell(['settings', '--user', '0', op, 'secure', key, ...values], op + '-' + key, cleanup);
  const get = (key, cleanup) => secure('get', key, [], cleanup);
  const put = (key, value, cleanup) => secure('put', key, ["'" + value + "'"], cleanup);
  const remove = (key, cleanup) => secure('delete', key, [], cleanup);
  const foreground = async (cleanup = false) => resumedPackage(await shell(['dumpsys', 'activity', 'activities'], 'foreground', cleanup));
  const returnToMarket = (cleanup = false) => returnFromInspectionSettings({
    foreground: () => foreground(cleanup),
    back: () => shell(['input', 'keyevent', 'KEYCODE_BACK'], 'back-to-market', cleanup),
  });
  const observe = async () => {
    const requestId = 'toggle-' + token + '-' + sequence;
    const raw = await shell(['CLASSPATH=' + remote, 'app_process', '/system/bin', 'TalkBackSnapshot',
      requestId, applicationId, TALKBACK_PACKAGE], 'screen');
    return flattenNodes(parseTalkBackSnapshot(raw, { requestId, applicationId, talkBackPackage: TALKBACK_PACKAGE }));
  };
  const button = (nodes, state) => nodes.find((node) => node.packageName === applicationId &&
    node.id === 'talkback-settings' && node.enabled && node.visible && nodeText(node).includes('화면 읽기 ' + state));
  const screen = (state) => waitUntil(observe,
    (nodes) => isTalkBackTargetReady(nodes, { applicationId, runId: apkState.buildNonce }) && button(nodes, state),
    '이번 검사 앱의 화면 읽기 ' + state);
  await checkUser();
  if (!['null', ''].includes(await get(services)) || await get(enabled) !== '0') {
    throw new Error('기존 접근성 서비스가 켜져 있어 검사 앱과 기기 상태를 보존했습니다.');
  }
  const observer = await buildTalkBackObserver({ repoRoot, runDir: path.join(runDir, 'inspection-toggle'), run });
  let openedSettings = false;
  try {
    await exec(['push', observer.jarPath, remote], 'push-observer');
    // 전체 놀이 검사가 끝난 빈 장보기 세션에서 상단의 APK 표시와 버튼을 다시 확인한다.
    await shell(['am', 'force-stop', '--user', '0', applicationId], 'restart-inspection');
    await shell(['am', 'start', '--user', '0', '-W', '-n', applicationId + '/.MainActivity'], 'open-inspection');
    const initial = await screen('꺼짐');
    const pid = () => shell(['pidof', applicationId], 'pid');
    const originalPid = await pid();
    if (!/^\d+$/u.test(originalPid)) throw new Error('검사 앱 프로세스를 확인하지 못했습니다.');
    const [left, top, right, bottom] = button(initial, '꺼짐').bounds;
    if (left >= right || top >= bottom) throw new Error('설정 버튼이 화면 밖에 있습니다.');
    openedSettings = true;
    await shell(['input', 'tap', String(Math.floor((left + right) / 2)), String(Math.floor((top + bottom) / 2))], 'open-settings');
    await waitUntil(foreground, (current) => current === settingsPackage, 'Android 접근성 설정');
    await withInspectionTalkBack({ get, put, remove, checkUser }, async () => {
      await waitUntil(async () => {
        assertTalkBackBound(await shell(['dumpsys', 'accessibility'], 'bound'));
        return true;
      }, Boolean, 'TalkBack 연결과 터치 탐색');
      openedSettings = false;
      await returnToMarket();
      await screen('켜짐');
      if (await pid() !== originalPid) throw new Error('설정 복귀 중 검사 앱 프로세스가 바뀌었습니다.');
    });
    await screen('꺼짐');
    if (await pid() !== originalPid) throw new Error('화면 읽기를 끄는 동안 검사 앱 프로세스가 바뀌었습니다.');
    return { before: 'off', enabled: 'on', restored: 'off', restoredSettings: true };
  } finally {
    try {
      if (openedSettings && await foreground(true) === settingsPackage) await returnToMarket(true);
    } finally {
      await shell(['rm', '-f', remote], 'remove-observer', true);
    }
  }
}
