import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const appId = 'com.ungjo.storeprice';
const settings = 'com.android.settings';
const frameHelper = fileURLToPath(new URL('./video-frames.ps1', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pngMagic = '89504e470d0a1a0a';

function resolvedComponent(output, target) {
  const lines = output.split(/\r?\n/u).map((line) => line.trim());
  const components = lines.filter((line) => /^[\w.]+\/[\w.$]+$/u.test(line));
  if (components.length !== 1 || components[0].split('/')[0] !== target) {
    throw new Error('요청한 Android 패키지의 화면을 확인하지 못했습니다.');
  }
  // Settings$... 같은 중첩 액티비티를 기기 셸이 변수로 해석하지 않게 합니다.
  return "'" + components[0] + "'";
}

function assertStarted(output, cold = false) {
  if (!/^Status:\s*ok\s*$/mu.test(output) || /Error|Exception/u.test(output) ||
      (cold && /Warning: Activity not started|LaunchState:\s*(?:WARM|HOT)/u.test(output))) {
    throw new Error('요청한 Android 화면의 시작을 확인하지 못했습니다.');
  }
}

export async function captureProductionBranding({ adb, run, directory }) {
  const out = path.join(path.resolve(directory), 'production-branding');
  fs.mkdirSync(out);
  const remote = '/data/local/tmp/store-price-production-' + randomUUID();
  const video = 'cold-start.mp4';
  const appInfo = 'system-app-info.png';
  const afterStart = 'after-cold-start.png';
  const names = [appInfo, video, afterStart];
  const shell = async (label, args, options) => {
    const result = await adb('production-branding-' + label, ['shell', ...args], options);
    if (result.stderr?.trim()) throw new Error('화면 자료 수집 중 Android 오류가 발생했습니다 (' + label + ').');
    return result.stdout.trim();
  };
  const focus = async (pkg, label) => {
    // 전체 창 목록을 저장하지 않고 해당 프로필의 앱 또는 앱 정보 창에만 초점을 허용합니다.
    const query = "dumpsys window | sed -n -e '/mCurrentFocus=/p' "
      + "-e '/[*] Task{.* visible=true /s/.* mode=\\([^ ]*\\).*/visible-mode=\\1/p'";
    const output = await shell(label, [query]);
    const windows = [...output.matchAll(/mCurrentFocus=Window\{[^\r\n{}]*\bu(\d+)\s+([\w.]+)\/[^{}\r\n]+\}/gu)];
    const modes = output.split(/\r?\n/u).filter((line) => line.startsWith('visible-mode='));
    if (windows.length !== 1 || windows[0][1] !== user || windows[0][2] !== pkg ||
        modes.length !== 1 || modes[0] !== 'visible-mode=fullscreen') {
      throw new Error('캡처할 앱이 화면 맨 앞에 있지 않습니다 (' + label + ').');
    }
  };
  const pullVerified = async (name) => {
    const remotePath = remote + '/' + name;
    const deviceHash = await shell(name + '-sha256', ['sha256sum', remotePath]);
    const local = path.join(out, name);
    await adb('production-branding-pull-' + name, ['pull', remotePath, local]);
    const bytes = fs.readFileSync(local);
    const digest = sha256(bytes);
    if (![digest + '  ' + remotePath, digest + ' ' + remotePath].includes(deviceHash)) {
      throw new Error('기기에서 받은 화면 자료의 SHA-256이 달라졌습니다.');
    }
    const isVideo = name === video;
    if (isVideo ? bytes.length < 1024 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp' :
        bytes.subarray(0, 8).toString('hex') !== pngMagic) {
      throw new Error('녹화 파일 또는 화면 캡처 형식을 확인하지 못했습니다.');
    }
    return digest;
  };
  const screenshot = async (name, pkg) => {
    await focus(pkg, name + '-before');
    await shell(name, ['screencap', '-p', remote + '/' + name]);
    await focus(pkg, name + '-after');
    return pullVerified(name);
  };

  const user = await shell('user', ['am', 'get-current-user']);
  if (!/^(?:0|[1-9]\d{0,5})$/u.test(user)) throw new Error('현재 Android 프로필을 확인하지 못했습니다.');
  const detailsIntent = ['-a', 'android.settings.APPLICATION_DETAILS_SETTINGS', '-d', 'package:' + appId];
  const launchIntent = ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER'];
  const resolve = (label, intent) => shell(label, ['cmd', 'package', 'resolve-activity', '--brief', '--user', user, ...intent]);
  const details = resolvedComponent(await resolve('resolve-settings', detailsIntent), settings);
  const launcher = resolvedComponent(await resolve('resolve-launcher', [...launchIntent, '-p', appId]), appId);

  // 검사 실행이 소유한 빈 폴더만 사용합니다. 사용자의 갤러리와 앱 데이터는 건드리지 않습니다.
  await shell('mkdir', ['mkdir', remote]);
  let recording;
  let recordingDone = false;
  let infoHash, sourceSha256, afterHash, launchRequestedAfterRecorderSpawnMs;
  try {
    assertStarted(await shell('open-info', ['am', 'start', '-W', '--user', user, '-n', details, ...detailsIntent]));
    await pause(700);
    infoHash = await screenshot(appInfo, settings);
    await shell('stop', ['am', 'force-stop', '--user', user, appId]);
    // pidof의 '대상 없음'(종료 코드 1)일 때만 콜드 스타트로 기록합니다.
    await shell('process-absent', ['pidof ' + appId + ' >/dev/null; test $? -eq 1']);
    await focus(settings, 'before-recording');
    const started = Date.now();
    const videoPath = remote + '/' + video;
    recording = shell('screenrecord', ['screenrecord', '--time-limit', '7', videoPath], { timeout: 25000 })
      .then(() => ({}), (error) => ({ error })).finally(() => { recordingDone = true; });
    let ready = false;
    for (let attempt = 0; attempt < 18 && !ready; attempt++) {
      await pause(120);
      ready = await shell('video-ready', ['if [ -s ' + videoPath + ' ]; then echo ready; fi']) === 'ready';
    }
    if (!ready || Date.now() - started > 4500) throw new Error('앱 시작 전에 녹화 시작을 확인하지 못했습니다.');
    launchRequestedAfterRecorderSpawnMs = Date.now() - started;
    assertStarted(await shell('cold-start', ['am', 'start', '-W', '--user', user, '-n', launcher, ...launchIntent]), true);
    await pause(350);
    // 녹화 중 다른 앱·분할 화면·작은 동영상 창이 나타나면 해당 영상을 PC로 가져오지 않습니다.
    while (!recordingDone) {
      await focus(appId, 'during-recording');
      await pause(400);
    }
    const result = await recording;
    if (result.error) throw result.error;
    await focus(appId, 'after-recording');
    sourceSha256 = await pullVerified(video);
    afterHash = await screenshot(afterStart, appId);
  } finally {
    if (recording) await recording;
    // 이 실행에서 이름을 정한 세 파일만 지우고, 빈 임시 디렉터리를 제거합니다.
    await shell('clean-files', ['rm', '-f', '--', ...names.map((name) => remote + '/' + name)], { cleanup: true });
    await shell('clean-directory', ['rmdir', remote], { cleanup: true });
  }

  // 화면이 멈추면 Android 녹화는 요청한 7초보다 짧은 MP4를 만들 수 있습니다.
  // 첫 프레임에서 읽은 실제 길이로 범위를 제한한 뒤 전환 구간을 150ms씩 확인합니다.
  const extract = (name, times) => run('production-branding-' + name, 'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', frameHelper,
      '-VideoPath', path.join(out, video), '-OutputDirectory', path.join(out, name),
      '-TimesMs', times.join(','), '-Width', '800'], { timeout: 180000 });
  await extract('first-frame', [0]);
  const first = JSON.parse(fs.readFileSync(path.join(out, 'first-frame', 'frames.json'), 'utf8'));
  if (first.sourceSha256 !== sourceSha256 || !Number.isFinite(first.durationMs) || first.durationMs <= 150) {
    throw new Error('녹화 원본에서 시작 화면을 확인할 구간이 부족합니다.');
  }
  const times = Array.from({ length: 37 }, (_, index) => (index + 1) * 150).filter((ms) => ms < first.durationMs);
  const frameDir = path.join(out, 'frames');
  await extract('frames', times);
  const framesManifest = path.join(frameDir, 'frames.json');
  const frames = JSON.parse(fs.readFileSync(framesManifest, 'utf8'));
  if (frames.sourceSha256 !== sourceSha256 || !frames.sourceUnchanged || frames.frames.length !== times.length) {
    throw new Error('추출한 시작 화면 프레임이 기기 녹화 원본과 일치하지 않습니다.');
  }
  const capture = { applicationId: appId, directory: out, appInfo: path.join(out, appInfo), coldStart: path.join(out, video),
    afterStart: path.join(out, afterStart), framesManifest, captureManifest: path.join(out, 'capture.json'),
    sourceSha256, appInfoSha256: infoHash, afterStartSha256: afterHash, launchRequestedAfterRecorderSpawnMs,
    visualReview: 'pending' };
  fs.writeFileSync(capture.captureManifest, JSON.stringify(capture, null, 2) + '\n', { flag: 'wx' });
  return capture;
}
