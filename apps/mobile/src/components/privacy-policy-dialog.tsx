import { type ComponentRef, type RefObject, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useAccessibilityFocus } from '../features/accessibility/use-accessibility-focus';
import { privacyPolicy } from '../features/privacy/privacy-policy';

export function PrivacyPolicyButton({ openerRef, onPress }: {
  openerRef: RefObject<ComponentRef<typeof View> | null>;
  onPress: () => void;
}) {
  return (
    <Pressable ref={openerRef} testID="privacy-open" accessibilityRole="button"
      accessibilityLabel="개인정보처리방침 열기" onPress={onPress}
      style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}>
      <Text style={styles.openText}>개인정보처리방침</Text>
    </Pressable>
  );
}

export function PrivacyPolicyDialog({ onClose }: { onClose: () => void }) {
  const titleRef = useRef<ComponentRef<typeof Text>>(null);
  const focusTitle = useAccessibilityFocus(titleRef);
  // 본문을 앱에 함께 담아 상품 서버에 연결할 수 없을 때도 같은 내용을 읽게 합니다.
  return (
    <Modal visible onRequestClose={onClose} onShow={() => { focusTitle(); }} animationType="none" presentationStyle="fullScreen">
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} accessibilityViewIsModal>
          <View style={styles.sheet}>
            <ScrollView testID="privacy-body" style={styles.body} contentContainerStyle={styles.content}>
              <Text ref={titleRef} testID="privacy-title" accessible accessibilityRole="header" style={styles.title}>
                {privacyPolicy.title}
              </Text>
              <Text testID="privacy-date" style={styles.date}>시행일 {privacyPolicy.effectiveDate}</Text>
              {privacyPolicy.sections.map((section, index) => (
                <View key={section.heading} style={styles.section}>
                  <Text accessibilityRole="header" style={styles.heading}
                    testID={index === privacyPolicy.sections.length - 1 ? 'privacy-last-heading' : undefined}>
                    {section.heading}
                  </Text>
                  {section.paragraphs.map((paragraph) => <Text key={paragraph} selectable style={styles.text}>{paragraph}</Text>)}
                </View>
              ))}
            </ScrollView>
            <Pressable testID="privacy-close" accessibilityRole="button" accessibilityLabel="개인정보처리방침 닫기"
              onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Text style={styles.closeText}>닫기</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  openButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 },
  openText: { color: '#255B42', fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
  screen: { flex: 1, backgroundColor: '#FAF8F0' },
  sheet: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  body: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  title: { color: '#204839', fontSize: 27, fontWeight: '800' },
  date: { color: '#4E6653', fontSize: 15, marginTop: 8 },
  section: { marginTop: 24 },
  heading: { color: '#234F40', fontSize: 20, fontWeight: '700' },
  text: { color: '#293D31', fontSize: 17, lineHeight: 27, marginTop: 8 },
  closeButton: { minHeight: 50, justifyContent: 'center', alignItems: 'center', backgroundColor: '#255B42', borderRadius: 12, margin: 12, padding: 10 },
  closeText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
