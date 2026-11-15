-- 직접 만든 학습용 예시 12개입니다. 이마트·SSG의 실제 가격이나 관측 자료가 아닙니다.
-- 반복 실행해도 관리자가 바꾼 활성·승인·공개 상태와 기존 가격 이력을 덮어쓰지 않습니다.
BEGIN;

INSERT INTO catalog_private.products
  (id, name, unit_label, is_sample, is_active, emoji, color, sort_order, category_id)
VALUES
  ('sample-apple', '사과', '1개', true, true, '🍎', '#FBECE6', 0, 'produce'),
  ('sample-milk', '우유', '1팩 · 1L', true, true, '🥛', '#E9F0F7', 1, 'dairy-eggs'),
  ('sample-carrot', '당근', '1개', true, true, '🥕', '#FFF0D7', 2, 'produce'),
  ('sample-bread', '식빵', '1봉', true, true, '🍞', '#F5EBDD', 3, 'bakery-snacks'),
  ('sample-banana', '바나나', '1송이', true, true, '🍌', '#FAF3D5', 4, 'produce'),
  ('sample-egg', '달걀', '6개', true, true, '🥚', '#F1EBE3', 5, 'dairy-eggs'),
  ('sample-orange', '오렌지', '1개', true, true, '🍊', '#FFF0DB', 6, 'produce'),
  ('sample-grapes', '포도', '1송이', true, true, '🍇', '#F0E8F6', 7, 'produce'),
  ('sample-cucumber', '오이', '1개', true, true, '🥒', '#E8F1DF', 8, 'produce'),
  ('sample-yogurt', '요구르트', '1병 · 150mL', true, true, '🥤', '#F7E9EE', 9, 'dairy-eggs'),
  ('sample-cheese', '치즈', '1팩 · 5장', true, true, '🧀', '#FFF1CE', 10, 'dairy-eggs'),
  ('sample-cracker', '크래커', '1봉', true, true, '🍘', '#F6EBDD', 11, 'bakery-snacks')
ON CONFLICT DO NOTHING;

INSERT INTO catalog_private.price_observations
  (id, product_id, is_sample, source_kind, sales_channel,
   source_price_krw, play_price_krw, observed_at,
   promotion_type, availability, rights_status, publication_state, approval_notes)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'sample-apple', true, 'sample', 'sample', 1500, 1500, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000002', 'sample-milk', true, 'sample', 'sample', 2500, 2500, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000003', 'sample-carrot', true, 'sample', 'sample', 1000, 1000, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000004', 'sample-bread', true, 'sample', 'sample', 3000, 3000, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000005', 'sample-banana', true, 'sample', 'sample', 3500, 3500, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000006', 'sample-egg', true, 'sample', 'sample', 2000, 2000, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000007', 'sample-orange', true, 'sample', 'sample', 1800, 1800, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000008', 'sample-grapes', true, 'sample', 'sample', 4000, 4000, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000009', 'sample-cucumber', true, 'sample', 'sample', 800, 800, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000010', 'sample-yogurt', true, 'sample', 'sample', 1200, 1200, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000011', 'sample-cheese', true, 'sample', 'sample', 2000, 2000, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.'),
  ('00000000-0000-4000-8000-000000000012', 'sample-cracker', true, 'sample', 'sample', 1500, 1500, NULL, 'none', 'available', 'app_approved', 'published', '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.')
ON CONFLICT DO NOTHING;

COMMIT;
