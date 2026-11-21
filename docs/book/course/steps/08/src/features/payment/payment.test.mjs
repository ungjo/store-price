import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleProducts } from '../../data/sample-products.ts';
import { createInitialShoppingState, createShoppingReducer, getPaymentSummary } from './payment.ts';
const reduce = createShoppingReducer(sampleProducts);
test('거스름돈은 선택한 돈에서 계산하며 0원도 결과다', () => {
  assert.equal(getPaymentSummary(1000, 5000).changeAmountKrw, 4000);
  assert.equal(getPaymentSummary(1000, 1000).changeAmountKrw, 0);
});
test('부족한 돈과 선택 전은 거스름돈을 만들지 않는다', () => {
  assert.deepEqual(getPaymentSummary(5500, 5000), { status: 'insufficient', missingAmountKrw: 500, changeAmountKrw: null });
  assert.equal(getPaymentSummary(5500, null).changeAmountKrw, null);
});
test('빈 장바구니와 예산 초과에서는 선택을 거부한다', () => {
  const empty = createInitialShoppingState();
  assert.equal(reduce(empty, { type: 'select-payment', amountKrw: 10000 }), empty);
  const over = { ...empty, cart: { 'sample-apple': 9 } };
  assert.equal(reduce(over, { type: 'select-payment', amountKrw: 10000 }), over);
});
test('상품이 바뀌면 선택을 지우고 취소는 상품을 유지한다', () => {
  let state = reduce(createInitialShoppingState(), { type: 'add', productId: 'sample-carrot' });
  state = reduce(state, { type: 'select-payment', amountKrw: 5000 });
  assert.equal(reduce(state, { type: 'clear-payment' }).cart, state.cart);
  state = reduce(state, { type: 'add', productId: 'sample-carrot' });
  assert.equal(state.selectedPaymentKrw, null);
});
test('같은 선택과 수량 상한은 선택을 유지한다', () => {
  let state = { ...createInitialShoppingState(), cart: { 'sample-carrot': 9 } };
  state = reduce(state, { type: 'select-payment', amountKrw: 10000 });
  assert.equal(reduce(state, { type: 'select-payment', amountKrw: 10000 }), state);
  assert.equal(reduce(state, { type: 'add', productId: 'sample-carrot' }), state);
});
