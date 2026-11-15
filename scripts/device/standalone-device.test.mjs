import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspectOfflineNetwork, parseConnectivity, requireOffline, runStandaloneOffline } from './standalone-device.mjs';

function connectivity(online, extra = false) {
  return 'Active default network: ' + (online ? '100' : 'none') + '\nCurrent Networks:\n'
    + '  NetworkAgentInfo{network{101} nc{[ Transports: CELLULAR Capabilities: IMS&TRUSTED ]}}\n'
    + (online || extra ? '  NetworkAgentInfo{network{100} nc{[ Transports: WIFI Capabilities: INTERNET&TRUSTED&NOT_RESTRICTED ]}}\n' : '')
    + '    Requests: NetworkRequest [ Capabilities: INTERNET&VALIDATED ]\nStatus for known UIDs:\n'
    + 'history: previously INTERNET was connected; private-network-name\n';
}

function harness(t, options = {}) {
  const temp = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'store-price-standalone-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), temp);
    assert.ok(path.basename(root).startsWith('store-price-standalone-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const apkPath = path.join(root, 'test.apk');
  fs.writeFileSync(apkPath, 'unit-test APK bytes, not an Android package');
  const sha256 = createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex');
  const buildNonce = 'standalone-0123456789abcdef';
  const apkState = { apkPath, sha256, buildNonce, applicationId: 'com.ungjo.storeprice.offline.b0123456789abcdef', versionCode: 1, versionName: '0.1.0' };
  const state = { wifi: options.wifi ?? '1', data: options.data ?? '1', sub: '1', sim: 'LOADED,NOT_READY',
    perSub: 'null', airplane: '0', installed: false, installedSha: sha256, reverses: options.reverses ?? '', notLaunched: true };
  const calls = [];
  const apkDevicePath = '/data/app/~~random/package-name==/base.apk';
  const adb = async (label, args, opts = {}) => {
    calls.push({ label, args, cleanup: opts.cleanup === true });
    if (options.prematureLaunch && label === 'standalone-before-change-wifi') state.notLaunched = false;
    if (options.changeApkAfterRestore && label === 'standalone-restored-reverse') fs.appendFileSync(apkPath, 'changed after restoration');
    const command = args.join(' ');
    let stdout;
    if (command === 'shell am get-current-user') stdout = options.invalidUser ?? '0';
    else if (command.startsWith('shell pm list packages')) {
      const currentUser = args[args.indexOf('--user') + 1];
      assert.equal(currentUser, '0');
      if (options.packageListDenied) return { stdout: '', stderr: 'Error: java.lang.SecurityException: Shell does not have permission to access current user', code: 0 };
      if (options.packageListNonzero) return { stdout: '', stderr: '', code: 1 };
      if (options.packageListMalformed || (options.removalCheckMalformed && label === 'standalone-owned-package-removed')) return { stdout: 'Error: package query unavailable', stderr: '', code: 0 };
      stdout = (options.existingUser === currentUser || (state.installed && currentUser === '0')) ? 'package:' + apkState.applicationId : '';
    } else if (args[0] === 'install') {
      assert.ok(args.includes('-R')); assert.equal(args[args.indexOf('--user') + 1], '0');
      if (options.existingUser === '10') throw new Error('global replacement denied by -R');
      state.installed = true; stdout = 'Performing Streamed Install\nSuccess\n';
    }
    else if (command.startsWith('shell pm path')) stdout = state.installed ? 'package:' + apkDevicePath : '';
    else if (command.startsWith('shell sha256sum')) stdout = state.installedSha + '  ' + apkDevicePath;
    else if (command.startsWith('shell dumpsys package')) stdout = 'Packages:\n    User 0: installed=true stopped=true notLaunched=' + state.notLaunched + '\n';
    else if (command.startsWith('shell pm uninstall')) { state.installed = false; stdout = 'Success\n'; }
    else if (command === 'shell settings get global wifi_on') stdout = state.wifi;
    else if (command === 'shell settings get global mobile_data') stdout = state.data;
    else if (command === 'shell settings get global mobile_data1') stdout = state.perSub;
    else if (command === 'shell settings get global multi_sim_data_call') stdout = state.sub;
    else if (command === 'shell settings get global airplane_mode_on') stdout = state.airplane;
    else if (command === 'shell getprop gsm.sim.state') stdout = state.sim;
    else if (command === 'shell dumpsys connectivity') stdout = connectivity(state.wifi === '1' || state.data === '1');
    else if (command === 'reverse --list') stdout = state.reverses;
    else if (command === 'shell svc data disable') {
      state.data = '0';
      if (options.partialDisableFailure) throw new Error('simulated failure after data was disabled');
      stdout = '';
    } else if (command === 'shell svc wifi disable') { state.wifi = '0'; stdout = ''; }
    else if (command === 'shell svc data enable') {
      if (options.restoreFailure) throw new Error('simulated data restoration failure');
      state.data = '1'; stdout = '';
    } else if (command === 'shell svc wifi enable') { state.wifi = '1'; stdout = ''; }
    else throw new Error('Unexpected test command: ' + command);
    return { stdout, stderr: '', code: 0 };
  };
  const run = async (label, executable, args, opts) => {
    calls.push({ label, args });
    assert.equal(state.wifi, '0'); assert.equal(state.data, '0'); assert.equal(state.reverses, '');
    assert.equal(opts.timeout, 600_000); assert.ok(opts.signal instanceof AbortSignal);
    assert.ok(args.includes('APP_ID=' + apkState.applicationId)); assert.ok(args.includes('RUN_ID=' + buildNonce));
    state.notLaunched = false;
    if (options.airplaneChanged) { state.airplane = '1'; throw new Error('simulated user airplane-mode change'); }
    if (options.installedHashChanged) { state.installedSha = '0'.repeat(64); throw new Error('simulated installed package replacement'); }
    if (options.runError) throw new Error('simulated native failure');
    if (options.changeApk) fs.appendFileSync(apkPath, 'changed');
    if (options.networkReturns) {
      state.wifi = '1';
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('monitor did not abort')), 10_000);
        opts.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('native interrupted')); }, { once: true });
      });
    }
    return { stdout: '', code: 0 };
  };
  return { root, state, calls, adb, apkState,
    execute: () => runStandaloneOffline({ adb, run, tools: { maestro: 'test-maestro', selectedSerial: 'test-usb' }, runDir: root, apkState,
      discardSuccessfulInstall: options.discardSuccessfulInstall ?? false,
      verifyInstalled: options.verifyInstalled,
      validateJunit: (file) => {
        assert.equal(file, path.join(root, 'standalone-result.xml'));
        if (options.invalidJunit) throw new Error('simulated strict JUnit validation failure');
      } }) };
}

test('현재 NetworkAgent만 검사하고 과거 요청의 INTERNET 문구는 연결로 오인하지 않는다', () => {
  assert.deepEqual(parseConnectivity(connectivity(false)), { activeDefaultNetwork: false, internetNetworkCount: 0 });
  assert.deepEqual(parseConnectivity(connectivity(true)), { activeDefaultNetwork: true, internetNetworkCount: 1 });
  assert.equal(parseConnectivity(connectivity(false, true)).internetNetworkCount, 1);
  assert.equal(parseConnectivity(connectivity(false, true).replace('INTERNET&TRUSTED', 'WIFI_P2P&INTERNET&TRUSTED')).internetNetworkCount, 1);
  for (const text of ['', 'Active default network: none\n', connectivity(false).replace('Capabilities: IMS&TRUSTED', 'unknown')]) assert.throws(() => parseConnectivity(text));
});

test('Wi-Fi·데이터·기본 연결·인터넷 가능 망·USB 전달 중 하나라도 있으면 오프라인으로 통과하지 않는다', () => {
  const offline = { wifiEnabled: false, mobileDataEnabled: false, activeDefaultNetwork: false, internetNetworkCount: 0, reverseMappingCount: 0 };
  assert.doesNotThrow(() => requireOffline(offline));
  for (const key of Object.keys(offline)) assert.throws(() => requireOffline({ ...offline, [key]: typeof offline[key] === 'boolean' ? true : 1 }));
});

test('진단 결과는 상태와 개수만 반환하며 네트워크 이름·원본 진단을 공개하지 않는다', async (t) => {
  const h = harness(t); const result = await inspectOfflineNetwork({ adb: h.adb });
  assert.equal(result.wifiEnabled, true); assert.equal(result.internetNetworkCount, 1);
  assert.equal(JSON.stringify(result).includes('private-network-name'), false);
  h.state.sim = 'LOADED,LOADED';
  await assert.rejects(inspectOfflineNetwork({ adb: h.adb }), /회선 하나/u);
});

test('현재 프로필에 있던 패키지는 보존하며 설치·통신 변경을 하지 않는다', async (t) => {
  const h = harness(t, { existingUser: '0' });
  await assert.rejects(h.execute(), /이미 있습니다/u);
  assert.equal(h.calls.some((call) => call.args[0] === 'install' || call.args.includes('svc') || call.args.includes('uninstall')), false);
});

test('기존 USB 역방향 연결이나 변조된 APK가 있으면 설치 전에 중단한다', async (t) => {
  const h = harness(t, { reverses: 'UsbFfs tcp:8082 tcp:8082\n' });
  await assert.rejects(h.execute(), /역방향 연결/u);
  assert.equal(h.state.installed, false);
  fs.appendFileSync(h.apkState.apkPath, 'tamper');
  await assert.rejects(h.execute(), /일치하지/u);
});

test('새 APK를 오프라인에서 검사하고 설정 복구를 검증한 뒤 앱을 남긴다', async (t) => {
  const h = harness(t); const result = await h.execute();
  assert.equal(result.installedFresh, true); assert.equal(result.firstLaunchOffline, true);
  assert.equal(result.installationScope, 'current-android-user');
  assert.equal(result.verifyInstalledStatus, 'not-requested');
  assert.equal(result.network.restoration.verified, true); assert.ok(result.network.offlineChecks >= 2);
  assert.equal(h.state.wifi, '1'); assert.equal(h.state.data, '1'); assert.equal(h.state.installed, true);
  const install = h.calls.find((call) => call.args[0] === 'install');
  assert.equal(install.args.includes('-r'), false); assert.equal(install.args.includes('-g'), false);
  assert.equal(install.args.includes('-R'), true); assert.equal(install.args[install.args.indexOf('--user') + 1], '0');
  assert.equal(h.calls.some((call) => call.args.includes('clear')), false);
  assert.ok(h.calls.filter((call) => call.label.startsWith('standalone-restore')).every((call) => call.cleanup));
});

test('원래 꺼진 연결은 켜거나 끄지 않으며 원래 상태를 그대로 확인한다', async (t) => {
  const h = harness(t, { wifi: '0', data: '0' }); const result = await h.execute();
  assert.equal(h.calls.some((call) => call.args.includes('svc')), false);
  assert.deepEqual(result.network.restoration, { wifi: 'not-needed', mobileData: 'not-needed', verified: true });
});

test('네이티브 실패 후 연결부터 복구하고 이번에 설치한 정확한 앱만 제거한다', async (t) => {
  const h = harness(t, { runError: true });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.standalone.network.restoration.verified, true);
    assert.equal(error.standalone.installationCleanup, 'removed-own-failed-install');
    assert.equal(error.standalone.firstLaunchOffline, false); return true;
  });
  assert.equal(h.state.wifi, '1'); assert.equal(h.state.data, '1'); assert.equal(h.state.installed, false);
  assert.ok(h.calls.findIndex((call) => call.args.includes('uninstall')) > h.calls.findIndex((call) => call.label === 'standalone-restore-mobileData-check'));
});

test('설정 변경 직후 명령이 실패해도 변경 요청 기록을 이용해 복구한다', async (t) => {
  const h = harness(t, { partialDisableFailure: true });
  await assert.rejects(h.execute(), (error) => error.standalone.network.restoration.verified === true);
  assert.equal(h.state.wifi, '1'); assert.equal(h.state.data, '1'); assert.equal(h.state.installed, false);
});

test('복구 실패는 성공 결과로 반환하지 않으며 부분 증거에 실패를 남긴다', async (t) => {
  const h = harness(t, { restoreFailure: true });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.standalone.network.restoration.verified, false);
    assert.equal(error.standalone.network.restoration.mobileData, 'failed'); return true;
  });
});

test('검사 도중 실제 연결이 돌아오면 네이티브 실행을 취소하고 통과시키지 않는다', async (t) => {
  const h = harness(t, { networkReturns: true });
  await assert.rejects(h.execute(), (error) => {
    assert.match(error.message, /실제 오프라인 상태/u);
    assert.equal(error.message.includes('native interrupted'), false);
    return error.standalone.network.restoration.verified === true;
  });
  assert.equal(h.state.data, '1'); assert.equal(h.state.installed, false);
});

test('검사 중 APK 원본이 바뀌면 실패하며 설치했던 원래 해시의 검사 앱만 제거한다', async (t) => {
  const h = harness(t, { changeApk: true });
  await assert.rejects(h.execute(), /일치하지/u);
  assert.equal(h.state.installed, false); assert.equal(h.state.wifi, '1');
});

test('검사 중 비행기 모드가 바뀌면 사용자의 선택을 덮어쓰지 않고 복구 미확인으로 중단한다', async (t) => {
  const h = harness(t, { airplaneChanged: true });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.standalone.network.restoration.verified, false);
    assert.equal(error.standalone.network.restoration.wifi, 'preserved-change');
    assert.equal(error.standalone.network.restoration.mobileData, 'preserved-change'); return true;
  });
  assert.equal(h.state.airplane, '1');
  assert.equal(h.calls.some((call) => call.args.includes('svc') && call.args.includes('enable')), false);
});

test('실패 정리 때 설치된 APK 해시가 달라졌으면 앱을 제거하지 않는다', async (t) => {
  const h = harness(t, { installedHashChanged: true });
  await assert.rejects(h.execute(), (error) => error.standalone.installationCleanup === 'failed-preserved');
  assert.equal(h.state.installed, true);
  assert.equal(h.calls.some((call) => call.args.includes('uninstall')), false);
});

test('연결을 끄기 전에 앱이 먼저 실행됐으면 첫 실행 검사로 인정하지 않는다', async (t) => {
  const h = harness(t, { prematureLaunch: true });
  await assert.rejects(h.execute(), (error) => {
    assert.match(error.message, /아직 실행되지/u);
    assert.equal(error.standalone.network.restoration.verified, true);
    assert.equal(error.standalone.installationCleanup, 'removed-own-failed-install'); return true;
  });
  assert.equal(h.calls.some((call) => call.label === 'maestro-standalone-offline'), false);
  assert.equal(h.state.installed, false);
});

test('명령이 성공해도 JUnit이 올바르지 않으면 복구하고 검사 앱을 제거한다', async (t) => {
  const h = harness(t, { invalidJunit: true });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.standalone.firstLaunchOffline, false);
    assert.equal(error.standalone.network.restoration.verified, true);
    assert.equal(error.standalone.installationCleanup, 'removed-own-failed-install'); return true;
  });
  assert.equal(h.state.installed, false);
});

test('진단 모드 성공은 설정을 복구한 뒤 이번에 새로 설치한 앱만 제거한다', async (t) => {
  const h = harness(t, { discardSuccessfulInstall: true });
  const result = await h.execute();
  assert.equal(result.firstLaunchOffline, true);
  assert.equal(result.network.restoration.verified, true);
  assert.equal(result.installationCleanup, 'removed-own-probe-install');
  assert.equal(h.state.installed, false);
  assert.ok(h.calls.findIndex((call) => call.args.includes('uninstall')) > h.calls.findIndex((call) => call.label === 'standalone-restore-mobileData-check'));
});

test('현재 프로필의 빈 목록이라도 접근 오류 또는 종료 실패가 있으면 설치하지 않는다', async (t) => {
  for (const option of [{ packageListDenied: true }, { packageListNonzero: true }, { packageListMalformed: true }, { invalidUser: 'unknown' }]) {
    const h = harness(t, option);
    await assert.rejects(h.execute(), /확인하지 못/u);
    assert.equal(h.calls.some((call) => call.args[0] === 'install' || call.args.includes('svc') || call.args.includes('uninstall')), false);
  }
});

test('다른 프로필은 조회하지 않으며 같은 전역 패키지가 있으면 -R로 교체를 막는다', async (t) => {
  const h = harness(t, { existingUser: '10' });
  await assert.rejects(h.execute(), /replacement denied/u);
  assert.equal(h.calls.some((call) => call.args.join(' ') === 'shell pm list users'), false);
  assert.equal(h.calls.some((call) => call.args.includes('--user') && call.args[call.args.indexOf('--user') + 1] !== '0'), false);
  assert.equal(h.calls.some((call) => call.args.includes('svc') || call.args.includes('uninstall')), false);
  assert.equal(h.state.installed, false);
});

test('정리 후 목록 조회가 비정상인 경우 앱 제거 완료로 기록하지 않는다', async (t) => {
  const h = harness(t, { discardSuccessfulInstall: true, removalCheckMalformed: true });
  await assert.rejects(h.execute(), (error) => error.standalone.installationCleanup === 'failed-preserved');
});

test('후속 검사는 연결 복구 확인 뒤 한 번 실행하고 비동기 완료 후 성공 앱을 남긴다', async (t) => {
  const h = harness(t, { verifyInstalled: async () => {
    assert.equal(h.state.wifi, '1'); assert.equal(h.state.data, '1'); assert.equal(h.state.installed, true);
    assert.equal(h.state.notLaunched, false);
    assert.equal(h.calls.at(-1).label, 'standalone-restored-reverse');
    h.calls.push({ label: 'verify-installed-start', args: [] });
    await new Promise((resolve) => setImmediate(resolve));
    h.calls.push({ label: 'verify-installed-finished', args: [] });
  } });
  const result = await h.execute();
  assert.equal(result.firstLaunchOffline, true);
  assert.equal(result.network.restoration.verified, true);
  assert.equal(result.verifyInstalledStatus, 'passed');
  assert.equal(result.installationCleanup, 'not-needed');
  assert.equal(h.state.installed, true);
  assert.equal(h.calls.filter((call) => call.label === 'verify-installed-start').length, 1);
  assert.equal(h.calls.at(-1).label, 'verify-installed-finished');
});

test('후속 검사 실패도 복구된 연결을 유지하며 이번에 설치한 정확한 앱만 제거한다', async (t) => {
  const h = harness(t, { verifyInstalled: async () => {
    h.calls.push({ label: 'verify-installed-failed', args: [] });
    throw new Error('simulated installed verification failure');
  } });
  await assert.rejects(h.execute(), (error) => {
    assert.match(error.message, /installed verification failure/u);
    assert.equal(error.standalone.firstLaunchOffline, true);
    assert.equal(error.standalone.network.restoration.verified, true);
    assert.equal(error.standalone.verifyInstalledStatus, 'failed');
    assert.equal(error.standalone.installationCleanup, 'removed-own-failed-install'); return true;
  });
  assert.equal(h.state.wifi, '1'); assert.equal(h.state.data, '1'); assert.equal(h.state.installed, false);
  assert.ok(h.calls.findIndex((call) => call.args.includes('uninstall')) > h.calls.findIndex((call) => call.label === 'verify-installed-failed'));
});

test('오프라인 실행이나 JUnit 검증에 실패하면 후속 검사를 호출하지 않는다', async (t) => {
  for (const option of [{ runError: true }, { invalidJunit: true }]) {
    let calls = 0;
    const h = harness(t, { ...option, verifyInstalled: async () => { calls += 1; } });
    await assert.rejects(h.execute(), (error) => {
      assert.equal(error.standalone.firstLaunchOffline, false);
      assert.equal(error.standalone.network.restoration.verified, true);
      assert.equal(error.standalone.verifyInstalledStatus, 'not-run'); return true;
    });
    assert.equal(calls, 0); assert.equal(h.state.installed, false);
  }
});

test('후속 검사가 오류 값 없이 거절돼도 실패를 반환하고 이번 검사 앱을 제거한다', async (t) => {
  const h = harness(t, { verifyInstalled: () => Promise.reject() });
  await assert.rejects(h.execute(), (error) => {
    assert.match(error.message, /후속 검사에 실패/u);
    assert.equal(error.standalone.verifyInstalledStatus, 'failed');
    assert.equal(error.standalone.network.restoration.verified, true);
    assert.equal(error.standalone.installationCleanup, 'removed-own-failed-install'); return true;
  });
  assert.equal(h.state.installed, false);
});

test('연결 복구가 실패하면 오프라인 검사가 통과했어도 후속 검사를 호출하지 않는다', async (t) => {
  let calls = 0;
  const h = harness(t, { restoreFailure: true, verifyInstalled: async () => { calls += 1; } });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.standalone.firstLaunchOffline, true);
    assert.equal(error.standalone.network.restoration.verified, false);
    assert.equal(error.standalone.verifyInstalledStatus, 'not-run'); return true;
  });
  assert.equal(calls, 0);
});

test('진단 모드도 후속 검사 완료를 기다린 뒤 이번에 설치한 앱을 제거한다', async (t) => {
  const h = harness(t, { discardSuccessfulInstall: true, verifyInstalled: async () => {
    assert.equal(h.state.installed, true);
    assert.equal(h.state.wifi, '1'); assert.equal(h.state.data, '1');
    await new Promise((resolve) => setImmediate(resolve));
    h.calls.push({ label: 'verify-installed-finished', args: [] });
  } });
  const result = await h.execute();
  assert.equal(result.verifyInstalledStatus, 'passed');
  assert.equal(result.installationCleanup, 'removed-own-probe-install');
  assert.equal(h.state.installed, false);
  assert.ok(h.calls.findIndex((call) => call.args.includes('uninstall')) > h.calls.findIndex((call) => call.label === 'verify-installed-finished'));
});

test('후속 검사 옵션이 함수가 아니면 기기를 조회하거나 설치하기 전에 거절한다', async (t) => {
  for (const verifyInstalled of [null, false, {}, 'verify']) {
    const h = harness(t, { verifyInstalled });
    await assert.rejects(h.execute(), /후속 검사는 함수/u);
    assert.equal(h.calls.length, 0); assert.equal(h.state.installed, false);
  }
});

test('후속 검사 직전이나 직후 APK 파일이 바뀌면 성공으로 반환하지 않는다', async (t) => {
  for (const beforeCallback of [true, false]) {
    let calls = 0;
    const h = harness(t, { changeApkAfterRestore: beforeCallback, verifyInstalled: async () => {
      calls += 1;
      fs.appendFileSync(h.apkState.apkPath, 'changed during installed verification');
    } });
    await assert.rejects(h.execute(), (error) => {
      assert.match(error.message, /일치하지/u);
      assert.equal(error.standalone.verifyInstalledStatus, 'failed');
      assert.equal(error.standalone.network.restoration.verified, true);
      assert.equal(error.standalone.installationCleanup, 'removed-own-failed-install'); return true;
    });
    assert.equal(calls, beforeCallback ? 0 : 1); assert.equal(h.state.installed, false);
  }
});

test('후속 검사 중 설치된 앱 해시가 바뀌면 실패하더라도 다른 앱을 제거하지 않는다', async (t) => {
  const h = harness(t, { verifyInstalled: async () => {
    h.state.installedSha = '0'.repeat(64);
    throw new Error('simulated replaced installed app');
  } });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.standalone.verifyInstalledStatus, 'failed');
    assert.equal(error.standalone.installationCleanup, 'failed-preserved'); return true;
  });
  assert.equal(h.state.installed, true);
  assert.equal(h.calls.some((call) => call.args.includes('uninstall')), false);
});
