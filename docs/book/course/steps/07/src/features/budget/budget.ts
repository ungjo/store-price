export const STARTING_BUDGET_KRW = 10000;

type BudgetSummary = {
  remainingKrw: number;
  shortfallKrw: number;
  status: 'within' | 'exact' | 'over';
};

export function getBudgetSummary(
  totalPriceKrw: number,
  budgetKrw: number = STARTING_BUDGET_KRW,
): BudgetSummary {
  // 잔액을 따로 저장하지 않고 현재 합계에서 계산해야 상품을 빼거나 비워도 값이 어긋나지 않습니다.
  const differenceKrw = budgetKrw - totalPriceKrw;

  // 부족한 금액을 음수 잔액 대신 별도 값으로 돌려줘 아이에게 남을 돈과 부족한 돈을 구분해 보여줍니다.
  return {
    remainingKrw: Math.max(0, differenceKrw),
    shortfallKrw: Math.max(0, -differenceKrw),
    status: differenceKrw === 0 ? 'exact' : differenceKrw > 0 ? 'within' : 'over',
  };
}
