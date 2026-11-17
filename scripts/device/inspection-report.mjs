import { spawnSync } from 'node:child_process';

const appId = 'com.ungjo.storeprice.inspection';
const bad = () => new Error('이전 검사 APK의 커밋된 PASS 보고서를 확인하지 못했습니다.');
const single = (text, regex) => {
  const matches = [...text.matchAll(regex)];
  if (matches.length !== 1) throw bad();
  return matches[0];
};

export function parseInspectionReport(text) {
  if (typeof text !== 'string' || single(text, /^- 결과: \*\*(.+)\*\*$/gmu)[1] !== 'PASS') throw bad();
  // 같은 문서의 다른 빌드나 과거 설명을 섞지 않고, 성공한 고정 검사 APK 구역만 근거로 사용합니다.
  const sections = text.split(/^## 고정 검사 APK\s*$/gmu);
  if (sections.length !== 2) throw bad();
  const section = sections[1].split(/^## /mu)[0];
  const applicationId = single(section, /^- 앱: 꼬마 시장 검사 \/ 앱 ID: `([^`]+)`$/gmu)[1];
  const version = single(section, /^- 버전: `([^`]+)` \/ 코드 `([1-9][0-9]*)`$/gmu);
  const build = single(section, /^- 빌드 ID: `([a-f0-9-]{36})` \/ 빌드 확인 번호: `(inspection-[a-f0-9]{16})`$/gmu);
  const sha256 = single(section, /^- APK SHA-256: `([a-f0-9]{64})`(?: .*)?$/gmu)[1];
  const sourceFingerprint = single(section, /^- 빌드 소스 SHA-256: `([a-f0-9]{64})`$/gmu)[1];
  const signerCertificateSHA256 = single(section, /^- 서명 인증서 SHA-256: `([a-f0-9]{64})`$/gmu)[1];
  if (applicationId !== appId || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(version[1])
    || Number(version[2]) > 2_100_000_000) throw bad();
  return Object.freeze({ applicationId, versionName: version[1], versionCode: version[2],
    buildId: build[1], buildNonce: build[2], sha256, sourceFingerprint, signerCertificateSHA256 });
}

export function readInspectionReport(repoRoot, commit) {
  if (typeof commit !== 'string' || !/^[a-f0-9]{7,40}$/u.test(commit)) throw bad();
  const git = (args) => spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 2_000_000,
  });
  const resolved = git(['rev-parse', '--verify', commit + '^{commit}']);
  if (resolved.status !== 0 || !/^[a-f0-9]{40}$/u.test(resolved.stdout.trim())) throw bad();
  const fullCommit = resolved.stdout.trim();
  // 현재 이력의 조상만 허용하여 무관한 저장소 기록을 업데이트 근거로 사용하지 않습니다.
  if (git(['merge-base', '--is-ancestor', fullCommit, 'HEAD']).status !== 0) throw bad();
  const report = git(['show', fullCommit + ':docs/book/verification/latest-android.md']);
  if (report.status !== 0) throw bad();
  return Object.freeze({ commit: fullCommit, expected: parseInspectionReport(report.stdout) });
}
