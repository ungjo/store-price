import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleProducts } from '../../data/sample-products.ts';
import { createInitialShoppingState, createShoppingReducer } from './payment.ts';
import { createReceipt } from './receipt.ts';

const reduce = createShoppingReducer(sampleProducts);
function ready() {
  let s = reduce(createInitialShoppingState(), { type: 'add', productId: 'sample-carrot' });
  s = reduce(s, { type: 'select-payment', amountKrw: 5000 });
  s = reduce(s, { type: 'change-answer', answer: '4000' });
  return reduce(s, { type: 'check-answer' });
}
test('완료 전 조건을 검사하고 완료 후 조작을 잠근다', () => {
  const empty = createInitialShoppingState();
  assert.equal(reduce(empty, { type: 'complete-checkout' }), empty);
  const done = reduce(ready(), { type: 'complete-checkout' });
  assert.equal(done.receipt.changeAmountKrw, 4000);
  assert.equal(done.receipt.remainingBudgetKrw, 9000);
  assert.deepEqual(done.cart, {});
  assert.equal(reduce(done, { type: 'complete-checkout' }), done);
  assert.equal(reduce(done, { type: 'add', productId: 'sample-apple' }), done);
});
test('정답 상태가 남아 있어도 현재 답이 다르면 완료를 거부한다', () => {
  const tampered = { ...ready(), quiz: { answer: '1', status: 'correct' } };
  assert.equal(reduce(tampered, { type: 'complete-checkout' }), tampered);
});
test('영수증은 당시 상품 정보를 값으로 복사한다', () => {
  const catalog = [{ id: 'a', name: '사과', unit: '1개', priceKrw: 1500 }];
  const receipt = createReceipt({ a: 2 }, catalog, 5000);
  catalog[0].name = '바뀐 이름';
  catalog[0].priceKrw = 9000;
  assert.equal(receipt.items[0].name, '사과');
  assert.equal(receipt.items[0].lineTotalKrw, 3000);
});
test('새 놀이는 영수증에서만 시작하며 새 상태를 만든다', () => {
  const before = ready();
  assert.equal(reduce(before, { type: 'start-new-round' }), before);
  const done = reduce(before, { type: 'complete-checkout' });
  assert.deepEqual(reduce(done, { type: 'start-new-round' }), createInitialShoppingState());
});
