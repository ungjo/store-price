import assert from 'node:assert/strict';
import test from 'node:test';

import { getBudgetSummary } from '../budget/budget.ts';
import { getCartSummary, type CartAction } from '../cart/cart.ts';

import {
  createShoppingReducer,
  getPaymentSummary,
  PAYMENT_OPTIONS_KRW,
  type ShoppingState,
} from './payment.ts';

const catalog = [
  { id: 'apple', priceKrw: 1500 },
  { id: 'milk', priceKrw: 2500 },
  { id: 'carrot', priceKrw: 1000 },
] as const;

const reducer = createShoppingReducer(catalog);

test('빈 장바구니에서는 지불할 돈을 선택하지 않고 빈 상태를 먼저 안내한다', () => {
  const state: ShoppingState = { cart: {}, selectedPaymentKrw: null };
  assert.equal(reducer(state, { type: 'select-payment', amountKrw: 10000 }), state);
  assert.deepEqual(getPaymentSummary(0, null), { status: 'empty', missingAmountKrw: 0, changeAmountKrw: null });
  assert.deepEqual(getPaymentSummary(0, 10000, 5000), { status: 'empty', missingAmountKrw: 0, changeAmountKrw: null });
});

test('예산을 넘은 장바구니에서는 돈 선택을 거부하고 예산 초과를 먼저 안내한다', () => {
  const state: ShoppingState = { cart: { apple: 9 }, selectedPaymentKrw: null };
  assert.equal(reducer(state, { type: 'select-payment', amountKrw: 10000 }), state);
  assert.deepEqual(getPaymentSummary(13500, null), { status: 'over-budget', missingAmountKrw: 0, changeAmountKrw: null });
  assert.deepEqual(getPaymentSummary(13500, 10000), { status: 'over-budget', missingAmountKrw: 0, changeAmountKrw: null });
});

test('5500원 장바구니에 5000원을 선택할 수 있고 500원이 부족하다고 안내한다', () => {
  const state: ShoppingState = { cart: { apple: 2, milk: 1 }, selectedPaymentKrw: null };
  const next = reducer(state, { type: 'select-payment', amountKrw: 5000 });
  assert.equal(next.selectedPaymentKrw, 5000);
  assert.deepEqual(getPaymentSummary(5500, next.selectedPaymentKrw), {
    status: 'insufficient',
    missingAmountKrw: 500,
    changeAmountKrw: null,
  });
});

test('5500원 장바구니에 10000원을 선택하면 거스름돈은 4500원이다', () => {
  const state: ShoppingState = { cart: { apple: 2, milk: 1 }, selectedPaymentKrw: null };
  const next = reducer(state, { type: 'select-payment', amountKrw: 10000 });
  assert.equal(next.selectedPaymentKrw, 10000);
  assert.deepEqual(getPaymentSummary(5500, next.selectedPaymentKrw), {
    status: 'ready',
    missingAmountKrw: 0,
    changeAmountKrw: 4500,
  });
});

test('1000원 장바구니에 정확히 1000원을 고르면 거스름돈 0원도 유효한 결과다', () => {
  const state: ShoppingState = { cart: { carrot: 1 }, selectedPaymentKrw: null };
  const next = reducer(state, { type: 'select-payment', amountKrw: 1000 });
  assert.deepEqual(getPaymentSummary(1000, next.selectedPaymentKrw), {
    status: 'ready',
    missingAmountKrw: 0,
    changeAmountKrw: 0,
  });
});

test('다른 돈을 고르면 이전 금액을 교체하고 누적하지 않는다', () => {
  let state: ShoppingState = { cart: { apple: 2, milk: 1 }, selectedPaymentKrw: null };
  state = reducer(state, { type: 'select-payment', amountKrw: 1000 });
  assert.equal(state.selectedPaymentKrw, 1000);
  state = reducer(state, { type: 'select-payment', amountKrw: 5000 });
  assert.equal(state.selectedPaymentKrw, 5000);
  state = reducer(state, { type: 'select-payment', amountKrw: 10000 });
  assert.equal(state.selectedPaymentKrw, 10000);
  assert.deepEqual(state.cart, { apple: 2, milk: 1 });
});

test('이미 고른 돈을 다시 선택하면 같은 상태를 유지한다', () => {
  const state: ShoppingState = { cart: { carrot: 1 }, selectedPaymentKrw: 1000 };
  assert.equal(reducer(state, { type: 'select-payment', amountKrw: 1000 }), state);
});

test('돈 선택만 지우면 장바구니는 그대로 유지한다', () => {
  const state: ShoppingState = { cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000 };
  const next = reducer(state, { type: 'clear-payment' });
  assert.equal(next.cart, state.cart);
  assert.equal(next.selectedPaymentKrw, null);
  assert.deepEqual(getPaymentSummary(5500, next.selectedPaymentKrw), {
    status: 'unselected', missingAmountKrw: 0, changeAmountKrw: null,
  });
  assert.equal(reducer(next, { type: 'clear-payment' }), next);
});

test('상품 추가와 수량 감소와 품목 삭제는 돈을 다시 고르게 한다', () => {
  const state: ShoppingState = { cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000 };
  const cases: { action: CartAction; cart: ShoppingState['cart'] }[] = [
    { action: { type: 'add', productId: 'apple' }, cart: { apple: 3, milk: 1 } },
    { action: { type: 'decrease', productId: 'apple' }, cart: { apple: 1, milk: 1 } },
    { action: { type: 'remove', productId: 'apple' }, cart: { milk: 1 } },
  ];

  for (const { action, cart } of cases) {
    const next = reducer(state, action);
    assert.deepEqual(next, { cart, selectedPaymentKrw: null });
    const { totalPriceKrw } = getCartSummary(next.cart, catalog);
    assert.deepEqual(getPaymentSummary(totalPriceKrw, next.selectedPaymentKrw), {
      status: 'unselected', missingAmountKrw: 0, changeAmountKrw: null,
    });
  }
});

test('전체 비우기는 장바구니와 돈 선택을 함께 초기화한다', () => {
  const state: ShoppingState = { cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000 };
  const next = reducer(state, { type: 'clear' });
  assert.deepEqual(next, { cart: {}, selectedPaymentKrw: null });
  assert.deepEqual(getPaymentSummary(getCartSummary(next.cart, catalog).totalPriceKrw, next.selectedPaymentKrw), {
    status: 'empty', missingAmountKrw: 0, changeAmountKrw: null,
  });
});

test('9개 상한에서 더 담으려 해도 실제 변화가 없으면 돈 선택을 유지한다', () => {
  const state: ShoppingState = { cart: { carrot: 9 }, selectedPaymentKrw: 10000 };
  assert.equal(reducer(state, { type: 'add', productId: 'carrot' }), state);
});

test('없는 품목에 대한 동작은 장바구니와 돈 선택을 그대로 유지한다', () => {
  const state: ShoppingState = { cart: { carrot: 1 }, selectedPaymentKrw: 1000 };
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
  const state: ShoppingState = { cart: { carrot: 1 }, selectedPaymentKrw: null };
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
  const state: ShoppingState = { cart: { carrot: 1 }, selectedPaymentKrw: null };
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
    assert.deepEqual(state, { cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 5000 });
  }
});
test('거스름돈 4000원은 전체 놀이돈 예산에서 남을 돈 9000원과 구분한다', () => {
  const state: ShoppingState = { cart: { carrot: 1 }, selectedPaymentKrw: null };
  const next = reducer(state, { type: 'select-payment', amountKrw: 5000 });
  const { totalPriceKrw } = getCartSummary(next.cart, catalog);
  assert.equal(getBudgetSummary(totalPriceKrw).remainingKrw, 9000);
  assert.deepEqual(getPaymentSummary(totalPriceKrw, next.selectedPaymentKrw), {
    status: 'ready', missingAmountKrw: 0, changeAmountKrw: 4000,
  });
});

test('충분한 돈에서 부족한 돈으로 선택을 바꾸면 이전 거스름돈을 남기지 않는다', () => {
  let state: ShoppingState = { cart: { apple: 2, milk: 1 }, selectedPaymentKrw: 10000 };
  assert.equal(getPaymentSummary(5500, state.selectedPaymentKrw).changeAmountKrw, 4500);
  state = reducer(state, { type: 'select-payment', amountKrw: 5000 });
  assert.deepEqual(getPaymentSummary(5500, state.selectedPaymentKrw), {
    status: 'insufficient', missingAmountKrw: 500, changeAmountKrw: null,
  });
});
