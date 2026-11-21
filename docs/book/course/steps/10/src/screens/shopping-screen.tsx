import { useMemo, useReducer, useState } from 'react';
import type { CatalogProduct } from '../features/catalog/catalog';
import { filterProductsByCategory, type CatalogFilter } from '../features/catalog/categories';
import { getCartSummary } from '../features/cart/cart';
import { ActionButton, Body, Card, Page, Title } from '../components/book-ui';
import { CategoryFilter } from '../components/category-filter';
import { ProductList } from '../components/product-list';
import { CartPanel } from '../components/cart-panel';
import { BudgetPanel } from '../components/budget-panel';
import { Keyboard } from 'react-native';
import { createInitialShoppingState, createShoppingReducer, getPaymentSummary } from '../features/payment/payment';
import { PaymentPanel } from '../components/payment-panel';
import { QuizPanel } from '../components/quiz-panel';
import { ReceiptPanel } from '../components/receipt-panel';

type Props = {
  products: readonly CatalogProduct[];
  sourceLabel?: string;
  onNewRound?: () => void;
};

export function ShoppingScreen({ products, sourceLabel = '자체 예시 상품', onNewRound }: Props) {
  const [category, setCategory] = useState<CatalogFilter>('all');
  const reducer = useMemo(() => createShoppingReducer(products), [products]);
  const [shopping, dispatch] = useReducer(reducer, undefined, createInitialShoppingState);
  const cart = shopping.cart;
  // 계산에는 전체 상품을 쓰고, 분류는 화면에 보이는 목록만 바꿉니다.
  const total = getCartSummary(cart, products);
  const visible = filterProductsByCategory(products, category);
  const payment = getPaymentSummary(total.totalPriceKrw, shopping.selectedPaymentKrw);
  const correct = shopping.quiz.status === 'correct';

  if (shopping.receipt !== null) {
    return (
      <Page>
        <ReceiptPanel receipt={shopping.receipt} onNewRound={() => {
          // 서버 목록을 새로 읽는 부모가 있으면 그 부모가 새 놀이 세션을 만듭니다.
          if (onNewRound) onNewRound();
          else { setCategory('all'); dispatch({ type: 'start-new-round' }); }
        }} />
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        <Title>꼬마 시장</Title>
        <Body>{sourceLabel} · 전체 {products.length}개</Body>
        <Body>이 가격은 장보기 연습을 위한 예시예요.</Body>
        <CategoryFilter value={category} onChange={setCategory} />
        <Body>{visible.length}개 상품을 보고 있어요.</Body>
      </Card>
      <BudgetPanel totalPriceKrw={total.totalPriceKrw} hideRemaining={payment.status === 'ready' && !correct} />
      <ProductList products={visible} quantities={cart}
        onAdd={(id) => dispatch({ type: 'add', productId: id })}
        onDecrease={(id) => dispatch({ type: 'decrease', productId: id })} />
      <CartPanel cart={cart} products={products} onAction={dispatch} />
      <PaymentPanel totalPriceKrw={total.totalPriceKrw}
        selectedPaymentKrw={shopping.selectedPaymentKrw}
        revealChange={correct}
        onSelect={(amountKrw) => { Keyboard.dismiss(); dispatch({ type: 'select-payment', amountKrw }); }}
        onClear={() => { Keyboard.dismiss(); dispatch({ type: 'clear-payment' }); }} />
      {payment.status === 'ready' && shopping.selectedPaymentKrw !== null && (
        <QuizPanel quiz={shopping.quiz} totalPriceKrw={total.totalPriceKrw}
          selectedPaymentKrw={shopping.selectedPaymentKrw}
          onAnswer={(answer) => dispatch({ type: 'change-answer', answer })}
          onCheck={() => dispatch({ type: 'check-answer' })}
          onRetry={() => dispatch({ type: 'retry-quiz' })} />
      )}
      <Card>
        <ActionButton title="계산 완료" testID="checkout-complete"
          disabled={payment.status !== 'ready' || !correct}
          onPress={() => dispatch({ type: 'complete-checkout' })} />
        <Body>거스름돈 정답을 맞히면 영수증을 받을 수 있어요.</Body>
      </Card>
    </Page>
  );
}
