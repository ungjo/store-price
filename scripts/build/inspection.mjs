import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureBuildInputs, readSignerCertificateSHA256 } from './standalone.mjs';
import { captureCatalogEnvironment, pinnedCatalogEnvironment } from '../device/catalog-http-check.mjs';

const sha = (data) => createHash('sha256').update(data).digest('hex');
export const INSPECTION_APPLICATION_ID = 'com.ungjo.storeprice.inspection';
const applicationName = '꼬마 시장 검사';
const states = new WeakMap();
const historicalStates = new WeakMap();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const digestPattern = /^[a-f0-9]{64}$/u;
const matches = (pattern, value) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const disabledKeys = ['EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW', 'EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN', 'EXPO_PUBLIC_CATALOG_TEST_SCENARIO'];
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const validVersionCode = (value) => Number.isSafeInteger(value) && value > 0 && value <= 2_100_000_000;

// 버전은 도우미의 고정 상수가 아니라 이번 빌드의 앱 설정에서 정합니다.
// Android 코드의 문자열 변환은 검증 뒤 한 번만 해 과거 입력 기록과 같은 형식을 유지합니다.
function readAppVersion(config) {
  const versionName = config?.android?.version ?? config?.version;
  if (!matches(versionPattern, versionName) || !validVersionCode(config?.android?.versionCode)) {
    throw new Error('앱 버전은 숫자 세 부분, Android versionCode는 1~2100000000의 정수여야 합니다.');
  }
  return { versionName, versionCode: String(config.android.versionCode) };
}

// 마지막 파일뿐 아니라 부모 폴더의 junction도 확인해 허용 경로 밖의 자료를 따라가지 않습니다.
function checkedPath(file, { allowMissing = false } = {}) {
  const absolute = path.resolve(file);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (allowMissing && error.code === 'ENOENT') return absolute;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('빌드 경로의 심볼릭 링크나 junction은 허용하지 않습니다.');
  }
  return absolute;
}

function checkedBuildRoot(repoRoot, buildRoot, options) {
  const parent = path.resolve(repoRoot, '.artifacts/build');
  const absolute = path.resolve(buildRoot);
  const relative = path.relative(parent, absolute);
  if (!matches(/^inspection-[a-f0-9]{16}$/u, relative)) throw new Error('APK 기록은 .artifacts/build의 전용 빌드 폴더 안에 있어야 합니다.');
  checkedPath(parent, options);
  return checkedPath(absolute, options);
}

function ordinary(file) {
  checkedPath(file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('빌드 입력은 일반 파일이어야 합니다: ' + path.basename(file));
  return fs.readFileSync(file);
}

function snapshotFiles(projectRoot) {
  checkedPath(projectRoot);
  const entries = [];
  const walk = (relative = '') => {
    for (const item of fs.readdirSync(path.join(projectRoot, relative), { withFileTypes: true })) {
      if (!relative && ['node_modules', '.expo'].includes(item.name)) continue;
      const name = relative ? relative + '/' + item.name : item.name;
      if (item.isSymbolicLink()) throw new Error('빌드 복사본에 링크가 있습니다.');
      if (item.isDirectory()) walk(name);
      else entries.push({ name, sha256: sha(ordinary(path.join(projectRoot, name))) });
    }
  };
  walk();
  return sha(JSON.stringify(entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))));
}

function loadJson(file) {
  const bytes = ordinary(file);
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('빌드 설정 또는 기록의 JSON 형식이 올바르지 않습니다.'); }
}
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }

function validateProfile(eas) {
  const profile = eas?.build?.inspection;
  const allowedEnv = new Set([
    'STORE_PRICE_APP_VARIANT', 'STORE_PRICE_STANDALONE_BUILD', 'EXPO_NO_DOTENV',
    ...disabledKeys, 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]);
  if (eas?.cli?.appVersionSource !== 'local'
    || !profile || profile.developmentClient !== false || profile.distribution !== 'internal'
    || profile.environment !== 'preview' || profile.android?.buildType !== 'apk'
    || profile.autoIncrement !== false
    || profile.android?.autoIncrement || profile.android?.gradleCommand || profile.gradleCommand
    || profile.extends || profile.config || profile.android?.config
    || profile.android?.developmentClient || profile.android?.distribution || profile.android?.env
    || profile.env?.STORE_PRICE_APP_VARIANT !== 'inspection'
    || profile.env?.STORE_PRICE_STANDALONE_BUILD !== '0' || profile.env?.EXPO_NO_DOTENV !== '1'
    || disabledKeys.some((key) => profile.env?.[key] !== 'disabled')
    || Object.keys(profile.env ?? {}).some((key) => !allowedEnv.has(key))) {
    throw new Error('고정 검사 앱용 inspection 빌드 설정을 먼저 확인해 주세요.');
  }
  return profile;
}

export function prepareInspectionSnapshot(repoRoot) {
  repoRoot = checkedPath(repoRoot);
  const mobileRoot = path.join(repoRoot, 'apps/mobile');
  const config = loadJson(path.join(mobileRoot, 'app.json')).expo;
  if (!matches(uuid, config?.extra?.eas?.projectId)) throw new Error('먼저 Expo 계정 로그인과 EAS 프로젝트 연결을 완료해 주세요.');
  const { versionName, versionCode } = readAppVersion(config);
  const eas = loadJson(path.join(mobileRoot, 'eas.json'));
  const profile = validateProfile(eas);
  const input = captureBuildInputs(mobileRoot);
  const catalog = captureCatalogEnvironment(mobileRoot);
  const buildNonce = 'inspection-' + randomBytes(8).toString('hex');
  const applicationId = INSPECTION_APPLICATION_ID;
  const buildRoot = path.join(repoRoot, '.artifacts/build', buildNonce);
  checkedBuildRoot(repoRoot, buildRoot, { allowMissing: true });
  const head = spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  if (head.status !== 0 || !matches(/^[a-f0-9]{40,64}$/u, head.stdout.trim())) throw new Error('빌드 시작 커밋을 확인하지 못했습니다.');
  const projectRoot = path.join(buildRoot, 'project');
  fs.mkdirSync(path.dirname(buildRoot), { recursive: true });
  checkedPath(path.dirname(buildRoot));
  fs.mkdirSync(buildRoot);
  fs.mkdirSync(projectRoot);
  // 원자료·환경 파일·검사 로그를 복사하지 않고, 기존 빌드 입력 허용 목록만 그대로 사용합니다.
  for (const { name, sha256 } of input.entries) {
    const target = path.join(projectRoot, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const bytes = ordinary(path.join(mobileRoot, name));
    if (sha(bytes) !== sha256) throw new Error('복사하는 동안 앱 소스가 바뀌었습니다. 새 빌드를 준비해 주세요.');
    fs.writeFileSync(target, bytes, { flag: 'wx' });
  }
  const env = pinnedCatalogEnvironment(catalog, {}, buildNonce);
  // 고정 패키지의 빌드 구분은 화면 표시 하나로 전달합니다. 최초 실행용 패키지 override는 주입하지 않습니다.
  const snapshotEas = {
    cli: eas.cli,
    build: { inspection: { ...profile, env: { ...profile.env, ...env } } },
  };
  fs.writeFileSync(path.join(projectRoot, 'eas.json'), JSON.stringify(snapshotEas, null, 2) + '\n');
  fs.writeFileSync(path.join(projectRoot, '.easignore'), 'node_modules/\n.expo/\n.git/\n.env*\n*.log\n');
  if (captureBuildInputs(mobileRoot).fingerprint !== input.fingerprint
    || captureCatalogEnvironment(mobileRoot).fingerprint !== catalog.fingerprint) throw new Error('빌드 복사 중 입력이 바뀌었습니다. 다시 준비해 주세요.');
  const manifest = {
    schemaVersion: 1, kind: 'inspection', preparedAt: new Date().toISOString(),
    buildNonce, applicationId, applicationName, versionName, versionCode,
    projectId: config.extra.eas.projectId, gitHead: head.stdout.trim(),
    sourceFingerprint: input.fingerprint, sourceEntries: input.entries,
    catalogEnvFingerprint: catalog.fingerprint, snapshotFingerprint: snapshotFiles(projectRoot),
  };
  writeJson(path.join(buildRoot, 'inputs.json'), manifest);
  return { buildRoot, projectRoot, buildNonce, applicationId, sourceFingerprint: input.fingerprint };
}

function validIdentity(manifest) {
  return manifest?.schemaVersion === 1 && manifest.kind === 'inspection'
    && matches(uuid, manifest.projectId)
    && matches(/^inspection-[a-f0-9]{16}$/u, manifest.buildNonce)
    && manifest.applicationId === INSPECTION_APPLICATION_ID
    && manifest.applicationName === applicationName
    && matches(versionPattern, manifest.versionName)
    && matches(/^[1-9]\d*$/u, manifest.versionCode) && validVersionCode(Number(manifest.versionCode));
}

function assertInputs(repoRoot, buildRoot, manifest, { historical = false } = {}) {
  checkedBuildRoot(repoRoot, buildRoot);
  if (!validIdentity(manifest) || path.basename(buildRoot) !== manifest.buildNonce
    || !matches(/^[a-f0-9]{40,64}$/u, manifest.gitHead)
    || !matches(digestPattern, manifest.snapshotFingerprint)
    || !matches(digestPattern, manifest.catalogEnvFingerprint)) throw new Error('일반 검사 APK 입력 기록 형식이 올바르지 않습니다.');
  if (historical) {
    // 과거 APK는 현재 소스와 다를 수 있지만, 당시 파일 목록과 업로드 복사본은 여전히 같아야 합니다.
    const original = manifest.sourceEntries;
    const snapshot = captureBuildInputs(path.join(buildRoot, 'project'));
    if (!Array.isArray(original) || original.length !== snapshot.entries.length
      || !matches(digestPattern, manifest.sourceFingerprint) || sha(JSON.stringify(original)) !== manifest.sourceFingerprint
      || original.some((entry, index) => !entry || entry.name !== snapshot.entries[index].name
        || !matches(digestPattern, entry.sha256)
        // eas.json만 공개 설정·빌드 표시를 준비 과정에서 주입합니다. 복사본 전체 지문으로 따로 고정합니다.
        || (entry.name !== 'eas.json' && entry.sha256 !== snapshot.entries[index].sha256))) {
      throw new Error('과거 APK의 원본 입력과 업로드 복사본이 일치하지 않습니다.');
    }
  } else {
    const actual = captureBuildInputs(path.join(repoRoot, 'apps/mobile'));
    if (actual.fingerprint !== manifest.sourceFingerprint || JSON.stringify(actual.entries) !== JSON.stringify(manifest.sourceEntries)) throw new Error('APK 빌드 이후 앱 소스가 바뀌었습니다. 새 APK를 만들어 주세요.');
  }
  // 입력 기록의 버전만 바꿔 다른 APK를 끼워 넣지 못하도록 지문으로 확인한 원본 설정에도 연결합니다.
  const configuredVersion = readAppVersion(loadJson(path.join(historical ? path.join(buildRoot, 'project') : path.join(repoRoot, 'apps/mobile'), 'app.json')).expo);
  if (configuredVersion.versionName !== manifest.versionName || configuredVersion.versionCode !== manifest.versionCode) {
    throw new Error('빌드 입력 기록의 버전이 앱 설정과 다릅니다.');
  }
  const project = path.join(buildRoot, 'project');
  if (snapshotFiles(project) !== manifest.snapshotFingerprint) throw new Error('업로드한 앱 복사본이 바뀌었습니다.');
  const catalog = captureCatalogEnvironment(path.join(repoRoot, 'apps/mobile'));
  if (historical) {
    // 과거 APK는 업로드 복사본과 서명된 번들에 실제로 고정한 공개 URL·키로 대조합니다.
    // 다른 작업 폴더에서 주석이나 줄바꿈만 달라져도 같은 접속 설정을 검증할 수 있습니다.
    const saved = loadJson(path.join(project, 'eas.json')).build.inspection.env;
    const active = pinnedCatalogEnvironment(catalog, {});
    if (saved.EXPO_PUBLIC_SUPABASE_URL !== active.EXPO_PUBLIC_SUPABASE_URL
      || saved.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== active.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('과거 APK와 현재 앱의 공개 상품 연결 설정이 바뀌었습니다.');
    }
  } else if (catalog.fingerprint !== manifest.catalogEnvFingerprint) {
    throw new Error('APK 빌드 이후 공개 상품 연결 설정이 바뀌었습니다.');
  }
}

function officialArtifactUrl(value, { finalResponse = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Expo 공식 APK 다운로드 주소가 아닙니다.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port
    || (!['expo.dev', 'expo.io', 'eas-build-artifacts.s3.amazonaws.com'].some((host) => url.hostname === host || url.hostname.endsWith('.' + host))
      // 실제 EAS 빌드 URL의 이동 결과로 확인한 호스트만 최종 응답에서 추가 허용합니다.
      && !(finalResponse && url.hostname === 'wf-artifacts.eascdn.net'))) throw new Error('Expo 공식 APK 다운로드 주소가 아닙니다.');
  return url.href;
}

export function validateInspectionBuildRecord(record, manifest) {
  // 고정 패키지의 다른 빌드를 섞지 않도록 EAS 프로필과 이번 message·버전을 함께 연결합니다.
  if (!validIdentity(manifest) || !record || !matches(uuid, record.id)
    || record.status !== 'FINISHED' || record.platform !== 'ANDROID'
    || record.buildProfile !== 'inspection' || record.distribution !== 'INTERNAL'
    || record.app?.id !== manifest.projectId || record.message !== manifest.buildNonce
    || record.appIdentifier !== INSPECTION_APPLICATION_ID
    || record.appVersion !== manifest.versionName || String(record.appBuildVersion) !== manifest.versionCode) {
    throw new Error('완료된 고정 검사 앱의 Android 빌드 기록이 필요합니다.');
  }
  return officialArtifactUrl(record.artifacts?.applicationArchiveUrl ?? record.artifacts?.buildUrl);
}

export async function finishInspectionDownload(repoRoot, buildRoot) {
  repoRoot = checkedPath(repoRoot);
  buildRoot = checkedBuildRoot(repoRoot, buildRoot);
  const manifest = loadJson(path.join(buildRoot, 'inputs.json'));
  assertInputs(repoRoot, buildRoot, manifest);
  const buildFile = path.join(buildRoot, 'build.json');
  const build = loadJson(buildFile);
  const buildRecordSha256 = sha(ordinary(buildFile));
  const url = validateInspectionBuildRecord(build, manifest);
  const apkPath = path.join(buildRoot, 'app.apk');
  const provenancePath = path.join(buildRoot, 'provenance.json');
  if (fs.existsSync(apkPath) || fs.existsSync(provenancePath)) throw new Error('이미 내려받은 APK 또는 출처 기록은 덮어쓰지 않습니다.');
  let apk;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) throw new Error('download-failed');
    if (response.url) officialArtifactUrl(response.url, { finalResponse: true });
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 500_000_000) { await reader.cancel(); throw new Error('download-too-large'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    apk = Buffer.concat(chunks, size);
  } catch { throw new Error('완료된 APK를 안전하게 내려받지 못했습니다. 다운로드 주소와 연결을 확인해 주세요.'); }
  if (apk.length < 1_000_000 || apk.length > 500_000_000 || apk.readUInt32LE(0) !== 0x04034b50) throw new Error('APK 파일 형식이나 크기가 올바르지 않습니다.');
  assertInputs(repoRoot, buildRoot, manifest);
  if (sha(ordinary(buildFile)) !== buildRecordSha256) throw new Error('다운로드 중 EAS 빌드 기록이 바뀌었습니다.');
  fs.writeFileSync(apkPath, apk, { flag: 'wx' });
  const provenance = {
    schemaVersion: 1, kind: 'inspection', buildId: build.id, projectId: manifest.projectId,
    buildNonce: manifest.buildNonce, applicationId: manifest.applicationId,
    sha256: sha(apk), sourceFingerprint: manifest.sourceFingerprint,
    buildRecordSha256, downloadedAt: new Date().toISOString(),
  };
  writeJson(path.join(buildRoot, 'provenance.json'), provenance);
  return { provenancePath: path.join(buildRoot, 'provenance.json'), sha256: provenance.sha256, buildId: build.id };
}

export function assertInspectionApkUnchanged(state) {
  const details = states.get(state);
  if (!details) throw new Error('현재 검사에서 확인한 APK 상태가 필요합니다.');
  assertInputs(details.repoRoot, details.buildRoot, details.manifest);
  for (const [file, fingerprint] of details.files) if (sha(ordinary(file)) !== fingerprint) throw new Error('검사 중 APK 또는 빌드 기록이 바뀌었습니다.');
}

function historicalIdentity(expected) {
  if (!expected || expected.applicationId !== INSPECTION_APPLICATION_ID
    || !matches(uuid, expected.buildId) || !matches(/^inspection-[a-f0-9]{16}$/u, expected.buildNonce)
    || !matches(digestPattern, expected.sha256) || !matches(digestPattern, expected.sourceFingerprint)
    || !matches(digestPattern, expected.signerCertificateSHA256)
    || !matches(versionPattern, expected.versionName)
    || !matches(/^[1-9]\d*$/u, expected.versionCode) || !validVersionCode(Number(expected.versionCode))) {
    throw new Error('과거 통과 기록에서 확인한 APK 식별 정보가 필요합니다.');
  }
  return Object.freeze(Object.fromEntries([
    'applicationId', 'buildId', 'buildNonce', 'sha256', 'sourceFingerprint',
    'versionName', 'versionCode', 'signerCertificateSHA256',
  ].map((key) => [key, expected[key]])));
}

function assertHistoricalIdentity(actual, expected, { beforeSignature = false } = {}) {
  if (Object.keys(expected).some((key) => !(beforeSignature && key === 'signerCertificateSHA256') && actual[key] !== expected[key])) {
    throw new Error('과거 통과 기록과 APK의 지문·서명·식별 정보가 다릅니다.');
  }
}

export function assertHistoricalInspectionApkUnchanged(state) {
  // 과거 상태를 현재 APK 검사에 넘기거나 객체를 복사해 검증을 건너뛰지 못하도록 저장소를 분리합니다.
  const details = historicalStates.get(state);
  if (!details) throw new Error('현재 검사에서 별도로 확인한 과거 APK 상태가 필요합니다.');
  assertInputs(details.repoRoot, details.buildRoot, details.manifest, { historical: true });
  assertHistoricalIdentity(state, details.expected);
  for (const [file, fingerprint] of details.files) if (sha(ordinary(file)) !== fingerprint) throw new Error('검사 중 과거 APK 또는 빌드 기록이 바뀌었습니다.');
}

export function validateInspectionApkEvidence(evidence, expected) {
  if (!validIdentity(expected)) throw new Error('검사할 APK 식별 정보가 올바르지 않습니다.');
  const parts = evidence.summary?.trim().split(/\s+/u);
  if (parts?.length !== 3 || parts[0] !== INSPECTION_APPLICATION_ID
    || parts[1] !== expected.versionCode || parts[2] !== expected.versionName) throw new Error('APK 식별자 또는 버전이 빌드 설정과 다릅니다.');
  if (evidence.debuggable?.trim() !== 'false') throw new Error('디버그 앱은 일반 검사 APK로 사용하지 않습니다.');
  const applicationTag = /<application\b[^>]*>/u.exec(evidence.manifestXml ?? '')?.[0];
  if (!applicationTag || !/\bandroid:allowBackup="false"/u.test(applicationTag)) throw new Error('APK 백업 복원이 차단되어 있지 않습니다.');
  const labels = (evidence.badging ?? '').split(/\r?\n/u).filter((line) => line.startsWith('application-label:'));
  const activities = (evidence.badging ?? '').split(/\r?\n/u).filter((line) => line.startsWith('launchable-activity:'));
  if (labels.length !== 1 || labels[0] !== "application-label:'" + applicationName + "'"
    || activities.length !== 1
    || !activities[0].startsWith("launchable-activity: name='" + INSPECTION_APPLICATION_ID + ".MainActivity' ")) {
    throw new Error('APK의 표시 이름 또는 시작 화면이 검사 앱과 다릅니다.');
  }
  if (!(evidence.files ?? '').split(/\r?\n/u).some((file) => file.trim() === '/assets/index.android.bundle')) throw new Error('APK 안에 앱 실행 번들이 없습니다.');
  if (!Buffer.isBuffer(evidence.bundle) || !evidence.bundle.includes(Buffer.from(expected.buildNonce))) throw new Error('APK에 이번 빌드의 식별자가 포함되어 있지 않습니다.');
  const { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } = expected.env ?? {};
  if (typeof url !== 'string' || !url || typeof key !== 'string' || !key
    || !evidence.bundle.includes(Buffer.from(url)) || !evidence.bundle.includes(Buffer.from(key))) {
    throw new Error('APK의 공개 상품 연결 설정이 빌드 복사본과 다릅니다.');
  }
  return {
    applicationId: INSPECTION_APPLICATION_ID, applicationName,
    versionCode: expected.versionCode, versionName: expected.versionName,
    signerCertificateSHA256: readSignerCertificateSHA256(evidence.signature),
    debuggable: false, embeddedBundle: true, backupDisabled: true,
  };
}

export function captureInspectionApk(options) {
  return captureApk(options);
}

export function captureHistoricalInspectionApk(options) {
  return captureApk(options, { historical: true });
}

async function captureApk({ repoRoot, provenancePath, run, tools, expected }, { historical = false } = {}) {
  const historicalExpected = historical ? historicalIdentity(expected) : undefined;
  repoRoot = checkedPath(repoRoot);
  const absolute = path.resolve(repoRoot, provenancePath);
  const buildRoot = checkedBuildRoot(repoRoot, path.dirname(absolute));
  if (path.basename(absolute) !== 'provenance.json') throw new Error('APK 기록 파일 이름은 provenance.json이어야 합니다.');
  const manifest = loadJson(path.join(buildRoot, 'inputs.json'));
  const provenance = loadJson(absolute);
  const buildFile = path.join(buildRoot, 'build.json');
  const build = loadJson(buildFile);
  assertInputs(repoRoot, buildRoot, manifest, { historical });
  validateInspectionBuildRecord(build, manifest);
  const apkPath = path.join(buildRoot, 'app.apk');
  if (!provenance || provenance.schemaVersion !== 1 || provenance.kind !== 'inspection'
    || !matches(digestPattern, provenance.sha256) || provenance.buildId !== build.id || provenance.projectId !== manifest.projectId
    || provenance.buildNonce !== manifest.buildNonce || provenance.applicationId !== manifest.applicationId
    || provenance.sourceFingerprint !== manifest.sourceFingerprint
    || provenance.buildRecordSha256 !== sha(ordinary(buildFile))
    || sha(ordinary(apkPath)) !== provenance.sha256) throw new Error('APK 파일과 빌드 출처 기록이 일치하지 않습니다.');
  if (historical) assertHistoricalIdentity({
    applicationId: manifest.applicationId, buildNonce: manifest.buildNonce, buildId: build.id,
    versionName: manifest.versionName, versionCode: manifest.versionCode,
    sha256: provenance.sha256, sourceFingerprint: manifest.sourceFingerprint,
  }, historicalExpected, { beforeSignature: true });
  const fingerprints = [absolute, apkPath, buildFile, path.join(buildRoot, 'inputs.json')].map((file) => [file, sha(ordinary(file))]);
  const toolRoot = path.join(process.env.LOCALAPPDATA || '', 'store-price-tools/android-inspection');
  const analyzer = process.env.STORE_PRICE_APKANALYZER || path.join(toolRoot, 'cmdline-tools/latest/bin/apkanalyzer.bat');
  const signer = process.env.STORE_PRICE_APKSIGNER || path.join(toolRoot, 'build-tools/37.0.0/apksigner.bat');
  const aapt = process.env.STORE_PRICE_AAPT2 || path.join(toolRoot, 'build-tools/37.0.0/aapt2.exe');
  const label = historical ? 'historical-inspection-apk-' : 'inspection-apk-';
  const inspect = async (name, args) => (await run(label + name, analyzer, [...args, apkPath], { timeout: 120_000 })).stdout.trim();
  const evidence = {
    summary: await inspect('summary', ['apk', 'summary']),
    debuggable: await inspect('debuggable', ['manifest', 'debuggable']),
    manifestXml: await inspect('manifest', ['manifest', 'print']),
    files: await inspect('files', ['files', 'list']),
    badging: (await run(label + 'badging', aapt, ['dump', 'badging', apkPath], { timeout: 120_000 })).stdout,
  };
  // Hermes 번들은 공개 키를 포함하므로 바이너리를 검사 메모리에서만 읽고 원문 로그를 남기지 않습니다.
  const analyzerHome = path.resolve(path.dirname(analyzer), '..');
  const analyzerClasspath = path.join(analyzerHome, 'lib/apkanalyzer-classpath.jar');
  checkedPath(analyzerClasspath);
  const command = spawnSync(tools.java, ['-Dcom.android.sdklib.toolsdir=' + analyzerHome, '-classpath', analyzerClasspath,
    'com.android.tools.apk.analyzer.ApkAnalyzerCli', 'files', 'cat', '--file', '/assets/index.android.bundle', apkPath],
  { env: tools.env, windowsHide: true, maxBuffer: 100 * 1024 * 1024, timeout: 120_000 });
  if (command.status !== 0 || command.error) throw new Error('APK의 실행 번들을 안전하게 읽지 못했습니다.');
  evidence.bundle = command.stdout;
  evidence.signature = (await run(label + 'signature', signer, ['verify', '--verbose', '--print-certs', apkPath], { timeout: 120_000 })).stdout;
  const env = loadJson(path.join(buildRoot, 'project/eas.json')).build.inspection.env;
  const checked = validateInspectionApkEvidence(evidence, { ...manifest, env });
  const state = Object.freeze({
    kind: 'inspection', apkPath, ...checked, buildNonce: manifest.buildNonce,
    sha256: provenance.sha256, buildId: build.id, sourceFingerprint: manifest.sourceFingerprint,
    ...(historical ? { historical: true } : {}),
  });
  if (historical) {
    assertHistoricalIdentity(state, historicalExpected);
    historicalStates.set(state, { repoRoot, buildRoot, manifest, files: fingerprints, expected: historicalExpected });
    assertHistoricalInspectionApkUnchanged(state);
  } else {
    states.set(state, { repoRoot, buildRoot, manifest, files: fingerprints });
    assertInspectionApkUnchanged(state);
  }
  return state;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const [command, directory] = process.argv.slice(2);
  if (command === 'prepare') console.log(JSON.stringify(prepareInspectionSnapshot(repoRoot), null, 2));
  else if (command === 'download' && directory) console.log(JSON.stringify(await finishInspectionDownload(repoRoot, path.resolve(repoRoot, directory)), null, 2));
  else throw new Error('사용법: node scripts/build/inspection.mjs prepare | download <빌드 폴더>');
}
