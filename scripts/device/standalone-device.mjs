import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const flow = 'apps/mobile/.maestro/standalone-offline.yaml';
const snapshots = new WeakMap();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bad = (message) => new Error(message);

function binary(value, label) {
  const text = value.trim();
  if (!/^[01]$/u.test(text)) throw bad(label + '의 원래 상태를 정확히 확인하지 못했습니다.');
  return text === '1';
}

// 과거 요청 로그의 INTERNET 문구는 현재 연결이 아닙니다. 현재 NetworkAgent의 기능만 읽습니다.
export function parseConnectivity(text) {
  const defaults = [...text.matchAll(/^\s*Active default network:\s*(none|\d+)\s*$/gmu)];
  const start = text.indexOf('Current Networks:');
  const end = text.indexOf('Status for known UIDs:', start);
  if (defaults.length !== 1 || start < 0 || end <= start) throw bad('현재 네트워크 진단 형식을 확인하지 못했습니다.');
  const section = text.slice(start + 'Current Networks:'.length, end);
  const agents = section.split(/\r?\n/u).filter((line) => line.includes('NetworkAgentInfo'));
  let internetNetworkCount = 0;
  for (const line of agents) {
    if (!/^\s*NetworkAgentInfo\{/u.test(line)) throw bad('현재 네트워크 항목을 정확히 읽지 못했습니다.');
    const caps = line.match(/\bCapabilities:\s+([A-Z][A-Z0-9_]*(?:&[A-Z][A-Z0-9_]*)*)(?=\s|\])/u)?.[1];
    if (!caps) throw bad('현재 네트워크의 인터넷 기능을 확인하지 못했습니다.');
    if (caps.split('&').includes('INTERNET')) internetNetworkCount += 1;
  }
  return { activeDefaultNetwork: defaults[0][1] !== 'none', internetNetworkCount };
}

function reverseCount(text) {
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (!/^\S+\s+(?:tcp:\d+|localabstract:\S+|localreserved:\S+|localfilesystem:\S+)\s+\S+$/u.test(line)) {
      throw bad('USB 역방향 연결 목록을 정확히 확인하지 못했습니다.');
    }
  }
  return lines.length;
}

export async function inspectOfflineNetwork({ adb, label = 'standalone-network', cleanup = false }) {
  const read = async (name, args) => (await adb(label + '-' + name, args, { cleanup })).stdout.trim();
  const wifi = await read('wifi', ['shell', 'settings', 'get', 'global', 'wifi_on']);
  const mobile = await read('data', ['shell', 'settings', 'get', 'global', 'mobile_data']);
  const airplane = await read('airplane', ['shell', 'settings', 'get', 'global', 'airplane_mode_on']);
  const sub = await read('subscription', ['shell', 'settings', 'get', 'global', 'multi_sim_data_call']);
  if (!/^\d{1,9}$/u.test(sub)) throw bad('기본 데이터 회선을 확인하지 못했습니다.');
  const perSubscription = await read('subscription-data', ['shell', 'settings', 'get', 'global', 'mobile_data' + sub]);
  if (!/^(?:null|0|1)$/u.test(perSubscription)) throw bad('회선별 데이터 설정을 확인하지 못했습니다.');
  const sim = await read('sim-state', ['shell', 'getprop', 'gsm.sim.state']);
  const slots = sim.split(',');
  if (slots.filter((slot) => ['LOADED', 'READY'].includes(slot)).length !== 1
    || slots.some((slot) => !['LOADED', 'READY', 'ABSENT', 'NOT_READY', 'UNKNOWN'].includes(slot))) {
    throw bad('이 자동 검사는 데이터 회선 하나의 상태를 명확히 복구할 수 있을 때만 실행합니다.');
  }
  const connectivity = parseConnectivity(await read('connectivity', ['shell', 'dumpsys', 'connectivity']));
  const result = Object.freeze({
    wifiEnabled: binary(wifi, 'Wi-Fi'), mobileDataEnabled: binary(mobile, '모바일 데이터'),
    airplaneModeEnabled: binary(airplane, '비행기 모드'), defaultSubscription: Number(sub),
    ...connectivity,
    reverseMappingCount: reverseCount(await read('reverse', ['reverse', '--list'])),
  });
  snapshots.set(result, { wifi, mobile, airplane, sub, perSubscription, sim });
  return result;
}

export function requireOffline(state) {
  if (state.wifiEnabled || state.mobileDataEnabled || state.activeDefaultNetwork
    || state.internetNetworkCount !== 0 || state.reverseMappingCount !== 0) {
    throw bad('실제 오프라인 상태 또는 USB 전달 연결 없음을 확인하지 못했습니다.');
  }
}

function sameSubscription(state, baseline) {
  const original = snapshots.get(baseline);
  const current = snapshots.get(state);
  if (!original || !current || current.sub !== original.sub || current.sim !== original.sim
    || current.airplane !== original.airplane) throw bad('검사 중 회선 또는 비행기 모드 상태가 바뀌었습니다.');
}

function apkHash(file) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 500 * 1024 * 1024) throw bad('검사할 APK 파일이 올바르지 않습니다.');
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function validateApkState(state) {
  if (!state || typeof state.applicationId !== 'string'
    || typeof state.buildNonce !== 'string' || !/^standalone-[a-f0-9]{16}$/u.test(state.buildNonce)
    || state.applicationId !== 'com.ungjo.storeprice.offline.b' + state.buildNonce.slice('standalone-'.length)
    || !/^[a-f0-9]{64}$/u.test(state.sha256) || typeof state.apkPath !== 'string'
    || apkHash(state.apkPath) !== state.sha256) throw bad('검증된 APK 정보와 현재 파일이 일치하지 않습니다.');
}

function checkedOutput(result, message) {
  // Android 셸 명령은 접근 오류를 stderr에 쓰고 종료 코드 0을 주기도 하므로 빈 stdout만 신뢰하지 않습니다.
  if (!result || typeof result.stdout !== 'string' || String(result.stderr ?? '').trim()
    || (result.code !== undefined && result.code !== 0)
    || (result.exitCode !== undefined && result.exitCode !== 0)) throw bad(message);
  return result.stdout.trim();
}

async function requireFreshInstall({ adb, apkState }) {
  const current = checkedOutput(await adb('standalone-current-user', ['shell', 'am', 'get-current-user']), '현재 휴대전화 사용자를 확인하지 못했습니다.');
  if (!/^\d{1,6}$/u.test(current)) throw bad('현재 휴대전화 사용자를 확인하지 못했습니다.');
  // 현재 프로필만 확인합니다. 보안 폴더 등 다른 프로필을 열거나 접근 제한을 우회하지 않습니다.
  const result = checkedOutput(await adb('standalone-package-absence-current',
    ['shell', 'pm', 'list', 'packages', '-u', '--user', current, apkState.applicationId]), '현재 프로필의 앱 설치 여부를 정확히 확인하지 못했습니다.');
  if (result.split(/\r?\n/u).includes('package:' + apkState.applicationId)) throw bad('현재 프로필에 검사용 패키지가 이미 있습니다. 기존 앱 데이터를 보존하고 중단합니다.');
  if (result && !result.split(/\r?\n/u).every((line) => /^package:[A-Za-z0-9_.]+$/u.test(line))) throw bad('현재 프로필의 앱 설치 여부를 정확히 확인하지 못했습니다.');
  return current;
}

async function installFresh({ adb, apkState, currentUser, onHashVerified }) {
  validateApkState(apkState);
  // -R은 기기 전체에 같은 패키지가 있더라도 교체를 금지하고, --user는 설치 대상을 현재 프로필로 제한합니다.
  const install = checkedOutput(await adb('standalone-install', ['install', '-R', '--user', currentUser, apkState.apkPath], { timeout: 180_000 }), '새 APK 설치 성공을 확인하지 못했습니다.');
  if (!/^Success\s*$/mu.test(install)) throw bad('새 APK 설치 성공을 확인하지 못했습니다.');
  await requireNotLaunched({ adb, apkState, currentUser, onHashVerified, label: 'standalone-installed' });
}

async function requireNotLaunched({ adb, apkState, currentUser, onHashVerified = () => {}, label }) {
  const installed = checkedOutput(await adb(label + '-path', ['shell', 'pm', 'path', '--user', currentUser, apkState.applicationId]), '현재 프로필에 설치된 APK 위치를 확인하지 못했습니다.');
  if (!/^package:\/data\/app\/[A-Za-z0-9_+\/=.~\-]+\/base\.apk$/u.test(installed)) throw bad('설치된 APK 위치를 확인하지 못했습니다.');
  const installedPath = installed.slice('package:'.length);
  const hash = checkedOutput(await adb(label + '-hash', ['shell', 'sha256sum', installedPath]), '설치된 APK 해시를 확인하지 못했습니다.');
  if (!hash.startsWith(apkState.sha256 + ' ')) throw bad('휴대전화에 설치된 APK와 검사 파일이 다릅니다.');
  onHashVerified();
  const metadata = checkedOutput(await adb(label + '-state', ['shell', 'dumpsys', 'package', apkState.applicationId]), '설치된 앱의 첫 실행 상태를 확인하지 못했습니다.');
  const userLine = metadata.split(/\r?\n/u).find((line) => new RegExp('^\\s*User ' + currentUser + ':').test(line));
  if (!userLine || !/\binstalled=true\b/u.test(userLine) || !/\bnotLaunched=true\b/u.test(userLine)) {
    throw bad('새로 설치한 앱이 아직 실행되지 않은 상태임을 확인하지 못했습니다.');
  }
  validateApkState(apkState);
}

async function removeOwnInstall({ adb, apkState, currentUser }) {
  // 이번 실행에서 새로 설치했고 해시까지 확인한 전용 패키지만 실패·진단 정리 때 제거합니다.
  const installed = checkedOutput(await adb('standalone-owned-package-path', ['shell', 'pm', 'path', '--user', currentUser, apkState.applicationId], { cleanup: true }), '현재 프로필의 검사 앱 위치를 확인하지 못했습니다.');
  if (!/^package:\/data\/app\/[A-Za-z0-9_+\/=.~\-]+\/base\.apk$/u.test(installed)) throw bad('이번 검사 앱의 위치를 확인하지 못했습니다.');
  const digest = checkedOutput(await adb('standalone-owned-package-hash', ['shell', 'sha256sum', installed.slice(8)], { cleanup: true }), '정리할 검사 앱의 해시를 확인하지 못했습니다.');
  if (!digest.startsWith(apkState.sha256 + ' ')) throw bad('설치된 검사 앱이 바뀌어 제거하지 않습니다.');
  const result = checkedOutput(await adb('standalone-owned-package-remove', ['shell', 'pm', 'uninstall', '--user', currentUser, apkState.applicationId], { cleanup: true }), '현재 프로필의 검사 앱 정리를 확인하지 못했습니다.');
  if (!/^Success\s*$/mu.test(result)) throw bad('새로 설치했던 검사 앱의 제거를 확인하지 못했습니다.');
  const remaining = checkedOutput(await adb('standalone-owned-package-removed', ['shell', 'pm', 'list', 'packages', '-u', '--user', currentUser, apkState.applicationId], { cleanup: true }), '현재 프로필의 검사 앱 제거 여부를 확인하지 못했습니다.');
  if (remaining && !remaining.split(/\r?\n/u).every((line) => /^package:[A-Za-z0-9_.]+$/u.test(line))) throw bad('현재 프로필의 앱 목록 응답이 올바르지 않습니다.');
  if (remaining.split(/\r?\n/u).includes('package:' + apkState.applicationId)) throw bad('이번 검사 앱이 아직 남아 있습니다.');
}

async function restoreNetwork({ adb, before, changed, evidence }) {
  const raw = snapshots.get(before);
  let failure = false;
  for (const kind of ['wifi', 'mobileData']) {
    if (!changed[kind]) continue;
    const key = kind === 'wifi' ? 'wifi_on' : 'mobile_data';
    try {
      const airplane = (await adb('standalone-restore-' + kind + '-airplane', ['shell', 'settings', 'get', 'global', 'airplane_mode_on'], { cleanup: true })).stdout.trim();
      if (airplane !== raw.airplane) { evidence.restoration[kind] = 'preserved-change'; failure = true; continue; }
      if (kind === 'mobileData') {
        const sub = (await adb('standalone-restore-subscription', ['shell', 'settings', 'get', 'global', 'multi_sim_data_call'], { cleanup: true })).stdout.trim();
        if (sub !== raw.sub) throw bad('데이터 회선이 바뀌어 원래 회선을 복구하지 못했습니다.');
      }
      const current = (await adb('standalone-restore-' + kind + '-before', ['shell', 'settings', 'get', 'global', key], { cleanup: true })).stdout.trim();
      const original = kind === 'wifi' ? raw.wifi : raw.mobile;
      if (current === original) { evidence.restoration[kind] = 'restored'; continue; }
      if (current !== '0') { evidence.restoration[kind] = 'preserved-change'; failure = true; continue; }
      // 이번 검사가 끈 연결만 원래대로 켭니다. 회선 변경이나 다른 상태는 덮어쓰지 않습니다.
      await adb('standalone-restore-' + kind, ['shell', 'svc', kind === 'wifi' ? 'wifi' : 'data', 'enable'], { cleanup: true });
      const deadline = Date.now() + 15_000;
      let restored;
      do {
        restored = (await adb('standalone-restore-' + kind + '-check', ['shell', 'settings', 'get', 'global', key], { cleanup: true })).stdout.trim();
        if (restored === original) break;
        await pause(250);
      } while (Date.now() < deadline);
      if (restored !== original) throw bad('원래 연결 설정으로 복구하지 못했습니다.');
      evidence.restoration[kind] = 'restored';
    } catch { evidence.restoration[kind] = 'failed'; failure = true; }
  }
  try {
    const after = await inspectOfflineNetwork({ adb, label: 'standalone-restored', cleanup: true });
    const restored = snapshots.get(after);
    sameSubscription(after, before);
    if (restored.wifi !== raw.wifi || restored.mobile !== raw.mobile || restored.perSubscription !== raw.perSubscription) failure = true;
    evidence.restoration.verified = !failure;
  } catch { failure = true; evidence.restoration.verified = false; }
  if (failure) throw bad('휴대전화 연결 설정의 원상 복구를 확인하지 못해 커밋하지 않습니다.');
}

export async function runStandaloneOffline({ adb, run, tools, runDir, apkState, validateJunit, verifyInstalled, discardSuccessfulInstall = false }) {
  validateApkState(apkState);
  if (typeof validateJunit !== 'function') throw bad('실제 JUnit 통과 여부를 확인할 검증 함수가 필요합니다.');
  if (verifyInstalled !== undefined && typeof verifyInstalled !== 'function') throw bad('설치한 앱의 후속 검사는 함수로 지정해 주세요.');
  if (typeof discardSuccessfulInstall !== 'boolean') throw bad('진단용 검사 앱 정리 옵션이 올바르지 않습니다.');
  if (!/^[A-Za-z0-9._:-]+$/u.test(tools.selectedSerial || '')) throw bad('검사할 USB 기기가 지정되지 않았습니다.');
  const evidence = {
    applicationId: apkState.applicationId, buildNonce: apkState.buildNonce, apkSha256: apkState.sha256,
    installedFresh: false, installationScope: 'current-android-user', firstLaunchOffline: false, installationCleanup: 'not-needed',
    verifyInstalledStatus: verifyInstalled === undefined ? 'not-requested' : 'not-run',
    junitPath: path.join(runDir, 'standalone-result.xml'),
    network: { before: null, firstOffline: null, lastOffline: null, offlineChecks: 0,
      restoration: { wifi: 'not-needed', mobileData: 'not-needed', verified: false } },
  };
  const changed = { wifi: false, mobileData: false };
  let before;
  let currentUser;
  let primaryError;
  const check = async (label) => {
    const state = await inspectOfflineNetwork({ adb, label });
    sameSubscription(state, before);
    requireOffline(state);
    evidence.network.firstOffline ||= state;
    evidence.network.lastOffline = state;
    evidence.network.offlineChecks += 1;
  };
  try {
    currentUser = await requireFreshInstall({ adb, apkState });
    before = await inspectOfflineNetwork({ adb, label: 'standalone-before' });
    evidence.network.before = before;
    if (before.reverseMappingCount !== 0) throw bad('기존 USB 역방향 연결을 보존하고 검사를 중단합니다.');
    await installFresh({ adb, apkState, currentUser, onHashVerified: () => { evidence.installedFresh = true; } });
    const beforeChange = await inspectOfflineNetwork({ adb, label: 'standalone-before-change' });
    sameSubscription(beforeChange, before);
    const original = snapshots.get(before);
    const fresh = snapshots.get(beforeChange);
    if (beforeChange.reverseMappingCount !== 0) throw bad('설치 중 생긴 USB 역방향 연결을 보존하고 중단합니다.');
    if (fresh.wifi !== original.wifi || fresh.mobile !== original.mobile || fresh.perSubscription !== original.perSubscription) {
      throw bad('설치 중 연결 설정이 바뀌어 그대로 보존하고 중단합니다.');
    }
    // 상태 변경을 요청하기 전에 복구 필요성을 먼저 기록해 중간 실패에도 복구합니다.
    if (before.mobileDataEnabled) {
      changed.mobileData = true;
      await adb('standalone-data-disable', ['shell', 'svc', 'data', 'disable']);
    }
    if (before.wifiEnabled) {
      changed.wifi = true;
      await adb('standalone-wifi-disable', ['shell', 'svc', 'wifi', 'disable']);
    }
    const deadline = Date.now() + 30_000;
    while (true) {
      try { await check('standalone-offline-ready'); break; }
      catch (error) { if (Date.now() >= deadline) throw error; await pause(500); }
    }
    validateApkState(apkState);
    // 설치 뒤 연결을 끄는 동안 먼저 실행된 앱은 오프라인 첫 실행으로 인정하지 않습니다.
    await requireNotLaunched({ adb, apkState, currentUser, label: 'standalone-offline-not-launched' });
    const abort = new AbortController();
    let monitoring = true;
    let monitorError;
    const monitor = (async () => {
      while (monitoring) {
        await pause(2_000);
        if (!monitoring) break;
        try { await check('standalone-offline-monitor'); }
        catch (error) { monitorError = error; abort.abort(); break; }
      }
    })();
    let nativeError;
    try {
      const output = path.join(runDir, 'maestro-standalone');
      await run('maestro-standalone-offline', tools.maestro, [
        '--device', tools.selectedSerial, 'test', '-e', 'APP_ID=' + apkState.applicationId,
        '-e', 'RUN_ID=' + apkState.buildNonce, '--format', 'junit', '--output', evidence.junitPath,
        '--test-output-dir', output, '--debug-output', output, flow,
      // 12개 상품의 분류·교차 분류 계산까지 검사합니다. 통신 감시는 이 시간 내내 계속됩니다.
      ], { cwd: repoRoot, timeout: 600_000, signal: abort.signal });
      // 종료 코드만 성공인 경우에도 JUnit이 실패하면 같은 복구·검사 앱 정리 경로로 들어갑니다.
      await validateJunit(evidence.junitPath);
      evidence.firstLaunchOffline = true;
    } catch (error) {
      nativeError = error;
    } finally {
      monitoring = false;
      await monitor;
    }
    // 연결 감시가 실행을 취소했다면 일반적인 취소 문구 대신 실제 중단 원인을 남깁니다.
    if (monitorError) throw monitorError;
    if (nativeError) throw nativeError;
    await check('standalone-offline-finished');
    validateApkState(apkState);
  } catch (error) { primaryError = error; }
  finally {
    if (before) {
      try { await restoreNetwork({ adb, before, changed, evidence: evidence.network }); }
      catch (error) { primaryError = error; }
    }
  }
  // 오프라인 첫 실행과 연결 복구가 모두 성공한 뒤에만 설치한 앱의 후속 검사를 이어갑니다.
  // 후속 검사도 같은 APK를 대상으로 해야 하며, 실패하면 기존의 신규 앱 정리 경로를 사용합니다.
  if (!primaryError && verifyInstalled !== undefined) {
    try {
      validateApkState(apkState);
      await verifyInstalled();
      validateApkState(apkState);
      evidence.verifyInstalledStatus = 'passed';
    } catch (error) {
      evidence.verifyInstalledStatus = 'failed';
      // Promise.reject()처럼 오류 값이 없어도 실패를 성공으로 취급하거나 앱 정리를 건너뛰지 않습니다.
      primaryError = error instanceof Error ? error : bad('설치한 앱의 후속 검사에 실패했습니다.');
    }
  }
  if ((primaryError || discardSuccessfulInstall) && evidence.installedFresh) {
    try {
      await removeOwnInstall({ adb, apkState, currentUser });
      evidence.installationCleanup = primaryError ? 'removed-own-failed-install' : 'removed-own-probe-install';
    } catch {
      evidence.installationCleanup = 'failed-preserved';
      primaryError = bad('새로 설치한 검사 앱의 안전한 정리를 확인하지 못해 검사를 완료하지 않습니다.');
    }
  }
  if (primaryError) {
    const failure = bad(primaryError instanceof Error ? primaryError.message : '독립 APK 검사가 실패했습니다.');
    failure.standalone = evidence;
    throw failure;
  }
  return evidence;
}
