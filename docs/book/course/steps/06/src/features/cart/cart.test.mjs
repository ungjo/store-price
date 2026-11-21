import assert from 'node:assert/strict';
import test from 'node:test';
import { createCartReducer, getCartSummary } from './cart.ts';

const products = [
  { id: 'sample-apple', priceKrw: 1500 },
  { id: 'sample-milk', priceKrw: 2500 },
];
const reduce = createCartReducer(products);

test('사과 2개와 우유 1개는 3개와 5500원이다', () => {
  let state = {};
  state = reduce(state, { type: 'add', productId: 'sample-apple' });
  state = reduce(state, { type: 'add', productId: 'sample-apple' });
  state = reduce(state, { type: 'add', productId: 'sample-milk' });
  assert.deepEqual(getCartSummary(state, products), {
    totalQuantity: 3, totalPriceKrw: 5500, distinctProducts: 2,
  });
});
test('10번 담아도 9개이며 무변화는 원래 상태를 돌려준다', () => {
  let state = {};
  for (let i = 0; i < 9; i += 1) state = reduce(state, { type: 'add', productId: 'sample-apple' });
  assert.equal(state['sample-apple'], 9);
  assert.equal(reduce(state, { type: 'add', productId: 'sample-apple' }), state);
});
test('수량이 0이면 키를 지우고 이전 상태는 보존한다', () => {
  const before = { 'sample-apple': 1 };
  const after = reduce(before, { type: 'decrease', productId: 'sample-apple' });
  assert.deepEqual(after, {});
  assert.deepEqual(before, { 'sample-apple': 1 });
});
test('품목 삭제와 전체 비우기를 구별한다', () => {
  const before = { 'sample-apple': 2, 'sample-milk': 1 };
  assert.deepEqual(reduce(before, { type: 'remove', productId: 'sample-apple' }), { 'sample-milk': 1 });
  assert.deepEqual(reduce(before, { type: 'clear' }), {});
});
test('등록되지 않은 상품은 담기와 합계에서 제외한다', () => {
  const state = {};
  assert.equal(reduce(state, { type: 'add', productId: 'unknown' }), state);
  assert.equal(getCartSummary({ unknown: 2 }, products).totalPriceKrw, 0);
});
test('빈 장바구니는 0개와 0원이다', () => {
  assert.deepEqual(getCartSummary({}, products), { totalQuantity: 0, totalPriceKrw: 0, distinctProducts: 0 });
});
