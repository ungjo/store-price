import { createHash } from 'node:crypto';
import { openInEditor } from './open-editor.mjs';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const helpAliases = ['--help', '-h', 'help'];
const usage = '사용법: node start.mjs --help | node start.mjs --open 06 | node start.mjs --open all (01~20장)';

try {
  const catalogPath = path.join(directory, 'index.json');
  if (args.length === 1 && helpAliases.includes(args[0])) {
    // 소스 폴더에서도 기본 도움말을 제공한다. 다운로드한 ZIP에는 20개 장의 실제 목록이 있다.
    const chapters = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')).chapters : {};
    printHelp(chapters);
  } else {
    const open = args.length === 2 && args[0] === '--open';
    const detail = args.length === 2 && args.some(arg => helpAliases.includes(arg));
    if (!open && !detail && args.length !== 1) throw new Error(usage);
    const selection = open ? args[1] : args.find(arg => !helpAliases.includes(arg));
    const all = open && selection === 'all';
    if (!all && !/^\d{1,2}$/.test(selection ?? '')) throw new Error(usage);
    const chapters = JSON.parse(readFileSync(catalogPath, 'utf8')).chapters;
    const number = all ? null : selection.padStart(2, '0');
    if (!all && !Object.hasOwn(chapters, number)) throw new Error(usage);
    if (open) {
      // JSON에서 숫자 모양 키의 순서가 달라질 수 있어 01~20 순서를 명시한다.
      const numbers = all ? Object.keys(chapters).sort() : [number];
      const files = [];
      for (const key of numbers) {
        const chapter = chapters[key];
        if (!/^\d{2}$/.test(key) || !Object.hasOwn(chapter.files, chapter.entry)) {
          throw new Error('대표 파일 목록을 확인할 수 없습니다. 최신 ZIP을 새 폴더에 풀어 주세요.');
        }
        const folder = await restoreChapter(key, chapter, true);
        const filename = path.resolve(folder, chapter.entry);
        if (!existsSync(filename) || !lstatSync(filename).isFile() ||
            !realpathSync(filename).startsWith(realpathSync(folder) + path.sep)) {
          throw new Error(key + '장의 대표 파일을 찾을 수 없습니다: ' + path.join(folder, chapter.entry) +
            '\n기존 실습을 보존했습니다. 옮긴 파일을 원래 위치에 두거나 새 ZIP을 별도 폴더에 풀어 주세요.');
        }
        files.push('work/ch' + key + '/' + chapter.entry);
      }
      openInEditor(directory, files);
      console.log(all ? '1~20장 대표 파일 20개를 VS Code에 열도록 요청했습니다.' : number + '장 파일 열기: ' + files[0]);
    } else if (detail) {
      printChapterHelp(number, chapters[number]);
    } else {
      await restoreChapter(number, chapters[number]);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function printHelp(chapters) {
  const lines = [
    '꼬마 시장 실습 꾸러미 — 명령어 도움말',
    'start.mjs가 있는 폴더에서 원하는 명령을 한 줄 실행하세요.',
    '',
    '  node start.mjs --open all   1~20장의 대표 파일을 한 번에 열기',
    '',
    '장별 파일 열기',
  ];
  for (const number of Object.keys(chapters).sort()) {
    lines.push('  node start.mjs --open ' + number + '    ' + number + '장 ' + chapters[number].label);
  }
  lines.push('', '  node start.mjs --help 06    6장 앱 실행·검사 명령 보기',
    '  node start.mjs 06           편집기를 열지 않고 6장 예제를 work/ch06에 준비',
    '이미 준비한 장은 작성한 파일을 그대로 엽니다. VS Code에서 F1 → 작업: 작업 실행으로도 고를 수 있습니다.',
    '',
    '20장 완성 앱을 PC 브라우저에서 실행',
    'VS Code에서 터미널 → 새 터미널을 열고 start.mjs가 있는 꾸러미 폴더에서 시작하세요.',
    '왼쪽 탐색기에 work/ch20이 아직 없으면 먼저 node start.mjs 20 을 실행하세요.',
    '인터넷에 연결한 뒤 아래 세 줄을 한 줄씩 입력하세요. npm.cmd ci가 끝나면 마지막 줄을 입력하세요.',
    '',
    '  cd work/ch20/apps/mobile',
    '  npm.cmd ci',
    '  npm.cmd run web',
    '',
    '다음 실행부터 앱 폴더에서는 npm.cmd run web 만 입력하세요.',
    '꾸러미 폴더에서 바로 다시 실행할 때는 다음 한 줄을 입력하세요.',
    '  npm.cmd --prefix ./work/ch20/apps/mobile run web',
    '브라우저가 열리지 않으면 터미널에 나온 웹 주소를 여세요. 종료하려면 Ctrl+C를 누르세요.');
  console.log(lines.join('\n'));
}

function printChapterHelp(number, chapter) {
  const lines = [
    number + '장 ' + chapter.label,
    '  node start.mjs --open ' + number + '    VS Code에서 이 장의 대표 파일 열기',
    '',
    '꾸러미 폴더에서 다음 순서로 진행하세요.',
    '  node start.mjs ' + number + '    장 예제 준비 (이미 준비한 장은 이 줄을 건너뛰세요)',
  ];
  if (number === '01' || number === '02') {
    lines.push('  work/ch' + number + '/' + chapter.entry + '    이 장의 실습 문서');
  } else if (number === '03') {
    lines.push('  cd work/ch03         계산 예제 폴더로 이동', '  node checkout.mts    터미널에서 계산 결과 확인');
  } else {
    lines.push('  cd work/ch' + number + '/apps/mobile   앱 폴더로 이동', '  npm.cmd ci                 앱 패키지 설치');
    // 각 장의 원본 package.json을 기준으로 그 시점에 제공되는 명령만 안내합니다.
    const { scripts } = JSON.parse(readObject('apps/mobile/package.json', chapter.files['apps/mobile/package.json']));
    if (scripts.web) lines.push('  npm.cmd run web            브라우저에서 앱 보기');
    if (scripts.start) lines.push('  npm.cmd start              Expo Go로 볼 개발 서버 시작');
    lines.push('  Ctrl+C                     실행한 서버 종료', '', '앱 폴더에서 쓸 수 있는 검사');
    if (scripts.test) lines.push('  npm.cmd test               이 장의 자동 테스트 실행');
    if (scripts.typecheck) lines.push('  npm.cmd run typecheck      TypeScript 타입 검사');
    if (scripts.lint) lines.push('  npm.cmd run lint           코드 스타일과 오류 검사');
    if (scripts['device:doctor']) lines.push('  npm.cmd run device:doctor  PC 도구와 Android USB 연결 상태 점검');
    lines.push('  npm.cmd run                이 장의 전체 npm 스크립트 목록 보기');
  }
  if (number === '20') {
    lines.push('', '20장 완성 앱을 PC에서 다시 실행 (패키지를 설치한 뒤)',
      '  npm.cmd run web                               앱 폴더에서 실행',
      '  npm.cmd --prefix ./work/ch20/apps/mobile run web   꾸러미 폴더에서 실행',
      '브라우저가 열리지 않으면 터미널에 나온 웹 주소를 여세요.');
  }
  console.log(lines.join('\n'));
}

function readObject(relative, fingerprint) {
  if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error('예제 목록 형식이 올바르지 않습니다: ' + relative);
  }
  const data = readFileSync(path.join(directory, 'objects', fingerprint));
  // 코드가 빠지거나 압축 해제가 중단된 경우 완성 폴더로 넘기지 않습니다.
  if (createHash('sha256').update(data).digest('hex') !== fingerprint) {
    throw new Error('파일이 손상되었습니다. ZIP을 새 폴더에 다시 풀어 주세요: ' + relative);
  }
  return data;
}

async function restoreChapter(number, chapter, reuse = false) {
  const work = path.join(directory, 'work');
  mkdirSync(work, { recursive: true });
  if (lstatSync(work).isSymbolicLink() || realpathSync(work) !== path.join(realpathSync(directory), 'work')) {
    throw new Error('꾸러미 안의 실제 work 폴더에서 실행해 주세요.');
  }
  const target = path.join(work, 'ch' + number);
  if (existsSync(target)) {
    if (!reuse) throw new Error(target + ' 폴더가 이미 있습니다. 그 안의 작업을 이어서 사용하세요.');
    if (!lstatSync(target).isDirectory() || realpathSync(target) !== path.join(realpathSync(work), 'ch' + number)) {
      throw new Error('꾸러미 안의 실제 장 폴더를 확인하세요: ' + target);
    }
    return target;
  }
  const lock = target + '.preparing';
  // 같은 장을 두 번 실행하더라도 먼저 시작한 작업의 파일을 보존합니다.
  mkdirSync(lock);
  let staging;
  try {
    staging = mkdtempSync(path.join(work, '.prepare-' + number + '-'));
    for (const [relative, fingerprint] of Object.entries(chapter.files)) {
      const names = relative.split('/');
      if (names.some(name => !name || name === '.' || name === '..' || /[:\\]/.test(name))) {
        throw new Error('예제 목록 형식이 올바르지 않습니다: ' + relative);
      }
      const data = readObject(relative, fingerprint);
      const file = path.join(staging, ...names);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, data, { flag: 'wx' });
    }
    // Windows에서 새 파일이 잠깐 사용 중이면 파일을 다시 쓰지 않고 폴더 이름 변경만 재시도합니다.
    for (let attempt = 0; ; attempt++) {
      if (existsSync(target)) throw new Error('대상 폴더가 이미 있습니다: ' + target);
      try {
        renameSync(staging, target);
        break;
      } catch (error) {
        const locked = process.platform === 'win32' && ['EPERM', 'EBUSY', 'EACCES'].includes(error.code);
        if (!locked || attempt >= 4) throw error;
        await delay(100 * 2 ** attempt);
      }
    }
    staging = undefined;
    if (reuse) return target;
    console.log(number + '장 ' + chapter.label + '\n' + target);
    if (number === '01' || number === '02') console.log('실습 문서: ' + chapter.entry);
    else console.log(number === '03' ? '이 폴더에서 node checkout.mts 를 실행하세요.' : '저장소 루트는 위 폴더입니다. 앱 명령은 그 안의 apps/mobile 에서 실행하세요.');
    console.log('꾸러미 폴더에서 node start.mjs --help ' + number + ' 명령으로 이 장의 사용법을 볼 수 있습니다.');
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
    rmdirSync(lock);
  }
}
