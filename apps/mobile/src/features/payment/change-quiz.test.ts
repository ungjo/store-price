import assert from 'node:assert/strict';
import test from 'node:test';

import { gradeChangeAnswer, MAX_CHANGE_ANSWER_LENGTH } from './change-quiz.ts';

test('거스름돈 4500원과 일치하는 답만 정답으로 채점한다', () => {
  assert.equal(gradeChangeAnswer('4500', 4500), 'correct');
  assert.equal(gradeChangeAnswer('4000', 4500), 'incorrect');
});

test('빈 답은 0원 정답과 구별하고 숫자 0은 채점한다', () => {
  assert.equal(gradeChangeAnswer('', 0), 'invalid');
  assert.equal(gradeChangeAnswer('0', 0), 'correct');
  assert.equal(gradeChangeAnswer('0', 4500), 'incorrect');
});

test('앞에 붙은 0은 원 단위 정수의 값으로 비교한다', () => {
  assert.equal(gradeChangeAnswer('04500', 4500), 'correct');
  assert.equal(gradeChangeAnswer('00000', 0), 'correct');
  assert.equal(gradeChangeAnswer('00001', 0), 'incorrect');
});

test('공백과 부호와 소수와 쉼표와 지수 표기 등 숫자 이외 입력은 거부한다', () => {
  const invalidAnswers = [
    '', ' ', ' 0', '0 ', '-1', '+1', '1.0', '4,500', '1e3',
    'NaN', 'Infinity', '0x10', '０', '١', '0\n', '\n0', '0\r\n', '0\t',
  ];
  for (const answer of invalidAnswers) {
    assert.equal(gradeChangeAnswer(answer, 0), 'invalid', JSON.stringify(answer));
  }
});

test('숫자는 최대 다섯 자리까지 받고 여섯 자리 입력은 값이 같아도 거부한다', () => {
  assert.equal(MAX_CHANGE_ANSWER_LENGTH, 5);
  assert.equal(gradeChangeAnswer('99999', 99999), 'correct');
  assert.equal(gradeChangeAnswer('100000', 100000), 'invalid');
  assert.equal(gradeChangeAnswer('000000', 0), 'invalid');
});
