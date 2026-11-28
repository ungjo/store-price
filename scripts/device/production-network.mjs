// 정식 앱의 UID별 커널 통계를 읽어 다른 앱·시스템 트래픽을 장보기 결과에서 제외합니다.
export function readUidBytes(output, uid) {
  const rows = output.trim().split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!/^mAppUidStatsMap::?$/u.test(rows[0]) || rows[1] !== 'uid rxBytes rxPackets txBytes txPackets'
    || !/^mStatsMapA::?$/u.test(rows.at(-1))) throw new Error('Android UID 통계 표를 끝까지 읽지 못했습니다.');
  let target;
  let positiveControl = false;
  for (const row of rows.slice(2, -1)) {
    const cells = row.split(/\s+/u);
    if (cells.length !== 5 || cells.some((value) => !/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)))) {
      throw new Error('Android UID 통계의 열 형식을 확인하지 못했습니다.');
    }
    const [id, rx, , tx] = cells.map(Number);
    if (id === uid) {
      if (target) throw new Error('대상 UID가 통계 표에 중복되었습니다.');
      target = { rx, tx };
    } else if (rx > 0 || tx > 0) positiveControl = true;
  }
  if (!positiveControl) throw new Error('다른 UID의 실제 통신 기록이 없어 통계 수집을 확인하지 못했습니다.');
  // 커널은 첫 패킷을 처리할 때 이 표에 UID를 추가합니다.
  return target ?? { rx: 0, tx: 0 };
}

export function validatedDefaultNetwork(output) {
  const defaults = [...output.matchAll(/^\s*Active default network:\s*(none|\d+)\s*$/gmu)];
  const section = /Current Networks:([\s\S]*?)Status for known UIDs:/u.exec(output)?.[1];
  const id = defaults[0]?.[1];
  const agents = section?.split(/\r?\n/u).filter((line) => line.trimStart().startsWith('NetworkAgentInfo{network{' + id + '}'));
  const caps = agents?.[0]?.match(/\bCapabilities:\s+([A-Z0-9_&]+)(?=\s|\])/u)?.[1].split('&');
  if (defaults.length !== 1 || id === 'none' || agents?.length !== 1 || !caps?.includes('INTERNET') || !caps.includes('VALIDATED')) {
    throw new Error('기기의 기본 인터넷 연결이 Android에서 검증되지 않았습니다. Wi-Fi 또는 모바일 데이터를 확인해 주세요.');
  }
  return id;
}

export async function snapshotProductionNetwork({ read, applicationId, user, phase }) {
  const packages = await read(phase + '-uid', ['shell', 'pm', 'list', 'packages', '-U', '--user', user, applicationId]);
  const rows = packages.split(/\r?\n/u).filter((line) => line.startsWith('package:' + applicationId + ' '));
  const uid = Number(/ uid:(\d+)$/u.exec(rows[0] ?? '')?.[1]);
  if (rows.length !== 1 || !Number.isSafeInteger(uid) || uid <= 0) throw new Error('현재 사용자에 설치한 정식 앱의 UID를 확인하지 못했습니다.');
  const network = validatedDefaultNetwork(await read(phase + '-connectivity', ['shell', 'dumpsys', 'connectivity']));
  // Android 버전에 따라 동일한 eBPF 통계 표를 게시하는 시스템 서비스가 다릅니다.
  for (const service of ['netstats', 'connectivity trafficcontroller', 'netd trafficcontroller']) {
    const table = await read(phase + '-bytes-' + service.split(' ')[0], ['shell',
      "dumpsys " + service + " | sed -n -E '/^[[:space:]]*mAppUidStatsMap::?[[:space:]]*$/,/^[[:space:]]*mStatsMapA::?[[:space:]]*$/p'"]);
    if (table.trim()) return { uid, network, service, ...readUidBytes(table, uid), timestamp: new Date().toISOString() };
  }
  throw new Error('이 Android 기기에서 앱별 네트워크 바이트를 직접 확인하지 못했습니다.');
}

export function compareShoppingNetwork(before, after) {
  if (before.uid !== after.uid || before.service !== after.service) throw new Error('검사 중 앱 UID 또는 통계 출처가 바뀌었습니다.');
  if (before.rx !== after.rx || before.tx !== after.tx) throw new Error('장보기 중 정식 앱의 네트워크 송수신 바이트가 변했습니다.');
  return { before, after, receivedBytes: 0, sentBytes: 0 };
}
