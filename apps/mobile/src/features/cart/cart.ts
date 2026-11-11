export const MAX_QUANTITY = 9;

export type CartState = Readonly<Record<string, number>>;

export type CartAction =
  | { type: 'add' | 'decrease' | 'remove'; productId: string }
  | { type: 'clear' };

type CartProduct = {
  id: string;
  priceKrw: number;
};

export function createCartReducer(catalog: readonly CartProduct[]) {
  // 화면에 등록된 상품만 담도록 제한해 상품 목록과 장바구니가 어긋나지 않게 합니다.
  const productIds = new Set(catalog.map((product) => product.id));

  return function cartReducer(state: CartState, action: CartAction): CartState {
    if (action.type === 'clear') {
      return {};
    }

    if (!productIds.has(action.productId)) {
      return state;
    }

    const quantity = state[action.productId] ?? 0;

    if (action.type === 'add') {
      if (quantity >= MAX_QUANTITY) {
        return state;
      }

      // 이전 상태를 보존해야 React가 변경을 알아차리고 화면을 다시 그릴 수 있습니다.
      return { ...state, [action.productId]: quantity + 1 };
    }

    if (!Object.hasOwn(state, action.productId)) {
      return state;
    }

    const nextState = { ...state };

    if (action.type === 'decrease' && quantity > 1) {
      nextState[action.productId] = quantity - 1;
    } else {
      // 수량이 0이 되는 상품은 키도 지워 빈 장바구니 판단을 간단하게 유지합니다.
      delete nextState[action.productId];
    }

    return nextState;
  };
}

export function getCartSummary(state: CartState, catalog: readonly CartProduct[]) {
  let totalQuantity = 0;
  let totalPriceKrw = 0;
  let distinctProducts = 0;

  // 원 단위 정수 가격에 수량을 곱합니다. 목록에 없는 상품은 합계에 포함하지 않습니다.
  for (const product of catalog) {
    const quantity = state[product.id] ?? 0;
    if (quantity === 0) {
      continue;
    }

    totalQuantity += quantity;
    totalPriceKrw += product.priceKrw * quantity;
    distinctProducts += 1;
  }

  return { totalQuantity, totalPriceKrw, distinctProducts };
}
