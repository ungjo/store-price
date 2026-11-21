import { getBudgetSummary, STARTING_BUDGET_KRW } from '../features/budget/budget';
import { Body, Card, Title, won } from './book-ui';

export function BudgetPanel({ totalPriceKrw, hideRemaining = false }: { totalPriceKrw: number; hideRemaining?: boolean }) {
  const budget = getBudgetSummary(totalPriceKrw);
  const message = budget.status === 'over'
    ? '물건을 조금 빼 볼까요?'
    : budget.status === 'exact' ? '놀이돈에 딱 맞아요!' : '이대로 사면 남을 돈이에요.';
  return (
    <Card>
      <Title>오늘의 놀이돈 {won(STARTING_BUDGET_KRW)}</Title>
      {hideRemaining ? (
        <Body>남을 돈 ?원 · 거스름돈을 맞히면 보여 줘요.</Body>
      ) : (
        <>
          <Body>{budget.status === 'over' ? '부족한 돈 ' + won(budget.shortfallKrw) : '남을 돈 ' + won(budget.remainingKrw)}</Body>
          <Body>{message}</Body>
        </>
      )}
    </Card>
  );
}
