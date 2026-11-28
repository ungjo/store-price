import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseAndroidPackageMetadata } from './inspection-device.mjs';

import { snapshotProductionNetwork, compareShoppingNetwork } from './production-network.mjs';

const applicationId = 'com.ungjo.storeprice';
const verifiedSets = new WeakSet();
const sha256Pattern = /^[a-f0-9]{64}$/u;
const hash = (value) => createHash('sha256').update(value).digest('hex');

function requireSame(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}

function readLocalFile(directory, relativePath) {
  const file = path.join(directory, relativePath);
  // 설치가 끝날 때까지 같은 빌드 디렉터리의 일반 파일만 신뢰합니다.
  if (fs.realpathSync.native(file) !== file || !fs.statSync(file).isFile()) {
    throw new Error('기기별 APK의 로컬 증빙 파일 경로를 확인해 주세요.');
  }
  return fs.readFileSync(file);
}

export function captureProductionApks({ provenancePath, aab, inspectApk }) {
  const directory = fs.realpathSync.native(path.dirname(path.resolve(provenancePath)));
  const manifestBytes = readLocalFile(directory, 'device-apks.json');
  const manifest = JSON.parse(manifestBytes);
  if (aab.applicationId !== applicationId || manifest.schemaVersion !== 1 || manifest.applicationId !== applicationId
    || manifest.aabSha256 !== aab.sha256 || manifest.versionName !== aab.versionName
    || String(manifest.versionCode) !== String(aab.versionCode)
    || manifest.localSigning !== 'temporary-device-test-key' || manifest.bundletoolVersion !== '1.18.3'
    || ![manifest.signerCertificateSHA256, manifest.archiveSha256, manifest.deviceSpecSha256, manifest.aabSha256]
      .every((value) => typeof value === 'string' && sha256Pattern.test(value))
    || !Array.isArray(manifest.apks) || !manifest.apks.length || manifest.apks.length > 128) {
    throw new Error('기기별 APK 생성 기록이 검증한 정식 AAB와 일치하지 않습니다.');
  }
  const buildFolder = /^(device-apks-[A-Za-z0-9_-]+)\/device\.apks$/u.exec(manifest.archivePath)?.[1];
  if (!buildFolder || manifest.deviceSpecPath !== buildFolder + '/device-spec.json') {
    throw new Error('기기별 APK 묶음과 기기 사양의 경로가 올바르지 않습니다.');
  }
  const apks = manifest.apks.map((entry) => {
    if (!entry || typeof entry.path !== 'string' || !entry.path.startsWith(buildFolder + '/splits/')
      || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.apk$/u.test(entry.path.slice((buildFolder + '/splits/').length))
      || !sha256Pattern.test(entry.sha256)) throw new Error('기기별 APK 경로 또는 SHA-256 형식이 올바르지 않습니다.');
    return Object.freeze({ path: path.join(directory, entry.path), relativePath: entry.path, sha256: entry.sha256 });
  });
  if (new Set(apks.map((item) => item.relativePath.toLowerCase())).size !== apks.length || new Set(apks.map((item) => item.sha256)).size !== apks.length) {
    throw new Error('기기별 APK 목록에 중복된 파일이 있습니다.');
  }
  const state = Object.freeze({ directory, manifestSha256: hash(manifestBytes), apks: Object.freeze(apks), applicationId,
    versionCode: Number(aab.versionCode), versionName: aab.versionName, aabSha256: aab.sha256,
    signerCertificateSHA256: manifest.signerCertificateSHA256, archiveSha256: manifest.archiveSha256, deviceSpecSha256: manifest.deviceSpecSha256,
    archivePath: manifest.archivePath, deviceSpecPath: manifest.deviceSpecPath });
  // 로컬 JSON을 읽은 후에도 설치하려는 모든 APK의 패키지·버전·서명과 분할 이름을 직접 확인합니다.
  const splitNames = new Set();
  for (const apk of apks) {
    const info = inspectApk(apk.path);
    if (!info || info.signerCertificateSHA256 !== state.signerCertificateSHA256 || !info.splitName || splitNames.has(info.splitName)) {
      throw new Error('기기용 APK의 서명 또는 분할 이름이 생성 기록과 다릅니다.');
    }
    splitNames.add(info.splitName);
  }
  if (!splitNames.has('base')) throw new Error('정식 앱의 기본 APK가 없습니다.');
  verifiedSets.add(state);
  assertProductionApksUnchanged(state);
  return state;
}

export function assertProductionApksUnchanged(state) {
  if (!verifiedSets.has(state)) throw new Error('출처가 확인된 기기별 APK 묶음이 필요합니다.');
  requireSame(hash(readLocalFile(state.directory, 'device-apks.json')), state.manifestSha256, '기기별 APK 생성 기록이 바뀌었습니다.');
  requireSame(hash(readLocalFile(state.directory, state.archivePath)), state.archiveSha256, '기기별 APK 묶음이 바뀌었습니다.');
  requireSame(hash(readLocalFile(state.directory, state.deviceSpecPath)), state.deviceSpecSha256, 'Android 기기 사양이 바뀌었습니다.');
  for (const apk of state.apks) {
    requireSame(hash(readLocalFile(state.directory, apk.relativePath)), apk.sha256, '기기별 APK의 SHA-256이 생성 기록과 다릅니다.');
  }
}

// 육안으로 확인한 프레임을 같은 실행의 원본 영상·아이콘·AAB에 묶어 다른 검사 기록의 재사용을 방지합니다.
export function checkProductionBrandingReview({ reviewPath, capture, runId, aabSha256 }) {
  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8').replace(/^\uFEFF/u, ''));
  if (review.runId !== runId || review.aabSha256 !== aabSha256 || review.iconConfirmed !== true || review.splashConfirmed !== true
    || review.sourceSha256 !== capture.sourceSha256 || review.appInfoSha256 !== capture.appInfoSha256
    || !/^frame-[0-9]{7}ms\.(jpg|png)$/u.test(review.splashFrame)) throw new Error('정식 앱 시각 확인 기록이 이번 실행과 일치하지 않습니다.');
  const frames = JSON.parse(fs.readFileSync(capture.framesManifest, 'utf8'));
  const selected = path.join(path.dirname(capture.framesManifest), review.splashFrame);
  const entry = frames.frames?.find((frame) => path.resolve(frame.path) === selected);
  if (!entry || frames.sourceSha256 !== review.sourceSha256 || !frames.sourceUnchanged
    || path.resolve(frames.sourcePath) !== path.resolve(capture.coldStart)
    || hash(fs.readFileSync(selected)) !== entry.sha256 || hash(fs.readFileSync(capture.coldStart)) !== review.sourceSha256
    || hash(fs.readFileSync(capture.appInfo)) !== review.appInfoSha256) throw new Error('검토한 아이콘이나 시작 화면의 원본 지문이 일치하지 않습니다.');
  return { splashFrame: review.splashFrame, frameSha256: entry.sha256, sourceSha256: review.sourceSha256, appInfoSha256: review.appInfoSha256 };
}

async function adbOutput(adb, label, args, options) {
  const result = await adb('production-' + label, args, options);
  if (typeof result?.stdout !== 'string' || String(result.stderr ?? '').trim() || (result.code !== undefined && result.code !== 0)) {
    throw new Error('ADB에서 정식 앱 상태를 확인하지 못했습니다 (' + label + ').');
  }
  return result.stdout.trim();
}

async function currentUser(adb, label) {
  const user = await adbOutput(adb, label, ['shell', 'am', 'get-current-user']);
  if (!/^(?:0|[1-9][0-9]{0,5})$/u.test(user)) throw new Error('현재 Android 사용자를 확인하지 못했습니다.');
  return user;
}

async function verifyInstalledFiles(adb, state, user, phase) {
  requireSame(await currentUser(adb, phase + '-user'), user, '검사 중 Android 사용자가 바뀌었습니다.');
  const output = await adbOutput(adb, phase + '-paths', ['shell', 'pm', 'path', '--user', user, applicationId]);
  const paths = output.split(/\r?\n/u).map((line) => {
    const file = /^package:(\/data\/app\/[A-Za-z0-9_+=.~/-]+\/(?:base|split_[A-Za-z0-9_.-]+)\.apk)$/u.exec(line)?.[1];
    if (!file || file.split('/').includes('..')) throw new Error('설치된 정식 앱의 APK 경로를 확인하지 못했습니다.');
    return file;
  });
  if (paths.length !== state.apks.length || new Set(paths).size !== paths.length || paths.filter((file) => file.endsWith('/base.apk')).length !== 1) {
    throw new Error('설치된 정식 앱의 APK 구성이 이번 기기용 빌드와 다릅니다.');
  }
  // Android가 분할 APK의 파일 이름을 바꾸므로 각 파일의 바이트 지문 전체를 대조합니다.
  const digests = [];
  for (const [index, file] of paths.entries()) {
    const output = await adbOutput(adb, phase + '-hash-' + index, ['shell', 'sha256sum', file]);
    const digest = output.slice(0, 64);
    if (!sha256Pattern.test(digest) || ![digest + '  ' + file, digest + ' ' + file].includes(output)) {
      throw new Error('설치된 APK의 SHA-256 출력이 올바르지 않습니다.');
    }
    digests.push(digest);
  }
  requireSame(digests.sort().join(','), state.apks.map((item) => item.sha256).sort().join(','), '기존 설치 파일이 이번 정식 빌드와 다릅니다.');
  const dump = await adbOutput(adb, phase + '-metadata', ['shell', 'dumpsys', 'package', applicationId]);
  const meta = parseAndroidPackageMetadata(dump, user, applicationId);
  // 열린 권한 목록에서 INTERNET이 빠졌는지 확인합니다. 출력 누락이나 권한 부여는 실패로 처리합니다.
  const permissions = /^[ \t]*requested permissions:[ \t]*\r?\n((?:[ \t]+[\w.]+\r?\n)+)[ \t]*install permissions:/mu.exec(dump);
  if (!permissions || /^\s*android\.permission\.INTERNET(?:$|:)/mu.test(dump)) {
    throw new Error('설치된 정식 앱의 INTERNET 권한 차단을 확인하지 못했습니다.');
  }
  if (!meta.installed || meta.versionName !== state.versionName || meta.versionCode !== state.versionCode) {
    throw new Error('현재 사용자의 정식 앱 설치 상태 또는 버전이 다릅니다.');
  }
}

export async function runProductionInstalled({ adb, state, verifyInstalled }) {
  assertProductionApksUnchanged(state);
  if (typeof verifyInstalled !== 'function') throw new Error('정식 앱의 실기기 검사 흐름이 필요합니다.');
  const user = await currentUser(adb, 'current-user');
  const output = await adbOutput(adb, 'package-before', ['shell', 'pm', 'list', 'packages', '-u', '--user', user, applicationId]);
  const lines = output ? output.split(/\r?\n/u) : [];
  if (lines.some((line) => !/^package:[A-Za-z0-9_.]+$/u.test(line))) throw new Error('기존 정식 앱 설치 상태를 확인하지 못했습니다.');
  const existing = lines.includes('package:' + applicationId);
  if (!existing) {
    requireSame(await currentUser(adb, 'install-user'), user, '설치 직전에 Android 사용자가 바뀌었습니다.');
    // -R은 같은 패키지가 이미 있으면 설치를 거부합니다. 사용자 데이터를 삭제하거나 기존 코드를 교체할 필요가 없습니다.
    assertProductionApksUnchanged(state);
    const command = state.apks.length === 1 ? 'install' : 'install-multiple';
    const result = await adbOutput(adb, 'install', [command, '-R', '--user', user, ...state.apks.map((item) => item.path)], { timeout: 240_000 });
    if (!/^Success$/mu.test(result) || /Failure|Error:/iu.test(result)) throw new Error('정식 앱 설치가 완료되지 않았습니다.');
  }
  await verifyInstalledFiles(adb, state, user, 'before');
  const snapshot = (phase) => snapshotProductionNetwork({ read: (label, args) => adbOutput(adb, label, args), applicationId, user, phase });
  const before = await snapshot('before');
  await verifyInstalled();
  const network = compareShoppingNetwork(before, await snapshot('after'));
  await verifyInstalledFiles(adb, state, user, 'after');
  assertProductionApksUnchanged(state);
  return Object.freeze({ applicationId, versionName: state.versionName, versionCode: state.versionCode, aabSha256: state.aabSha256,
    installationMode: existing ? 'reused-exact' : 'fresh', verifiedApks: state.apks.length, signerCertificateSHA256: state.signerCertificateSHA256,
    network, verifyInstalledStatus: 'passed' });
}
