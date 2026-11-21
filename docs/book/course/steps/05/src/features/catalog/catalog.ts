import type { ProductCategoryId } from './categories.ts';

// 화면은 상품을 받는 경로와 무관하게 같은 필드로 읽습니다.
export type CatalogProduct = Readonly<{
  id: string;
  name: string;
  unit: string;
  categoryId: ProductCategoryId;
  priceKrw: number;
  emoji: string;
  color: string;
  isSample: boolean;
  priceObservationId?: string;
}>;
