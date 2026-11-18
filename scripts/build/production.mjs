import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { captureBuildInputs } from './standalone.mjs';
import { captureCatalogEnvironment, pinnedCatalogEnvironment } from '../device/catalog-http-check.mjs';

const applicationId = 'com.ungjo.storeprice';
const applicationName = '꼬마 시장';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const noncePattern = /^production-[0-9a-f]{16}$/u;
const ignores = 'node_modules/\n.expo/\n.git/\n.env*\n*.log\n';
const sha = (data) => createHash('sha256').update(data).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const states = new WeakMap();

function checked(file) {
  const resolved = path.resolve(file);
  if (path.relative(resolved, fs.realpathSync.native(resolved))) {
    throw new Error('빌드 폴더 안의 링크나 junction은 사용할 수 없습니다.');
  }
  return resolved;
}

function content(file) {
  if (!fs.lstatSync(checked(file)).isFile()) throw new Error('일반 빌드 파일을 확인해 주세요.');
  return fs.readFileSync(file);
}
const readJson = (file) => JSON.parse(content(file).toString('utf8'));

function checkDirectory(repoRoot, folder) {
  const relative = path.relative(path.resolve(repoRoot, '.artifacts/build'), path.resolve(repoRoot, folder));
  if (!noncePattern.test(relative)) throw new Error('정식 빌드 전용 폴더를 지정해 주세요.');
  return checked(path.resolve(repoRoot, folder));
}

export function productionProfile(eas, catalog) {
  const profile = eas.build?.production;
  const switches = {
    STORE_PRICE_APP_VARIANT: 'production', STORE_PRICE_STANDALONE_BUILD: '0',
    EXPO_NO_DOTENV: '1', EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW: 'disabled',
    EXPO_PUBLIC_PRIVATE_PRICE_PREVIEW_TOKEN: 'disabled', EXPO_PUBLIC_CATALOG_TEST_SCENARIO: 'disabled',
  };
  if (eas.cli?.appVersionSource !== 'local' || profile?.environment !== 'production'
    || profile.distribution !== 'store' || profile.autoIncrement !== false || profile.developmentClient !== false
    || profile.android?.buildType !== 'app-bundle' || Object.keys(profile.android).length !== 1
    || Object.keys(profile).some((key) => !['environment', 'developmentClient', 'distribution', 'autoIncrement', 'env', 'android'].includes(key))
    || Object.keys(profile.env ?? {}).length !== Object.keys(switches).length
    || Object.entries(switches).some(([key, value]) => profile.env[key] !== value)) {
    throw new Error('정식 production AAB 프로필과 개발용 설정 비활성화를 확인해 주세요.');
  }
  // 공개 카탈로그 주소와 publishable 키만 복사합니다. EAS 메시지용 번호를 번들에 넣지 않습니다.
  const pinned = pinnedCatalogEnvironment(catalog, {});
  return { cli: eas.cli, build: { production: { ...profile, env: { ...profile.env,
    EXPO_PUBLIC_SUPABASE_URL: pinned.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pinned.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  } } } };
}

function source(repoRoot) {
  const mobileRoot = path.resolve(repoRoot, 'apps/mobile');
  const input = captureBuildInputs(mobileRoot);
  const app = readJson(path.join(mobileRoot, 'app.json')).expo;
  const catalog = captureCatalogEnvironment(mobileRoot);
  const eas = productionProfile(readJson(path.join(mobileRoot, 'eas.json')), catalog);
  if (app.name !== applicationName || app.android?.package !== applicationId
    || !uuid.test(app.extra?.eas?.projectId) || !/^\d+\.\d+\.\d+$/u.test(app.version)
    || !Number.isSafeInteger(app.android.versionCode) || app.android.versionCode <= 0
    || app.android.versionCode > 2100000000) throw new Error('정식 앱 이름·식별자·버전·Expo 프로젝트를 확인해 주세요.');
  // 생성하는 두 파일까지 포함해 실제 업로드 파일 지문을 원본에서 독립적으로 계산합니다.
  const expected = new Map(input.entries.map(({ name, sha256 }) => [name, sha256]));
  expected.set('eas.json', sha(json(eas)));
  expected.set('.easignore', sha(ignores));
  const snapshotFingerprint = sha(JSON.stringify([...expected].sort()));
  return { mobileRoot, eas, input, expected, fields: {
    kind: 'production', schemaVersion: 1, applicationId, applicationName,
    versionName: app.version, versionCode: String(app.android.versionCode), projectId: app.extra.eas.projectId,
    sourceFingerprint: input.fingerprint, catalogEnvFingerprint: catalog.fingerprint, snapshotFingerprint,
  } };
}

function verifySnapshot(projectRoot, expected) {
  const seen = new Set();
  function walk(directory) {
    for (const entry of fs.readdirSync(path.join(projectRoot, directory), { withFileTypes: true })) {
      const name = directory ? directory + '/' + entry.name : entry.name;
      if (['node_modules', '.expo', '.git'].includes(name)) continue;
      const file = path.join(projectRoot, name);
      if (entry.isSymbolicLink()) throw new Error('빌드 복사본에 링크가 있습니다.');
      if (entry.isDirectory()) walk(name);
      else if (!expected.has(name) || sha(content(file)) !== expected.get(name)) throw new Error('업로드 파일이 원본과 다릅니다: ' + name);
      else seen.add(name);
    }
  }
  walk('');
  if (seen.size !== expected.size) throw new Error('업로드 파일이 누락됐습니다.');
}

export function prepareProductionSnapshot(repoRoot) {
  const src = source(repoRoot);
  const parent = path.resolve(repoRoot, '.artifacts/build');
  fs.mkdirSync(parent, { recursive: true });
  checked(parent);
  const buildNonce = 'production-' + randomBytes(8).toString('hex');
  const buildRoot = path.join(parent, buildNonce);
  const projectRoot = path.join(buildRoot, 'project');
  fs.mkdirSync(buildRoot);
  fs.mkdirSync(projectRoot);
  for (const { name } of src.input.entries) {
    const target = path.join(projectRoot, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const bytes = name === 'eas.json' ? json(src.eas) : content(path.join(src.mobileRoot, name));
    fs.writeFileSync(target, bytes, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(projectRoot, '.easignore'), ignores, { flag: 'wx' });
  verifySnapshot(projectRoot, src.expected);
  const gitHead = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  const manifest = { ...src.fields, gitHead, buildNonce, preparedAt: new Date().toISOString(), sourceEntries: src.input.entries };
  fs.writeFileSync(path.join(buildRoot, 'inputs.json'), json(manifest), { flag: 'wx' });
  return { buildRoot, projectRoot, buildNonce, ...src.fields };
}

function assertInputs(repoRoot, buildRoot) {
  const manifest = readJson(path.join(buildRoot, 'inputs.json'));
  const current = source(repoRoot);
  if (manifest.buildNonce !== path.basename(buildRoot)
    || Object.entries(current.fields).some(([key, value]) => manifest[key] !== value)
    || JSON.stringify(manifest.sourceEntries) !== JSON.stringify(current.input.entries)) {
    throw new Error('준비한 기록과 현재 앱 소스·공개 설정이 다릅니다. 새 빌드를 준비해 주세요.');
  }
  verifySnapshot(path.join(buildRoot, 'project'), current.expected);
  return manifest;
}

function officialUrl(value, originalPath) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Expo 공식 AAB 주소가 필요합니다.'); }
  const entry = url.hostname === 'expo.dev' && /^\/artifacts\/eas\/[\w.-]+\.aab$/u.test(url.pathname);
  // Expo는 최초 .aab 주소의 확장자를 뺀 같은 식별자를 API로 전달한 뒤 CDN으로 이동합니다.
  const api = url.hostname === 'api.expo.dev' && originalPath && url.pathname === '/v2' + originalPath.slice(0, -4);
  const storage = ['wf-artifacts.eascdn.net', 'eas-build-artifacts.s3.amazonaws.com'].includes(url.hostname);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash
    || !(entry && (!originalPath || originalPath === url.pathname) || api || (originalPath && storage))) throw new Error('Expo 공식 AAB 다운로드 주소를 확인해 주세요.');
  return url;
}

export function validateProductionBuildRecord(record, manifest, expectedBuildId) {
  // 같은 앱의 다른 빌드와 섞이지 않게 서버가 돌려준 프로젝트·메시지·배포 용도·버전을 모두 확인합니다.
  if (!record || !uuid.test(record.id) || (expectedBuildId !== undefined && record.id !== expectedBuildId)
    || !uuid.test(manifest?.projectId) || !noncePattern.test(manifest?.buildNonce)
    || manifest.kind !== 'production' || manifest.schemaVersion !== 1 || manifest.applicationId !== applicationId
    || record.status !== 'FINISHED' || record.platform !== 'ANDROID' || record.distribution !== 'STORE'
    || record.buildProfile !== 'production' || record.app?.id !== manifest.projectId
    || record.message !== manifest.buildNonce || record.appIdentifier !== applicationId
    || record.appVersion !== manifest.versionName || String(record.appBuildVersion) !== manifest.versionCode) {
    throw new Error('이번 정식 Android 빌드의 완료된 EAS 기록이 필요합니다.');
  }
  return officialUrl(record.artifacts?.applicationArchiveUrl ?? record.artifacts?.buildUrl);
}

async function fetchAab(url) {
  // 서명된 다운로드 주소는 로그에 남기지 않고, 이동할 때마다 다음 호스트를 확인합니다.
  const originalPath = url.pathname;
  const signal = AbortSignal.timeout(300_000);
  try {
    for (let hop = 0; hop < 5; hop++) {
      const response = await fetch(url, { signal, redirect: 'manual' });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location) break;
        url = officialUrl(new URL(location, url), originalPath);
        continue;
      }
      if (!response.ok || !response.body) break;
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 500_000_000) throw new Error('size');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks, size);
      if (size >= 4 && bytes.readUInt32LE(0) === 0x04034b50) return bytes;
      break;
    }
  } catch { /* 서명된 주소가 예외 메시지에 포함될 수 있어 원문을 숨깁니다. */ }
  throw new Error('Expo 공식 AAB 다운로드를 완료하지 못했습니다. 완료된 빌드 기록을 확인해 주세요.');
}

function expectedProvenance(manifest, record, buildHash, aabHash) {
  return { schemaVersion: 1, kind: 'production', buildId: record.id, projectId: manifest.projectId,
    buildNonce: manifest.buildNonce, applicationId, versionName: manifest.versionName,
    versionCode: manifest.versionCode, sourceFingerprint: manifest.sourceFingerprint,
    snapshotFingerprint: manifest.snapshotFingerprint, catalogEnvFingerprint: manifest.catalogEnvFingerprint,
    buildRecordSha256: buildHash, sha256: aabHash };
}

function readProvenance(repoRoot, buildRoot, expectedBuildId) {
  const manifest = assertInputs(repoRoot, buildRoot);
  const buildFile = path.join(buildRoot, 'build.json');
  const buildBytes = content(buildFile);
  const record = JSON.parse(buildBytes.toString('utf8'));
  validateProductionBuildRecord(record, manifest, expectedBuildId);
  const aabPath = path.join(buildRoot, 'app.aab');
  const provenancePath = path.join(buildRoot, 'provenance.json');
  const provenance = readJson(provenancePath);
  const expected = expectedProvenance(manifest, record, sha(buildBytes), sha(content(aabPath)));
  if (Object.entries(expected).some(([key, value]) => provenance?.[key] !== value)) throw new Error('AAB 파일·빌드 출처·원본 지문이 일치하지 않습니다.');
  return { ...expected, aabPath, provenancePath };
}

function writeOnce(file, bytes) {
  // 완성된 임시 파일만 연결해 중단·동시 실행에서도 기존 산출물을 덮어쓰지 않습니다.
  const temp = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  fs.writeFileSync(temp, bytes, { flag: 'wx' });
  try {
    try { fs.linkSync(temp, file); } catch (error) {
      if (error.code !== 'EEXIST' || !content(file).equals(Buffer.from(bytes))) throw error;
    }
  } finally { fs.unlinkSync(temp); }
}

export async function finishProductionDownload(repoRoot, folder, expectedBuildId) {
  const buildRoot = checkDirectory(repoRoot, folder);
  if (fs.existsSync(path.join(buildRoot, 'provenance.json'))) return readProvenance(repoRoot, buildRoot, expectedBuildId);
  const manifest = assertInputs(repoRoot, buildRoot);
  const recordBytes = content(path.join(buildRoot, 'build.json'));
  const record = JSON.parse(recordBytes.toString('utf8'));
  const url = validateProductionBuildRecord(record, manifest, expectedBuildId);
  const bytes = await fetchAab(url);
  if (!recordBytes.equals(content(path.join(buildRoot, 'build.json')))) throw new Error('다운로드 중 EAS 기록이 변경됐습니다.');
  assertInputs(repoRoot, buildRoot);
  const data = expectedProvenance(manifest, record, sha(recordBytes), sha(bytes));
  writeOnce(path.join(buildRoot, 'app.aab'), bytes);
  writeOnce(path.join(buildRoot, 'provenance.json'), json(data));
  return readProvenance(repoRoot, buildRoot, expectedBuildId);
}

function xmlAttribute(tag, name) {
  return new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(tag)?.[1];
}

function labelLookup(label) {
  if (label === applicationName) return null;
  // bundletool 1.18.3은 이름 없는 컴파일 참조를 @ 없이 0x12345678 형식으로 출력합니다.
  const id = /^@?(0x[0-9a-f]{8}|[1-9]\d{0,9})$/iu.exec(label)?.[1];
  if (id && Number(id) <= 0xffffffff) return id;
  const named = /^@(?:([a-zA-Z][\w.]*):)?(string\/[a-zA-Z_]\w*)$/u.exec(label);
  if (named && (!named[1] || named[1] === applicationId)) return named[2];
  throw new Error('정식 AAB의 앱 이름 리소스를 확인해 주세요.');
}

export function validateProductionEvidence(evidence, manifest, env) {
  const root = /<manifest\b[^>]*>/u.exec(evidence.manifestXml)?.[0] ?? '';
  const app = /<application\b[^>]*>/u.exec(evidence.manifestXml)?.[0] ?? '';
  const label = xmlAttribute(app, 'android:label');
  const resource = labelLookup(label);
  const defaultLabel = evidence.labelResource?.split(/\r?\n/u).find((line) => line.trimStart().startsWith('(default)'));
  const versionCode = xmlAttribute(root, 'android:versionCode');
  if (xmlAttribute(root, 'package') !== applicationId || xmlAttribute(root, 'android:versionName') !== manifest.versionName
    || !/^(?:[1-9]\d*|0x[0-9a-f]+)$/iu.test(versionCode) || String(Number(versionCode)) !== manifest.versionCode
    || !['false', undefined].includes(xmlAttribute(app, 'android:debuggable'))
    || xmlAttribute(app, 'android:allowBackup') !== 'false'
    || (resource && !defaultLabel?.trimEnd().endsWith(' "' + applicationName + '"'))) {
    throw new Error('AAB의 정식 앱 이름·식별자·버전·백업 또는 디버그 설정을 확인해 주세요.');
  }
  const hasFile = (name) => evidence.files.split(/\r?\n/u).includes(name);
  const bundle = evidence.bundle;
  if (!hasFile('BundleConfig.pb') || !hasFile('base/manifest/AndroidManifest.xml') || !hasFile('base/assets/index.android.bundle')
    || !Buffer.isBuffer(bundle) || !bundle.length || bundle.includes(Buffer.from(manifest.buildNonce))
    || ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
      .some((key) => !env[key] || !bundle.includes(Buffer.from(env[key])))) throw new Error('AAB 실행 번들의 공개 상품 설정 또는 빌드 식별자를 확인해 주세요.');
  // 자체 서명된 업로드 인증서도 유효합니다. 서명 누락·미서명 파일·복수 서명자는 별도로 거부합니다.
  if (!/^jar verified\.\s*$/mu.test(evidence.verification) || /\bunsigned entries\b/iu.test(evidence.verification)
    || !/^Signer #1:\s*$/mu.test(evidence.certificate) || /^Signer #(?!1:)\d+:/mu.test(evidence.certificate)) {
    throw new Error('AAB의 모든 파일을 한 업로드 키로 서명했는지 확인해 주세요.');
  }
  const certificate = evidence.certificate.split(/Certificate #2:/u)[0];
  const fingerprint = /^\s*SHA256:\s*((?:[0-9a-f]{2}:){31}[0-9a-f]{2})\s*$/imu.exec(certificate)?.[1];
  if (!fingerprint) throw new Error('AAB 업로드 인증서의 SHA-256을 읽지 못했습니다.');
  return { signerCertificateSHA256: fingerprint.replaceAll(':', '').toLowerCase(), embeddedBundle: true, backupDisabled: true, debuggable: false };
}

const bundletoolHash = 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29';

export async function captureProductionAab({ repoRoot, provenancePath, tools, run }) {
  const absolute = path.resolve(repoRoot, provenancePath);
  if (path.basename(absolute) !== 'provenance.json') throw new Error('provenance.json 파일을 지정해 주세요.');
  const buildRoot = checkDirectory(repoRoot, path.dirname(absolute));
  const provenance = readProvenance(repoRoot, buildRoot);
  const files = [absolute, provenance.aabPath, path.join(buildRoot, 'inputs.json'), path.join(buildRoot, 'build.json')];
  const fingerprints = files.map((file) => [file, sha(content(file))]);
  if (fingerprints[1][1] !== provenance.sha256 || fingerprints[3][1] !== provenance.buildRecordSha256) {
    throw new Error('검사를 준비하는 동안 AAB 또는 EAS 기록이 바뀌었습니다.');
  }
  const java = tools.java;
  const bundletool = tools.bundletool ?? process.env.STORE_PRICE_BUNDLETOOL ?? path.join(process.env.LOCALAPPDATA, 'store-price-tools/bundletool/bundletool-all-1.18.3.jar');
  if (sha(content(bundletool)) !== bundletoolHash) throw new Error('공식 bundletool 1.18.3 파일 지문이 다릅니다.');
  const jdkTool = (name) => path.join(path.dirname(java), name + (process.platform === 'win32' ? '.exe' : ''));
  const inspect = async (name, file, args) => (await run('production-aab-' + name, file, args, { timeout: 180_000 })).stdout;
  const argument = '--bundle=' + provenance.aabPath;
  const bt = (name, args) => inspect(name, java, ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-jar', bundletool, ...args, argument]);
  await bt('validate', ['validate']);
  const manifestXml = await bt('manifest', ['dump', 'manifest', '--module=base']);
  // 컴파일된 매니페스트의 참조를 따라 실제 런처 이름 리소스를 검사합니다.
  const label = xmlAttribute(/<application\b[^>]*>/u.exec(manifestXml)?.[0] ?? '', 'android:label');
  const resource = labelLookup(label);
  const labelResource = resource ? await bt('label', ['dump', 'resources', '--resource=' + resource, '--values']) : null;
  const listing = await inspect('files', jdkTool('jar'), ['tf', provenance.aabPath]);
  const language = ['-J-Duser.language=en', '-J-Duser.country=US'];
  const verification = await inspect('signature', jdkTool('jarsigner'), [...language, '-verify', provenance.aabPath]);
  const certificate = await inspect('certificate', jdkTool('keytool'), [...language, '-printcert', '-jarfile', provenance.aabPath]);
  // 공개 키가 포함된 Hermes 바이트는 일반 명령 로그에 기록하지 않고 메모리에서만 검사합니다.
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32/tar.exe') : 'tar';
  const bundle = execFileSync(tar, ['-xOf', provenance.aabPath, 'base/assets/index.android.bundle'],
    { windowsHide: true, timeout: 120_000, maxBuffer: 100 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const env = readJson(path.join(buildRoot, 'project/eas.json')).build.production.env;
  const evidence = validateProductionEvidence({ manifestXml, labelResource, bundle, files: listing, verification, certificate }, provenance, env);
  const state = Object.freeze({ ...provenance, applicationName, ...evidence });
  states.set(state, { repoRoot, buildRoot, fingerprints });
  assertProductionAabUnchanged(state);
  return state;
}

export function assertProductionAabUnchanged(state) {
  const details = states.get(state);
  if (!details) throw new Error('현재 검사에서 확인한 정식 AAB가 필요합니다.');
  assertInputs(details.repoRoot, details.buildRoot);
  if (details.fingerprints.some(([file, fingerprint]) => sha(content(file)) !== fingerprint)) throw new Error('검사 중 AAB 파일이나 출처 기록이 바뀌었습니다.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  const [cmd, folder, expectedBuildId] = process.argv.slice(2);
  if (cmd === 'prepare' && !folder) console.log(json(prepareProductionSnapshot(repoRoot)));
  else if (cmd === 'download' && folder) console.log(json(await finishProductionDownload(repoRoot, folder, expectedBuildId)));
  else if (cmd === 'verify' && folder) {
    const java = path.join(process.env.JAVA_HOME || 'C:/Program Files/Java/jdk-21.0.11', 'bin/java.exe');
    const run = async (_name, file, args, options) => ({ stdout: execFileSync(file, args, { ...options, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }) });
    console.log(json(await captureProductionAab({ repoRoot, provenancePath: path.join(folder, 'provenance.json'), tools: { java }, run })));
  } else throw new Error('사용법: node scripts/build/production.mjs prepare | download <빌드 폴더> [EAS build id] | verify <빌드 폴더>');
}
