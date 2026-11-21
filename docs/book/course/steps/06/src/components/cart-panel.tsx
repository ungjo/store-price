import { Text, View } from 'react-native';
import type { CatalogProduct } from '../features/catalog/catalog';
import { getCartSummary, type CartAction, type CartState } from '../features/cart/cart';
import { ActionButton, Body, Card, Title, ui, won } from './book-ui';

type Props = { cart: CartState; products: readonly CatalogProduct[]; onAction: (action: CartAction) => void };
export function CartPanel({ cart, products, onAction }: Props) {
  const total = getCartSummary(cart, products);
  return (
    <Card>
      <Title>내 장바구니</Title>
      {total.totalQuantity === 0 && <Body>장바구니가 비었어요. 물건을 골라 주세요.</Body>}
      {products.filter((product) => (cart[product.id] ?? 0) > 0).map((product) => (
        <View key={product.id} style={ui.line}>
          <Text style={ui.body}>{product.name} {cart[product.id]}개 · {won(product.priceKrw * cart[product.id])}</Text>
          <ActionButton title={product.name + ' 모두 빼기'} secondary
            testID={'cart-' + product.id + '-remove'}
            onPress={() => onAction({ type: 'remove', productId: product.id })} />
        </View>
      ))}
      <Text testID="cart-summary" style={ui.price}>총 {total.totalQuantity}개 · {won(total.totalPriceKrw)}</Text>
      <ActionButton title="장바구니 비우기" secondary testID="cart-clear"
        disabled={total.totalQuantity === 0} onPress={() => onAction({ type: 'clear' })} />
    </Card>
  );
}
