import { products, type Product } from './items.mts';

function subtotal(product: Product, quantity: number): number {
  // 계산은 원 단위 숫자로 하고 쉼표는 마지막에 붙입니다.
  return product.priceKrw * quantity;
}

const quantities = [2, 1];
let count = 0;
let total = 0;
for (const [index, product] of products.entries()) {
  const quantity = quantities[index] ?? 0;
  count += quantity;
  total += subtotal(product, quantity);
}
console.log('총 ' + count + '개 / ' + total.toLocaleString('ko-KR') + '원');
