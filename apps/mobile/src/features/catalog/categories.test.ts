import assert from 'node:assert/strict';
import test from 'node:test';

import { sampleProducts } from '../../data/sample-products.ts';
import { getCartSummary } from '../cart/cart.ts';
import { createInitialShoppingState, createShoppingReducer, getPaymentSummary } from '../payment/payment.ts';
import {
  PRODUCT_CATEGORIES, filterProductsByCategory, getCategoryCounts, isProductCategoryId,
} from './categories.ts';

test('기존 여섯 상품의 순서와 가격은 분류를 추가해도 유지한다', () => {
  assert.deepEqual(sampleProducts.slice(0, 6).map(({ id, priceKrw }) => [id, priceKrw]), [
    ['sample-apple', 1500], ['sample-milk', 2500], ['sample-carrot', 1000],
    ['sample-bread', 3000], ['sample-banana', 3500], ['sample-egg', 2000],
  ]);
});

test('열두 예시는 서로 다른 상품이며 모두 알려진 분류와 양의 정수 놀이 가격을 가진다', () => {
  assert.equal(sampleProducts.length, 12);
  assert.equal(new Set(sampleProducts.map((product) => product.id)).size, 12);
  for (const product of sampleProducts) {
    assert.equal(product.isSample, true);
    assert.equal(isProductCategoryId(product.categoryId), true);
    assert.ok(Number.isInteger(product.priceKrw) && product.priceKrw > 0 && product.priceKrw <= 10000);
  }
});

test('분류 개수는 전체 12개와 과일채소 6개·유제품달걀 4개·빵간식 2개로 계산한다', () => {
  assert.deepEqual(getCategoryCounts(sampleProducts), { all: 12, produce: 6, 'dairy-eggs': 4, 'bakery-snacks': 2 });
  assert.deepEqual(getCategoryCounts([]), { all: 0, produce: 0, 'dairy-eggs': 0, 'bakery-snacks': 0 });
});

test('각 분류는 원래 상품 순서를 유지하며 해당 상품만 보여 준다', () => {
  const ids = (category: Parameters<typeof filterProductsByCategory>[1]) =>
    filterProductsByCategory(sampleProducts, category).map((product) => product.id);
  assert.deepEqual(ids('produce'), ['sample-apple', 'sample-carrot', 'sample-banana', 'sample-orange', 'sample-grapes', 'sample-cucumber']);
  assert.deepEqual(ids('dairy-eggs'), ['sample-milk', 'sample-egg', 'sample-yogurt', 'sample-cheese']);
  assert.deepEqual(ids('bakery-snacks'), ['sample-bread', 'sample-cracker']);
  assert.deepEqual(ids('all'), sampleProducts.map((product) => product.id));
});

test('분류와 개수 계산은 원본 목록이나 상품을 바꾸지 않는다', () => {
  const frozen = Object.freeze(sampleProducts.map((product) => Object.freeze({ ...product })));
  const before = structuredClone(frozen);
  assert.equal(filterProductsByCategory(frozen, 'all'), frozen);
  for (const category of PRODUCT_CATEGORIES) {
    const filtered = filterProductsByCategory(frozen, category.id);
    assert.equal(filtered.length, getCategoryCounts(frozen)[category.id]);
    for (const product of filtered) assert.equal(product, frozen.find((item) => item.id === product.id));
  }
  assert.deepEqual(frozen, before);
});

test('분류 검사는 대소문자·공백·빈값·미등록 값을 임의로 보정하지 않는다', () => {
  for (const category of PRODUCT_CATEGORIES) assert.equal(isProductCategoryId(category.id), true);
  for (const value of ['all', 'Produce', 'produce ', '', 'other', null, undefined, 1, {}]) {
    assert.equal(isProductCategoryId(value), false);
  }
});

test('일부 분류만 있는 목록에서도 없는 분류는 0개와 빈 목록으로 처리한다', () => {
  const oneProduct = [sampleProducts[0]];
  assert.deepEqual(getCategoryCounts(oneProduct), { all: 1, produce: 1, 'dairy-eggs': 0, 'bakery-snacks': 0 });
  assert.deepEqual(filterProductsByCategory(oneProduct, 'dairy-eggs'), []);
  assert.deepEqual(filterProductsByCategory([], 'all'), []);
});

test('서로 다른 분류의 상품도 전체 목록으로 계산해 선택한 돈과 퀴즈·영수증을 보존한다', () => {
  const reduce = createShoppingReducer(sampleProducts);
  let shopping = createInitialShoppingState();
  for (const productId of ['sample-orange', 'sample-yogurt', 'sample-cracker']) {
    shopping = reduce(shopping, { type: 'add', productId });
  }
  shopping = reduce(shopping, { type: 'select-payment', amountKrw: 5000 });
  shopping = reduce(shopping, { type: 'change-answer', answer: '400' });
  shopping = reduce(shopping, { type: 'check-answer' });
  const beforeFiltering = structuredClone(shopping);
  for (const category of PRODUCT_CATEGORIES) {
    assert.equal(filterProductsByCategory(sampleProducts, category.id).filter((product) => shopping.cart[product.id]).length, 1);
    assert.deepEqual(getCartSummary(shopping.cart, sampleProducts), { totalQuantity: 3, totalPriceKrw: 4500, distinctProducts: 3 });
    assert.deepEqual(shopping, beforeFiltering);
  }
  assert.equal(shopping.selectedPaymentKrw, 5000);
  assert.deepEqual(shopping.quiz, { answer: '400', status: 'incorrect' });
  assert.equal(getPaymentSummary(4500, shopping.selectedPaymentKrw).changeAmountKrw, 500);
  shopping = reduce(shopping, { type: 'change-answer', answer: '500' });
  shopping = reduce(shopping, { type: 'check-answer' });
  shopping = reduce(shopping, { type: 'complete-checkout' });
  assert.equal(shopping.receipt?.totalPriceKrw, 4500);
  assert.equal(shopping.receipt?.changeAmountKrw, 500);
  assert.equal(shopping.receipt?.remainingBudgetKrw, 5500);
  assert.deepEqual(shopping.receipt?.items.map(({ name, quantity }) => [name, quantity]), [['오렌지', 1], ['요구르트', 1], ['크래커', 1]]);
  assert.deepEqual(reduce(shopping, { type: 'start-new-round' }), createInitialShoppingState());
});
