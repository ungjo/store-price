import assert from 'node:assert/strict';
import test from 'node:test';

import { createCartReducer, getCartSummary, type CartState } from '../cart/cart.ts';

import { getBudgetSummary, STARTING_BUDGET_KRW } from './budget.ts';

const catalog = [
  { id: 'apple', priceKrw: 1500 },
  { id: 'milk', priceKrw: 2500 },
] as const;

const reducer = createCartReducer(catalog);

test('아무것도 담지 않으면 기본 놀이돈 10000원이 모두 남는다', () => {
  assert.equal(STARTING_BUDGET_KRW, 10000);
  assert.deepEqual(getBudgetSummary(0), {
    remainingKrw: 10000,
    shortfallKrw: 0,
    status: 'within',
  });
});

test('5500원어치를 담으면 4500원이 남고 부족한 돈은 없다', () => {
  assert.deepEqual(getBudgetSummary(5500), {
    remainingKrw: 4500,
    shortfallKrw: 0,
    status: 'within',
  });
});

test('합계가 예산과 같은 10000원이면 딱 맞는다', () => {
  assert.deepEqual(getBudgetSummary(10000), {
    remainingKrw: 0,
    shortfallKrw: 0,
    status: 'exact',
  });
});

test('13500원어치를 담으면 3500원이 부족하고 남을 돈은 0이다', () => {
  assert.deepEqual(getBudgetSummary(13500), {
    remainingKrw: 0,
    shortfallKrw: 3500,
    status: 'over',
  });
});

test('초과한 장바구니에서 수량을 줄이면 부족한 돈이 줄고 예산 안으로 돌아온다', () => {
  let state: CartState = { apple: 9 };
  assert.deepEqual(getBudgetSummary(getCartSummary(state, catalog).totalPriceKrw), {
    remainingKrw: 0,
    shortfallKrw: 3500,
    status: 'over',
  });

  state = reducer(state, { type: 'decrease', productId: 'apple' });
  state = reducer(state, { type: 'decrease', productId: 'apple' });
  assert.deepEqual(getBudgetSummary(getCartSummary(state, catalog).totalPriceKrw), {
    remainingKrw: 0,
    shortfallKrw: 500,
    status: 'over',
  });

  state = reducer(state, { type: 'decrease', productId: 'apple' });
  assert.deepEqual(getBudgetSummary(getCartSummary(state, catalog).totalPriceKrw), {
    remainingKrw: 1000,
    shortfallKrw: 0,
    status: 'within',
  });
});

test('초과한 장바구니에서 한 품목을 모두 빼면 남은 상품 기준으로 잔액을 회복한다', () => {
  let state: CartState = { apple: 7, milk: 1 };
  assert.deepEqual(getBudgetSummary(getCartSummary(state, catalog).totalPriceKrw), {
    remainingKrw: 0,
    shortfallKrw: 3000,
    status: 'over',
  });

  state = reducer(state, { type: 'remove', productId: 'apple' });
  assert.deepEqual(getBudgetSummary(getCartSummary(state, catalog).totalPriceKrw), {
    remainingKrw: 7500,
    shortfallKrw: 0,
    status: 'within',
  });
});

test('초과한 장바구니를 비우면 기본 놀이돈을 전부 사용할 수 있다', () => {
  let state: CartState = { apple: 9, milk: 1 };
  assert.deepEqual(getBudgetSummary(getCartSummary(state, catalog).totalPriceKrw), {
    remainingKrw: 0,
    shortfallKrw: 6000,
    status: 'over',
  });

  state = reducer(state, { type: 'clear' });
  assert.deepEqual(getBudgetSummary(getCartSummary(state, catalog).totalPriceKrw), {
    remainingKrw: 10000,
    shortfallKrw: 0,
    status: 'within',
  });
});

test('예산 인자를 5000원으로 바꾸면 그 금액을 기준으로 남음과 딱 맞음과 부족함을 계산한다', () => {
  assert.deepEqual(getBudgetSummary(4500, 5000), {
    remainingKrw: 500,
    shortfallKrw: 0,
    status: 'within',
  });
  assert.deepEqual(getBudgetSummary(5000, 5000), {
    remainingKrw: 0,
    shortfallKrw: 0,
    status: 'exact',
  });
  assert.deepEqual(getBudgetSummary(5500, 5000), {
    remainingKrw: 0,
    shortfallKrw: 500,
    status: 'over',
  });
});
