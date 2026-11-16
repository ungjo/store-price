import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Keyboard } from 'react-native';

import { scheduleAccessibilityFocus, scheduleAfterKeyboardHidden } from './focus-request';

type AccessibleHost = Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0];
type FocusOptions = { afterKeyboardHides?: boolean };

export function useAccessibilityFocus(target: RefObject<AccessibleHost | null>, { afterKeyboardHides = false }: FocusOptions = {}) {
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => () => { pending.current?.(); }, []);
  return useCallback(() => {
    pending.current?.();
    pending.current = scheduleAccessibilityFocus({
      isScreenReaderEnabled: () => AccessibilityInfo.isScreenReaderEnabled(),
      // 새 버튼이나 안내가 반영된 다음 프레임에서, 숫자 태그 대신 실제 native ref에 이벤트를 보냅니다.
      schedule: (callback) => {
        const schedule = (ready: () => void) => {
          const frame = requestAnimationFrame(ready);
          return () => cancelAnimationFrame(frame);
        };
        if (!afterKeyboardHides) return schedule(callback);
        return scheduleAfterKeyboardHidden({
          isKeyboardVisible: () => Keyboard.isVisible(),
          subscribeDidHide: (listener) => {
            const subscription = Keyboard.addListener('keyboardDidHide', listener);
            return () => subscription.remove();
          },
          schedule,
        }, callback);
      },
      focus: () => {
        if (target.current) AccessibilityInfo.sendAccessibilityEvent(target.current, 'focus');
      },
    });
    return pending.current;
  }, [target, afterKeyboardHides]);
}
