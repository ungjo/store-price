import { STARTING_BUDGET_KRW } from '../budget/budget.ts';
import { createCartReducer, getCartSummary, type CartAction, type CartState } from '../cart/cart.ts';

import { gradeChangeAnswer, type ChangeQuizState } from './change-quiz.ts';
import { createReceipt, type Receipt, type ReceiptCatalogProduct } from './receipt.ts';

export const PAYMENT_OPTIONS_KRW = [1000, 5000, 10000] as const;

export type ShoppingState = {
  cart: CartState;
  selectedPaymentKrw: number | null;
  quiz: ChangeQuizState;
  receipt: Receipt | null;
};

export type ShoppingAction =
  | CartAction
  | { type: 'select-payment'; amountKrw: number }
  | { type: 'clear-payment' }
  | { type: 'change-answer'; answer: string }
  | { type: 'check-answer' }
  | { type: 'retry-quiz' }
  | { type: 'complete-checkout' }
  | { type: 'start-new-round' };

type PaymentSummary = {
  status: 'empty' | 'over-budget' | 'unselected' | 'insufficient' | 'ready';
  missingAmountKrw: number;
  changeAmountKrw: number | null;
};

function createUnansweredQuiz(): ChangeQuizState {
  return { answer: '', status: 'unanswered' };
}

export function createInitialShoppingState(): ShoppingState {
  return { cart: {}, selectedPaymentKrw: null, quiz: createUnansweredQuiz(), receipt: null };
}

function isAvailablePayment(amountKrw: number | null, budgetKrw: number): amountKrw is number {
  return amountKrw !== null
    && amountKrw <= budgetKrw
    && PAYMENT_OPTIONS_KRW.some((option) => option === amountKrw);
}

export function createShoppingReducer(
  catalog: readonly ReceiptCatalogProduct[],
  budgetKrw: number = STARTING_BUDGET_KRW,
) {
  const cartReducer = createCartReducer(catalog);

  return function shoppingReducer(state: ShoppingState, action: ShoppingAction): ShoppingState {
    if (action.type === 'start-new-round') {
      // 진행 중인 장보기를 잘못 지우지 않도록, 계산을 끝낸 영수증에서만 새 놀이를 시작합니다.
      return state.receipt === null ? state : createInitialShoppingState();
    }

    // 완료 화면에서는 중복 탭과 늦게 도착한 입력을 무시해 영수증이 바뀌거나 두 번 계산되지 않게 합니다.
    if (state.receipt !== null) {
      return state;
    }

    if (action.type === 'complete-checkout') {
      const { totalPriceKrw } = getCartSummary(state.cart, catalog);
      const payment = getPaymentSummary(totalPriceKrw, state.selectedPaymentKrw, budgetKrw);
      // 정답 표시만 믿지 않고 현재 물건값과 낼 돈으로 다시 확인해야 이전 문제의 답으로 완료되지 않습니다.
      if (
        payment.status !== 'ready'
        || payment.changeAmountKrw === null
        || state.selectedPaymentKrw === null
        || state.quiz.status !== 'correct'
        || gradeChangeAnswer(state.quiz.answer, payment.changeAmountKrw) !== 'correct'
      ) {
        return state;
      }

      // 영수증을 먼저 값으로 복사하고 장바구니·선택·답을 한 번에 비워 완료 전후 상태가 섞이지 않게 합니다.
      const receipt = createReceipt(state.cart, catalog, state.selectedPaymentKrw, budgetKrw);
      return { ...createInitialShoppingState(), receipt };
    }

    if (action.type === 'change-answer' || action.type === 'check-answer' || action.type === 'retry-quiz') {
      const { totalPriceKrw } = getCartSummary(state.cart, catalog);
      const { changeAmountKrw } = getPaymentSummary(totalPriceKrw, state.selectedPaymentKrw, budgetKrw);

      // 채점의 기준은 현재 장바구니와 고른 돈입니다. 돈이 부족하거나 선택 전이면 오래된 답을 채점하지 않습니다.
      // 0원도 유효한 정답이므로 참/거짓 대신 null 여부로 준비 상태를 구분합니다.
      if (changeAmountKrw === null) {
        return state;
      }

      if (action.type === 'retry-quiz') {
        return state.quiz.answer === '' && state.quiz.status === 'unanswered'
          ? state
          : { ...state, quiz: createUnansweredQuiz() };
      }

      // 정답을 맞힌 화면은 다시 풀기를 선택할 때까지 보존해 입력 실수로 결과가 사라지지 않게 합니다.
      if (state.quiz.status === 'correct') {
        return state;
      }

      if (action.type === 'change-answer') {
        return state.quiz.answer === action.answer && state.quiz.status === 'unanswered'
          ? state
          : { ...state, quiz: { answer: action.answer, status: 'unanswered' } };
      }

      const status = gradeChangeAnswer(state.quiz.answer, changeAmountKrw);
      return status === state.quiz.status ? state : { ...state, quiz: { ...state.quiz, status } };
    }

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
      // 고른 돈이 달라지면 문제의 정답도 달라지므로 이전 입력과 채점 결과를 함께 지웁니다.
      return { ...state, selectedPaymentKrw: action.amountKrw, quiz: createUnansweredQuiz() };
    }

    if (action.type === 'clear-payment') {
      return state.selectedPaymentKrw === null
        ? state
        : { ...state, selectedPaymentKrw: null, quiz: createUnansweredQuiz() };
    }

    const cart = cartReducer(state.cart, action);

    // 상품 구성이 바뀌면 돈 선택과 퀴즈도 같은 상태 변경에서 지워 이전 문제의 답이 남지 않게 합니다.
    // 수량 상한처럼 실제 변화 없는 동작은 선택과 풀이를 그대로 유지합니다.
    return cart === state.cart ? state : { cart, selectedPaymentKrw: null, quiz: createUnansweredQuiz(), receipt: null };
  };
}

export function getPaymentSummary(
  totalPriceKrw: number,
  selectedPaymentKrw: number | null,
  budgetKrw: number = STARTING_BUDGET_KRW,
): PaymentSummary {
  // 먼저 장바구니의 구매 가능 여부를 알려야 돈 선택 안내와 예산 초과 안내가 충돌하지 않습니다.
  // 계산할 수 없는 거스름돈은 null로 두어, 정확히 냈을 때의 유효한 0원과 구분합니다.
  if (totalPriceKrw <= 0) {
    return { status: 'empty', missingAmountKrw: 0, changeAmountKrw: null };
  }

  if (totalPriceKrw > budgetKrw) {
    return { status: 'over-budget', missingAmountKrw: 0, changeAmountKrw: null };
  }

  if (!isAvailablePayment(selectedPaymentKrw, budgetKrw)) {
    return { status: 'unselected', missingAmountKrw: 0, changeAmountKrw: null };
  }

  if (selectedPaymentKrw < totalPriceKrw) {
    return { status: 'insufficient', missingAmountKrw: totalPriceKrw - selectedPaymentKrw, changeAmountKrw: null };
  }

  // 거스름돈은 실제로 고른 놀이돈에서 물건값을 뺍니다. 전체 예산에서 뺀 남을 돈과는 다릅니다.
  // 계산 결과만 돌려주며 장바구니·돈 선택을 바꾸거나 결제 완료로 처리하지 않습니다.
  return { status: 'ready', missingAmountKrw: 0, changeAmountKrw: selectedPaymentKrw - totalPriceKrw };
}
