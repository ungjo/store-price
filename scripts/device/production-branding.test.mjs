import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureProductionBranding } from './production-branding.mjs';

const production = 'com.ungjo.storeprice';
const settings = 'com.android.settings';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture(t, { pinned = false, interruptAfterLaunch = false, corruptVideo = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'store-price-branding-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const mp4 = Buffer.alloc(1024);
  mp4.write('ftyp', 4);
  const file = (name) => name.endsWith('.mp4') ? mp4 : png;
  const pulls = [], cleanups = [];
  let foreground = settings;
  const adb = async (label, args) => {
    const reply = (stdout = '') => ({ code: 0, stdout, stderr: '' });
    if (args[0] === 'pull') {
      pulls.push(path.basename(args[2]));
      fs.writeFileSync(args[2], file(args[2]));
      return reply();
    }
    assert.equal(args[0], 'shell');
    if (args[1] === 'cmd') {
      return reply(args.includes('android.settings.APPLICATION_DETAILS_SETTINGS')
        ? settings + '/.Settings$AppInfo' : production + '/.MainActivity');
    }
    if (args[1] === 'am') {
      if (args[2] === 'get-current-user') return reply('0');
      if (args[2] === 'start') {
        foreground = args.includes('android.intent.category.LAUNCHER') ? production : settings;
        return reply('Status: ok\nLaunchState: COLD');
      }
      if (args[2] === 'force-stop') return reply();
    }
    if (args[1].startsWith('dumpsys window')) {
      const pkg = interruptAfterLaunch && label.endsWith('after-recording') ? 'other.app' : foreground;
      return reply('mCurrentFocus=Window{abc u0 ' + pkg + '/.UI}\nvisible-mode=fullscreen' +
        (pinned ? '\nvisible-mode=pinned' : ''));
    }
    if (args[1].startsWith('if [ -s')) return reply('ready');
    if (args[1] === 'sha256sum') {
      const digest = corruptVideo && args[2].endsWith('.mp4') ? '0'.repeat(64) : hash(file(args[2]));
      return reply(digest + '  ' + args[2]);
    }
    if (['rm', 'rmdir'].includes(args[1])) cleanups.push(args);
    else if (!['mkdir', 'screencap', 'screenrecord'].includes(args[1]) && !args[1].startsWith('pidof ')) {
      assert.fail('Unexpected ADB command ' + args.join(' '));
    }
    return reply();
  };
  const run = async (_label, executable, args) => {
    assert.equal(executable, 'powershell.exe');
    const framesDir = args[args.indexOf('-OutputDirectory') + 1];
    const times = args[args.indexOf('-TimesMs') + 1].split(',').map(Number);
    assert.ok(times.every((time) => time < 940));
    fs.mkdirSync(framesDir);
    fs.writeFileSync(path.join(framesDir, 'frames.json'), JSON.stringify({ sourceSha256: hash(mp4),
      durationMs: 940, sourceUnchanged: true, frames: times.map((requestedTimeMs) => ({ requestedTimeMs })) }));
  };
  return { capture: () => captureProductionBranding({ directory, run, adb }), directory, pulls, cleanups };
}

test('원본 해시를 보존하고 실제 MP4 재생 시간까지만 프레임을 추출한다', async (t) => {
  const f = fixture(t);
  const result = await f.capture();
  assert.deepEqual(f.pulls, ['system-app-info.png', 'cold-start.mp4', 'after-cold-start.png']);
  assert.equal(result.applicationId, production);
  assert.equal(result.visualReview, 'pending');
  assert.equal(result.sourceSha256, hash(fs.readFileSync(result.coldStart)));
  const frames = JSON.parse(fs.readFileSync(result.framesManifest, 'utf8')).frames;
  assert.deepEqual(frames.map((frame) => frame.requestedTimeMs), [150, 300, 450, 600, 750, 900]);
  assert.equal(f.cleanups.length, 2);
});

test('작은 창이 화면에 겹치면 스크린샷과 녹화를 시작하지 않는다', async (t) => {
  const f = fixture(t, { pinned: true });
  await assert.rejects(f.capture(), /화면 맨 앞/u);
  assert.deepEqual(f.pulls, []);
  assert.equal(f.cleanups.length, 2);
});

test('녹화 중 다른 앱이 앞에 오면 녹화를 PC로 가져오지 않는다', async (t) => {
  const f = fixture(t, { interruptAfterLaunch: true });
  await assert.rejects(f.capture(), /화면 맨 앞/u);
  assert.deepEqual(f.pulls, ['system-app-info.png']);
  assert.equal(f.cleanups.length, 2);
});

test('녹화 원본과 받은 파일 해시가 다르면 시각 검토 기록을 만들지 않는다', async (t) => {
  const f = fixture(t, { corruptVideo: true });
  await assert.rejects(f.capture(), /SHA-256/u);
  assert.equal(fs.existsSync(path.join(f.directory, 'production-branding', 'capture.json')), false);
  assert.equal(f.cleanups.length, 2);
});
