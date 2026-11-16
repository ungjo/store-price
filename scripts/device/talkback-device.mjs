import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { buildTalkBackObserver, parseTalkBackSnapshot } from './talkback-observer.mjs';
import { createTalkBackTouch } from './talkback-input.mjs';
import { runTalkBackJourney } from './talkback-journey.mjs';
import { readTalkBackSpeechOcr } from './talkback-speech-ocr.mjs';

const TALKBACK_PACKAGE = 'com.samsung.android.accessibility.talkback';
const TALKBACK_COMPONENT = TALKBACK_PACKAGE + '/com.samsung.android.marvin.talkback.TalkBackService';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function talkBackLaunchKind({ mode, applicationId, runId }) {
  if (typeof runId !== 'string' || runId !== runId.trim() || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(runId)) {
    throw new Error('TalkBack 실행 표시가 올바르지 않습니다.');
  }
  if (mode === 'expo-go' && applicationId === 'host.exp.exponent') return 'expo-deep-link';
  if (mode === 'standalone') {
    const nonce = /^standalone-([a-f0-9]{16})$/u.exec(runId)?.[1];
    // 기존 앱을 잘못 재시작하지 않도록 검사용 패키지와 빌드 표시의 같은 nonce를 확인합니다.
    if (nonce && applicationId === 'com.ungjo.storeprice.offline.b' + nonce) return 'android-launcher';
  }
  throw new Error('TalkBack 실행 모드와 앱·빌드 표시가 일치하지 않습니다.');
}

export function resolveTalkBackTarget({ mode = 'expo-go', applicationId, runId, expoUrl }) {
  const launchKind = talkBackLaunchKind({ mode, applicationId, runId });
  let launchArgs;
  if (mode === 'expo-go') {
    // 개발 서버 주소는 이 검사기가 준비한 로컬 연결로 한정합니다.
    const matched = typeof expoUrl === 'string' ? /^exp:\/\/127\.0\.0\.1:(\d{1,5})$/u.exec(expoUrl) : null;
    if (!matched || matched[0] !== expoUrl || Number(matched[1]) < 1 || Number(matched[1]) > 65535) {
      throw new Error('Expo Go 검사에는 정확한 로컬 Expo 주소가 필요합니다.');
    }
    launchArgs = ['am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', expoUrl, '-p', applicationId];
  } else {
    if (expoUrl !== undefined) throw new Error('설치형 TalkBack 검사는 Expo 주소를 사용하지 않습니다.');
    // 실제 빌드 manifest의 exported MainActivity를 명시해 DEFAULT가 없는 런처 필터의 암시적 해석에 의존하지 않습니다.
    launchArgs = ['am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-n', applicationId + '/' + applicationId + '.MainActivity'];
  }
  return Object.freeze({ mode, applicationId, runId, launchKind, launchArgs: Object.freeze(launchArgs) });
}

export function assertTalkBackResult(result, { mode = 'expo-go', applicationId, runId }) {
  const launchKind = talkBackLaunchKind({ mode, applicationId, runId });
  // 다른 앱이나 예전 빌드의 성공 결과를 현재 APK의 접근성 증거로 재사용하지 않습니다.
  if (!result || result.status !== 'passed' || result.mode !== mode || result.launchKind !== launchKind
    || result.applicationId !== applicationId || result.runId !== runId || result.inputMode !== 'uinput-touch'
    || typeof result.talkBackVersion !== 'string' || !result.talkBackVersion.trim()
    || !Array.isArray(result.checkpoints) || result.checkpoints.length === 0
    || !result.checkpoints.some((entry) => entry?.speech?.matched === true)
    || result.checkpoints.some((entry) => entry?.expectation?.speechIncludes && entry.speech?.matched !== true)
    || result.restoration?.verified !== true) {
    throw new Error('TalkBack의 검사 대상·실제 입력·발화 근거·설정 복구를 확인하지 못해 기록과 커밋을 만들지 않습니다.');
  }
}


export function assertTalkBackLaunchResult(result, target) {
  talkBackLaunchKind(target);
  if (!result || typeof result.stdout !== 'string'
    || (result.stderr !== undefined && typeof result.stderr !== 'string')
    || (result.code !== undefined && result.code !== 0)
    || (result.exitCode !== undefined && result.exitCode !== 0)) {
    throw new Error('TalkBack 대상 앱 시작 명령이 실패했습니다.');
  }
  const output = result.stdout + '\n' + (result.stderr ?? '');
  // 일부 Android am 명령은 실패를 출력하고도 0을 반환하므로 실제 시작 상태와 Activity를 함께 확인합니다.
  if (/(?:^|[\r\n])\s*(?:Error\b|Exception\b|[A-Za-z0-9_.$]*Exception\b|Permission Denial\b|Security exception\b)/iu.test(output)) {
    throw new Error('TalkBack 대상 앱을 시작하지 못했습니다.');
  }
  const lines = output.split(/\r?\n/u).map((line) => line.trim());
  const statuses = lines.filter((line) => line.startsWith('Status:'));
  const activities = lines.filter((line) => line.startsWith('Activity:'));
  if (statuses.length !== 1 || statuses[0] !== 'Status: ok' || activities.length !== 1) {
    throw new Error('TalkBack 대상 앱의 실제 시작 완료를 확인하지 못했습니다.');
  }
  const component = activities[0].slice('Activity:'.length).trim();
  const matched = /^([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+)\/(\.?[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*)$/u.exec(component);
  if (!matched || matched[1] !== target.applicationId) throw new Error('다른 앱의 시작 결과는 TalkBack 검사에 사용하지 않습니다.');
  const activity = matched[2].startsWith('.') ? target.applicationId + matched[2] : matched[2];
  if (target.mode === 'standalone' && activity !== target.applicationId + '.MainActivity') {
    throw new Error('설치형 APK의 검증된 MainActivity가 시작되지 않았습니다.');
  }
  // 이미 열린 앱으로 돌아갈 때의 정상 Warning도 Status: ok와 같은 Activity가 확인된 경우에만 허용합니다.
  return target.applicationId + '/' + activity;
}

export function isTalkBackTargetReady(nodes, target) {
  // 현재 회귀 검사의 상품·가격 조건은 공개 DB의 예시 12개입니다. 다른 출처나 오래된 번들을 통과시키지 않습니다.
  const expected = [
    ['device-run-marker', '자동 검사 ' + target.runId],
    ['catalog-source-marker', '상품 출처 supabase'],
    ['catalog-loaded-count', '불러온 상품 12개'],
  ];
  return expected.every(([id, desc]) => nodes.some((node) =>
    node.packageName === target.applicationId && node.id === id && node.desc === desc && node.visible));
}

export const flattenNodes = (value) => value.windows.flatMap((window) => {
  const visit = (node) => [node, ...node.children.flatMap(visit)];
  return visit(window.root);
});
export const nodeText = (node) => [node?.text, node?.desc, node?.stateDescription].filter(Boolean).join(' ');
export const normalizeSpeech = (value) => String(value).replace(/[^0-9A-Za-z가-힣]/gu, '').toLowerCase();

export function assertTalkBackBound(value, component = TALKBACK_COMPONENT) {
  const bound = value.split(/\r?\n/u).find((line) => line.includes('Bound services:'));
  if (!bound?.includes('id=' + component + ',') || !bound.includes('FEEDBACK_SPOKEN')
    || !/touchExplorationEnabled=true/u.test(value)) throw new Error('실제 TalkBack 연결·터치 탐색을 확인하지 못했습니다.');
}

export function findSettingSwitch(nodes, label) {
  const visit = (node) => {
    const flattened = [node, ...node.children.flatMap((child) => {
      const walk = (entry) => [entry, ...entry.children.flatMap(walk)];
      return walk(child);
    })];
    const text = flattened.find((entry) => entry.text === label);
    const switches = flattened.filter((entry) => entry.checkable && /Switch/u.test(entry.className ?? ''));
    if (text && switches.length === 1) return { label: text, toggle: switches[0] };
    for (const child of node.children) { const match = visit(child); if (match) return match; }
    return null;
  };
  for (const node of nodes) { const match = visit(node); if (match) return match; }
  throw new Error('설정 스위치를 찾지 못했습니다: ' + label);
}

export function assertCheckpoint(view, expectation) {
  const node = expectation.nodeId ? view.nodes.find((entry) => entry.id === expectation.nodeId) : view.focus;
  if (expectation.focusId && view.focus?.id !== expectation.focusId) throw new Error('읽기 초점 불일치: ' + expectation.focusId + ' / 실제 ' + view.focus?.id);
  // 자동 초점은 화면 밖에 남은 이전 노드가 아니라 실제로 보이는 요소여야 한다.
  if (expectation.focusId && (!view.focus?.visible || !Array.isArray(view.focus.bounds)
    || view.focus.bounds[2] <= view.focus.bounds[0] || view.focus.bounds[3] <= view.focus.bounds[1])) throw new Error('읽기 초점이 화면에 보이지 않습니다.');
  if (expectation.nodeId && !node) throw new Error('화면 항목이 없습니다: ' + expectation.nodeId);
  if (expectation.textIncludes && !nodeText(node).includes(expectation.textIncludes)) throw new Error('안내 내용 불일치: ' + expectation.textIncludes);
  for (const key of ['selected', 'enabled']) {
    if (expectation[key] !== undefined && node?.[key] !== expectation[key]) throw new Error('항목 상태 불일치: ' + key);
  }
}

// 일반 Maestro와 분리해 실제 TalkBack이 켜진 구간에는 서비스를 억제하는 UIAutomator를 실행하지 않는다.
export async function runTalkBack({ repoRoot, runDir, run, adb, tools, selectedSerial, runId, applicationId, expoUrl, mode = 'expo-go', say = () => {} }) {
  const target = resolveTalkBackTarget({ mode, applicationId, runId, expoUrl });
  const directory = path.join(runDir, 'talkback');
  fs.mkdirSync(directory);
  const nonce = randomBytes(6).toString('hex');
  const inputName = 'StorePriceTalkBack-' + nonce;
  const remote = '/data/local/tmp/store-price-talkback-' + nonce;
  const result = { status: 'running', mode: target.mode, launchKind: target.launchKind, applicationId, runId, inputMode: 'uinput-touch',
    talkBackComponent: TALKBACK_COMPONENT, checkpoints: [], navigation: [], restoration: { verified: false } };
  let cleanupMode = false;
  let count = 0; let input; let overlayOriginal; let overlayChanged = false; let serviceChanged = false; let remoteCreated = false;
  const command = async (args, suffix = 'read') => {
    const response = await adb('talkback-' + (++count) + '-' + suffix, args, { timeout: 30000, cleanup: cleanupMode });
    return response.stdout.trim();
  };
  const shell = (args, suffix) => command(['shell', ...args], suffix);
  const launchApp = async (suffix) => {
    const response = await adb('talkback-' + (++count) + '-' + suffix, ['shell', ...target.launchArgs], { timeout: 30000, cleanup: cleanupMode });
    return assertTalkBackLaunchResult(response, target);
  };
  const setting = (key) => shell(['settings', '--user', '0', 'get', 'secure', key], 'setting');
  const servicesBefore = await setting('enabled_accessibility_services');
  const enabledBefore = await setting('accessibility_enabled');
  if (!['null', ''].includes(servicesBefore) || enabledBefore !== '0') throw new Error('기존 접근성 서비스가 켜져 있어 임의 변경하지 않습니다. 준비 상태를 확인해 주세요.');
  if ((await shell(['am', 'get-current-user'])) !== '0') throw new Error('현재 사용자 0에서만 검사합니다.');
  result.originalSettings = { services: servicesBefore, enabled: enabledBefore };
  const persist = () => fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  const serviceState = async () => {
    if (await shell(['am', 'get-current-user']) !== '0') throw new Error('검사 중 사용자 프로필이 바뀌었습니다.');
    if (await setting('enabled_accessibility_services') !== TALKBACK_COMPONENT || await setting('accessibility_enabled') !== '1') throw new Error('검사 중 TalkBack 설정이 바뀌었습니다.');
    assertTalkBackBound(await shell(['dumpsys', 'accessibility'], 'bound'));
  };
  const observer = await buildTalkBackObserver({ repoRoot, runDir: directory, run });
  result.observer = { sha256: observer.sha256, sourceSha256: observer.sourceSha256, connectionFlags: 1 };
  const snapshot = async (requireApplicationObserved = true) => {
    const requestId = 'tb-' + nonce + '-' + (++count);
    const output = await shell(['CLASSPATH=' + remote + '/observer.jar', 'app_process', '/system/bin', 'TalkBackSnapshot',
      requestId, applicationId, TALKBACK_PACKAGE, 'com.samsung.android.honeyboard'], 'snapshot');
    const value = parseTalkBackSnapshot(output, { requestId, applicationId, talkBackPackage: TALKBACK_PACKAGE,
      inputMethodPackage: 'com.samsung.android.honeyboard', requireApplicationObserved });
    fs.writeFileSync(path.join(directory, requestId + '.json'), output + '\n');
    const nodes = flattenNodes(value);
    const focus = nodes.find((node) => node.packageName === applicationId && node.accessibilityFocused);
    return { value, nodes, focus, file: requestId + '.json' };
  };
  const center = (node) => {
    if (!node?.visible || node.bounds[2] <= node.bounds[0] || node.bounds[3] <= node.bounds[1]) throw new Error('누를 항목이 화면에 보이지 않습니다.');
    return [Math.round((node.bounds[0] + node.bounds[2]) / 2), Math.round((node.bounds[1] + node.bounds[3]) / 2)];
  };
  const tapSetting = async (node) => { await shell(['input', 'tap', ...center(node).map(String)], 'settings-tap'); await pause(300); };
  const findMenu = async (label) => {
    for (let attempt = 0; attempt < 7; attempt++) {
      const view = await snapshot(false);
      const node = view.nodes.find((entry) => entry.packageName === TALKBACK_PACKAGE && entry.text === label && entry.visible);
      if (node) return node;
      const scroll = view.nodes.find((entry) => entry.packageName === TALKBACK_PACKAGE && entry.scrollable && entry.visible);
      if (!scroll) throw new Error('TalkBack 설정의 스크롤 영역을 찾지 못했습니다.');
      const [x1, y1, x2, y2] = scroll.bounds;
      await shell(['input', 'swipe', String(Math.round((x1 + x2) / 2)), String(y2 - 100), String(Math.round((x1 + x2) / 2)), String(y1 + 100), '400'], 'settings-scroll');
    }
    throw new Error('TalkBack 설정 항목을 찾지 못했습니다: ' + label);
  };
  const openDeveloper = async () => {
    await shell(['am', 'start', '-n', TALKBACK_PACKAGE + '/.TalkBackPreferencesActivity'], 'settings-open');
    await pause(650);
    let view = await snapshot(false);
    if (!view.nodes.some((node) => node.text === '음성 출력 표시')) {
      // 앱이 마지막 설정 하위 화면을 재사용하면 상위로 돌아간 뒤 관찰한 메뉴를 따라간다.
      for (let attempt = 0; attempt < 4 && !view.nodes.some((node) => node.text === 'TalkBack 설정'); attempt++) {
        await shell(['input', 'keyevent', '4'], 'settings-back'); await pause(250); view = await snapshot(false);
        if (view.nodes.some((node) => node.text === '음성 출력 표시')) break;
      }
      if (!view.nodes.some((node) => node.text === '음성 출력 표시')) {
        await tapSetting(await findMenu('고급 설정'));
        await tapSetting(await findMenu('개발자 설정'));
      }
    }
    return snapshot(false);
  };
  const restoreRaw = async (key, original) => {
    await shell(['settings', '--user', '0', original === 'null' ? 'delete' : 'put', 'secure', key, ...(original === 'null' ? [] : [original])], 'restore-setting');
  };
  try {
    await shell(['mkdir', remote], 'mkdir'); remoteCreated = true;
    await command(['push', observer.jarPath, remote + '/observer.jar'], 'push-observer');
    const version = await shell(['dumpsys', 'package', TALKBACK_PACKAGE], 'version');
    result.talkBackVersion = version.match(/versionName=([^\s]+)/u)?.[1];
    if (!result.talkBackVersion) throw new Error('Samsung TalkBack 버전을 확인하지 못했습니다.');
    const prepared = await openDeveloper();
    const toggle = findSettingSwitch(prepared.nodes, '음성 출력 표시');
    overlayOriginal = toggle.toggle.checked;
    result.originalSettings.speechOverlay = overlayOriginal;
    persist();
    if (!overlayOriginal) {
      overlayChanged = true; await tapSetting(toggle.label);
      if (!findSettingSwitch((await snapshot(false)).nodes, '음성 출력 표시').toggle.checked) throw new Error('음성 표시를 켜지 못했습니다.');
    }
    serviceChanged = true;
    await shell(['settings', '--user', '0', 'put', 'secure', 'enabled_accessibility_services', TALKBACK_COMPONENT], 'enable');
    await shell(['settings', '--user', '0', 'put', 'secure', 'accessibility_enabled', '1'], 'enable');
    await pause(700); await serviceState();
    result.talkBackPid = await shell(['pidof', TALKBACK_PACKAGE], 'pid');
    await shell(['am', 'force-stop', applicationId], 'restart-app');
    await launchApp('open-app');
    let ready;
    for (let attempt = 0; attempt < 40; attempt++) {
      await pause(500);
      try {
        const view = await snapshot();
        if (isTalkBackTargetReady(view.nodes, target)) { ready = view; break; }
      } catch { /* 새 화면이 나타날 때까지만 기다리고 다른 앱 화면은 성공으로 사용하지 않는다. */ }
    }
    if (!ready) throw new Error('이번 앱의 실행 표시와 Supabase 상품 12개가 준비된 화면을 확인하지 못했습니다.');
    const root = ready.value.windows.find((window) => window.root.packageName === applicationId).bounds;
    const width = root[2], height = root[3];
    if (width >= height) throw new Error('현재 검사는 세로 화면에서 진행합니다.');
    input = await createTalkBackTouch({ adbPath: tools.adb, serial: selectedSerial, width, height,
      name: inputName, logPath: path.join(directory, 'uinput.log'),
      inspectInput: () => shell(['dumpsys', 'input'], 'input-state') });
    const seek = async (target, { direction = 'next', limit = 100 } = {}) => {
      const matches = typeof target === 'string' ? (node) => node?.id === target : target;
      for (let attempt = 0; attempt <= limit; attempt++) {
        const view = await snapshot();
        if (view.focus?.visible && matches(view.focus)) return view;
        if (attempt === limit) break;
        await input.swipe(direction);
        let after = await snapshot();
        // 자동 스크롤 중 화면 밖의 이전 초점이 남으면 다음 제스처를 서두르지 않는다.
        for (let settle = 0; settle < 6 && (!after.focus?.visible || after.focus.bounds[3] <= after.focus.bounds[1]); settle++) {
          await pause(200); after = await snapshot();
        }
        result.navigation.push({ direction, focusId: after.focus?.id, label: nodeText(after.focus), file: after.file });
        if (after.focus?.visible && matches(after.focus)) return after;
      }
      throw new Error('TalkBack 순서 탐색으로 항목에 도달하지 못했습니다: ' + String(target));
    };
    const activate = async () => {
      const before = await snapshot();
      if (!before.focus?.enabled || !before.focus.clickable) throw new Error('현재 읽기 항목이 활성 버튼이 아닙니다.');
      await input.doubleTap(...center(before.focus));
      await pause(180);
      let after = await snapshot();
      const keyboardVisible = (view) => view.nodes.some((node) => node.packageName === 'com.samsung.android.honeyboard' && node.visible);
      if (keyboardVisible(before) && before.focus?.id === 'quiz-check') {
        for (let attempt = 0; attempt < 12 && keyboardVisible(after); attempt++) {
          await pause(200); after = await snapshot();
        }
        if (keyboardVisible(after)) throw new Error('채점 뒤 키보드가 닫히지 않았습니다.');
        // 키보드 종료 알림이 읽기 탐색을 덮지 않도록 창 전환이 끝난 다음 제스처를 보낸다.
        await pause(450); after = await snapshot();
      }
      return after;
    };
    const checkpoint = async (label, expectation = {}) => {
      if (!/^[a-z0-9-]+$/u.test(label)) throw new Error('검사 지점 이름이 올바르지 않습니다.');
      let view; let lastError;
      for (let attempt = 0; attempt < 20; attempt++) {
        view = await snapshot();
        try { assertCheckpoint(view, expectation); lastError = null; break; }
        catch (error) { lastError = error; await pause(200); }
      }
      if (lastError) throw lastError;
      const remotePng = remote + '/checkpoint.png';
      await shell(['screencap', '-p', remotePng], 'screen');
      await command(['pull', remotePng, path.join(directory, label + '.png')], 'pull-screen');
      await serviceState();
      if (await shell(['pidof', TALKBACK_PACKAGE], 'pid') !== result.talkBackPid) throw new Error('TalkBack 프로세스가 바뀌었습니다.');
      const entry = { label, expectation, focusId: view.focus?.id, focusLabel: nodeText(view.focus), snapshot: view.file,
        screenshot: label + '.png', serviceBound: true, inputMode: 'uinput-touch' };
      if (expectation.speechIncludes) {
        entry.speech = await readTalkBackSpeechOcr({ imagePath: path.join(directory, label + '.png'), autoCrop: true, expectedIncludes: expectation.speechIncludes, run });
      }
      result.checkpoints.push(entry); persist();
      return view;
    };
    const typeDigits = async (digits) => {
      if (!/^\d{1,5}$/u.test(digits)) throw new Error('거스름돈 입력값이 올바르지 않습니다.');
      for (const digit of digits) {
        const view = await snapshot();
        const keys = view.nodes.filter((node) => node.packageName === 'com.samsung.android.honeyboard' && node.visible
          && (node.text === digit || node.desc === digit));
        if (!keys.length) throw new Error('열린 숫자 키보드의 키를 찾지 못했습니다: ' + digit);
        // TalkBack 기본 입력 방식은 숫자 키를 탐색하고 손가락을 떼면 한 글자를 입력한다.
        await input.tap(...center(keys[0])); await pause(180);
      }
    };
    say('TalkBack 실제 쓸기·두 번 탭으로 장보기부터 영수증까지 확인합니다.');
    await runTalkBackJourney({ seek, activate, snapshot, checkpoint, typeDigits });
    await serviceState();
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed'; result.error = error.message; throw error;
  } finally {
    cleanupMode = true;
    const failures = [];
    try {
      if (input) await input.close();
      if ((await shell(['dumpsys', 'input'], 'input-removed')).includes(inputName)) throw new Error('임시 터치 장치가 남아 있습니다.');
      result.restoration.virtualInputRemoved = true;
    } catch (error) { failures.push(error.message); }
    try {
      if (serviceChanged) {
        const current = await setting('enabled_accessibility_services');
        if (current !== TALKBACK_COMPONENT && current !== servicesBefore) throw new Error('사용자가 바꾼 접근성 서비스 설정은 덮어쓰지 않습니다.');
        await restoreRaw('enabled_accessibility_services', servicesBefore);
        await restoreRaw('accessibility_enabled', enabledBefore);
        await pause(500);
      }
      result.restoration.accessibility = await setting('enabled_accessibility_services') === servicesBefore && await setting('accessibility_enabled') === enabledBefore;
      if (!result.restoration.accessibility) throw new Error('접근성 설정 원복을 확인하지 못했습니다.');
      if (overlayChanged) {
        if (await shell(['am', 'get-current-user']) !== '0') throw new Error('원래 사용자 프로필이 아니므로 설정 화면을 조작하지 않습니다.');
        const view = await openDeveloper();
        const toggle = findSettingSwitch(view.nodes, '음성 출력 표시');
        if (toggle.toggle.checked !== overlayOriginal) await tapSetting(toggle.label);
        if (findSettingSwitch((await snapshot(false)).nodes, '음성 출력 표시').toggle.checked !== overlayOriginal) throw new Error('음성 표시 원복을 확인하지 못했습니다.');
      }
      result.restoration.speechOverlay = true;
      await launchApp('return-app');
    } catch (error) { failures.push(error.message); }
    try {
      if (remoteCreated) {
        await shell(['rm', '-f', remote + '/checkpoint.png', remote + '/observer.jar'], 'remove-own-files');
        await shell(['rmdir', remote], 'remove-own-directory');
      }
      result.restoration.observerRemoved = true;
    } catch (error) { failures.push(error.message); }
    result.restoration.verified = failures.length === 0;
    result.restoration.errors = failures;
    if (failures.length) {
      result.status = 'failed'; result.error = 'TalkBack 검사 설정 복구 실패: ' + failures.join('; ');
    }
    persist();
    if (failures.length) throw new Error('TalkBack 검사 설정 복구 실패: ' + failures.join('; '));
  }
  return result;
}
