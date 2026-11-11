import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { assertGitStateUnchanged, captureGitState, commitVerifiedChange, REPORT_PATH } from './git-guard.mjs';

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  assert.equal(result.status, 0, String(result.stderr));
  return result.stdout.trim();
}

function write(root, relative, content) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function fixture(t) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(path.join(parent, 'store-price-git-guard-'));
  t.after(() => {
    // 임시 저장소만 정리하며 실제 프로젝트 경로는 재귀 삭제 대상이 될 수 없게 확인합니다.
    const target = realpathSync(root);
    assert.equal(path.dirname(target), parent);
    assert.ok(path.basename(target).startsWith('store-price-git-guard-'));
    rmSync(target, { recursive: true, force: true });
  });
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'Device Guard Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'config', 'core.hooksPath', '.git/hooks');
  write(root, 'README.md', 'Initial fixture.\n');
  write(root, '.gitignore', '.env\n.device-results/\n');
  git(root, 'add', '--', 'README.md', '.gitignore');
  git(root, 'commit', '-qm', 'Fixture initial commit');
  return root;
}

function report(root) {
  write(root, REPORT_PATH, '# Verified fixture\n\nAll fixture checks passed.\n');
}

function commit(root, state) {
  return commitVerifiedChange({ repoRoot: root, state, reportPath: REPORT_PATH, message: 'test: verified fixture change' });
}

test('capture preserves existing user staging and refuses to continue', (t) => {
  const root = fixture(t);
  write(root, 'README.md', 'User staged change.\n');
  git(root, 'add', '--', 'README.md');
  const staged = git(root, 'diff', '--cached', '--binary');
  assert.throws(() => captureGitState(root), /staged changes/u);
  assert.equal(git(root, 'diff', '--cached', '--binary'), staged);
  assert.equal(readFileSync(path.join(root, 'README.md'), 'utf8'), 'User staged change.\n');
});

test('unknown modified or untracked files block automatic commits', (t) => {
  const root = fixture(t);
  write(root, 'private-notes.txt', 'Keep this local.\n');
  assert.throws(() => captureGitState(root), /outside.*allowlist/u);
  assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
  assert.ok(existsSync(path.join(root, 'private-notes.txt')));
});

test('a checked file changing after capture blocks the commit', (t) => {
  const root = fixture(t);
  write(root, 'README.md', 'Version checked by tests.\n');
  const state = captureGitState(root);
  write(root, 'README.md', 'Different untested version.\n');
  report(root);
  assert.throws(() => commit(root, state), /checked file changed/u);
  assert.equal(git(root, 'rev-parse', 'HEAD'), state.head);
  assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
});

test('a previously absent allowlisted file cannot appear during verification', (t) => {
  const root = fixture(t);
  const state = captureGitState(root);
  write(root, 'apps/mobile/src/features/payment/payment.ts', 'export const untested = true;\n');
  assert.throws(() => assertGitStateUnchanged(root, state), /checked file changed/u);
  assert.equal(git(root, 'rev-parse', 'HEAD'), state.head);
});

test('a report-only rerun does not create or stage a commit', (t) => {
  const root = fixture(t);
  const state = captureGitState(root);
  report(root);
  assert.equal(assertGitStateUnchanged(root, state)[REPORT_PATH].exists, true);
  assert.deepEqual(commit(root, state), { commit: null });
  assert.equal(git(root, 'rev-parse', 'HEAD'), state.head);
  assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
});

test('successful commit includes exactly verified changed paths and report', (t) => {
  const root = fixture(t);
  write(root, 'README.md', 'Checked feature documentation.\n');
  write(root, 'apps/mobile/src/features/payment/payment.ts', 'export const verified = true;\n');
  write(root, '.env', 'SECRET=never-stage-this\n');
  const state = captureGitState(root);
  report(root);
  const result = commit(root, state);
  assert.match(result.commit, /^[0-9a-f]{40,64}$/u);
  assert.equal(git(root, 'rev-parse', 'HEAD^'), state.head);
  assert.deepEqual(git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n').sort(), [
    'README.md', 'apps/mobile/src/features/payment/payment.ts', REPORT_PATH,
  ].sort());
  assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.equal(git(root, 'tag', '--list'), '');
  assert.equal(readFileSync(path.join(root, '.env'), 'utf8'), 'SECRET=never-stage-this\n');
});

test('staging created by the user during checks is preserved', (t) => {
  const root = fixture(t);
  write(root, 'README.md', 'Checked source.\n');
  const state = captureGitState(root);
  write(root, 'AGENTS.md', 'User staged instructions.\n');
  git(root, 'add', '--', 'AGENTS.md');
  const staged = git(root, 'diff', '--cached', '--binary');
  report(root);
  assert.throws(() => commit(root, state), /staged changes/u);
  assert.equal(git(root, 'diff', '--cached', '--binary'), staged);
  assert.equal(git(root, 'rev-parse', 'HEAD'), state.head);
});

test('commit failure unstages only this run and preserves working files', (t) => {
  const root = fixture(t);
  write(root, 'README.md', 'Keep my verified working file.\n');
  const state = captureGitState(root);
  report(root);
  git(root, 'config', 'commit.gpgsign', 'true');
  git(root, 'config', 'gpg.format', 'openpgp');
  git(root, 'config', 'gpg.program', path.join(root, 'nonexistent-fixture-signing-program'));
  assert.throws(() => commit(root, state), /working files were preserved/u);
  assert.equal(git(root, 'rev-parse', 'HEAD'), state.head);
  assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
  assert.equal(readFileSync(path.join(root, 'README.md'), 'utf8'), 'Keep my verified working file.\n');
  assert.ok(existsSync(path.join(root, REPORT_PATH)));
});

test('a changed HEAD blocks the commit without rewriting history', (t) => {
  const root = fixture(t);
  write(root, 'README.md', 'Checked source.\n');
  const state = captureGitState(root);
  git(root, 'commit', '--allow-empty', '-qm', 'Concurrent user commit');
  const userHead = git(root, 'rev-parse', 'HEAD');
  report(root);
  assert.throws(() => commit(root, state), /HEAD or branch changed/u);
  assert.equal(git(root, 'rev-parse', 'HEAD'), userHead);
  assert.equal(git(root, 'diff', '--cached', '--name-only'), '');
});
