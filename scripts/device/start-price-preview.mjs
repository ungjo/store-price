import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCatalogEnvironmentUnchanged, captureCatalogEnvironment, catalogProjectRef,
  createCatalogLogWriter, pinnedCatalogEnvironment, redactCatalogText,
} from './catalog-http-check.mjs';
import {
  assertPrivatePreviewUnchanged, capturePrivatePreview, checkPrivatePreviewHttp,
  PREVIEW_PORT, previewEnvironment, startPrivatePreviewServer,
} from './private-price-preview.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mobileRoot = path.join(repoRoot, 'apps/mobile');
const expoPort = 8093;
const snapshotPath = '.artifacts/catalog/private-preview.json';
const runId = 'preview-' + Date.now() + '-' + randomBytes(4).toString('hex');
const adbPath = path.join(process.env.LOCALAPPDATA || '', 'store-price-tools/platform-tools/adb.exe');
const ownReverses = [];
let selectedSerial;
let catalogEnvironment;
let snapshot;
let session;
let expo;
let monitor;
let stopping = false;
let stopReason;
let finish;
const finished = new Promise((resolve) => { finish = resolve; });

function say(message) { console.log('[가격 미리보기] ' + message); }
function safe(error) {
  return redactCatalogText(catalogEnvironment, error instanceof Error ? error.message : String(error))
    .replaceAll(session?.token || '\0', '<임시 연결 값>')
    .replaceAll(selectedSerial || '\0', '<휴대전화>').slice(0, 600);
}
function adb(args) {
  const result = spawnSync(adbPath, selectedSerial ? ['-s', selectedSerial, ...args] : args, {
    windowsHide: true, encoding: 'utf8', timeout: 15_000, maxBuffer: 262_144,
  });
  if (result.error || result.status !== 0) throw new Error('USB 연결 명령에 실패했습니다. 연결과 디버깅 허용 상태를 확인해 주세요.');
  return result.stdout;
}
function reverseTarget(list, port) {
  for (const row of list.trim().split(/\r?\n/u)) {
    const fields = row.trim().split(/\s+/u);
    if (fields.at(-2) === 'tcp:' + port) return fields.at(-1);
  }
  return null;
}
function connectUsb(port) {
  const previous = reverseTarget(adb(['reverse', '--list']), port);
  if (previous && previous !== 'tcp:' + port) throw new Error('다른 USB 포트 연결이 사용 중입니다. 기존 연결은 변경하지 않았습니다.');
  if (!previous) {
    adb(['reverse', '--no-rebind', 'tcp:' + port, 'tcp:' + port]);
    ownReverses.push(port);
  }
}
async function requireUnusedPort(port) {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () => reject(new Error('미리보기 포트 ' + port + '가 사용 중입니다. 기존 서버를 확인해 주세요.')));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
}
function stop(error) {
  if (stopping) return;
  stopping = true;
  stopReason = error;
  finish();
}
async function cleanup() {
    clearInterval(monitor);
    // 이번 실행이 시작한 Expo 프로세스만 종료합니다. 일반 개발 서버 8082는 건드리지 않습니다.
    if (expo?.pid && expo.exitCode === null && expo.signalCode === null) {
      if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(expo.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 15_000 });
      } else expo.kill('SIGTERM');
    }
    if (session) {
      try { await session.close(); } catch { say('가격 서버 종료 상태를 확인해 주세요.'); }
    }
    for (const port of ownReverses.reverse()) {
      try {
        // 사용자가 실행 중 연결을 바꿨으면 새 연결을 지우지 않습니다.
        if (reverseTarget(adb(['reverse', '--list']), port) === 'tcp:' + port) adb(['reverse', '--remove', 'tcp:' + port]);
      } catch { say('USB 포트 ' + port + ' 정리를 확인하지 못했습니다.'); }
    }
    if (stopReason) { console.error('[가격 미리보기] ' + safe(stopReason)); process.exitCode = 1; }
    else say('미리보기를 종료했습니다. 일반 개발 서버는 유지됩니다.');
}

process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });

try {
  if (process.argv.length > 2) throw new Error('추가 인자 없이 npm run start:price-preview를 실행해 주세요.');
  if (!fs.existsSync(adbPath)) throw new Error('휴대전화 연결 도구를 찾지 못했습니다. device:doctor로 확인해 주세요.');
  const ignored = spawnSync('git', ['check-ignore', '--quiet', snapshotPath], { cwd: repoRoot, windowsHide: true });
  if (ignored.status !== 0) throw new Error('비공개 가격 자료의 Git 제외 설정을 먼저 확인해 주세요.');
  const devices = adb(['devices']).trim().split(/\r?\n/u).slice(1)
    .map((line) => line.trim().split(/\s+/u)).filter((parts) => parts.length >= 2);
  if (devices.length !== 1 || devices[0][1] !== 'device') throw new Error('갤럭시 한 대를 USB로 연결하고 USB 디버깅을 허용해 주세요.');
  selectedSerial = devices[0][0];
  const policy = adb(['shell', 'dumpsys', 'window', 'policy']);
  if (/\b(?:showing|inputRestricted)=true/u.test(policy)) throw new Error('휴대전화 화면을 켜고 잠금을 해제한 뒤 다시 실행해 주세요.');
  catalogEnvironment = captureCatalogEnvironment(mobileRoot);
  snapshot = capturePrivatePreview(repoRoot, snapshotPath, catalogProjectRef(catalogEnvironment));
  await requireUnusedPort(expoPort);
  if (stopping) throw new Error('미리보기 시작을 중단했습니다.');
  session = await startPrivatePreviewServer(snapshot, { sessionId: runId });
  if (stopping) throw new Error('미리보기 시작을 중단했습니다.');
  await checkPrivatePreviewHttp(session);
  if (stopping) throw new Error('미리보기 시작을 중단했습니다.');
  connectUsb(PREVIEW_PORT);
  connectUsb(expoPort);
  const env = previewEnvironment(pinnedCatalogEnvironment(catalogEnvironment, { ...process.env, CI: '1' }, runId), session);
  expo = spawn(process.execPath, [path.join(mobileRoot, 'node_modules/expo/bin/cli'), 'start', '--localhost', '--port', String(expoPort), '--clear'], {
    cwd: mobileRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const writeLog = (text) => process.stdout.write(text.replaceAll(session.token, '<임시 연결 값>'));
  // 두 출력 흐름의 UTF-8 조각을 따로 조합해 오류 출력과 일반 출력이 서로 끼어들지 않게 합니다.
  const outWriter = createCatalogLogWriter(catalogEnvironment, writeLog);
  const errWriter = createCatalogLogWriter(catalogEnvironment, writeLog);
  expo.stdout.on('data', (chunk) => outWriter.write(chunk));
  expo.stderr.on('data', (chunk) => errWriter.write(chunk));
  expo.on('error', () => { void stop(new Error('미리보기 앱 서버를 시작하지 못했습니다.')); });
  expo.on('close', (code) => {
    outWriter.end();
    errWriter.end();
    if (!stopping) void stop(new Error('미리보기 앱 서버가 종료되었습니다. 종료 코드: ' + code));
  });
  const deadline = Date.now() + 180_000;
  let ready = false;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:' + expoPort + '/status', { signal: AbortSignal.timeout(1500) });
      if (response.ok && (await response.text()).includes('packager-status:running')) { ready = true; break; }
    } catch { /* 서버 준비 중에는 짧게 기다린 뒤 이번 실행의 상태만 다시 확인합니다. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready || stopping) throw new Error('미리보기 앱 서버의 준비가 완료되지 않았습니다.');
  assertPrivatePreviewUnchanged(snapshot);
  assertCatalogEnvironmentUnchanged(catalogEnvironment);
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:' + expoPort, '-p', 'host.exp.exponent']);
  say('갤럭시 Expo Go를 열었습니다. 위쪽의 실제 가격 미리보기를 눌러 주세요.');
  say('DB에서 조회한 기록 ' + snapshot.productCount + '개를 읽기 전용으로 표시합니다. 이 창과 USB 연결을 유지해 주세요.');
  say('종료하려면 Ctrl+C를 누르세요. 가격 자료의 자동 갱신은 수행하지 않습니다.');
  // 설정이나 조회 파일이 바뀌면 이전 자료와 새 자료가 섞이지 않도록 재실행을 요구합니다.
  monitor = setInterval(() => {
    try { assertPrivatePreviewUnchanged(snapshot); assertCatalogEnvironmentUnchanged(catalogEnvironment); }
    catch (error) { void stop(error); }
  }, 5000);
  await finished;
} catch (error) {
  stop(error);
} finally {
  // 시작 중 중단되어도 진행 중이던 연결 생성이 끝난 뒤 한곳에서 정리해 서버를 남기지 않습니다.
  await cleanup();
}
