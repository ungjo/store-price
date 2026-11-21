import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const number = process.argv[2]?.padStart(2, '0');
const catalog = JSON.parse(readFileSync(path.join(directory, 'index.json'), 'utf8'));
const chapter = catalog.chapters[number];
if (!/^\d{2}$/.test(number ?? '') || !chapter || process.argv.length !== 3) {
  console.error('사용법: node start.mjs 06   (03~20 중 장 번호 한 개)');
  process.exitCode = 1;
} else {
  try {
    restoreChapter();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

function restoreChapter() {
  const work = path.join(directory, 'work');
  mkdirSync(work, { recursive: true });
  if (lstatSync(work).isSymbolicLink() || realpathSync(work) !== path.join(realpathSync(directory), 'work')) {
    throw new Error('꾸러미 안의 실제 work 폴더에서 실행해 주세요.');
  }
  const target = path.join(work, 'ch' + number);
  if (existsSync(target)) throw new Error(target + ' 폴더가 이미 있습니다. 그 안의 작업을 이어서 사용하세요.');
  const lock = target + '.preparing';
  // 같은 장을 두 번 실행하더라도 먼저 시작한 작업의 파일을 보존합니다.
  mkdirSync(lock);
  let staging;
  try {
    staging = mkdtempSync(path.join(work, '.prepare-' + number + '-'));
    for (const [relative, fingerprint] of Object.entries(chapter.files)) {
      const names = relative.split('/');
      if (names.some(name => !name || name === '.' || name === '..' || /[:\\]/.test(name)) || !/^[a-f0-9]{64}$/.test(fingerprint)) {
        throw new Error('예제 목록 형식이 올바르지 않습니다: ' + relative);
      }
      const data = readFileSync(path.join(directory, 'objects', fingerprint));
      // 코드가 빠지거나 압축 해제가 중단된 경우 완성 폴더로 넘기지 않습니다.
      if (createHash('sha256').update(data).digest('hex') !== fingerprint) {
        throw new Error('파일이 손상되었습니다. ZIP을 새 폴더에 다시 풀어 주세요: ' + relative);
      }
      const file = path.join(staging, ...names);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, data, { flag: 'wx' });
    }
    if (existsSync(target)) throw new Error('대상 폴더가 이미 있습니다: ' + target);
    renameSync(staging, target);
    staging = undefined;
    console.log(number + '장 ' + chapter.label + '\n' + target);
    console.log(number === '03' ? '이 폴더에서 node checkout.mts 를 실행하세요.' : '저장소 루트는 위 폴더입니다. 앱 명령은 그 안의 apps/mobile 에서 실행하세요.');
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
    rmdirSync(lock);
  }
}
