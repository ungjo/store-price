-- 원본과 관리 메모는 비공개 스키마에 두고, 앱에는 승인된 현재 가격만 공개합니다.
-- Supabase의 anon/authenticated/service_role은 이미 존재해야 하며 여기서 만들지 않습니다.
BEGIN;

CREATE SCHEMA catalog_private;
REVOKE ALL ON SCHEMA catalog_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA catalog_private TO service_role;

CREATE TABLE catalog_private.products (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  unit_label text NOT NULL CHECK (length(btrim(unit_label)) BETWEEN 1 AND 120),
  is_sample boolean NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  emoji text NOT NULL DEFAULT '🛒' CHECK (length(emoji) BETWEEN 1 AND 16),
  color text NOT NULL DEFAULT '#EAF0E5' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK (isfinite(created_at)),
  UNIQUE (id, is_sample)
);

CREATE TABLE catalog_private.price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL,
  is_sample boolean NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('sample', 'approved_api', 'approved_file')),
  source_product_id text CHECK (source_product_id IS NULL OR length(btrim(source_product_id)) BETWEEN 1 AND 200),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://[^[:space:]]+$'),
  sales_channel text NOT NULL CHECK (sales_channel IN ('sample', 'ssg_emart_online', 'offline_store', 'unknown')),
  store_id text CHECK (store_id IS NULL OR length(btrim(store_id)) BETWEEN 1 AND 120),
  -- integer 형변환의 자동 반올림 전에 소수 입력을 거절하도록 무척도 numeric을 사용합니다.
  source_price_krw numeric NOT NULL CHECK (
    source_price_krw BETWEEN 1 AND 2147483647 AND source_price_krw = trunc(source_price_krw)
  ),
  play_price_krw numeric NOT NULL CHECK (
    play_price_krw BETWEEN 1 AND 2147483647 AND play_price_krw = trunc(play_price_krw)
  ),
  play_price_rule text NOT NULL DEFAULT 'exact' CHECK (play_price_rule = 'exact'),
  observed_at timestamptz CHECK (observed_at IS NULL OR isfinite(observed_at)),
  valid_from timestamptz CHECK (valid_from IS NULL OR isfinite(valid_from)),
  valid_until timestamptz CHECK (valid_until IS NULL OR isfinite(valid_until)),
  display_until timestamptz CHECK (display_until IS NULL OR isfinite(display_until)),
  promotion_type text NOT NULL DEFAULT 'unknown' CHECK (
    promotion_type IN ('none', 'member', 'card', 'bundle', 'other', 'unknown')
  ),
  promotion_conditions text CHECK (
    promotion_conditions IS NULL OR length(btrim(promotion_conditions)) BETWEEN 1 AND 2000
  ),
  availability text NOT NULL DEFAULT 'unknown' CHECK (
    availability IN ('available', 'out_of_stock', 'unknown')
  ),
  rights_status text NOT NULL DEFAULT 'unknown' CHECK (
    rights_status IN ('unknown', 'app_approved', 'revoked')
  ),
  publication_state text NOT NULL DEFAULT 'draft' CHECK (
    publication_state IN ('draft', 'published', 'withdrawn')
  ),
  approval_notes text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK (isfinite(created_at)),
  CONSTRAINT observation_product_kind_fk FOREIGN KEY (product_id, is_sample)
    REFERENCES catalog_private.products (id, is_sample),
  CONSTRAINT exact_play_price CHECK (play_price_krw = source_price_krw),
  CONSTRAINT valid_period_order CHECK (
    valid_from IS NULL OR valid_until IS NULL OR valid_until > valid_from
  ),
  -- 예시는 외부에서 관측한 자료가 아닙니다. 실제 자료는 출처와 유한한 공개 기한이 필요합니다.
  CONSTRAINT observation_provenance CHECK (
    (is_sample AND source_kind = 'sample' AND sales_channel = 'sample'
      AND observed_at IS NULL AND source_product_id IS NULL AND source_url IS NULL AND store_id IS NULL)
    OR
    (NOT is_sample AND source_kind IN ('approved_api', 'approved_file')
      AND sales_channel <> 'sample' AND observed_at IS NOT NULL
      AND source_product_id IS NOT NULL AND source_url IS NOT NULL
      AND display_until IS NOT NULL AND display_until > observed_at)
  ),
  CONSTRAINT offline_store_identity CHECK (sales_channel <> 'offline_store' OR store_id IS NOT NULL)
);

-- 공개 행을 명시적으로 하나만 선택합니다. 철회·만료 시 과거 관측으로 자동 복귀하지 않습니다.
CREATE UNIQUE INDEX one_published_observation_per_product
  ON catalog_private.price_observations (product_id)
  WHERE publication_state = 'published';
CREATE INDEX price_observations_product_history
  ON catalog_private.price_observations (product_id, created_at DESC);

-- 관리자도 관측 사실을 덮어쓰지 못하게 합니다. 수정 자료는 새로운 관측 행으로 남깁니다.
CREATE FUNCTION catalog_private.keep_observation_facts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['publication_state', 'rights_status', 'availability'])
      IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['publication_state', 'rights_status', 'availability']) THEN
    RAISE EXCEPTION '관측 사실은 변경할 수 없습니다. 새 가격 관측을 추가해 주세요.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION catalog_private.keep_observation_facts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_private.keep_observation_facts() TO service_role;
CREATE TRIGGER price_observation_facts_are_immutable
  BEFORE UPDATE ON catalog_private.price_observations
  FOR EACH ROW EXECUTE FUNCTION catalog_private.keep_observation_facts();


-- 이미 가격을 관측한 상품의 이름·규격을 바꾸면 과거 가격의 의미도 바뀝니다.
-- 다른 상품·규격은 새 상품 ID로 추가하고 표시 색상·순서·활성 상태만 자유롭게 관리합니다.
CREATE FUNCTION catalog_private.keep_product_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(NEW.id, NEW.name, NEW.unit_label, NEW.is_sample)
      IS DISTINCT FROM ROW(OLD.id, OLD.name, OLD.unit_label, OLD.is_sample)
    AND EXISTS (
      SELECT 1 FROM catalog_private.price_observations
      WHERE product_id = OLD.id
    ) THEN
    RAISE EXCEPTION '가격 관측이 있는 상품의 이름과 규격은 변경할 수 없습니다. 새 상품으로 추가해 주세요.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION catalog_private.keep_product_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_private.keep_product_identity() TO service_role;
CREATE TRIGGER observed_product_identity_is_immutable
  BEFORE UPDATE ON catalog_private.products
  FOR EACH ROW EXECUTE FUNCTION catalog_private.keep_product_identity();

ALTER TABLE catalog_private.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_private.products FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog_private.price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_private.price_observations FORCE ROW LEVEL SECURITY;

CREATE POLICY public_active_products ON catalog_private.products
  FOR SELECT TO anon, authenticated
  USING (is_active);

-- 조건부 할인·확인되지 않은 권리·점포 가격은 현재 어린이용 온라인 카탈로그에 섞지 않습니다.
-- 현재 놀이돈 10,000원으로 한 개도 살 수 없는 가격은 보관만 하고 놀이 목록에서는 제외합니다.
CREATE POLICY public_playable_observations ON catalog_private.price_observations
  FOR SELECT TO anon, authenticated
  USING (
    publication_state = 'published'
    AND rights_status = 'app_approved'
    AND availability = 'available'
    AND promotion_type = 'none'
    AND promotion_conditions IS NULL
    AND sales_channel IN ('sample', 'ssg_emart_online')
    AND play_price_krw <= 10000
    AND (observed_at IS NULL OR observed_at <= statement_timestamp())
    AND (valid_from IS NULL OR valid_from <= statement_timestamp())
    AND (valid_until IS NULL OR valid_until > statement_timestamp())
    AND (display_until IS NULL OR display_until > statement_timestamp())
    AND EXISTS (
      SELECT 1 FROM catalog_private.products p
      WHERE p.id = price_observations.product_id
        AND p.is_sample = price_observations.is_sample
        AND p.is_active
    )
  );

-- 기존 프로젝트의 자동 권한을 믿지 않고 필요한 객체·열 권한만 다시 부여합니다.
REVOKE ALL ON TABLE catalog_private.products, catalog_private.price_observations
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE catalog_private.products, catalog_private.price_observations TO service_role;
GRANT SELECT (id, name, unit_label, is_sample, is_active, emoji, color, sort_order)
  ON catalog_private.products TO anon, authenticated;
GRANT SELECT (
  id, product_id, is_sample, source_kind, source_url, sales_channel, store_id,
  source_price_krw, play_price_krw, play_price_rule, observed_at, valid_from, valid_until, display_until,
  promotion_type, promotion_conditions, availability, rights_status, publication_state
) ON catalog_private.price_observations TO anon, authenticated;

-- invoker 뷰는 호출자의 원본 열 권한과 RLS를 사용합니다. 비공개 스키마 USAGE는 주지 않습니다.
-- 뷰에도 같은 공개 조건을 두어 관리자 조회조차 공개 카탈로그의 의미를 유지합니다.
CREATE VIEW public.play_catalog
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
  o.display_until
FROM catalog_private.products p
JOIN catalog_private.price_observations o
  ON o.product_id = p.id AND o.is_sample = p.is_sample
WHERE p.is_active
  AND o.publication_state = 'published'
  AND o.rights_status = 'app_approved'
  AND o.availability = 'available'
  AND o.promotion_type = 'none'
  AND o.promotion_conditions IS NULL
  AND o.sales_channel IN ('sample', 'ssg_emart_online')
  AND o.play_price_krw <= 10000
  AND (o.observed_at IS NULL OR o.observed_at <= statement_timestamp())
  AND (o.valid_from IS NULL OR o.valid_from <= statement_timestamp())
  AND (o.valid_until IS NULL OR o.valid_until > statement_timestamp())
  AND (o.display_until IS NULL OR o.display_until > statement_timestamp());

REVOKE ALL ON TABLE public.play_catalog FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.play_catalog TO anon, authenticated, service_role;
COMMENT ON VIEW public.play_catalog IS
  '앱 공개용 승인된 현재 놀이 가격. 실제 가격 사용권은 app_approved로 별도 확인하며 책·GitHub 재배포 권한을 뜻하지 않습니다.';

COMMIT;
