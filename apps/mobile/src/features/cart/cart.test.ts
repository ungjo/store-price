import assert from 'node:assert/strict';
import test from 'node:test';

import { createCartReducer, getCartSummary, MAX_QUANTITY, type CartState } from './cart.ts';

const catalog = [
  { id: 'apple', priceKrw: 1500 },
  { id: 'milk', priceKrw: 2500 },
] as const;

const reducer = createCartReducer(catalog);

test('빈 장바구니의 수량, 금액, 상품 종류는 모두 0이다', () => {
  assert.deepEqual(getCartSummary({}, catalog), {
    totalQuantity: 0,
    totalPriceKrw: 0,
    distinctProducts: 0,
  });
});

test('사과 2개와 우유 1개는 3개, 5500원, 2종류로 계산한다', () => {
  let state: CartState = {};
  state = reducer(state, { type: 'add', productId: 'apple' });
  state = reducer(state, { type: 'add', productId: 'apple' });
  state = reducer(state, { type: 'add', productId: 'milk' });

  assert.deepEqual(state, { apple: 2, milk: 1 });
  assert.deepEqual(getCartSummary(state, catalog), {
    totalQuantity: 3,
    totalPriceKrw: 5500,
    distinctProducts: 2,
  });
});

test('수량을 하나씩 빼고 마지막 하나를 빼면 상품도 제거한다', () => {
  let state: CartState = { apple: 3, milk: 1 };
  state = reducer(state, { type: 'decrease', productId: 'apple' });
  assert.deepEqual(state, { apple: 2, milk: 1 });
  state = reducer(state, { type: 'decrease', productId: 'apple' });
  assert.deepEqual(state, { apple: 1, milk: 1 });
  state = reducer(state, { type: 'decrease', productId: 'apple' });
  assert.deepEqual(state, { milk: 1 });
  assert.equal(Object.hasOwn(state, 'apple'), false);
});

test('없는 상품을 빼거나 제거해도 음수 수량을 만들거나 상태를 변경하지 않는다', () => {
  const state: CartState = {};
  assert.equal(reducer(state, { type: 'decrease', productId: 'apple' }), state);
  assert.equal(reducer(state, { type: 'remove', productId: 'apple' }), state);
});

test('같은 상품을 반복해서 담아도 수량은 9개를 넘지 않는다', () => {
  let state: CartState = {};
  for (let count = 0; count < 12; count += 1) {
    state = reducer(state, { type: 'add', productId: 'apple' });
  }

  assert.equal(MAX_QUANTITY, 9);
  assert.deepEqual(state, { apple: 9 });
  assert.equal(reducer(state, { type: 'add', productId: 'apple' }), state);
  assert.equal(getCartSummary(state, catalog).totalPriceKrw, 13500);
});

test('목록에 없는 상품 ID의 동작을 무시하고 합계에서도 제외한다', () => {
  const state: CartState = { apple: 1 };
  for (const type of ['add', 'decrease', 'remove'] as const) {
    assert.equal(reducer(state, { type, productId: 'unknown' }), state);
  }

  assert.deepEqual(getCartSummary({ ...state, unknown: 2 }, catalog), {
    totalQuantity: 1,
    totalPriceKrw: 1500,
    distinctProducts: 1,
  });
});

test('개별 상품을 제거하면 다른 상품은 유지한다', () => {
  const state = reducer({ apple: 2, milk: 1 }, { type: 'remove', productId: 'apple' });
  assert.deepEqual(state, { milk: 1 });
  assert.deepEqual(getCartSummary(state, catalog), {
    totalQuantity: 1,
    totalPriceKrw: 2500,
    distinctProducts: 1,
  });
});

test('전체 비우기는 담긴 모든 상품을 제거한다', () => {
  assert.deepEqual(reducer({ apple: 2, milk: 1 }, { type: 'clear' }), {});
  assert.deepEqual(reducer({}, { type: 'clear' }), {});
});

test('추가, 수량 감소, 개별 삭제, 비우기는 이전 상태를 변형하지 않는다', () => {
  // 동결된 상태로 검사하면 실수로 원본을 수정할 때 테스트가 즉시 실패합니다.
  const previous: CartState = Object.freeze({ apple: 2, milk: 1 });
  const actions = [
    { type: 'add', productId: 'apple' },
    { type: 'decrease', productId: 'apple' },
    { type: 'remove', productId: 'apple' },
    { type: 'clear' },
  ] as const;

  for (const action of actions) {
    const next = reducer(previous, action);
    assert.notEqual(next, previous);
    assert.deepEqual(previous, { apple: 2, milk: 1 });
  }

  const lastItem: CartState = Object.freeze({ apple: 1 });
  assert.deepEqual(reducer(lastItem, { type: 'decrease', productId: 'apple' }), {});
  assert.deepEqual(lastItem, { apple: 1 });
});
