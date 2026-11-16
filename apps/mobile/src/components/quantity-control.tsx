import { type ComponentRef, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccessibilityFocus } from '../features/accessibility/use-accessibility-focus';
import { MAX_QUANTITY } from '../features/cart/cart';

type QuantityControlProps = {
  productId: string;
  productName: string;
  quantity: number;
  onAdd: () => void;
  onDecrease: () => void;
};

export function QuantityControl({ productId, productName, quantity, onAdd, onDecrease }: QuantityControlProps) {
  // 상품 ID로 버튼을 구분하면 번역이나 화면 배치가 바뀌어도 같은 상품을 검사할 수 있습니다.
  const testId = 'product-' + productId;
  const addRef = useRef<ComponentRef<typeof View>>(null);
  const restoreAddFocus = useRef(false);
  const focusAdd = useAccessibilityFocus(addRef);
  useEffect(() => {
    if (quantity === 0 && restoreAddFocus.current) {
      restoreAddFocus.current = false;
      return focusAdd();
    }
  }, [quantity, focusAdd]);
  const atLimit = quantity >= MAX_QUANTITY;
  const quantityValue = '현재 ' + quantity + '개 담김' + (atLimit ? '. 9개까지 담을 수 있어요.' : '');

  return (
    <View>
      {/* 0개에서도 같은 부모·key·담기 버튼을 유지해 첫 담기 뒤 화면 읽기 초점이 사라지지 않게 합니다. */}
      <View style={quantity > 0 ? styles.stepper : undefined}>
        {quantity > 0 && (
          <Pressable
            key="decrease"
            testID={testId + '-decrease'}
            accessibilityRole="button"
            accessibilityLabel={productName + ' 한 개 빼기'}
            accessibilityValue={{ text: quantityValue }}
            onPress={() => {
              // 마지막 한 개를 빼면 이 버튼이 없어지므로 남아 있는 담기 버튼으로 읽기 초점을 돌려줍니다.
              restoreAddFocus.current = quantity === 1;
              onDecrease();
            }}
            style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
          >
            <Text style={styles.stepLabel}>−</Text>
          </Pressable>
        )}
        {quantity > 0 && (
          <Text key="quantity" testID={testId + '-quantity'} style={styles.quantity} accessibilityLabel={productName + ' ' + quantity + '개 담김'}>
            {quantity}개
          </Text>
        )}
        <Pressable
          key="add"
          ref={addRef}
          testID={testId + '-add'}
          accessibilityRole="button"
          accessibilityLabel={productName + (quantity === 0 ? ' 담기' : ' 한 개 더 담기')}
          accessibilityValue={{ text: quantityValue }}
          accessibilityState={{ disabled: atLimit }}
          disabled={atLimit}
          onPress={onAdd}
          style={({ pressed }) => [
            quantity === 0 ? styles.addButton : styles.stepButton,
            atLimit && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={quantity === 0 ? styles.addLabel : styles.stepLabel}>{quantity === 0 ? '+ 담기' : '+'}</Text>
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
