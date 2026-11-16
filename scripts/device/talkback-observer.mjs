import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function regularFile(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('관찰기 입력은 일반 파일이어야 합니다: ' + filename);
  return filename;
}

function artifactDirectory(repoRoot, requested) {
  const root = fs.realpathSync(repoRoot);
  const artifacts = path.join(root, '.artifacts');
  const directory = path.resolve(requested ?? path.join(artifacts, 'device'));
  const relative = path.relative(artifacts, directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('관찰기 출력은 저장소 .artifacts 안에만 만듭니다.');
  // 기존 연결 디렉터리를 따라 작업 공간 밖에 빌드 파일을 쓰지 않는다.
  let current = root;
  for (const segment of path.relative(root, directory).split(path.sep)) {
    current = path.join(current, segment);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('관찰기 출력 경로에 연결 또는 일반 파일이 있습니다.');
    } else fs.mkdirSync(current);
  }
  return fs.mkdtempSync(path.join(directory, 'talkback-observer-'));
}

async function localRun(label, file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, timeout: options.timeout ?? 60_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(label + ' 실패: ' + (result.stderr || result.error?.message || result.status));
  return { stdout: result.stdout, stderr: result.stderr, code: result.status };
}

/** Android 라이브러리를 참조하지 않는 Java 코드만 DEX로 만들며 기기에 연결하지 않는다. */
export async function buildTalkBackObserver({ repoRoot = defaultRoot, runDir, run = localRun, javaHome, buildToolsDir } = {}) {
  const sourcePath = regularFile(path.join(repoRoot, 'scripts/device/android/TalkBackSnapshot.java'));
  const sourceSha256 = digest(fs.readFileSync(sourcePath));
  const selectedJavaHome = javaHome ?? process.env.JAVA_HOME ?? 'C:\\Program Files\\Java\\jdk-21.0.11';
  const selectedBuildTools = buildToolsDir ?? path.join(process.env.LOCALAPPDATA ?? '', 'store-price-tools/android-inspection/build-tools/37.0.0');
  const javac = regularFile(path.join(selectedJavaHome, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac'));
  const java = regularFile(path.join(selectedJavaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'));
  const d8 = regularFile(path.join(selectedBuildTools, 'lib/d8.jar'));
  const outputDirectory = artifactDirectory(repoRoot, runDir);
  const classes = path.join(outputDirectory, 'classes');
  fs.mkdirSync(classes);
  await run('talkback-observer-javac', javac, ['--release', '8', '-encoding', 'UTF-8', '-d', classes, sourcePath], { timeout: 60_000 });
  const classPath = regularFile(path.join(classes, 'TalkBackSnapshot.class'));
  const jarPath = path.join(outputDirectory, 'observer.jar');
  // lambda·desugaring을 사용하지 않아 android.jar 없이 Java 표준 타입과 reflection으로 빌드한다.
  await run('talkback-observer-d8', java, ['-cp', d8, 'com.android.tools.r8.D8', '--min-api', '26', '--no-desugaring', '--output', jarPath, classPath], { timeout: 60_000 });
  regularFile(jarPath);
  if (digest(fs.readFileSync(sourcePath)) !== sourceSha256) throw new Error('관찰기를 빌드하는 동안 Java 소스가 변경됐습니다.');
  return { schemaVersion: 1, mainClass: 'TalkBackSnapshot', jarPath, sha256: digest(fs.readFileSync(jarPath)), sourceSha256, minApi: 26, connectionFlags: 1 };
}

/** 이전 로그·실패 출력·서비스 억제 관찰 결과가 성공 근거로 쓰이지 않도록 확인한다. */
export function parseTalkBackSnapshot(stdout, { requestId, applicationId, talkBackPackage, inputMethodPackage, requireApplicationObserved = true } = {}) {
  if (typeof requireApplicationObserved !== 'boolean') throw new Error('검사 앱 관찰 요구 옵션은 boolean이어야 합니다.');
  if (typeof stdout !== 'string' || stdout.length > 8 * 1024 * 1024) throw new Error('관찰기 출력 크기 또는 형식이 올바르지 않습니다.');
  let value;
  try { value = JSON.parse(stdout.trim()); } catch { throw new Error('관찰기 JSON을 읽을 수 없습니다.'); }
  if (!value || value.schemaVersion !== 1 || value.status !== 'ok' || value.uiAutomationFlags !== 1
    || value.disconnected !== true || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(value.requestId ?? '')
    || (requestId !== undefined && value.requestId !== requestId)
    || !Array.isArray(value.allowedPackages) || ![2, 3].includes(value.allowedPackages.length)
    || value.allowedPackages.some((entry) => typeof entry !== 'string' || entry.length > 255 || !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u.test(entry))
    || new Set(value.allowedPackages).size !== value.allowedPackages.length
    || (applicationId !== undefined && value.allowedPackages[0] !== applicationId)
    || (talkBackPackage !== undefined && value.allowedPackages[1] !== talkBackPackage)
    || (inputMethodPackage !== undefined && value.allowedPackages[2] !== inputMethodPackage)
    || !Number.isInteger(value.captureAttempts) || value.captureAttempts < 1 || value.captureAttempts > 3
    || !Number.isSafeInteger(value.ignoredWindowCount) || value.ignoredWindowCount < 0
    || !Number.isSafeInteger(value.startedAtEpochMs) || !Number.isSafeInteger(value.capturedAtEpochMs)
    || value.startedAtEpochMs <= 0 || value.capturedAtEpochMs < value.startedAtEpochMs
    || !Array.isArray(value.windows) || value.windows.length === 0 || value.windows.length > 100
    || !Number.isSafeInteger(value.nodeCount) || value.nodeCount < 1 || value.nodeCount > 6000) {
    throw new Error('현재 요청의 서비스 유지·노드 조회·연결 해제 근거를 확인하지 못했습니다.');
  }
  let count = 0;
  const visit = (node, depth) => {
    if (!node || ++count > 6000 || depth > 100 || !Array.isArray(node.children)
      || !Array.isArray(node.bounds) || node.bounds.length !== 4 || !node.bounds.every(Number.isSafeInteger)
      || typeof node.accessibilityFocused !== 'boolean' || typeof node.inputFocused !== 'boolean'
      || typeof node.visible !== 'boolean' || typeof node.enabled !== 'boolean'
      || ['id', 'packageName', 'className', 'text', 'desc', 'hint', 'stateDescription'].some((key) => node[key] !== null && typeof node[key] !== 'string')) {
      throw new Error('접근성 노드 관찰값이 올바르지 않습니다.');
    }
    for (const child of node.children) visit(child, depth + 1);
  };
  let applicationObserved = false;
  for (const window of value.windows) {
    if (!window || !Number.isInteger(window.id) || typeof window.active !== 'boolean'
      || typeof window.inputFocused !== 'boolean' || typeof window.accessibilityFocused !== 'boolean') {
      throw new Error('접근성 창 관찰값이 올바르지 않습니다.');
    }
    if (!window.root || !value.allowedPackages.includes(window.root.packageName)) throw new Error('허용하지 않은 앱의 창이 관찰 결과에 포함됐습니다.');
    if (window.root.packageName === value.allowedPackages[0]) applicationObserved = true;
    visit(window.root, 0);
  }
  // 설정 준비·원복 관찰만 예외로 허용한다. 실제 앱 검사는 기본값 true를 유지한다.
  if (requireApplicationObserved && !applicationObserved) throw new Error('검사 앱의 창을 관찰하지 못했습니다.');
  if (count !== value.nodeCount) throw new Error('접근성 노드 개수가 관찰 결과와 다릅니다.');
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('사용법: node scripts/device/talkback-observer.mjs');
  console.log(JSON.stringify(await buildTalkBackObserver(), null, 2));
}
