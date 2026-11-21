import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function won(amount: number) {
  return amount.toLocaleString('ko-KR') + '원';
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={ui.screen}>
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={ui.card}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={ui.title}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={ui.body}>{children}</Text>;
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  secondary?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

export function ActionButton({
  title, onPress, disabled = false, selected = false,
  secondary = false, accessibilityLabel, testID,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        ui.button, secondary && ui.secondary,
        selected && ui.selected, disabled && ui.disabled,
        pressed && !disabled && ui.pressed,
      ]}
    >
      <Text style={[ui.buttonText, secondary && ui.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAF8EF' },
  content: { padding: 16, paddingBottom: 48, gap: 16, width: '100%', maxWidth: 900, alignSelf: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, gap: 12 },
  title: { color: '#184F39', fontSize: 26, fontWeight: '700' },
  body: { color: '#20392D', fontSize: 18, lineHeight: 28, flexShrink: 1 },
  small: { color: '#526257', fontSize: 15, lineHeight: 23 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  spread: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: '#236B4B', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  secondary: { backgroundColor: '#E8F1E7' },
  secondaryText: { color: '#184F39' },
  selected: { borderWidth: 3, borderColor: '#E1A83D', paddingHorizontal: 13, paddingVertical: 9 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  price: { color: '#184F39', fontSize: 23, fontWeight: '700' },
  line: { borderTopWidth: 1, borderTopColor: '#D9E2D6', paddingTop: 12, gap: 8 },
  input: { minHeight: 50, minWidth: 140, flexGrow: 1, borderWidth: 2, borderColor: '#8AAB91', borderRadius: 10, paddingHorizontal: 12, fontSize: 22, backgroundColor: '#FFFFFF', color: '#20392D' },
});
