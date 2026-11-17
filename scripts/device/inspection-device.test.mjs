import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInspectionInstalled } from './inspection-device.mjs';

const appId = 'com.ungjo.storeprice.inspection';
const buildNonce = 'inspection-0123456789abcdef';

function harness(t, options = {}) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'store-price-inspection-device-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), parent);
    assert.ok(path.basename(root).startsWith('store-price-inspection-device-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const apkPath = path.join(root, 'fixture.apk');
  fs.writeFileSync(apkPath, 'APK fixture bytes, never installed on a real device');
  const sha256 = createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex');
  const apkState = { kind: 'inspection', apkPath, sha256, applicationId: appId, buildNonce, versionName: '1.0.0', versionCode: '1', signerCertificateSHA256: 'a'.repeat(64) };
  const installedPath = '/data/app/~~abc/com.example==/base.apk';
  const state = { installed: options.existing === true, installedHash: options.installedHash ?? sha256,
    versionName: options.versionName ?? '1.0.0', versionCode: options.versionCode ?? '1', user: '0' };
  const calls = [];
  const adb = async (label, args, opts) => {
    calls.push({ label, args, opts });
    options.beforeAdb?.({ label, args, state });
    const custom = options.result?.({ label, args, state });
    if (custom) return custom;
    const command = args.join(' ');
    let stdout = '';
    if (command === 'shell am get-current-user') stdout = state.user;
    else if (command.startsWith('shell pm list packages')) {
      assert.deepEqual(args, ['shell', 'pm', 'list', 'packages', '-u', '--user', '0', appId]);
      stdout = state.installed ? 'package:' + appId : options.relatedPackage ? 'package:' + appId + '.other' : '';
    } else if (args[0] === 'install') {
      assert.deepEqual(args, ['install', options.update ? '-r' : '-R', '--user', '0', apkPath]);
      assert.equal(opts.timeout, 180_000);
      if (options.installThrows) throw new Error('installation pending or rejected');
      if (options.globalOtherUser) return { stdout: '', stderr: 'INSTALL_FAILED_ALREADY_EXISTS', code: 1 };
      state.installed = true;
      if (options.update) {
        state.installedHash = apkState.sha256;
        state.versionName = apkState.versionName;
        state.versionCode = String(apkState.versionCode);
      }
      stdout = 'Performing Streamed Install\nSuccess\n';
    } else if (command.startsWith('shell pm path')) {
      assert.deepEqual(args, ['shell', 'pm', 'path', '--user', '0', appId]);
      stdout = state.installed ? 'package:' + installedPath : '';
    } else if (command.startsWith('shell sha256sum')) {
      stdout = state.installedHash + '  ' + installedPath;
    } else if (command === 'shell dumpsys package ' + appId) {
      stdout = 'Packages:\n  Package [' + appId + '] (abc):\n'
        + '    versionCode=' + state.versionCode + ' minSdk=24 targetSdk=36\n'
        + '    versionName=' + state.versionName + '\n'
        + '    User 0: installed=' + state.installed + ' hidden=false notLaunched=false\n';
    } else assert.fail('Unexpected device command: ' + command);
    return { stdout, stderr: '', code: 0 };
  };
  let verified = 0;
  const verifyInstalled = async () => { verified += 1; await options.verify?.({ state, apkState, calls }); };
  return { root, apkState, state, calls, verified: () => verified, adb, verifyInstalled,
    execute: (overrides = {}) => runInspectionInstalled({ adb, apkState, verifyInstalled, ...overrides }) };
}

test('fresh installation is current-user only and awaits native verification before returning', async (t) => {
  let callbackFinished = false;
  const h = harness(t, { verify: async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    callbackFinished = true;
  } });
  const result = await h.execute();
  assert.equal(callbackFinished, true);
  assert.equal(result.installationMode, 'fresh');
  assert.equal(result.installedFresh, true);
  assert.equal(result.installedHashVerified, true);
  assert.equal(result.installStatus, 'verified');
  assert.equal(result.verifyInstalledStatus, 'passed');
  assert.equal(result.versionCode, 1);
  assert.equal(result.firstLaunchOffline, false);
  assert.equal(result.networkSettingsChanged, false);
  assert.equal(result.installationCleanup, 'preserved');
  assert.equal(h.verified(), 1);
  assert.equal(h.state.installed, true);
  assert.equal(h.calls.some(({ args }) => args.includes('uninstall') || args.includes('clear') || args.includes('svc') || args.includes('-r')), false);
});

test('already installed fixed package is preserved unless exact reuse is explicitly selected', async (t) => {
  const h = harness(t, { existing: true });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.inspection.installationMode, 'existing-refused');
    assert.equal(error.inspection.verifyInstalledStatus, 'not-run');
    return /이미 있습니다/u.test(error.message);
  });
  assert.equal(h.verified(), 0);
  assert.equal(h.calls.some(({ args }) => args[0] === 'install'), false);
});

test('explicit exact reuse checks installed APK and version without replacing or clearing it', async (t) => {
  const h = harness(t, { existing: true });
  const result = await h.execute({ allowMatchingInstall: true });
  assert.equal(result.installationMode, 'reused-exact');
  assert.equal(result.installedFresh, false);
  assert.equal(result.installedHashVerified, true);
  assert.equal(result.verifyInstalledStatus, 'passed');
  assert.equal(h.calls.some(({ args }) => args[0] === 'install' || args.includes('uninstall') || args.includes('clear')), false);
});

test('different APK hash or version is not reused or overwritten', async (t) => {
  for (const options of [
    { installedHash: '0'.repeat(64) }, { versionName: '0.1.0' }, { versionCode: '2' },
  ]) {
    const h = harness(t, { existing: true, ...options });
    await assert.rejects(h.execute({ allowMatchingInstall: true }), /현재 설치된 앱|버전/u);
    assert.equal(h.verified(), 0);
    assert.equal(h.calls.some(({ args }) => args[0] === 'install'), false);
  }
});

test('production, nonce package, bad run IDs and tampered local APK are refused before ADB', async (t) => {
  for (const change of [
    { kind: 'standalone' },
    { applicationId: 'com.ungjo.storeprice' },
    { applicationId: 'com.ungjo.storeprice.offline.b0123456789abcdef' },
    { buildNonce: 'standalone-0123456789abcdef' },
    { buildNonce: buildNonce + '\n' },
    { sha256: '0'.repeat(64) },
    { versionCode: '0' },
    { versionCode: '01' },
    { versionName: '1.0.0\n' },
  ]) {
    const h = harness(t); Object.assign(h.apkState, change);
    await assert.rejects(h.execute());
    assert.equal(h.calls.length, 0);
  }
  const h = harness(t); fs.appendFileSync(h.apkState.apkPath, 'modified');
  await assert.rejects(h.execute(), /원본/u);
  assert.equal(h.calls.length, 0);
});

test('invalid callback and reuse option cannot touch the device', async (t) => {
  const h = harness(t);
  await assert.rejects(h.execute({ verifyInstalled: null }));
  await assert.rejects(h.execute({ allowMatchingInstall: 'true' }));
  assert.equal(h.calls.length, 0);
});

test('current-user package query errors and malformed output cannot become absence evidence', async (t) => {
  for (const answer of [
    { stdout: '', stderr: 'SecurityException', code: 0 },
    { stdout: '', stderr: '', code: 1 },
    { stdout: 'Error: permission denied', stderr: '', code: 0 },
    { stdout: '', stderr: '', exitCode: 1 },
  ]) {
    const h = harness(t, { result: ({ label }) => label === 'inspection-package-before' ? answer : undefined });
    await assert.rejects(h.execute());
    assert.equal(h.calls.some(({ args }) => args[0] === 'install'), false);
  }
});

test('related package name is not mistaken for this inspection package', async (t) => {
  const h = harness(t, { relatedPackage: true });
  assert.equal((await h.execute()).installationMode, 'fresh');
});

test('another-user global installation is protected by install -R without enumerating profiles', async (t) => {
  const h = harness(t, { globalOtherUser: true });
  await assert.rejects(h.execute(), (error) => error.inspection.installStatus === 'failed-or-unconfirmed');
  assert.equal(h.verified(), 0);
  assert.equal(h.calls.filter(({ args }) => args.includes('--user')).every(({ args }) => args[args.indexOf('--user') + 1] === '0'), true);
});

test('Play Protect or installation timeout records uncertainty and does not uninstall', async (t) => {
  const h = harness(t, { installThrows: true });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.inspection.installationMode, 'fresh-requested');
    assert.equal(error.inspection.installStatus, 'failed-or-unconfirmed');
    assert.equal(error.inspection.installedFresh, false);
    assert.equal(error.inspection.installedHashVerified, false);
    return true;
  });
  assert.equal(h.calls.some(({ args }) => args.includes('uninstall')), false);
});

test('a claimed install success still requires exact on-device hash and metadata', async (t) => {
  const h = harness(t, { installedHash: 'f'.repeat(64) });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.inspection.installStatus, 'failed-or-unconfirmed');
    return /현재 설치된 앱/u.test(error.message);
  });
  assert.equal(h.verified(), 0);
  assert.equal(h.state.installed, true);
});

test('callback failure including rejection without error preserves the installed app', async (t) => {
  for (const verify of [
    () => { throw new Error('native test failed'); },
    () => Promise.reject(),
  ]) {
    const h = harness(t, { verify });
    await assert.rejects(h.execute(), (error) => {
      assert.equal(error.inspection.verifyInstalledStatus, 'failed');
      assert.equal(error.inspection.installationCleanup, 'preserved');
      return true;
    });
    assert.equal(h.state.installed, true);
    assert.equal(h.calls.some(({ args }) => args.includes('uninstall')), false);
  }
});

test('local or installed APK changing during the native callback prevents success', async (t) => {
  for (const verify of [
    ({ apkState }) => fs.appendFileSync(apkState.apkPath, 'changed'),
    ({ state }) => { state.installedHash = 'e'.repeat(64); },
    ({ state }) => { state.versionCode = '2'; },
    ({ state }) => { state.installed = false; },
  ]) {
    const h = harness(t, { verify });
    await assert.rejects(h.execute(), (error) => error.inspection.verifyInstalledStatus === 'failed');
    assert.equal(h.calls.some(({ args }) => args.includes('uninstall')), false);
  }
});

test('user switch before install or after native verification prevents unsafe continuation', async (t) => {
  const before = harness(t, { beforeAdb: ({ label, state }) => {
    if (label === 'inspection-before-install-user') state.user = '10';
  } });
  await assert.rejects(before.execute(), /사용자 프로필/u);
  assert.equal(before.calls.some(({ args }) => args[0] === 'install'), false);
  const after = harness(t, { verify: ({ state }) => { state.user = '10'; } });
  await assert.rejects(after.execute(), (error) => error.inspection.verifyInstalledStatus === 'failed');
  assert.equal(after.calls.some(({ args }) => args.includes('uninstall')), false);
});

test('ambiguous paths, hashes and package metadata are not accepted', async (t) => {
  for (const [suffix, value] of [
    ['-path', 'package:/data/app/abc/base.apk\npackage:/data/app/abc/split.apk'],
    ['-hash', '0'.repeat(64) + '  /data/app/abc/base.apk'],
    ['-metadata', 'Packages:\n versionCode=1\n versionName=1.0.0\n User 0: installed=true'],
    ['-metadata', 'Package [' + appId + ']\n versionCode=1\n versionCode=1\n versionName=1.0.0\n User 0: installed=true'],
  ]) {
    const h = harness(t, { result: ({ label }) => label === 'inspection-installed' + suffix ? { stdout: value, stderr: '', code: 0 } : undefined });
    await assert.rejects(h.execute());
    assert.equal(h.verified(), 0);
  }
});

test('package section owns version and installation status; later query and dexopt users are unrelated', async (t) => {
  // 실기기 로그의 구조만 재현하며 다른 설치 앱 목록·경로·사용자 정보는 복사하지 않습니다.
  const metadata = [
    'Packages:',
    '  Package [' + appId + '] (fixture):',
    '    versionCode=1 minSdk=24 targetSdk=36',
    '    versionName=1.0.0',
    '    User 0: installed=true hidden=false',
    '      runtime permissions:',
    '    User 10: installed=false hidden=false',
    '',
    'Queries:',
    '  queryable via interaction:',
    '    User 0:',
    '      fixture.other:',
    '        ' + appId,
    '',
    'Dexopt state:',
    '  [' + appId + ']',
    '    User 0:',
    '      compiler state only',
    '',
  ].join('\r\n');
  const h = harness(t, { existing: true,
    result: ({ label }) => label.endsWith('-metadata') ? { stdout: metadata, stderr: '', code: 0 } : undefined });
  const result = await h.execute({ allowMatchingInstall: true });
  assert.equal(result.installationMode, 'reused-exact');
  assert.equal(result.verifyInstalledStatus, 'passed');
  assert.equal(h.calls.some(({ args }) => args[0] === 'install'), false);
});

function metadataFixture({ name = appId, code = '1', version = '1.0.0', userLine = 'User 0: installed=true hidden=false' } = {}) {
  return [
    '  Package [' + name + '] (fixture):',
    '    versionCode=' + code + ' minSdk=24 targetSdk=36',
    '    versionName=' + version,
    '    ' + userLine,
  ].join('\n');
}

test('neighboring package blocks cannot supply or duplicate this package metadata', async (t) => {
  const other = metadataFixture({ name: 'fixture.other', code: '93', version: '9.3.0' });
  for (const metadata of [
    'Packages:\n' + other + '\n' + metadataFixture(),
    'Packages:\n' + metadataFixture() + '\n' + other + '\nQueries:\n    User 0:',
  ]) {
    const h = harness(t, { existing: true,
      result: ({ label }) => label.endsWith('-metadata') ? { stdout: metadata, stderr: '', code: 0 } : undefined });
    assert.equal((await h.execute({ allowMatchingInstall: true })).installationMode, 'reused-exact');
  }
  for (const badTarget of [
    metadataFixture({ code: '2' }),
    metadataFixture({ version: '0.1.0' }),
    metadataFixture({ userLine: 'User 0: installed=false hidden=false' }),
    metadataFixture().replace('    User 0: installed=true hidden=false', ''),
    metadataFixture().replace('    versionCode=1 minSdk=24 targetSdk=36\n', ''),
  ]) {
    const metadata = 'Packages:\n' + badTarget + '\n' + metadataFixture({ name: 'fixture.correct.values' });
    const h = harness(t, { existing: true,
      result: ({ label }) => label.endsWith('-metadata') ? { stdout: metadata, stderr: '', code: 0 } : undefined });
    await assert.rejects(h.execute({ allowMatchingInstall: true }));
    assert.equal(h.verified(), 0);
    assert.equal(h.calls.some(({ args }) => args[0] === 'install'), false);
  }
});

test('ambiguous sections, target blocks and installed status remain failures', async (t) => {
  const valid = 'Packages:\n' + metadataFixture();
  for (const metadata of [
    valid + '\nPackages:\n' + metadataFixture(),
    valid + '\n' + metadataFixture(),
    valid + '\n    User 0: installed=true',
    valid + '\n    User 0: installed=false',
    valid.replace('installed=true', 'installed=true installed=false'),
    valid.replace('installed=true', 'installed=true installed=true'),
    valid.replace('installed=true', 'installed=unknown'),
    valid.replace('installed=true', ''),
    valid + '\n    versionCode=1',
    valid + '\n    versionName=1.0.0',
    valid.replace('  Package [', 'Package ['),
    valid.replace('] (fixture):', '] malformed'),
    valid.replace('Packages:', 'Hidden system packages:'),
    'Packages:\n' + metadataFixture({ name: 'fixture.other' }) + '\nQueries:\n' + metadataFixture(),
  ]) {
    const h = harness(t, { existing: true,
      result: ({ label }) => label.endsWith('-metadata') ? { stdout: metadata, stderr: '', code: 0 } : undefined });
    await assert.rejects(h.execute({ allowMatchingInstall: true }));
    assert.equal(h.verified(), 0);
    assert.equal(h.calls.some(({ args }) => args[0] === 'install'), false);
  }
});

test('post-flow package state cannot be repaired by a later unrelated installed=true user', async (t) => {
  const h = harness(t, { existing: true, result: ({ label }) => {
    if (label !== 'inspection-after-flow-metadata') return undefined;
    return { stdout: 'Packages:\n' + metadataFixture({ userLine: 'User 0: installed=false' })
      + '\nQueries:\n    User 0: installed=true', stderr: '', code: 0 };
  } });
  await assert.rejects(h.execute({ allowMatchingInstall: true }), (error) => {
    assert.equal(error.inspection.verifyInstalledStatus, 'failed');
    assert.equal(error.inspection.installationCleanup, 'preserved');
    return true;
  });
  assert.equal(h.verified(), 1);
  assert.equal(h.calls.some(({ args }) => args.includes('uninstall') || args[0] === 'install'), false);
});

function updateHarness(t, options = {}) {
  const h = harness(t, { existing: true, update: true, ...options });
  const oldPath = path.join(h.root, 'previous.apk');
  fs.writeFileSync(oldPath, 'Previously verified inspection APK fixture');
  const oldHash = createHash('sha256').update(fs.readFileSync(oldPath)).digest('hex');
  const updateFrom = { ...h.apkState, historical: true, apkPath: oldPath, sha256: oldHash,
    buildNonce: 'inspection-fedcba9876543210' };
  h.apkState.versionCode = '2';
  h.state.installedHash = oldHash;
  return { ...h, updateFrom, execute: (overrides = {}) => h.execute({ updateFrom, ...overrides }) };
}

test('authorized update verifies previous APK and same signer then preserves data with install -r', async (t) => {
  const h = updateHarness(t);
  const result = await h.execute();
  assert.equal(result.installationMode, 'updated-verified');
  assert.equal(result.installedFresh, false);
  assert.equal(result.installedUpdated, true);
  assert.equal(result.updateAuthorized, true);
  assert.equal(result.previousApkSha256, h.updateFrom.sha256);
  assert.equal(result.previousVersionCode, 1);
  assert.equal(result.previousVersionName, '1.0.0');
  assert.equal(result.signerCertificateSHA256, 'a'.repeat(64));
  assert.equal(result.packageCodeScope, 'shared-package-update');
  assert.equal(result.dataPreserved, true);
  assert.equal(result.verifyInstalledStatus, 'passed');
  const installs = h.calls.filter(({ args }) => args[0] === 'install');
  assert.equal(installs.length, 1);
  assert.deepEqual(installs[0].args, ['install', '-r', '--user', '0', h.apkState.apkPath]);
  assert.equal(h.calls.some(({ args }) => args.includes('uninstall') || args.includes('clear') || args.includes('-d')), false);
  assert.ok(h.calls.findIndex(({ label }) => label === 'inspection-before-update-metadata')
    < h.calls.findIndex(({ label }) => label === 'inspection-update'));
});

test('known previous proof does not replace an already updated exact APK on retry', async (t) => {
  const h = updateHarness(t);
  h.state.installedHash = h.apkState.sha256;
  h.state.versionCode = '2';
  const result = await h.execute({ allowMatchingInstall: true });
  assert.equal(result.installationMode, 'reused-exact');
  assert.equal(result.installedUpdated, false);
  assert.equal(result.packageCodeScope, 'unchanged');
  assert.equal(h.calls.some(({ args }) => args[0] === 'install'), false);
});

test('update proof rejects other targets, missing history, unverified signatures and downgrades before ADB', async (t) => {
  for (const mutate of [
    ({ updateFrom }) => { updateFrom.applicationId = 'com.ungjo.storeprice'; },
    ({ updateFrom }) => { updateFrom.kind = 'standalone'; },
    ({ updateFrom }) => { delete updateFrom.historical; },
    ({ updateFrom }) => { delete updateFrom.signerCertificateSHA256; },
    ({ updateFrom }) => { updateFrom.signerCertificateSHA256 = 'b'.repeat(64); },
    ({ apkState }) => { delete apkState.signerCertificateSHA256; },
    ({ apkState }) => { apkState.signerCertificateSHA256 = 'A'.repeat(64); },
    ({ apkState }) => { apkState.historical = true; },
    ({ updateFrom }) => { updateFrom.versionCode = '3'; },
    ({ updateFrom }) => fs.appendFileSync(updateFrom.apkPath, 'changed'),
    ({ updateFrom, apkState }) => { updateFrom.apkPath = apkState.apkPath; updateFrom.sha256 = apkState.sha256; },
  ]) {
    const h = updateHarness(t); mutate(h);
    await assert.rejects(h.execute());
    assert.equal(h.calls.length, 0);
  }
  const h = updateHarness(t);
  await assert.rejects(h.execute({ updateFrom: null }));
  assert.equal(h.calls.length, 0);
});

test('only the exact authorized previous hash and version can be updated', async (t) => {
  for (const mutate of [
    ({ state }) => { state.installedHash = 'f'.repeat(64); },
    ({ state }) => { state.versionCode = '2'; },
    ({ state }) => { state.versionName = '0.9.0'; },
  ]) {
    const h = updateHarness(t); mutate(h);
    await assert.rejects(h.execute({ allowMatchingInstall: true }));
    assert.equal(h.calls.some(({ args }) => args[0] === 'install'), false);
    assert.equal(h.verified(), 0);
  }
});

test('changed previous/new file, installed APK or user immediately before update prevents mutation', async (t) => {
  for (const mutate of [
    ({ state }) => { state.installedHash = 'f'.repeat(64); },
    ({ state }) => { state.versionCode = '7'; },
    ({ state }) => { state.user = '10'; },
    (_state, h) => fs.appendFileSync(h.updateFrom.apkPath, 'changed'),
    (_state, h) => fs.appendFileSync(h.apkState.apkPath, 'changed'),
  ]) {
    let h;
    h = updateHarness(t, { beforeAdb: (observed) => {
      if (observed.label === 'inspection-before-update-user') mutate(observed, h);
    } });
    await assert.rejects(h.execute());
    assert.equal(h.calls.some(({ args }) => args[0] === 'install'), false);
  }
});

test('update failure or unverified install output preserves app and records attempted replacement', async (t) => {
  for (const options of [
    { installThrows: true },
    { result: ({ label }) => label === 'inspection-update' ? { stdout: 'Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]', code: 0 } : undefined },
    { result: ({ label }) => label === 'inspection-updated-hash' ? { stdout: 'invalid', code: 0 } : undefined },
  ]) {
    const h = updateHarness(t, options);
    await assert.rejects(h.execute(), (error) => {
      assert.equal(error.inspection.installationMode, 'update-requested');
      assert.equal(error.inspection.installStatus, 'failed-or-unconfirmed');
      assert.equal(error.inspection.installedUpdated, false);
      assert.equal(error.inspection.installedFresh, false);
      assert.equal(error.inspection.installationCleanup, 'preserved');
      return true;
    });
    assert.equal(h.calls.some(({ args }) => args.includes('uninstall') || args.includes('clear')), false);
    assert.equal(h.verified(), 0);
  }
});

test('post-update verification must recheck new APK without silently restoring old app', async (t) => {
  const h = updateHarness(t, { verify: ({ state }) => { state.versionCode = '1'; } });
  await assert.rejects(h.execute(), (error) => {
    assert.equal(error.inspection.installationMode, 'updated-verified');
    assert.equal(error.inspection.installedUpdated, true);
    assert.equal(error.inspection.verifyInstalledStatus, 'failed');
    return true;
  });
  assert.equal(h.calls.filter(({ args }) => args[0] === 'install').length, 1);
});
