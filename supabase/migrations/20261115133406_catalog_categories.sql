-- 실제 상품은 임의로 분류하지 않습니다. 분류가 없는 비공개 원본은 보존하고 공개 목록에서만 제외합니다.
-- 예시 확장과 공개 계약을 한 트랜잭션으로 적용해 중간 상태가 앱에 보이지 않게 합니다.
BEGIN;

ALTER TABLE catalog_private.products ADD COLUMN IF NOT EXISTS category_id text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'catalog_private.products'::regclass AND conname = 'products_category_id_check'
  ) THEN
    ALTER TABLE catalog_private.products ADD CONSTRAINT products_category_id_check
      CHECK (category_id IS NULL OR category_id IN ('produce', 'dairy-eggs', 'bakery-snacks'));
  END IF;
END;
$$;

DO $$
DECLARE
  item record;
  expected_observation catalog_private.price_observations%ROWTYPE;
  sample_notes constant text := '직접 작성한 학습용 예시. 외부 상품 가격을 수집하지 않았습니다.';
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('sample-apple', '사과', '1개', '🍎', '#FBECE6', 0, 'produce', 1500, '00000000-0000-4000-8000-000000000001'::uuid),
      ('sample-milk', '우유', '1팩 · 1L', '🥛', '#E9F0F7', 1, 'dairy-eggs', 2500, '00000000-0000-4000-8000-000000000002'::uuid),
      ('sample-carrot', '당근', '1개', '🥕', '#FFF0D7', 2, 'produce', 1000, '00000000-0000-4000-8000-000000000003'::uuid),
      ('sample-bread', '식빵', '1봉', '🍞', '#F5EBDD', 3, 'bakery-snacks', 3000, '00000000-0000-4000-8000-000000000004'::uuid),
      ('sample-banana', '바나나', '1송이', '🍌', '#FAF3D5', 4, 'produce', 3500, '00000000-0000-4000-8000-000000000005'::uuid),
      ('sample-egg', '달걀', '6개', '🥚', '#F1EBE3', 5, 'dairy-eggs', 2000, '00000000-0000-4000-8000-000000000006'::uuid),
      ('sample-orange', '오렌지', '1개', '🍊', '#FFF0DB', 6, 'produce', 1800, '00000000-0000-4000-8000-000000000007'::uuid),
      ('sample-grapes', '포도', '1송이', '🍇', '#F0E8F6', 7, 'produce', 4000, '00000000-0000-4000-8000-000000000008'::uuid),
      ('sample-cucumber', '오이', '1개', '🥒', '#E8F1DF', 8, 'produce', 800, '00000000-0000-4000-8000-000000000009'::uuid),
      ('sample-yogurt', '요구르트', '1병 · 150mL', '🥤', '#F7E9EE', 9, 'dairy-eggs', 1200, '00000000-0000-4000-8000-000000000010'::uuid),
      ('sample-cheese', '치즈', '1팩 · 5장', '🧀', '#FFF1CE', 10, 'dairy-eggs', 2000, '00000000-0000-4000-8000-000000000011'::uuid),
      ('sample-cracker', '크래커', '1봉', '🍘', '#F6EBDD', 11, 'bakery-snacks', 1500, '00000000-0000-4000-8000-000000000012'::uuid)
    ) AS sample(id, name, unit_label, emoji, color, sort_order, category_id, price_krw, observation_id)
  LOOP
    -- 같은 예약 ID가 다른 상품이나 관측에 쓰였으면 덮어쓰지 않고 전체 변경을 취소합니다.
    IF EXISTS (
      SELECT 1 FROM catalog_private.products p WHERE p.id = item.id
        AND (ROW(p.name, p.unit_label, p.is_sample) IS DISTINCT FROM ROW(item.name, item.unit_label, true)
          OR (p.category_id IS NOT NULL AND p.category_id <> item.category_id))
    ) THEN
      RAISE EXCEPTION '예시 상품 식별자 또는 기존 분류가 충돌합니다: %', item.id USING ERRCODE = '23514';
    END IF;

    INSERT INTO catalog_private.products
      (id, name, unit_label, is_sample, is_active, emoji, color, sort_order, category_id)
    VALUES (item.id, item.name, item.unit_label, true, true, item.emoji, item.color, item.sort_order, item.category_id)
    ON CONFLICT (id) DO NOTHING;
    -- 기존 여섯 상품의 가격·그림·정렬·활성 상태는 유지하고 아직 없는 분류만 채웁니다.
    UPDATE catalog_private.products SET category_id = item.category_id
    WHERE id = item.id AND category_id IS NULL;

    SELECT * INTO expected_observation
    FROM jsonb_populate_record(NULL::catalog_private.price_observations, jsonb_build_object(
      'id', item.observation_id, 'product_id', item.id, 'is_sample', true,
      'source_kind', 'sample', 'sales_channel', 'sample',
      'source_price_krw', item.price_krw, 'play_price_krw', item.price_krw,
      'play_price_rule', 'exact', 'promotion_type', 'none', 'approval_notes', sample_notes
    ));
    IF EXISTS (
      SELECT 1 FROM catalog_private.price_observations o WHERE o.id = item.observation_id
        AND (to_jsonb(o) - ARRAY['created_at', 'publication_state', 'rights_status', 'availability'])
          IS DISTINCT FROM
          (to_jsonb(expected_observation) - ARRAY['created_at', 'publication_state', 'rights_status', 'availability'])
    ) THEN
      RAISE EXCEPTION '예시 가격 관측 식별자가 충돌합니다: %', item.id USING ERRCODE = '23514';
    END IF;

    -- 재실행은 관리자가 철회한 가격·권한·재고 상태를 되돌리지 않습니다.
    INSERT INTO catalog_private.price_observations
      (id, product_id, is_sample, source_kind, sales_channel, source_price_krw, play_price_krw,
       observed_at, promotion_type, availability, rights_status, publication_state, approval_notes)
    VALUES (item.observation_id, item.id, true, 'sample', 'sample', item.price_krw, item.price_krw,
      NULL, 'none', 'available', 'app_approved', 'published', sample_notes)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END;
$$;

-- 새 열의 읽기 권한만 추가합니다. 비공개 스키마 접근·쓰기·기존 공개 승인 조건은 바꾸지 않습니다.
GRANT SELECT (category_id) ON catalog_private.products TO anon, authenticated;
CREATE OR REPLACE VIEW public.play_catalog
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  p.id,
  p.name,
  p.unit_label,
  o.source_price_krw::integer AS source_price_krw,
  o.play_price_krw::integer AS play_price_krw,
  o.play_price_rule,
  p.is_sample,
  p.emoji,
  p.color,
  p.sort_order,
  o.id AS price_observation_id,
  o.source_kind,
  o.source_url,
  o.sales_channel,
  o.store_id,
  o.observed_at,
  o.valid_from,
  o.valid_until,
  o.display_until,
  p.category_id
FROM catalog_private.products p
JOIN catalog_private.price_observations o
  ON o.product_id = p.id AND o.is_sample = p.is_sample
WHERE p.is_active
  AND p.category_id IS NOT NULL
  AND o.publication_state = 'published'
  AND o.rights_status = 'app_approved'
  AND o.availability = 'available'
  AND o.promotion_type = 'none'
  AND o.promotion_conditions IS NULL
  AND o.sales_channel IN ('sample', 'ssg_emart_online')
  AND o.play_price_krw <= 10000
  AND (o.observed_at IS NULL OR observed_at <= statement_timestamp())
  AND (o.valid_from IS NULL OR valid_from <= statement_timestamp())
  AND (o.valid_until IS NULL OR valid_until > statement_timestamp())
  AND (o.display_until IS NULL OR display_until > statement_timestamp());

COMMENT ON COLUMN catalog_private.products.category_id IS
  '놀이 상품 분류. 실제 상품의 미분류 NULL은 보존하며 공개 카탈로그에서는 제외한다.';
NOTIFY pgrst, 'reload schema';
COMMIT;
