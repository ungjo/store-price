import assert from 'node:assert/strict';
import test from 'node:test';

import { createReceipt } from './receipt.ts';

const catalog = [
  { id: 'apple', name: '사과', unit: '1개', priceKrw: 1500 },
  { id: 'milk', name: '우유', unit: '1팩 · 1L', priceKrw: 2500 },
  { id: 'carrot', name: '당근', unit: '1개', priceKrw: 1000 },
] as const;

test('사과 두 개와 우유 한 개의 이름과 단위와 금액을 영수증에 기록한다', () => {
  assert.deepEqual(createReceipt({ apple: 2, milk: 1 }, catalog, 10000), {
    items: [
      { productId: 'apple', name: '사과', unit: '1개', unitPriceKrw: 1500, quantity: 2, lineTotalKrw: 3000 },
      { productId: 'milk', name: '우유', unit: '1팩 · 1L', unitPriceKrw: 2500, quantity: 1, lineTotalKrw: 2500 },
    ],
    totalQuantity: 3,
    totalPriceKrw: 5500,
    paidAmountKrw: 10000,
    changeAmountKrw: 4500,
    startingBudgetKrw: 10000,
    remainingBudgetKrw: 4500,
  });
});

test('물건값만큼 정확히 내면 거스름돈 0원도 영수증에 남긴다', () => {
  const receipt = createReceipt({ carrot: 1 }, catalog, 1000);
  assert.equal(receipt.changeAmountKrw, 0);
  assert.equal(receipt.remainingBudgetKrw, 9000);
});

test('1000원 물건에 5000원을 내면 거스름돈 4000원과 남은 예산 9000원을 구분한다', () => {
  const receipt = createReceipt({ carrot: 1 }, catalog, 5000);
  assert.equal(receipt.totalPriceKrw, 1000);
  assert.equal(receipt.paidAmountKrw, 5000);
  assert.equal(receipt.changeAmountKrw, 4000);
  assert.equal(receipt.remainingBudgetKrw, 9000);
});

test('상품 목록과 장바구니를 나중에 변경해도 영수증의 값은 바뀌지 않는다', () => {
  const products: { id: string; name: string; unit: string; priceKrw: number }[] = catalog.map((product) => ({ ...product }));
  const cart = { apple: 2, milk: 1 };
  const receipt = createReceipt(cart, products, 10000);
  const saved = structuredClone(receipt);
  products[0].name = '다른 상품';
  products[0].unit = '새 단위';
  products[0].priceKrw = 9999;
  products.splice(1);
  cart.apple = 9;
  cart.milk = 0;
  assert.deepEqual(receipt, saved);
  assert.equal(receipt.items.length, 2);
});

test('설정한 시작 예산을 복사하고 그 예산에서 남은 돈을 계산한다', () => {
  const receipt = createReceipt({ carrot: 1 }, catalog, 5000, 5000);
  assert.equal(receipt.startingBudgetKrw, 5000);
  assert.equal(receipt.remainingBudgetKrw, 4000);
});
