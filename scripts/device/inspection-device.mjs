import { createHash } from 'node:crypto';
import fs from 'node:fs';

const applicationId = 'com.ungjo.storeprice.inspection';
const bad = (message) => new Error(message);

function normalizedVersionCode(value) {
  const text = String(value);
  if (!/^[1-9][0-9]{0,9}$/u.test(text) || Number(text) > 2_100_000_000) {
    throw bad('검사 APK의 버전 번호가 올바르지 않습니다.');
  }
  return Number(text);
}

function validateApkState(state) {
  // 고정 검사 앱만 받습니다. 정식 앱과 최초 실행용 nonce 앱은 이 설치 경로에서 건드리지 않습니다.
  if (!state || state.kind !== 'inspection' || state.applicationId !== applicationId
    || typeof state.buildNonce !== 'string' || state.buildNonce.length !== 27
    || !/^inspection-[a-f0-9]{16}$/u.test(state.buildNonce)
    || typeof state.sha256 !== 'string' || state.sha256.length !== 64 || !/^[a-f0-9]{64}$/u.test(state.sha256)
    || typeof state.apkPath !== 'string' || typeof state.versionName !== 'string'
    || state.versionName.length > 50 || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(state.versionName)
    || state.versionName.trim() !== state.versionName) {
    throw bad('고정 검사 APK의 검증 정보가 올바르지 않습니다.');
  }
  normalizedVersionCode(state.versionCode);
  const file = fs.lstatSync(state.apkPath);
  if (!file.isFile() || file.isSymbolicLink() || file.size < 1 || file.size > 500 * 1024 * 1024
    || createHash('sha256').update(fs.readFileSync(state.apkPath)).digest('hex') !== state.sha256) {
    throw bad('검사할 APK 원본과 검증한 파일이 일치하지 않습니다.');
  }
}

function checkedOutput(result, message) {
  // Android는 오류를 stderr 또는 종료 코드 0의 stdout으로도 돌려주므로 둘 다 확인합니다.
  if (!result || typeof result.stdout !== 'string' || String(result.stderr ?? '').trim()
    || (result.code !== undefined && result.code !== 0)
    || (result.exitCode !== undefined && result.exitCode !== 0)) throw bad(message);
  return result.stdout.trim();
}

async function currentUser(adb, label) {
  const user = checkedOutput(await adb(label, ['shell', 'am', 'get-current-user']),
    '현재 Android 사용자 프로필을 확인하지 못했습니다.');
  if (!/^(?:0|[1-9][0-9]{0,5})$/u.test(user)) throw bad('현재 Android 사용자 프로필을 확인하지 못했습니다.');
  return user;
}

async function packageExists(adb, user) {
  const output = checkedOutput(await adb('inspection-package-before',
    ['shell', 'pm', 'list', 'packages', '-u', '--user', user, applicationId]),
  '검사 앱의 기존 설치 여부를 확인하지 못했습니다.');
  const lines = output ? output.split(/\r?\n/u) : [];
  if (lines.some((line) => !/^package:[A-Za-z0-9_.]+$/u.test(line))) {
    throw bad('앱 설치 목록의 응답 형식이 올바르지 않습니다.');
  }
  return lines.includes('package:' + applicationId);
}


export function parseInspectionPackageMetadata(metadata, user) {
  return parseAndroidPackageMetadata(metadata, user, applicationId);
}

export function parseAndroidPackageMetadata(metadata, user, targetApplicationId) {
  const invalid = () => bad('설치한 앱의 Packages 정보를 정확히 확인하지 못했습니다.');
  if (typeof metadata !== 'string' || !/^(?:0|[1-9][0-9]{0,5})$/u.test(String(user))) throw invalid();
  const lines = metadata.split(/\r?\n/u);
  const starts = lines.flatMap((line, index) => /^Packages:[ \t]*$/u.test(line) ? [index] : []);
  if (starts.length !== 1) throw invalid();

  // Queries·Dexopt에도 User 0이 나오므로 문서 전체가 아닌 Packages의 정확한 앱 블록만 읽습니다.
  const start = starts[0] + 1;
  let end = lines.findIndex((line, index) => index >= start && /^[^\s]/u.test(line));
  if (end < 0) end = lines.length;
  const section = lines.slice(start, end);
  const headers = [];
  for (const [index, line] of section.entries()) {
    if (!/^[ \t]*Package\b/u.test(line)) continue;
    const match = /^([ \t]+)Package \[([A-Za-z0-9_.]+)\](?: \([^\r\n)]*\))?:[ \t]*$/u.exec(line);
    if (!match) throw invalid();
    headers.push({ index, indent: match[1], name: match[2] });
  }
  const targets = headers.filter((header) => header.name === targetApplicationId);
  if (targets.length !== 1 || headers.some((header) => header.indent !== targets[0].indent)) throw invalid();
  const target = targets[0];
  const next = headers.find((header) => header.index > target.index)?.index ?? section.length;
  const body = section.slice(target.index + 1, next);
  if (body.some((line) => line.trim() && (!line.startsWith(target.indent)
    || !/^[ \t]/u.test(line.slice(target.indent.length))))) throw invalid();

  // 같은 앱 안의 중복 버전·사용자·installed 값은 하나를 골라 쓰지 않고 모호한 증거로 거부합니다.
  const codeLines = body.filter((line) => /^[ \t]*versionCode=/u.test(line));
  const nameLines = body.filter((line) => /^[ \t]*versionName=/u.test(line));
  const userLines = body.filter((line) => new RegExp('^[ \\t]+User ' + user + ':').test(line));
  if (codeLines.length !== 1 || nameLines.length !== 1 || userLines.length !== 1) throw invalid();
  const code = /^[ \t]+versionCode=([1-9][0-9]*)(?:[ \t]|$)/u.exec(codeLines[0])?.[1];
  const name = /^[ \t]+versionName=([^\r\n]+)$/u.exec(nameLines[0])?.[1].trim();
  const installed = [...userLines[0].matchAll(/(?:^|[ \t])installed=([^ \t]*)/gu)];
  if (!code || !name || installed.length !== 1 || !['true', 'false'].includes(installed[0][1])) throw invalid();
  return Object.freeze({ versionCode: normalizedVersionCode(code), versionName: name, installed: installed[0][1] === 'true' });
}

async function readInstalled({ adb, user, label }) {
  if (await currentUser(adb, label + '-user') !== user) throw bad('검사 중 Android 사용자 프로필이 바뀌었습니다.');
  const location = checkedOutput(await adb(label + '-path',
    ['shell', 'pm', 'path', '--user', user, applicationId]), '설치한 검사 앱의 APK 위치를 확인하지 못했습니다.');
  if (!/^package:\/data\/app\/[A-Za-z0-9_+/=.~\-]+\/base\.apk$/u.test(location)
    || location.includes('\n')) throw bad('설치한 검사 앱의 APK 위치가 올바르지 않습니다.');
  const installedPath = location.slice('package:'.length);
  const hashOutput = checkedOutput(await adb(label + '-hash', ['shell', 'sha256sum', installedPath]),
    '설치한 검사 앱의 해시를 확인하지 못했습니다.');
  const sha256 = /^[a-f0-9]{64}/u.exec(hashOutput)?.[0];
  if (!sha256 || (hashOutput !== sha256 + '  ' + installedPath && hashOutput !== sha256 + ' ' + installedPath)) {
    throw bad('설치한 검사 앱의 해시 응답이 올바르지 않습니다.');
  }
  const metadata = checkedOutput(await adb(label + '-metadata',
    ['shell', 'dumpsys', 'package', applicationId]), '설치한 검사 앱의 버전을 확인하지 못했습니다.');
  return { sha256, ...parseInspectionPackageMetadata(metadata, user) };
}

function matchesInstalled(installed, apkState) {
  return installed.sha256 === apkState.sha256
    && installed.versionCode === normalizedVersionCode(apkState.versionCode)
    && installed.versionName === apkState.versionName && installed.installed;
}

async function assertInstalled({ adb, apkState, user, label }) {
  validateApkState(apkState);
  const installed = await readInstalled({ adb, user, label });
  if (installed.sha256 !== apkState.sha256) {
    throw bad('현재 설치된 앱과 이번 검사 APK가 다릅니다. 기존 앱을 보존합니다.');
  }
  if (!matchesInstalled(installed, apkState)) {
    throw bad('설치된 검사 앱의 버전 또는 현재 프로필 설치 상태가 일치하지 않습니다.');
  }
  validateApkState(apkState);
}

function validateUpdateFrom(previous, next) {
  validateApkState(previous);
  const signed = (state) => typeof state.signerCertificateSHA256 === 'string'
    && /^[a-f0-9]{64}$/u.test(state.signerCertificateSHA256) && state.signerCertificateSHA256.length === 64;
  // 과거 APK 검증 결과를 명시한 호출만 업데이트할 수 있습니다. 임의 앱 교체와 버전 하향은 허용하지 않습니다.
  if (previous.historical !== true || !signed(previous) || !signed(next)
    || previous.signerCertificateSHA256 !== next.signerCertificateSHA256
    || previous.sha256 === next.sha256
    || normalizedVersionCode(next.versionCode) < normalizedVersionCode(previous.versionCode)) {
    throw bad('업데이트할 이전 검사 APK의 기록·서명·버전이 올바르지 않습니다.');
  }
}

async function installApk({ adb, apkState, user, update = false }) {
  const output = checkedOutput(await adb(update ? 'inspection-update' : 'inspection-install',
    ['install', update ? '-r' : '-R', '--user', user, apkState.apkPath], { timeout: 180_000 }),
  '검사 APK 설치 완료를 확인하지 못했습니다. 설치 확인 창과 현재 기기 상태를 확인해 주세요.');
  if (!/^Success\s*$/mu.test(output) || /(?:Error|Failure|Exception|INSTALL_FAILED)/u.test(output)) {
    throw bad('검사 APK 설치 완료를 확인하지 못했습니다.');
  }
}

// 새 설치·정확한 APK 재검사·명시한 이전 APK의 업데이트를 구분하고 실패해도 데이터는 지우지 않습니다.
export async function runInspectionInstalled({ adb, apkState, verifyInstalled, allowMatchingInstall = false, updateFrom }) {
  validateApkState(apkState);
  if (apkState.historical === true) throw bad('새 검사 대상에 과거 APK 검증 결과를 사용할 수 없습니다.');
  // 콜백이 넘겨받은 원본 객체를 바꾸더라도 검사 기준은 처음 확인한 APK로 고정합니다.
  apkState = Object.freeze({ ...apkState });
  if (updateFrom !== undefined) {
    validateUpdateFrom(updateFrom, apkState);
    updateFrom = Object.freeze({ ...updateFrom });
  }
  if (typeof adb !== 'function' || typeof verifyInstalled !== 'function'
    || typeof allowMatchingInstall !== 'boolean') throw bad('검사 앱의 기기 실행 옵션이 올바르지 않습니다.');
  const evidence = {
    applicationId, buildNonce: apkState.buildNonce, apkSha256: apkState.sha256,
    versionName: apkState.versionName, versionCode: normalizedVersionCode(apkState.versionCode),
    installationScope: 'current-android-user', installationMode: 'not-started',
    installedFresh: false, installedUpdated: false, installedHashVerified: false, installStatus: 'not-requested',
    verifyInstalledStatus: 'not-run', installationCleanup: 'preserved',
    updateAuthorized: updateFrom !== undefined, dataPreserved: true, packageCodeScope: 'unchanged',
    previousApkSha256: updateFrom?.sha256 ?? null,
    previousVersionName: updateFrom?.versionName ?? null,
    previousVersionCode: updateFrom ? normalizedVersionCode(updateFrom.versionCode) : null,
    signerCertificateSHA256: updateFrom ? apkState.signerCertificateSHA256 : null,
    networkSettingsChanged: false, firstLaunchOffline: false,
  };
  try {
    const user = await currentUser(adb, 'inspection-current-user');
    if (await packageExists(adb, user)) {
      evidence.installationMode = 'existing-refused';
      if (!allowMatchingInstall && !updateFrom) {
        throw bad('현재 프로필에 검사 앱이 이미 있습니다. 기존 앱을 보존하고 중단합니다.');
      }
      const installed = await readInstalled({ adb, user, label: 'inspection-existing' });
      if (allowMatchingInstall && matchesInstalled(installed, apkState)) {
        validateApkState(apkState);
        evidence.installationMode = 'reused-exact';
      } else if (updateFrom && matchesInstalled(installed, updateFrom)) {
        // 새 파일뿐 아니라 실제 기기에 있는 이전 APK도 다시 대조한 뒤에만 데이터 보존 업데이트를 요청합니다.
        validateUpdateFrom(updateFrom, apkState);
        await assertInstalled({ adb, apkState: updateFrom, user, label: 'inspection-before-update' });
        validateApkState(apkState);
        evidence.installationMode = 'update-requested';
        evidence.installStatus = 'requested';
        // --user는 설치 대상이며 APK 코드는 같은 패키지가 공유하므로 영향 범위도 기록합니다.
        evidence.packageCodeScope = 'shared-package-update';
        await installApk({ adb, apkState, user, update: true });
        await assertInstalled({ adb, apkState, user, label: 'inspection-updated' });
        evidence.installedUpdated = true;
        evidence.installationMode = 'updated-verified';
      } else {
        throw bad('현재 설치된 앱의 해시·버전이 재사용 또는 업데이트할 검사 APK 기록과 다릅니다. 기존 앱을 보존합니다.');
      }
    } else {
      validateApkState(apkState);
      if (await currentUser(adb, 'inspection-before-install-user') !== user) {
        throw bad('설치 전에 Android 사용자 프로필이 바뀌었습니다.');
      }
      evidence.installationMode = 'fresh-requested';
      evidence.installStatus = 'requested';
      // -R로 다른 사용자 프로필에 같은 패키지가 있어도 교체하지 않으며 데이터를 삭제하지 않습니다.
      evidence.packageCodeScope = 'new-package';
      await installApk({ adb, apkState, user });
      await assertInstalled({ adb, apkState, user, label: 'inspection-installed' });
      evidence.installedFresh = true;
      evidence.installationMode = 'fresh';
    }
    evidence.installStatus = 'verified';
    evidence.installedHashVerified = true;
    try {
      await verifyInstalled();
      await assertInstalled({ adb, apkState, user, label: 'inspection-after-flow' });
      if (updateFrom) validateUpdateFrom(updateFrom, apkState);
      evidence.verifyInstalledStatus = 'passed';
    } catch (error) {
      evidence.verifyInstalledStatus = 'failed';
      throw error instanceof Error ? error : bad('설치한 검사 앱의 자동 검사에 실패했습니다.');
    }
    return evidence;
  } catch (error) {
    if (evidence.installStatus === 'requested') evidence.installStatus = 'failed-or-unconfirmed';
    const failure = bad(error instanceof Error ? error.message : '설치한 검사 앱의 자동 검사에 실패했습니다.');
    failure.inspection = evidence;
    throw failure;
  }
}
