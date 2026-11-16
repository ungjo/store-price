type FocusRequest = {
  isScreenReaderEnabled: () => Promise<boolean>;
  schedule: (callback: () => void) => () => void;
  focus: () => void;
};

// 화면 읽기 확인이 늦게 끝나도 이미 떠난 화면의 초점을 빼앗지 않도록 조회와 예약을 함께 취소합니다.
export function scheduleAccessibilityFocus({ isScreenReaderEnabled, schedule, focus }: FocusRequest): () => void {
  let cancelled = false;
  let cancelScheduled: (() => void) | undefined;
  void Promise.resolve().then(isScreenReaderEnabled).then((enabled) => {
    if (!enabled || cancelled) return;
    cancelScheduled = schedule(() => {
      if (cancelled) return;
      cancelled = true;
      focus();
    });
  }).catch(() => {
    // 보조 기능 상태를 확인할 수 없으면 임의로 초점을 옮기지 않고 원래 조작 흐름을 유지합니다.
  });
  return () => {
    cancelled = true;
    cancelScheduled?.();
  };
}

type KeyboardHiddenSchedule = {
  isKeyboardVisible: () => boolean;
  subscribeDidHide: (callback: () => void) => () => void;
  schedule: (callback: () => void) => () => void;
};

// 키보드 닫힘 안내보다 정답 초점이 먼저 전달되지 않게, 숨김 완료 뒤 화면 갱신을 기다립니다.
export function scheduleAfterKeyboardHidden(
  { isKeyboardVisible, subscribeDidHide, schedule }: KeyboardHiddenSchedule,
  callback: () => void,
): () => void {
  let cancelled = false;
  let scheduled = false;
  let removeDidHide: (() => void) | undefined;
  let cancelFrame: (() => void) | undefined;
  const unsubscribe = () => { removeDidHide?.(); removeDidHide = undefined; };
  const whenHidden = () => {
    if (cancelled || scheduled || isKeyboardVisible()) return;
    scheduled = true;
    unsubscribe();
    cancelFrame = schedule(() => {
      // 기다리는 동안 새 입력을 시작했다면 그 입력의 초점을 빼앗지 않습니다.
      if (cancelled || isKeyboardVisible()) return;
      cancelled = true;
      callback();
    });
  };

  // 먼저 구독하고 현재 상태를 다시 읽어 구독 사이에 끝난 닫힘 이벤트도 놓치지 않습니다.
  removeDidHide = subscribeDidHide(whenHidden);
  if (scheduled) unsubscribe();
  whenHidden();
  return () => { cancelled = true; unsubscribe(); cancelFrame?.(); };
}
