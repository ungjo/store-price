const fail = (message) => new Error('키보드 화면 검사: ' + message);

function validatedAppId(value) {
  if (typeof value !== 'string' || value.length > 255
    || !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u.test(value)) {
    throw fail('검사할 Android 앱의 패키지를 정확히 지정해 주세요.');
  }
  return value;
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export function parseBounds(value) {
  const match = typeof value === 'string' && value.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/u);
  if (!match) throw fail('화면 요소의 실제 영역을 읽지 못했습니다.');
  const [left, top, right, bottom] = match.slice(1).map(Number);
  if (![left, top, right, bottom].every(Number.isSafeInteger) || left >= right || top >= bottom) {
    throw fail('화면 요소 영역이 비어 있거나 올바르지 않습니다.');
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function visibleKeyboardFrame(windowDump, inputMethodDump, expectedAppId = 'host.exp.exponent') {
  const appId = validatedAppId(expectedAppId);
  if (typeof inputMethodDump !== 'string' || !/\bmInputShown=true\b/u.test(inputMethodDump)) {
    throw fail('실제 Android 키보드가 열린 상태를 확인하지 못했습니다.');
  }
  // 비슷한 이름의 다른 앱을 통과시키지 않도록 package/activity 전체 토큰의 경계를 확인합니다.
  const focus = new RegExp('(?:^|\\r?\\n)[\\t ]*mCurrentFocus=Window\\{[^{}\\r\\n]*[\\t ]'
    + escapeRegExp(appId) + '/[^{}\\s]+\\}', 'u');
  if (typeof windowDump !== 'string' || !focus.test(windowDump)) {
    throw fail('검사 앱이 현재 화면에 있는지 확인하지 못했습니다.');
  }
  // 앱의 포커스 표시만으로 키보드 노출을 판단하지 않습니다. Android가 보고하는 실제 IME 영역을 사용합니다.
  // Android 17은 frame 다음에 visibleFrame도 출력합니다. 전체 IME 영역을 기준으로 보수적으로 가림을 확인합니다.
  const matches = [...windowDump.matchAll(/type=ime\b[^\r\n]*?\bframe=(\[-?\d+,-?\d+\]\[-?\d+,-?\d+\])(?:\s+visibleFrame=\[-?\d+,-?\d+\]\[-?\d+,-?\d+\])?\s+visible=true\b/gu)];
  const frames = [...new Set(matches.map((match) => match[1]))];
  if (frames.length !== 1) throw fail('열린 키보드의 영역이 없거나 여러 값으로 보고됐습니다.');
  return parseBounds(frames[0]);
}

function nodesIn(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodesIn);
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.attributes ? [tree] : []), ...nodesIn(tree.children ?? [])];
}

export function assertKeyboardLayout({ hierarchy, windowDump, inputMethodDump, expectedAnswer, screenSize, expectedAppId = 'host.exp.exponent' }) {
  const appId = validatedAppId(expectedAppId);
  if (!/^\d{1,5}$/u.test(expectedAnswer || '')) throw fail('확인할 입력값을 지정해 주세요.');
  if (!Number.isSafeInteger(screenSize?.width) || !Number.isSafeInteger(screenSize?.height)
    || screenSize.width <= 0 || screenSize.height <= 0) throw fail('화면 크기를 확인하지 못했습니다.');
  const keyboard = visibleKeyboardFrame(windowDump, inputMethodDump, appId);
  if (keyboard.left < 0 || keyboard.right > screenSize.width || keyboard.top <= 0 || keyboard.bottom > screenSize.height) {
    throw fail('키보드 영역이 화면 범위와 맞지 않습니다.');
  }
  let tree;
  try { tree = typeof hierarchy === 'string' ? JSON.parse(hierarchy) : hierarchy; }
  catch { throw fail('실제 화면 계층의 JSON을 읽지 못했습니다.'); }
  const nodes = nodesIn(tree);
  const find = (id) => {
    const found = nodes.filter((node) => {
      const value = node.attributes['resource-id'];
      // React Native의 bare testID와 이번 검사 앱이 붙인 접두사만 같은 컨트롤로 인정합니다.
      return value === id || value === appId + ':id/' + id;
    });
    if (found.length !== 1) throw fail(id + '가 하나만 보이는지 확인하지 못했습니다.');
    const node = found[0];
    const rect = parseBounds(node.attributes.bounds);
    if (node.enabled !== true && node.attributes.enabled !== 'true') throw fail(id + '가 비활성 상태입니다.');
    // 중심 좌표만 보이는 것은 통과로 간주하지 않습니다. 입력칸과 버튼 전체가 화면·키보드 위에 있어야 합니다.
    if (rect.left < 0 || rect.top < 0 || rect.right > screenSize.width || rect.bottom > keyboard.top) {
      throw fail(id + ' 일부가 화면 밖이나 키보드 뒤에 있습니다.');
    }
    return { node, rect };
  };
  const input = find('quiz-answer');
  const check = find('quiz-check');
  if (input.node.attributes.text !== expectedAnswer) throw fail('입력한 숫자가 화면에 유지되지 않았습니다.');
  if (input.node.focused !== true && input.node.attributes.focused !== 'true') throw fail('답 입력칸이 포커스를 잃었습니다.');
  const a = input.rect;
  const b = check.rect;
  if (Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) {
    throw fail('입력칸과 확인 버튼의 영역이 겹칩니다.');
  }
  return { keyboard, input: input.rect, check: check.rect, answerLength: expectedAnswer.length, focused: true };
}
