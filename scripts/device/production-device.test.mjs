import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertProductionApksUnchanged, captureProductionApks, runProductionInstalled, checkProductionBrandingReview } from './production-device.mjs';

const id = 'com.ungjo.storeprice';
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-price-production-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const folder = 'device-apks-abc123';
  fs.mkdirSync(path.join(dir, folder, 'splits'), { recursive: true });
  const write = (file, content) => { fs.writeFileSync(path.join(dir, file), content); return hash(content); };
  const aab = { applicationId: id, versionName: '1.0.0', versionCode: '1', sha256: hash('aab') };
  const proof = { schemaVersion: 1, localSigning: 'temporary-device-test-key', bundletoolVersion: '1.18.3', ...aab, aabSha256: aab.sha256, signerCertificateSHA256: hash('certificate'),
    archivePath: folder + '/device.apks', deviceSpecPath: folder + '/device-spec.json',
    apks: ['base-master.apk', 'base-arm64_v8a.apk'].map((name) => {
      const file = folder + '/splits/' + name;
      return { path: file, sha256: write(file, name) };
    }) };
  proof.archiveSha256 = write(proof.archivePath, 'archive');
  proof.deviceSpecSha256 = write(proof.deviceSpecPath, 'spec');
  const save = () => write('device-apks.json', JSON.stringify(proof));
  save();
  const inspect = (file) => ({ splitName: file.endsWith('base-master.apk') ? 'base' : 'config.arm64_v8a', signerCertificateSHA256: hash('certificate') });
  const capture = (inspectApk = inspect) => captureProductionApks({ provenancePath: path.join(dir, 'provenance.json'), aab, inspectApk });
  return { proof, save, capture, write };
}

function device(state, { existing = false, mismatchAt = '', version = '1.0.0' } = {}) {
  const calls = [];
  const base = '/data/app/~~abc==' + '/' + id + '-id==/';
  const paths = ['base.apk', 'split_config.arm64_v8a.apk'].map((name) => base + name);
  let played = false;
  const adb = async (label, args) => {
    calls.push(args);
    const response = (stdout) => ({ stdout, code: 0 });
    if (args[0] === 'install-multiple') return response('Success');
    if (args.includes('get-current-user')) return response('10');
    if (args.includes('list')) return response(['package:' + id + '.inspection', ...(existing ? ['package:' + id] : [])].join('\n'));
    if (args.includes('path')) return response(paths.map((file) => 'package:' + file).reverse().join('\n'));
    if (args.includes('sha256sum')) {
      const digest = (mismatchAt === 'before' || (mismatchAt === 'after' && played))
        ? hash('unknown') : state.apks[paths.indexOf(args.at(-1))].sha256;
      return response(digest + '  ' + args.at(-1));
    }
    if (args.includes('dumpsys')) return response('Packages:\n  Package [' + id + '] (abcd):\n    versionCode=1 minSdk=26\n    versionName=' + version + '\n    User 10: installed=true');
    throw Error('예상하지 못한 명령 ' + label);
  };
  return { calls, adb, verifyInstalled: async () => { played = true; }, played: () => played };
}

for (const existing of [false, true]) {
  test('정식 앱을 ' + (existing ? '정확한 설치 파일로 재사용한다' : '사용자 지정·교체 금지로 설치한다'), async (t) => {
    const state = fixture(t).capture();
    const target = device(state, { existing });
    const result = await runProductionInstalled({ state, ...target });
    assert.equal(result.installationMode, existing ? 'reused-exact' : 'fresh');
    assert.equal(result.verifiedApks, 2);
    assert.equal(result.verifyInstalledStatus, 'passed');
    const installs = target.calls.filter((args) => args[0].startsWith('install'));
    assert.deepEqual(installs, existing ? [] : [['install-multiple', '-R', '--user', '10', ...state.apks.map((apk) => apk.path)]]);
    assert.equal(target.calls.filter((args) => args.includes('sha256sum')).length, 4);
  });
}

test('같은 식별자의 기존 앱이 다르면 설치나 조작 전에 중단한다', async (t) => {
  const state = fixture(t).capture();
  for (const options of [{ mismatchAt: 'before' }, { version: '2.0.0' }]) {
    const target = device(state, { existing: true, ...options });
    await assert.rejects(runProductionInstalled({ state, ...target }));
    assert.equal(target.played(), false);
    assert.equal(target.calls.some((args) => args[0].startsWith('install')), false);
  }
});

test('놀이 후 설치된 분할 APK 중 한 개라도 바뀌면 실패한다', async (t) => {
  const state = fixture(t).capture();
  const target = device(state, { existing: true, mismatchAt: 'after' });
  await assert.rejects(runProductionInstalled({ state, ...target }), /설치 파일/u);
  assert.equal(target.played(), true);
});

test('설치 전에 APK 자체의 서명과 기본 분할을 대조한다', (t) => {
  const f = fixture(t);
  assert.throws(() => f.capture(() => ({ signerCertificateSHA256: hash('other'), splitName: 'base' })), /서명/u);
  assert.throws(() => f.capture(() => ({ signerCertificateSHA256: hash('certificate'), splitName: 'same' })), /분할/u);
});

test('잘못된 AAB 지문·외부 파일·중복 APK를 거부한다', (t) => {
  const { proof, save, capture } = fixture(t);
  const original = structuredClone(proof);
  for (const change of [() => { proof.aabSha256 = hash('other'); },
    () => { proof.apks[0].path = '../another.apk'; }, () => { proof.apks[0] = proof.apks[1]; }]) {
    Object.assign(proof, structuredClone(original));
    change(); save();
    assert.throws(capture);
  }
});

test('육안 확인을 현재 실행과 실제로 열어본 프레임의 지문에 묶는다', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-price-branding-review-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (name, content) => { const target = path.join(dir, name); fs.writeFileSync(target, content); return target; };
  const frame = write('frame-0001200ms.jpg', 'splash');
  const capture = { coldStart: write('recording.mp4', 'movie'), sourceSha256: hash('movie'),
    appInfo: write('app-info.png', 'icon'), appInfoSha256: hash('icon') };
  capture.framesManifest = write('frames.json', JSON.stringify({ sourcePath: capture.coldStart, sourceSha256: capture.sourceSha256,
    sourceUnchanged: true, frames: [{ path: frame, sha256: hash('splash') }] }));
  const review = { runId: 'current-run', aabSha256: hash('aab'), sourceSha256: capture.sourceSha256,
    appInfoSha256: capture.appInfoSha256, splashFrame: path.basename(frame), iconConfirmed: true, splashConfirmed: true };
  const verify = (record) => checkProductionBrandingReview({ capture, runId: review.runId, aabSha256: review.aabSha256,
    reviewPath: write('branding-review.json', JSON.stringify(record)) });
  assert.equal(verify(review).frameSha256, hash('splash'));
  for (const change of [{ runId: 'old' }, { aabSha256: hash('another') }, { splashFrame: '../another.png' }, { splashConfirmed: false }]) {
    assert.throws(() => verify({ ...review, ...change }));
  }
  write(review.splashFrame, 'different');
  assert.throws(() => verify(review));
});

test('설치 파일, 묶음, 사양 또는 증빙이 검사 도중 변경되면 실패한다', (t) => {
  for (const choose of [(proof) => proof.apks[0].path, (proof) => proof.archivePath, (proof) => proof.deviceSpecPath, () => 'device-apks.json']) {
    const f = fixture(t);
    const state = f.capture();
    f.write(choose(f.proof), 'changed');
    assert.throws(() => assertProductionApksUnchanged(state));
  }
});
