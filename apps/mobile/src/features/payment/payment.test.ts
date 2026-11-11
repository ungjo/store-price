import assert from 'node:assert/strict';
import test from 'node:test';

import { getBudgetSummary } from '../budget/budget.ts';
import { getCartSummary, type CartAction } from '../cart/cart.ts';

import {
  createInitialShoppingState,
  createShoppingReducer,
  getPaymentSummary,
  PAYMENT_OPTIONS_KRW,
  type ShoppingState,
} from './payment.ts';

const catalog = [
  { id: 'apple', name: '사과', unit: '1개', priceKrw: 1500 },
  { id: 'milk', name: '우유', unit: '1팩 · 1L', priceKrw: 2500 },
  { id: 'carrot', name: '당근', unit: '1개', priceKrw: 1000 },
] as const;

const reducer = createShoppingReducer(catalog);

test('빈 장바구니에서는 지불할 돈을 선택하지 않고 빈 상태를 먼저 안내한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: {}, selectedPaymentKrw: null };
  assert.equal(reducer(state, { type: 'select-payment', amountKrw: 10000 }), state);
  assert.deepEqual(getPaymentSummary(0, null), { status: 'empty', missingAmountKrw: 0, changeAmountKrw: null });
  assert.deepEqual(getPaymentSummary(0, 10000, 5000), { status: 'empty', missingAmountKrw: 0, changeAmountKrw: null });
});

test('예산을 넘은 장바구니에서는 돈 선택을 거부하고 예산 초과를 먼저 안내한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { apple: 9 }, selectedPaymentKrw: null };
  assert.equal(reducer(state, { type: 'select-payment', amountKrw: 10000 }), state);
  assert.deepEqual(getPaymentSummary(13500, null), { status: 'over-budget', missingAmountKrw: 0, changeAmountKrw: null });
  assert.deepEqual(getPaymentSummary(13500, 10000), { status: 'over-budget', missingAmountKrw: 0, changeAmountKrw: null });
});

test('5500원 장바구니에 5000원을 선택할 수 있고 500원이 부족하다고 안내한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: null };
  const next = reducer(state, { type: 'select-payment', amountKrw: 5000 });
  assert.equal(next.selectedPaymentKrw, 5000);
  assert.deepEqual(getPaymentSummary(5500, next.selectedPaymentKrw), {
    status: 'insufficient',
    missingAmountKrw: 500,
    changeAmountKrw: null,
  });
});

test('5500원 장바구니에 10000원을 선택하면 거스름돈은 4500원이다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: null };
  const next = reducer(state, { type: 'select-payment', amountKrw: 10000 });
  assert.equal(next.selectedPaymentKrw, 10000);
  assert.deepEqual(getPaymentSummary(5500, next.selectedPaymentKrw), {
    status: 'ready',
    missingAmountKrw: 0,
    changeAmountKrw: 4500,
  });
});

test('1000원 장바구니에 정확히 1000원을 고르면 거스름돈 0원도 유효한 결과다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: null };
  const next = reducer(state, { type: 'select-payment', amountKrw: 1000 });
  assert.deepEqual(getPaymentSummary(1000, next.selectedPaymentKrw), {
    status: 'ready',
    missingAmountKrw: 0,
    changeAmountKrw: 0,
  });
});

test('다른 돈을 고르면 이전 금액을 교체하고 누적하지 않는다', () => {
  let state: ShoppingState = { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: null };
  state = reducer(state, { type: 'select-payment', amountKrw: 1000 });
  assert.equal(state.selectedPaymentKrw, 1000);
  state = reducer(state, { type: 'select-payment', amountKrw: 5000 });
  assert.equal(state.selectedPaymentKrw, 5000);
  state = reducer(state, { type: 'select-payment', amountKrw: 10000 });
  assert.equal(state.selectedPaymentKrw, 10000);
  assert.deepEqual(state.cart, { apple: 2, milk: 1 });
});

test('이미 고른 돈을 다시 선택하면 같은 상태를 유지한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: 1000 };
  assert.equal(reducer(state, { type: 'select-payment', amountKrw: 1000 }), state);
});

test('돈 선택만 지우면 장바구니는 그대로 유지한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000 };
  const next = reducer(state, { type: 'clear-payment' });
  assert.equal(next.cart, state.cart);
  assert.equal(next.selectedPaymentKrw, null);
  assert.deepEqual(getPaymentSummary(5500, next.selectedPaymentKrw), {
    status: 'unselected', missingAmountKrw: 0, changeAmountKrw: null,
  });
  assert.equal(reducer(next, { type: 'clear-payment' }), next);
});

test('상품 추가와 수량 감소와 품목 삭제는 돈을 다시 고르게 한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000 };
  const cases: { action: CartAction; cart: ShoppingState['cart'] }[] = [
    { action: { type: 'add', productId: 'apple' }, cart: { apple: 3, milk: 1 } },
    { action: { type: 'decrease', productId: 'apple' }, cart: { apple: 1, milk: 1 } },
    { action: { type: 'remove', productId: 'apple' }, cart: { milk: 1 } },
  ];

  for (const { action, cart } of cases) {
    const next = reducer(state, action);
    assert.deepEqual(next, { ...createInitialShoppingState(), cart, selectedPaymentKrw: null });
    const { totalPriceKrw } = getCartSummary(next.cart, catalog);
    assert.deepEqual(getPaymentSummary(totalPriceKrw, next.selectedPaymentKrw), {
      status: 'unselected', missingAmountKrw: 0, changeAmountKrw: null,
    });
  }
});

test('전체 비우기는 장바구니와 돈 선택을 함께 초기화한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000 };
  const next = reducer(state, { type: 'clear' });
  assert.deepEqual(next, { ...createInitialShoppingState(), cart: {}, selectedPaymentKrw: null });
  assert.deepEqual(getPaymentSummary(getCartSummary(next.cart, catalog).totalPriceKrw, next.selectedPaymentKrw), {
    status: 'empty', missingAmountKrw: 0, changeAmountKrw: null,
  });
});

test('9개 상한에서 더 담으려 해도 실제 변화가 없으면 돈 선택을 유지한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { carrot: 9 }, selectedPaymentKrw: 10000 };
  assert.equal(reducer(state, { type: 'add', productId: 'carrot' }), state);
});

test('없는 품목에 대한 동작은 장바구니와 돈 선택을 그대로 유지한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: 1000 };
  const actions: CartAction[] = [
    { type: 'add', productId: 'unknown' },
    { type: 'decrease', productId: 'apple' },
    { type: 'remove', productId: 'milk' },
  ];

  for (const action of actions) {
    assert.equal(reducer(state, action), state);
  }
});

test('등록되지 않은 돈은 선택할 수 없고 선택 안내로 돌아간다', () => {
  assert.deepEqual(PAYMENT_OPTIONS_KRW, [1000, 5000, 10000]);
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: null };
  assert.deepEqual(getPaymentSummary(1000, null), { status: 'unselected', missingAmountKrw: 0, changeAmountKrw: null });

  for (const amountKrw of [0, 2000, 15000]) {
    assert.equal(reducer(state, { type: 'select-payment', amountKrw }), state);
    assert.deepEqual(getPaymentSummary(1000, amountKrw), {
      status: 'unselected',
      missingAmountKrw: 0,
      changeAmountKrw: null,
    });
  }
});

test('등록된 돈이어도 설정한 예산을 넘으면 선택을 거부한다', () => {
  const smallBudgetReducer = createShoppingReducer(catalog, 5000);
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: null };
  assert.equal(smallBudgetReducer(state, { type: 'select-payment', amountKrw: 10000 }), state);
  assert.deepEqual(getPaymentSummary(1000, 10000, 5000), {
    status: 'unselected',
    missingAmountKrw: 0,
    changeAmountKrw: null,
  });
  const next = smallBudgetReducer(state, { type: 'select-payment', amountKrw: 5000 });
  assert.equal(next.selectedPaymentKrw, 5000);
  assert.deepEqual(getPaymentSummary(1000, next.selectedPaymentKrw, 5000), {
    status: 'ready',
    missingAmountKrw: 0,
    changeAmountKrw: 4000,
  });
});

test('돈 선택과 상품 변경은 이전 쇼핑 상태와 장바구니를 변형하지 않는다', () => {
  // 바깥 상태와 안쪽 장바구니를 모두 동결해 어느 쪽을 직접 고쳐도 실패하도록 합니다.
  const state: ShoppingState = Object.freeze({
    cart: Object.freeze({ apple: 2, milk: 1 }),
    selectedPaymentKrw: 5000,
    receipt: null,
    quiz: Object.freeze({ answer: '', status: 'unanswered' }),
  });
  const actions = [
    { type: 'select-payment', amountKrw: 10000 },
    { type: 'clear-payment' },
    { type: 'add', productId: 'apple' },
    { type: 'decrease', productId: 'apple' },
    { type: 'remove', productId: 'apple' },
    { type: 'clear' },
  ] as const;

  for (const action of actions) {
    assert.notEqual(reducer(state, action), state);
    assert.deepEqual(state, { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 5000 });
  }
});
test('거스름돈 4000원은 전체 놀이돈 예산에서 남을 돈 9000원과 구분한다', () => {
  const state: ShoppingState = { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: null };
  const next = reducer(state, { type: 'select-payment', amountKrw: 5000 });
  const { totalPriceKrw } = getCartSummary(next.cart, catalog);
  assert.equal(getBudgetSummary(totalPriceKrw).remainingKrw, 9000);
  assert.deepEqual(getPaymentSummary(totalPriceKrw, next.selectedPaymentKrw), {
    status: 'ready', missingAmountKrw: 0, changeAmountKrw: 4000,
  });
});

test('충분한 돈에서 부족한 돈으로 선택을 바꾸면 이전 거스름돈을 남기지 않는다', () => {
  let state: ShoppingState = { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000 };
  assert.equal(getPaymentSummary(5500, state.selectedPaymentKrw).changeAmountKrw, 4500);
  state = reducer(state, { type: 'select-payment', amountKrw: 5000 });
  assert.deepEqual(getPaymentSummary(5500, state.selectedPaymentKrw), {
    status: 'insufficient', missingAmountKrw: 500, changeAmountKrw: null,
  });
});

test('초기 쇼핑 상태는 빈 장바구니와 미선택 돈과 새 퀴즈를 가진다', () => {
  const first = createInitialShoppingState();
  const second = createInitialShoppingState();
  assert.deepEqual(first, {
    cart: {}, selectedPaymentKrw: null, receipt: null, quiz: { answer: '', status: 'unanswered' },
  });
  assert.notEqual(first, second);
  assert.notEqual(first.cart, second.cart);
  assert.notEqual(first.quiz, second.quiz);
});

test('오답을 고쳐 정답을 맞힌 뒤에는 다시 풀기를 해야 답을 바꿀 수 있다', () => {
  let state: ShoppingState = {
    ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000,
  };
  const cart = state.cart;
  state = reducer(state, { type: 'change-answer', answer: '4000' });
  assert.deepEqual(state.quiz, { answer: '4000', status: 'unanswered' });
  state = reducer(state, { type: 'check-answer' });
  assert.deepEqual(state.quiz, { answer: '4000', status: 'incorrect' });
  state = reducer(state, { type: 'change-answer', answer: '4500' });
  assert.deepEqual(state.quiz, { answer: '4500', status: 'unanswered' });
  state = reducer(state, { type: 'check-answer' });
  assert.deepEqual(state.quiz, { answer: '4500', status: 'correct' });
  assert.equal(reducer(state, { type: 'change-answer', answer: '0' }), state);
  assert.equal(reducer(state, { type: 'check-answer' }), state);
  state = reducer(state, { type: 'retry-quiz' });
  assert.deepEqual(state.quiz, { answer: '', status: 'unanswered' });
  assert.equal(state.cart, cart);
  assert.equal(state.selectedPaymentKrw, 10000);
  state = reducer(state, { type: 'change-answer', answer: '04500' });
  assert.equal(reducer(state, { type: 'check-answer' }).quiz.status, 'correct');
});

test('정확히 낸 돈의 퀴즈는 빈 답을 거부하고 0원을 정답으로 인정한다', () => {
  let state: ShoppingState = {
    ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: 1000,
  };
  state = reducer(state, { type: 'check-answer' });
  assert.deepEqual(state.quiz, { answer: '', status: 'invalid' });
  state = reducer(state, { type: 'change-answer', answer: '0' });
  state = reducer(state, { type: 'check-answer' });
  assert.deepEqual(state.quiz, { answer: '0', status: 'correct' });
});

test('형식이 잘못된 답은 채점 후 안내하고 다시 입력하면 이전 안내를 지운다', () => {
  let state: ShoppingState = {
    ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: 5000,
  };
  state = reducer(state, { type: 'change-answer', answer: '4,000' });
  state = reducer(state, { type: 'check-answer' });
  assert.deepEqual(state.quiz, { answer: '4,000', status: 'invalid' });
  state = reducer(state, { type: 'change-answer', answer: '4000' });
  assert.deepEqual(state.quiz, { answer: '4000', status: 'unanswered' });
  assert.equal(reducer(state, { type: 'check-answer' }).quiz.status, 'correct');
});

test('거스름돈을 계산할 수 없으면 입력과 확인과 다시 풀기를 모두 무시한다', () => {
  const states: ShoppingState[] = [
    createInitialShoppingState(),
    { ...createInitialShoppingState(), cart: { apple: 9 }, selectedPaymentKrw: 10000 },
    { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: null },
    { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 5000 },
    { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: 2000 },
  ];
  const actions = [
    { type: 'change-answer', answer: '0' }, { type: 'check-answer' }, { type: 'retry-quiz' },
  ] as const;
  for (const state of states) {
    for (const action of actions) {
      assert.equal(reducer(state, action), state);
    }
  }
  const smallBudgetReducer = createShoppingReducer(catalog, 5000);
  const state: ShoppingState = {
    ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: 10000,
  };
  for (const action of actions) {
    assert.equal(smallBudgetReducer(state, action), state);
  }
});

test('다른 돈을 고르면 정답도 초기화하고 새 거스름돈으로 채점한다', () => {
  const state: ShoppingState = {
    cart: { carrot: 1 }, selectedPaymentKrw: 5000, receipt: null, quiz: { answer: '4000', status: 'correct' },
  };
  let next = reducer(state, { type: 'select-payment', amountKrw: 1000 });
  assert.deepEqual(next.quiz, { answer: '', status: 'unanswered' });
  assert.equal(next.cart, state.cart);
  next = reducer(next, { type: 'change-answer', answer: '0' });
  assert.equal(reducer(next, { type: 'check-answer' }).quiz.status, 'correct');
});

test('돈 선택을 취소하면 퀴즈도 지우고 장바구니만 보존한다', () => {
  const state: ShoppingState = {
    cart: { carrot: 1 }, selectedPaymentKrw: 5000, receipt: null, quiz: { answer: '4000', status: 'correct' },
  };
  const next = reducer(state, { type: 'clear-payment' });
  assert.equal(next.cart, state.cart);
  assert.equal(next.selectedPaymentKrw, null);
  assert.deepEqual(next.quiz, { answer: '', status: 'unanswered' });
});

test('상품 추가와 감소와 품목 삭제와 전체 비우기는 돈 선택과 답을 함께 초기화한다', () => {
  const state: ShoppingState = {
    cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000, receipt: null, quiz: { answer: '4500', status: 'correct' },
  };
  const actions: CartAction[] = [
    { type: 'add', productId: 'apple' },
    { type: 'decrease', productId: 'apple' },
    { type: 'remove', productId: 'apple' },
    { type: 'clear' },
  ];
  for (const action of actions) {
    const next = reducer(state, action);
    assert.notEqual(next.cart, state.cart);
    assert.equal(next.selectedPaymentKrw, null);
    assert.deepEqual(next.quiz, { answer: '', status: 'unanswered' });
    assert.equal(reducer(next, { type: 'check-answer' }), next);
  }
});

test('같은 돈과 수량 상한과 없는 품목의 변화 없는 동작은 정답 상태도 보존한다', () => {
  const state: ShoppingState = {
    cart: { carrot: 9 }, selectedPaymentKrw: 10000, receipt: null, quiz: { answer: '1000', status: 'correct' },
  };
  const actions = [
    { type: 'select-payment', amountKrw: 10000 },
    { type: 'select-payment', amountKrw: 2000 },
    { type: 'add', productId: 'carrot' },
    { type: 'add', productId: 'unknown' },
    { type: 'decrease', productId: 'apple' },
    { type: 'remove', productId: 'milk' },
  ] as const;
  for (const action of actions) {
    assert.equal(reducer(state, action), state);
  }
});

test('퀴즈 입력과 채점과 초기화는 이전 쇼핑 상태와 퀴즈를 직접 바꾸지 않는다', () => {
  const state: ShoppingState = Object.freeze({
    cart: Object.freeze({ apple: 2, milk: 1 }),
    selectedPaymentKrw: 10000,
    receipt: null,
    quiz: Object.freeze({ answer: '4500', status: 'unanswered' }),
  });
  const actions = [
    { type: 'change-answer', answer: '4000' },
    { type: 'check-answer' },
    { type: 'retry-quiz' },
    { type: 'select-payment', amountKrw: 5000 },
    { type: 'clear-payment' },
    { type: 'add', productId: 'apple' },
    { type: 'clear' },
  ] as const;
  for (const action of actions) {
    assert.notEqual(reducer(state, action), state);
    assert.deepEqual(state, {
      cart: { apple: 2, milk: 1 },
      selectedPaymentKrw: 10000,
      receipt: null,
      quiz: { answer: '4500', status: 'unanswered' },
    });
  }
});

test('빈 장바구니와 예산 초과와 미선택과 부족한 돈으로는 계산을 완료하지 않는다', () => {
  const cases: ShoppingState[] = [
    createInitialShoppingState(),
    { ...createInitialShoppingState(), cart: { apple: 9 }, selectedPaymentKrw: 10000 },
    { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: null },
    { ...createInitialShoppingState(), cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 5000 },
    { ...createInitialShoppingState(), cart: { carrot: 1 }, selectedPaymentKrw: 2000 },
  ];
  for (const original of cases) {
    const state: ShoppingState = { ...original, quiz: { answer: '0', status: 'correct' } };
    assert.equal(reducer(state, { type: 'complete-checkout' }), state);
  }
});

test('답을 입력만 했거나 형식 오류 또는 오답 상태이면 계산 완료를 거부한다', () => {
  for (const status of ['unanswered', 'invalid', 'incorrect'] as const) {
    const state: ShoppingState = {
      ...createInitialShoppingState(),
      cart: { apple: 2, milk: 1 },
      selectedPaymentKrw: 10000,
      quiz: { answer: '4500', status },
    };
    assert.equal(reducer(state, { type: 'complete-checkout' }), state);
  }
});

test('정답 표시가 있어도 현재 거스름돈과 답이 일치하는지 계산 완료 때 다시 검사한다', () => {
  for (const answer of ['0', '', '4,500', '4500\n']) {
    const state: ShoppingState = {
      ...createInitialShoppingState(),
      cart: { apple: 2, milk: 1 },
      selectedPaymentKrw: 10000,
      quiz: { answer, status: 'correct' },
    };
    assert.equal(reducer(state, { type: 'complete-checkout' }), state);
  }
  const products = catalog.map((product) => ({ ...product, priceKrw: Number(product.priceKrw) }));
  const changingReducer = createShoppingReducer(products);
  const state: ShoppingState = {
    ...createInitialShoppingState(),
    cart: { apple: 2, milk: 1 },
    selectedPaymentKrw: 10000,
    quiz: { answer: '4500', status: 'correct' },
  };
  products[0].priceKrw = 2000;
  assert.equal(changingReducer(state, { type: 'complete-checkout' }), state);
});

test('5500원 장보기와 10000원 지불의 정답을 확인하면 영수증 생성과 쇼핑 초기화를 함께 수행한다', () => {
  let state = createInitialShoppingState();
  state = reducer(state, { type: 'add', productId: 'apple' });
  state = reducer(state, { type: 'add', productId: 'apple' });
  state = reducer(state, { type: 'add', productId: 'milk' });
  state = reducer(state, { type: 'select-payment', amountKrw: 10000 });
  state = reducer(state, { type: 'change-answer', answer: '04500' });
  state = reducer(state, { type: 'check-answer' });
  const completed = reducer(state, { type: 'complete-checkout' });
  assert.deepEqual(completed, {
    cart: {},
    selectedPaymentKrw: null,
    quiz: { answer: '', status: 'unanswered' },
    receipt: {
      items: [
        { productId: 'apple', name: '사과', unit: '1개', unitPriceKrw: 1500, quantity: 2, lineTotalKrw: 3000 },
        { productId: 'milk', name: '우유', unit: '1팩 · 1L', unitPriceKrw: 2500, quantity: 1, lineTotalKrw: 2500 },
      ],
      totalQuantity: 3,
      totalPriceKrw: 5500,
      paidAmountKrw: 10000,
      changeAmountKrw: 4500,
      startingBudgetKrw: 10000,
      remainingBudgetKrw: 4500,
    },
  });
});

test('거스름돈 0원을 맞힌 경우에도 계산을 완료할 수 있다', () => {
  const state: ShoppingState = {
    ...createInitialShoppingState(),
    cart: { carrot: 1 }, selectedPaymentKrw: 1000, quiz: { answer: '0', status: 'correct' },
  };
  const next = reducer(state, { type: 'complete-checkout' });
  assert.ok(next.receipt);
  assert.equal(next.receipt.changeAmountKrw, 0);
  assert.equal(next.receipt.totalPriceKrw, 1000);
});

test('완료 영수증은 5000원 지불의 거스름돈과 전체 놀이돈 잔액을 별개로 보존한다', () => {
  const state: ShoppingState = {
    ...createInitialShoppingState(),
    cart: { carrot: 1 }, selectedPaymentKrw: 5000, quiz: { answer: '4000', status: 'correct' },
  };
  const next = reducer(state, { type: 'complete-checkout' });
  assert.ok(next.receipt);
  assert.equal(next.receipt.paidAmountKrw, 5000);
  assert.equal(next.receipt.changeAmountKrw, 4000);
  assert.equal(next.receipt.remainingBudgetKrw, 9000);
});

test('영수증을 보고 있을 때 중복 완료와 상품·돈·퀴즈 변경은 모두 같은 상태를 유지한다', () => {
  const state: ShoppingState = {
    ...createInitialShoppingState(),
    cart: { carrot: 1 }, selectedPaymentKrw: 1000, quiz: { answer: '0', status: 'correct' },
  };
  const completed = reducer(state, { type: 'complete-checkout' });
  const actions = [
    { type: 'complete-checkout' },
    { type: 'add', productId: 'apple' },
    { type: 'decrease', productId: 'carrot' },
    { type: 'remove', productId: 'carrot' },
    { type: 'clear' },
    { type: 'select-payment', amountKrw: 5000 },
    { type: 'clear-payment' },
    { type: 'change-answer', answer: '1000' },
    { type: 'check-answer' },
    { type: 'retry-quiz' },
  ] as const;
  for (const action of actions) {
    assert.equal(reducer(completed, action), completed);
  }
});

test('계산 전 새 놀이 동작은 현재 장바구니와 선택과 답을 뜻하지 않게 지우지 않는다', () => {
  const state: ShoppingState = {
    ...createInitialShoppingState(),
    cart: { carrot: 1 }, selectedPaymentKrw: 5000, quiz: { answer: '4000', status: 'correct' },
  };
  assert.equal(reducer(state, { type: 'start-new-round' }), state);
  const initial = createInitialShoppingState();
  assert.equal(reducer(initial, { type: 'start-new-round' }), initial);
});

test('새 놀이를 시작하면 10000원 예산으로 다시 구매할 수 있고 이전 영수증은 바뀌지 않는다', () => {
  const state: ShoppingState = {
    ...createInitialShoppingState(),
    cart: { carrot: 1 }, selectedPaymentKrw: 5000, quiz: { answer: '4000', status: 'correct' },
  };
  const completed = reducer(state, { type: 'complete-checkout' });
  const previousReceipt = completed.receipt;
  let next = reducer(completed, { type: 'start-new-round' });
  assert.deepEqual(next, createInitialShoppingState());
  assert.equal(getBudgetSummary(getCartSummary(next.cart, catalog).totalPriceKrw).remainingKrw, 10000);
  next = reducer(next, { type: 'add', productId: 'apple' });
  next = reducer(next, { type: 'select-payment', amountKrw: 5000 });
  next = reducer(next, { type: 'change-answer', answer: '3500' });
  next = reducer(next, { type: 'check-answer' });
  next = reducer(next, { type: 'complete-checkout' });
  assert.ok(next.receipt);
  assert.equal(next.receipt.startingBudgetKrw, 10000);
  assert.equal(next.receipt.remainingBudgetKrw, 8500);
  assert.equal(next.receipt.changeAmountKrw, 3500);
  assert.notEqual(next.receipt, previousReceipt);
  assert.equal(previousReceipt?.totalPriceKrw, 1000);
  assert.equal(previousReceipt?.remainingBudgetKrw, 9000);
});

test('계산 완료와 새 놀이는 원래 장바구니·퀴즈·영수증 값을 직접 변경하지 않는다', () => {
  const state: ShoppingState = Object.freeze({
    cart: Object.freeze({ apple: 2, milk: 1 }),
    selectedPaymentKrw: 10000,
    quiz: Object.freeze({ answer: '4500', status: 'correct' }),
    receipt: null,
  });
  const before = structuredClone(state);
  const completed = reducer(state, { type: 'complete-checkout' });
  assert.deepEqual(state, before);
  assert.notEqual(completed.cart, state.cart);
  assert.notEqual(completed.quiz, state.quiz);
  assert.ok(completed.receipt);
  completed.receipt.items.forEach(Object.freeze);
  Object.freeze(completed.receipt.items);
  Object.freeze(completed.receipt);
  Object.freeze(completed);
  const completedBefore = structuredClone(completed);
  reducer(completed, { type: 'start-new-round' });
  assert.deepEqual(completed, completedBefore);
});

test('사용자 지정 예산도 완료 조건과 영수증에 동일하게 적용한다', () => {
  const smallBudgetReducer = createShoppingReducer(catalog, 5000);
  const state: ShoppingState = {
    ...createInitialShoppingState(),
    cart: { carrot: 1 }, selectedPaymentKrw: 10000, quiz: { answer: '9000', status: 'correct' },
  };
  assert.equal(smallBudgetReducer(state, { type: 'complete-checkout' }), state);
  const allowed: ShoppingState = {
    ...state, selectedPaymentKrw: 5000, quiz: { answer: '4000', status: 'correct' },
  };
  const completed = smallBudgetReducer(allowed, { type: 'complete-checkout' });
  assert.ok(completed.receipt);
  assert.equal(completed.receipt.startingBudgetKrw, 5000);
  assert.equal(completed.receipt.remainingBudgetKrw, 4000);
});
