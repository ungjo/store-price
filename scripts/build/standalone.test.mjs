import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  captureBuildInputs, prepareStandaloneSnapshot, validateBuildRecord,
  finishStandaloneDownload, captureStandaloneApk, assertStandaloneApkUnchanged, readSignerCertificateSHA256,
} from './standalone.mjs';

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
  const root = fs.mkdtempSync(path.join(parent, 'store-price-standalone-'));
  t.after(() => {
    // 실제 저장소를 삭제하지 않도록 생성한 임시 폴더의 절대 경로를 다시 확인합니다.
    assert.equal(path.dirname(fs.realpathSync(root)), parent);
    assert.ok(path.basename(root).startsWith('store-price-standalone-'));
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
    environment: 'preview', developmentClient: false, distribution: 'internal',
    android: { buildType: 'apk' },
    env: {
      STORE_PRICE_STANDALONE_BUILD: '1', EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW: 'disabled',
      EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN: 'disabled',
      EXPO_PUBLIC_CATALOG_TEST_SCENARIO: 'disabled',
    },
  };
  const app = { expo: { name: 'Fixture', slug: 'store-price', version: '0.1.0', extra: { eas: { projectId } } } };
  write(root, 'apps/mobile/app.json', JSON.stringify(app));
  write(root, 'apps/mobile/eas.json', JSON.stringify({ build: { preview: profile } }));
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
    ['-c', 'user.name=Standalone Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'Fixture'],
  ]) {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  }
  return { root, mobile };
}

function prepared(t) {
  const fixtureState = fixture(t);
  return { ...fixtureState, ...prepareStandaloneSnapshot(fixtureState.root) };
}

function finishedRecord(manifest, overrides = {}) {
  return {
    id: buildId, status: 'FINISHED', platform: 'ANDROID', buildProfile: 'preview',
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

test('source fingerprint is deterministic, excludes tests, and changes with executable source', (t) => {
  const state = fixture(t);
  const first = captureBuildInputs(state.mobile);
  assert.deepEqual(captureBuildInputs(state.mobile), first);
  assert.ok(!first.entries.some(({ name }) => name.includes('.test.') || name.startsWith('.env')));
  write(state.mobile, 'src/data/sample.test.ts', '// edited test\n');
  assert.equal(captureBuildInputs(state.mobile).fingerprint, first.fingerprint);
  write(state.mobile, 'src/data/sample.ts', 'export const fixture = 2;\n');
  assert.notEqual(captureBuildInputs(state.mobile).fingerprint, first.fingerprint);
});

test('missing configuration inputs and unreviewed source files refuse capture', (t) => {
  const state = fixture(t);
  fs.unlinkSync(path.join(state.mobile, 'app.config.js'));
  assert.throws(() => captureBuildInputs(state.mobile), /ENOENT/u);
  write(state.mobile, 'app.config.js', '// fixture\n');
  write(state.mobile, 'src/private.json', '{"private":"no"}');
  assert.throws(() => captureBuildInputs(state.mobile), /검토하지 않은/u);
});

test('a symlink or junction in an input parent cannot escape the source root', (t) => {
  const state = fixture(t);
  const linkedParent = path.join(state.root, 'linked-apps');
  fs.symlinkSync(path.join(state.root, 'apps'), linkedParent, 'junction');
  assert.throws(() => captureBuildInputs(path.join(linkedParent, 'mobile')), /junction/u);
});

test('snapshot pins public settings and build identity without copying private data or tests', (t) => {
  const state = prepared(t);
  const manifest = readJson(path.join(state.buildRoot, 'inputs.json'));
  const eas = readJson(path.join(state.projectRoot, 'eas.json'));
  assert.equal(manifest.sourceFingerprint, captureBuildInputs(state.mobile).fingerprint);
  assert.equal(manifest.projectId, projectId);
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_DEVICE_RUN_ID, state.buildNonce);
  assert.equal(eas.build.preview.env.STORE_PRICE_BUILD_NONCE, state.buildNonce);
  assert.equal(eas.build.preview.env.STORE_PRICE_ANDROID_PACKAGE, state.applicationId);
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, fakeKey);
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN, 'disabled');
  for (const relative of ['.env.local', 'src/data/sample.test.ts', 'data/private/source.json']) {
    assert.equal(fs.existsSync(path.join(state.projectRoot, relative)), false);
  }
  assert.equal(JSON.stringify(manifest).includes(fakeKey), false);
  assert.equal(readJson(path.join(state.mobile, 'eas.json')).build.preview.env.STORE_PRICE_ANDROID_PACKAGE, undefined);
});

test('missing EAS project or public catalog settings is refused before creating artifacts', (t) => {
  const state = fixture(t);
  const appFile = path.join(state.mobile, 'app.json');
  const original = readJson(appFile);
  writeJson(appFile, { expo: { extra: {} } });
  assert.throws(() => prepareStandaloneSnapshot(state.root), /프로젝트 연결/u);
  writeJson(appFile, original);
  fs.unlinkSync(path.join(state.mobile, '.env.local'));
  assert.throws(() => prepareStandaloneSnapshot(state.root), /Supabase/u);
  assert.equal(fs.existsSync(path.join(state.root, '.artifacts')), false);
});

test('development profile, missing APK type and enabled private fixture cannot become standalone snapshots', (t) => {
  const state = fixture(t);
  const file = path.join(state.mobile, 'eas.json');
  const original = readJson(file);
  const changes = [
    (value) => { value.build.preview.developmentClient = true; },
    (value) => { delete value.build.preview.android.buildType; },
    (value) => { value.build.preview.env.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW = '1'; },
    (value) => { value.build.preview.env.EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN = ''; },
    (value) => { value.build.preview.android.gradleCommand = ':app:assembleDebug'; },
    (value) => { value.build.preview.android.developmentClient = true; },
    (value) => { value.build.preview.android.env = { EXPO_PUBLIC_CATALOG_TEST_SCENARIO: 'pending' }; },
  ];
  for (const change of changes) {
    const altered = structuredClone(original);
    change(altered); writeJson(file, altered);
    assert.throws(() => prepareStandaloneSnapshot(state.root), /preview 빌드 설정/u);
  }
  assert.equal(fs.existsSync(path.join(state.root, '.artifacts')), false);
});

test('artifact parent junction is refused before writing to its target', (t) => {
  const state = fixture(t);
  const outside = temporary(t);
  fs.symlinkSync(outside, path.join(state.root, '.artifacts'), 'junction');
  assert.throws(() => prepareStandaloneSnapshot(state.root), /junction/u);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('finished EAS record must match this project, nonce and release preview', () => {
  const manifest = { projectId, buildNonce: 'standalone-0123456789abcdef', applicationId: 'com.ungjo.storeprice.offline.b0123456789abcdef' };
  const record = finishedRecord(manifest);
  assert.equal(validateBuildRecord(record, manifest), record.artifacts.applicationArchiveUrl);
  for (const overrides of [
    { id: 'bad-id' }, { status: 'IN_PROGRESS' }, { platform: 'IOS' },
    { buildProfile: 'development' }, { distribution: 'STORE' }, { app: { id: buildId } }, { app: undefined, project: { id: projectId } },
    { message: 'standalone-ffffffffffffffff' }, { appIdentifier: 'com.other.app' }, { appIdentifier: undefined },
  ]) assert.throws(() => validateBuildRecord({ ...record, ...overrides }, manifest), /전용 Android/u);
  assert.equal(validateBuildRecord({ ...record, artifacts: { buildUrl: 'https://expo.dev/artifacts/eas/legacy.apk' } }, manifest), 'https://expo.dev/artifacts/eas/legacy.apk');
});

test('artifact URL rejects lookalike origins, credentials, insecure schemes and ambiguous locations', () => {
  const manifest = { projectId, buildNonce: 'standalone-0123456789abcdef', applicationId: 'com.ungjo.storeprice.offline.b0123456789abcdef' };
  for (const url of [
    'http://expo.dev/file.apk', 'https://expo.dev.attacker.invalid/file.apk',
    'https://attacker.invalid/expo.dev/file.apk', 'https://user:secret@expo.dev/file.apk',
    'https://expo.dev:8443/file.apk', 'https://expo.dev/file.apk#fragment', 'not a URL',
    'https://wf-artifacts.eascdn.net/initial-record.apk',
  ]) assert.throws(() => validateBuildRecord(finishedRecord(manifest, { artifacts: { applicationArchiveUrl: url } }), manifest), /공식 APK/u);
});

test('download binds exact APK bytes to a public provenance record and never overwrites an existing APK', async (t) => {
  const state = prepared(t);
  writeBuild(state);
  const bytes = fakeApk();
  installFetch(t, async () => new Response(bytes));
  const result = await finishStandaloneDownload(state.root, state.buildRoot);
  const provenance = readJson(result.provenancePath);
  assert.equal(provenance.sha256, hash(bytes));
  assert.equal(provenance.buildNonce, state.buildNonce);
  assert.equal(provenance.sourceFingerprint, state.sourceFingerprint);
  assert.equal(JSON.stringify(provenance).includes(fakeKey), false);
  await assert.rejects(finishStandaloneDownload(state.root, state.buildRoot), /EEXIST/u);
  assert.equal(hash(fs.readFileSync(path.join(state.buildRoot, 'app.apk'))), provenance.sha256);
});

test('observed EAS CDN is allowed only as the final response from a valid Expo build URL', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async (url) => {
    assert.equal(url, 'https://expo.dev/artifacts/eas/fixture.apk');
    const response = new Response(fakeApk());
    Object.defineProperty(response, 'url', { value: 'https://wf-artifacts.eascdn.net/fixture.apk' });
    return response;
  });
  const result = await finishStandaloneDownload(state.root, state.buildRoot);
  assert.equal(readJson(result.provenancePath).buildId, buildId);
});

test('source changes after preparation block download before network access', async (t) => {
  const state = prepared(t); writeBuild(state); noFetch(t);
  write(state.mobile, 'App.tsx', '// changed after snapshot\n');
  await assert.rejects(finishStandaloneDownload(state.root, state.buildRoot), /앱 소스가 바뀌/u);
});

test('catalog configuration changes after preparation block download', async (t) => {
  const state = prepared(t); writeBuild(state); noFetch(t);
  fs.appendFileSync(path.join(state.mobile, '.env.local'), '\n# changed\n');
  await assert.rejects(finishStandaloneDownload(state.root, state.buildRoot), /연결 설정이 바뀌/u);
});

test('snapshot edits and unexpected uploaded files invalidate its fingerprint', async (t) => {
  const state = prepared(t); writeBuild(state); noFetch(t);
  write(state.projectRoot, 'unexpected-secret.txt', 'not uploaded originally');
  await assert.rejects(finishStandaloneDownload(state.root, state.buildRoot), /복사본이 바뀌/u);
});

test('a source edit while bytes are downloaded prevents provenance from being issued', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async () => {
    write(state.mobile, 'App.tsx', '// changed during download\n');
    return new Response(fakeApk());
  });
  await assert.rejects(finishStandaloneDownload(state.root, state.buildRoot), /앱 소스가 바뀌/u);
  assert.equal(fs.existsSync(path.join(state.buildRoot, 'provenance.json')), false);
});

test('download errors are sanitized and a non-APK response cannot issue provenance', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async () => { throw new Error('private signed URL ' + fakeKey); });
  await assert.rejects(finishStandaloneDownload(state.root, state.buildRoot), (error) => {
    assert.equal(error.message.includes(fakeKey), false);
    return /안전하게 내려받지/u.test(error.message);
  });
  globalThis.fetch = async () => new Response('not an APK');
  await assert.rejects(finishStandaloneDownload(state.root, state.buildRoot), /형식이나 크기/u);
  assert.equal(fs.existsSync(path.join(state.buildRoot, 'provenance.json')), false);
});

test('an unexpected redirect origin is refused before accepting APK bytes', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async () => {
    const response = new Response(fakeApk());
    Object.defineProperty(response, 'url', { value: 'https://attacker.invalid/app.apk' });
    return response;
  });
  await assert.rejects(finishStandaloneDownload(state.root, state.buildRoot), /안전하게 내려받지/u);
  assert.equal(fs.existsSync(path.join(state.buildRoot, 'app.apk')), false);
});

test('path traversal, sibling-prefix roots and wrong provenance basenames are rejected', async (t) => {
  const state = prepared(t);
  for (const root of [state.root, path.join(state.root, '.artifacts/build-other', state.buildNonce)]) {
    await assert.rejects(finishStandaloneDownload(state.root, root), /전용 빌드 폴더/u);
  }
  await assert.rejects(captureStandaloneApk({
    repoRoot: state.root, provenancePath: path.join(state.buildRoot, 'other.json'),
  }), /provenance.json/u);
});

test('provenance access refuses a junction in the build folder parent', async (t) => {
  const state = fixture(t);
  const outside = temporary(t);
  fs.symlinkSync(outside, path.join(state.root, '.artifacts'), 'junction');
  await assert.rejects(captureStandaloneApk({
    repoRoot: state.root,
    provenancePath: '.artifacts/build/standalone-0123456789abcdef/provenance.json',
  }), /junction/u);
});

test('changed APK hash or build record prevents native inspection', async (t) => {
  const state = prepared(t); writeBuild(state);
  installFetch(t, async () => new Response(fakeApk()));
  const { provenancePath } = await finishStandaloneDownload(state.root, state.buildRoot);
  fs.appendFileSync(path.join(state.buildRoot, 'app.apk'), 'changed');
  await assert.rejects(captureStandaloneApk({
    repoRoot: state.root, provenancePath,
    run: async () => { assert.fail('출처 검증 전에 native 도구를 호출하면 안 됩니다.'); },
  }), /출처 기록이 일치/u);
  const buildFile = path.join(state.buildRoot, 'build.json');
  const build = readJson(buildFile); build.message = 'wrong-build'; writeJson(buildFile, build);
  await assert.rejects(captureStandaloneApk({ repoRoot: state.root, provenancePath }), /전용 Android/u);
});

test('source-entry tampering and forged in-memory APK states cannot pass verification', async (t) => {
  const state = prepared(t); writeBuild(state); noFetch(t);
  const file = path.join(state.buildRoot, 'inputs.json');
  const manifest = readJson(file);
  manifest.sourceEntries[0].sha256 = '0'.repeat(64); writeJson(file, manifest);
  await assert.rejects(finishStandaloneDownload(state.root, state.buildRoot), /앱 소스가 바뀌/u);
  assert.throws(() => assertStandaloneApkUnchanged(Object.freeze({ sha256: '0'.repeat(64) })), /현재 검사/u);
});

test('certificate parser supports observed Build Tools 37 output without accepting public-key or conflicting hashes', () => {
  const digest = 'a'.repeat(64);
  const modern = 'Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\nV2 Signer: certificate SHA-256 digest: ' + digest + '\n';
  assert.equal(readSignerCertificateSHA256(modern), digest);
  assert.equal(readSignerCertificateSHA256('Verifies\r\nSigner #1 certificate SHA-256 digest: ' + digest.toUpperCase() + '\r\n'), digest);
  assert.equal(readSignerCertificateSHA256(modern + 'Signer #1 certificate SHA-256 digest: ' + digest), digest);
  for (const output of [
    'V2 Signer: certificate SHA-256 digest: ' + digest,
    'Verifies\nV2 Signer: public key SHA-256 digest: ' + digest,
    'Verifies\nV2 Signer: certificate SHA-256 digest: invalid',
    modern + 'Signer #1 certificate SHA-256 digest: ' + 'b'.repeat(64),
    modern + 'Signer #2 certificate SHA-256 digest: ' + digest,
  ]) assert.throws(() => readSignerCertificateSHA256(output), /서명/u);
});
