import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDisplaySettings, assertDisplaySettings, densityForWidth } from './display-settings.mjs';
import { assertKeyboardLayout, visibleKeyboardFrame } from './keyboard-layout.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function measureKeyboard({ adb, run, tools, displayState, label, expectedAnswer }) {
  const inputBefore = await adb(label + '-input-before', ['shell', 'dumpsys', 'input_method']);
  const windowBefore = await adb(label + '-window-before', ['shell', 'dumpsys', 'window']);
  const hierarchy = await run(label + '-hierarchy', tools.maestro, [
    '--device', tools.selectedSerial, 'hierarchy', '--no-reinstall-driver',
  ], { timeout: 60_000 });
  const inputAfter = await adb(label + '-input-after', ['shell', 'dumpsys', 'input_method']);
  const windowAfter = await adb(label + '-window-after', ['shell', 'dumpsys', 'window']);
  const firstFrame = visibleKeyboardFrame(windowBefore.stdout, inputBefore.stdout);
  const lastFrame = visibleKeyboardFrame(windowAfter.stdout, inputAfter.stdout);
  if (JSON.stringify(firstFrame) !== JSON.stringify(lastFrame)) {
    throw new Error('화면 영역을 읽는 중 키보드가 움직여 이번 측정을 성공으로 기록하지 않습니다.');
  }
  return assertKeyboardLayout({
    hierarchy: hierarchy.stdout, windowDump: windowAfter.stdout, inputMethodDump: inputAfter.stdout,
    expectedAnswer, screenSize: displayState.original.size.effective,
  });
}

export async function runReadability({ adb, run, tools, runDir, runId, expoUrl, displayState, validateJunit }) {
  const normalDensity = displayState.original.density.effective;
  const presets = [
    { name: 'standard', fontScale: 1, density: normalDensity },
    { name: 'large-font', fontScale: 1.5, density: normalDensity },
    { name: 'narrow-large-font', fontScale: 1.5, density: densityForWidth(displayState.original.size, 320) },
  ];
  const results = [];
  for (const preset of presets) {
    await applyDisplaySettings(displayState, { fontScale: preset.fontScale, density: preset.density });
    const result = {
      ...preset, widthDp: Math.round(displayState.original.size.effective.width * 160 / preset.density * 100) / 100,
      phases: [], keyboards: [],
    };
    for (const phase of ['open', 'correct', 'finish']) {
      await assertDisplaySettings(displayState);
      const label = 'readability-' + preset.name + '-' + phase;
      const output = path.join(runDir, label);
      const junitPath = path.join(runDir, label + '.xml');
      await run(label, tools.maestro, [
        '--device', tools.selectedSerial, 'test', '-e', 'EXPO_URL=' + expoUrl,
        '-e', 'RUN_ID=' + runId, '-e', 'LAYOUT_PRESET=' + preset.name,
        '--format', 'junit', '--output', junitPath, '--test-output-dir', output, '--debug-output', output,
        path.join(repoRoot, 'apps/mobile/.maestro/readability-' + phase + '.yaml'),
      ], { cwd: repoRoot, timeout: 360_000 });
      const junit = await validateJunit(junitPath);
      result.phases.push({ name: phase, junit });
      // 먼저 키보드를 닫아 테스트만 통과시키지 않습니다. 각 흐름이 입력 상태를 유지한 채 끝나면 실제 IME와 두 컨트롤을 측정합니다.
      if (phase !== 'finish') {
        const geometry = await measureKeyboard({
          adb, run, tools, displayState, label, expectedAnswer: phase === 'open' ? '12345' : '3500',
        });
        result.keyboards.push({ phase, ...geometry });
      }
      await assertDisplaySettings(displayState);
    }
    results.push(result);
  }
  return { presets: results };
}
