import assert from 'node:assert/strict';
import test from 'node:test';
import { getBudgetSummary } from './budget.ts';
for (const [total, remaining, shortfall, status] of [
  [0, 10000, 0, 'within'], [5500, 4500, 0, 'within'],
  [10000, 0, 0, 'exact'], [13500, 0, 3500, 'over'],
]) {
  test('합계 ' + total + '원의 예산 상태', () => {
    assert.deepEqual(getBudgetSummary(total), { remainingKrw: remaining, shortfallKrw: shortfall, status });
  });
}
test('수량을 줄여 합계가 9000원이 되면 잔액이 복구된다', () => {
  assert.equal(getBudgetSummary(13500).status, 'over');
  assert.equal(getBudgetSummary(9000).remainingKrw, 1000);
});
test('다른 예산도 같은 계산식으로 처리한다', () => {
  assert.equal(getBudgetSummary(3000, 5000).remainingKrw, 2000);
});
