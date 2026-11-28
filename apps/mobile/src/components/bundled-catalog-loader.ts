import { sampleProducts } from '../data/sample-products.ts';
import type { CatalogLoaderProps } from './catalog-loader';

export function CatalogLoader({ children }: CatalogLoaderProps) {
  // 새 놀이에서도 같은 내장 목록을 사용하므로 서버 조회나 재시도 함수를 만들지 않습니다.
  return children(sampleProducts, 'sample');
}
