import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertProductionAabUnchanged, finishProductionDownload, prepareProductionSnapshot,
  validateProductionBuildRecord, validateProductionEvidence,
} from './production.mjs';

const projectId = '11111111-1111-4111-8111-111111111111';
const buildId = '22222222-2222-4222-8222-222222222222';
const name = '꼬마 시장';
const applicationId = 'com.ungjo.storeprice';
const env = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'public_fixture_only_'.repeat(3),
};
const manifest = {
  schemaVersion: 1, kind: 'production', projectId, applicationId,
  buildNonce: 'production-0123456789abcdef', versionName: '1.0.0', versionCode: '2',
};
const finished = (input = manifest) => ({
  id: buildId, status: 'FINISHED', platform: 'ANDROID', distribution: 'STORE', buildProfile: 'production',
  app: { id: input.projectId }, message: input.buildNonce, appIdentifier: applicationId,
  appVersion: input.versionName, appBuildVersion: input.versionCode,
  artifacts: { applicationArchiveUrl: 'https://expo.dev/artifacts/eas/fixture.aab' },
});
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function fixture(t) {
  const parent = fs.realpathSync(tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'store-price-production-'));
  t.after(() => {
    const actual = fs.realpathSync(root);
    assert.equal(path.dirname(actual), parent);
    assert.match(path.basename(actual), /^store-price-production-[a-zA-Z0-9]+$/u);
    fs.rmSync(actual, { recursive: true });
  });
  const mobile = path.join(root, 'apps/mobile');
  fs.mkdirSync(path.join(mobile, 'src'), { recursive: true });
  fs.mkdirSync(path.join(mobile, 'assets'));
  for (const file of ['App.tsx', 'index.ts', 'app.config.js', 'package.json', 'package-lock.json', 'tsconfig.json', 'eslint.config.js', 'src/market.ts', 'src/market.test.ts']) {
    fs.writeFileSync(path.join(mobile, file), 'fixture');
  }
  fs.writeFileSync(path.join(mobile, 'app.json'), JSON.stringify({ expo: {
    name, version: manifest.versionName, android: { package: applicationId, versionCode: 2 }, extra: { eas: { projectId } },
  } }));
  const eas = readJson(new URL('../../apps/mobile/eas.json', import.meta.url));
  eas.build.inspection.env.PRIVATE_TEST_FIELD = 'must-not-upload';
  fs.writeFileSync(path.join(mobile, 'eas.json'), JSON.stringify(eas));
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const key of Object.keys(env)) delete process.env[key];
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  fs.writeFileSync(path.join(mobile, '.env.local'), Object.entries(env).map(([key, value]) => key + '=' + value).join('\n') + '\nPRIVATE_FIXTURE=must-not-upload\n');
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, '-c', 'user.email=fixture@example.invalid', '-c', 'user.name=Fixture', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'Fixture']);
  return { root, mobile, eas };
}

function setFetch(t, respond) {
  const previous = globalThis.fetch;
  globalThis.fetch = respond;
  t.after(() => { globalThis.fetch = previous; });
}

test('production snapshot contains only app inputs without usable remote catalog credentials', (t) => {
  const { root } = fixture(t);
  const { projectRoot, buildRoot, buildNonce } = prepareProductionSnapshot(root);
  const eas = readJson(path.join(projectRoot, 'eas.json'));
  assert.deepEqual(Object.keys(eas.build), ['production']);
  const vars = eas.build.production.env;
  for (const key of Object.keys(env)) assert.equal(vars[key], 'disabled');
  assert.equal(vars.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN, 'disabled');
  for (const key of ['PRIVATE_FIXTURE', 'PRIVATE_TEST_FIELD', 'EXPO_PUBLIC_DEVICE_RUN_ID', 'STORE_PRICE_BUILD_NONCE']) assert.equal(vars[key], undefined);
  assert.ok(!JSON.stringify(eas).includes(buildNonce));
  for (const file of ['src/market.test.ts', '.env.local', '.git']) assert.ok(!fs.existsSync(path.join(projectRoot, file)));
  const inputs = readJson(path.join(buildRoot, 'inputs.json'));
  assert.equal(inputs.catalogMode, 'bundled');
  for (const field of ['sourceFingerprint', 'snapshotFingerprint']) assert.match(inputs[field], /^[a-f0-9]{64}$/u);
  assert.deepEqual([inputs.applicationName, inputs.applicationId, inputs.versionName, inputs.versionCode], [name, applicationId, '1.0.0', '2']);
});

test('production snapshot refuses a custom Gradle command or enabled preview', (t) => {
  const { root, mobile, eas } = fixture(t);
  const profile = eas.build.production;
  profile.android.gradleCommand = ':app:assembleRelease';
  fs.writeFileSync(path.join(mobile, 'eas.json'), JSON.stringify(eas));
  assert.throws(() => prepareProductionSnapshot(root));
  delete profile.android.gradleCommand;
  profile.env.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN = 'private-token';
  fs.writeFileSync(path.join(mobile, 'eas.json'), JSON.stringify(eas));
  assert.throws(() => prepareProductionSnapshot(root));
});

test('EAS record checks the requested build, profile, identity, release and official AAB URL', () => {
  const record = finished();
  assert.equal(validateProductionBuildRecord(record, manifest, buildId).href, record.artifacts.applicationArchiveUrl);
  for (const changed of [
    { id: 'unknown' }, { status: 'IN_PROGRESS' }, { distribution: 'INTERNAL' }, { platform: 'IOS' },
    { buildProfile: 'inspection' }, { app: { id: buildId } }, { message: 'production-0000000000000000' },
    { appIdentifier: applicationId + '.inspection' }, { appVersion: '1.0.1' }, { appBuildVersion: '1' },
    ...['https://evil.example/fixture.aab', 'https://expo.dev.evil.example/fixture.aab',
      'https://expo.dev/artifacts/eas/fixture.apk', 'https://user@expo.dev/artifacts/eas/fixture.aab']
      .map((applicationArchiveUrl) => ({ artifacts: { applicationArchiveUrl } })),
  ]) assert.throws(() => validateProductionBuildRecord({ ...record, ...changed }, manifest));
  assert.throws(() => validateProductionBuildRecord(record, manifest, projectId));
});

test('download binds bytes to the build record, permits retry, and detects changed inputs', async (t) => {
  const { root, mobile } = fixture(t);
  const { projectRoot, buildRoot } = prepareProductionSnapshot(root);
  const input = readJson(path.join(buildRoot, 'inputs.json'));
  const buildFile = path.join(buildRoot, 'build.json');
  fs.writeFileSync(buildFile, JSON.stringify(finished(input)));
  const bytes = Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 3]);
  let calls = 0;
  setFetch(t, async (url, options) => {
    assert.equal(options.redirect, 'manual');
    calls++;
    if (url.hostname === 'expo.dev') return new Response(null, { status: 307, headers: { location: 'https://api.expo.dev/v2/artifacts/eas/fixture' } });
    if (url.hostname === 'api.expo.dev') return new Response(null, { status: 307, headers: { location: 'https://wf-artifacts.eascdn.net/production.aab' } });
    return new Response(bytes);
  });
  const download = () => finishProductionDownload(root, buildRoot, buildId);
  const first = await download();
  assert.deepEqual(fs.readFileSync(first.aabPath), bytes);
  assert.deepEqual(await download(), first);
  assert.equal(calls, 3);
  fs.appendFileSync(first.aabPath, 'modified');
  await assert.rejects(download);
  fs.writeFileSync(first.aabPath, bytes);
  fs.appendFileSync(buildFile, '\n');
  await assert.rejects(download);
  fs.writeFileSync(buildFile, JSON.stringify(finished(input)));
  const extra = path.join(projectRoot, '.env');
  fs.writeFileSync(extra, 'unexpected');
  await assert.rejects(download);
  fs.unlinkSync(extra);
  fs.appendFileSync(path.join(mobile, 'src/market.ts'), '\nchanged');
  await assert.rejects(download);
});

test('untrusted redirect is stopped before the second request and leaves no AAB', async (t) => {
  const { root } = fixture(t);
  const { buildRoot } = prepareProductionSnapshot(root);
  const input = readJson(path.join(buildRoot, 'inputs.json'));
  fs.writeFileSync(path.join(buildRoot, 'build.json'), JSON.stringify(finished(input)));
  let requests = 0;
  let target;
  setFetch(t, () => {
    requests++;
    return new Response(null, { status: 307, headers: { location: target } });
  });
  for (target of ['https://evil.example/file.aab', 'https://api.expo.dev/v2/artifacts/eas/different', 'https://api.expo.dev/other/fixture']) {
    requests = 0;
    await assert.rejects(() => finishProductionDownload(root, buildRoot));
    assert.equal(requests, 1);
  }
  assert.equal(fs.existsSync(path.join(buildRoot, 'app.aab')), false);
});

test('bundle evidence checks release manifest, offline payload, disabled networking and complete upload signature', () => {
  const evidence = {
    manifestXml: '<manifest package="' + applicationId + '" android:versionCode="2" android:versionName="1.0.0"><application android:allowBackup="false" android:label="@string/app_name"></application></manifest>',
    labelResource: "Package 'com.ungjo.storeprice':\n0x7f120001 - string/app_name\n  (default) - [STR] \"" + name + '\"',
    files: 'BundleConfig.pb\nbase/manifest/AndroidManifest.xml\nbase/assets/index.android.bundle\n',
    bundle: Buffer.from('sample-apple sample-milk'), verification: 'jar verified.\n',
    certificate: 'Signer #1:\n\nCertificate #1:\n  SHA256: ' + Array(32).fill('AB').join(':') + '\n',
  };
  const actual = validateProductionEvidence(evidence, manifest);
  assert.equal(actual.signerCertificateSHA256, 'ab'.repeat(32));
  assert.equal(actual.debuggable, false);
  // 이름이 제거된 참조·패키지 이름이 붙은 참조·리터럴을 실제 bundletool 인쇄 형식으로 확인합니다.
  for (const label of ['0x7f120001', '@0x7f120001', '2131886081', '@com.ungjo.storeprice:string/app_name', name]) {
    const manifestXml = evidence.manifestXml.replace('@string/app_name', label).replace('versionCode="2"', 'versionCode="0x00000002"');
    assert.equal(validateProductionEvidence({ ...evidence, manifestXml }, manifest).signerCertificateSHA256, 'ab'.repeat(32));
  }
  for (const changed of [
    { manifestXml: evidence.manifestXml.replace(applicationId, applicationId + '.inspection') },
    { manifestXml: evidence.manifestXml.replace('versionCode="2"', 'versionCode="3"') },
    { manifestXml: evidence.manifestXml.replace('@string/app_name', '@android:string/app_name') },
    { manifestXml: evidence.manifestXml.replace('@string/app_name', 'unknown label') },
    { manifestXml: evidence.manifestXml.replace('allowBackup="false"', 'allowBackup="true"') },
    { manifestXml: evidence.manifestXml.replace('<application ', '<application android:debuggable="true" ') },
    { labelResource: '(default) - [STR] "꼬마 시장 검사"' }, { labelResource: '(default) - [STR] "꼬마 시장 2"' }, { files: '' }, { bundle: Buffer.from(env.EXPO_PUBLIC_SUPABASE_URL) },
    { bundle: Buffer.concat([evidence.bundle, Buffer.from(manifest.buildNonce)]) },
    ...[...Object.values(env), '/rest/v1/play_catalog'].map((marker) => ({ bundle: Buffer.concat([evidence.bundle, Buffer.from(marker)]) })),
    { manifestXml: evidence.manifestXml.replace('<application ', '<uses-permission android:name="android.permission.INTERNET"/><application ') },
    { manifestXml: evidence.manifestXml.replace('<application ', '<uses-permission-sdk-23 android:name="android.permission.INTERNET"/><application ') },
    { verification: 'jar is unsigned.' }, { verification: 'jar verified.\nThis jar contains unsigned entries.' },
    { certificate: evidence.certificate + '\nSigner #2:\n' }, { certificate: 'Signer #1:\nNo certificate\n' },
  ]) assert.throws(() => validateProductionEvidence({ ...evidence, ...changed }, manifest));
  assert.throws(() => assertProductionAabUnchanged({ ...actual }));
});

