import type { ProductCategoryId } from '../features/catalog/categories.ts';

/**
 * 직접 만든 학습용 예시입니다. 실제 이마트·SSG에서 확인한 상품 가격이 아닙니다.
 * 이후 허용된 실제 가격을 연결할 때도 예시 데이터와 출처를 구분합니다.
 */
export type SampleProduct = {
  id: string;
  name: string;
  unit: string;
  categoryId: ProductCategoryId;
  // 계산 오차를 피하도록 소수점 없는 원 단위 정수로 작성합니다.
  priceKrw: number;
  emoji: string;
  color: string;
  // 실제 가격으로 오인하지 않도록 예시 상품에만 true를 지정합니다.
  isSample: true;
};

export const sampleProducts: SampleProduct[] = [
  { id: 'sample-apple', name: '사과', unit: '1개', categoryId: 'produce', priceKrw: 1500, emoji: '🍎', color: '#FBECE6', isSample: true },
  { id: 'sample-milk', name: '우유', unit: '1팩 · 1L', categoryId: 'dairy-eggs', priceKrw: 2500, emoji: '🥛', color: '#E9F0F7', isSample: true },
  { id: 'sample-carrot', name: '당근', unit: '1개', categoryId: 'produce', priceKrw: 1000, emoji: '🥕', color: '#FFF0D7', isSample: true },
  { id: 'sample-bread', name: '식빵', unit: '1봉', categoryId: 'bakery-snacks', priceKrw: 3000, emoji: '🍞', color: '#F5EBDD', isSample: true },
  { id: 'sample-banana', name: '바나나', unit: '1송이', categoryId: 'produce', priceKrw: 3500, emoji: '🍌', color: '#FAF3D5', isSample: true },
  { id: 'sample-egg', name: '달걀', unit: '6개', categoryId: 'dairy-eggs', priceKrw: 2000, emoji: '🥚', color: '#F1EBE3', isSample: true },
  { id: 'sample-orange', name: '오렌지', unit: '1개', categoryId: 'produce', priceKrw: 1800, emoji: '🍊', color: '#FFF0DB', isSample: true },
  { id: 'sample-grapes', name: '포도', unit: '1송이', categoryId: 'produce', priceKrw: 4000, emoji: '🍇', color: '#F0E8F6', isSample: true },
  { id: 'sample-cucumber', name: '오이', unit: '1개', categoryId: 'produce', priceKrw: 800, emoji: '🥒', color: '#E8F1DF', isSample: true },
  { id: 'sample-yogurt', name: '요구르트', unit: '1병 · 150mL', categoryId: 'dairy-eggs', priceKrw: 1200, emoji: '🥤', color: '#F7E9EE', isSample: true },
  { id: 'sample-cheese', name: '치즈', unit: '1팩 · 5장', categoryId: 'dairy-eggs', priceKrw: 2000, emoji: '🧀', color: '#FFF1CE', isSample: true },
  { id: 'sample-cracker', name: '크래커', unit: '1봉', categoryId: 'bakery-snacks', priceKrw: 1500, emoji: '🍘', color: '#F6EBDD', isSample: true },
];
