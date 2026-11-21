import { View } from 'react-native';
import { PRODUCT_CATEGORIES, type CatalogFilter } from '../features/catalog/categories';
import { ActionButton, ui } from './book-ui';

type Props = { value: CatalogFilter; onChange: (value: CatalogFilter) => void };
export function CategoryFilter({ value, onChange }: Props) {
  const choices = [{ id: 'all' as const, label: '전체' }, ...PRODUCT_CATEGORIES];
  return (
    <View style={ui.row}>
      {choices.map((item) => (
        <ActionButton
          key={item.id}
          title={item.label}
          selected={value === item.id}
          secondary={value !== item.id}
          testID={'category-' + item.id}
          onPress={() => onChange(item.id)}
        />
      ))}
    </View>
  );
}
