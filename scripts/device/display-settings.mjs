const sessions = new WeakMap();
const clone = (value) => JSON.parse(JSON.stringify(value));
const bad = (message) => new Error(message);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function clean(text) {
  if (typeof text !== 'string' || text.length > 8192 || text.includes('\0')) throw bad('화면 설정 응답 형식을 확인하지 못했습니다.');
  return text.trim();
}

function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw bad('화면 설정 숫자의 범위를 확인해 주세요.');
  return value;
}

export function parseCurrentUser(text) {
  const value = clean(text);
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) throw bad('현재 Android 프로필을 확인하지 못했습니다.');
  integer(Number(value), 0, 2147483647);
  return value;
}

export function parseFontScale(text) {
  const raw = clean(text);
  if (raw === 'null') return { raw: null, value: 1 };
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(raw) || Number(raw) < 0.1 || Number(raw) > 10) {
    throw bad('글자 크기의 원래 값을 확인하지 못했습니다.');
  }
  // 복구할 때 1과 1.0도 원래 저장된 문자열대로 되돌립니다.
  return { raw, value: Number(raw) };
}

export function parseWmDensity(text) {
  const match = clean(text).match(/^Physical density: ([1-9]\d*)(?:\r?\nOverride density: ([1-9]\d*))?$/u);
  if (!match) throw bad('화면 밀도의 physical/override 값을 확인하지 못했습니다.');
  const physical = integer(Number(match[1]), 72, 10000);
  const override = match[2] === undefined ? null : integer(Number(match[2]), 72, 10000);
  if (override === physical) throw bad('화면 밀도의 override 응답이 모호합니다.');
  return { physical, override, effective: override ?? physical };
}

export function parseWmSize(text) {
  const match = clean(text).match(/^Physical size: ([1-9]\d*)x([1-9]\d*)(?:\r?\nOverride size: ([1-9]\d*)x([1-9]\d*))?$/u);
  if (!match) throw bad('화면 크기의 physical/override 값을 확인하지 못했습니다.');
  const point = (width, height) => ({ width: integer(Number(width), 1, 32768), height: integer(Number(height), 1, 32768) });
  const physical = point(match[1], match[2]);
  const override = match[3] === undefined ? null : point(match[3], match[4]);
  if (equal(physical, override)) throw bad('화면 크기의 override 응답이 모호합니다.');
  return { physical, override, effective: override ?? physical };
}

export function densityForWidth(size, widthDp = 320) {
  integer(widthDp, 240, 1200);
  const width = integer(size?.effective?.width, 1, 32768);
  // override size가 있으면 그 픽셀 폭을 사용합니다. 올림으로 목표 dp 폭을 넘지 않게 합니다.
  return integer(Math.ceil(width * 160 / widthDp), 72, 2000);
}

function output(result) {
  // Android 설정 명령은 종료 코드 0이어도 stderr에 접근 오류를 쓸 수 있습니다.
  if (!result || result.code !== 0 || result.spawnError || result.signal
    || typeof result.stdout !== 'string' || typeof result.stderr !== 'string' || result.stderr.trim()) {
    throw bad('화면 설정 명령의 성공 응답을 확인하지 못했습니다.');
  }
  return result.stdout;
}

async function command(session, label, args, cleanup = false) {
  return output(await session.adb(label, args, cleanup ? { cleanup: true } : {}));
}

const fontArgs = (userId, verb, value) => ['shell', 'settings', '--user', userId, verb, 'system', 'font_scale', ...(value === undefined ? [] : [value])];
const densityArgs = (value) => ['shell', 'wm', 'density', ...(value === undefined ? [] : [String(value)]), '-d', '0'];

async function currentUser(session, label, cleanup = false) {
  return parseCurrentUser(await command(session, label, ['shell', 'am', 'get-current-user'], cleanup));
}

async function readSnapshot(session, label, cleanup = false) {
  const userId = await currentUser(session, label + '-user-before', cleanup);
  const fontScale = parseFontScale(await command(session, label + '-font', fontArgs(userId, 'get'), cleanup));
  const size = parseWmSize(await command(session, label + '-size', ['shell', 'wm', 'size', '-d', '0'], cleanup));
  const density = parseWmDensity(await command(session, label + '-density', densityArgs(), cleanup));
  if (await currentUser(session, label + '-user-after', cleanup) !== userId) throw bad('조회 중 Android 프로필이 바뀌었습니다.');
  return { userId, fontScale, size, density };
}

function sessionFor(state) {
  const session = sessions.get(state);
  if (!session) throw bad('이 실행에서 직접 캡처한 화면 설정 상태가 필요합니다.');
  return session;
}

function valueOf(snapshot, field) {
  return field === 'fontScale' ? snapshot.fontScale.raw : snapshot.density.override;
}

function setExpected(session, field, value) {
  if (field === 'fontScale') session.expected.fontScale = { raw: value, value: value === null ? 1 : Number(value) };
  else session.expected.density = { physical: session.original.density.physical, override: value, effective: value ?? session.original.density.physical };
}

function conflict(session, field) {
  if (!session.conflicts.includes(field)) session.conflicts.push(field);
}

function fail(session, message) {
  const error = bad(message);
  error.displaySettings = evidence(session);
  return error;
}

function evidence(session) {
  const original = session.original;
  return clone({
    schemaVersion: 1, displayId: 0, original, expected: session.expected, lastObserved: session.lastObserved,
    changes: session.changes, conflicts: session.conflicts, restoration: session.restoration, history: session.history,
    // 자동 재실행 입력으로 신뢰하지 않습니다. 중단 후 원래 값을 확인할 로컬 복구 기록입니다.
    recoveryCommands: {
      fontScale: original.fontScale.raw === null ? fontArgs(original.userId, 'delete') : fontArgs(original.userId, 'put', original.fontScale.raw),
      density: densityArgs(original.density.override ?? 'reset'),
    },
  });
}

export function serializeDisplaySettings(state) {
  return evidence(sessionFor(state));
}

async function notify(session) {
  if (session.onChange) await session.onChange(evidence(session));
}

function inspectExpected(session, snapshot, expected = session.expected) {
  session.lastObserved = snapshot;
  if (snapshot.userId !== session.original.userId) conflict(session, 'profile');
  if (!equal(snapshot.size, session.original.size)) conflict(session, 'size');
  if (snapshot.density.physical !== session.original.density.physical) conflict(session, 'physicalDensity');
  for (const field of ['fontScale', 'density']) {
    if (valueOf(snapshot, field) !== valueOf(expected, field)) conflict(session, field);
  }
  if (session.conflicts.length) throw fail(session, '검사 중 화면 설정이나 Android 프로필이 바뀌어 사용자 변경을 보존합니다.');
}

export async function captureDisplaySettings({ adb, onChange } = {}) {
  if (typeof adb !== 'function' || (onChange !== undefined && typeof onChange !== 'function')) throw bad('화면 설정 연결 도구가 필요합니다.');
  const session = { adb, onChange };
  const original = await readSnapshot(session, 'display-capture');
  // 외부에서 복구 원본을 바꿔도 기기 쓰기에 반영되지 않도록 내부 사본과 읽기 전용 핸들을 분리합니다.
  const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const state = Object.freeze({ schemaVersion: 1, original: freeze(clone(original)) });
  Object.assign(session, {
    original, expected: clone(original), lastObserved: clone(original), conflicts: [], history: [], sequence: 0, busy: false,
    changes: Object.fromEntries(['fontScale', 'density'].map((field) => [field, {
      requested: false, target: valueOf(original, field), before: valueOf(original, field), pending: false,
      restoreAttempted: false, restoreStatus: 'not-needed',
    }])),
    restoration: { attempts: 0, verified: false },
  });
  sessions.set(state, session);
  await notify(session);
  return state;
}

async function exclusive(session, action) {
  if (session.busy) throw bad('화면 설정 작업을 동시에 실행할 수 없습니다.');
  session.busy = true;
  try { return await action(); } finally { session.busy = false; }
}

export async function assertDisplaySettings(state) {
  const session = sessionFor(state);
  return exclusive(session, async () => {
    inspectExpected(session, await readSnapshot(session, 'display-check-' + ++session.sequence));
    return evidence(session);
  });
}

export async function applyDisplaySettings(state, options = {}) {
  const session = sessionFor(state);
  if (typeof options !== 'object' || options === null || Array.isArray(options)
    || Object.keys(options).some((key) => !['fontScale', 'density'].includes(key))
    || !Number.isFinite(options.fontScale) || options.fontScale < 1 || options.fontScale > 2) {
    throw bad('검사 글자 크기는 1~2 범위로 지정해 주세요.');
  }
  if (options.density !== undefined) integer(options.density, 72, 2000);
  return exclusive(session, async () => {
    const phase = ++session.sequence;
    if (session.restoration.attempts > 0) throw bad('복구를 시작한 화면 설정은 새 검사에 다시 사용하지 않습니다.');
    try {
      inspectExpected(session, await readSnapshot(session, 'display-apply-' + phase + '-before'));
      const desired = { fontScale: String(options.fontScale) };
      if (options.density !== undefined) desired.density = options.density === session.original.density.physical ? null : options.density;
      for (const field of ['fontScale', 'density']) {
        if (!(field in desired) || valueOf(session.expected, field) === desired[field]) continue;
        // 매 쓰기 직전에 재확인해 앞 설정 명령 사이에 들어온 사용자 변경도 덮어쓰지 않습니다.
        inspectExpected(session, await readSnapshot(session, 'display-apply-' + phase + '-' + field + '-before'));
        const beforeWrite = clone(session.expected);
        const change = session.changes[field];
        change.before = valueOf(session.expected, field);
        change.target = desired[field];
        change.requested = true;
        change.pending = true;
        change.restoreStatus = 'pending';
        setExpected(session, field, change.target);
        session.history.push({ phase, field, before: change.before, target: change.target, status: 'requested' });
        // 응답이 끊겨도 실제 값은 바뀌었을 수 있으므로, 쓰기 전에 소유한 값과 복구 정보를 남깁니다.
        await notify(session);
        // 기록 저장을 기다리는 사이 사용자가 설정을 바꾼 경우에도 덮어쓰지 않도록 쓰기 직전 다시 읽습니다.
        inspectExpected(session, await readSnapshot(session, 'display-apply-' + phase + '-' + field + '-before-write'), beforeWrite);
        const args = field === 'fontScale' ? fontArgs(session.original.userId, 'put', change.target) : densityArgs(options.density);
        const response = clean(await command(session, 'display-apply-' + phase + '-' + field, args));
        if (response) throw bad('화면 설정 쓰기 응답이 예상과 다릅니다.');
        const observed = await readSnapshot(session, 'display-apply-' + phase + '-' + field + '-after');
        session.lastObserved = observed;
        // 명령이 적용되지 않은 경우는 복구 가능한 pending 상태로 두고, 제3의 값만 사용자 변경으로 표시합니다.
        const value = valueOf(observed, field);
        if (value !== change.target && value === change.before) throw bad('요청한 화면 설정이 적용되지 않았습니다.');
        inspectExpected(session, observed);
        change.pending = false;
        session.history.at(-1).status = 'verified';
        await notify(session);
      }
      return evidence(session);
    } catch (error) {
      if (!error.displaySettings) error.displaySettings = evidence(session);
      throw error;
    }
  });
}

async function restoreField(session, field, attempt) {
  const change = session.changes[field];
  if (!change.requested) return;
  if (session.conflicts.includes(field)) { change.restoreStatus = 'preserved-change'; return; }
  const label = 'display-restore-' + attempt + '-' + field;
  try {
    if (await currentUser(session, label + '-user', true) !== session.original.userId) {
      conflict(session, 'profile'); change.restoreStatus = 'preserved-profile-change'; return;
    }
    const readValue = async (suffix) => {
      if (field === 'fontScale') return parseFontScale(await command(session, label + suffix, fontArgs(session.original.userId, 'get'), true)).raw;
      const density = parseWmDensity(await command(session, label + suffix, densityArgs(), true));
      if (density.physical !== session.original.density.physical) throw bad('복구 중 physical density가 바뀌었습니다.');
      return density.override;
    };
    const current = await readValue('-before');
    const original = valueOf(session.original, field);
    const alreadyRestored = current === original && (change.restoreAttempted || (change.pending && change.before === original));
    if (current !== change.target && !(change.pending && current === change.before) && !alreadyRestored) {
      conflict(session, field); change.restoreStatus = 'preserved-change'; return;
    }
    if (current !== original) {
      // Android wm density는 USER_CURRENT에 적용됩니다. 프로필이 바뀌었으면 다른 프로필을 건드리지 않습니다.
      if (await currentUser(session, label + '-user-before-write', true) !== session.original.userId) {
        conflict(session, 'profile'); change.restoreStatus = 'preserved-profile-change'; return;
      }
      change.restoreStatus = 'requested';
      // 기록 저장 실패가 이미 바꾼 휴대전화 설정의 원상 복구까지 막지는 않게 합니다.
      try { await notify(session); } catch { session.restoration.recordingFailed = true; }
      if (await currentUser(session, label + '-user-after-recording', true) !== session.original.userId) {
        conflict(session, 'profile'); change.restoreStatus = 'preserved-profile-change'; return;
      }
      if (await readValue('-before-write') !== current) {
        conflict(session, field); change.restoreStatus = 'preserved-change'; return;
      }
      if (await currentUser(session, label + '-user-immediately-before-write', true) !== session.original.userId) {
        conflict(session, 'profile'); change.restoreStatus = 'preserved-profile-change'; return;
      }
      change.restoreAttempted = true;
      const args = field === 'fontScale'
        ? original === null ? fontArgs(session.original.userId, 'delete') : fontArgs(session.original.userId, 'put', original)
        : densityArgs(original ?? 'reset');
      const response = clean(await command(session, label, args, true));
      const deleted = field === 'fontScale' && original === null && /^Deleted [01] rows?$/u.test(response);
      if (response && !deleted) throw bad('화면 설정 복구 응답이 예상과 다릅니다.');
    }
    if (await readValue('-after') !== original) throw bad('원래 화면 설정으로 복구되지 않았습니다.');
    if (await currentUser(session, label + '-user-after', true) !== session.original.userId) {
      conflict(session, 'profile'); throw bad('복구 중 Android 프로필이 바뀌었습니다.');
    }
    setExpected(session, field, original);
    change.pending = false;
    change.restoreStatus = 'restored';
  } catch {
    change.restoreStatus = 'failed';
  }
}

export async function restoreDisplaySettings(state) {
  const session = sessionFor(state);
  return exclusive(session, async () => {
    if (session.restoration.verified) {
      // 물리적 복구 성공만으로 기록 실패를 숨기지 않습니다. 재호출도 같은 검사 실패를 유지합니다.
      if (session.restoration.recordingFailed) throw fail(session, '화면 설정은 복구했지만 복구 기록 저장에 실패했습니다.');
      return evidence(session);
    }
    const attempt = ++session.restoration.attempts;
    session.restoration.verified = false;
    // 한 항목의 복구 실패가 다른 항목의 복구를 막지 않으며, finally에서 같은 상태로 재시도할 수 있습니다.
    for (const field of ['density', 'fontScale']) await restoreField(session, field, attempt);
    try {
      const current = await readSnapshot(session, 'display-restored-' + attempt, true);
      session.lastObserved = current;
      if (current.userId !== session.original.userId) conflict(session, 'profile');
      if (!equal(current.size, session.original.size)) conflict(session, 'size');
      if (current.density.physical !== session.original.density.physical) conflict(session, 'physicalDensity');
      const valuesMatch = ['fontScale', 'density'].every((field) => valueOf(current, field) === valueOf(session.original, field));
      const statusesMatch = Object.values(session.changes).every((change) => !change.requested || change.restoreStatus === 'restored');
      session.restoration.verified = valuesMatch && statusesMatch && session.conflicts.length === 0;
    } catch { session.restoration.verified = false; }
    try { await notify(session); } catch { session.restoration.recordingFailed = true; }
    if (!session.restoration.verified) throw fail(session, '화면 설정의 정확한 복구를 확인하지 못해 검사를 완료하지 않습니다. 사용자 변경은 보존했습니다.');
    if (session.restoration.recordingFailed) throw fail(session, '화면 설정은 복구했지만 복구 기록 저장에 실패했습니다.');
    return evidence(session);
  });
}
