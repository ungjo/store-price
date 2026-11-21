export const PRODUCT_CATEGORIES = [
  { id: 'produce', label: '과일·채소' },
  { id: 'dairy-eggs', label: '유제품·달걀' },
  { id: 'bakery-snacks', label: '빵·간식' },
] as const;

export type ProductCategoryId = typeof PRODUCT_CATEGORIES[number]['id'];
export type CatalogFilter = 'all' | ProductCategoryId;
export type CategoryCounts = Readonly<Record<CatalogFilter, number>>;

export function isProductCategoryId(value: unknown): value is ProductCategoryId {
  return PRODUCT_CATEGORIES.some((category) => category.id === value);
}

export function filterProductsByCategory<T extends { categoryId: ProductCategoryId }>(
  products: readonly T[],
  category: CatalogFilter,
): readonly T[] {
  // 분류는 보이는 목록에만 적용합니다. 가격 계산과 장바구니에는 원래 전체 목록을 사용합니다.
  return category === 'all' ? products : products.filter((product) => product.categoryId === category);
}

export function getCategoryCounts(products: readonly { categoryId: ProductCategoryId }[]): CategoryCounts {
  const counts: Record<CatalogFilter, number> = { all: products.length, produce: 0, 'dairy-eggs': 0, 'bakery-snacks': 0 };
  for (const product of products) counts[product.categoryId] += 1;
  return counts;
}
