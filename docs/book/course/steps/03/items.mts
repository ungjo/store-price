export type Product = {
  id: string;
  name: string;
  priceKrw: number;
};

export const products: Product[] = [
  { id: 'sample-apple', name: '사과', priceKrw: 1500 },
  { id: 'sample-milk', name: '우유', priceKrw: 2500 },
];
