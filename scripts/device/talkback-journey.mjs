// 좌표나 접근성 노드의 click 명령 대신 실제 TalkBack 읽기 탐색과 터치 활성화를 재사용합니다.
export async function runTalkBackJourney({ seek, activate, snapshot, checkpoint, typeDigits }) {
  const next = (target, limit = 100) => seek(target, { direction: 'next', limit });
  const previous = (target, limit = 100) => seek(target, { direction: 'previous', limit });
  const appleAdd = 'product-sample-apple-add';
  const appleDecrease = 'product-sample-apple-decrease';

  await next('category-all');
  await checkpoint('category-all-selected', {
    focusId: 'category-all', textIncludes: '전체 상품 12개', selected: true, speechIncludes: '전체',
  });

  await next(appleAdd);
  // 자동 스크롤 직후 설명을 건너뛴 기존 앱의 관측이 있어, 이전 방향에서 가격을 실제로 읽고 담기로 돌아옵니다.
  const appleDescription = (node) => Boolean(node?.visible && typeof node.desc === 'string'
    && node.desc.includes('사과') && node.desc.includes('연습용 가격') && node.desc.includes('1,500원'));
  await previous(appleDescription, 25);
  const priceSnapshot = await snapshot();
  if (!appleDescription(priceSnapshot.focus)) throw new Error('사과 상품 설명과 가격에 실제 읽기 초점이 있지 않습니다.');
  await checkpoint('apple-description-and-price', {
    textIncludes: '1,500원', speechIncludes: '연습용 가격',
  });
  await next(appleAdd, 25);
  await activate();
  await checkpoint('first-add-keeps-focus', {
    focusId: appleAdd, textIncludes: '현재 1개 담김', speechIncludes: ['장바구니 총 1개', '합계 1,500원'], enabled: true,
  });

  // 마지막 감소는 버튼을 없애므로, 남아 있는 담기 버튼으로 초점이 돌아오는지 별도로 확인합니다.
  await previous(appleDecrease, 10);
  await activate();
  await checkpoint('last-decrease-restores-add-focus', {
    focusId: appleAdd, textIncludes: '현재 0개 담김', enabled: true, speechIncludes: '담기',
  });
  await activate();
  await activate();
  await checkpoint('apple-two', {
    focusId: appleAdd, textIncludes: '현재 2개 담김', enabled: true,
  });

  // 상한을 확인한 뒤 같은 상품을 두 개로 돌려 기본 5,500원 문제의 조건을 유지합니다.
  for (let count = 2; count < 9; count += 1) await activate();
  await checkpoint('apple-nine-limit', {
    nodeId: appleAdd, textIncludes: '9개까지 담을 수 있어요', enabled: false,
  });
  await previous(appleDecrease, 10);
  for (let count = 9; count > 2; count -= 1) await activate();
  await checkpoint('apple-two-after-limit', {
    nodeId: 'product-sample-apple-quantity', textIncludes: '사과 2개 담김',
  });

  await next('product-sample-milk-add');
  await activate();
  await checkpoint('milk-one-keeps-focus', {
    focusId: 'product-sample-milk-add', textIncludes: '현재 1개 담김', enabled: true,
  });

  await next('payment-option-5000');
  await activate();
  await checkpoint('payment-five-thousand-selected', {
    nodeId: 'payment-option-5000', selected: true, enabled: true,
  });
  await next('payment-result');
  await checkpoint('payment-insufficient-five-hundred', {
    focusId: 'payment-result', textIncludes: '500원이 더 필요해요.', speechIncludes: '더 필요해요',
  });
  await previous('payment-option-10000', 20);
  await activate();
  await checkpoint('payment-ten-thousand-selected', {
    nodeId: 'payment-option-10000', selected: true, enabled: true,
  });

  await next('quiz-question');
  await checkpoint('quiz-question', {
    focusId: 'quiz-question', textIncludes: '물건값 5,500원', speechIncludes: '거스름돈',
  });
  await next('quiz-answer');
  await activate();
  await typeDigits('4000');
  await next('quiz-check');
  await activate();
  // 키보드 종료 안내 뒤에도 오답 내용을 다시 읽을 수 있는지 실제 앞뒤 탐색으로 확인한다.
  await previous('quiz-check', 20);
  await next('quiz-feedback', 20);
  await checkpoint('quiz-incorrect', {
    focusId: 'quiz-feedback', textIncludes: '다시 생각해 볼까요?', speechIncludes: '다시 생각해',
  });

  await next('quiz-retry', 20);
  await activate();
  await checkpoint('quiz-retry-clears-result', {
    focusId: 'quiz-answer', nodeId: 'quiz-feedback', textIncludes: '거스름돈을 숫자로 적고',
  });
  await previous('quiz-answer', 30);
  await activate();
  await typeDigits('4500');
  await next('quiz-check');
  await activate();
  // seek로 결과를 찾지 않아, 사라지는 확인 버튼에서 앱이 초점을 옮겼는지를 검증합니다.
  await checkpoint('quiz-correct-focus', {
    focusId: 'quiz-feedback', textIncludes: '정답이에요!', speechIncludes: '정답이에요',
  });
  await next('payment-change', 20);
  await checkpoint('correct-change-four-thousand-five-hundred', {
    focusId: 'payment-change', textIncludes: '받을 거스름돈 4,500원', speechIncludes: '거스름돈',
  });

  await next('checkout-complete', 30);
  await activate();
  await checkpoint('receipt-title-focus', {
    focusId: 'receipt-title', textIncludes: '계산을 마쳤어요!', speechIncludes: '계산을 마쳤어요',
  });
  await next('receipt-item-sample-apple');
  await checkpoint('receipt-apples', {
    focusId: 'receipt-item-sample-apple', textIncludes: '1,500원 × 2개, 3,000원.', speechIncludes: '사과',
  });
  await next('receipt-item-sample-milk');
  await checkpoint('receipt-milk', {
    focusId: 'receipt-item-sample-milk', textIncludes: '2,500원 × 1개, 2,500원.', speechIncludes: '우유',
  });
  await next('receipt-total');
  await checkpoint('receipt-total', {
    focusId: 'receipt-total', textIncludes: '총 3개, 합계 5,500원.', speechIncludes: '합계',
  });
  await next('receipt-payment');
  await checkpoint('receipt-payment-and-change', {
    focusId: 'receipt-payment', textIncludes: '받은 거스름돈 4,500원.', speechIncludes: '거스름돈',
  });

  await next('receipt-new-round');
  await activate();
  await checkpoint('new-round-title-focus', {
    focusId: 'market-title', textIncludes: '오늘은 무엇을', speechIncludes: '오늘은 무엇을',
  });
  await next('cart-empty');
  await checkpoint('new-round-empty-cart', {
    focusId: 'cart-empty', textIncludes: '아직 장바구니가 비어 있어요', speechIncludes: '비어 있어요',
  });
}
