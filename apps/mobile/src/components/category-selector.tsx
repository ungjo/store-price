import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { PRODUCT_CATEGORIES, type CatalogFilter, type CategoryCounts } from '../features/catalog/categories';

type CategorySelectorProps = {
  selected: CatalogFilter;
  counts: CategoryCounts;
  onSelect: (category: CatalogFilter) => void;
};

const choices = [{ id: 'all', label: '전체' }, ...PRODUCT_CATEGORIES] as const;

export function CategorySelector({ selected, counts, onSelect }: CategorySelectorProps) {
  const { width, fontScale } = useWindowDimensions();
  // 긴 분류명과 선택 표시를 함께 읽도록 큰 글자·좁은 화면에서는 버튼을 한 열로 펼칩니다.
  const singleColumn = width < 380 || fontScale > 1.2;
  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">어떤 물건을 볼까요?</Text>
      <Text style={styles.hint}>분류를 바꿔도 담은 물건은 그대로예요.</Text>
      <View style={styles.choices}>
        {choices.map((category) => {
          const active = selected === category.id;
          return (
            <Pressable
              key={category.id}
              testID={'category-' + category.id}
              accessibilityRole="button"
              // 선택 상태는 별도 속성으로 전달해 TalkBack이 같은 안내를 두 번 읽지 않게 합니다.
              accessibilityLabel={category.label + ' 상품 ' + counts[category.id] + '개'}
              accessibilityState={{ selected: active }}
              accessibilityHint="보이는 상품만 바꿔요."
              onPress={() => onSelect(category.id)}
              style={({ pressed }) => [styles.button, singleColumn && styles.fullWidthButton, active && styles.selected, pressed && styles.pressed]}
            >
              <Text style={[styles.label, active && styles.selectedText]}>{category.label}</Text>
              {/* 색만으로 구분하지 않아 선택한 분류를 글자로도 확인할 수 있습니다. */}
              <Text style={[styles.count, active && styles.selectedText]}>
                {counts[category.id]}가지{active ? ' · 선택됨' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  heading: { color: '#293D31', fontSize: 19, fontWeight: '800' },
  hint: { color: '#596B5B', fontSize: 14, lineHeight: 22, marginTop: 6, marginBottom: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { flexBasis: '45%', flexGrow: 1, minWidth: 130, minHeight: 76, borderRadius: 14, borderWidth: 2, borderColor: '#CAD7C3', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 12, justifyContent: 'center' },
  fullWidthButton: { flexBasis: '100%' },
  selected: { backgroundColor: '#255B42', borderColor: '#255B42' },
  label: { color: '#315239', fontSize: 16, fontWeight: '800' },
  count: { color: '#596B5B', fontSize: 14, lineHeight: 21, marginTop: 4 },
  selectedText: { color: '#FFFFFF' },
  pressed: { opacity: 0.7 },
});
