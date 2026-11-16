import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseTalkBackSpeechOcr } from './talkback-speech-ocr.mjs';

const crop = [650, 2440, 300, 100];
const options = { crop, expectedText: '사과 한 개 빼기, 버튼' };
const sample = () => ({
  schemaVersion: 1, engine: 'Windows.Media.Ocr', language: 'ko', imageWidth: 1600, imageHeight: 2560,
  crop: [...crop], scale: 2, preprocessing: 'inverted-neutral-grayscale-85-255', text: '사과 한 개 빼기, 버튼',
  lines: [{ text: '사과 한 개 빼기, 버튼', words: [{ text: '사과 한 개 빼기, 버튼', bounds: [50, 10, 500, 50] }] }],
});
const parse = (value, config = options) => parseTalkBackSpeechOcr(JSON.stringify(value), config);

test('기대 전체 문구가 일치하면 표시 텍스트 근거만 반환한다', () => {
  const result = parse(sample());
  assert.equal(result.matched, true);
  assert.equal(result.evidenceKind, 'displayed-speech-text-only');
});
test('띄어쓰기와 쉼표 차이만 허용하고 글자 오류나 부분 일치는 거부한다', () => {
  assert.equal(parse(sample(), { crop, expectedText: '사과 한개 빼기 버튼' }).matched, true);
  for (const expectedText of ['사과', '사과 한 개 더하기 버튼', '사과 한 기t쫴기 버튼', '']) assert.throws(() => parse(sample(), { crop, expectedText }));
});
test('다른 줄에 섞인 알림이나 추가 문구를 기대 문구로 오인하지 않는다', () => {
  const value = sample();
  value.lines.push({ text: '다른 알림', words: [{ text: '다른 알림', bounds: [0, 100, 80, 30] }] });
  value.text += ' 다른 알림';
  assert.throws(() => parse(value));
});
test('명시한 영역·한국어 엔진·전처리 정보가 달라지면 거부한다', () => {
  for (const changes of [{ language: 'ja' }, { engine: 'remote' }, { scale: 1 }, { preprocessing: 'binary' }, { crop: [640, 2440, 300, 100] }, { schemaVersion: 2 }]) {
    assert.throws(() => parse({ ...sample(), ...changes }));
  }
});
test('화면 밖 영역 또는 상단 알림 영역은 OCR 근거로 허용하지 않는다', () => {
  for (const invalidCrop of [[0, 0, 300, 100], [1500, 2440, 300, 100], [650, 2500, 300, 100]]) {
    assert.throws(() => parse({ ...sample(), crop: invalidCrop }, { ...options, crop: invalidCrop }));
  }
});
test('빈 결과·줄 불일치·잘못된 단어 위치는 성공으로 해석하지 않는다', () => {
  for (const change of [(value) => { value.lines = []; }, (value) => { value.lines[0].text = '다른 문구'; },
    (value) => { value.lines[0].words[0].bounds = [0, 0, 601, 50]; }, (value) => { value.text = ''; }]) {
    const value = sample(); change(value); assert.throws(() => parse(value));
  }
});
test('부분 JSON이나 로그가 섞인 출력은 거부한다', () => {
  for (const stdout of ['', '{}', 'log\n' + JSON.stringify(sample()), JSON.stringify(sample()) + '\n{}']) assert.throws(() => parseTalkBackSpeechOcr(stdout, options));
});

function automatic(text = '사과 한 개 빼기, 버튼') {
  return { ...sample(), text, lines: [{ text, words: [{ text, bounds: [50, 10, 500, 50] }] }],
    cropDetection: { kind: 'centered-dark-bottom-rectangle', verticalEdgesVerified: true, searchHeight: 300, backgroundRgb: [85, 85, 85] } };
}
const autoOptions = { autoCrop: true, expectedIncludes: ['사과', '빼기'] };
test('명시적인 포함 모드는 경계 검출 뒤 모든 기대 문구를 요구한다', () => {
  const result = parse(automatic(), autoOptions);
  assert.equal(result.expectationMode, 'includes');
  assert.deepEqual(result.expectedPhrases, ['사과', '빼기']);
  assert.throws(() => parse(automatic(), { ...autoOptions, expectedIncludes: ['사과', '더 필요해요'] }));
});
test('부분 일치 모드를 수동 영역·빈 문구·전체 일치와 섞어 사용하지 못한다', () => {
  for (const config of [{ crop, expectedIncludes: '사과' }, { autoCrop: true, expectedIncludes: [] },
    { autoCrop: true, expectedIncludes: [''] }, { ...autoOptions, expectedText: '사과' }, { ...autoOptions, crop }]) {
    assert.throws(() => parse(automatic(), config));
  }
});
test('자동 검출 근거 누락·흰 배경·비중앙 영역을 거부한다', () => {
  for (const change of [(value) => { value.cropDetection = null; },
    (value) => { value.cropDetection.verticalEdgesVerified = false; },
    (value) => { value.cropDetection.backgroundRgb = [255, 255, 255]; },
    (value) => { value.cropDetection.searchHeight = 500; },
    (value) => { value.crop = [0, 2440, 300, 100]; }]) {
    const value = automatic(); change(value); assert.throws(() => parse(value, autoOptions));
  }
});
test('숫자 쉼표는 정규화하되 더 큰 숫자의 부분을 같은 금액으로 허용하지 않는다', () => {
  const value = automatic('1,500원이 더 필요해요.');
  assert.equal(parse(value, { autoCrop: true, expectedIncludes: ['1500원', '더 필요해요'] }).matched, true);
  assert.throws(() => parse(value, { autoCrop: true, expectedIncludes: '500원' }));
  assert.throws(() => parse(value, { autoCrop: true, expectedIncludes: '150' }));
});

test('실제 경계 검출기는 태스크바 색 겹침을 허용하고 표시가 없는 배경은 거부한다', { skip: process.platform !== 'win32' }, () => {
  const source = fs.readFileSync(new URL('./talkback-speech-ocr.ps1', import.meta.url), 'utf8');
  const detector = source.match(/Add-Type -TypeDefinition @'\r?\n([\s\S]*?)\r?\n'@/u)?.[1];
  assert.ok(detector, '검사 대상은 운영 스크립트의 실제 검출기여야 한다.');
  const script = `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
${detector}
public static class SpeechRectangleFixture {
  public static byte[] Make(int left,int top,int width,int height,bool coloredEdges) {
    byte[] b=new byte[1600*300*4]; for(int i=0;i<b.Length;i++) b[i]=255;
    for(int y=top;y<top+height;y++) for(int x=left;x<left+width;x++) {
      int i=(y*1600+x)*4; b[i]=85; b[i+1]=85; b[i+2]=85;
      if(coloredEdges && y>=top+20 && y<top+55 && x==left+width-1) { b[i]=80; b[i+1]=30; b[i+2]=0; }
      if(coloredEdges && y>=top+25 && y<top+60 && x==left) { b[i]=22; b[i+1]=22; b[i+2]=22; }
    }
    return b;
  }
}
'@
$result=@{}
$result.baseline=[TalkBackSpeechRectangle]::Find([SpeechRectangleFixture]::Make(663,200,261,73,$false),1600,300)
$result.coloredEdges=[TalkBackSpeechRectangle]::Find([SpeechRectangleFixture]::Make(459,201,682,73,$true),1600,300)
foreach($case in @(@('empty',0,0,0,0),@('offCenter',50,200,300,73),@('thinText',600,200,400,20))) {
  try { $null=[TalkBackSpeechRectangle]::Find([SpeechRectangleFixture]::Make($case[1],$case[2],$case[3],$case[4],$false),1600,300); $result[$case[0]]=$false }
  catch { $result[$case[0]]=$true }
}
$result | ConvertTo-Json -Compress
`;
  const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true, timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(value.baseline.slice(0, 4), [663, 200, 261, 73]);
  assert.deepEqual(value.coloredEdges.slice(0, 4), [459, 201, 682, 73]);
  assert.equal(value.empty, true);
  assert.equal(value.offCenter, true);
  assert.equal(value.thinText, true);
});

test('운영 전처리는 한글·쉼표의 회색 획을 보존하고 반투명 배경과 유색 아이콘을 지운다', { skip: process.platform !== 'win32' }, () => {
  const source = fs.readFileSync(new URL('./talkback-speech-ocr.ps1', import.meta.url), 'utf8');
  const preprocess = source.match(/  for \(\$index = 0; \$index -lt \$pixels.Length; \$index \+= 4\) \{[\s\S]*?\r?\n  \}/u)?.[0];
  assert.ok(preprocess, '운영 전처리 코드를 그대로 검사해야 한다.');
  const script = `$ErrorActionPreference='Stop'
$pixels=[byte[]]@(85,85,85,255,135,135,135,255,255,255,255,255,0,40,255,255)
${preprocess}
@($pixels) | ConvertTo-Json -Compress
`;
  const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true, timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const pixels = JSON.parse(result.stdout);
  assert.deepEqual(pixels.slice(0, 4), [255, 255, 255, 255], '어두워진 배경은 흰색으로 제외한다.');
  assert.deepEqual(pixels.slice(4, 8), [180, 180, 180, 255], '얇은 획을 이진화로 잃지 않는다.');
  assert.deepEqual(pixels.slice(8, 12), [0, 0, 0, 255], '밝은 본문은 검은 글자로 남긴다.');
  assert.deepEqual(pixels.slice(12, 16), [255, 255, 255, 255], '유색 아이콘은 글자가 아니다.');
});
