import { spawn } from 'node:child_process';
import fs from 'node:fs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function touchConfiguration(width, height, name) {
  if (![width, height].every((n) => Number.isInteger(n) && n >= 320 && n <= 10000)
    || !/^StorePriceTalkBack-[a-zA-Z0-9-]+$/u.test(name)) throw new Error('가상 터치 장치의 크기 또는 이름이 올바르지 않습니다.');
  const axis = (code, maximum) => ({ code, info: { minimum: 0, maximum } });
  return { id: 1, command: 'register', name, vid: 0x18d1, pid: 0x4ee8, bus: 'usb',
    configuration: [{ type: 100, data: [1, 3] }, { type: 101, data: [330, 325] },
      { type: 103, data: [0, 1, 47, 53, 54, 57] }, { type: 110, data: [1] }],
    abs_info: [axis(0, width - 1), axis(1, height - 1), axis(47, 9), axis(53, width - 1), axis(54, height - 1), axis(57, 65535)] };
}

// input tap은 화면읽기의 동작 인식을 건너뛸 수 있어 Android InputReader가 받는 임시 터치 장치를 사용한다.
export async function createTalkBackTouch({ adbPath, serial, width, height, name, logPath, inspectInput, spawnProcess = spawn }) {
  const configuration = touchConfiguration(width, height, name);
  if (!/^[A-Za-z0-9._:-]+$/u.test(serial)) throw new Error('기기 식별자가 올바르지 않습니다.');
  // 기록 파일을 먼저 확보해 충돌·권한 오류 때 가상 장치를 만들지 않는다.
  const logFd = fs.openSync(logPath, 'wx');
  const log = fs.createWriteStream(logPath, { fd: logFd });
  const child = spawnProcess(adbPath, ['-s', serial, 'shell', 'uinput', '-'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let error; let exit; let childClosed = false; let sequence = 1; let closed = false;
  log.on('error', (value) => { error = value; });
  child.stdout.on('data', (data) => log.write(data));
  child.stderr.on('data', (data) => log.write(data));
  child.on('error', (value) => { error = value; });
  child.on('exit', (code) => { exit = code; });
  child.on('close', () => { childClosed = true; });
  child.stdin.on('error', (value) => { error = value; });
  const send = (value) => {
    if (closed || error || exit !== undefined) throw new Error('임시 터치 입력 연결이 종료되었습니다.');
    child.stdin.write(JSON.stringify(value) + '\n');
  };
  const inject = (events) => send({ id: 1, command: 'inject', events });
  const delay = (duration) => send({ id: 1, command: 'delay', duration });
  const point = (x, y) => {
    if (![x, y].every(Number.isInteger) || x < 0 || x >= width || y < 0 || y >= height) throw new Error('터치 좌표가 화면 밖입니다.');
  };
  const down = (x, y) => {
    point(x, y);
    inject([3, 47, 0, 3, 57, sequence++, 3, 53, x, 3, 54, y, 3, 0, x, 3, 1, y, 1, 330, 1, 1, 325, 1, 0, 0, 0]);
  };
  const up = () => inject([3, 57, -1, 1, 330, 0, 1, 325, 0, 0, 0, 0]);
  const close = async () => {
    if (closed) return;
    closed = true;
    // EOF로 이번에 만든 장치만 해제한다. 원래 연결된 키보드·터치는 바꾸지 않는다.
    child.stdin.end();
    for (let attempt = 0; attempt < 30 && !childClosed; attempt++) await pause(100);
    if (!childClosed) { child.kill(); await pause(300); }
    if (!childClosed) throw new Error('임시 입력 프로세스 종료를 확인하지 못했습니다.');
    await new Promise((resolve) => {
      if (log.destroyed) resolve();
      else { log.once('finish', resolve); log.once('error', resolve); log.end(); }
    });
    const remaining = await inspectInput();
    if (remaining.includes(name)) throw new Error('임시 터치 장치 해제를 확인하지 못했습니다.');
    if (error) throw new Error('임시 터치 연결 또는 로그 기록 오류: ' + error.message);
  };
  try {
    send(configuration);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await pause(100);
      if ((await inspectInput()).includes(name)) { ready = true; break; }
    }
    if (!ready || error || exit !== undefined) throw new Error('임시 터치 장치를 등록하지 못했습니다.');
  } catch (failure) { await close(); throw failure; }
  return {
    name, close,
    async tap(x, y) { down(x, y); delay(60); up(); await pause(170); },
    async doubleTap(x, y) { down(x, y); delay(45); up(); delay(70); down(x, y); delay(45); up(); await pause(270); },
    async swipe(direction = 'next') {
      if (!['next', 'previous'].includes(direction)) throw new Error('지원하지 않는 탐색 방향입니다.');
      const from = Math.round(width * (direction === 'next' ? 0.25 : 0.75));
      const to = Math.round(width * (direction === 'next' ? 0.75 : 0.25));
      const y = Math.round(height * 0.55);
      down(from, y);
      for (let index = 1; index <= 10; index++) {
        delay(15);
        const x = Math.round(from + (to - from) * index / 10);
        inject([3, 53, x, 3, 0, x, 0, 0, 0]);
      }
      delay(15); up(); await pause(330);
    },
  };
}
