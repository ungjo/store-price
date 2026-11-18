import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSignerCertificateSHA256 } from './standalone.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const applicationId = 'com.ungjo.storeprice';
const bundletoolDigest = 'a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29';
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function run(file, args, label, env = process.env) {
  const result = spawnSync(file, args, {
    encoding: 'utf8', windowsHide: true, timeout: 300_000, maxBuffer: 8 * 1024 * 1024, env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(label + ' 실패: ' + (result.error?.message ?? result.stderr.trim().slice(-1800)));
  }
  return result.stdout;
}

// 생성할 때와 설치할 때 모두 APK 바이트에서 패키지·버전과 실제 서명 인증서를 읽습니다.
export function inspectProductionApk(apk, { java, buildTools }, input) {
  const badging = run(path.join(buildTools, 'aapt2.exe'), ['dump', 'badging', apk], path.basename(apk) + ' 앱 정보');
  const pkg = badging.split(/\r?\n/u).find(line => line.startsWith('package: ')) || '';
  const field = (key) => new RegExp("(?:^| )" + key + "='([^']*)'").exec(pkg)?.[1];
  if (field('name') !== applicationId || field('versionCode') !== String(input.versionCode)
    || (field('versionName') && field('versionName') !== input.versionName)) throw new Error(path.basename(apk) + ' 앱 정보 불일치');
  const splitName = field('split') || 'base';
  if (splitName === 'base' && field('versionName') !== input.versionName) {
    throw new Error('기본 APK의 버전 이름이 정식 AAB와 다릅니다.');
  }
  const cert = run(java, ['-jar', path.join(buildTools, 'lib/apksigner.jar'),
    'verify', '--verbose', '--print-certs', apk], path.basename(apk) + ' 서명 확인');
  return { splitName, signerCertificateSHA256: readSignerCertificateSHA256(cert) };
}

// 공식 빌드 결과를 기기 사양에 맞게 변환합니다. 설치 및 실행 판정은 verify.mjs에서 수행합니다.
function prepareDeviceApks(directory) {
  const root = fs.realpathSync(path.resolve(directory));
  const artifacts = fs.realpathSync(path.join(repoRoot, '.artifacts/build'));
  if (path.dirname(root) !== artifacts || !/^production-[a-zA-Z0-9-]+$/u.test(path.basename(root))) {
    throw new Error('앱 번들을 준비한 production 빌드 폴더를 지정해 주세요.');
  }
  const input = JSON.parse(fs.readFileSync(path.join(root, 'inputs.json'), 'utf8'));
  const provenance = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json'), 'utf8'));
  const bundle = path.join(root, 'app.aab');
  if (input.applicationId !== applicationId || !provenance.sha256 || sha(bundle) !== provenance.sha256) {
    throw new Error('정식 AAB와 빌드 기록의 패키지 또는 지문이 다릅니다.');
  }
  if (fs.existsSync(path.join(root, 'device-apks.json'))) {
    throw new Error('이 빌드의 기기용 APK가 이미 준비됐습니다. verify.mjs로 검사를 실행해 주세요.');
  }
  const toolRoot = path.join(process.env.LOCALAPPDATA, 'store-price-tools');
  const adb = process.env.STORE_PRICE_ADB || path.join(toolRoot, 'platform-tools/adb.exe');
  const javaBin = path.join(process.env.JAVA_HOME || 'C:/Program Files/Java/jdk-21.0.11', 'bin');
  const java = path.join(javaBin, 'java.exe');
  const bundletool = process.env.STORE_PRICE_BUNDLETOOL || path.join(toolRoot, 'bundletool/bundletool-all-1.18.3.jar');
  const buildTools = path.join(toolRoot, 'android-inspection/build-tools/37.0.0');
  if (sha(bundletool) !== bundletoolDigest) throw new Error('공식 bundletool 1.18.3의 SHA-256을 확인해 주세요.');
  const devices = run(adb, ['devices', '-l'], '연결 기기 조회').trim().split(/\r?\n/u).slice(1);
  const match = devices.length === 1 && /^([\w-]+)\s+device\b/u.exec(devices[0]);
  if (!match || match[1].startsWith('emulator-')) throw new Error('USB 디버깅을 허용한 실기기 한 대를 연결해 주세요.');
  const serial = match[1];
  const work = fs.mkdtempSync(path.join(root, 'device-apks-'));
  const relative = (file) => path.relative(root, file).split(path.sep).join('/');
  const spec = path.join(work, 'device-spec.json');
  const archive = path.join(work, 'device.apks');
  const splitDir = path.join(work, 'splits');
  const bt = (args, label) => run(java, ['-jar', bundletool, ...args], label);
  bt(['get-device-spec', '--adb=' + adb, '--device-id=' + serial, '--output=' + spec], '기기 사양 확인');

  // Play에서 사용하는 키와 별도로 로컬 설치용 임시 키를 만듭니다. 비밀번호는 도구 출력과 인수에 기록하지 않습니다.
  const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-price-apk-signing-'));
  const keystore = path.join(keyDir, 'local-install.p12');
  const passwordFile = path.join(keyDir, 'password');
  try {
    fs.writeFileSync(passwordFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    run(path.join(javaBin, 'keytool.exe'), [
      '-genkeypair', '-storetype', 'PKCS12', '-keystore', keystore, '-storepass:file', passwordFile,
      '-alias', 'local-install', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '365',
      '-dname', 'CN=Store Price Local Device Test',
    ], '로컬 설치용 임시 서명 생성');
    bt(['build-apks', '--bundle=' + bundle, '--output=' + archive, '--device-spec=' + spec,
      '--aapt2=' + path.join(buildTools, 'aapt2.exe'), '--ks=' + keystore, '--ks-pass=file:' + passwordFile,
      '--ks-key-alias=local-install'], '태블릿용 APK 생성');
  } finally {
    for (const file of [keystore, passwordFile]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(keyDir);
  }
  bt(['extract-apks', '--apks=' + archive, '--device-spec=' + spec, '--output-dir=' + splitDir], '분할 APK 추출');
  const files = fs.readdirSync(splitDir).sort();
  if (!files.length) throw new Error('기기에 설치할 APK가 없습니다.');
  const signers = new Set();
  const splitNames = new Set();
  const apks = files.map(name => {
    const apk = path.join(splitDir, name);
    if (!name.endsWith('.apk') || !fs.lstatSync(apk).isFile()) throw new Error('추출된 APK 파일을 확인해 주세요.');
    const info = inspectProductionApk(apk, { java, buildTools }, input);
    if (splitNames.has(info.splitName)) throw new Error('중복된 분할 APK입니다.');
    splitNames.add(info.splitName);
    signers.add(info.signerCertificateSHA256);
    return { path: relative(apk), sha256: sha(apk) };
  });
  if (!splitNames.has('base') || signers.size !== 1 || sha(bundle) !== provenance.sha256) {
    throw new Error('설치용 APK 묶음 또는 원본 AAB 지문이 일치하지 않습니다.');
  }
  const proof = {
    schemaVersion: 1, applicationId, versionName: input.versionName, versionCode: Number(input.versionCode),
    aabSha256: provenance.sha256, archivePath: relative(archive), archiveSha256: sha(archive),
    deviceSpecPath: relative(spec), deviceSpecSha256: sha(spec), apks, signerCertificateSHA256: [...signers][0],
    localSigning: 'temporary-device-test-key', bundletoolVersion: '1.18.3',
  };
  fs.writeFileSync(path.join(root, 'device-apks.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
  console.log('기기용 APK ' + apks.length + '개 검증 완료: ' + path.join(root, 'device-apks.json'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('사용법: node scripts/build/production-apks.mjs <production 빌드 폴더>');
    prepareDeviceApks(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
