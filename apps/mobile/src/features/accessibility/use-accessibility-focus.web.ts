import { useCallback, useEffect, useRef } from 'react';
import type { useAccessibilityFocus as useNativeAccessibilityFocus } from './use-accessibility-focus.ts';

export const useAccessibilityFocus: typeof useNativeAccessibilityFocus = (target) => {
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => () => pending.current?.(), []);

  return useCallback(() => {
    pending.current?.();
    // 화면이 바뀐 뒤 새로 렌더링된 제목이나 버튼에 브라우저 초점을 옮긴다.
    const frame = requestAnimationFrame(() => {
      pending.current = null;
      const element = target.current;
      if (!(element instanceof HTMLElement) || !element.isConnected) return;

      // 제목과 결과 문구도 초점을 받을 수 있게 하되, 키보드의 Tab 이동 순서는 유지한다.
      if (element.tabIndex < 0 && !element.hasAttribute('tabindex')) {
        element.tabIndex = -1;
      }
      element.focus();
    });
    const cancel = () => cancelAnimationFrame(frame);
    pending.current = cancel;
    return cancel;
  }, [target]);
};
