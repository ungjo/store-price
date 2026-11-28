import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureCatalogEnvironment, pinnedCatalogEnvironment } from '../device/catalog-http-check.mjs';

const sha = (data) => createHash('sha256').update(data).digest('hex');
const baseFiles = ['App.tsx', 'index.ts', 'app.json', 'app.config.js', 'eas.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'eslint.config.js'];
const states = new WeakMap();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const digestPattern = /^[a-f0-9]{64}$/u;

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
  if (!/^standalone-[a-f0-9]{16}$/u.test(relative)) throw new Error('APK 기록은 .artifacts/build의 전용 빌드 폴더 안에 있어야 합니다.');
  checkedPath(parent, options);
  return checkedPath(absolute, options);
}

function ordinary(file) {
  checkedPath(file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('빌드 입력은 일반 파일이어야 합니다: ' + path.basename(file));
  return fs.readFileSync(file);
}

export function captureBuildInputs(mobileRoot) {
  mobileRoot = checkedPath(mobileRoot);
  if (!fs.statSync(mobileRoot).isDirectory()) throw new Error('앱 입력 폴더를 확인해 주세요.');
  const files = [...baseFiles];
  if (fs.existsSync(path.join(mobileRoot, 'metro.config.js'))) files.push('metro.config.js');
  const walk = (relative) => {
    const directory = path.join(mobileRoot, relative);
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('빌드 폴더의 심볼릭 링크는 허용하지 않습니다.');
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = relative + '/' + item.name;
      if (item.isSymbolicLink()) throw new Error('빌드 입력에 심볼릭 링크가 있습니다.');
      if (item.isDirectory()) walk(name);
      else if ((relative.startsWith('src') && /\.(?:ts|tsx)$/u.test(name) && !/\.test\.tsx?$/u.test(name))
        || (relative.startsWith('assets') && /\.(?:png|jpg|jpeg|webp|svg)$/u.test(name))) files.push(name);
      else if (!/\.test\.tsx?$/u.test(name)) throw new Error('검토하지 않은 앱 빌드 입력: ' + name);
    }
  };
  walk('src'); walk('assets');
  const entries = files.sort().map((name) => ({ name, sha256: sha(ordinary(path.join(mobileRoot, name))) }));
  return { entries, fingerprint: sha(JSON.stringify(entries)) };
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

export function prepareStandaloneSnapshot(repoRoot) {
  repoRoot = checkedPath(repoRoot);
  const mobileRoot = path.join(repoRoot, 'apps/mobile');
  const config = loadJson(path.join(mobileRoot, 'app.json')).expo;
  if (!uuid.test(config?.extra?.eas?.projectId ?? '')) throw new Error('먼저 Expo 계정 로그인과 EAS 프로젝트 연결을 완료해 주세요.');
  const easConfig = loadJson(path.join(mobileRoot, 'eas.json'));
  const profile = easConfig?.build?.preview;
  if (!profile || profile.developmentClient !== false || profile.distribution !== 'internal'
    || profile.environment !== 'preview' || profile.android?.buildType !== 'apk'
    || profile.android?.gradleCommand || profile.gradleCommand || profile.extends
    || profile.android?.developmentClient === true || profile.android?.distribution === 'store'
    || profile.android?.env
    || profile.env?.STORE_PRICE_STANDALONE_BUILD !== '1' || profile.env?.EXPO_NO_DOTENV !== '1'
    || ['EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW', 'EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN', 'EXPO_PUBLIC_CATALOG_TEST_SCENARIO']
      .some((key) => profile.env[key] !== 'disabled')
    || profile.env?.EXPO_NO_CLIENT_ENV_VARS) throw new Error('독립 APK용 preview 빌드 설정을 먼저 준비해 주세요.');
  const input = captureBuildInputs(mobileRoot);
  const catalog = captureCatalogEnvironment(mobileRoot);
  const nonce = randomBytes(8).toString('hex');
  const buildNonce = 'standalone-' + nonce;
  const applicationId = 'com.ungjo.storeprice.offline.b' + nonce;
  const buildRoot = path.join(repoRoot, '.artifacts/build', buildNonce);
  checkedBuildRoot(repoRoot, buildRoot, { allowMissing: true });
  const head = spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  if (head.status !== 0 || !/^[a-f0-9]{40,64}$/u.test(head.stdout.trim())) throw new Error('빌드 시작 커밋을 확인하지 못했습니다.');
  const projectRoot = path.join(buildRoot, 'project');
  fs.mkdirSync(path.dirname(buildRoot), { recursive: true });
  checkedPath(path.dirname(buildRoot));
  fs.mkdirSync(buildRoot);
  fs.mkdirSync(projectRoot);
  // 업로드 전용 복사본에는 앱에 필요한 파일만 넣습니다. 원자료·문서·로컬 키는 복사하지 않습니다.
  for (const { name, sha256 } of input.entries) {
    const target = path.join(projectRoot, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const bytes = ordinary(path.join(mobileRoot, name));
    if (sha(bytes) !== sha256) throw new Error('복사하는 동안 앱 소스가 바뀌었습니다. 새 빌드를 준비해 주세요.');
    fs.writeFileSync(target, bytes, { flag: 'wx' });
  }
  const env = pinnedCatalogEnvironment(catalog, {}, buildNonce);
  const eas = loadJson(path.join(projectRoot, 'eas.json'));
  eas.build.preview.env = {
    ...eas.build.preview.env, ...env,
    STORE_PRICE_ANDROID_PACKAGE: applicationId, STORE_PRICE_BUILD_NONCE: buildNonce,
  };
  fs.writeFileSync(path.join(projectRoot, 'eas.json'), JSON.stringify(eas, null, 2) + '\n');
  fs.writeFileSync(path.join(projectRoot, '.easignore'), 'node_modules/\n.expo/\n.git/\n.env*\n*.log\n');
  // 복사가 끝난 시점에도 같은 소스·공개 설정인지 확인한 뒤에만 출처 기록을 만듭니다.
  if (captureBuildInputs(mobileRoot).fingerprint !== input.fingerprint
    || captureCatalogEnvironment(mobileRoot).fingerprint !== catalog.fingerprint) throw new Error('빌드 복사 중 입력이 바뀌었습니다. 다시 준비해 주세요.');
  const manifest = {
    schemaVersion: 1, preparedAt: new Date().toISOString(), buildNonce, applicationId,
    projectId: config.extra.eas.projectId, gitHead: head.stdout.trim(),
    sourceFingerprint: input.fingerprint, sourceEntries: input.entries,
    catalogEnvFingerprint: catalog.fingerprint, snapshotFingerprint: snapshotFiles(projectRoot),
  };
  writeJson(path.join(buildRoot, 'inputs.json'), manifest);
  return { buildRoot, projectRoot, buildNonce, applicationId, sourceFingerprint: input.fingerprint };
}

function assertInputs(repoRoot, buildRoot, manifest) {
  checkedBuildRoot(repoRoot, buildRoot);
  if (!manifest || manifest.schemaVersion !== 1 || !uuid.test(manifest.projectId ?? '')
    || !/^standalone-[a-f0-9]{16}$/u.test(manifest.buildNonce ?? '')
    || manifest.applicationId !== 'com.ungjo.storeprice.offline.b' + manifest.buildNonce.slice(11)
    || path.basename(buildRoot) !== manifest.buildNonce
    || !/^[a-f0-9]{40,64}$/u.test(manifest.gitHead ?? '')
    || !digestPattern.test(manifest.snapshotFingerprint ?? '')) throw new Error('빌드 입력 기록 형식이 올바르지 않습니다.');
  const actual = captureBuildInputs(path.join(repoRoot, 'apps/mobile'));
  if (actual.fingerprint !== manifest.sourceFingerprint || JSON.stringify(actual.entries) !== JSON.stringify(manifest.sourceEntries)) throw new Error('APK 빌드 이후 앱 소스가 바뀌었습니다. 새 APK를 만들어 주세요.');
  if (captureCatalogEnvironment(path.join(repoRoot, 'apps/mobile')).fingerprint !== manifest.catalogEnvFingerprint) throw new Error('APK 빌드 이후 공개 상품 연결 설정이 바뀌었습니다.');
  if (snapshotFiles(path.join(buildRoot, 'project')) !== manifest.snapshotFingerprint) throw new Error('업로드한 앱 복사본이 바뀌었습니다.');
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

export function validateBuildRecord(record, manifest) {
  // EAS CLI 27.10.0의 실제 응답(app.id/appIdentifier)을 확인한 필드로만 출처를 연결합니다.
  if (!record || !uuid.test(record.id ?? '') || record.status !== 'FINISHED' || record.platform !== 'ANDROID'
    || record.buildProfile !== 'preview' || record.distribution !== 'INTERNAL'
    || record.app?.id !== manifest.projectId || record.message !== manifest.buildNonce
    || !record.appIdentifier || record.appIdentifier !== manifest.applicationId) throw new Error('완료된 전용 Android 빌드 기록이 필요합니다.');
  return officialArtifactUrl(record.artifacts?.applicationArchiveUrl ?? record.artifacts?.buildUrl);
}

export async function finishStandaloneDownload(repoRoot, buildRoot) {
  repoRoot = checkedPath(repoRoot);
  buildRoot = checkedBuildRoot(repoRoot, buildRoot);
  const manifest = loadJson(path.join(buildRoot, 'inputs.json'));
  assertInputs(repoRoot, buildRoot, manifest);
  const build = loadJson(path.join(buildRoot, 'build.json'));
  const url = validateBuildRecord(build, manifest);
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
  const apkPath = path.join(buildRoot, 'app.apk');
  fs.writeFileSync(apkPath, apk, { flag: 'wx' });
  assertInputs(repoRoot, buildRoot, manifest);
  const provenance = {
    schemaVersion: 1, buildId: build.id, projectId: manifest.projectId,
    buildNonce: manifest.buildNonce, applicationId: manifest.applicationId,
    sha256: sha(apk), sourceFingerprint: manifest.sourceFingerprint,
    downloadedAt: new Date().toISOString(),
  };
  writeJson(path.join(buildRoot, 'provenance.json'), provenance);
  return { provenancePath: path.join(buildRoot, 'provenance.json'), sha256: provenance.sha256, buildId: build.id };
}

export function assertStandaloneApkUnchanged(state) {
  const details = states.get(state);
  if (!details) throw new Error('현재 검사에서 확인한 APK 상태가 필요합니다.');
  assertInputs(details.repoRoot, details.buildRoot, details.manifest);
  for (const [file, fingerprint] of details.files) if (sha(ordinary(file)) !== fingerprint) throw new Error('검사 중 APK 또는 빌드 기록이 바뀌었습니다.');
}

export function readSignerCertificateSHA256(output) {
  // Build Tools 37은 실제 서명 방식을 이름에 표시합니다. 공개 키 지문과 인증서 지문을 혼동하지 않습니다.
  if (typeof output !== 'string' || !/^Verifies\r?$/mu.test(output)) throw new Error('APK 서명 성공을 확인하지 못했습니다.');
  const lines = output.split(/\r?\n/u).filter((line) => line.includes('certificate SHA-256 digest:'));
  const certificates = lines.map((line) => /^(?:Signer #1|V2 Signer:|V3\.0 Signer:) certificate SHA-256 digest: ([a-f0-9]{64})$/iu.exec(line)?.[1]?.toLowerCase());
  if (certificates.length === 0 || certificates.some((value) => !value) || new Set(certificates).size !== 1) throw new Error('APK 서명 인증서 지문을 확인하지 못했습니다.');
  return certificates[0];
}

export async function captureStandaloneApk({ repoRoot, provenancePath, run, tools }) {
  repoRoot = checkedPath(repoRoot);
  const absolute = path.resolve(repoRoot, provenancePath);
  const buildRoot = checkedBuildRoot(repoRoot, path.dirname(absolute));
  if (path.basename(absolute) !== 'provenance.json') throw new Error('APK 기록 파일 이름은 provenance.json이어야 합니다.');
  checkedPath(absolute);
  const manifest = loadJson(path.join(buildRoot, 'inputs.json'));
  const provenance = loadJson(absolute);
  const build = loadJson(path.join(buildRoot, 'build.json'));
  assertInputs(repoRoot, buildRoot, manifest);
  validateBuildRecord(build, manifest);
  const apkPath = path.join(buildRoot, 'app.apk');
  if (!provenance || provenance.schemaVersion !== 1 || !digestPattern.test(provenance.sha256 ?? '') || provenance.buildId !== build.id || provenance.projectId !== manifest.projectId
    || provenance.buildNonce !== manifest.buildNonce || provenance.applicationId !== manifest.applicationId
    || provenance.sourceFingerprint !== manifest.sourceFingerprint || sha(ordinary(apkPath)) !== provenance.sha256) throw new Error('APK 파일과 빌드 출처 기록이 일치하지 않습니다.');
  const toolRoot = path.join(process.env.LOCALAPPDATA || '', 'store-price-tools/android-inspection');
  const analyzer = process.env.STORE_PRICE_APKANALYZER || path.join(toolRoot, 'cmdline-tools/latest/bin/apkanalyzer.bat');
  const signer = process.env.STORE_PRICE_APKSIGNER || path.join(toolRoot, 'build-tools/37.0.0/apksigner.bat');
  const inspect = async (name, args) => (await run('apk-' + name, analyzer, [...args, apkPath], { timeout: 120_000 })).stdout.trim();
  const summary = await inspect('summary', ['apk', 'summary']);
  const [applicationId, versionCode, versionName] = summary.split(/\s+/u);
  const expectedVersion = loadJson(path.join(repoRoot, 'apps/mobile/app.json')).expo.version;
  if (applicationId !== manifest.applicationId || versionCode !== '1' || versionName !== expectedVersion) throw new Error('APK 식별자 또는 버전이 빌드 설정과 다릅니다.');
  if ((await inspect('debuggable', ['manifest', 'debuggable'])) !== 'false') throw new Error('디버그 앱은 독립 실행 검사에 사용하지 않습니다.');
  const xml = await inspect('manifest', ['manifest', 'print']);
  if (!/android:allowBackup="false"/u.test(xml)) throw new Error('APK 백업 복원이 차단되어 있지 않습니다.');
  const files = await inspect('files', ['files', 'list']);
  if (!files.split(/\r?\n/u).some((file) => file.trim() === '/assets/index.android.bundle')) throw new Error('APK 안에 앱 실행 번들이 없습니다.');
  // .bat와 같은 JVM 진입점을 사용하되 바이너리 stdout/stderr는 파일·로그에 출력하지 않습니다.
  const analyzerHome = path.resolve(path.dirname(analyzer), '..');
  const analyzerClasspath = path.join(analyzerHome, 'lib/apkanalyzer-classpath.jar');
  checkedPath(analyzerClasspath);
  const command = spawnSync(tools.java, ['-Dcom.android.sdklib.toolsdir=' + analyzerHome, '-classpath', analyzerClasspath, 'com.android.tools.apk.analyzer.ApkAnalyzerCli', 'files', 'cat', '--file', '/assets/index.android.bundle', apkPath], { env: tools.env, windowsHide: true, maxBuffer: 100 * 1024 * 1024, timeout: 120_000 });
  if (command.status !== 0 || !command.stdout?.includes(Buffer.from(manifest.buildNonce))) throw new Error('APK에 이번 빌드의 식별자가 포함되어 있지 않습니다.');
  const expectedEnv = loadJson(path.join(buildRoot, 'project/eas.json')).build.preview.env;
  // 비슷한 공개 키가 들어 있는 다른 APK가 아니라 이번 복사본의 연결 설정인지 비교합니다.
  if (!command.stdout.includes(Buffer.from(expectedEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY))
    || !command.stdout.includes(Buffer.from(expectedEnv.EXPO_PUBLIC_SUPABASE_URL))) throw new Error('APK의 공개 상품 연결 설정이 빌드 복사본과 다릅니다.');
  const signature = await run('apk-signature', signer, ['verify', '--verbose', '--print-certs', apkPath], { timeout: 120_000 });
  const certificate = readSignerCertificateSHA256(signature.stdout);
  const state = Object.freeze({ apkPath, applicationId, versionCode, versionName, buildNonce: manifest.buildNonce, sha256: provenance.sha256, buildId: build.id, sourceFingerprint: manifest.sourceFingerprint, signerCertificateSHA256: certificate, debuggable: false, embeddedBundle: true, backupDisabled: true });
  states.set(state, { repoRoot, buildRoot, manifest, files: [absolute, apkPath, path.join(buildRoot, 'build.json'), path.join(buildRoot, 'inputs.json')].map((file) => [file, sha(ordinary(file))]) });
  assertStandaloneApkUnchanged(state);
  return state;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const [command, directory] = process.argv.slice(2);
  if (command === 'prepare') console.log(JSON.stringify(prepareStandaloneSnapshot(repoRoot), null, 2));
  else if (command === 'download' && directory) console.log(JSON.stringify(await finishStandaloneDownload(repoRoot, path.resolve(repoRoot, directory)), null, 2));
  else throw new Error('사용법: node scripts/build/standalone.mjs prepare | download <빌드 폴더>');
}
