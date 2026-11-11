import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_QUANTITY } from '../features/cart/cart';

type QuantityControlProps = {
  productName: string;
  quantity: number;
  onAdd: () => void;
  onDecrease: () => void;
};

export function QuantityControl({ productName, quantity, onAdd, onDecrease }: QuantityControlProps) {
  if (quantity === 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={productName + ' 담기'}
        onPress={onAdd}
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
      >
        <Text style={styles.addLabel}>+ 담기</Text>
      </Pressable>
    );
  }

  const atLimit = quantity >= MAX_QUANTITY;

  return (
    <View>
      {/* 각 버튼을 따로 읽도록 묶지 않고, 기호 대신 동작과 상품 이름을 알려줍니다. */}
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={productName + ' 한 개 빼기'}
          onPress={onDecrease}
          style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
        >
          <Text style={styles.stepLabel}>−</Text>
        </Pressable>
        <Text style={styles.quantity} accessibilityLabel={productName + ' ' + quantity + '개 담김'}>
          {quantity}개
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={productName + ' 한 개 더 담기'}
          accessibilityState={{ disabled: atLimit }}
          disabled={atLimit}
          onPress={onAdd}
          style={({ pressed }) => [
            styles.stepButton,
            atLimit && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.stepLabel}>+</Text>
        </Pressable>
      </View>
      {atLimit && <Text style={styles.limit}>9개까지 담을 수 있어요</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: { minHeight: 48, backgroundColor: '#295C43', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 14, padding: 8 },
  addLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 },
  stepButton: { minWidth: 44, minHeight: 48, borderRadius: 12, backgroundColor: '#E7EFDF', justifyContent: 'center', alignItems: 'center', padding: 4 },
  stepLabel: { color: '#234F40', fontSize: 26, fontWeight: '700' },
  quantity: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#293D31' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  limit: { fontSize: 12, lineHeight: 18, color: '#705C3B', textAlign: 'center', marginTop: 8 },
});
