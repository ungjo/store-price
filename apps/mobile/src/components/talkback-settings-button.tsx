import { useEffect, useState } from 'react';
import { AccessibilityInfo, Alert, AppState, Keyboard, Linking, Pressable, StyleSheet, Text } from 'react-native';

export function TalkBackSettingsButton() {
  const [screenReader, setScreenReader] = useState<boolean | null>(null);

  useEffect(() => {
    // 설정을 다녀오거나 다른 화면 읽기 서비스를 써도, 기기의 실제 탐색 상태를 표시합니다.
    let revision = 0;
    function refresh() {
      const request = ++revision;
      void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
        if (request === revision) setScreenReader(enabled);
      }).catch(() => {
        if (request === revision) setScreenReader(null);
      });
    }
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      // 이전 상태 조회가 늦게 끝나도 새 이벤트로 받은 값을 덮지 않습니다.
      revision++;
      setScreenReader(enabled);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    refresh();
    return () => {
      revision++;
      reader.remove();
      appState.remove();
    };
  }, []);

  async function openSettings() {
    Keyboard.dismiss();
    try {
      // TalkBack은 기기 전체에 적용되므로 켜기와 끄기는 Android 설정에서 사용자가 결정합니다.
      await Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS');
    } catch {
      Alert.alert('TalkBack 설정 열기', '기기의 설정 → 접근성 → TalkBack에서 켜거나 끌 수 있어요.');
    }
  }

  const status = screenReader === null ? '기기 접근성 설정' : screenReader ? '화면 읽기 켜짐' : '화면 읽기 꺼짐';
  return (
    <Pressable testID="talkback-settings" accessibilityRole="button"
      accessibilityLabel="TalkBack 설정 열기" accessibilityValue={{ text: status }}
      accessibilityHint="기기의 접근성 설정에서 TalkBack을 켜거나 꺼요."
      onPress={openSettings} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.label}>TalkBack 설정 열기</Text>
      <Text style={styles.status}>{status}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#E6EEDC' },
  label: { color: '#204839', fontSize: 15, fontWeight: '700' },
  status: { color: '#36543A', fontSize: 14 },
  pressed: { backgroundColor: '#CBDCC5' },
});
