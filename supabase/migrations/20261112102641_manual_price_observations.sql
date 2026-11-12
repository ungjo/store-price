-- 공개 상품 페이지에서 확인한 사실을 이용허락을 받은 API·제공 파일로 잘못 분류하지 않습니다.
-- 수동 관측은 비공개 검토 자료로만 보관하고, 기존 앱 공개 조건과 예시 자료는 유지합니다.
BEGIN;

ALTER TABLE catalog_private.price_observations
  DROP CONSTRAINT price_observations_source_kind_check,
  DROP CONSTRAINT observation_provenance,
  ADD CONSTRAINT price_observations_source_kind_check CHECK (
    source_kind IN ('sample', 'approved_api', 'approved_file', 'manual_observation')
  ),
  ADD CONSTRAINT observation_provenance CHECK (
    (is_sample AND source_kind = 'sample' AND sales_channel = 'sample'
      AND observed_at IS NULL AND source_product_id IS NULL AND source_url IS NULL AND store_id IS NULL)
    OR
    (NOT is_sample AND source_kind IN ('approved_api', 'approved_file', 'manual_observation')
      AND sales_channel <> 'sample' AND observed_at IS NOT NULL
      AND source_product_id IS NOT NULL AND source_url IS NOT NULL
      AND display_until IS NOT NULL AND display_until > observed_at)
  ),
  ADD CONSTRAINT manual_observation_is_private CHECK (
    source_kind <> 'manual_observation'
    OR (NOT is_sample AND rights_status = 'unknown' AND publication_state = 'draft')
  );

-- 관리자도 수동 관측을 승인·공개 상태로 바꿀 수 없습니다.
-- 허락된 공급 자료를 확보하면 그 출처의 새 관측을 추가해 과거 확인 사실을 보존합니다.
COMMENT ON CONSTRAINT manual_observation_is_private ON catalog_private.price_observations IS
  '공개 페이지 수동 관측은 이용허락 미확인 비공개 초안으로만 보관한다. 앱 공개 승인이나 재배포 허락을 뜻하지 않는다.';

COMMIT;
