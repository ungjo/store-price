import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mobileRoot = path.join(repoRoot, 'apps/mobile');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(mobileRoot, name), 'utf8'));
const baseConfig = readJson('app.json').expo;
const eas = readJson('eas.json');
const resolveConfig = createRequire(import.meta.url)(path.join(mobileRoot, 'app.config.js'));
const nonce = 'standalone-0123456789abcdef';
const offlinePackage = 'com.ungjo.storeprice.offline.b0123456789abcdef';
const managedKeys = [
  'STORE_PRICE_APP_VARIANT', 'STORE_PRICE_STANDALONE_BUILD',
  'STORE_PRICE_ANDROID_PACKAGE', 'STORE_PRICE_BUILD_NONCE',
  'EXPO_PUBLIC_DEVICE_RUN_ID', 'EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW',
  'EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN', 'EXPO_PUBLIC_CATALOG_TEST_SCENARIO',
];
const standaloneEnv = {
  STORE_PRICE_APP_VARIANT: 'inspection', STORE_PRICE_STANDALONE_BUILD: '1',
  STORE_PRICE_ANDROID_PACKAGE: offlinePackage, STORE_PRICE_BUILD_NONCE: nonce,
  EXPO_PUBLIC_DEVICE_RUN_ID: nonce,
};

function evaluate(env = {}, config = structuredClone(baseConfig)) {
  const previous = new Map(managedKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of managedKeys) delete process.env[key];
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value;
    }
    return resolveConfig({ config });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function identity(config) {
  return {
    name: config.name, package: config.android.package, version: config.version,
    versionCode: config.android.versionCode, allowBackup: config.android.allowBackup,
    platforms: config.platforms,
  };
}

const commonIdentity = { version: '1.0.0', versionCode: 1, allowBackup: false, platforms: ['android', 'web'] };

test('local default is the fixed inspection app, not the production package', () => {
  assert.deepEqual(identity(evaluate()), {
    name: '꼬마 시장 검사', package: 'com.ungjo.storeprice.inspection', ...commonIdentity,
  });
});

test('explicit production resolves the stable Google Play identity', () => {
  assert.deepEqual(identity(evaluate({ STORE_PRICE_APP_VARIANT: 'production' })), {
    name: '꼬마 시장', package: 'com.ungjo.storeprice', ...commonIdentity,
  });
});

test('existing standalone preview keeps a separate nonce package and metadata', () => {
  const config = evaluate(standaloneEnv);
  assert.deepEqual(identity(config), { name: '꼬마 시장 읽기 검사', package: offlinePackage, ...commonIdentity });
  assert.deepEqual(config.extra.standaloneBuild, { schemaVersion: 1, nonce, androidPackage: offlinePackage });
  assert.equal(evaluate({ ...standaloneEnv, STORE_PRICE_APP_VARIANT: undefined }).android.package, offlinePackage);
});

test('local inspection still accepts the device runner and loading fixtures', () => {
  const config = evaluate({
    EXPO_PUBLIC_DEVICE_RUN_ID: 'device-run-example',
    EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW: '1',
    EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN: 'local-fixture-token',
    EXPO_PUBLIC_CATALOG_TEST_SCENARIO: 'pending',
  });
  assert.equal(config.android.package, 'com.ungjo.storeprice.inspection');
});

test('unknown or misspelled app variants and standalone switches fail closed', () => {
  for (const value of ['', 'preview', 'Production', 'production ', 'production\n']) {
    assert.throws(() => evaluate({ STORE_PRICE_APP_VARIANT: value }), /앱 용도 설정/u);
  }
  for (const value of ['true', 'false', 'disabled', '2', '1\n']) {
    assert.throws(() => evaluate({ STORE_PRICE_STANDALONE_BUILD: value }), /앱 용도 설정/u);
  }
});

test('production rejects standalone, package, nonce and any nonempty run marker', () => {
  const conflicts = [
    { STORE_PRICE_STANDALONE_BUILD: '1' },
    { STORE_PRICE_ANDROID_PACKAGE: 'com.ungjo.storeprice' },
    { STORE_PRICE_BUILD_NONCE: nonce },
    { EXPO_PUBLIC_DEVICE_RUN_ID: 'disabled' },
    { EXPO_PUBLIC_DEVICE_RUN_ID: '0' },
    { EXPO_PUBLIC_DEVICE_RUN_ID: ' ' },
  ];
  for (const conflict of conflicts) {
    assert.throws(() => evaluate({ STORE_PRICE_APP_VARIANT: 'production', ...conflict }), /정식 배포/u);
  }
});

test('production rejects active, malformed and secret-bearing preview fixture variables', () => {
  for (const key of managedKeys.slice(5)) {
    for (const value of ['1', 'false', 'pending', 'disabled ', 'fixture-private-token']) {
      assert.throws(() => evaluate({ STORE_PRICE_APP_VARIANT: 'production', [key]: value }), /정식 배포/u);
    }
  }
});

test('production accepts absent, empty or explicitly disabled preview fixtures', () => {
  for (const value of ['', 'disabled']) {
    const config = evaluate({
      STORE_PRICE_APP_VARIANT: 'production', STORE_PRICE_STANDALONE_BUILD: '0',
      EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW: value,
      EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN: value,
      EXPO_PUBLIC_CATALOG_TEST_SCENARIO: value,
    });
    assert.equal(config.android.package, 'com.ungjo.storeprice');
  }
});

test('inspection refuses leftover standalone identity without its explicit switch', () => {
  for (const env of [
    { STORE_PRICE_ANDROID_PACKAGE: offlinePackage }, { STORE_PRICE_BUILD_NONCE: nonce },
  ]) assert.throws(() => evaluate(env), /전용 preview/u);
});

test('standalone accepts only matching owned package, nonce and optional matching marker', () => {
  for (const change of [
    { STORE_PRICE_ANDROID_PACKAGE: 'com.ungjo.storeprice' },
    { STORE_PRICE_ANDROID_PACKAGE: 'com.ungjo.storeprice.inspection' },
    { STORE_PRICE_ANDROID_PACKAGE: 'com.other.offline.b0123456789abcdef' },
    { STORE_PRICE_ANDROID_PACKAGE: offlinePackage + '\n' },
    { STORE_PRICE_ANDROID_PACKAGE: offlinePackage + 'a' },
    { STORE_PRICE_BUILD_NONCE: 'standalone-fedcba9876543210' },
    { EXPO_PUBLIC_DEVICE_RUN_ID: 'older-run' },
  ]) assert.throws(() => evaluate({ ...standaloneEnv, ...change }), /독립 APK 검사 식별자/u);
  const noMarker = { ...standaloneEnv };
  delete noMarker.EXPO_PUBLIC_DEVICE_RUN_ID;
  assert.equal(evaluate(noMarker).android.package, offlinePackage);
});

test('resolution preserves EAS connection, plugins and Android metadata without mutating input', () => {
  const input = structuredClone(baseConfig);
  input.extra.custom = { retained: true };
  input.extra.standaloneBuild = { nonce: 'stale' };
  const before = structuredClone(input);
  for (const env of [{}, { STORE_PRICE_APP_VARIANT: 'production' }, standaloneEnv]) {
    const resolved = evaluate(env, input);
    assert.deepEqual(resolved.extra.eas, before.extra.eas);
    assert.deepEqual(resolved.extra.custom, before.extra.custom);
    assert.deepEqual(resolved.android.adaptiveIcon, before.android.adaptiveIcon);
    assert.equal(resolved.android.predictiveBackGestureEnabled, false);
    assert.deepEqual(resolved.plugins, before.plugins);
    assert.equal(resolved.owner, before.owner);
    if (env !== standaloneEnv) assert.equal(Object.hasOwn(resolved.extra, 'standaloneBuild'), false);
  }
  assert.deepEqual(input, before);
});

test('ordinary version codes come from app.json while fresh standalone stays at one', () => {
  const config = structuredClone(baseConfig);
  config.android.versionCode = 2;
  assert.equal(evaluate({}, config).android.versionCode, 2);
  assert.equal(evaluate({ STORE_PRICE_APP_VARIANT: 'production' }, config).android.versionCode, 2);
  assert.equal(evaluate(standaloneEnv, config).android.versionCode, 1);
});

test('package and lockfile metadata share the configured release version', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  assert.equal(pkg.version, baseConfig.version);
  assert.equal(lock.version, baseConfig.version);
  assert.equal(lock.packages[''].version, baseConfig.version);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
});

test('EAS profiles keep preview compatibility and explicitly select APK versus store AAB', () => {
  assert.equal(eas.cli.appVersionSource, 'local');
  for (const [name, expected] of Object.entries({
    preview: ['inspection', '1', 'internal', 'preview', 'apk'],
    inspection: ['inspection', '0', 'internal', 'preview', 'apk'],
    production: ['production', '0', 'store', 'production', 'app-bundle'],
  })) {
    const profile = eas.build[name];
    assert.deepEqual([
      profile.env.STORE_PRICE_APP_VARIANT, profile.env.STORE_PRICE_STANDALONE_BUILD,
      profile.distribution, profile.environment, profile.android.buildType,
    ], expected);
    assert.equal(profile.developmentClient, false);
    assert.equal(profile.autoIncrement, false);
    assert.equal(profile.env.EXPO_NO_DOTENV, '1');
    for (const key of managedKeys.slice(5)) assert.equal(profile.env[key], 'disabled');
    for (const key of ['STORE_PRICE_ANDROID_PACKAGE', 'STORE_PRICE_BUILD_NONCE', 'EXPO_PUBLIC_DEVICE_RUN_ID']) {
      assert.equal(Object.hasOwn(profile.env, key), false);
    }
    for (const object of [profile, profile.android]) {
      for (const key of ['gradleCommand', 'extends', 'config']) assert.equal(Object.hasOwn(object, key), false);
    }
    assert.equal(Object.hasOwn(profile.android, 'env'), false);
  }
});

for (const [profileName, expectedName, expectedPackage] of [
  ['inspection', '꼬마 시장 검사', 'com.ungjo.storeprice.inspection'],
  ['production', '꼬마 시장', 'com.ungjo.storeprice'],
  ['preview', '꼬마 시장 읽기 검사', offlinePackage],
]) {
  test('Expo CLI public config resolves the ' + profileName + ' profile', () => {
    // 실제 CLI도 검사하지만, 개발 PC의 공개 키·토큰·.env가 테스트 출력이나 결과에 섞이지 않게 합니다.
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('EXPO_PUBLIC_') || key.startsWith('STORE_PRICE_')) delete env[key];
    }
    delete env.EAS_BUILD_PROFILE;
    Object.assign(env, eas.build[profileName].env, { CI: '1', EXPO_OFFLINE: '1' });
    if (profileName === 'preview') Object.assign(env, standaloneEnv);
    const result = spawnSync(process.execPath, [
      path.join(mobileRoot, 'node_modules/expo/bin/cli'), 'config', '--type', 'public', '--json',
    ], { cwd: mobileRoot, env, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(result.error, undefined, 'Expo CLI could not run.');
    assert.equal(result.status, 0, 'Expo CLI public config failed.');
    let config;
    try { config = JSON.parse(result.stdout); }
    catch { assert.fail('Expo CLI did not return public config JSON.'); }
    assert.deepEqual(identity(config), { name: expectedName, package: expectedPackage, ...commonIdentity });
    assert.deepEqual(config.extra.eas, baseConfig.extra.eas);
    assert.equal(config.owner, baseConfig.owner);
    assert.equal(config.slug, baseConfig.slug);
    if (profileName === 'preview') assert.equal(config.extra.standaloneBuild.nonce, nonce);
    else assert.equal(Object.hasOwn(config.extra, 'standaloneBuild'), false);
    console.log(JSON.stringify({ profile: profileName, ...identity(config) }));
  });
}
