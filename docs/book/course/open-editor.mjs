import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// 작업 메뉴는 실행 중인 VS Code 경로를 넘긴다. 터미널에서도 같은 설치본의 실행기를 우선한다.
export function openInEditor(directory, files) {
  const windows = process.platform === 'win32';
  const executable = process.env.MARKET_LAB_VSCODE_EXECUTABLE || process.env.VSCODE_GIT_ASKPASS_NODE;
  const names = executable?.toLowerCase().includes('insiders') ? ['code-insiders', 'code'] : ['code', 'code-insiders'];
  const binFolders = [];
  if (executable && path.isAbsolute(executable)) {
    const installed = path.dirname(executable);
    binFolders.push(path.join(installed, 'bin'), path.join(installed, '../Resources/app/bin'));
  }
  const paths = (process.env.PATH ?? '').split(path.delimiter).filter(value => path.isAbsolute(value));
  const findLauncher = folders => folders.flatMap(folder =>
    names.map(name => path.join(folder, windows ? name + '.cmd' : name))
  ).find(file => existsSync(file));
  const launcher = findLauncher(binFolders) || (executable && path.isAbsolute(executable) && existsSync(executable) ? executable : findLauncher(paths));
  if (!launcher) throw new Error('VS Code 실행 명령을 찾을 수 없습니다. 꾸러미를 VS Code에서 열고 F1 → 작업: 작업 실행 → 한 장의 실습 파일 열기 또는 전체 장의 실습 파일 한 번에 열기를 선택하세요.');

  const options = { cwd: directory, stdio: 'inherit', windowsHide: true };
  let result;
  if (windows && launcher.toLowerCase().endsWith('.cmd')) {
    // 공식 Windows 실행기는 배치 파일이다. 다운로드 폴더는 작업 디렉터리로 전달하고,
    // 셸 명령에는 검증한 꾸러미 상대 경로만 넣어 한글·공백·괄호가 있는 설치 위치에서도 연다.
    if (files.some(file => !/^work\/ch\d{2}\/[a-zA-Z0-9_./-]+$/.test(file))) {
      throw new Error('꾸러미의 대표 파일 경로를 확인하세요.');
    }
    const command = '""%MARKET_LAB_CODE_CMD%" --reuse-window ' + files.join(' ') + '"';
    result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/v:off', '/s', '/c', command], {
      ...options, windowsVerbatimArguments: true, env: { ...process.env, MARKET_LAB_CODE_CMD: launcher },
    });
  } else {
    result = spawnSync(launcher, ['--reuse-window', ...files.map(file => path.resolve(directory, file))], options);
  }
  if (result.error || result.status !== 0) {
    throw new Error('VS Code가 파일을 열지 못했습니다. 탐색기의 work 폴더에서 각 장의 파일을 열 수 있습니다.');
  }
}
