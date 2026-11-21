import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import {
  prepareInspectionSnapshot, validateInspectionBuildRecord,
  finishInspectionDownload, captureInspectionApk, assertInspectionApkUnchanged, validateInspectionApkEvidence, INSPECTION_APPLICATION_ID,
  captureHistoricalInspectionApk, assertHistoricalInspectionApkUnchanged,
} from './inspection.mjs';

const projectId = '11111111-1111-4111-8111-111111111111';
const buildId = '22222222-2222-4222-8222-222222222222';
const fakeKey = 'sb_publishable_' + 'fixture_public_only_'.repeat(3);
const hash = (data) => createHash('sha256').update(data).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value) + '\n');

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function temporary(t) {
  const parent = fs.realpathSync(tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'store-price-inspection-'));
  t.after(() => {
    // 실제 저장소를 삭제하지 않도록 생성한 임시 폴더의 절대 경로를 다시 확인합니다.
    assert.equal(path.dirname(fs.realpathSync(root)), parent);
    assert.ok(path.basename(root).startsWith('store-price-inspection-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function fixture(t) {
  const root = temporary(t);
  const mobile = path.join(root, 'apps/mobile');
  const envNames = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  const prior = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  for (const name of envNames) delete process.env[name];
  t.after(() => {
    for (const name of envNames) {
      if (prior[name] === undefined) delete process.env[name];
      else process.env[name] = prior[name];
    }
  });
  const profile = {
    environment: 'preview', developmentClient: false, distribution: 'internal', autoIncrement: false,
    android: { buildType: 'apk' },
    env: {
      STORE_PRICE_APP_VARIANT: 'inspection', STORE_PRICE_STANDALONE_BUILD: '0', EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW: 'disabled',
      EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN: 'disabled',
      EXPO_PUBLIC_CATALOG_TEST_SCENARIO: 'disabled',
    },
  };
  const app = { expo: { name: 'Fixture', slug: 'store-price', version: '1.0.0', android: {versionCode:1}, extra: { eas: { projectId } } } };
  write(root, 'apps/mobile/app.json', JSON.stringify(app));
  write(root, 'apps/mobile/eas.json', JSON.stringify({ cli: {appVersionSource:'local'}, build: {inspection:profile, production:{env:{PRIVATE_FIXTURE:'do-not-upload'}}} }));
  for (const name of ['App.tsx', 'index.ts', 'app.config.js', 'eslint.config.js']) write(mobile, name, '// fixture ' + name + '\n');
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json']) write(mobile, name, '{}\n');
  write(mobile, 'src/data/sample.ts', 'export const fixture = 1;\n');
  write(mobile, 'src/data/sample.test.ts', '// test must not upload\n');
  write(mobile, 'assets/icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  write(mobile, '.env.local', 'EXPO_PUBLIC_SUPABASE_URL=https://fixture.supabase.co\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' + fakeKey + '\n');
  write(root, 'data/private/source.json', '{"private":"do not copy"}');
  // 테스트 출처 HEAD는 임시 저장소에서만 만들며 실제 작업 저장소의 Git은 건드리지 않습니다.
  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['-c', 'user.name=Inspection Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'Fixture'],
  ]) {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  }
  return { root, mobile };
}

function prepared(t) {
  const fixtureState = fixture(t);
  return { ...fixtureState, ...prepareInspectionSnapshot(fixtureState.root) };
}

function finishedRecord(manifest, overrides = {}) {
  return {
    id: buildId, status: 'FINISHED', platform: 'ANDROID', buildProfile: 'inspection', appVersion: manifest.versionName, appBuildVersion: manifest.versionCode,
    distribution: 'INTERNAL', app: { id: manifest.projectId }, appIdentifier: manifest.applicationId, message: manifest.buildNonce,
    artifacts: { applicationArchiveUrl: 'https://expo.dev/artifacts/eas/fixture.apk' }, ...overrides,
  };
}

function installFetch(t, fetchImpl) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  t.after(() => { globalThis.fetch = previous; });
}

function fakeApk() {
  const bytes = Buffer.alloc(1_000_010);
  bytes.writeUInt32LE(0x04034b50);
  return bytes;
}

function writeBuild(state) {
  const manifest = readJson(path.join(state.buildRoot, 'inputs.json'));
  writeJson(path.join(state.buildRoot, 'build.json'), finishedRecord(manifest));
  return manifest;
}

function noFetch(t) {
  installFetch(t, async () => { assert.fail('검증 실패 뒤 네트워크를 호출하면 안 됩니다.'); });
}


function expectedIdentity() {
  return {
    schemaVersion: 1, kind: 'inspection', projectId,
    applicationId: INSPECTION_APPLICATION_ID, applicationName: '꼬마 시장 검사',
    buildNonce: 'inspection-0123456789abcdef', versionName: '1.0.0', versionCode: '1',
    env: {
      EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fakeKey,
    },
  };
}

function evidence() {
  const expected = expectedIdentity();
  return {
    summary: INSPECTION_APPLICATION_ID + ' 1 1.0.0\n', debuggable: 'false\n',
    manifestXml: '<manifest><application android:label="@ref/0x7f0d001d" android:allowBackup="false"></application></manifest>',
    badging: "application-label:'꼬마 시장 검사'\nlaunchable-activity: name='" + INSPECTION_APPLICATION_ID + ".MainActivity'  label='' icon=''\n",
    files: '/assets/\n/assets/index.android.bundle\n',
    bundle: Buffer.from('fixture binary ' + expected.buildNonce + ' ' + Object.values(expected.env).join(' ')),
    signature: 'Verifies\nV2 Signer: certificate SHA-256 digest: ' + 'a'.repeat(64) + '\n',
  };
}

async function historicalFixture(t) {
  const state = prepared(t), manifest = writeBuild(state);
  installFetch(t, async () => new Response(fakeApk()));
  const downloaded = await finishInspectionDownload(state.root, state.buildRoot);
  return {
    ...state, manifest, ...downloaded,
    expected: {
      applicationId: manifest.applicationId, buildId, buildNonce: manifest.buildNonce,
      sha256: downloaded.sha256, sourceFingerprint: manifest.sourceFingerprint,
      versionName: manifest.versionName, versionCode: manifest.versionCode,
      signerCertificateSHA256: 'a'.repeat(64),
    },
  };
}

function mockCaptureTools(t, state, overrides = {}) {
  const manifest = state.manifest;
  const current = {
    ...evidence(),
    summary: INSPECTION_APPLICATION_ID + ' ' + manifest.versionCode + ' ' + manifest.versionName,
    bundle: Buffer.from(manifest.buildNonce + ' https://fixture.supabase.co ' + fakeKey),
    ...overrides,
  };
  const previous = process.env.STORE_PRICE_APKANALYZER;
  const analyzer = path.join(state.root, 'analyzer/bin/apkanalyzer.bat');
  write(state.root, 'analyzer/bin/apkanalyzer.bat', 'fixture');
  write(state.root, 'analyzer/lib/apkanalyzer-classpath.jar', 'fixture');
  process.env.STORE_PRICE_APKANALYZER = analyzer;
  const processMock = t.mock.method(childProcess, 'spawnSync', (command, args) => {
    assert.equal(command, 'fixture-java');
    assert.ok(args.includes('/assets/index.android.bundle'));
    return {status:0, stdout:current.bundle};
  });
  syncBuiltinESMExports();
  t.after(() => {
    processMock.mock.restore();
    syncBuiltinESMExports();
    if (previous === undefined) delete process.env.STORE_PRICE_APKANALYZER;
    else process.env.STORE_PRICE_APKANALYZER = previous;
  });
  const calls = [];
  return {
    calls,
    repoRoot: state.root, provenancePath: state.provenancePath, expected: state.expected,
    tools: {java:'fixture-java', env:{}},
    run: async (label) => {
      calls.push(label);
      const suffix = label.replace(/^(?:historical-)?inspection-apk-/u, '');
      const key = suffix === 'manifest' ? 'manifestXml' : suffix;
      assert.equal(typeof current[key], 'string');
      return {stdout:current[key], stderr:'', code:0};
    },
  };
}

test('snapshot keeps the fixed package but creates a unique marker and pins only public inputs', (t) => {
  const state = prepared(t);
  const manifest = readJson(path.join(state.buildRoot, 'inputs.json'));
  const eas = readJson(path.join(state.projectRoot, 'eas.json'));
  assert.equal(manifest.kind, 'inspection');
  assert.equal(manifest.applicationId, INSPECTION_APPLICATION_ID);
  assert.match(state.buildNonce, /^inspection-[a-f0-9]{16}$/u);
  assert.equal(manifest.versionName, '1.0.0');
  assert.equal(manifest.versionCode, '1');
  assert.deepEqual(Object.keys(eas.build), ['inspection']);
  assert.equal(eas.build.inspection.env.EXPO_PUBLIC_DEVICE_RUN_ID, state.buildNonce);
  assert.equal(eas.build.inspection.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, fakeKey);
  assert.equal(eas.build.inspection.env.STORE_PRICE_STANDALONE_BUILD, '0');
  assert.equal(eas.build.inspection.env.STORE_PRICE_BUILD_NONCE, undefined);
  assert.equal(eas.build.inspection.env.STORE_PRICE_ANDROID_PACKAGE, undefined);
  assert.equal(JSON.stringify(manifest).includes(fakeKey), false);
  assert.equal(JSON.stringify(eas).includes('PRIVATE_FIXTURE'), false);
  assert.equal(fs.existsSync(path.join(state.projectRoot, '.env.local')), false);
  assert.equal(fs.existsSync(path.join(state.projectRoot, 'src/data/sample.test.ts')), false);
  assert.equal(fs.existsSync(path.join(state.projectRoot, 'data')), false);
  assert.equal(readJson(path.join(state.mobile, 'eas.json')).build.inspection.env.EXPO_PUBLIC_DEVICE_RUN_ID, undefined);
  const next = prepareInspectionSnapshot(state.root);
  assert.notEqual(next.buildNonce, state.buildNonce);
  assert.equal(next.applicationId, state.applicationId);
  assert.equal(next.sourceFingerprint, state.sourceFingerprint);
});

test('unsafe profile overrides are rejected before an upload directory is created', (t) => {
  const state = fixture(t), file = path.join(state.mobile, 'eas.json');
  const original = readJson(file);
  for (const change of [
    (e) => { e.cli.appVersionSource = 'remote'; },
    (e) => { e.build.inspection.autoIncrement = true; },
    (e) => { e.build.inspection.developmentClient = true; },
    (e) => { e.build.inspection.distribution = 'store'; },
    (e) => { e.build.inspection.environment = 'production'; },
    (e) => { e.build.inspection.android.buildType = 'app-bundle'; },
    (e) => { e.build.inspection.android.gradleCommand = ':app:assembleDebug'; },
    (e) => { e.build.inspection.extends = 'preview'; },
    (e) => { e.build.inspection.android.env = {}; },
    (e) => { e.build.inspection.env.STORE_PRICE_STANDALONE_BUILD = '1'; },
    (e) => { e.build.inspection.env.STORE_PRICE_APP_VARIANT = 'production'; },
    (e) => { e.build.inspection.env.EXPO_PUBLIC_CATALOG_TEST_SCENARIO = 'pending'; },
    (e) => { e.build.inspection.env.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN = fakeKey; },
    (e) => { e.build.inspection.env.EXPO_PUBLIC_DEVICE_RUN_ID = 'stale'; },
    (e) => { e.build.inspection.env.STORE_PRICE_BUILD_NONCE = 'stale'; },
    (e) => { e.build.inspection.env.PRIVATE_SECRET = 'fixture'; },
  ]) {
    const value = structuredClone(original); change(value); writeJson(file, value);
    assert.throws(() => prepareInspectionSnapshot(state.root), /inspection 빌드 설정/u);
    assert.equal(fs.existsSync(path.join(state.root, '.artifacts')), false);
  }
});

test('missing project, malformed version or missing public catalog refuses preparation', (t) => {
  const state = fixture(t), file = path.join(state.mobile, 'app.json');
  const original = readJson(file);
  for (const change of [
    (a) => { delete a.expo.extra; },
    (a) => { a.expo.version = '1.0.0\n'; },
    (a) => { a.expo.version = '1.0'; },
    (a) => { a.expo.version = '01.0.0'; },
    (a) => { a.expo.version = 1; },
    (a) => { a.expo.android.versionCode = 0; },
    (a) => { a.expo.android.versionCode = -1; },
    (a) => { a.expo.android.versionCode = 1.5; },
    (a) => { a.expo.android.versionCode = '2'; },
    (a) => { a.expo.android.versionCode = 2_100_000_001; },
    (a) => { a.expo.android.version = ''; },
  ]) {
    const value = structuredClone(original); change(value); writeJson(file, value);
    assert.throws(() => prepareInspectionSnapshot(state.root));
  }
  writeJson(file, original);
  fs.unlinkSync(path.join(state.mobile, '.env.local'));
  assert.throws(() => prepareInspectionSnapshot(state.root), /공개|Supabase/u);
  assert.equal(fs.existsSync(path.join(state.root, '.artifacts')), false);
});

test('new version and code are pinned at preparation while schema-one old versions remain valid', async (t) => {
  const state = fixture(t), file = path.join(state.mobile, 'app.json');
  const config = readJson(file);
  config.expo.version = '1.2.3';
  config.expo.android.versionCode = 2;
  writeJson(file, config);
  const preparedState = { ...state, ...prepareInspectionSnapshot(state.root) };
  const manifest = writeBuild(preparedState);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.versionName, '1.2.3');
  assert.equal(manifest.versionCode, '2');
  assert.equal(validateInspectionBuildRecord(finishedRecord(manifest), manifest), 'https://expo.dev/artifacts/eas/fixture.apk');
  installFetch(t, async () => new Response(fakeApk()));
  const downloaded = await finishInspectionDownload(state.root, preparedState.buildRoot);
  assert.equal(readJson(downloaded.provenancePath).sourceFingerprint, manifest.sourceFingerprint);
  // 과거 schemaVersion 1의 1.0.0/1도 최신 상수로 덮어 해석하지 않고 기록된 값끼리 비교합니다.
  const old = expectedIdentity();
  assert.doesNotThrow(() => validateInspectionBuildRecord(finishedRecord(old), old));
  assert.equal(validateInspectionApkEvidence(evidence(), old).versionCode, '1');
});

test('Android version override and maximum supported code are pinned from app configuration', (t) => {
  const state = fixture(t), file = path.join(state.mobile, 'app.json');
  const config = readJson(file);
  config.expo.android.version = '2.0.1';
  config.expo.android.versionCode = 2_100_000_000;
  writeJson(file, config);
  const preparedState = prepareInspectionSnapshot(state.root);
  const manifest = readJson(path.join(preparedState.buildRoot, 'inputs.json'));
  assert.equal(manifest.versionName, '2.0.1');
  assert.equal(manifest.versionCode, '2100000000');
});

test('nested brand assets are copied byte-for-byte and included in the source fingerprint', (t) => {
  const state = fixture(t);
  const name = 'assets/brand/inspection/splash.png';
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  write(state.mobile, name, bytes);
  const preparedState = prepareInspectionSnapshot(state.root);
  const manifest = readJson(path.join(preparedState.buildRoot, 'inputs.json'));
  assert.equal(manifest.sourceEntries.find((entry) => entry.name === name)?.sha256, hash(bytes));
  assert.deepEqual(fs.readFileSync(path.join(preparedState.projectRoot, name)), bytes);
});

test('altering a recorded version without changing its pinned source is refused before download', async (t) => {
  const state = prepared(t); noFetch(t);
  const file = path.join(state.buildRoot, 'inputs.json'), original = readJson(file);
  for (const change of [{versionName:'1.0.1'}, {versionCode:'2'}]) {
    const manifest = {...original, ...change};
    writeJson(file, manifest);
    writeJson(path.join(state.buildRoot, 'build.json'), finishedRecord(manifest));
    await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), /입력 기록의 버전/u);
  }
  assert.equal(fs.existsSync(path.join(state.buildRoot, 'app.apk')), false);
});

test('changing a nested brand asset stops download before network access', async (t) => {
  const state = fixture(t), name = 'assets/brand/inspection/icon.png';
  write(state.mobile, name, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const preparedState = {...state, ...prepareInspectionSnapshot(state.root)};
  writeBuild(preparedState); noFetch(t);
  write(state.mobile, name, Buffer.from([0x89, 0x50, 0x4e, 0x47, 9]));
  await assert.rejects(finishInspectionDownload(state.root, preparedState.buildRoot), /앱 소스가 바뀌/u);
});

test('EAS and APK evidence match the recorded version rather than a hardcoded previous version', () => {
  const expected = {...expectedIdentity(), versionName:'1.2.3', versionCode:'2'};
  const current = {...evidence(), summary:INSPECTION_APPLICATION_ID+' 2 1.2.3'};
  const checked = validateInspectionApkEvidence(current, expected);
  assert.equal(checked.versionName, '1.2.3');
  assert.equal(checked.versionCode, '2');
  assert.doesNotThrow(() => validateInspectionBuildRecord(finishedRecord(expected), expected));
  assert.throws(() => validateInspectionBuildRecord(finishedRecord(expected, {appVersion:'1.0.0'}), expected), /Android 빌드 기록/u);
  assert.throws(() => validateInspectionBuildRecord(finishedRecord(expected, {appBuildVersion:'1'}), expected), /Android 빌드 기록/u);
  assert.throws(() => validateInspectionApkEvidence(evidence(), expected), /식별자 또는 버전/u);
});

test('malformed recorded versions cannot pass EAS or APK verification', () => {
  for (const change of [
    {versionName:'1.0.0\n'}, {versionName:'1.0'}, {versionName:1},
    {versionCode:'0'}, {versionCode:'02'}, {versionCode:'2\n'},
    {versionCode:2}, {versionCode:'1.5'}, {versionCode:'2100000001'},
  ]) {
    const expected = {...expectedIdentity(), ...change};
    assert.throws(() => validateInspectionBuildRecord(finishedRecord(expected), expected), /Android 빌드 기록/u);
    assert.throws(() => validateInspectionApkEvidence(evidence(), expected), /식별 정보/u);
  }
});

test('missing source inputs and input junctions cannot enter a snapshot', (t) => {
  const state = fixture(t);
  fs.unlinkSync(path.join(state.mobile, 'app.config.js'));
  assert.throws(() => prepareInspectionSnapshot(state.root), /ENOENT/u);
  write(state.mobile, 'app.config.js', '// fixture');
  const outside = temporary(t);
  fs.symlinkSync(outside, path.join(state.mobile, 'src/escape'), 'junction');
  assert.throws(() => prepareInspectionSnapshot(state.root), /심볼릭/u);
});

test('artifact parent junction cannot redirect snapshot writes outside the repository', (t) => {
  const state = fixture(t), outside = temporary(t);
  fs.symlinkSync(outside, path.join(state.root, '.artifacts'), 'junction');
  assert.throws(() => prepareInspectionSnapshot(state.root), /junction/u);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('EAS identity requires this project, fixed package, inspection profile, nonce and version', () => {
  const manifest = expectedIdentity();
  assert.equal(validateInspectionBuildRecord(finishedRecord(manifest), manifest), 'https://expo.dev/artifacts/eas/fixture.apk');
  for (const change of [
    { status: 'IN_PROGRESS' }, { platform: 'IOS' }, { buildProfile: 'preview' },
    { distribution: 'STORE' }, { app: {id:buildId} }, { appIdentifier: 'com.ungjo.storeprice' },
    { appIdentifier: 'com.ungjo.storeprice.offline.b0123456789abcdef' },
    { message: 'inspection-fedcba9876543210' }, { appVersion: '0.1.0' }, { appBuildVersion: '2' },
    { id: buildId + '\n' },
  ]) assert.throws(() => validateInspectionBuildRecord(finishedRecord(manifest, change), manifest), /Android 빌드 기록/u);
  for (const change of [{kind:'standalone'}, {buildNonce:'standalone-0123456789abcdef'}, {applicationId:'com.ungjo.storeprice'}]) {
    assert.throws(() => validateInspectionBuildRecord(finishedRecord(manifest), {...manifest,...change}), /Android 빌드 기록/u);
  }
});

test('EAS record accepts only official initial artifact hosts', () => {
  const manifest = expectedIdentity();
  for (const url of [
    'http://expo.dev/a.apk', 'https://expo.dev.attacker.invalid/a.apk',
    'https://user:secret@expo.dev/a.apk', 'https://expo.dev:8443/a.apk', 'https://expo.dev/a.apk#hash',
    'https://wf-artifacts.eascdn.net/a.apk',
  ]) assert.throws(() => validateInspectionBuildRecord(finishedRecord(manifest, {artifacts:{applicationArchiveUrl:url}}), manifest), /공식 APK/u);
});

test('download binds SHA and EAS record hash without disclosing keys or replacing artifacts', async (t) => {
  const state = prepared(t); writeBuild(state);
  const bytes = fakeApk();
  installFetch(t, async () => new Response(bytes));
  const result = await finishInspectionDownload(state.root, state.buildRoot);
  const provenance = readJson(result.provenancePath);
  assert.equal(provenance.kind, 'inspection');
  assert.equal(provenance.sha256, hash(bytes));
  assert.equal(provenance.buildRecordSha256, hash(fs.readFileSync(path.join(state.buildRoot, 'build.json'))));
  assert.equal(provenance.applicationId, INSPECTION_APPLICATION_ID);
  assert.equal(provenance.buildNonce, state.buildNonce);
  assert.equal(JSON.stringify(provenance).includes(fakeKey), false);
  noFetch(t);
  await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), /덮어쓰지/u);
});

test('official EAS CDN redirect is accepted only after the original EAS URL', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async (url) => {
    assert.equal(url, 'https://expo.dev/artifacts/eas/fixture.apk');
    const response = new Response(fakeApk());
    Object.defineProperty(response, 'url', {value:'https://wf-artifacts.eascdn.net/a.apk'});
    return response;
  });
  assert.equal((await finishInspectionDownload(state.root, state.buildRoot)).buildId, buildId);
});

test('changed app source stops download before network access', async (t) => {
  const state = prepared(t); writeBuild(state); noFetch(t);
  write(state.mobile, 'App.tsx', '// changed');
  await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), /앱 소스가 바뀌/u);
});

test('changed catalog input stops download before network access', async (t) => {
  const state = prepared(t); writeBuild(state); noFetch(t);
  fs.appendFileSync(path.join(state.mobile, '.env.local'), '\n# changed\n');
  await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), /연결 설정이 바뀌/u);
});

test('an extra snapshot file invalidates the uploaded-content fingerprint', async (t) => {
  const state = prepared(t); writeBuild(state); noFetch(t);
  write(state.projectRoot, 'private.txt', 'fixture');
  await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), /복사본이 바뀌/u);
});

test('source edits during download prevent APK and provenance publication', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async () => {write(state.mobile, 'App.tsx', '// changed in flight');return new Response(fakeApk());});
  await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), /앱 소스가 바뀌/u);
  assert.equal(fs.existsSync(path.join(state.buildRoot, 'provenance.json')), false);
  assert.equal(fs.existsSync(path.join(state.buildRoot, 'app.apk')), false);
});

test('EAS record edits during download prevent provenance publication', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async () => {
    fs.appendFileSync(path.join(state.buildRoot, 'build.json'), '\n');
    return new Response(fakeApk());
  });
  await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), /EAS 빌드 기록이 바뀌/u);
  assert.equal(fs.existsSync(path.join(state.buildRoot, 'provenance.json')), false);
});

test('download failures redact URLs and keys, reject non-APKs and unexpected redirects', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async () => {throw new Error('private signed URL '+fakeKey);});
  await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), (error) => {
    assert.equal(error.message.includes(fakeKey), false);
    return /안전하게 내려받지/u.test(error.message);
  });
  globalThis.fetch = async () => new Response('not-apk');
  await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), /형식이나 크기/u);
  globalThis.fetch = async () => {
    const response = new Response(fakeApk());
    Object.defineProperty(response, 'url', {value:'https://attacker.invalid/a.apk'});
    return response;
  };
  await assert.rejects(finishInspectionDownload(state.root, state.buildRoot), /안전하게 내려받지/u);
  assert.equal(fs.existsSync(path.join(state.buildRoot, 'app.apk')), false);
});

test('nonce-style old folders, path escapes and wrong record names are rejected', async (t) => {
  const state = prepared(t);
  for (const directory of [
    state.root, path.join(state.root, '.artifacts/build-other', state.buildNonce),
    path.join(state.root, '.artifacts/build/standalone-0123456789abcdef'),
  ]) await assert.rejects(finishInspectionDownload(state.root, directory), /전용 빌드 폴더/u);
  await assert.rejects(captureInspectionApk({repoRoot:state.root,provenancePath:path.join(state.buildRoot,'other.json')}), /provenance.json/u);
});

test('changed APK bytes and EAS record stop native tools before inspection', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async () => new Response(fakeApk()));
  const {provenancePath} = await finishInspectionDownload(state.root, state.buildRoot);
  let calls=0;
  const options={repoRoot:state.root,provenancePath,run:async()=>{calls++;assert.fail('No tools before provenance.');}};
  fs.appendFileSync(path.join(state.buildRoot, 'app.apk'), 'changed');
  await assert.rejects(captureInspectionApk(options), /출처 기록이 일치/u);
  fs.writeFileSync(path.join(state.buildRoot, 'app.apk'), fakeApk());
  fs.appendFileSync(path.join(state.buildRoot, 'build.json'), '\n');
  await assert.rejects(captureInspectionApk(options), /출처 기록이 일치/u);
  assert.equal(calls, 0);
});

test('forged captured state and altered source entries cannot pass the final guard', async (t) => {
  const state = prepared(t); writeBuild(state); noFetch(t);
  const file=path.join(state.buildRoot,'inputs.json'), manifest=readJson(file);
  manifest.sourceEntries[0].sha256='0'.repeat(64);writeJson(file,manifest);
  await assert.rejects(finishInspectionDownload(state.root,state.buildRoot), /앱 소스가 바뀌/u);
  assert.throws(()=>assertInspectionApkUnchanged(Object.freeze({kind:'inspection',sha256:'0'.repeat(64)})), /현재 검사/u);
});

test('APK evidence resolves the real label, launcher, release bundle and signing certificate', () => {
  const result=validateInspectionApkEvidence(evidence(),expectedIdentity());
  assert.deepEqual(result,{
    applicationId:INSPECTION_APPLICATION_ID,applicationName:'꼬마 시장 검사',versionCode:'1',versionName:'1.0.0',
    signerCertificateSHA256:'a'.repeat(64),debuggable:false,embeddedBundle:true,backupDisabled:true,
  });
});

test('wrong APK identity or version cannot pass inspection evidence', () => {
  for(const summary of ['com.ungjo.storeprice 1 1.0.0',INSPECTION_APPLICATION_ID+' 2 1.0.0',INSPECTION_APPLICATION_ID+' 1 0.1.0',INSPECTION_APPLICATION_ID+' 1 1.0.0 extra']) {
    assert.throws(()=>validateInspectionApkEvidence({...evidence(),summary},expectedIdentity()), /식별자 또는 버전/u);
  }
});

test('debuggable or backup-enabled apps cannot borrow evidence from another manifest element', () => {
  assert.throws(()=>validateInspectionApkEvidence({...evidence(),debuggable:'true'},expectedIdentity()), /디버그/u);
  for(const manifestXml of ['<application android:allowBackup="true">','<manifest android:allowBackup="false"><application></application></manifest>','<application>']) {
    assert.throws(()=>validateInspectionApkEvidence({...evidence(),manifestXml},expectedIdentity()), /백업/u);
  }
});

test('wrong or ambiguous display names and launcher packages are refused', () => {
  const original=evidence().badging;
  for(const badging of [
    original.replace('꼬마 시장 검사','꼬마 시장'),
    original+'application-label:\'꼬마 시장 검사\'\n',
    original.replace(INSPECTION_APPLICATION_ID+'.MainActivity','com.other.MainActivity'),
    original.replace('.MainActivity','.OtherActivity'),
  ]) assert.throws(()=>validateInspectionApkEvidence({...evidence(),badging},expectedIdentity()), /표시 이름 또는 시작 화면/u);
});

test('missing embedded bundle, mismatched marker or catalog is rejected without exposing keys', () => {
  const expected=expectedIdentity();
  const variants=[
    {files:'/assets/not-index.android.bundle'},
    {bundle:Buffer.from('old marker')},
    {bundle:Buffer.from(expected.buildNonce+' '+expected.env.EXPO_PUBLIC_SUPABASE_URL)},
    {bundle:Buffer.from(expected.buildNonce+' '+fakeKey)},
  ];
  for(const change of variants) assert.throws(()=>validateInspectionApkEvidence({...evidence(),...change},expected),(error)=>{
    assert.equal(error.message.includes(fakeKey),false);return true;
  });
});

test('signature success and certificate digest are required', () => {
  for(const signature of ['', 'Does not verify', 'Verifies\nV2 Signer: public key SHA-256 digest: '+'a'.repeat(64)]) {
    assert.throws(()=>validateInspectionApkEvidence({...evidence(),signature},expectedIdentity()), /서명/u);
  }
});

test('historical capture checks old bytes and evidence while current source has advanced', async (t) => {
  const state = await historicalFixture(t);
  const options = mockCaptureTools(t, state);
  const current = await captureInspectionApk(options);
  assertInspectionApkUnchanged(current);
  assert.throws(() => assertHistoricalInspectionApkUnchanged(current), /과거 APK 상태/u);
  write(state.mobile, 'App.tsx', '// newer code');
  const configPath = path.join(state.mobile, 'app.json'), config = readJson(configPath);
  config.expo.android.versionCode = 2; writeJson(configPath, config);
  const priorCalls = options.calls.length;
  await assert.rejects(captureInspectionApk({...options, historical:true}), /앱 소스가 바뀌/u);
  assert.equal(options.calls.length, priorCalls);
  const historical = await captureHistoricalInspectionApk(options);
  assert.equal(historical.historical, true);
  assert.equal(historical.kind, 'inspection');
  assert.equal(historical.versionCode, '1');
  assert.equal(historical.sha256, state.expected.sha256);
  assert.equal(historical.signerCertificateSHA256, state.expected.signerCertificateSHA256);
  assertHistoricalInspectionApkUnchanged(historical);
  assert.throws(() => assertInspectionApkUnchanged(historical), /현재 검사/u);
  assert.throws(() => assertHistoricalInspectionApkUnchanged({...historical}), /과거 APK 상태/u);
  assert.ok(options.calls.some((label) => label === 'historical-inspection-apk-signature'));
  fs.appendFileSync(path.join(state.buildRoot, 'app.apk'), 'changed');
  assert.throws(() => assertHistoricalInspectionApkUnchanged(historical), /과거 APK 또는 빌드 기록/u);
});

test('historical identity from a passed report is required before native commands', async (t) => {
  const state = await historicalFixture(t);
  let calls = 0;
  const options = {repoRoot:state.root, provenancePath:state.provenancePath, run:async()=>{calls++;assert.fail('unexpected native tool');}};
  for (const expected of [undefined, {}, {...state.expected, signerCertificateSHA256:''}, {...state.expected, versionCode:1}]) {
    await assert.rejects(captureHistoricalInspectionApk({...options, expected}), /과거 통과 기록/u);
  }
  for (const change of [
    {sha256:'f'.repeat(64)}, {sourceFingerprint:'f'.repeat(64)}, {buildId:projectId},
    {buildNonce:'inspection-fedcba9876543210'}, {versionName:'2.0.0'}, {versionCode:'2'},
  ]) await assert.rejects(captureHistoricalInspectionApk({...options, expected:{...state.expected,...change}}), /과거 통과 기록과/u);
  assert.equal(calls, 0);
});

test('historical capture rejects a signing certificate different from the passed report', async (t) => {
  const state = await historicalFixture(t);
  const options = mockCaptureTools(t, state, {signature:'Verifies\nV2 Signer: certificate SHA-256 digest: '+'b'.repeat(64)+'\n'});
  await assert.rejects(captureHistoricalInspectionApk(options), /과거 통과 기록과/u);
});

test('historical capture retains snapshot, source-entry, catalog and provenance guards', async (t) => {
  const state = await historicalFixture(t);
  let calls = 0;
  const options = {repoRoot:state.root,provenancePath:state.provenancePath,expected:state.expected,run:async()=>{calls++;assert.fail('unexpected native tool');}};
  for (const [relative, change, expectedError] of [
    ['inputs.json', (bytes) => {const m=JSON.parse(bytes);m.sourceEntries[0].sha256='f'.repeat(64);return JSON.stringify(m);}, /원본 입력/u],
    ['project/App.tsx', () => '// changed old snapshot', /원본 입력/u],
    ['project/eas.json', (bytes) => bytes+'\n', /복사본이 바뀌/u],
    ['provenance.json', (bytes) => {const p=JSON.parse(bytes);p.buildRecordSha256='f'.repeat(64);return JSON.stringify(p);}, /출처 기록/u],
    ['app.apk', (bytes) => Buffer.concat([bytes,Buffer.from('changed')]), /출처 기록/u],
  ]) {
    const file=path.join(state.buildRoot,relative), original=fs.readFileSync(file);
    fs.writeFileSync(file,change(original));
    await assert.rejects(captureHistoricalInspectionApk(options),expectedError);
    fs.writeFileSync(file,original);
  }
  const envFile = path.join(state.mobile, '.env.local');
  const original = fs.readFileSync(envFile, 'utf8');
  for (const changed of [
    original.replace('https://fixture.supabase.co', 'https://other.supabase.co'),
    original.replace(fakeKey, fakeKey + 'changed'),
  ]) {
    fs.writeFileSync(envFile, changed);
    await assert.rejects(captureHistoricalInspectionApk(options), /연결 설정이 바뀌/u);
  }
  assert.equal(calls,0);
});

test('historical checks compare the pinned public connection across workspace copies', async (t) => {
  const state = await historicalFixture(t);
  const options = mockCaptureTools(t, state);
  const envFile = path.join(state.mobile, '.env.local');
  const original = fs.readFileSync(envFile, 'utf8');
  fs.writeFileSync(envFile, '# local note\r\n' + original.replaceAll('\n', '\r\n'));
  await assert.rejects(captureInspectionApk(options), /연결 설정이 바뀌/u);
  const historical = await captureHistoricalInspectionApk(options);
  assertHistoricalInspectionApkUnchanged(historical);

  fs.writeFileSync(envFile, original.replace(fakeKey, fakeKey + 'new'));
  assert.throws(() => assertHistoricalInspectionApkUnchanged(historical), /연결 설정이 바뀌/u);
});

test('changing a historical snapshot during native inspection prevents a verified state', async (t) => {
  const state = await historicalFixture(t), options = mockCaptureTools(t,state);
  const originalRun=options.run;
  options.run=async (label,...args) => {
    const result=await originalRun(label,...args);
    if(label.endsWith('-signature')) write(state.projectRoot,'assets/icon.png','changed during capture');
    return result;
  };
  await assert.rejects(captureHistoricalInspectionApk(options), /원본 입력/u);
});
