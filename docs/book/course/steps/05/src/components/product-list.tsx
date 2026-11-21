import { Text, View } from 'react-native';
import type { CatalogProduct } from '../features/catalog/catalog';
import { ActionButton, ui, won } from './book-ui';

type Props = {
  products: readonly CatalogProduct[];
  quantities?: Readonly<Record<string, number>>;
  onAdd: (id: string) => void;
  onDecrease?: (id: string) => void;
};

export function ProductList({ products, quantities = {}, onAdd, onDecrease }: Props) {
  return (
    <View style={{ gap: 12, flexDirection: 'row', flexWrap: 'wrap' }}>
      {products.map((product) => {
        const quantity = quantities[product.id] ?? 0;
        return (
          <View key={product.id} style={[ui.card, { flexGrow: 1, flexBasis: 240, borderLeftWidth: 8, borderLeftColor: product.color }]}>
            <View style={ui.spread}>
              <Text style={ui.title}>{product.emoji} {product.name}</Text>
              <Text style={ui.price}>{won(product.priceKrw)}</Text>
            </View>
            <Text style={ui.small}>{product.unit} · {product.isSample ? '놀이용 예시 가격' : '확인된 가격'}</Text>
            <View style={ui.row}>
              <ActionButton
                title={quantity === 0 ? '담기' : '하나 더 담기'}
                accessibilityLabel={product.name + ' 담기'}
                testID={'product-' + product.id + '-add'}
                disabled={quantity >= 9}
                onPress={() => onAdd(product.id)}
              />
              {onDecrease && quantity > 0 && (
                <ActionButton
                  title="하나 빼기"
                  accessibilityLabel={product.name + ' 하나 빼기'}
                  testID={'product-' + product.id + '-decrease'}
                  secondary
                  onPress={() => onDecrease(product.id)}
                />
              )}
              {onDecrease && <Text style={ui.body}>{quantity}개 담김</Text>}
            </View>
            {quantity >= 9 && <Text style={ui.small}>한 상품은 9개까지 담을 수 있어요.</Text>}
          </View>
        );
      })}
    </View>
  );
}
