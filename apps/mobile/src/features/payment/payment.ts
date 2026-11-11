import { STARTING_BUDGET_KRW } from '../budget/budget.ts';
import { createCartReducer, getCartSummary, type CartAction, type CartState } from '../cart/cart.ts';

export const PAYMENT_OPTIONS_KRW = [1000, 5000, 10000] as const;

export type ShoppingState = {
  cart: CartState;
  selectedPaymentKrw: number | null;
};

export type ShoppingAction =
  | CartAction
  | { type: 'select-payment'; amountKrw: number }
  | { type: 'clear-payment' };

type PaymentSummary = {
  status: 'empty' | 'over-budget' | 'unselected' | 'insufficient' | 'ready';
  missingAmountKrw: number;
};

function isAvailablePayment(amountKrw: number | null, budgetKrw: number): amountKrw is number {
  return amountKrw !== null
    && amountKrw <= budgetKrw
    && PAYMENT_OPTIONS_KRW.some((option) => option === amountKrw);
}

export function createShoppingReducer(
  catalog: readonly { id: string; priceKrw: number }[],
  budgetKrw: number = STARTING_BUDGET_KRW,
) {
  const cartReducer = createCartReducer(catalog);

  return function shoppingReducer(state: ShoppingState, action: ShoppingAction): ShoppingState {
    if (action.type === 'select-payment') {
      const { totalPriceKrw } = getCartSummary(state.cart, catalog);

      // 빈 장바구니나 예산 초과 상태에서는 먼저 물건을 고쳐 고른 뒤 지불할 돈을 선택합니다.
      if (
        !isAvailablePayment(action.amountKrw, budgetKrw)
        || totalPriceKrw <= 0
        || totalPriceKrw > budgetKrw
        || state.selectedPaymentKrw === action.amountKrw
      ) {
        return state;
      }

      // 적게 고른 돈도 받아 부족한 금액을 배우게 합니다. 여러 번 눌러도 금액은 누적하지 않습니다.
      return { ...state, selectedPaymentKrw: action.amountKrw };
    }

    if (action.type === 'clear-payment') {
      return state.selectedPaymentKrw === null ? state : { ...state, selectedPaymentKrw: null };
    }

    const cart = cartReducer(state.cart, action);

    // 실제 상품 구성이 바뀐 경우에만 선택을 비웁니다. 수량 상한처럼 변화 없는 동작은 선택을 유지합니다.
    return cart === state.cart ? state : { cart, selectedPaymentKrw: null };
  };
}

export function getPaymentSummary(
  totalPriceKrw: number,
  selectedPaymentKrw: number | null,
  budgetKrw: number = STARTING_BUDGET_KRW,
): PaymentSummary {
  // 먼저 장바구니의 구매 가능 여부를 알려야 돈 선택 안내와 예산 초과 안내가 충돌하지 않습니다.
  if (totalPriceKrw <= 0) {
    return { status: 'empty', missingAmountKrw: 0 };
  }

  if (totalPriceKrw > budgetKrw) {
    return { status: 'over-budget', missingAmountKrw: 0 };
  }

  if (!isAvailablePayment(selectedPaymentKrw, budgetKrw)) {
    return { status: 'unselected', missingAmountKrw: 0 };
  }

  if (selectedPaymentKrw < totalPriceKrw) {
    return { status: 'insufficient', missingAmountKrw: totalPriceKrw - selectedPaymentKrw };
  }

  // ready는 돈이 충분하다는 뜻이며, 이 단계에서 결제 완료나 거스름돈 계산을 처리하지 않습니다.
  return { status: 'ready', missingAmountKrw: 0 };
}
