import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleProducts } from '../../data/sample-products.ts';
import { gradeChangeAnswer } from './change-quiz.ts';
import { createInitialShoppingState, createShoppingReducer } from './payment.ts';
test('빈칸은 0원이 아니며 숫자 0은 정답이다', () => {
  assert.equal(gradeChangeAnswer('', 0), 'invalid');
  assert.equal(gradeChangeAnswer('0', 0), 'correct');
});
test('입력 형식을 숫자 키보드와 별도로 검사한다', () => {
  for (const answer of [' ', '-1', '1.5', '4,000', '1e3', '123456', '４０００']) {
    assert.equal(gradeChangeAnswer(answer, 4000), 'invalid');
  }
  assert.equal(gradeChangeAnswer('9000', 4000), 'incorrect');
  assert.equal(gradeChangeAnswer('4000', 4000), 'correct');
});
test('정답·다시 풀기·상품 변경의 상태 경계를 확인한다', () => {
  const reduce = createShoppingReducer(sampleProducts);
  let s = reduce(createInitialShoppingState(), { type: 'add', productId: 'sample-carrot' });
  s = reduce(s, { type: 'select-payment', amountKrw: 5000 });
  s = reduce(s, { type: 'change-answer', answer: '9000' });
  s = reduce(s, { type: 'check-answer' });
  assert.equal(s.quiz.status, 'incorrect');
  s = reduce(s, { type: 'change-answer', answer: '4000' });
  s = reduce(s, { type: 'check-answer' });
  assert.equal(s.quiz.status, 'correct');
  assert.equal(reduce(s, { type: 'change-answer', answer: '1' }), s);
  const retry = reduce(s, { type: 'retry-quiz' });
  assert.equal(retry.quiz.answer, '');
  assert.equal(retry.selectedPaymentKrw, 5000);
  const changed = reduce(s, { type: 'add', productId: 'sample-carrot' });
  assert.equal(changed.quiz.status, 'unanswered');
  assert.equal(changed.selectedPaymentKrw, null);
});
