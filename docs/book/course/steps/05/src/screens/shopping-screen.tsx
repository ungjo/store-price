import { useState } from 'react';
import type { CatalogProduct } from '../features/catalog/catalog';
import { filterProductsByCategory, type CatalogFilter } from '../features/catalog/categories';
import { Body, Card, Page, Title } from '../components/book-ui';
import { CategoryFilter } from '../components/category-filter';
import { ProductList } from '../components/product-list';

type Props = {
  products: readonly CatalogProduct[];
  sourceLabel?: string;
  onNewRound?: () => void;
};

export function ShoppingScreen({ products, sourceLabel = '자체 예시 상품' }: Props) {
  const [category, setCategory] = useState<CatalogFilter>('all');
  const [notice, setNotice] = useState('담기 버튼을 눌러 상품 이름을 확인해 보세요.');
  const visible = filterProductsByCategory(products, category);
  return (
    <Page>
      <Card>
        <Title>꼬마 시장</Title>
        <Body>{sourceLabel} · 전체 {products.length}개</Body>
        <Body>이 가격은 장보기 연습을 위한 예시예요.</Body>
        <CategoryFilter value={category} onChange={setCategory} />
        <Body>{visible.length}개 상품을 보고 있어요.</Body>
        <Body>{notice}</Body>
      </Card>
      <ProductList products={visible} onAdd={(id) => {
        const product = products.find((item) => item.id === id);
        if (product) setNotice(product.name + '를 골랐어요. 다음 장에서 장바구니에 담아요.');
      }} />
    </Page>
  );
}
