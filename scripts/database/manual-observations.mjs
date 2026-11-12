import { createHash } from 'node:crypto';

export const MAX_MANUAL_OBSERVATIONS = 20;
export const MANUAL_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

const allowedFields = new Set([
  'sourceProductId', 'sourceUrl', 'name', 'unitLabel', 'priceKrw', 'observedAt',
  'availability', 'promotionType', 'priceBasis', 'notes', 'loginContext', 'deliveryContext',
]);
const observationColumns = [
  'id', 'product_id', 'is_sample', 'source_kind', 'source_product_id', 'source_url',
  'sales_channel', 'store_id', 'source_price_krw', 'play_price_krw', 'play_price_rule',
  'observed_at', 'valid_from', 'valid_until', 'display_until', 'promotion_type',
  'promotion_conditions', 'availability', 'rights_status', 'publication_state', 'approval_notes',
];

function textField(value, label, maxLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength
    || value.trim() !== value || !value.isWellFormed()
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new Error(`${label}: 공백 없는 양끝과 제한 길이의 일반 문자열이 필요합니다.`);
  }
  return value;
}

function utcDate(value, label) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) {
    throw new Error(`${label}: UTC ISO 시각이 필요합니다.`);
  }
  const date = new Date(value);
  const canonicalInput = value.includes('.') ? value : value.replace('Z', '.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonicalInput) {
    throw new Error(`${label}: 실제로 존재하는 시각이 필요합니다.`);
  }
  return date;
}

function sourceUrl(value, sourceProductId) {
  textField(value, 'sourceUrl', 1000);
  // 사이트·경로·채널을 고정하고 인증 정보가 섞인 주소를 거절합니다. 판매자는 사람이 별도로 확인합니다.
  if (!value.startsWith('https://emart.ssg.com/item/itemView.ssg?')) {
    throw new Error('sourceUrl: 이마트몰 HTTPS 상품 상세 주소가 필요합니다.');
  }
  const url = new URL(value);
  const keys = [...url.searchParams.keys()];
  if (url.origin !== 'https://emart.ssg.com' || url.pathname !== '/item/itemView.ssg'
    || url.username || url.password || url.port || value.includes('#')
    || new Set(keys).size !== keys.length
    || keys.some((key) => !['itemId', 'siteNo', 'salestrNo'].includes(key))
    || url.searchParams.get('itemId') !== sourceProductId
    || url.searchParams.get('siteNo') !== '6001'
    || (url.searchParams.has('salestrNo') && !/^\d{1,12}$/u.test(url.searchParams.get('salestrNo')))) {
    throw new Error('sourceUrl: 상품 번호·이마트 채널·허용된 주소 조건을 확인해 주세요.');
  }
  const canonical = new URL('https://emart.ssg.com/item/itemView.ssg');
  canonical.searchParams.set('itemId', sourceProductId);
  canonical.searchParams.set('siteNo', '6001');
  if (url.searchParams.has('salestrNo')) {
    canonical.searchParams.set('salestrNo', url.searchParams.get('salestrNo'));
  }
  return canonical.href;
}

function observationId(facts) {
  // 같은 관측을 재전송하면 같은 ID가 됩니다. 관측 시각·가격·조건이 바뀌면 새 이력입니다.
  const bytes = createHash('sha256').update('store-price/manual-observation/v1\0')
    .update(JSON.stringify(facts)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 브라우저에서 사람이 확인한 소량의 사실만 검증합니다. 네트워크 접속이나 공개 승인을 하지 않습니다. */
export function prepareManualObservations(input, { now = new Date() } = {}) {
  const current = now instanceof Date ? new Date(now.getTime()) : utcDate(now, 'now');
  if (!Number.isFinite(current.getTime())) throw new Error('now: 유효한 현재 시각이 필요합니다.');
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_MANUAL_OBSERVATIONS) {
    throw new Error(`관측 자료는 1~${MAX_MANUAL_OBSERVATIONS}개씩 입력해 주세요.`);
  }
  const products = [];
  const observations = [];
  const productIds = new Set();

  for (const entry of input) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(entry))
      || Reflect.ownKeys(entry).some((key) => !allowedFields.has(key))) {
      throw new Error('관측 자료에는 정해진 입력 필드만 사용할 수 있습니다.');
    }
    const externalId = textField(entry.sourceProductId, 'sourceProductId', 13);
    if (!/^\d{13}$/u.test(externalId)) throw new Error('sourceProductId: 13자리 상품 번호가 필요합니다.');
    const productId = `ssg-emart-${externalId}`;
    if (productIds.has(productId)) throw new Error('한 묶음에는 상품별 관측을 하나만 넣어 주세요.');
    productIds.add(productId);
    const name = textField(entry.name, 'name', 120);
    const unit = textField(entry.unitLabel, 'unitLabel', 120);
    const url = sourceUrl(entry.sourceUrl, externalId);
    if (!Number.isInteger(entry.priceKrw) || entry.priceKrw < 1 || entry.priceKrw > 2147483647) {
      throw new Error('priceKrw: 원 단위 양의 정수 가격이 필요합니다.');
    }
    if (entry.priceBasis !== 'displayed_item_total') {
      throw new Error('priceBasis: 카드·쿠폰·적립금이 아닌 상품 전체 표시 가격이 필요합니다.');
    }
    const observed = utcDate(entry.observedAt, 'observedAt');
    const age = current.getTime() - observed.getTime();
    if (age < 0 || age >= MANUAL_REVIEW_WINDOW_MS) {
      throw new Error('observedAt: 미래가 아닌 최근 24시간 이내의 직접 확인 시각이 필요합니다.');
    }
    if (!['unknown', 'available', 'out_of_stock'].includes(entry.availability)) {
      throw new Error('availability: 확인한 판매 상태를 입력해 주세요.');
    }
    if (!['none', 'unknown'].includes(entry.promotionType)) {
      throw new Error('promotionType: 조건부 할인 가격은 이번 입력에서 제외합니다.');
    }
    const notes = textField(entry.notes, 'notes', 1000);
    const loginContext = textField(entry.loginContext, 'loginContext', 240);
    const deliveryContext = textField(entry.deliveryContext, 'deliveryContext', 240);
    const approvalNotes = `직접 확인한 검토용 기록. 로그인: ${loginContext}. 배송지: ${deliveryContext}. ${notes} 내부 재검토 기한은 관측 후 24시간이며 판매자의 행사 종료일이 아닙니다. 사용권·앱 공개 승인은 확인하지 않았습니다.`;
    const product = {
      id: productId, name, unit_label: unit, is_sample: false, is_active: false,
      emoji: '🛒', color: '#EAF0E5', sort_order: 1000,
    };
    const facts = {
      product_id: productId, is_sample: false, source_kind: 'manual_observation',
      source_product_id: externalId, source_url: url, sales_channel: 'ssg_emart_online',
      store_id: null, source_price_krw: entry.priceKrw, play_price_krw: entry.priceKrw,
      play_price_rule: 'exact', observed_at: observed.toISOString(),
      valid_from: null, valid_until: null,
      // 판매처의 유효 기간을 추측하지 않습니다. 재검토를 위한 내부 기한만 별도로 둡니다.
      display_until: new Date(observed.getTime() + MANUAL_REVIEW_WINDOW_MS).toISOString(),
      promotion_type: entry.promotionType, promotion_conditions: null,
      availability: entry.availability, rights_status: 'unknown', publication_state: 'draft',
      approval_notes: approvalNotes,
    };
    products.push(Object.freeze(product));
    observations.push(Object.freeze({ id: observationId({ name, unit_label: unit, ...facts }), ...facts }));
  }
  return Object.freeze({ products: Object.freeze(products), observations: Object.freeze(observations) });
}

/** 검증된 자료만 원자적으로 적재합니다. 같은 ID의 다른 사실을 발견하면 전체 묶음을 취소합니다. */
export function buildManualImportSql(input, options) {
  const prepared = prepareManualObservations(input, options);
  // SQL 문자열에 자료를 직접 붙이지 않습니다. 따옴표와 SQL 조각도 UTF-8 JSON 데이터로만 복원됩니다.
  const payloadHex = Buffer.from(JSON.stringify(prepared), 'utf8').toString('hex');
  return `BEGIN;
SET LOCAL search_path = pg_catalog;
DO $manual_price_import$
DECLARE
  payload jsonb := convert_from(decode('${payloadHex}', 'hex'), 'UTF8')::jsonb;
  item jsonb;
  candidate_product catalog_private.products%ROWTYPE;
  stored_product catalog_private.products%ROWTYPE;
  candidate_observation catalog_private.price_observations%ROWTYPE;
  stored_observation catalog_private.price_observations%ROWTYPE;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(payload->'products') LOOP
    SELECT * INTO candidate_product
      FROM jsonb_populate_record(NULL::catalog_private.products, item);
    INSERT INTO catalog_private.products
      (id, name, unit_label, is_sample, is_active, emoji, color, sort_order)
    VALUES (candidate_product.id, candidate_product.name, candidate_product.unit_label,
      false, false, candidate_product.emoji, candidate_product.color, candidate_product.sort_order)
    ON CONFLICT (id) DO NOTHING;
    SELECT * INTO STRICT stored_product FROM catalog_private.products
      WHERE id = candidate_product.id FOR UPDATE;
    IF ROW(stored_product.name, stored_product.unit_label, stored_product.is_sample)
       IS DISTINCT FROM ROW(candidate_product.name, candidate_product.unit_label, false) THEN
      RAISE EXCEPTION '기존 상품의 이름·규격·예시 구분이 다릅니다. 전체 입력을 취소합니다.'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(payload->'observations') LOOP
    SELECT * INTO candidate_observation
      FROM jsonb_populate_record(NULL::catalog_private.price_observations, item);
    INSERT INTO catalog_private.price_observations (${observationColumns.join(', ')})
    VALUES (${observationColumns.map((column) => `candidate_observation.${column}`).join(', ')})
    ON CONFLICT (id) DO NOTHING;
    SELECT * INTO STRICT stored_observation FROM catalog_private.price_observations
      WHERE id = candidate_observation.id FOR UPDATE;
    IF (to_jsonb(stored_observation) - 'created_at')
       IS DISTINCT FROM (to_jsonb(candidate_observation) - 'created_at') THEN
      RAISE EXCEPTION '기존 관측 사실이 입력과 다릅니다. 전체 입력을 취소합니다.'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$manual_price_import$;
COMMIT;
`;
}
