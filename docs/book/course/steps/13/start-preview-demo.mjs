import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const helpers = await import(pathToFileURL(path.join(root, 'scripts/device/private-price-preview.mjs')));
const now = Date.now();
const snapshot = { schemaVersion: 1, projectRef: 'book-demo', fetchedAt: new Date(now).toISOString(), rows: [{
  id: 'ssg-emart-9990000000001', name: '[가상 실습] 가격 기록', unit_label: '검사용 1봉',
  is_sample: false, is_active: false, price_observation_id: '99900000-0000-8000-8000-000000000001',
  source_kind: 'manual_observation', source_product_id: '9990000000001',
  source_url: 'https://emart.ssg.com/item/itemView.ssg?itemId=9990000000001&siteNo=6001',
  sales_channel: 'ssg_emart_online', store_id: null,
  source_price_krw: 1234, play_price_krw: 1234, play_price_rule: 'exact',
  observed_at: new Date(now - 3600000).toISOString(), display_until: new Date(now + 82800000).toISOString(),
  valid_from: null, valid_until: null, promotion_type: 'none', promotion_conditions: null,
  availability: 'unknown', rights_status: 'unknown', publication_state: 'draft',
}] };
// 기존 파서의 비공개 관측 형식을 모의합니다. 실제 상품 조회나 Supabase 접속은 없습니다.
assert.equal(helpers.parsePrivateSnapshot(snapshot, 'book-demo').products.length, 1);
if (process.argv.includes('--check')) {
  console.log('가상 미리보기 형식: 1개 통과. 기기·서버·파일 변경 없음.');
  process.exit(0);
}
if (process.argv.length > 2) throw new Error('인자는 --check만 사용할 수 있습니다.');
const adbExe = process.env.BOOK_ADB || path.join(process.env.LOCALAPPDATA || '', 'store-price-tools/platform-tools/adb.exe');
if (!fs.existsSync(adbExe)) throw new Error('BOOK_ADB에 본인 adb.exe 전체 경로를 지정하세요.');
const runId = 'book-preview-' + Date.now();
let serial;
const ownReverses = [];
let session;
let expo;
let stopped = false;
let wake;
const ended = new Promise(resolve => { wake = resolve; });
const stop = () => { stopped = true; wake(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
function adb(args) {
  const result = spawnSync(adbExe, serial ? ['-s', serial, ...args] : args,
    { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.error || result.status !== 0) throw new Error('USB 연결 명령 실패. 기기 연결과 승인을 확인하세요.');
  return result.stdout;
}
function reverseFor(port) {
  for (const row of adb(['reverse','--list']).trim().split(/\r?\n/)) {
    const fields=row.trim().split(/\s+/);
    if (fields.at(-2) === 'tcp:' + port) return fields.at(-1);
  }
  return null;
}
async function requireFreePort(port) {
  const server=net.createServer();
  await new Promise((resolve,reject) => {
    server.once('error',reject);
    server.listen({host:'127.0.0.1',port,exclusive:true},resolve);
  });
  await new Promise(resolve=>server.close(resolve));
}
try {
  const devices=adb(['devices']).trim().split(/\r?\n/).slice(1)
    .map(line=>line.trim().split(/\s+/)).filter(fields=>fields.length>=2);
  if (devices.length!==1 || devices[0][1]!=='device') throw new Error('승인된 Android 한 대만 연결하세요.');
  serial=devices[0][0];
  if (/\b(?:showing|inputRestricted)=true/.test(adb(['shell','dumpsys','window','policy']))) {
    throw new Error('기기 화면의 잠금을 해제하세요.');
  }
  await requireFreePort(8093);
  const file=path.join(root,'.artifacts/catalog',runId+'.json');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(snapshot),{encoding:'utf8',flag:'wx'});
  const state=helpers.capturePrivatePreview(root,file,'book-demo');
  session=await helpers.startPrivatePreviewServer(state,{sessionId:runId});
  await helpers.checkPrivatePreviewHttp(session);
  for (const port of [8092,8093]) {
    const previous=reverseFor(port);
    if (previous && previous!=='tcp:'+port) throw new Error('이미 다른 USB 포트 연결이 사용 중입니다.');
    if (!previous) { adb(['reverse','--no-rebind','tcp:'+port,'tcp:'+port]); ownReverses.push(port); }
  }
  // 계정 설정을 읽지 않습니다. 놀이 목록은 내장 12개를 선택하고 가상 관측만 별도로 표시합니다.
  const env=helpers.previewEnvironment({...process.env,CI:'1',EXPO_NO_DOTENV:'1',
    EXPO_PUBLIC_SUPABASE_URL:'',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''},session);
  const mobile=path.join(root,'apps/mobile');
  expo=spawn(process.execPath,[path.join(mobile,'node_modules/expo/bin/cli'),
    'start','--offline','--localhost','--port','8093','--clear'],
    {cwd:mobile,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  // 토큰·사용자 경로가 포함될 수 있는 개발 서버 원문을 학습 출력에 복사하지 않습니다.
  expo.stdout.resume(); expo.stderr.resume();
  expo.once('error',stop); expo.once('close',stop);
  let ready=false;
  for (let attempt=0;attempt<120 && !stopped;attempt++) {
    try {
      const response=await fetch('http://127.0.0.1:8093/status',{signal:AbortSignal.timeout(1000)});
      if (response.ok && (await response.text()).includes('packager-status:running')) { ready=true;break; }
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if (!ready || stopped) throw new Error('개발 서버가 준비되지 않았습니다. Expo 패키지 설치와 포트를 확인하세요.');
  adb(['shell','am','start','-a','android.intent.action.VIEW','-d','exp://127.0.0.1:8093','-p','host.exp.exponent']);
  console.log('Expo Go 열기 요청 완료. 예시 상품으로 바로 놀이하기를 선택하세요.');
  console.log('실제 가격 미리보기 - 개발용에서 [가상 실습] 가격 기록 1개를 확인하세요.');
  console.log('외부 가격 조회와 원격 DB 접속 없음. 종료: Ctrl+C');
  await ended;
} finally {
  if (expo?.pid && expo.exitCode===null) {
    if (process.platform==='win32') spawnSync('taskkill.exe',['/PID',String(expo.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else expo.kill('SIGTERM');
  }
  if (session) await session.close();
  for (const port of ownReverses.reverse()) {
    try { if(reverseFor(port)==='tcp:'+port) adb(['reverse','--remove','tcp:'+port]); } catch {}
  }
  console.log('이번 실행의 미리보기 서버와 새 USB 연결을 정리했습니다.');
}
