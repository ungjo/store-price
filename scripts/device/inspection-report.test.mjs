import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parseInspectionReport, readInspectionReport } from './inspection-report.mjs';

const tick = String.fromCharCode(96);
const q = (value) => tick + value + tick;
const fixture = [
  '# Android 실기기 자동 검증 기록',
  '- 결과: **PASS**',
  '## 고정 검사 APK',
  '- 앱: 꼬마 시장 검사 / 앱 ID: ' + q('com.ungjo.storeprice.inspection'),
  '- 버전: ' + q('1.0.0') + ' / 코드 ' + q('1'),
  '- 빌드 ID: ' + q('11111111-1111-4111-8111-111111111111') + ' / 빌드 확인 번호: ' + q('inspection-0123456789abcdef'),
  '- APK SHA-256: ' + q('a'.repeat(64)) + ' (검사 전후 대조)',
  '- 빌드 소스 SHA-256: ' + q('b'.repeat(64)),
  '- 서명 인증서 SHA-256: ' + q('c'.repeat(64)),
  '## 확인한 항목', '- 다른 구역은 검사 APK 근거에 포함하지 않음', '',
].join('\n');

test('one successful inspection section yields exact immutable build evidence', () => {
  const r = parseInspectionReport(fixture);
  assert.equal(r.applicationId, 'com.ungjo.storeprice.inspection');
  assert.equal(r.versionCode, '1');
  assert.equal(r.sha256, 'a'.repeat(64));
  assert.equal(r.signerCertificateSHA256, 'c'.repeat(64));
  assert.equal(Object.isFrozen(r), true);
});

test('failed, duplicate, missing or production evidence cannot authorize an inspection update', () => {
  for (const text of [
    fixture.replace('**PASS**', '**FAIL**'),
    fixture + '\n- 결과: **PASS**',
    fixture + '\n## 고정 검사 APK\n',
    fixture.replace('com.ungjo.storeprice.inspection', 'com.ungjo.storeprice'),
    fixture.replace('- 서명 인증서 SHA-256:', '- unrelated:'),
    fixture.replace(' / 코드 ' + q('1'), ' / 코드 ' + q('0')),
    fixture.replace(' / 코드 ' + q('1'), ' / 코드 ' + q('2100000001')),
    fixture.replace('## 확인한 항목', '- APK SHA-256: ' + q('d'.repeat(64)) + '\n## 확인한 항목'),
    fixture.replace('## 고정 검사 APK', '## 과거 다른 APK'),
  ]) assert.throws(() => parseInspectionReport(text));
});

test('later sections cannot fill missing fields in the inspection section', () => {
  const text = fixture.replace('- 빌드 소스 SHA-256: ' + q('b'.repeat(64)) + '\n', '')
    + '\n- 빌드 소스 SHA-256: ' + q('b'.repeat(64));
  assert.throws(() => parseInspectionReport(text));
});

test('only a committed ancestor report is accepted, ignoring working-file edits', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'store-price-report-'));
  t.after(() => {
    const absolute = path.resolve(root);
    if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('store-price-report-')) throw Error('Unsafe cleanup target');
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  const git = (...args) => {
    const r = spawnSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
      { encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  git('init', '-b', 'main');
  const report = path.join(root, 'docs/book/verification/latest-android.md');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, fixture);
  git('add', '.'); git('commit', '-m', 'verified fixture');
  const first = git('rev-parse', 'HEAD');
  fs.writeFileSync(report, fixture.replace('**PASS**', '**FAIL**'));
  assert.equal(readInspectionReport(root, first).expected.sha256, 'a'.repeat(64));
  git('checkout', '--', '.');
  git('checkout', '-b', 'other');
  fs.writeFileSync(path.join(root, 'other.txt'), 'other');
  git('add', '.'); git('commit', '-m', 'unrelated branch');
  const other = git('rev-parse', 'HEAD');
  git('checkout', 'main');
  assert.throws(() => readInspectionReport(root, other));
  assert.throws(() => readInspectionReport(root, '--all'));
  assert.throws(() => readInspectionReport(root, 'HEAD'));
});
