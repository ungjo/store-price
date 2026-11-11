import { STARTING_BUDGET_KRW } from '../budget/budget.ts';
import { getCartSummary, type CartState } from '../cart/cart.ts';

export type ReceiptCatalogProduct = Readonly<{
  id: string;
  name: string;
  unit: string;
  priceKrw: number;
}>;

export type ReceiptItem = Readonly<{
  productId: string;
  name: string;
  unit: string;
  unitPriceKrw: number;
  quantity: number;
  lineTotalKrw: number;
}>;

export type Receipt = Readonly<{
  items: readonly ReceiptItem[];
  totalQuantity: number;
  totalPriceKrw: number;
  paidAmountKrw: number;
  changeAmountKrw: number;
  startingBudgetKrw: number;
  remainingBudgetKrw: number;
}>;

export function createReceipt(
  cart: CartState,
  catalog: readonly ReceiptCatalogProduct[],
  paidAmountKrw: number,
  startingBudgetKrw: number = STARTING_BUDGET_KRW,
): Receipt {
  const { totalQuantity, totalPriceKrw } = getCartSummary(cart, catalog);
  const items: ReceiptItem[] = [];

  // 계산 가능 여부는 쇼핑 reducer가 확인합니다. 영수증은 그 순간의 이름·가격·수량을 새 값으로 복사합니다.
  // 이후 장바구니를 비우거나 상품 목록을 바꿔도 이미 끝낸 놀이의 내용이 달라지지 않아야 합니다.
  for (const product of catalog) {
    const quantity = cart[product.id] ?? 0;
    if (quantity === 0) {
      continue;
    }

    items.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      unitPriceKrw: product.priceKrw,
      quantity,
      lineTotalKrw: product.priceKrw * quantity,
    });
  }

  return {
    items,
    totalQuantity,
    totalPriceKrw,
    paidAmountKrw,
    changeAmountKrw: paidAmountKrw - totalPriceKrw,
    startingBudgetKrw,
    // 거스름돈은 낸 돈의 차액이고, 남은 놀이돈은 시작 예산의 차액이므로 따로 기록합니다.
    remainingBudgetKrw: startingBudgetKrw - totalPriceKrw,
  };
}
