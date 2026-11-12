import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertGitStateUnchanged, captureGitState, commitVerifiedChange } from './git-guard.mjs';
import {
  assertCatalogEnvironmentUnchanged, captureCatalogEnvironment, checkCatalogHttp,
  createCatalogLogWriter, pinnedCatalogEnvironment, redactCatalogText, catalogProjectRef,
} from './catalog-http-check.mjs';
import { PREVIEW_PORT, capturePrivatePreview, assertPrivatePreviewUnchanged,
  startPrivatePreviewServer, checkPrivatePreviewHttp, previewEnvironment,
  scanReleaseForPrivateData, writePreviewExpectations } from './private-price-preview.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mobileRoot = path.join(repoRoot, 'apps/mobile');
const reportPath = 'docs/book/verification/latest-android.md';
const port = 8091;
const timeout = { tool: 30_000, check: 300_000, export: 600_000, server: 180_000, flow: 1_200_000 };
const args = process.argv.slice(2);
let noCommit = false;
let receiptOnly = false;
let doctor = false;
let previewPath;
let message = 'test: 갤럭시 자동 검증 결과와 확인한 변경 기록';

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--no-commit') noCommit = true;
  else if (args[index] === '--receipt-only') { receiptOnly = true; noCommit = true; }
  else if (args[index] === '--doctor') doctor = true;
  else if (args[index] === '--private-price-preview' && args[index + 1]) previewPath = args[++index];
  else if (args[index] === '--message' && args[index + 1]) message = args[++index];
  else throw new Error('지원 옵션: --no-commit, --receipt-only, --doctor, --private-price-preview <원본 경로>, --message "커밋 메시지"');
}
if (!message.trim() || /[\r\n\0]/u.test(message)) throw new Error('커밋 메시지는 한 줄로 입력해 주세요.');
if (previewPath && receiptOnly && !doctor) throw new Error('실제 가격 미리보기는 전체 검사와 함께 실행해 주세요.');

const runId = new Date().toISOString().replace(/[-:.]/gu, '') + '-' + randomBytes(4).toString('hex');
const artifactRoot = path.join(repoRoot, '.artifacts/device');
const runDir = path.join(artifactRoot, runId);
const lockPath = path.join(artifactRoot, 'lock');
const activeChildren = new Set();
const checks = [];
let lockFd;
let gitState;
let catalogEnvironment;
let catalogBefore;
let catalogAfter;
let selectedSerial;
let device;
let tools;
let expoServer;
let createdReverse = false;
let createdPreviewReverse = false;
let previewState;
let previewSession;
let previewBefore;
let previewAfter;
let releaseScan;
let checkPreviewExpectations;
let interrupted = false;
let publicReportWritten = false;
let verificationStarted = false;
let junit;
let commit = null;
let overallStatus = 'blocked';
const screenAwake = {
  originalValue: undefined,
  applyStatus: 'not-requested',
  changeRequested: false,
  wakeRequested: false,
  restoreStatus: 'not-needed',
};
const startedAt = new Date();

function safeError(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return redactCatalogText(catalogEnvironment, raw).replaceAll(previewSession?.token || '\0', '<preview-session-token>').replaceAll(selectedSerial || '\0', '<selected-device>').replace(/\x1b\[[0-9;]*m/gu, '').slice(0, 800);
}

function say(text) {
  console.log('[기기 검사] ' + text);
}

function killOwnChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  // 직접 시작한 PID의 하위 프로세스만 종료합니다. 사용자가 켠 Expo 서버는 찾거나 종료하지 않습니다.
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 15_000 });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}

function invocation(file, commandArgs) {
  if (process.platform !== 'win32' || !/\.(?:bat|cmd)$/iu.test(file)) return { file, args: commandArgs };
  // 배치 실행에 필요한 cmd만 사용합니다. 셸 제어문자가 들어온 경로·인자는 실행하지 않습니다.
  const quote = (value) => {
    if (/[\u0000-\u001f"%!&|<>^]/u.test(value)) throw new Error('도구 경로 또는 인자에 지원하지 않는 셸 문자가 있습니다.');
    return '"' + value + '"';
  };
  return {
    file: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/c', '"' + [file, ...commandArgs].map(quote).join(' ') + '"'],
    windowsVerbatimArguments: true,
  };
}

function startLogged(label, file, commandArgs, options = {}) {
  const spec = invocation(file, commandArgs);
  const log = fs.createWriteStream(path.join(runDir, label + '.log'), { flags: 'a' });
  const writeLog = (text) => log.write(text.replaceAll(previewSession?.token || '\0', '<preview-session-token>'));
  const outLog = createCatalogLogWriter(catalogEnvironment, writeLog);
  const errLog = createCatalogLogWriter(catalogEnvironment, writeLog);
  const child = spawn(spec.file, spec.args, {
    cwd: options.cwd || repoRoot,
    env: options.env || tools?.env || process.env,
    windowsHide: true,
    windowsVerbatimArguments: spec.windowsVerbatimArguments,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeChildren.add(child);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    outLog.write(chunk);
    if (stdout.length < 4_000_000) stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk) => {
    errLog.write(chunk);
    if (stderr.length < 4_000_000) stderr += chunk.toString('utf8');
  });
  const done = new Promise((resolve) => {
    let spawnError;
    child.on('error', (error) => { spawnError = error; log.write(safeError(error)); });
    child.on('close', (code, signal) => {
      activeChildren.delete(child);
      outLog.end();
      errLog.end();
      log.end();
      resolve({ code, signal, stdout, stderr, spawnError });
    });
  });
  return { child, done };
}

async function run(label, file, commandArgs, options = {}) {
  if (interrupted && !options.cleanup) throw new Error('사용자가 검사를 중단했습니다.');
  const started = Date.now();
  const task = startLogged(label, file, commandArgs, options);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; killOwnChild(task.child); }, options.timeout || timeout.tool);
  const result = await task.done;
  clearTimeout(timer);
  checks.push({ label, exitCode: result.code, milliseconds: Date.now() - started });
  if (timedOut) throw new Error(label + ' 단계가 제한 시간을 넘었습니다. 원본 로그를 확인해 주세요.');
  if (result.spawnError || result.code !== 0) throw new Error(label + ' 단계가 실패했습니다. 원본 로그를 확인해 주세요.');
  if (interrupted && !options.cleanup) throw new Error('사용자가 검사를 중단했습니다.');
  return result;
}

function requireFile(file, label) {
  if (!file || !fs.existsSync(file)) throw new Error(label + '가 없습니다. 설치 안내 또는 도구 경로 설정을 확인해 주세요.');
  return file;
}

function resolveTools() {
  if (process.platform !== 'win32') throw new Error('이 검사 도구는 현재 Windows와 USB Android 실기기를 대상으로 합니다.');
  const root = path.join(process.env.LOCALAPPDATA || '', 'store-price-tools');
  const adb = requireFile(process.env.STORE_PRICE_ADB || path.join(root, 'platform-tools/adb.exe'), 'Android Platform Tools');
  const maestro = requireFile(process.env.STORE_PRICE_MAESTRO || path.join(root, 'maestro/bin/maestro.bat'), 'Maestro 2.12.1');
  const javaHome = process.env.JAVA_HOME || 'C:\\Program Files\\Java\\jdk-21.0.11';
  const java = requireFile(path.join(javaHome, 'bin/java.exe'), 'JDK 21');
  const npm = requireFile(process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'npm CLI');
  const expo = requireFile(path.join(mobileRoot, 'node_modules/expo/bin/cli'), '설치된 Expo CLI');
  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: [path.dirname(java), path.dirname(adb), path.dirname(maestro), process.env.PATH || ''].join(path.delimiter),
    CI: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_PUBLIC_DEVICE_RUN_ID: '',
    MAESTRO_CLI_NO_ANALYTICS: '1',
    MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
  };
  return { adb, maestro, java, npm, expo, env: catalogEnvironment ? pinnedCatalogEnvironment(catalogEnvironment, env) : env };
}

async function verifyCatalogHttp(label, previous) {
  const started = Date.now();
  try {
    assertCatalogEnvironmentUnchanged(catalogEnvironment);
    const result = await checkCatalogHttp(catalogEnvironment, { previous });
    assertCatalogEnvironmentUnchanged(catalogEnvironment);
    checks.push({ label, exitCode: 0, milliseconds: Date.now() - started });
    return result;
  } catch (error) {
    checks.push({ label, exitCode: 1, milliseconds: Date.now() - started });
    throw error;
  }
}

function assertPreviewUnchanged() {
  if (previewState) assertPrivatePreviewUnchanged(previewState);
  checkPreviewExpectations?.();
}

async function verifyPreviewHttp(label) {
  const started = Date.now();
  try {
    assertPreviewUnchanged();
    const result = await checkPrivatePreviewHttp(previewSession);
    checks.push({ label, exitCode: 0, milliseconds: Date.now() - started });
    return result;
  } catch (error) {
    checks.push({ label, exitCode: 1, milliseconds: Date.now() - started });
    throw error;
  }
}

async function ensurePortUnused() {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error('검사용 8091 포트가 사용 중입니다. 기존 서버를 건드리지 않고 중단합니다.')));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(resolve));
  });
}

async function adb(label, commandArgs, options) {
  return run(label, tools.adb, ['-s', selectedSerial, ...commandArgs], options);
}

async function preflight() {
  tools = resolveTools();
  const java = await run('java-version', tools.java, ['-version']);
  if (!/version "21\./u.test(java.stderr + java.stdout)) throw new Error('이 프로젝트 자동 검사는 JDK 21을 사용합니다. JAVA_HOME을 확인해 주세요.');
  await run('adb-version', tools.adb, ['version']);
  const maestro = await run('maestro-version', tools.maestro, ['--version'], { timeout: 60_000 });
  if (!/\b2\.12\.1\b/u.test(maestro.stdout + maestro.stderr)) throw new Error('검증한 Maestro 버전은 2.12.1입니다. 도구 설치를 확인해 주세요.');

  const devices = (await run('adb-devices', tools.adb, ['devices', '-l'])).stdout
    .split(/\r?\n/u).map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts.length >= 2 && !['List', '*', 'adb'].includes(parts[0]));
  const requested = process.env.ANDROID_SERIAL;
  let chosen;
  if (requested) chosen = devices.find((parts) => parts[0] === requested);
  else {
    if (devices.some((parts) => parts[1] === 'unauthorized')) throw new Error('휴대전화에서 USB 디버깅 허용을 승인한 뒤 다시 실행해 주세요.');
    if (devices.length !== 1) throw new Error('승인된 Android 실기기 한 대를 USB로 연결해 주세요. 여러 대라면 ANDROID_SERIAL로 검사 대상을 지정하세요.');
    chosen = devices[0];
  }
  if (!chosen || chosen[1] !== 'device') throw new Error('선택한 휴대전화가 연결·승인되지 않았습니다. USB 연결과 디버깅 허용을 확인해 주세요.');
  selectedSerial = chosen[0];
  if (!/^[A-Za-z0-9._:-]+$/u.test(selectedSerial) || selectedSerial.startsWith('emulator-')) throw new Error('에뮬레이터가 아닌 Android 실기기가 필요합니다.');
  const qemu = (await adb('device-qemu', ['shell', 'getprop', 'ro.kernel.qemu'])).stdout.trim();
  const bootQemu = (await adb('device-boot-qemu', ['shell', 'getprop', 'ro.boot.qemu'])).stdout.trim();
  const hardware = (await adb('device-hardware', ['shell', 'getprop', 'ro.hardware'])).stdout.trim();
  if (qemu === '1' || bootQemu === '1' || /goldfish|ranchu/iu.test(hardware)) throw new Error('에뮬레이터가 감지되었습니다. 실제 휴대전화로 검사해 주세요.');
  const model = (await adb('device-model', ['shell', 'getprop', 'ro.product.model'])).stdout.trim();
  const android = (await adb('device-android', ['shell', 'getprop', 'ro.build.version.release'])).stdout.trim();
  const cleanDeviceValue = (value) => value.replace(/[^A-Za-z0-9 ._-]/gu, '').slice(0, 64) || '확인 불가';
  device = { model: cleanDeviceValue(model), android: cleanDeviceValue(android) };
  const expo = await adb('expo-go-installed', ['shell', 'pm', 'path', 'host.exp.exponent']);
  if (!/^package:/mu.test(expo.stdout)) throw new Error('휴대전화에 Expo Go를 먼저 설치해 주세요.');
  requireFile(path.join(repoRoot, 'apps/mobile/.maestro/payment.yaml'), 'Maestro 검사 흐름');
  await ensurePortUnused();
}

async function waitForServer() {
  const deadline = Date.now() + timeout.server;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error('사용자가 검사를 중단했습니다.');
    if (expoServer.child.exitCode !== null || expoServer.child.signalCode !== null) throw new Error('검사용 Expo 서버가 시작 중 종료되었습니다.');
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/status', { signal: AbortSignal.timeout(2_000) });
      if (response.ok && (await response.text()).includes('packager-status:running')) return;
    } catch { /* 서버가 아직 준비되지 않았으면 제한 시간 안에서만 다시 확인합니다. */ }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error('검사용 Expo 서버의 준비 제한 시간을 넘었습니다.');
}

function reverseTarget(output, targetPort = port) {
  return output.split(/\r?\n/u).map((line) => line.trim().split(/\s+/u))
    .find((parts) => parts.at(-2) === 'tcp:' + targetPort)?.at(-1);
}

async function prepareReverse(targetPort = port) {
  const label = targetPort === port ? 'reverse' : 'preview-reverse';
  const existing = reverseTarget((await adb(label + '-before', ['reverse', '--list'])).stdout, targetPort);
  if (existing && existing !== 'tcp:' + targetPort) throw new Error('휴대전화의 검사 포트에 다른 연결이 있습니다. 기존 연결을 건드리지 않고 중단합니다.');
  if (!existing) {
    await adb(label + '-create', ['reverse', '--no-rebind', 'tcp:' + targetPort, 'tcp:' + targetPort]);
    return true;
  }
  return false;
}

async function prepareScreenAwake() {
  const original = (await adb('screen-awake-before', [
    'shell', 'settings', 'get', 'global', 'stay_on_while_plugged_in',
  ])).stdout.trim();
  // 복구할 원래 값을 먼저 확인합니다. 예상하지 못한 응답이면 기기 설정을 바꾸지 않습니다.
  if (original !== 'null' && !/^\d+$/u.test(original)) {
    throw new Error('충전 중 화면 유지 설정의 원래 값을 확인하지 못했습니다.');
  }
  screenAwake.originalValue = original;
  if (original === '7') {
    screenAwake.applyStatus = 'already-enabled';
    return;
  }

  // 쓰기 응답이 끊겨도 기기에는 적용됐을 수 있어, 명령 전에 복구 필요 여부를 기록합니다.
  screenAwake.changeRequested = true;
  screenAwake.applyStatus = 'requested';
  screenAwake.restoreStatus = 'pending';
  await adb('screen-awake-enable', [
    'shell', 'settings', 'put', 'global', 'stay_on_while_plugged_in', '7',
  ]);
  const applied = (await adb('screen-awake-enabled-check', [
    'shell', 'settings', 'get', 'global', 'stay_on_while_plugged_in',
  ])).stdout.trim();
  if (applied !== '7') throw new Error('검사 중 화면 유지 설정이 적용되지 않았습니다.');
  screenAwake.applyStatus = 'applied';
}

async function wakeScreenForUi() {
  // 화면만 켭니다. 잠금·PIN을 해제하지 않으므로 사용자가 잠금을 풀어 둬야 합니다.
  await adb('screen-wake', ['shell', 'input', 'keyevent', '224']);
  screenAwake.wakeRequested = true;
}

async function restoreScreenAwake() {
  if (!screenAwake.changeRequested) return;
  try {
    const current = (await adb('screen-awake-cleanup-check', [
      'shell', 'settings', 'get', 'global', 'stay_on_while_plugged_in',
    ], { cleanup: true })).stdout.trim();
    screenAwake.valueBeforeRestore = current;
    // 검사 도중 사용자가 다른 값으로 바꿨으면 그 선택을 덮어쓰지 않습니다.
    if (current !== '7') {
      screenAwake.restoreStatus = 'preserved-current-value';
      return;
    }
    const restoreArgs = screenAwake.originalValue === 'null'
      ? ['shell', 'settings', 'delete', 'global', 'stay_on_while_plugged_in']
      : ['shell', 'settings', 'put', 'global', 'stay_on_while_plugged_in', screenAwake.originalValue];
    await adb('screen-awake-restore', restoreArgs, { cleanup: true });
    const restored = (await adb('screen-awake-restored-check', [
      'shell', 'settings', 'get', 'global', 'stay_on_while_plugged_in',
    ], { cleanup: true })).stdout.trim();
    screenAwake.valueAfterRestore = restored;
    if (restored !== screenAwake.originalValue) throw new Error('원래 화면 유지 설정으로 복구됐는지 확인하지 못했습니다.');
    screenAwake.restoreStatus = 'restored';
  } catch (error) {
    screenAwake.restoreStatus = 'failed';
    screenAwake.restoreError = safeError(error);
    say('충전 중 화면 유지 설정의 복구를 확인하지 못했습니다. 실행 요약의 screenAwake 기록을 확인해 주세요.');
  }
}

function readJunit(file) {
  const xml = fs.readFileSync(file, 'utf8');
  // 종료 코드만으로 통과를 판단하지 않습니다. 이번 실행의 실제 testcase와 실패·오류 수를 함께 확인합니다.
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml) || !/<testsuites?\b/u.test(xml) || !/<\/testsuites?>/u.test(xml)) throw new Error('JUnit 결과 형식이 올바르지 않습니다.');
  const cases = [...xml.matchAll(/<testcase\b[^>]*>/gu)];
  const suites = [...xml.matchAll(/<testsuites?\b([^>]*)>/gu)];
  if (cases.length === 0 || suites.length === 0 || /<(?:failure|error|skipped)\b/u.test(xml)) throw new Error('JUnit에 통과한 검사만 존재하지 않습니다. 실패·오류·건너뛴 검사를 확인하세요.');
  let declaredTests = 0;
  for (const [, attrs] of suites) {
    const declared = attrs.match(/\btests=["'](\d+)["']/u)?.[1];
    declaredTests += Number(declared || 0);
    for (const key of ['failures', 'errors', 'skipped']) {
      const value = attrs.match(new RegExp('\\b' + key + '=["\']([^"\']+)["\']', 'u'))?.[1];
      if (value !== undefined && (!/^\d+$/u.test(value) || Number(value) !== 0)) throw new Error('JUnit이 실패·오류 또는 건너뛴 검사를 보고했습니다.');
    }
  }
  if (declaredTests < 1) throw new Error('JUnit에서 실행한 검사 수가 확인되지 않습니다.');
  return { testcases: cases.length, failures: 0, errors: 0, skipped: 0 };
}

function writeReport(status, reason = '') {
  const seoul = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date());
  const lines = [
    '# Android 실기기 자동 검증 기록', '',
    '- 실행 시각: ' + seoul + ' (Asia/Seoul)',
    '- 결과: **' + status + '**',
    '- 실행 ID: `' + runId + '`',
    '- 기기: ' + (device?.model || '미확인') + ' / Android ' + (device?.android || '미확인'),
    '- 검사 시작 HEAD: `' + gitState.head + '`',
    '- 검사 소스 SHA-256: `' + gitState.sourceHash + '`',
    '- 검사 설정 SHA-256: `' + catalogEnvironment.fingerprint + '` (설정 값은 기록하지 않음)',
    '- 공개 상품 SHA-256: `' + catalogAfter.fingerprint + '` (실행 전후 일치)',
    ...(previewAfter ? [
      '- 개발용 실제 가격 미리보기: ' + previewAfter.productCount + '개, DB 조회 시각 `' + previewAfter.fetchedAt + '`',
      '- 미리보기 원본 SHA-256: `' + previewAfter.sourceFingerprint + '` (실행 전후 일치)',
      '- 미리보기 응답 SHA-256: `' + previewAfter.fingerprint + '` (이번 실행 세션)',
      '- 배포 산출물 검사: ' + releaseScan.scannedFiles + '개 파일, 실제 상품 식별자·이름·임시 토큰 없음',
    ] : []),
    '- 도구: Maestro 2.12.1 / JDK 21 / USB 실기기 / Expo Go',
    '- 커밋 모드: ' + (noCommit ? '검사·기록만 수행 (--no-commit)' : '검사한 소스가 유지된 경우에만 자동 커밋. 실제 커밋 ID는 실행 요약 또는 git log에서 확인.'),
    ...(reason ? ['', '중단 이유: ' + reason.replace(/[\r\n]/gu, ' ')] : []),
    '', '## 실행한 명령', '', '```bash',
    ...(screenAwake.originalValue !== undefined ? ['adb -s <선택한 실기기> shell settings get global stay_on_while_plugged_in'] : []),
    ...(screenAwake.changeRequested ? [
      'adb -s <선택한 실기기> shell settings put global stay_on_while_plugged_in 7',
      'adb -s <선택한 실기기> shell settings get global stay_on_while_plugged_in',
    ] : []),
    'maestro check-syntax apps/mobile/.maestro/payment.yaml',
    'maestro check-syntax apps/mobile/.maestro/solve-quiz.yaml',
    'maestro check-syntax apps/mobile/.maestro/receipt.yaml',
    'node --test scripts/device/git-guard.test.mjs',
    'node --experimental-strip-types --test scripts/device/catalog-http-check.test.mjs',
    'node --test scripts/device/private-price-preview.test.mjs',
    'npm --prefix scripts/database test',
    'cd apps/mobile', 'npm test', 'npm run typecheck', 'npm run lint', 'npm run export:check',
    'EXPO_PUBLIC_DEVICE_RUN_ID=<실행 ID> node node_modules/expo/bin/cli start --localhost --port 8091 --clear',
    'cd ../..',
    'adb -s <선택한 실기기> reverse --list',
    ...(createdReverse ? ['adb -s <선택한 실기기> reverse --no-rebind tcp:8091 tcp:8091'] : ['# 이미 있던 동일 포트 연결을 변경 없이 재사용']),
    ...(screenAwake.wakeRequested ? ['adb -s <선택한 실기기> shell input keyevent 224'] : []),
    'maestro --device <선택한 실기기> test -e EXPO_URL=exp://127.0.0.1:8091 -e RUN_ID=<실행 ID> --format junit --output <검사폴더>/result.xml --test-output-dir <검사폴더>/maestro --debug-output <검사폴더>/maestro apps/mobile/.maestro/payment.yaml',
    '```', '',
    'Windows에서는 npm CLI와 Maestro 배치 파일을 Node에서 호출했다. 위 명령의 실기기 식별자와 실행 폴더는 개인정보 보호를 위해 치환했다.',
    '', '## 임시 화면 유지 설정', '',
    '- 검사 전 값: ' + (screenAwake.originalValue ?? '확인하지 않음') + '. 적용 상태: ' + screenAwake.applyStatus + '.',
    '- 원래 값이 7이면 설정을 변경하지 않았다. 다른 값이면 충전 중 화면이 꺼지지 않도록 검사 동안만 7을 사용한다.',
    '- 종료 정리에서는 현재 값이 여전히 7일 때만 원래 값을 복구한다. 중간에 바뀐 값은 보존한다.',
    '- 이 보고서는 종료 정리 전에 작성된다. 실제 복구 결과와 실행한 정리 명령의 종료 코드는 원본 summary.json의 screenAwake 및 checks에 기록한다.',
    '', '## 확인한 항목', '',
    '- PGlite의 메모리 PostgreSQL에서 상품·가격 이력 제약, 예시 데이터, 수동 가격 관측의 비공개 조건, 공개 카탈로그와 역할별 읽기·쓰기 권한을 검사했다.',
    '- 실제 가격 입력 검증과 저장 SQL 생성은 자체 작성한 테스트 자료로 검사했다. 원격 비공개 적재 결과는 이번 개발 장의 별도 조회 기록을 따른다.',
    '- 공개 키 REST GET으로 예시 상품 6개와 비공개 스키마·승인 메모 읽기 차단을 실행 전후 확인했다. 쓰기·관리자 API는 호출하지 않았다.',
    '- 앱 검사·번들·Expo 서버에는 같은 설정을 전달하고 EXPO_NO_DOTENV=1로 고정했다. 환경 파일과 선택한 프로세스 설정의 변경도 검사했다.',
    '- 실제 앱의 Supabase 출처·상품 6개 로딩을 최초 실행·다시 장보기·재실행에서 확인했다. 외부 상품의 일시적 변경을 연속 감시하는 검사는 아니다.',
    ...(previewAfter ? [
      '- 별도 localhost·USB 연결로 비공개 실제 가격을 읽기 전용 표시했다. 상품명·규격·가격·출처·확인 시각·재고 상태를 원본 기대값과 비교했다.',
      '- 미리보기를 닫거나 Android 뒤로 가기를 눌러도 기존 장바구니가 유지된다. 실제 가격을 놀이 목록에 공개하거나 관리자 키를 앱에 넣지 않았다.',
      '- 최근 DB 조회와 과거 가격 관측을 구분한다. DB 자료를 다시 읽었다고 상품 가격을 다시 관측한 것으로 기록하지 않는다.',
    ] : []),
    '- 이 실행만의 화면 표시를 확인해 이전 번들로 검사가 통과하는 것을 차단했다.',
    '- 장바구니 담기·합계·수량 감소·9개 상한·품목 삭제·전체 비우기.',
    '- 놀이돈 예산 안·딱 맞음·초과와 예산 안으로 복귀.',
    '- 지불할 돈 단일 선택·부족액·선택 취소·상품 변경 시 선택 초기화.',
    '- 빈 장바구니와 예산 초과의 선택 차단·재실행 시 초기화.',
    '- 받을 거스름돈과 계산식: 5,500원에 10,000원은 4,500원, 정확히 낸 금액은 0원.',
    '- 1,000원에 5,000원을 고르면 거스름돈 4,000원이며 예산 잔액 9,000원은 유지된다.',
    '- 부족한 돈으로 교체·선택 취소·상품 변경·비우기·재실행 시 이전 거스름돈이 사라진다.',
    '- 거스름돈 퀴즈: 빈 답과 0원 구분, 오답 수정·정답 확인·다시 풀기·입력 잠금.',
    '- 정답 전 계산 결과와 예산 잔액을 숨기고, 맞힌 뒤 계산식과 잔액을 공개한다.',
    '- 상품·낼 돈 변경은 퀴즈를 초기화하며 같은 선택과 수량 상한의 무변화는 풀이를 유지한다.',
    '- 정답 전 계산 완료 차단, 영수증 상품별 가격·수량·합계·지불액·거스름돈·잔액을 확인한다.',
    '- 0원 거스름돈도 완료하며, 다시 장보기와 영수증 상태의 재실행으로 새 놀이를 시작한다.',
    '', '## 결과', '',
    ...checks.filter((check) => ['maestro-syntax-main', 'maestro-syntax-quiz', 'maestro-syntax-receipt', 'maestro-syntax-preview', 'git-guard-tests', 'catalog-http-check-tests', 'private-preview-tests', 'private-preview-http-before', 'private-preview-http-after', 'private-preview-release-scan', 'catalog-http-before', 'catalog-http-after', 'database-tests', 'unit-tests', 'typecheck', 'lint', 'export', 'maestro-flow'].includes(check.label))
      .map((check) => '- ' + check.label + ': 종료 코드 ' + check.exitCode),
    '- JUnit: ' + (junit ? `${junit.testcases} testcase, 실패 0, 오류 0, 건너뜀 0` : '통과를 확인하지 못함'),
    '', '원본 로그·스크린샷·JUnit·실행 요약은 `.artifacts/device/' + runId + '/`에만 보관하며 Git에 올리지 않는다. 기기 일련번호와 화면 XML은 이 보고서에 포함하지 않는다.',
    '', '이 기록은 해당 Android 실기기·검사 시점의 결과다. iPhone, 스토어용 APK/AAB/IPA 및 실제 이마트 가격의 앱 공개 표시는 검증하지 않았다. 앱은 공개 예시 상품 6개로 검사한다.', '',
  ];
  fs.mkdirSync(path.dirname(path.join(repoRoot, reportPath)), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, reportPath), lines.join('\n'));
  publicReportWritten = true;
}

async function cleanup() {
  await restoreScreenAwake();
  if (createdPreviewReverse && tools && selectedSerial) {
    try {
      const current = reverseTarget((await adb('preview-reverse-cleanup-check', ['reverse', '--list'], { cleanup: true })).stdout, PREVIEW_PORT);
      if (current === 'tcp:' + PREVIEW_PORT) await adb('preview-reverse-remove', ['reverse', '--remove', 'tcp:' + PREVIEW_PORT], { cleanup: true });
    } catch { say('미리보기 USB 연결 정리는 원본 로그를 확인해 주세요.'); }
  }
  if (previewSession) {
    try { await previewSession.close(); }
    catch { say('미리보기 서버 정리는 원본 로그를 확인해 주세요.'); }
  }
  if (createdReverse && tools && selectedSerial) {
    try {
      const current = reverseTarget((await adb('reverse-cleanup-check', ['reverse', '--list'], { cleanup: true })).stdout);
      // 이번 실행이 만든 연결이 그대로 있을 때만 제거합니다. 원래 있던 연결은 보존합니다.
      if (current === 'tcp:' + port) await adb('reverse-remove', ['reverse', '--remove', 'tcp:' + port], { cleanup: true });
    } catch { say('USB 연결 정리는 완료하지 못했습니다. 원본 로그에 기록했습니다.'); }
  }
  for (const child of activeChildren) killOwnChild(child);
  if (expoServer) await Promise.race([expoServer.done, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (lockFd !== undefined) {
    fs.closeSync(lockFd);
    try {
      if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).runId === runId) fs.unlinkSync(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') say('잠금 정리 상태를 확인해 주세요. 다른 실행의 잠금은 삭제하지 않았습니다.');
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted = true;
  for (const child of activeChildren) killOwnChild(child);
});

try {
  // 기기 로그가 실수로 커밋되지 않도록 ignore 규칙을 먼저 확인한 뒤 파일을 만듭니다.
  const ignored = spawnSync('git', ['check-ignore', '--quiet', '.artifacts/device/probe'], { cwd: repoRoot, windowsHide: true, stdio: 'ignore' });
  if (ignored.status !== 0) throw new Error('먼저 .gitignore에 /.artifacts/를 등록해 주세요.');
  fs.mkdirSync(artifactRoot, { recursive: true });
  try { lockFd = fs.openSync(lockPath, 'wx'); }
  catch { throw new Error('다른 기기 검사가 실행 중이거나 이전 잠금이 남아 있습니다. 실행 중인 검사가 없는지 먼저 확인해 주세요.'); }
  fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, runId, startedAt: startedAt.toISOString() }));
  fs.mkdirSync(runDir);
  say('설치 도구·USB 실기기·Git 상태를 확인합니다.');
  gitState = captureGitState(repoRoot);
  if (!doctor) catalogEnvironment = captureCatalogEnvironment(mobileRoot);
  if (!doctor && previewPath) previewState = capturePrivatePreview(repoRoot, previewPath, catalogProjectRef(catalogEnvironment));
  await preflight();
  if (doctor) {
    overallStatus = 'ready';
    say('준비 확인 완료. 실제 화면 검사와 커밋은 실행하지 않았습니다.');
  } else {
    verificationStarted = true;
    if (previewState) previewSession = await startPrivatePreviewServer(previewState, { sessionId: runId });
    checkPreviewExpectations = writePreviewExpectations(path.join(artifactRoot, 'private-preview-expectations.js'), previewSession);
    // 일반 YAML 구문 검사만으로는 명령 형식 오류를 찾을 수 없어, 기기를 조작하기 전에 Maestro로 확인합니다.
    for (const [label, file] of [['maestro-syntax-main', 'apps/mobile/.maestro/payment.yaml'], ['maestro-syntax-quiz', 'apps/mobile/.maestro/solve-quiz.yaml'], ['maestro-syntax-receipt', 'apps/mobile/.maestro/receipt.yaml'], ['maestro-syntax-preview', 'apps/mobile/.maestro/real-price-preview.yaml']]) {
      await run(label, tools.maestro, ['check-syntax', file], { timeout: 60_000 });
    }
    await prepareScreenAwake();
    say('기기: ' + device.model + ' / Android ' + device.android + '. 코드 검사를 시작합니다.');
    await run('git-guard-tests', process.execPath, ['--test', 'scripts/device/git-guard.test.mjs'], { timeout: timeout.check });
    await run('catalog-http-check-tests', process.execPath, ['--experimental-strip-types', '--test', 'scripts/device/catalog-http-check.test.mjs'], { timeout: timeout.check });
    await run('private-preview-tests', process.execPath, ['--test', 'scripts/device/private-price-preview.test.mjs'], { timeout: timeout.check });
    // 실제 PostgreSQL 엔진에서 DB 권한과 가격 공개 조건을 확인한 뒤 앱·실기기 검사로 넘어갑니다.
    say('database-tests 확인 중');
    await run('database-tests', process.execPath, [tools.npm, '--prefix', 'scripts/database', 'test'], { timeout: timeout.check });
    for (const [label, script] of [['unit-tests', 'test'], ['typecheck', 'typecheck'], ['lint', 'lint'], ['export', 'export:check']]) {
      say(label + ' 확인 중');
      await run(label, process.execPath, [tools.npm, 'run', script], { cwd: mobileRoot, timeout: label === 'export' ? timeout.export : timeout.check });
    }
    assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
    assertPreviewUnchanged();
    if (previewSession) {
      const started = Date.now();
      releaseScan = scanReleaseForPrivateData(path.join(mobileRoot, 'dist'), previewState, previewSession.token);
      checks.push({ label: 'private-preview-release-scan', exitCode: 0, milliseconds: Date.now() - started });
      previewBefore = await verifyPreviewHttp('private-preview-http-before');
    }
    say('공개 상품과 비공개 읽기 차단을 실제 REST GET으로 확인합니다.');
    catalogBefore = await verifyCatalogHttp('catalog-http-before');
    await ensurePortUnused();
    say('전용 Expo 서버와 새 실행 화면을 준비합니다.');
    expoServer = startLogged('expo-server', process.execPath, [tools.expo, 'start', '--localhost', '--port', String(port), '--clear'], {
      cwd: mobileRoot,
      env: previewEnvironment(pinnedCatalogEnvironment(catalogEnvironment, tools.env, runId), previewSession),
    });
    await waitForServer();
    createdReverse = await prepareReverse();
    if (previewSession) createdPreviewReverse = await prepareReverse(PREVIEW_PORT);
    await wakeScreenForUi();
    say(receiptOnly ? '휴대전화에서 영수증 구간을 부분 검사합니다.' : '휴대전화에서 장바구니·거스름돈·계산 완료·영수증을 전체 검사합니다.');
    const maestroDir = path.join(runDir, 'maestro');
    await run('maestro-flow', tools.maestro, [
      '--device', selectedSerial, 'test', '-e', 'EXPO_URL=exp://127.0.0.1:' + port, '-e', 'RUN_ID=' + runId,
      '-e', 'PRIVATE_PREVIEW_ENABLED=' + (previewSession ? '1' : '0'),
      '--format', 'junit', '--output', path.join(runDir, 'result.xml'),
      '--test-output-dir', maestroDir, '--debug-output', maestroDir,
      receiptOnly ? 'apps/mobile/.maestro/receipt.yaml' : 'apps/mobile/.maestro/payment.yaml',
    ], { timeout: timeout.flow });
    junit = readJunit(path.join(runDir, 'result.xml'));
    if (interrupted) throw new Error('사용자가 검사를 중단했습니다.');
    assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
    assertPreviewUnchanged();
    catalogAfter = await verifyCatalogHttp('catalog-http-after', catalogBefore);
    if (previewSession) {
      previewAfter = await verifyPreviewHttp('private-preview-http-after');
      if (previewAfter.fingerprint !== previewBefore.fingerprint) throw new Error('검사 전후 미리보기 응답이 다릅니다.');
    }
    assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
    // 부분 검사 성공은 전체 회귀 검증을 대신하지 않으므로 공개 보고서와 커밋을 만들지 않습니다.
    if (!receiptOnly) {
      writeReport('PASS');
      assertCatalogEnvironmentUnchanged(catalogEnvironment);
      assertPreviewUnchanged();
      if (!noCommit) {
        const result = commitVerifiedChange({ repoRoot, state: gitState, reportPath, message });
        commit = result.commit;
      } else {
        assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
      }
    }
    overallStatus = 'passed';
    say(receiptOnly ? '영수증 부분 검사를 마쳤습니다. 전체 검증 기록과 커밋은 생성하지 않았습니다.' : '실기기 자동 검사와 기록을 마쳤습니다.' + (commit ? ' 로컬 커밋: ' + commit.slice(0, 12) : ' 새 커밋은 만들지 않았습니다.'));
  }
} catch (error) {
  overallStatus = interrupted ? 'interrupted' : verificationStarted ? 'failed' : 'blocked';
  const reason = safeError(error);
  if (publicReportWritten && !commit) writeReport('BLOCKED — 자동 커밋하지 않음', reason);
  if (fs.existsSync(runDir)) fs.writeFileSync(path.join(runDir, 'failure.txt'), reason + '\n');
  console.error('[기기 검사] ' + reason);
  process.exitCode = 1;
} finally {
  await cleanup();
  if (fs.existsSync(runDir)) {
    fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({
      runId, scope: receiptOnly ? 'receipt-only' : 'full', status: overallStatus, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
      device, sourceHash: gitState?.sourceHash, head: gitState?.head, checks, junit, commit, screenAwake,
      catalog: { environmentFingerprint: catalogEnvironment?.fingerprint, before: catalogBefore, after: catalogAfter },
      privatePreview: { sourceFingerprint: previewState?.fingerprint, before: previewBefore, after: previewAfter, releaseScan },
    }, null, 2) + '\n');
    say('원본 기록: .artifacts/device/' + runId + '/');
  }
}
