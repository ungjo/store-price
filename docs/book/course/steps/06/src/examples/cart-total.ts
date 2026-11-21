type Line = { price: number; quantity: number };

const apple: Line = { price: 1500, quantity: 2 };
const milk: Line = { price: 2500, quantity: 1 };

let count = 0;
let total = 0;
for (const item of [apple, milk]) {
  // 단가에 수량을 곱하면 이 품목의 금액이 됩니다.
  count += item.quantity;
  total += item.price * item.quantity;
}

const label = total.toLocaleString('ko-KR');
console.log(count + '개 / ' + label + '원');
