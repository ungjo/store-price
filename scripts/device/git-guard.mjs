import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const REPORT_PATH = 'docs/book/verification/latest-android.md';

const manifest = JSON.parse(readFileSync(new URL('./commit-files.json', import.meta.url), 'utf8'));
if (!Array.isArray(manifest) || !manifest.length) {
  throw new Error('commit-files.json must contain an explicit file-path array.');
}
const allowedPaths = Object.freeze([...new Set(manifest)].sort());
for (const entry of allowedPaths) {
  if (typeof entry !== 'string' || !entry || entry.includes('\\') || entry.includes('\0')
      || path.posix.isAbsolute(entry) || entry.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid path in commit-files.json.');
  }
}
if (!allowedPaths.includes(REPORT_PATH)) throw new Error('The verification report must be allowlisted.');
const allowedSet = new Set(allowedPaths);
const capturedStates = new WeakSet();

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(repoRoot, args, { input, accepted = [0], binary = false } = {}) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
  // 호출 환경에 남은 대체 인덱스나 Git 디렉터리가 다른 저장소를 변경하지 않게 합니다.
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
  const result = spawnSync('git', ['-C', repoRoot, ...args], {
    input, env, encoding: binary ? undefined : 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || !accepted.includes(result.status)) {
    const detail = String(result.stderr ?? '').trim();
    throw new Error('Git command failed (' + args[0] + '): ' + (detail || result.error?.message || result.status));
  }
  return binary ? result.stdout : result.stdout;
}

function equalPath(left, right) {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function verifyRoot(repoRoot) {
  const root = realpathSync(path.resolve(repoRoot));
  const top = realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim());
  if (!equalPath(root, top)) throw new Error('repoRoot must be the Git repository root.');
  return root;
}

function gitPath(repoRoot, name) {
  const value = git(repoRoot, ['rev-parse', '--git-path', name]).trim();
  return path.resolve(repoRoot, value);
}

function verifyRepositoryOperation(repoRoot) {
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-apply', 'rebase-merge', 'sequencer', 'BISECT_LOG']) {
    if (existsSync(gitPath(repoRoot, name))) throw new Error('Finish the active Git operation before automatic verification: ' + name);
  }
}

function verifyHooks(repoRoot) {
  const configured = git(repoRoot, ['config', '--path', '--get', 'core.hooksPath'], { accepted: [0, 1] }).trim();
  const directory = configured ? path.resolve(repoRoot, configured) : gitPath(repoRoot, 'hooks');
  // 훅을 끄거나 우회하지 않습니다. 검증 뒤 파일을 바꿀 수 있는 사용자 훅은 수동 커밋으로 넘깁니다.
  for (const name of ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit']) {
    if (existsSync(path.join(directory, name))) throw new Error('Automatic commit does not run custom Git hooks: ' + name);
  }
}

function stagingFingerprint(repoRoot) {
  const changes = git(repoRoot, ['diff', '--cached', '--name-only', '--ita-visible-in-index', '-z', 'HEAD', '--']);
  if (changes.length) throw new Error('Existing staged changes are preserved. Unstage or commit them yourself before this command.');
  return digest(git(repoRoot, ['ls-files', '--stage', '-z'], { binary: true }));
}

function currentHead(repoRoot) {
  const head = git(repoRoot, ['rev-parse', '--verify', 'HEAD']).trim();
  const branchRef = git(repoRoot, ['symbolic-ref', '-q', 'HEAD'], { accepted: [0, 1] }).trim();
  if (!branchRef) throw new Error('Automatic commit requires an attached local branch.');
  return { head, branchRef };
}

function changedPaths(repoRoot) {
  const tracked = git(repoRoot, ['diff', '--no-renames', '--name-only', '-z', 'HEAD', '--']);
  const untracked = git(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z']);
  const changes = [...new Set((tracked + untracked).split('\0').filter(Boolean))].sort();
  const unexpected = changes.filter((file) => !allowedSet.has(file));
  if (unexpected.length) {
    throw new Error('Changed files outside the automatic commit allowlist: ' + unexpected.join(', '));
  }
  return changes;
}

function fileSnapshot(repoRoot, relativePath) {
  let target = repoRoot;
  const parts = relativePath.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    target = path.join(target, parts[index]);
    let stat;
    try { stat = lstatSync(target); } catch (error) {
      if (error.code === 'ENOENT') return Object.freeze({ exists: false });
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('Symlink paths are not allowed for automatic commit: ' + relativePath);
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error('Expected a directory in allowlisted path: ' + relativePath);
    if (index === parts.length - 1) {
      if (!stat.isFile()) throw new Error('Expected an ordinary file: ' + relativePath);
      const content = readFileSync(target);
      return Object.freeze({ exists: true, sha256: digest(content), size: content.length, executable: Boolean(stat.mode & 0o111) });
    }
  }
  throw new Error('Invalid allowlisted path.');
}

function readSnapshot(repoRoot) {
  return Object.freeze(Object.fromEntries(allowedPaths.map((file) => [file, fileSnapshot(repoRoot, file)])));
}

function sourceHash(snapshot) {
  // 보고서는 검사 후 생성되므로 앱·검사 코드 지문에서 제외합니다. 없는 파일도 지문에 포함합니다.
  return digest(JSON.stringify(allowedPaths.filter((file) => file !== REPORT_PATH).map((file) => [file, snapshot[file]])));
}

function verifySnapshot(repoRoot, state, ignoreReport) {
  const snapshot = readSnapshot(repoRoot);
  for (const file of allowedPaths) {
    if (ignoreReport && file === REPORT_PATH) continue;
    if (JSON.stringify(snapshot[file]) !== JSON.stringify(state.snapshot[file])) {
      throw new Error('A checked file changed during verification: ' + file);
    }
  }
  return snapshot;
}

function verifyStateIdentity(repoRoot, state) {
  if (!state || !capturedStates.has(state)) throw new Error('Use a state freshly returned by captureGitState in this process.');
  const root = verifyRoot(repoRoot);
  if (!equalPath(root, state.repoRoot)) throw new Error('Verification state belongs to another repository.');
  const identity = currentHead(root);
  if (identity.head !== state.head || identity.branchRef !== state.branchRef) {
    throw new Error('HEAD or branch changed during verification. No automatic commit was made.');
  }
  verifyRepositoryOperation(root);
  return root;
}

export function captureGitState(repoRoot) {
  const root = verifyRoot(repoRoot);
  verifyRepositoryOperation(root);
  const identity = currentHead(root);
  const indexFingerprint = stagingFingerprint(root);
  const changes = changedPaths(root);
  const snapshot = readSnapshot(root);
  const state = Object.freeze({
    repoRoot: root,
    ...identity,
    indexFingerprint,
    changedPaths: Object.freeze(changes),
    snapshot,
    sourceHash: sourceHash(snapshot),
  });
  capturedStates.add(state);
  return state;
}

export function assertGitStateUnchanged(repoRoot, state, { ignoreReport = true } = {}) {
  const root = verifyStateIdentity(repoRoot, state);
  if (stagingFingerprint(root) !== state.indexFingerprint) throw new Error('Git index changed during verification.');
  changedPaths(root);
  return verifySnapshot(root, state, ignoreReport);
}

function indexEntries(repoRoot) {
  const entries = new Map();
  for (const row of git(repoRoot, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean)) {
    const separator = row.indexOf('\t');
    const [mode, oid, stage] = row.slice(0, separator).split(' ');
    if (stage !== '0') throw new Error('Unmerged entries appeared in the index.');
    entries.set(row.slice(separator + 1), { mode, oid });
  }
  return entries;
}

function stagedPaths(repoRoot) {
  return git(repoRoot, ['diff', '--cached', '--no-renames', '--name-only', '-z', 'HEAD', '--'])
    .split('\0').filter(Boolean).sort();
}

function expectedBlobs(repoRoot, snapshot, paths) {
  return new Map(paths.map((file) => {
    if (!snapshot[file].exists) return [file, null];
    const content = readFileSync(path.join(repoRoot, file));
    if (digest(content) !== snapshot[file].sha256) throw new Error('A checked file changed before staging: ' + file);
    // Git의 줄 끝 정규화까지 적용한 blob을 비교해야 Windows에서도 검사 내용과 커밋 내용이 일치합니다.
    const oid = git(repoRoot, ['hash-object', '--stdin', '--path=' + file], { input: content }).trim();
    return [file, oid];
  }));
}

function matchesBlob(entries, file, expectedOid) {
  const entry = entries.get(file);
  return expectedOid === null ? !entry : Boolean(entry && entry.oid === expectedOid && ['100644', '100755'].includes(entry.mode));
}

function verifyStagedPayload(repoRoot, paths, blobs) {
  const actual = stagedPaths(repoRoot);
  if (JSON.stringify(actual) !== JSON.stringify([...paths].sort())) {
    throw new Error('Staged paths do not exactly match the verified commit file list.');
  }
  const entries = indexEntries(repoRoot);
  for (const file of paths) {
    if (!matchesBlob(entries, file, blobs.get(file))) throw new Error('Staged blob differs from checked content: ' + file);
  }
}

function rollbackOwnStaging(repoRoot, state, paths, blobs) {
  // HEAD가 달라졌거나 사용자가 같은 파일을 다시 stage했다면 그 내용을 덮어쓰지 않습니다.
  if (currentHead(repoRoot).head !== state.head) return 'HEAD changed; staging was left untouched.';
  const entries = indexEntries(repoRoot);
  const staged = new Set(stagedPaths(repoRoot));
  const ours = paths.filter((file) => staged.has(file) && matchesBlob(entries, file, blobs.get(file)));
  if (ours.length) git(repoRoot, ['reset', '--quiet', 'HEAD', '--', ...ours]);
  return ours.length ? 'Only this command\'s unchanged staged entries were unstaged; working files were preserved.' : 'Staging was left untouched.';
}

export function commitVerifiedChange({ repoRoot, state, reportPath, message }) {
  const root = verifyStateIdentity(repoRoot, state);
  if (!reportPath || !equalPath(path.resolve(root, reportPath), path.join(root, REPORT_PATH))) {
    throw new Error('reportPath must be the fixed verification report path: ' + REPORT_PATH);
  }
  if (typeof message !== 'string' || !message.trim() || /[\r\n\0]/u.test(message) || message.length > 200) {
    throw new Error('Use one nonempty commit message line of at most 200 characters.');
  }
  const snapshot = assertGitStateUnchanged(root, state, { ignoreReport: true });
  const paths = changedPaths(root);
  if (!paths.some((file) => file !== REPORT_PATH)) return { commit: null };
  if (!snapshot[REPORT_PATH].exists || snapshot[REPORT_PATH].size === 0) {
    throw new Error('A nonempty verification report is required before an automatic commit.');
  }
  verifyHooks(root);
  const blobs = expectedBlobs(root, snapshot, paths);
  let stageStarted = false;
  try {
    // 검사 결과가 나온 뒤에만 정확한 경로를 stage합니다. 전체 디렉터리나 git add .는 사용하지 않습니다.
    assertGitStateUnchanged(root, state, { ignoreReport: true });
    stageStarted = true;
    git(root, ['add', '--', ...paths]);
    verifyStagedPayload(root, paths, blobs);
    verifyStateIdentity(root, state);
    changedPaths(root);
    verifySnapshot(root, state, true);
    if (JSON.stringify(fileSnapshot(root, REPORT_PATH)) !== JSON.stringify(snapshot[REPORT_PATH])) {
      throw new Error('Verification report changed before commit.');
    }
    verifyStagedPayload(root, paths, blobs);
    git(root, ['commit', '-m', message]);
    const result = currentHead(root);
    if (result.head === state.head) throw new Error('Git did not create a new commit.');
    return { commit: result.head };
  } catch (error) {
    if (stageStarted) {
      let rollback;
      try { rollback = rollbackOwnStaging(root, state, paths, blobs); }
      catch (rollbackError) { rollback = 'Could not safely restore staging: ' + rollbackError.message; }
      throw new Error(error.message + '\n' + rollback, { cause: error });
    }
    throw error;
  }
}
