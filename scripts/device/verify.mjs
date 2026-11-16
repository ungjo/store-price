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
import { captureStandaloneApk, assertStandaloneApkUnchanged } from '../build/standalone.mjs';
import { requireOffline, runStandaloneOffline } from './standalone-device.mjs';
import { captureDisplaySettings, restoreDisplaySettings, serializeDisplaySettings } from './display-settings.mjs';
import { runReadability } from './readability-device.mjs';
import { runTalkBack } from './talkback-device.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mobileRoot = path.join(repoRoot, 'apps/mobile');
const reportPath = 'docs/book/verification/latest-android.md';
const port = 8091;
// 상품 12개로 목록 왕복과 분류 검사가 늘어났으므로 전체 실기기 흐름의 상한을 확보합니다.
const timeout = { tool: 30_000, check: 300_000, export: 600_000, server: 180_000, flow: 1_500_000 };
const args = process.argv.slice(2);
let noCommit = false;
let receiptOnly = false;
let standaloneOnly = false;
let readabilityRequested = false;
let readabilityOnly = false;
let talkbackRequested = false;
let talkbackOnly = false;
let doctor = false;
let previewPath;
let standalonePath;
let message = 'test: 갤럭시 자동 검증 결과와 확인한 변경 기록';

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--no-commit') noCommit = true;
  else if (args[index] === '--receipt-only') { receiptOnly = true; noCommit = true; }
  else if (args[index] === '--standalone-only') { standaloneOnly = true; noCommit = true; }
  else if (args[index] === '--readability') readabilityRequested = true;
  else if (args[index] === '--readability-only') { readabilityRequested = true; readabilityOnly = true; noCommit = true; }
  else if (args[index] === '--talkback') talkbackRequested = true;
  else if (args[index] === '--talkback-only') { talkbackRequested = true; talkbackOnly = true; noCommit = true; }
  else if (args[index] === '--doctor') doctor = true;
  else if (args[index] === '--private-price-preview' && args[index + 1]) previewPath = args[++index];
  else if (args[index] === '--standalone-apk' && args[index + 1]) standalonePath = args[++index];
  else if (args[index] === '--message' && args[index + 1]) message = args[++index];
  else throw new Error('지원 옵션: --no-commit, --receipt-only, --standalone-only, --readability, --readability-only, --talkback, --talkback-only, --doctor, --private-price-preview <원본 경로>, --standalone-apk <빌드 검증 파일>, --message "커밋 메시지"');
}
if (!message.trim() || /[\r\n\0]/u.test(message)) throw new Error('커밋 메시지는 한 줄로 입력해 주세요.');
if (previewPath && receiptOnly && !doctor) throw new Error('실제 가격 미리보기는 전체 검사와 함께 실행해 주세요.');
if (standalonePath && receiptOnly) throw new Error('설치형 APK 오프라인 검사는 전체 검사와 함께 실행해 주세요.');
if (standaloneOnly && !standalonePath) throw new Error('설치형 APK 부분 진단에는 --standalone-apk 빌드 검증 파일이 필요합니다.');
if (standaloneOnly && (receiptOnly || previewPath)) throw new Error('설치형 APK 부분 진단은 영수증·개인 가격 미리보기 검사와 함께 실행할 수 없습니다.');
if (readabilityRequested && (receiptOnly || previewPath || (readabilityOnly && standalonePath))) {
  throw new Error('화면 사용성 검사는 영수증 부분 검사나 개인 미리보기와 함께 실행하지 않습니다. APK 부분 진단은 --standalone-only --readability를 사용해 주세요.');
}

if (talkbackRequested && (receiptOnly || previewPath || standalonePath || readabilityRequested)) {
  throw new Error('TalkBack 검사는 현재 Expo Go에서 단독으로 확인합니다. 영수증 부분 검사·실제 가격 미리보기·설치형 APK·화면 배율 검사와 함께 실행하지 마세요.');
}

const runId = new Date().toISOString().replace(/[-:.]/gu, '') + '-' + randomBytes(4).toString('hex');
const loadingRunId = runId + '-loading';
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
let releasedReverse = false;
let releasedPreviewReverse = false;
let previewState;
let previewSession;
let previewClosed = false;
let previewBefore;
let previewAfter;
let releaseScan;
let checkPreviewExpectations;
let interrupted = false;
let publicReportWritten = false;
let verificationStarted = false;
let junit;
let loadingJunit;
let apkState;
let standaloneResult;
let standaloneJunit;
let displayState;
let readabilityResult;
let talkbackResult;
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
  if (options.signal?.aborted) throw new Error(label + ' 단계가 취소되었습니다.');
  const started = Date.now();
  const task = startLogged(label, file, commandArgs, options);
  let timedOut = false;
  let aborted = false;
  // 오프라인 상태 감시가 실패하면 이번에 실행한 검사만 멈추고 통신 설정 복구로 넘어갑니다.
  const onAbort = () => { aborted = true; killOwnChild(task.child); };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  const timer = setTimeout(() => { timedOut = true; killOwnChild(task.child); }, options.timeout || timeout.tool);
  let result;
  try { result = await task.done; }
  finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
  checks.push({ label, exitCode: result.code, milliseconds: Date.now() - started });
  if (aborted) throw new Error(label + ' 단계가 취소되었습니다.');
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
  if (!standaloneOnly) {
    const expo = await adb('expo-go-installed', ['shell', 'pm', 'path', 'host.exp.exponent']);
    if (!/^package:/mu.test(expo.stdout)) throw new Error('휴대전화에 Expo Go를 먼저 설치해 주세요.');
    requireFile(path.join(repoRoot, 'apps/mobile/.maestro/payment.yaml'), 'Maestro 검사 흐름');
    await ensurePortUnused();
  }
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

async function stopExpoStage() {
  // 두 검사 모드는 서버 환경을 공유하지 않습니다. 직접 실행한 서버가 끝난 뒤 같은 포트를 다시 씁니다.
  const task = expoServer;
  if (!task) return;
  killOwnChild(task.child);
  let timer;
  try {
    await Promise.race([
      task.done,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('앞 단계의 검사용 Expo 서버가 종료되지 않았습니다.')), 15_000); }),
    ]);
  } finally { clearTimeout(timer); }
  expoServer = undefined;
  await ensurePortUnused();
}

async function verifyLoadingChoice() {
  const fixtureEnv = pinnedCatalogEnvironment(catalogEnvironment, tools.env, loadingRunId);
  fixtureEnv.EXPO_PUBLIC_CATALOG_TEST_SCENARIO = 'pending-choice';
  expoServer = startLogged('expo-loading-server', process.execPath, [tools.expo, 'start', '--localhost', '--port', String(port), '--clear'], {
    cwd: mobileRoot, env: fixtureEnv,
  });
  await waitForServer();
  await wakeScreenForUi();
  say('연결을 기다리는 동안 예시 상품을 고르는 화면을 별도 검사합니다. 휴대전화 통신 설정은 바꾸지 않습니다.');
  const stageDir = path.join(runDir, 'maestro-loading');
  await run('maestro-loading-choice', tools.maestro, [
    '--device', selectedSerial, 'test', '-e', 'EXPO_URL=exp://127.0.0.1:' + port, '-e', 'RUN_ID=' + loadingRunId,
    '--format', 'junit', '--output', path.join(runDir, 'loading-result.xml'),
    '--test-output-dir', stageDir, '--debug-output', stageDir,
    'apps/mobile/.maestro/catalog-loading-choice.yaml',
  // 내장 예시에서도 분류 전환·새 상품 계산·영수증까지 확인하므로 전체 흐름 시간을 확보합니다.
  ], { timeout: 600_000 });
  loadingJunit = readJunit(path.join(runDir, 'loading-result.xml'));
  assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
  assertCatalogEnvironmentUnchanged(catalogEnvironment);
  assertPreviewUnchanged();
  await stopExpoStage();
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

async function releaseOwnedReverse(targetPort, label) {
  const current = reverseTarget((await adb(label + '-cleanup-check', ['reverse', '--list'], { cleanup: true })).stdout, targetPort);
  // 이번 실행이 만든 포트가 다른 용도로 바뀌었다면 삭제하지 않습니다. 남은 연결은 APK 검사에서 거절합니다.
  if (current !== 'tcp:' + targetPort) return;
  await adb(label + '-remove', ['reverse', '--remove', 'tcp:' + targetPort], { cleanup: true });
  const remaining = reverseTarget((await adb(label + '-removed-check', ['reverse', '--list'], { cleanup: true })).stdout, targetPort);
  if (remaining === 'tcp:' + targetPort) throw new Error('이번 검사에서 만든 USB 연결이 제거됐는지 확인하지 못했습니다.');
}

async function stopOwnDevelopmentConnections() {
  // 설치형 앱의 첫 실행 전에 직접 시작한 개발 서버와 연결만 정리합니다. 사용자의 서버는 유지합니다.
  await stopExpoStage();
  if (previewSession && !previewClosed) {
    await previewSession.close();
    previewClosed = true;
  }
  if (createdPreviewReverse && !releasedPreviewReverse) {
    await releaseOwnedReverse(PREVIEW_PORT, 'preview-reverse');
    releasedPreviewReverse = true;
  }
  if (createdReverse && !releasedReverse) {
    await releaseOwnedReverse(port, 'reverse');
    releasedReverse = true;
  }
}

async function verifyStandaloneOffline() {
  assertStandaloneApkUnchanged(apkState);
  await stopOwnDevelopmentConnections();
  say('개발 서버 연결 없이 설치형 APK의 첫 실행과 오프라인 예시 놀이를 검사합니다. 종료 전에 통신 설정을 복구합니다.');
  const started = Date.now();
  let checkedJunit;
  try {
    standaloneResult = await runStandaloneOffline({
      adb, run, tools: { ...tools, selectedSerial }, runDir, apkState,
      discardSuccessfulInstall: standaloneOnly,
      // 설치형 화면 검사는 오프라인 첫 실행과 통신 복구가 끝난 뒤 같은 APK에서 실행합니다.
      verifyInstalled: readabilityRequested ? async () => {
        await verifyReadability();
        assertStandaloneApkUnchanged(apkState);
        assertCatalogEnvironmentUnchanged(catalogEnvironment);
        assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
      } : undefined,
      validateJunit: (file) => {
        // JUnit 오류도 기기 검사의 실패로 처리해 통신 복구 뒤 이번에 설치한 실패 앱만 정리합니다.
        if (typeof file !== 'string') throw new Error('설치형 APK 검사 결과 파일이 없습니다.');
        const resultFile = path.resolve(file);
        const relative = path.relative(runDir, resultFile);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
          throw new Error('설치형 APK 검사 결과가 이번 실행 폴더 밖에 있습니다.');
        }
        let stat;
        try { stat = fs.lstatSync(resultFile); }
        catch { throw new Error('설치형 APK 검사 결과 파일을 확인하지 못했습니다.'); }
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new Error('설치형 APK 검사 결과가 일반 파일이 아닙니다.');
        }
        checkedJunit = Object.freeze(readJunit(resultFile));
        return checkedJunit;
      },
    });
    // 실기기 감시와 커밋 직전 판정에 같은 모드·회선·연결 검증을 적용합니다.
    const offline = (value) => {
      try { requireOffline(value); return true; } catch { return false; }
    };
    if (standaloneResult.applicationId !== apkState.applicationId
      || standaloneResult.buildNonce !== apkState.buildNonce
      || standaloneResult.apkSha256 !== apkState.sha256
      || standaloneResult.installedFresh !== true
      || standaloneResult.installationScope !== 'current-android-user'
      || standaloneResult.firstLaunchOffline !== true
      || (readabilityRequested && standaloneResult.verifyInstalledStatus !== 'passed')
      || standaloneResult.installationCleanup !== (standaloneOnly ? 'removed-own-probe-install' : 'not-needed')
      || !offline(standaloneResult.network?.firstOffline)
      || !offline(standaloneResult.network?.lastOffline)
      || standaloneResult.network.before?.networkMode !== standaloneResult.network.firstOffline.networkMode
      || standaloneResult.network.before?.networkMode !== standaloneResult.network.lastOffline.networkMode
      || (standaloneResult.network.before?.networkMode === 'wifi-only'
        && standaloneResult.network.restoration?.mobileData !== 'not-applicable')
      || !Number.isInteger(standaloneResult.network?.offlineChecks)
      || standaloneResult.network.offlineChecks < 2
      || standaloneResult.network?.restoration?.verified !== true) {
      throw new Error('검사한 APK·오프라인 첫 실행·통신 설정 복구의 근거가 일치하지 않습니다.');
    }
    if (!checkedJunit) throw new Error('설치형 APK의 JUnit 검증이 실행되지 않았습니다.');
    assertStandaloneApkUnchanged(apkState);
    // 실행 결과와 통신 복구가 모두 성공한 뒤에만 공개 보고서용 통과 상태를 확정합니다.
    standaloneJunit = checkedJunit;
    checks.push({ label: 'standalone-offline', exitCode: 0, milliseconds: Date.now() - started });
  } catch (error) {
    if (error.standalone) standaloneResult = error.standalone;
    checks.push({ label: 'standalone-offline', exitCode: 1, milliseconds: Date.now() - started });
    throw error;
  }
}

async function verifyReadability() {
  say((apkState ? '새로 설치한 APK' : 'Expo Go') + '에서 일반·큰 글자·좁은 화면과 열린 키보드를 검사합니다. 원래 화면 설정은 종료 전에 복구합니다.');
  displayState = await captureDisplaySettings({
    adb,
    onChange: (value) => fs.writeFileSync(path.join(runDir, 'display-settings.json'), JSON.stringify(value, null, 2) + '\n'),
  });
  try {
    readabilityResult = await runReadability({
      adb, run, tools: { ...tools, selectedSerial }, runDir,
      runId: apkState ? apkState.buildNonce : runId,
      applicationId: apkState?.applicationId ?? 'host.exp.exponent', catalogSource: 'supabase',
      expoUrl: 'exp://127.0.0.1:' + port, displayState,
      validateJunit: (filename) => readJunit(filename),
    });
  } finally {
    await restoreDisplaySettings(displayState);
  }
  if (!serializeDisplaySettings(displayState).restoration.verified) {
    throw new Error('화면 설정 복구를 확인하지 못해 성공 기록과 커밋을 만들지 않습니다.');
  }
}

function assertTalkBackEvidence() {
  if (!talkbackResult || talkbackResult.status !== 'passed'
    || talkbackResult.applicationId !== 'host.exp.exponent' || talkbackResult.runId !== runId
    || talkbackResult.inputMode !== 'uinput-touch'
    || typeof talkbackResult.talkBackVersion !== 'string' || !talkbackResult.talkBackVersion.trim()
    || !Array.isArray(talkbackResult.checkpoints) || talkbackResult.checkpoints.length === 0
    || !talkbackResult.checkpoints.some((entry) => entry.speech?.matched === true)
    || talkbackResult.checkpoints.some((entry) => entry.expectation?.speechIncludes && entry.speech?.matched !== true)
    || talkbackResult.restoration?.verified !== true) {
    throw new Error('TalkBack의 검사 대상·실제 입력·발화 근거·설정 복구를 확인하지 못해 기록과 커밋을 만들지 않습니다.');
  }
}

async function verifyTalkBack() {
  say('TalkBack을 켠 실제 읽기 초점·버튼 조작·생성된 안내 문구를 확인합니다. 종료 전에 접근성 설정을 복구합니다.');
  const started = Date.now();
  try {
    // Maestro 이후에만 호출합니다. 뒤이어 Maestro를 시작하면 활성 접근성 서비스가 억제될 수 있습니다.
    talkbackResult = await runTalkBack({
      repoRoot, runDir, run, adb, tools, selectedSerial, runId,
      applicationId: 'host.exp.exponent', expoUrl: 'exp://127.0.0.1:' + port, say,
    });
    assertTalkBackEvidence();
    checks.push({ label: 'talkback-flow', exitCode: 0, milliseconds: Date.now() - started });
  } catch (error) {
    checks.push({ label: 'talkback-flow', exitCode: 1, milliseconds: Date.now() - started });
    throw error;
  }
}

function standaloneEvidence() {
  const networkState = (value) => value && ({
    networkMode: value.networkMode,
    wifiEnabled: value.wifiEnabled,
    mobileDataEnabled: value.mobileDataEnabled,
    airplaneModeEnabled: value.airplaneModeEnabled,
    activeDefaultNetwork: value.activeDefaultNetwork,
    internetNetworkCount: value.internetNetworkCount,
    reverseMappingCount: value.reverseMappingCount,
  });
  const network = standaloneResult?.network;
  // 로컬 APK 경로·기기 식별자·원본 네트워크 덤프는 공개 보고서와 요약에 넣지 않습니다.
  return {
    requested: Boolean(standalonePath),
    apk: apkState && {
      applicationId: apkState.applicationId, buildNonce: apkState.buildNonce,
      sha256: apkState.sha256, versionName: apkState.versionName, versionCode: apkState.versionCode,
      buildId: apkState.buildId, sourceFingerprint: apkState.sourceFingerprint,
      signerCertificateSHA256: apkState.signerCertificateSHA256,
      debuggable: apkState.debuggable, embeddedBundle: apkState.embeddedBundle, backupDisabled: apkState.backupDisabled,
    },
    installedFresh: standaloneResult?.installedFresh,
    installationScope: standaloneResult?.installationScope,
    installationCleanup: standaloneResult?.installationCleanup,
    firstLaunchOffline: standaloneResult?.firstLaunchOffline,
    verifyInstalledStatus: standaloneResult?.verifyInstalledStatus,
    junit: standaloneJunit,
    network: network && {
      before: networkState(network.before), firstOffline: networkState(network.firstOffline),
      lastOffline: networkState(network.lastOffline), offlineChecks: network.offlineChecks,
      restoration: network.restoration && {
        wifi: network.restoration.wifi, mobileData: network.restoration.mobileData,
        verified: network.restoration.verified,
      },
    },
  };
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
  if (!screenAwake.changeRequested || ['restored', 'preserved-current-value'].includes(screenAwake.restoreStatus)) return;
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
  const standalone = standaloneEvidence();
  const display = displayState ? serializeDisplaySettings(displayState) : undefined;
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
    '- 예시 선택 별도 실행 ID: `' + loadingRunId + '` (개발 검사 요청, 실제 통신 장애를 발생시키지 않음)',
    ...(previewAfter ? [
      '- 개발용 실제 가격 미리보기: ' + previewAfter.productCount + '개, DB 조회 시각 `' + previewAfter.fetchedAt + '`',
      '- 미리보기 원본 SHA-256: `' + previewAfter.sourceFingerprint + '` (실행 전후 일치)',
      '- 미리보기 응답 SHA-256: `' + previewAfter.fingerprint + '` (이번 실행 세션)',
      '- 배포 산출물 검사: ' + releaseScan.scannedFiles + '개 파일, 실제 상품 식별자·이름·임시 토큰 없음',
    ] : []),
    '- 도구: Maestro 2.12.1 / JDK 21 / USB 실기기 / Expo Go' + (standaloneJunit ? ' / 설치형 APK' : '') + (talkbackResult ? ' / TalkBack' : ''),
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
    'maestro check-syntax apps/mobile/.maestro/catalog-loading-choice.yaml',
    'maestro check-syntax apps/mobile/.maestro/catalog-categories.yaml',
    'maestro check-syntax apps/mobile/.maestro/standalone-offline.yaml',
    'node --test scripts/device/git-guard.test.mjs',
    'node --experimental-strip-types --test scripts/device/catalog-http-check.test.mjs',
    'node --test scripts/device/private-price-preview.test.mjs',
    'node --test scripts/build/standalone.test.mjs',
    'node --test scripts/device/standalone-device.test.mjs',
    'node --test scripts/device/display-settings.test.mjs',
    'node --test scripts/device/keyboard-layout.test.mjs',
    'node --test scripts/device/talkback-observer.test.mjs',
    'node --test scripts/device/talkback-device.test.mjs',
    'node --test scripts/device/talkback-speech-ocr.test.mjs',
    'maestro check-syntax apps/mobile/.maestro/readability-open.yaml',
    'maestro check-syntax apps/mobile/.maestro/readability-correct.yaml',
    'maestro check-syntax apps/mobile/.maestro/readability-finish.yaml',
    'npm --prefix scripts/database test',
    'cd apps/mobile', 'npm test', 'npm run typecheck', 'npm run lint', 'npm run export:check',
    'EXPO_PUBLIC_DEVICE_RUN_ID=<실행 ID>-loading EXPO_PUBLIC_CATALOG_TEST_SCENARIO=pending-choice node node_modules/expo/bin/cli start --localhost --port 8091 --clear',
    '# 예시 선택 검사 후 직접 시작한 서버만 종료하고, 검사 설정을 뺀 서버로 전체 검사를 다시 시작',
    'EXPO_PUBLIC_DEVICE_RUN_ID=<실행 ID> node node_modules/expo/bin/cli start --localhost --port 8091 --clear',
    'cd ../..',
    'adb -s <선택한 실기기> reverse --list',
    ...(createdReverse ? ['adb -s <선택한 실기기> reverse --no-rebind tcp:8091 tcp:8091'] : ['# 이미 있던 동일 포트 연결을 변경 없이 재사용']),
    ...(screenAwake.wakeRequested ? ['adb -s <선택한 실기기> shell input keyevent 224'] : []),
    'maestro --device <선택한 실기기> test -e EXPO_URL=exp://127.0.0.1:8091 -e RUN_ID=<실행 ID>-loading --format junit --output <검사폴더>/loading-result.xml --test-output-dir <검사폴더>/maestro-loading --debug-output <검사폴더>/maestro-loading apps/mobile/.maestro/catalog-loading-choice.yaml',
    'maestro --device <선택한 실기기> test -e EXPO_URL=exp://127.0.0.1:8091 -e RUN_ID=<실행 ID> --format junit --output <검사폴더>/result.xml --test-output-dir <검사폴더>/maestro --debug-output <검사폴더>/maestro apps/mobile/.maestro/payment.yaml',
    ...(standaloneJunit ? [
      '# 직접 시작한 개발 서버·USB 연결을 정리한 후 현재 Android 프로필에 검증한 APK를 새로 설치',
      'adb -s <선택한 실기기> install -R --user <현재 Android 사용자> <검증한 APK>',
      standalone.network.before.networkMode === 'wifi-only'
        ? '# Wi-Fi 전용 기기는 모바일 데이터 설정을 보존하고 Wi-Fi·활성 인터넷 경로·USB reverse가 없는지 확인'
        : '# 단일 SIM 스마트폰은 Wi-Fi·모바일 데이터와 활성 인터넷 경로·USB reverse가 없는지 확인',
      'maestro --device <선택한 실기기> test -e APP_ID=<검증한 앱 ID> -e RUN_ID=<빌드 확인 번호> --format junit --output <검사폴더>/standalone-result.xml --test-output-dir <검사폴더>/maestro-standalone --debug-output <검사폴더>/maestro-standalone apps/mobile/.maestro/standalone-offline.yaml',
      '# 검사 종료 뒤 휴대전화의 통신 설정을 원래 값으로 복구하고 확인',
    ] : []),
    ...(readabilityResult ? [
      '# 일반·큰 글자·좁은 화면 조건마다 아래 화면 검사를 실행',
      ...display.history.filter((entry) => entry.status === 'verified').map((entry) => entry.field === 'fontScale'
        ? 'adb -s <선택한 실기기> shell settings --user <현재 프로필> put system font_scale ' + entry.target
        : 'adb -s <선택한 실기기> shell wm density ' + (entry.target ?? display.original.density.physical) + ' -d 0'),
      'maestro --device <선택한 실기기> test -e APP_ID=' + readabilityResult.applicationId + ' -e RUN_ID=' + readabilityResult.runId + ' -e CATALOG_SOURCE=' + readabilityResult.catalogSource + ' -e EXPO_URL=exp://127.0.0.1:8091 -e LAYOUT_PRESET=<화면 조건> apps/mobile/.maestro/readability-open.yaml',
      'maestro --device <선택한 실기기> hierarchy --no-reinstall-driver',
      'adb -s <선택한 실기기> shell dumpsys input_method',
      'adb -s <선택한 실기기> shell dumpsys window',
      'maestro --device <선택한 실기기> test -e APP_ID=' + readabilityResult.applicationId + ' -e RUN_ID=' + readabilityResult.runId + ' -e CATALOG_SOURCE=' + readabilityResult.catalogSource + ' -e EXPO_URL=exp://127.0.0.1:8091 -e LAYOUT_PRESET=<화면 조건> apps/mobile/.maestro/readability-correct.yaml',
      '# 3500 답 입력 뒤에도 같은 IME·화면 영역 측정 반복',
      'maestro --device <선택한 실기기> test -e APP_ID=' + readabilityResult.applicationId + ' -e RUN_ID=' + readabilityResult.runId + ' -e CATALOG_SOURCE=' + readabilityResult.catalogSource + ' -e EXPO_URL=exp://127.0.0.1:8091 -e LAYOUT_PRESET=<화면 조건> apps/mobile/.maestro/readability-finish.yaml',
      '# 마지막에는 원래 값과 override 유무까지 복구 후 재조회',
      'adb -s <선택한 실기기> ' + display.recoveryCommands.density.join(' '),
      'adb -s <선택한 실기기> ' + display.recoveryCommands.fontScale.join(' '),
    ] : []),
    ...(talkbackResult ? [
      '# 앞선 Maestro 검사 종료 후 --talkback 옵션으로 동일 Expo Go 번들의 읽기 흐름 검사',
      '# runTalkBack이 실제 읽기 초점·생성된 발화 텍스트·uinput 터치와 설정 복구를 확인',
    ] : []),
    ...(screenAwake.restoreStatus === 'restored' ? [
      screenAwake.originalValue === 'null'
        ? 'adb -s <선택한 실기기> shell settings delete global stay_on_while_plugged_in'
        : 'adb -s <선택한 실기기> shell settings put global stay_on_while_plugged_in ' + screenAwake.originalValue,
      'adb -s <선택한 실기기> shell settings get global stay_on_while_plugged_in',
    ] : []),
    '```', '',
    'Windows에서는 npm CLI와 Maestro 배치 파일을 Node에서 호출했다. 위 명령의 실기기 식별자와 실행 폴더는 개인정보 보호를 위해 치환했다.',
    '', '## 임시 화면 유지 설정', '',
    '- 검사 전 값: ' + (screenAwake.originalValue ?? '확인하지 않음') + '. 적용 상태: ' + screenAwake.applyStatus + '.',
    '- 원래 값이 7이면 설정을 변경하지 않았다. 다른 값이면 충전 중 화면이 꺼지지 않도록 검사 동안만 7을 사용한다.',
    '- 성공 기록 전에 현재 값이 여전히 7일 때만 원래 값을 복구한다. 중간에 바뀐 값은 보존한다.',
    '- 복구 상태: ' + screenAwake.restoreStatus + '. 복구 뒤 값: ' + (screenAwake.valueAfterRestore ?? screenAwake.valueBeforeRestore ?? screenAwake.originalValue ?? '확인하지 않음') + '.',
    '- 임시 설정의 복구를 확인하지 못하면 성공 보고서와 자동 커밋을 만들지 않는다. 원본 summary.json에 실제 복구 결과와 실행한 명령의 종료 코드를 남긴다.',
    ...(talkbackResult ? [
      '', '## TalkBack 접근성 검사', '',
      '- 검사 대상: Expo Go / 앱 ID `' + talkbackResult.applicationId + '`, 실행 표시 `' + talkbackResult.runId + '`.',
      '- TalkBack 버전: ' + talkbackResult.talkBackVersion.replace(/[\r\n]/gu, ' ') + '. 입력 방식: `' + talkbackResult.inputMode + '`.',
      '- 읽기 초점·상품 선택·수량·지불·퀴즈·영수증 흐름에서 확인 지점 ' + talkbackResult.checkpoints.length + '개를 통과했다.',
      '- 접근성 서비스와 관련 설정 복구 확인: ' + talkbackResult.restoration.verified + '.',
      '- 실제 읽기 초점과 화면에 표시된 TalkBack 발화 문구를 확인했다. 실제 스피커·이어폰 음성을 사람이 청취한 평가와는 구분한다.',
      '- 원본 화면·발화·입력 로그는 이번 실행의 비공개 .artifacts 폴더에만 보관한다.',
    ] : []),
    ...(readabilityResult ? [
      '', '## 큰 글자·좁은 화면·열린 키보드 검사', '',
      '- 검사 대상: ' + (apkState ? '새로 설치한 release APK. 오프라인 첫 실행과 통신 복구 뒤 공개 상품으로 검사했다.' : 'Expo Go 개발 화면.') + ' 앱 ID: `' + readabilityResult.applicationId + '`, 실행 표시: `' + readabilityResult.runId + '`.',
      '- Android의 실제 font_scale과 화면 밀도를 적용했다. 원래 글자 배율: ' + display.original.fontScale.value + ', 화면 밀도: ' + display.original.density.effective + '.',
      ...readabilityResult.presets.map((preset) => '- ' + preset.name + ': 글자 배율 ' + preset.fontScale + ', 화면 밀도 ' + preset.density + ', 화면 폭 약 ' + preset.widthDp + 'dp. JUnit ' + preset.phases.length + '개 통과, 열린 키보드 실측 ' + preset.keyboards.length + '회.'),
      '- 각 조건에서 분류·상품·장바구니·5자리 답 12345 입력·오답 확인·3500 정답·영수증·다시 장보기를 검사했다.',
      '- 키보드를 미리 닫지 않은 채 정답 확인을 눌렀다. Android IME 노출과 실제 화면 계층으로 입력칸·확인 버튼 전체가 키보드 위에 있고 서로 겹치지 않는지 확인했다.',
      '- 크래커 1개·1,500원, 낸 돈 5,000원·거스름돈 3,500원·남은 놀이돈 8,500원을 확인했다.',
      '- 글자·화면 설정 복구 확인: ' + display.restoration.verified + '. 원래 override 밀도와 font_scale의 저장 상태까지 비교했다.',
      '- 픽셀 해상도는 바꾸지 않았다. 좁은 화면은 이 갤럭시의 논리적 화면 폭을 바꾼 검사이며 다른 기종이나 iPhone 검증을 뜻하지 않는다.',
    ] : []),
    ...(standaloneJunit ? [
      '', '## 설치형 APK 오프라인 검사', '',
      '- 앱 ID: `' + standalone.apk.applicationId + '`',
      '- 버전: `' + standalone.apk.versionName + '` / 코드 `' + standalone.apk.versionCode + '`',
      '- 빌드 ID: `' + standalone.apk.buildId + '` / 빌드 확인 번호: `' + standalone.apk.buildNonce + '`',
      '- APK SHA-256: `' + standalone.apk.sha256 + '` (검사 전후 일치)',
      '- 빌드 소스 SHA-256: `' + standalone.apk.sourceFingerprint + '`',
      ...(standalone.apk.signerCertificateSHA256 ? ['- APK 서명 인증서 SHA-256: `' + standalone.apk.signerCertificateSHA256 + '`'] : []),
      ...(standalone.apk.debuggable === false ? ['- APK manifest 검사: 디버그 모드 비활성 확인.'] : []),
      ...(standalone.apk.embeddedBundle === true ? ['- APK 내부 앱 실행 번들과 이번 빌드 확인 번호 포함 확인.'] : []),
      ...(standalone.apk.backupDisabled === true ? ['- APK manifest 검사: 백업 복원 비활성 확인.'] : []),
      '- 현재 Android 프로필에서 이번 APK의 새 설치·미실행 상태를 확인하고 인터넷과 개발 서버 연결이 없는 상태에서 첫 실행했다. 다른 프로필의 설치 여부는 조사하지 않았다.',
      '- 설치 시 -R로 기존 패키지 교체를 금지하고 --user로 현재 프로필을 지정했다. Expo Go 실행 기록과 별도로 검사했다.',
      '- 통신 검사 방식: `' + standalone.network.before.networkMode + '`. ' + (standalone.network.before.networkMode === 'wifi-only'
        ? '이동통신 기능이 없는 기기로 확인해 모바일 데이터 설정은 조회·보존하며 변경하지 않았다.'
        : '단일 활성 SIM 스마트폰의 Wi-Fi와 모바일 데이터를 각각 확인하고 원래 값으로 복구했다.'),
      '- 검사 전 Wi-Fi: ' + standalone.network.before.wifiEnabled + ', 모바일 데이터: ' + (standalone.network.before.mobileDataEnabled === null ? '미해당' : standalone.network.before.mobileDataEnabled) + ', 비행기 모드: ' + standalone.network.before.airplaneModeEnabled + '.',
      '- 첫 실행 전과 마지막 확인 모두 ' + (standalone.network.before.networkMode === 'wifi-only' ? 'Wi-Fi 꺼짐, 모바일 데이터 미해당' : 'Wi-Fi·모바일 데이터 꺼짐')
        + ', 활성 기본 네트워크 없음, 인터넷 연결 ' + standalone.network.lastOffline.internetNetworkCount + '개, USB reverse ' + standalone.network.lastOffline.reverseMappingCount + '개.',
      '- 오프라인 상태 확인 횟수: ' + standalone.network.offlineChecks + '. 중간 연결 복구가 감지되면 검사를 중단한다.',
      '- 같은 오프라인 실행에서 내장 예시 12개와 분류별 6·4·2개를 확인했다. 새 상품 세 개의 4,500원 합계·500원 거스름돈·분류 변경 후 장바구니와 정답 유지·영수증·전체 분류 초기화도 검사했다.',
      '- 통신 설정 복구: Wi-Fi ' + standalone.network.restoration.wifi + ', 모바일 데이터 ' + standalone.network.restoration.mobileData + ', 복구 확인 ' + standalone.network.restoration.verified + '.',
      '- 별도 APK 검사와 통신·화면 설정 복구를 모두 확인한 뒤에만 이 기록과 커밋을 만든다.',
    ] : []),
    '', '## 확인한 항목', '',
    '- PGlite의 메모리 PostgreSQL에서 상품·가격 이력 제약, 예시 데이터, 수동 가격 관측의 비공개 조건, 공개 카탈로그와 역할별 읽기·쓰기 권한을 검사했다.',
    '- 실제 가격 입력 검증과 저장 SQL 생성은 자체 작성한 테스트 자료로 검사했다. 원격 비공개 적재 결과는 이번 개발 장의 별도 조회 기록을 따른다.',
    '- 공개 키 REST GET으로 예시 상품 12개의 이름·단위·가격·분류와 비공개 스키마·승인 메모 읽기 차단을 실행 전후 확인했다. 이 HTTP 검사는 쓰기·관리자 API를 호출하지 않았다.',
    '- 앱 검사·번들·Expo 서버에는 같은 설정을 전달하고 EXPO_NO_DOTENV=1로 고정했다. 환경 파일과 선택한 프로세스 설정의 변경도 검사했다.',
    '- 별도 개발 검사에서 상품 로딩 중 예시 놀이를 선택하고, 취소를 무시한 늦은 성공이 와도 예시 출처가 유지되는지 확인했다.',
    '- 예시 사과 1개·1,500원으로 10,000원 지불·8,500원 정답·영수증·다시 장보기를 확인했다. 다시 장보기에서 상품 요청 수가 늘지 않는다.',
    standaloneJunit
      ? '- 개발용 예시 선택 검사는 통신 설정을 바꾸지 않았다. 별도 설치형 APK 단계에서 실제 통신을 끄고 예시 놀이를 검사한 뒤 원래 설정을 복구했다.'
      : '- 휴대전화 Wi-Fi·모바일 데이터는 바꾸지 않았다. 실제 오프라인 연결이나 인터넷 없는 Expo Go 첫 실행을 검증한 결과는 아니다.',
    '- 대기 요청 검사 설정은 일반 검사·배포 환경에서 제거하며, 별도 검사 뒤 Expo를 재시작해 실제 Supabase 연결로 전체 놀이를 검사했다.',
    '- 실제 앱의 Supabase 출처·상품 12개 로딩을 최초 실행·다시 장보기·재실행에서 확인했다. 외부 상품의 일시적 변경을 연속 감시하는 검사는 아니다.',
    '- 원격 목록과 내장 예시에서 전체 12개·과일/채소 6개·유제품/달걀 4개·빵/간식 2개의 분류와 선택 상태를 확인했다.',
    '- 분류를 바꿔 화면에서 숨겨진 상품도 장바구니에 남고, 선택한 돈과 퀴즈 정답이 유지되는지 확인했다.',
    '- 추가 상품의 합계·거스름돈·영수증과 다시 장보기에서 전체 분류로 돌아오는 흐름을 두 출처에서 확인했다.',
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
    ...checks.filter((check) => check.label.startsWith('maestro-syntax-readability-') || /^readability-(?:standard|large-font|narrow-large-font)-(?:open|correct|finish)$/u.test(check.label) || ['display-settings-helpers', 'keyboard-layout-helpers', 'talkback-observer-tests', 'talkback-device-helpers', 'talkback-speech-ocr-tests', 'talkback-flow', 'maestro-syntax-main', 'maestro-syntax-quiz', 'maestro-syntax-receipt', 'maestro-syntax-preview', 'maestro-syntax-loading', 'maestro-syntax-categories', 'maestro-syntax-standalone', 'git-guard-tests', 'catalog-http-check-tests', 'private-preview-tests', 'build-helpers', 'standalone-device-helpers', 'private-preview-http-before', 'private-preview-http-after', 'private-preview-release-scan', 'catalog-http-before', 'catalog-http-after', 'database-tests', 'unit-tests', 'typecheck', 'lint', 'export', 'maestro-loading-choice', 'maestro-flow', 'standalone-offline', 'screen-awake-restore', 'screen-awake-restored-check'].includes(check.label))
      .map((check) => '- ' + check.label + ': 종료 코드 ' + check.exitCode),
    '- JUnit: ' + (junit ? `${junit.testcases} testcase, 실패 0, 오류 0, 건너뜀 0` : '통과를 확인하지 못함'),
    '- 예시 선택 JUnit: ' + (loadingJunit ? `${loadingJunit.testcases} testcase, 실패 0, 오류 0, 건너뜀 0` : '통과를 확인하지 못함'),
    ...(standalonePath ? ['- 설치형 APK JUnit: ' + (standaloneJunit ? `${standaloneJunit.testcases} testcase, 실패 0, 오류 0, 건너뜀 0` : '통과를 확인하지 못함')] : []),
    '', '원본 로그·스크린샷·JUnit·실행 요약은 `.artifacts/device/' + runId + '/`에만 보관하며 Git에 올리지 않는다. 기기 일련번호와 화면 XML은 이 보고서에 포함하지 않는다.',
    '', '이 기록은 해당 Android 실기기·검사 시점의 결과다. '
      + (standaloneJunit ? '설치형 APK는 위에 기록한 빌드만 검증했다. iPhone, 스토어 제출용 AAB/IPA 및 실제 이마트 가격의 앱 공개 표시는 검증하지 않았다.' : 'iPhone, 스토어용 APK/AAB/IPA 및 실제 이마트 가격의 앱 공개 표시는 검증하지 않았다.')
      + ' 앱은 공개 예시 상품 12개로 검사한다.', '',
  ];
  fs.mkdirSync(path.dirname(path.join(repoRoot, reportPath)), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, reportPath), lines.join('\n'));
  publicReportWritten = true;
}

async function cleanup() {
  if (displayState && !serializeDisplaySettings(displayState).restoration.verified) {
    try { await restoreDisplaySettings(displayState); }
    catch { say('글자·화면 설정 복구를 확인하지 못했습니다. 이 실행의 display-settings.json 복구 기록을 확인해 주세요.'); }
  }
  await restoreScreenAwake();
  if (createdPreviewReverse && !releasedPreviewReverse && tools && selectedSerial) {
    try {
      await releaseOwnedReverse(PREVIEW_PORT, 'preview-reverse');
      releasedPreviewReverse = true;
    } catch { say('미리보기 USB 연결 정리는 원본 로그를 확인해 주세요.'); }
  }
  if (previewSession && !previewClosed) {
    try { await previewSession.close(); previewClosed = true; }
    catch { say('미리보기 서버 정리는 원본 로그를 확인해 주세요.'); }
  }
  if (createdReverse && !releasedReverse && tools && selectedSerial) {
    try {
      await releaseOwnedReverse(port, 'reverse');
      releasedReverse = true;
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
    // APK 분석과 구문 검사가 길어져도 사용자가 풀어 둔 화면이 다시 잠기지 않게 먼저 적용합니다.
    await prepareScreenAwake();
    if (standalonePath) {
      say('설치형 APK의 빌드 출처·파일 지문·앱 정보를 먼저 확인합니다.');
      apkState = await captureStandaloneApk({ repoRoot, provenancePath: standalonePath, run, tools });
    }
    if (standaloneOnly) {
      // 실패 원인을 좁히는 별도 진단입니다. 전체 코드·온라인 회귀 검증을 대신하지 않습니다.
      say('설치형 APK만 부분 진단합니다. 전체 코드·온라인 검사는 생략하며 공개 기록과 커밋은 만들지 않습니다.');
      await run('maestro-syntax-standalone', tools.maestro, ['check-syntax', 'apps/mobile/.maestro/standalone-offline.yaml'], { timeout: 60_000 });
      await run('build-helpers', process.execPath, ['--test', 'scripts/build/standalone.test.mjs'], { timeout: timeout.check });
      await run('standalone-device-helpers', process.execPath, ['--test', 'scripts/device/standalone-device.test.mjs'], { timeout: timeout.check });
      if (readabilityRequested) {
        for (const phase of ['open', 'correct', 'finish']) {
          await run('maestro-syntax-readability-' + phase, tools.maestro, ['check-syntax', 'apps/mobile/.maestro/readability-' + phase + '.yaml'], { timeout: 60_000 });
        }
        await run('display-settings-helpers', process.execPath, ['--test', 'scripts/device/display-settings.test.mjs'], { timeout: timeout.check });
        await run('keyboard-layout-helpers', process.execPath, ['--test', 'scripts/device/keyboard-layout.test.mjs'], { timeout: timeout.check });
      }
      assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
      assertCatalogEnvironmentUnchanged(catalogEnvironment);
      assertStandaloneApkUnchanged(apkState);
      await wakeScreenForUi();
    } else {
      if (previewState) previewSession = await startPrivatePreviewServer(previewState, { sessionId: runId });
      checkPreviewExpectations = writePreviewExpectations(path.join(artifactRoot, 'private-preview-expectations.js'), previewSession);
      // 일반 YAML 구문 검사만으로는 명령 형식 오류를 찾을 수 없어, 기기를 조작하기 전에 Maestro로 확인합니다.
      for (const [label, file] of [['maestro-syntax-main', 'apps/mobile/.maestro/payment.yaml'], ['maestro-syntax-quiz', 'apps/mobile/.maestro/solve-quiz.yaml'], ['maestro-syntax-receipt', 'apps/mobile/.maestro/receipt.yaml'], ['maestro-syntax-preview', 'apps/mobile/.maestro/real-price-preview.yaml'], ['maestro-syntax-loading', 'apps/mobile/.maestro/catalog-loading-choice.yaml'], ['maestro-syntax-categories', 'apps/mobile/.maestro/catalog-categories.yaml'], ['maestro-syntax-standalone', 'apps/mobile/.maestro/standalone-offline.yaml']]) {
        await run(label, tools.maestro, ['check-syntax', file], { timeout: 60_000 });
      }
      for (const phase of ['open', 'correct', 'finish']) {
        await run('maestro-syntax-readability-' + phase, tools.maestro, ['check-syntax', 'apps/mobile/.maestro/readability-' + phase + '.yaml'], { timeout: 60_000 });
      }
      say('기기: ' + device.model + ' / Android ' + device.android + '. 코드 검사를 시작합니다.');
      await run('git-guard-tests', process.execPath, ['--test', 'scripts/device/git-guard.test.mjs'], { timeout: timeout.check });
      await run('catalog-http-check-tests', process.execPath, ['--experimental-strip-types', '--test', 'scripts/device/catalog-http-check.test.mjs'], { timeout: timeout.check });
      await run('private-preview-tests', process.execPath, ['--test', 'scripts/device/private-price-preview.test.mjs'], { timeout: timeout.check });
      await run('build-helpers', process.execPath, ['--test', 'scripts/build/standalone.test.mjs'], { timeout: timeout.check });
      await run('standalone-device-helpers', process.execPath, ['--test', 'scripts/device/standalone-device.test.mjs'], { timeout: timeout.check });
      await run('display-settings-helpers', process.execPath, ['--test', 'scripts/device/display-settings.test.mjs'], { timeout: timeout.check });
      await run('keyboard-layout-helpers', process.execPath, ['--test', 'scripts/device/keyboard-layout.test.mjs'], { timeout: timeout.check });
      await run('talkback-observer-tests', process.execPath, ['--test', 'scripts/device/talkback-observer.test.mjs'], { timeout: timeout.check });
      await run('talkback-speech-ocr-tests', process.execPath, ['--test', 'scripts/device/talkback-speech-ocr.test.mjs'], { timeout: timeout.check });
      await run('talkback-device-helpers', process.execPath, ['--test', 'scripts/device/talkback-device.test.mjs'], { timeout: timeout.check });
      // 실제 PostgreSQL 엔진에서 DB 권한과 가격 공개 조건을 확인한 뒤 앱·실기기 검사로 넘어갑니다.
      say('database-tests 확인 중');
      await run('database-tests', process.execPath, [tools.npm, '--prefix', 'scripts/database', 'test'], { timeout: timeout.check });
      for (const [label, script] of [['unit-tests', 'test'], ['typecheck', 'typecheck'], ['lint', 'lint'], ['export', 'export:check']]) {
        say(label + ' 확인 중');
        await run(label, process.execPath, [tools.npm, 'run', script], { cwd: mobileRoot, timeout: label === 'export' ? timeout.export : timeout.check });
      }
      assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
      assertPreviewUnchanged();
      if (apkState) assertStandaloneApkUnchanged(apkState);
      if (previewSession) {
        const started = Date.now();
        releaseScan = scanReleaseForPrivateData(path.join(mobileRoot, 'dist'), previewState, previewSession.token);
        checks.push({ label: 'private-preview-release-scan', exitCode: 0, milliseconds: Date.now() - started });
        previewBefore = await verifyPreviewHttp('private-preview-http-before');
      }
      say('공개 상품과 비공개 읽기 차단을 실제 REST GET으로 확인합니다.');
      catalogBefore = await verifyCatalogHttp('catalog-http-before');
      await ensurePortUnused();
      createdReverse = await prepareReverse();
      if (!receiptOnly && !readabilityOnly && !talkbackOnly) await verifyLoadingChoice();
      say('전용 Expo 서버와 새 실행 화면을 준비합니다.');
      expoServer = startLogged('expo-server', process.execPath, [tools.expo, 'start', '--localhost', '--port', String(port), '--clear'], {
        cwd: mobileRoot,
        env: previewEnvironment(pinnedCatalogEnvironment(catalogEnvironment, tools.env, runId), previewSession),
      });
      await waitForServer();
      if (previewSession) createdPreviewReverse = await prepareReverse(PREVIEW_PORT);
      await wakeScreenForUi();
      if (readabilityRequested && !apkState) {
        await verifyReadability();
        assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
        assertCatalogEnvironmentUnchanged(catalogEnvironment);
      }
      if (!readabilityOnly && !talkbackOnly) {
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
      }
      if (talkbackRequested) {
        await verifyTalkBack();
        assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
        assertCatalogEnvironmentUnchanged(catalogEnvironment);
      }
      if (interrupted) throw new Error('사용자가 검사를 중단했습니다.');
      assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
      assertPreviewUnchanged();
      catalogAfter = await verifyCatalogHttp('catalog-http-after', catalogBefore);
      if (previewSession) {
        previewAfter = await verifyPreviewHttp('private-preview-http-after');
        if (previewAfter.fingerprint !== previewBefore.fingerprint) throw new Error('검사 전후 미리보기 응답이 다릅니다.');
      }
      assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
    }
    if (apkState) {
      await verifyStandaloneOffline();
      assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
      assertCatalogEnvironmentUnchanged(catalogEnvironment);
      assertPreviewUnchanged();
    }
    // 복구 실패를 커밋 후에 알게 되지 않도록, 임시 화면 설정도 성공 기록 전에 되돌리고 확인합니다.
    await restoreScreenAwake();
    if (screenAwake.changeRequested && !['restored', 'preserved-current-value'].includes(screenAwake.restoreStatus)) {
      throw new Error('임시 화면 유지 설정의 복구를 확인하지 못해 기록과 커밋을 만들지 않습니다.');
    }
    if (interrupted) throw new Error('사용자가 검사를 중단했습니다.');
    assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
    assertCatalogEnvironmentUnchanged(catalogEnvironment);
    if (apkState) assertStandaloneApkUnchanged(apkState);
    // 부분 검사 성공은 전체 회귀 검증을 대신하지 않으므로 공개 보고서와 커밋을 만들지 않습니다.
    if (!receiptOnly && !standaloneOnly && !readabilityOnly && !talkbackOnly) {
      if (!loadingJunit) throw new Error('예시 선택 실기기 검사를 완료하지 않아 기록과 커밋을 만들지 않습니다.');
      if (apkState && !standaloneJunit) throw new Error('설치형 APK의 오프라인 검사를 완료하지 않아 기록과 커밋을 만들지 않습니다.');
      if (readabilityRequested && (!readabilityResult || !serializeDisplaySettings(displayState).restoration.verified
        || readabilityResult.applicationId !== (apkState?.applicationId ?? 'host.exp.exponent')
        || readabilityResult.runId !== (apkState?.buildNonce ?? runId))) {
        throw new Error('큰 글자·좁은 화면 검사와 설정 복구를 완료하지 않아 기록과 커밋을 만들지 않습니다.');
      }
      if (talkbackRequested) assertTalkBackEvidence();
      if (apkState) assertStandaloneApkUnchanged(apkState);
      writeReport('PASS');
      assertCatalogEnvironmentUnchanged(catalogEnvironment);
      assertPreviewUnchanged();
      if (apkState) assertStandaloneApkUnchanged(apkState);
      if (!noCommit) {
        const result = commitVerifiedChange({ repoRoot, state: gitState, reportPath, message });
        commit = result.commit;
      } else {
        assertGitStateUnchanged(repoRoot, gitState, { ignoreReport: true });
      }
    }
    overallStatus = 'passed';
    say(talkbackOnly ? 'TalkBack 부분 검사를 마쳤습니다. 전체 검증 기록과 커밋은 생성하지 않았습니다.'
      : readabilityOnly ? '큰 글자·좁은 화면 부분 검사를 마쳤습니다. 전체 검증 기록과 커밋은 생성하지 않았습니다.'
      : standaloneOnly ? '설치형 APK 부분 진단을 마치고 이번 진단 앱을 정리했습니다. 전체 검증 기록과 커밋은 생성하지 않았습니다.'
      : receiptOnly ? '영수증 부분 검사를 마쳤습니다. 전체 검증 기록과 커밋은 생성하지 않았습니다.' : '실기기 자동 검사와 기록을 마쳤습니다.' + (commit ? ' 로컬 커밋: ' + commit.slice(0, 12) : ' 새 커밋은 만들지 않았습니다.'));
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
      runId, scope: talkbackOnly ? 'talkback-only' : readabilityOnly ? 'readability-only' : standaloneOnly ? 'standalone-only' : receiptOnly ? 'receipt-only' : 'full', status: overallStatus, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
      device, sourceHash: gitState?.sourceHash, head: gitState?.head, checks, junit, commit, screenAwake,
      loadingChoice: (standaloneOnly || readabilityOnly || talkbackOnly) ? undefined : { runId: loadingRunId, junit: loadingJunit, scenario: 'pending-choice', networkSettingsChanged: false },
      catalog: { environmentFingerprint: catalogEnvironment?.fingerprint, before: catalogBefore, after: catalogAfter },
      privatePreview: { sourceFingerprint: previewState?.fingerprint, before: previewBefore, after: previewAfter, releaseScan },
      standalone: standaloneEvidence(),
      readability: { requested: readabilityRequested, result: readabilityResult, display: displayState ? serializeDisplaySettings(displayState) : undefined },
      talkback: { requested: talkbackRequested, result: talkbackResult },
    }, null, 2) + '\n');
    say('원본 기록: .artifacts/device/' + runId + '/');
  }
}
