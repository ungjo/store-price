import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./talkback-speech-ocr.ps1', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (text) => text.normalize('NFC').replace(/[\s,.;:!?，。；：！？]/gu, '');
const validCrop = (crop) => Array.isArray(crop) && crop.length === 4 && crop.every(Number.isSafeInteger)
  && crop[0] >= 0 && crop[1] >= 0 && crop[2] > 0 && crop[3] > 0;
function expectation({ expectedText, expectedIncludes, autoCrop }) {
  const exact = typeof expectedText === 'string' && normalize(expectedText).length >= 2 && expectedText.length <= 1000;
  const includes = typeof expectedIncludes === 'string' ? [expectedIncludes] : expectedIncludes;
  if (expectedIncludes !== undefined) {
    if (expectedText !== undefined || autoCrop !== true || !Array.isArray(includes) || !includes.length || includes.length > 20
      || includes.some((part) => typeof part !== 'string' || normalize(part).length < 2 || part.length > 1000)) {
      throw new Error('부분 발화 검사는 자동 표시 영역 검출과 명시적인 기대 문구 목록이 필요합니다.');
    }
    return { mode: 'includes', parts: includes };
  }
  if (!exact) throw new Error('발화 OCR에는 기대 전체 문구가 필요합니다.');
  return { mode: 'exact', parts: [expectedText] };
}
function containsPhrase(text, phrase) {
  const part = normalize(phrase);
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  // 500원을 1,500원에서 찾은 것으로 판정하지 않는다. 숫자 자체를 읽기 좋게 바꾸거나 추정하지 않는다.
  return new RegExp((/^\d/u.test(part) ? '(?<!\\d)' : '') + escaped + (/\d$/u.test(part) ? '(?!\\d)' : ''), 'u').test(normalize(text));
}

/** 부분 문구만 우연히 맞거나 OCR 오류를 유사도로 덮어도 통과하지 않게 전체 문구를 비교한다. */
export function parseTalkBackSpeechOcr(stdout, { crop, autoCrop = false, expectedText, expectedIncludes } = {}) {
  if (typeof autoCrop !== 'boolean' || (autoCrop ? crop !== undefined : !validCrop(crop))) throw new Error('발화 OCR 영역을 명시하거나 자동 검출 하나만 선택해야 합니다.');
  const expected = expectation({ expectedText, expectedIncludes, autoCrop });
  let value;
  try { value = JSON.parse(stdout); } catch { throw new Error('발화 OCR JSON이 올바르지 않습니다.'); }
  if (autoCrop && value) crop = value.crop;
  if (!value || value.schemaVersion !== 1 || value.engine !== 'Windows.Media.Ocr' || value.language !== 'ko'
    || value.scale !== 2 || value.preprocessing !== 'inverted-neutral-grayscale-85-255'
    || !validCrop(value.crop) || value.crop.some((part, index) => part !== crop[index])
    || !Number.isSafeInteger(value.imageWidth) || value.imageWidth <= 0 || value.imageWidth > 16384
    || !Number.isSafeInteger(value.imageHeight) || value.imageHeight <= 0 || value.imageHeight > 16384
    || crop[0] + crop[2] > value.imageWidth || crop[1] + crop[3] > value.imageHeight
    || crop[1] < Math.floor(value.imageHeight * 0.75)
    || typeof value.text !== 'string' || value.text.length > 1000 || !Array.isArray(value.lines)
    || value.lines.length === 0 || value.lines.length > 20) throw new Error('발화 OCR의 언어·영역·결과 근거가 올바르지 않습니다.');
  if (autoCrop) {
    const detected = value.cropDetection;
    if (!detected || detected.kind !== 'centered-dark-bottom-rectangle' || detected.verticalEdgesVerified !== true
      || !Number.isSafeInteger(detected.searchHeight) || detected.searchHeight !== Math.min(300, Math.floor(value.imageHeight * 0.25))
      || crop[1] < value.imageHeight - detected.searchHeight || crop[2] < 100 || crop[2] > value.imageWidth * 0.96
      || crop[3] < 35 || crop[3] > 270 || Math.abs(crop[0] + (crop[2] - 1) / 2 - value.imageWidth / 2) > Math.max(32, value.imageWidth * 0.06)
      || !Array.isArray(detected.backgroundRgb) || detected.backgroundRgb.length !== 3
      || !detected.backgroundRgb.every((part) => Number.isSafeInteger(part) && part >= 30 && part <= 140)
      || Math.max(...detected.backgroundRgb) - Math.min(...detected.backgroundRgb) > 20) throw new Error('하단 발화 표시 직사각형의 검출 근거가 올바르지 않습니다.');
  }
  const lines = value.lines.map((line) => {
    if (!line || typeof line.text !== 'string' || !Array.isArray(line.words) || !line.words.length || line.words.length > 100) {
      throw new Error('발화 OCR 줄 정보가 올바르지 않습니다.');
    }
    for (const word of line.words) {
      if (!word || typeof word.text !== 'string' || !Array.isArray(word.bounds) || word.bounds.length !== 4
        || !word.bounds.every((part) => typeof part === 'number' && Number.isFinite(part) && part >= 0)
        || word.bounds[2] <= 0 || word.bounds[3] <= 0
        || word.bounds[0] + word.bounds[2] > crop[2] * value.scale
        || word.bounds[1] + word.bounds[3] > crop[3] * value.scale) throw new Error('발화 OCR 단어 위치가 올바르지 않습니다.');
    }
    if (normalize(line.words.map((word) => word.text).join(' ')) !== normalize(line.text)) throw new Error('발화 OCR 단어와 줄 문구가 다릅니다.');
    return line.text;
  });
  if (normalize(lines.join(' ')) !== normalize(value.text)) throw new Error('발화 OCR 줄과 전체 문구가 다릅니다.');
  if (expected.mode === 'exact' ? normalize(value.text) !== normalize(expectedText)
    : expected.parts.some((part) => !containsPhrase(value.text, part))) throw new Error('발화 표시가 기대 문구와 일치하지 않습니다.');
  return { ...value, expectationMode: expected.mode, expectedPhrases: expected.parts, matched: true, evidenceKind: 'displayed-speech-text-only' };
}

/** 저장 PNG만 읽는다. 이 결과만으로 음성 재생 또는 TalkBack 발화 출처를 입증할 수는 없다. */
export async function readTalkBackSpeechOcr({ imagePath, crop, autoCrop = false, expectedText, expectedIncludes, run } = {}) {
  if (typeof imagePath !== 'string' || !path.isAbsolute(imagePath) || path.extname(imagePath).toLowerCase() !== '.png') {
    throw new Error('발화 OCR 입력은 저장된 PNG의 절대 경로여야 합니다.');
  }
  if (typeof autoCrop !== 'boolean' || (autoCrop ? crop !== undefined : !validCrop(crop))) throw new Error('발화 OCR 영역을 명시하거나 자동 검출 하나만 선택해야 합니다.');
  expectation({ expectedText, expectedIncludes, autoCrop });
  imagePath = path.resolve(imagePath);
  const stat = fs.lstatSync(imagePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw new Error('발화 OCR 입력 파일이 올바르지 않습니다.');
  const before = fs.readFileSync(imagePath);
  if (!before.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('PNG 형식이 아닙니다.');
  const imageSha256 = sha256(before);
  const scriptSha256 = sha256(fs.readFileSync(scriptPath));
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  // PowerShell 7에서는 WinRT 형식이 지원되지 않으므로 Windows 기본 5.1을 직접 실행한다.
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ImagePath', imagePath,
    ...(autoCrop ? ['-AutoCrop'] : ['-Left', String(crop[0]), '-Top', String(crop[1]), '-Width', String(crop[2]), '-Height', String(crop[3])])];
  const execute = run ?? (async (_label, file, parameters) => {
    const result = spawnSync(file, parameters, { encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0 || result.stderr.trim()) throw new Error('로컬 발화 OCR 실행 실패: ' + (result.stderr || result.error?.message || result.status));
    return { stdout: result.stdout };
  });
  const result = await execute('talkback-speech-ocr', powershell, args, { timeout: 60_000 });
  if (imageSha256 !== sha256(fs.readFileSync(imagePath)) || scriptSha256 !== sha256(fs.readFileSync(scriptPath))) {
    throw new Error('OCR 도중 입력 이미지나 분석 코드가 변경되었습니다.');
  }
  return { ...parseTalkBackSpeechOcr(result.stdout, { crop, autoCrop, expectedText, expectedIncludes }), imageSha256, scriptSha256 };
}
